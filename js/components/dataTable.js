/**
 * 通用表格组件
 * @module components/dataTable
 *
 * 功能:
 * - 数据驱动(传入 columns + data)
 * - 内置搜索(指定 searchFields)
 * - 内置筛选(下拉选项)
 * - 列排序
 * - 分页
 * - 行点击事件
 *
 * 用法:
 *   const table = DataTable.create({
 *     mount: '#table-mount',
 *     columns: [
 *       { key: 'code', label: '编号', sortable: true },
 *       { key: 'name', label: '名称' },
 *       { key: 'status', label: '状态',
 *         render: (row) => Badge.render('customer','statusEnum',row.status) },
 *     ],
 *     data: customers,
 *     searchFields: ['code','name','contact'],
 *     searchPlaceholder: '搜索客户...',
 *     filters: [
 *       { key: 'riskLevel', label: '风险等级',
 *         options: [
 *           {value:'',label:'全部'},
 *           {value:'normal',label:'正常'},
 *           {value:'locked',label:'锁定'},
 *         ]}
 *     ],
 *     onRowClick: (row) => { ... },
 *     pageSize: 20,
 *   });
 */

const DataTable = (function () {
  'use strict';

  function create(config) {
    const mountEl = typeof config.mount === 'string' ? document.querySelector(config.mount) : config.mount;
    if (!mountEl) throw new Error('DataTable: mount 元素不存在');

    const state = {
      data: config.data || [],
      filtered: [],
      page: 1,
      pageSize: config.pageSize || 20,
      keyword: '',
      filterValues: {}, // { filterKey: value }
      sortKey: config.defaultSortKey || null,
      sortOrder: config.defaultSortOrder || 'desc',
    };

    // 初始化筛选值
    (config.filters || []).forEach(f => { state.filterValues[f.key] = ''; });

    // ---- 渲染 ----

    function render() {
      mountEl.innerHTML = `
        ${renderToolbar()}
        <div class="card" style="overflow:hidden">
          <div style="overflow:auto; max-height: calc(100vh - 280px);">
            ${renderTable()}
          </div>
          ${renderPagination()}
        </div>
      `;
      bindEvents();
    }

    function renderToolbar() {
      const filtersHtml = (config.filters || []).map(f => `
        <select class="select" data-filter-key="${f.key}">
          ${f.options.map(o => `
            <option value="${o.value}" ${state.filterValues[f.key] === o.value ? 'selected' : ''}>
              ${o.label}
            </option>
          `).join('')}
        </select>
      `).join('');

      const actionsHtml = (config.actions || []).map(a => {
        const rawBtn = `<button class="btn ${a.primary ? 'btn-primary' : 'btn-secondary'}" data-action="${a.key}">${a.icon || ''} ${a.label}</button>`;
        // RBAC: 如果 action 上声明了 requireAction,经过 Perm.button 包装(无权限自动灰显 + tooltip)
        return (a.requireAction && typeof Perm !== 'undefined')
          ? Perm.button(rawBtn, a.requireAction)
          : rawBtn;
      }).join('');

      return `
        <div class="toolbar">
          ${(config.searchFields || config.customSearch) ? `
            <input class="input input-search" placeholder="${config.searchPlaceholder || (window.t ? t('common.search') + '...' : 'Search...')}"
                   data-table-search style="width: 240px;" value="${state.keyword || ''}">
          ` : ''}
          ${filtersHtml}
          <span class="text-muted" style="font-size:11px;">
            ${window.t ? t('common.totalRows', `<span data-table-total class="font-mono text-strong">${state.filtered.length}</span>`) : `Total <span data-table-total class="font-mono text-strong">${state.filtered.length}</span>`}
          </span>
          <span class="spacer"></span>
          ${actionsHtml}
        </div>
      `;
    }

    function renderTable() {
      const cols = config.columns;
      const pageRows = getPageRows();

      if (pageRows.length === 0) {
        return `<div class="empty-state">${window.t ? t('common.noData') : 'No data'}</div>`;
      }

      const headHtml = cols.map(col => {
        const sortable = col.sortable !== false && col.key;
        const isActive = state.sortKey === col.key;
        const sortIcon = isActive ? (state.sortOrder === 'asc' ? '▲' : '▼') : '⇅';
        return `
          <th class="${sortable ? 'sortable' : ''} ${isActive ? 'sort-active' : ''}"
              ${sortable ? `data-sort-key="${col.key}"` : ''}
              ${col.width ? `style="width:${col.width};"` : ''}>
            ${col.label}
            ${sortable ? `<span class="sort-icon">${sortIcon}</span>` : ''}
          </th>
        `;
      }).join('');

      const bodyHtml = pageRows.map(row => {
        const cells = cols.map(col => {
          const value = col.render
            ? col.render(row)
            : (row[col.key] !== undefined && row[col.key] !== null ? row[col.key] : '-');
          const align = col.align ? `text-align:${col.align};` : '';
          const cls = col.cellClass || '';
          return `<td class="${cls}" style="${align}">${value}</td>`;
        }).join('');
        const clickable = config.onRowClick ? 'row-clickable' : '';
        return `<tr class="${clickable}" data-row-id="${row.id || ''}">${cells}</tr>`;
      }).join('');

      return `
        <table class="data-table">
          <thead><tr>${headHtml}</tr></thead>
          <tbody>${bodyHtml}</tbody>
        </table>
      `;
    }

    function renderPagination() {
      const total = state.filtered.length;
      const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
      if (totalPages <= 1) return '';
      return `
        <div style="padding:10px 16px; border-top:1px solid var(--border-1); display:flex; align-items:center; justify-content:flex-end; gap:8px; font-size:12px;">
          <span class="text-muted">${window.t ? t('common.pageOf', state.page, totalPages) : `Page ${state.page} / ${totalPages}`}</span>
          <button class="btn btn-sm btn-secondary" data-page="prev" ${state.page <= 1 ? 'disabled' : ''}>${window.t ? t('common.prevPage') : 'Prev'}</button>
          <button class="btn btn-sm btn-secondary" data-page="next" ${state.page >= totalPages ? 'disabled' : ''}>${window.t ? t('common.nextPage') : 'Next'}</button>
        </div>
      `;
    }

    function bindEvents() {
      // 搜索
      const searchInput = mountEl.querySelector('[data-table-search]');
      if (searchInput) {
        searchInput.addEventListener('input', Utils.debounce((e) => {
          state.keyword = e.target.value;
          state.page = 1;
          compute();
          render();
          // 保留焦点
          const newInput = mountEl.querySelector('[data-table-search]');
          if (newInput) {
            newInput.focus();
            newInput.setSelectionRange(state.keyword.length, state.keyword.length);
          }
        }, 200));
      }

      // 筛选
      mountEl.querySelectorAll('[data-filter-key]').forEach(sel => {
        sel.addEventListener('change', (e) => {
          state.filterValues[sel.dataset.filterKey] = e.target.value;
          state.page = 1;
          compute();
          render();
        });
      });

      // 排序
      mountEl.querySelectorAll('[data-sort-key]').forEach(th => {
        th.addEventListener('click', () => {
          const key = th.dataset.sortKey;
          if (state.sortKey === key) {
            state.sortOrder = state.sortOrder === 'asc' ? 'desc' : 'asc';
          } else {
            state.sortKey = key;
            state.sortOrder = 'desc';
          }
          compute();
          render();
        });
      });

      // 行点击
      if (config.onRowClick) {
        mountEl.querySelectorAll('tr[data-row-id]').forEach(tr => {
          tr.addEventListener('click', (e) => {
            // 如果点的是按钮等可交互元素,不触发行点击
            if (e.target.closest('button, a, select, input')) return;
            const id = tr.dataset.rowId;
            const row = state.data.find(r => r.id === id);
            if (row) config.onRowClick(row);
          });
        });
      }

      // 翻页
      mountEl.querySelectorAll('[data-page]').forEach(btn => {
        btn.addEventListener('click', () => {
          if (btn.dataset.page === 'prev' && state.page > 1) state.page -= 1;
          if (btn.dataset.page === 'next') {
            const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
            if (state.page < totalPages) state.page += 1;
          }
          render();
        });
      });

      // 自定义动作
      mountEl.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', () => {
          const key = btn.dataset.action;
          const action = (config.actions || []).find(a => a.key === key);
          if (action && action.onClick) action.onClick();
        });
      });
    }

    // ---- 数据计算 ----

    function compute() {
      let rows = state.data.slice();

      // 搜索
      if (state.keyword && config.searchFields) {
        rows = rows.filter(r =>
          config.searchFields.some(field => Utils.fuzzyMatch(_resolve(r, field), state.keyword))
        );
      } else if (state.keyword && config.customSearch) {
        // 自定义搜索函数(用于跨表搜索,如按客户名搜报价)
        rows = rows.filter(r => config.customSearch(r, state.keyword));
      }

      // 筛选
      (config.filters || []).forEach(f => {
        const v = state.filterValues[f.key];
        if (v !== '' && v !== undefined && v !== null) {
          if (f.predicate) {
            rows = rows.filter(r => f.predicate(r, v));
          } else {
            rows = rows.filter(r => String(_resolve(r, f.key)) === String(v));
          }
        }
      });

      // 排序
      if (state.sortKey) {
        rows.sort((a, b) => {
          const va = _resolve(a, state.sortKey);
          const vb = _resolve(b, state.sortKey);
          let cmp = 0;
          if (va === null || va === undefined) cmp = 1;
          else if (vb === null || vb === undefined) cmp = -1;
          else if (typeof va === 'number') cmp = va - vb;
          else cmp = String(va).localeCompare(String(vb));
          return state.sortOrder === 'asc' ? cmp : -cmp;
        });
      }

      state.filtered = rows;
    }

    function _resolve(obj, path) {
      // 支持嵌套字段 a.b.c
      return path.split('.').reduce((o, k) => (o == null ? null : o[k]), obj);
    }

    function getPageRows() {
      const start = (state.page - 1) * state.pageSize;
      return state.filtered.slice(start, start + state.pageSize);
    }

    // ---- 公共 API ----

    function setData(data) {
      state.data = data || [];
      state.page = 1;
      compute();
      render();
    }

    function refresh() {
      compute();
      render();
    }

    // 初始化
    compute();
    render();

    return {
      setData,
      refresh,
      getState: () => state,
    };
  }

  return { create };
})();

window.DataTable = DataTable;
