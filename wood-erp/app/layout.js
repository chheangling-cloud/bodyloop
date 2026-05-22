/**
 * Layout Renderer
 * @module app/layout
 *
 * 职责:
 *   - 渲染 sidebar(根据 routes 自动生成菜单)
 *   - 渲染 topbar(品牌、面包屑、主题/语言切换、用户)
 *   - 清空内容区(view 来填)
 */

const Layout = (function () {
  'use strict';

  let _globalCloseAttached = false;

  // 侧栏菜单结构(逻辑分组,与具体路由解耦)
  // section → group → items
  function buildSidebar() {
    const cur = (typeof Session !== 'undefined' && Session.current) ? Session.current() : null;
    const role = cur?.role || 'sales';
    const isZh = I18n.get() === 'zh-CN';
    // 角色映射:工作台跳自己的 inbox
    const homeRoute = role === 'sales'     ? 'inbox-sales'
                    : role === 'warehouse' ? 'inbox-warehouse'
                    : role === 'finance'   ? 'inbox-finance'
                    : 'dashboard';   // manager → 全局
    return [
      {
        section: 'dashboard',
        label: t('nav.section_dashboard'),
        items: [
          { key: 'dashboard',     label: isZh?'工作台':'Inbox',          route: homeRoute,        icon: iconDashboard() },
          { key: 'customer-list', label: isZh?'客户中心':'Customers',    route: 'customer-list',  icon: iconUsers() },
        ],
      },
      {
        section: 'sales',
        label: t('nav.section_sales'),
        items: [
          { key: 'inbox-sales',  label: isZh?'销售工作台':'Sales Inbox', route: 'inbox-sales', highlight: true },
          { key: 'order-center', label: t('nav.orderCenter'),  route: 'order-center' },
          { key: 'sales-board',  label: t('nav.salesBoard') || (I18n.get()==='zh-CN'?'销售看板':'Sales Board'), route: 'sales-board' },
        ],
        groupIcon: iconSales(),
        groupLabel: t('nav.sales'),
        groupRoute: 'inbox-sales',  // 点击一级菜单跳转到该模块工作台
      },
      {
        section: 'warehouse',
        label: t('nav.section_warehouse') || (I18n.get()==='zh-CN' ? '仓储模块' : 'Warehouse'),
        items: [
          { key: 'inbox-warehouse', label: isZh?'工作台':'Inbox',         route: 'inbox-warehouse', highlight: true },
          { key: 'inventory',       label: isZh?'库存':'Inventory',       route: 'inventory-list' },
          { key: 'inbound',         label: isZh?'入库':'Inbound',         route: 'inbound-list' },
          { key: 'outbound',        label: isZh?'出库/发货':'Outbound',   route: 'outbound-list' },
          { key: 'movements',       label: isZh?'库存流水':'Movements',   route: 'movement-list' },
          { key: 'stocktaking',     label: isZh?'盘点':'Stock-take',      route: 'stock-taking-list' },
          { key: 'logistics',       label: isZh?'物流管理':'Logistics',   route: 'logistics-list' },
        ],
        groupIcon: iconBox(),
        groupLabel: t('nav.warehouse'),
        groupRoute: 'inbox-warehouse',
      },
      {
        section: 'finance',
        label: t('nav.section_finance') || (I18n.get()==='zh-CN' ? '财务模块' : 'Finance'),
        items: [
          { key: 'inbox-finance', label: isZh?'财务工作台':'Finance Inbox', route: 'inbox-finance', highlight: true },
          { key: 'financeCenter', label: t('nav.financeCenter') || (I18n.get()==='zh-CN'?'财务中心':'Finance Center'), route: 'finance-center' },
          { key: 'productList',   label: t('nav.products') || (I18n.get()==='zh-CN'?'产品管理':'Products'), route: 'product-list' },
          { key: 'settlements',   label: t('nav.settlements'),    route: 'settlement-list' },
          { key: 'debt-board',    label: t('nav.riskBoard'),      route: 'debt-board' },
        ],
        groupIcon: iconYuan(),
        groupLabel: t('nav.finance'),
        groupRoute: 'inbox-finance',
      },
      {
        section: 'others',
        label: t('nav.section_others') || (I18n.get()==='zh-CN' ? '其他模块' : 'Others'),
        items: [
          { key: 'admin-users', label: I18n.get()==='zh-CN' ? '用户与权限' : 'Users & Permissions', route: 'admin-users', icon: iconUsers() },
          { key: 'production',  label: t('nav.production'), disabled: true, icon: iconFactory() },
          { key: 'sop',         label: t('nav.sop'),        disabled: true, icon: iconBook() },
        ],
      },
    ];
  }

  // ========== 主入口 ==========

  function render(routeKey) {
    renderShell();
    renderSidebar(routeKey);
    renderTopbar(routeKey);
    document.getElementById('app-content').innerHTML = '';
  }

  /** 渲染外壳(sidebar + topbar + main 容器),仅首次需要 */
  function renderShell() {
    if (document.getElementById('app-layout-root')) return;
    document.body.innerHTML = `
      <div class="app-layout" id="app-layout-root">
        <aside class="app-sidebar" id="app-sidebar"></aside>
        <header class="app-topbar" id="app-topbar"></header>
        <main class="app-main" id="app-content"></main>
      </div>
    `;
  }

  // ========== 侧栏 ==========

  function renderSidebar(routeKey) {
    const sb = buildSidebar();
    const def = ROUTES[routeKey];
    const activeSection = def?.sidebar?.section;
    const activeKey = def?.sidebar?.key;

    const html = `
      <div class="sidebar-brand">
        <span class="logo-mark">森</span>
        <div class="brand-text">
          <div class="brand-cn">${t('brand.companyCn')}</div>
          <div class="brand-en">${t('brand.companyEn')}</div>
        </div>
      </div>
      <div class="sidebar-nav">
        ${sb.map(section => renderSection(section, activeSection, activeKey)).join('')}
      </div>
    `;
    document.getElementById('app-sidebar').innerHTML = html;
    _bindSidebar();
  }

  function renderSection(section, activeSection, activeKey) {
    // 全局显示所有 section,无权时整组灰显(不点击)
    const sectionForbidden = (typeof Perm !== 'undefined' && !Perm.canSeeSection(section.section));

    // 一级菜单不显示徽章 — 徽章只挂在子项的"工作台"(inbox-xxx)上,避免重复
    let badge = '';

    // 分两种:有 groupLabel(销售/仓储 — 父菜单可点)和没有(主控/其他)
    if (section.groupLabel) {
      const isSectionActive = section.section === activeSection;
      const groupHref = section.groupRoute ? Router.href(section.groupRoute) : '#';
      const isZh = I18n.get() === 'zh-CN';
      const noPermTitle = isZh ? '无权限访问该模块' : 'No permission to access';
      return `
        <div class="sidebar-section">${section.label}</div>
        <a class="sidebar-item ${isSectionActive ? 'active' : ''} ${sectionForbidden ? 'no-perm' : ''}"
           href="${sectionForbidden ? '#' : groupHref}"
           ${sectionForbidden ? `title="${noPermTitle}" onclick="event.preventDefault();"` : ''}>
          <span class="item-icon">${section.groupIcon || ''}</span>
          <span>${section.groupLabel}</span>
          ${badge}
        </a>
        ${section.items.map(it => renderSubItem(it, activeKey, isSectionActive, sectionForbidden)).join('')}
      `;
    }
    return `
      <div class="sidebar-section">${section.label}</div>
      ${section.items.map(it => renderTopItem(it, activeKey, section.section === activeSection, sectionForbidden)).join('')}
    `;
  }

  function renderTopItem(item, activeKey, isSectionActive, sectionForbidden) {
    const isActive = isSectionActive && item.key === activeKey;
    // RBAC: section 整组无权 or 该路由无权 → 灰显
    const itemForbidden = sectionForbidden ||
      (typeof Perm !== 'undefined' && item.route && !Perm.canAccessRoute(item.route));
    if (item.disabled) {
      return `
        <a class="sidebar-item disabled" style="opacity:.5;cursor:not-allowed;pointer-events:none;">
          <span class="item-icon">${item.icon || ''}</span>
          <span>${item.label}</span>
          <span class="text-muted" style="font-size:10px;margin-left:auto">${t('nav.notEnabled')}</span>
        </a>
      `;
    }
    if (itemForbidden) {
      const isZh = I18n.get() === 'zh-CN';
      const noPermTitle = isZh ? '无权限访问' : 'No permission';
      return `
        <a class="sidebar-item no-perm" href="#" title="${noPermTitle}" onclick="event.preventDefault();">
          <span class="item-icon">${item.icon || ''}</span>
          <span>${item.label}</span>
        </a>
      `;
    }
    return `
      <a class="sidebar-item ${isActive ? 'active' : ''}" href="${Router.href(item.route)}">
        <span class="item-icon">${item.icon || ''}</span>
        <span>${item.label}</span>
      </a>
    `;
  }

  function renderSubItem(item, activeKey, sectionActive, sectionForbidden) {
    if (item.isGroup) {
      const childActive = (item.children || []).some(c => c.key === activeKey && sectionActive);
      return `
        <div class="sidebar-group" data-group="${item.key}">
          <div class="sidebar-subitem sidebar-group-toggle ${childActive ? 'expanded' : ''}" data-toggle-group="${item.key}">
            <span style="color: var(--text-3); font-size: 11px;">${item.label}</span>
            <span class="group-arrow" style="margin-left:auto; font-size: 10px;">${childActive ? '▾' : '▸'}</span>
          </div>
          <div class="sidebar-group-children" data-group-children="${item.key}" style="display:${childActive ? 'block' : 'none'};">
            ${(item.children || []).map(c => {
              const isZh = I18n.get() === 'zh-CN';
              // 优先看路由白名单(route 显式允许 → 即使 section 灰显也亮)
              const routeAllowed = typeof Perm !== 'undefined' && c.route && Perm.canAccessRoute(c.route);
              const cForbidden = !routeAllowed;
              const noPermTitle = isZh ? '无权限访问' : 'No permission';
              if (cForbidden) {
                return `<a class="sidebar-subitem sidebar-subsubitem no-perm" href="#" title="${noPermTitle}" onclick="event.preventDefault();">${c.label}</a>`;
              }
              return `<a class="sidebar-subitem sidebar-subsubitem ${c.key === activeKey && sectionActive ? 'active' : ''}" href="${Router.href(c.route)}">${c.label}</a>`;
            }).join('')}
          </div>
        </div>
      `;
    }
    const isActive = item.key === activeKey && sectionActive;
    // 优先看路由白名单(route 显式允许 → 即使 section 灰显也亮)
    const routeAllowed = typeof Perm !== 'undefined' && item.route && Perm.canAccessRoute(item.route);
    const itemForbidden = !routeAllowed;
    const isZh = I18n.get() === 'zh-CN';
    const noPermTitle = isZh ? '无权限访问' : 'No permission';
    // 工作台/inbox 项显示徽章
    let badge = '';
    if (!itemForbidden && typeof RoleTaskCount !== 'undefined') {
      const role = item.route === 'inbox-sales'     ? 'sales'
                 : item.route === 'inbox-warehouse' ? 'warehouse'
                 : item.route === 'inbox-finance'   ? 'finance'
                 : null;
      if (role) {
        const n = RoleTaskCount.getCount(role);
        if (n > 0) badge = `<span class="sidebar-badge">${n > 99 ? '99+' : n}</span>`;
      }
    }
    if (itemForbidden) {
      return `<a class="sidebar-subitem no-perm" href="#" title="${noPermTitle}" onclick="event.preventDefault();">${item.label}</a>`;
    }
    return `
      <a class="sidebar-subitem ${isActive ? 'active' : ''}" href="${Router.href(item.route)}">
        ${item.label}${badge}
      </a>
    `;
  }

  function _bindSidebar() {
    document.querySelectorAll('[data-toggle-group]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const k = el.dataset.toggleGroup;
        const c = document.querySelector(`[data-group-children="${k}"]`);
        const a = el.querySelector('.group-arrow');
        if (!c) return;
        const open = c.style.display !== 'none';
        c.style.display = open ? 'none' : 'block';
        el.classList.toggle('expanded', !open);
        if (a) a.textContent = open ? '▸' : '▾';
      });
    });
  }

  // ========== 顶栏 ==========

  function renderTopbar(routeKey) {
    const ctx = Router.current();
    const breadcrumbsHtml = renderBreadcrumbs(routeKey, ctx);
    const isZh = I18n.get() === 'zh-CN';
    const user = (typeof Session !== 'undefined') ? Session.current() : { name: '王志强', role: 'sales' };
    const avatarLetter = (user.name || '?').charAt(0);
    const unreadCount = (typeof NotificationService !== 'undefined') ? NotificationService.unreadCount() : 0;

    document.getElementById('app-topbar').innerHTML = `
      <div class="topbar-breadcrumb">${breadcrumbsHtml}</div>
      <div class="topbar-spacer"></div>
      <div class="topbar-actions">
        <div class="topbar-bell" data-action="toggle-bell" style="position:relative; cursor:pointer; padding:6px 10px; border-radius:4px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          ${unreadCount > 0 ? `<span class="bell-badge" style="position:absolute; top:2px; right:2px; background:var(--red); color:#fff; border-radius:9px; font-size:10px; padding:1px 5px; line-height:1.3; min-width:16px; text-align:center;">${unreadCount}</span>` : ''}
        </div>
        <div id="bell-dropdown" style="display:none;"></div>
        <button class="btn btn-ghost btn-sm" data-action="toggle-lang">
          ${isZh ? 'EN' : '中文'}
        </button>
        <button class="btn btn-ghost btn-sm" data-action="reset-data">
          ${isZh ? '重置数据' : 'Reset Data'}
        </button>
        <div class="topbar-user" data-action="toggle-user-switcher" style="cursor:pointer;">
          <div class="avatar">${avatarLetter}</div>
          <div style="font-size:12px">
            <div class="text-strong">${user.name}</div>
            <div class="text-muted" style="font-size:10px">${typeof Roles !== 'undefined' ? Roles.label(user.role) : user.role}</div>
          </div>
        </div>
        <div id="user-dropdown" style="display:none;"></div>
      </div>
    `;
    _bindTopbar();
  }

  function renderBreadcrumbs(routeKey, ctx) {
    const def = ROUTES[routeKey];
    if (!def) return '';

    const segments = (def.breadcrumbs || []).map((crumb, idx, arr) => {
      const isLast = idx === arr.length - 1;
      if (crumb === 'self') {
        const title = def.title ? def.title() : routeKey;
        return `<span class="crumb-current">${title}</span>`;
      }
      // 是分组 key
      if (BREADCRUMB_GROUPS[crumb]) {
        const g = BREADCRUMB_GROUPS[crumb];
        return `<a class="crumb-link" href="${Router.href(g.goTo)}">${g.label()}</a>`;
      }
      // 是其他路由 key
      if (ROUTES[crumb]) {
        const r = ROUTES[crumb];
        return `<a class="crumb-link" href="${Router.href(crumb)}">${r.title()}</a>`;
      }
      return `<span>${crumb}</span>`;
    });

    return segments.join('<span class="crumb-sep">›</span>');
  }

  function _bindTopbar() {
    document.querySelectorAll('[data-action]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const action = el.dataset.action;
        if (action === 'toggle-lang') {
          const cur = I18n.get();
          I18n.set(cur === 'zh-CN' ? 'en-US' : 'zh-CN');
          location.reload();
        } else if (action === 'reset-data') {
          if (confirm(I18n.get()==='zh-CN' ? '确定重置所有数据?' : 'Reset all data?')) {
            DB.reset();
            Seed.buildAndSeed();
            location.reload();
          }
        } else if (action === 'toggle-bell') {
          _toggleBellDropdown();
        } else if (action === 'toggle-user-switcher') {
          _toggleUserSwitcher();
        }
      });
    });

    // 点空白关闭 dropdown
    if (!_globalCloseAttached) {
      document.addEventListener('click', (e) => {
        if (!e.target.closest('#bell-dropdown') && !e.target.closest('.topbar-bell')) {
          const dd = document.getElementById('bell-dropdown');
          if (dd) dd.style.display = 'none';
        }
        if (!e.target.closest('#user-dropdown') && !e.target.closest('.topbar-user')) {
          const dd = document.getElementById('user-dropdown');
          if (dd) dd.style.display = 'none';
        }
      });
      _globalCloseAttached = true;
    }
  }

  function _toggleBellDropdown() {
    const dd = document.getElementById('bell-dropdown');
    if (!dd) return;
    if (dd.style.display === 'block') { dd.style.display = 'none'; return; }
    _renderBellDropdown();
    dd.style.display = 'block';
  }

  function _renderBellDropdown() {
    const dd = document.getElementById('bell-dropdown');
    if (!dd) return;
    const isZh = I18n.get() === 'zh-CN';
    const notifs = NotificationService.listForCurrent({ limit: 20 });
    const unreadCount = notifs.filter(n => n.status === 'unread').length;

    dd.style.cssText = `
      position: fixed;
      top: 56px;
      right: 280px;
      width: 360px;
      background: var(--bg-2);
      border: 1px solid var(--border-1);
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.32);
      z-index: 1000;
      max-height: 480px;
      overflow: hidden;
      display: block;
    `;

    const iconMap = {
      approval_needed: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><polyline points="3,8 7,12 13,4"/></svg>', overdue_warning: '⏰', stock_low: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M2 5 L8 2 L14 5 L8 8 Z"/><path d="M2 5 V11 L8 14 V8"/><path d="M14 5 V11 L8 14"/></svg>',
      payment_received: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><rect x="1.5" y="3" width="13" height="10" rx="1.5"/><circle cx="8" cy="8" r="2.25"/></svg>', credit_warning: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M8 1.5 L14.5 13.5 H1.5 Z"/><line x1="8" y1="6.5" x2="8" y2="9.5"/><line x1="8" y1="11.5" x2="8" y2="11.6"/></svg>', stock_shortage: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M2 5 L8 2 L14 5 L8 8 Z"/><path d="M2 5 V11 L8 14 V8"/><path d="M14 5 V11 L8 14"/></svg>', generic: '•',
    };
    const colorMap = {
      approval_needed: 'var(--amber)', overdue_warning: 'var(--red)',
      stock_low: 'var(--amber)', payment_received: 'var(--emerald)',
      credit_warning: 'var(--amber)', stock_shortage: 'var(--red)', generic: 'var(--blue)',
    };

    dd.innerHTML = `
      <div style="padding: 12px 14px; border-bottom: 1px solid var(--border-1); display:flex; justify-content:space-between; align-items:center;">
        <div class="text-strong">${isZh?'通知':'Notifications'} ${unreadCount > 0 ? `<span style="color:var(--red); font-size:11px; margin-left:4px;">${unreadCount} ${isZh?'未读':'unread'}</span>` : ''}</div>
        ${unreadCount > 0 ? `<button class="btn btn-sm btn-ghost" data-action="mark-all-read" style="font-size:11px;">${isZh?'全部已读':'Mark all read'}</button>` : ''}
      </div>
      <div style="max-height: 400px; overflow-y: auto;">
        ${notifs.length === 0 ? `
          <div style="padding: 40px; text-align: center; color: var(--text-3);">
            <div style="font-size: 28px; opacity: 0.3; margin-bottom: 8px;">🔔</div>
            <div style="font-size: 12px;">${isZh?'暂无通知':'No notifications'}</div>
          </div>
        ` : notifs.map(n => `
          <div class="bell-item" data-notif-id="${n.id}"
            style="padding: 10px 14px; border-bottom: 1px solid var(--border-1); cursor:pointer; ${n.status==='unread'?'background:rgba(96,165,250,0.04);':''}">
            <div style="display:flex; gap:10px;">
              <div style="font-size:16px; color:${colorMap[n.type]||'var(--text-2)'}; flex-shrink:0;">${iconMap[n.type]||'•'}</div>
              <div style="flex:1; min-width:0;">
                <div style="font-size:13px; font-weight:${n.status==='unread'?'600':'400'};">${n.title}</div>
                ${n.description ? `<div class="text-muted" style="font-size:11px; margin-top:2px;">${n.description}</div>` : ''}
                <div class="text-muted" style="font-size:10px; margin-top:4px;">${_timeAgo(n.createdAt)}</div>
              </div>
              ${n.status === 'unread' ? `<div style="width:8px; height:8px; border-radius:50%; background:var(--blue); flex-shrink:0; margin-top:4px;"></div>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `;

    dd.querySelectorAll('[data-notif-id]').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.dataset.notifId;
        const n = NotificationRepo.find(id);
        if (!n) return;
        NotificationService.markRead(id);
        // 跳转到关联实体
        if (n.entityType === 'salesOrder') Router.go('order-detail', { id: n.entityId });
        else if (n.entityType === 'settlement') Router.go('settlement-detail', { id: n.entityId });
        else if (n.entityType === 'inventory') Router.go('inventory-list');
        dd.style.display = 'none';
        renderTopbar(Router.current().route);
      });
    });

    const markAllBtn = dd.querySelector('[data-action="mark-all-read"]');
    if (markAllBtn) {
      markAllBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        NotificationService.markAllRead();
        renderTopbar(Router.current().route);
        _renderBellDropdown();
      });
    }
  }

  function _toggleUserSwitcher() {
    const dd = document.getElementById('user-dropdown');
    if (!dd) return;
    if (dd.style.display === 'block') { dd.style.display = 'none'; return; }
    const isZh = I18n.get() === 'zh-CN';
    const employees = EmployeeRepo.list();
    const cur = Session.current();

    dd.style.cssText = `
      position: fixed;
      top: 56px;
      right: 16px;
      width: 300px;
      background: var(--bg-2);
      border: 1px solid var(--border-1);
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.32);
      z-index: 1000;
      max-height: calc(100vh - 80px);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    `;
    // 按角色分组
    const byRole = {};
    employees.forEach(e => { (byRole[e.role] = byRole[e.role] || []).push(e); });

    // 按 L1→L9 顺序显示所有层级
    const order = [
      'sales', 'sales_manager',
      'warehouse', 'warehouse_manager',
      'finance', 'finance_manager',
      'general_manager', 'ceo', 'super_admin',
      'manager',  // 历史兼容
    ];
    const roleLabels = isZh ? {
      sales:             '销售',
      sales_manager:     '销售经理',
      warehouse:         '仓管',
      warehouse_manager: '仓管经理',
      finance:           '财务',
      finance_manager:   '财务经理',
      general_manager:   '总经理',
      ceo:               'CEO',
      super_admin:       '超级管理员',
      manager:           '经理(旧)',
    } : {
      sales:             'Sales',
      sales_manager:     'Sales Manager',
      warehouse:         'Warehouse',
      warehouse_manager: 'Warehouse Mgr',
      finance:           'Finance',
      finance_manager:   'Finance Manager',
      general_manager:   'General Manager',
      ceo:               'CEO',
      super_admin:       'Super Admin',
      manager:           'Manager (legacy)',
    };

    // 动态计算摘要
    const summary = order
      .filter(r => byRole[r]?.length)
      .map(r => `${byRole[r].length} ${(roleLabels[r] || r).slice(0, 4)}`)
      .join(' / ');

    dd.innerHTML = `
      <style>
        #user-dropdown-list::-webkit-scrollbar { width: 6px; }
        #user-dropdown-list::-webkit-scrollbar-track { background: rgba(255,255,255,0.04); }
        #user-dropdown-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.20); border-radius: 3px; }
        #user-dropdown-list::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.35); }
        #user-dropdown-list { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.2) rgba(255,255,255,0.04); }
        .user-switch-item:hover { background: rgba(96,165,250,0.10) !important; }
      </style>
      <div style="padding: 10px 14px; border-bottom: 1px solid var(--border-1); flex-shrink:0;">
        <div class="text-strong" style="font-size:12px;">${isZh?'切换身份(模拟登录)':'Switch Identity (Mock Login)'}</div>
        <div class="text-muted" style="font-size:10px; margin-top:2px;">${isZh?'共 ' + employees.length + ' 个账号 · ' + summary : employees.length + ' accounts · ' + summary}</div>
      </div>
      <div id="user-dropdown-list" style="flex:1; overflow-y:auto; min-height:0; max-height:420px;">
        ${order.filter(r => byRole[r]?.length).map(role => `
          <div style="padding:4px 14px 3px; background:rgba(255,255,255,0.025); font-size:10px; color:var(--text-3); text-transform:uppercase; letter-spacing:0.5px; border-bottom:1px solid var(--border-1); position:sticky; top:0; z-index:1;">
            ${roleLabels[role] || role} (${byRole[role].length})
          </div>
          ${byRole[role].map(e => `
            <div class="user-switch-item" data-emp-id="${e.id}"
              style="padding: 7px 14px; cursor: pointer; ${cur.id === e.id ? 'background: rgba(96,165,250,0.12);' : ''}">
              <div style="display:flex; align-items:center; gap:10px;">
                <div class="avatar" style="width:26px; height:26px; font-size:11px;">${(e.name||'?').charAt(0)}</div>
                <div style="flex:1; min-width:0;">
                  <div class="text-strong" style="font-size:12px;">${e.name}</div>
                  <div class="text-muted" style="font-size:10px;">${Roles.label(e.role)}${e.department ? ' · ' + e.department : ''}</div>
                </div>
                ${cur.id === e.id ? `<span class="text-emerald" style="font-size:11px;"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><polyline points="3,8 7,12 13,4"/></svg></span>` : ''}
              </div>
            </div>
          `).join('')}
        `).join('')}
      </div>
    `;
    dd.querySelectorAll('[data-emp-id]').forEach(item => {
      item.addEventListener('click', () => {
        Session.switchTo(item.dataset.empId);
        location.reload();  // 重新渲染所有
      });
    });
  }

  function _timeAgo(ts) {
    const isZh = I18n.get() === 'zh-CN';
    const diff = Date.now() - new Date(ts).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return isZh?'刚刚':'just now';
    if (min < 60) return isZh?`${min} 分钟前`:`${min}m ago`;
    const h = Math.floor(min / 60);
    if (h < 24) return isZh?`${h} 小时前`:`${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 30) return isZh?`${d} 天前`:`${d}d ago`;
    return new Date(ts).toLocaleDateString();
  }

  // ========== 设置页标题 ==========

  function setPageTitle(title) {
    document.title = `${title} · ${t('brand.companyCn')}`;
  }

  // ========== 图标 ==========

  function iconDashboard() {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>`;
  }
  function iconInbox() {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>`;
  }
  function iconSales() {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>`;
  }
  function iconBox() {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`;
  }
  function iconFactory() {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/></svg>`;
  }
  function iconTruck() {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 18H3c-.6 0-1-.4-1-1V7c0-.6.4-1 1-1h10c.6 0 1 .4 1 1v11"/><path d="M14 9h4l4 4v4c0 .6-.4 1-1 1h-2"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>`;
  }
  function iconYuan() {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m7 8 5 7 5-7"/><path d="M8 12h8"/><path d="M8 16h8"/></svg>`;
  }
  function iconBook() {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>`;
  }
  function iconUsers() {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
  }

  return { render, renderShell, setPageTitle };
})();

window.Layout = Layout;
