/**
 * Hash Router
 * @module app/router
 *
 * URL 格式:
 *   #/                            → dashboard
 *   #/orders                      → order-center
 *   #/orders/so_xxx               → order-detail with id=so_xxx
 *   #/orders/so_xxx?tab=timeline  → order-detail with id=so_xxx, query.tab=timeline
 *
 * API:
 *   Router.start()                启动(监听 hashchange)
 *   Router.go(key, params, query) 跳转
 *   Router.replace(key, params, query)
 *   Router.current()              当前 { route, params, query }
 *   Router.onChange(fn)           监听变化
 *   Router.back()                 浏览器后退
 */

const Router = (function () {
  'use strict';

  let _currentContext = null;
  const _listeners = [];

  function start() {
    window.addEventListener('hashchange', _handleHashChange);
    _handleHashChange();
  }

  function _handleHashChange() {
    const raw = location.hash.slice(1) || '/';
    const [path, queryStr] = raw.split('?');

    // ====== 根路径 → 跳角色 home(不是全局 dashboard) ======
    if ((path === '/' || path === '') && typeof Perm !== 'undefined') {
      const home = Perm.homeRoute();
      if (home && home !== 'dashboard') {
        replace(home);
        return;
      }
    }

    // 找匹配
    const match = _matchRoute(path);
    if (!match) {
      _renderNotFound(path);
      _currentContext = { route: null, params: {}, query: {} };
      _listeners.forEach(l => { try { l(_currentContext); } catch(e) { console.error(e); } });
      return;
    }

    // ====== RBAC: 路由前置检查 ======
    if (typeof Perm !== 'undefined' && !Perm.canAccessRoute(match.key)) {
      const home = Perm.homeRoute();
      // 防止 home 也无权访问导致死循环
      if (match.key !== home) {
        console.warn(`[RBAC] 角色无权访问 ${match.key},跳转工作台 ${home}`);
        const isZh = I18n.get() === 'zh-CN';
        if (typeof Toast !== 'undefined') {
          Toast.warning(isZh ? '当前角色无权访问该页面' : 'No permission to access this page');
        }
        replace(home);
        return;
      }
    }

    _currentContext = {
      route: match.key,
      params: match.params,
      query: _parseQuery(queryStr),
    };

    _renderView(match.key);
    _listeners.forEach(l => { try { l(_currentContext); } catch(e) { console.error(e); } });
  }

  function _matchRoute(path) {
    if (!path.startsWith('/')) path = '/' + path;
    for (const [key, def] of Object.entries(ROUTES)) {
      if (!def.path) continue;  // 别名路由(redirectTo)没 path,跳过
      const params = _matchPath(def.path, path);
      if (params) {
        // 合并路由定义中的 params(用于角色参数化路由)
        if (def.params) Object.assign(params, def.params);
        return { key, params };
      }
    }
    return null;
  }

  function _matchPath(pattern, actual) {
    const pSeg = pattern.split('/').filter(Boolean);
    const aSeg = actual.split('/').filter(Boolean);
    if (pSeg.length !== aSeg.length) return null;
    const params = {};
    for (let i = 0; i < pSeg.length; i++) {
      if (pSeg[i].startsWith(':')) {
        params[pSeg[i].slice(1)] = decodeURIComponent(aSeg[i]);
      } else if (pSeg[i] !== aSeg[i]) {
        return null;
      }
    }
    return params;
  }

  function _parseQuery(qs) {
    if (!qs) return {};
    const result = {};
    qs.split('&').forEach(pair => {
      if (!pair) return;
      const [k, v] = pair.split('=');
      result[decodeURIComponent(k)] = v === undefined ? '' : decodeURIComponent(v);
    });
    return result;
  }

  function _buildQuery(query) {
    const pairs = [];
    Object.entries(query || {}).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return;
      pairs.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
    });
    return pairs.join('&');
  }

  function _renderView(routeKey) {
    Layout.render(routeKey);

    const viewKey = ROUTES[routeKey].view;
    // 把连字符转下划线:order-detail → View_order_detail
    const viewName = 'View_' + viewKey.replace(/-/g, '_');
    const view = window[viewName];
    if (!view || typeof view.init !== 'function') {
      _renderViewMissing(viewKey);
      return;
    }
    try {
      view.init(_currentContext);
    } catch (e) {
      console.error(`View init error for ${viewKey}:`, e);
      _renderError(e);
    }
  }

  function _renderNotFound(path) {
    Layout.renderShell();
    const isZh = I18n.get() === 'zh-CN';
    document.getElementById('app-content').innerHTML = `
      <div style="padding: 80px 40px; text-align: center;">
        <div style="font-size: 56px; color: var(--text-4); margin-bottom: 16px;">404</div>
        <div style="font-size: 16px; color: var(--text-2); margin-bottom: 8px;">
          ${isZh ? '页面不存在' : 'Page Not Found'}
        </div>
        <div style="font-size: 12px; color: var(--text-3); margin-bottom: 24px;">
          ${isZh ? '路径' : 'Path'}: <code style="font-family: var(--font-mono);">${path}</code>
        </div>
        <a href="#/" class="btn btn-primary">
          ${isZh ? '返回工作台' : 'Back to Dashboard'}
        </a>
      </div>
    `;
  }

  function _renderViewMissing(viewKey) {
    const isZh = I18n.get() === 'zh-CN';
    document.getElementById('app-content').innerHTML = `
      <div style="padding: 80px 40px; text-align: center;">
        <div style="font-size: 36px; color: var(--text-4); margin-bottom: 16px;"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M8 1.5 L14.5 13.5 H1.5 Z"/><line x1="8" y1="6.5" x2="8" y2="9.5"/><line x1="8" y1="11.5" x2="8" y2="11.6"/></svg></div>
        <div style="font-size: 14px; color: var(--text-2);">
          ${isZh ? 'View 未注册' : 'View not registered'}: <code style="font-family: var(--font-mono);">${viewKey}</code>
        </div>
      </div>
    `;
  }

  function _renderError(err) {
    const isZh = I18n.get() === 'zh-CN';
    document.getElementById('app-content').innerHTML = `
      <div style="padding: 60px 40px;">
        <div style="font-size: 14px; color: var(--red); margin-bottom: 12px;">
          ${isZh ? '页面渲染出错' : 'Render Error'}
        </div>
        <pre style="font-size: 11px; color: var(--text-3); background: var(--bg-2); padding: 12px; border-radius: 4px; overflow: auto;">${err.message}\n${err.stack || ''}</pre>
      </div>
    `;
  }

  // ========== Public API ==========

  function go(key, params, query) {
    const def = ROUTES[key];
    if (!def) {
      console.error('Unknown route:', key);
      return;
    }
    // 重定向支持(用于路由别名/兼容)
    if (def.redirectTo) {
      return go(def.redirectTo, params, query);
    }
    let path = def.path;
    Object.entries(params || {}).forEach(([k, v]) => {
      path = path.replace(':' + k, encodeURIComponent(v));
    });
    const queryStr = _buildQuery(query);
    location.hash = '#' + path + (queryStr ? '?' + queryStr : '');
  }

  function replace(key, params, query) {
    const def = ROUTES[key];
    if (!def) {
      console.error('Unknown route:', key);
      return;
    }
    let path = def.path;
    Object.entries(params || {}).forEach(([k, v]) => {
      path = path.replace(':' + k, encodeURIComponent(v));
    });
    const queryStr = _buildQuery(query);
    history.replaceState(null, '', '#' + path + (queryStr ? '?' + queryStr : ''));
    _handleHashChange();
  }

  function current() {
    return _currentContext;
  }

  function onChange(fn) {
    _listeners.push(fn);
    return () => {
      const idx = _listeners.indexOf(fn);
      if (idx >= 0) _listeners.splice(idx, 1);
    };
  }

  function back() {
    history.back();
  }

  /** 构造 href(给 <a> 标签用,不会触发跳转) */
  function href(key, params, query) {
    const def = ROUTES[key];
    if (!def) return '#/';
    if (def.redirectTo) return href(def.redirectTo, params, query);
    let path = def.path;
    Object.entries(params || {}).forEach(([k, v]) => {
      path = path.replace(':' + k, encodeURIComponent(v));
    });
    const queryStr = _buildQuery(query);
    return '#' + path + (queryStr ? '?' + queryStr : '');
  }

  return { start, go, replace, current, onChange, back, href };
})();

window.Router = Router;
