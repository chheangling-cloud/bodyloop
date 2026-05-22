/**
 * ProductList - 产品管理列表(财务模块下)
 * @module modules/productList
 */

const ProductListModule = (function () {
  'use strict';

  function init() {
    const isZh = I18n.get() === 'zh-CN';
    const isFinance = Session.is('finance') || Session.is('manager');

    document.getElementById('app-content').innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">${isZh?'产品管理':'Products'}</h1>
          <div class="page-subtitle">${isZh?'产品目录 · 指导价 · 最低价审核线':'Catalog · Guide price · Min-price approval line'}</div>
        </div>
        <div class="flex gap-2">
          ${isFinance ? `<button class="btn btn-primary" data-action="new">+ ${isZh?'新建产品':'New Product'}</button>` : ''}
        </div>
      </div>
      <div class="grid grid-cols-4 gap-3 mb-4" id="prod-kpi"></div>
      ${!isFinance ? `
        <div style="padding:8px 12px; background:rgba(96,165,250,0.08); border-left:3px solid var(--blue); border-radius:4px; margin-bottom:14px; font-size:12px; color:var(--text-2);">
          ${isZh?'ℹ 产品由财务管理,您当前为只读模式':'ℹ Products are managed by Finance. You are in read-only mode.'}
        </div>
      ` : ''}
      <div id="prod-table"></div>
    `;
    renderKPIs();
    renderTable();
    bindEvents();
  }

  function renderKPIs() {
    const kpiEl = document.getElementById('prod-kpi');
    if (!kpiEl) return;   // 从其他页面调用时容错
    const isZh = I18n.get() === 'zh-CN';
    const s = ProductService.stats();
    // 异常成交本月数:本月所有 SO items 中 priceLevel=below_min 的数量
    const monthAgo = Date.now() - 30 * 86400000;
    const orders = SalesOrderRepo.list().filter(o =>
      o.status !== 'cancelled' && new Date(o.createdAt).getTime() >= monthAgo
    );
    let lowPriceDeals = 0;
    orders.forEach(o => {
      (o.items || []).forEach(it => {
        const p = ProductService.findById(it.materialId);
        if (p && ProductService.priceLevel(it.unitPrice, p) === 'below_min') lowPriceDeals++;
      });
    });
    // 库存预警
    const stockLow = InventoryRepo.list().filter(i =>
      (i.quantity || 0) - (i.lockedQuantity || 0) < (i.safetyStock || 0)
    ).length;
    kpiEl.innerHTML = `
      <div class="kpi"><div class="kpi-bar emerald"></div><div class="kpi-label">${isZh?'在售产品':'Active'}</div><div class="kpi-value">${s.active}</div><div class="kpi-trend">${isZh?'活跃 SKU':'Active SKUs'}</div></div>
      <div class="kpi"><div class="kpi-bar"></div><div class="kpi-label">${isZh?'已下架':'Archived'}</div><div class="kpi-value">${s.archived}</div><div class="kpi-trend">${isZh?'不可下单':'Not sellable'}</div></div>
      <div class="kpi"><div class="kpi-bar red"></div><div class="kpi-label">${isZh?'本月低价成交':'Low-price Deals'}</div><div class="kpi-value">${lowPriceDeals}</div><div class="kpi-trend">${isZh?'低于最低价':'Below min'}</div></div>
      <div class="kpi"><div class="kpi-bar amber"></div><div class="kpi-label">${isZh?'库存预警':'Stock Alert'}</div><div class="kpi-value">${stockLow}</div><div class="kpi-trend">${isZh?'低于安全库存':'Below safety'}</div></div>
    `;
  }

  function renderTable() {
    const tblEl = document.getElementById('prod-table');
    if (!tblEl) return;
    const isZh = I18n.get() === 'zh-CN';
    const isFinance = Session.is('finance') || Session.is('manager');
    const products = ProductService.list();
    const data = products.map(p => ({
      ...p,
      _stock: ProductService.getCurrentStock(p.id),
    }));

    const columns = [
      {
        key: 'code', label: isZh?'编码':'Code', width: '130px',
        render: r => `<a class="font-mono text-strong text-accent" href="${Router.href('product-detail', { id: r.id })}" style="text-decoration:none;">${r.code}</a>`,
      },
      {
        key: 'name', label: isZh?'名称 / 规格':'Name / Spec',
        render: r => `
          <div class="text-strong">${r.name}</div>
          ${r.spec ? `<div class="text-muted" style="font-size:11px;">${r.spec}</div>` : ''}
        `,
      },
      {
        key: 'category', label: isZh?'品类':'Category', width: '100px',
        render: r => {
          const map = { plywood:'Plywood', veneer:'Veneer' };
          const enMap = { plywood:'Plywood', veneer:'Veneer' };
          return `<span class="text-muted" style="font-size:12px;">${(isZh?map:enMap)[r.category] || r.category}</span>`;
        },
      },
      {
        key: 'unit', label: isZh?'单位':'Unit', width: '70px',
        render: r => `<span class="text-muted">${r.unit}</span>`,
      },
      {
        key: 'guidePrice', label: isZh?'指导价':'Guide', width: '110px', align:'right',
        render: r => `<span class="font-mono text-strong">${Utils.formatMoney(r.guidePrice)}</span>`,
      },
      {
        key: 'minPrice', label: isZh?'最低价':'Min', width: '110px', align:'right',
        render: r => {
          if (!r.minPrice) return `<span class="text-muted">-</span>`;
          const diff = r.guidePrice ? Math.round((r.guidePrice - r.minPrice) / r.guidePrice * 100) : 0;
          return `<span class="font-mono">${Utils.formatMoney(r.minPrice)}</span>
                  <span class="text-muted" style="font-size:10px; margin-left:4px;">-${diff}%</span>`;
        },
      },
      {
        key: '_stock', label: isZh?'当前库存':'Stock', width: '110px', align:'right',
        render: r => `<span class="font-mono ${r._stock < 100 ? 'text-amber' : 'text-muted'}">${r._stock || 0}</span>`,
      },
      {
        key: 'status', label: isZh?'状态':'Status', width: '90px',
        render: r => {
          const c = r.status === 'active' ? 'var(--emerald)' : 'var(--text-3)';
          const bg = r.status === 'active' ? 'rgba(74,222,128,0.14)' : 'rgba(148,163,184,0.10)';
          const label = r.status === 'active' ? (isZh?'在售':'Active') : (isZh?'下架':'Archived');
          return `<span style="padding:2px 7px; background:${bg}; color:${c}; border-radius:3px; font-size:11px;">${label}</span>`;
        },
      },
      {
        key: '_actions', label: isZh?'操作':'Actions', width: '130px', sortable: false,
        render: r => {
          if (!isFinance) return `<a class="text-accent" href="${Router.href('product-detail', { id: r.id })}" style="text-decoration:none; font-size:11px;">${isZh?'查看 →':'View →'}</a>`;
          return `
            <a class="text-accent" href="${Router.href('product-detail', { id: r.id })}" style="text-decoration:none; font-size:11px; margin-right:8px;">${isZh?'编辑':'Edit'}</a>
            ${r.status === 'active'
              ? `<a href="javascript:void(0)" class="text-muted" data-action="archive" data-id="${r.id}" style="text-decoration:none; font-size:11px;">${isZh?'下架':'Archive'}</a>`
              : `<a href="javascript:void(0)" class="text-emerald" data-action="activate" data-id="${r.id}" style="text-decoration:none; font-size:11px;">${isZh?'上架':'Activate'}</a>`
            }
          `;
        },
      },
    ];

    DataTable.create({
      mount: '#prod-table',
      columns, data,
      customSearch: (row, kw) =>
        Utils.fuzzyMatch(row.code, kw) ||
        Utils.fuzzyMatch(row.name, kw) ||
        Utils.fuzzyMatch(row.spec, kw),
      searchPlaceholder: isZh?'搜索编码 / 名称 / 规格':'Search code / name / spec',
      filters: [
        { key: 'status', options: [
          { value: '',         label: isZh?'全部 · 状态':'All · Status' },
          { value: 'active',   label: isZh?'在售':'Active' },
          { value: 'archived', label: isZh?'下架':'Archived' },
        ]},
        { key: 'category', options: [
          { value: '',        label: isZh?'全部 · 品类':'All · Category' },
          { value: 'plywood', label: 'Plywood' },
          { value: 'veneer',  label: 'Veneer' },
        ]},
      ],
      pageSize: 15,
    });

    document.getElementById('prod-table').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      if (action === 'archive') {
        if (confirm(isZh?'确定下架该产品?':'Archive this product?')) {
          ProductService.archive(id);
          Toast.success(isZh?'已下架':'Archived');
          renderKPIs(); renderTable();
        }
      } else if (action === 'activate') {
        ProductService.activate(id);
        Toast.success(isZh?'已上架':'Activated');
        renderKPIs(); renderTable();
      }
    });
  }

  function bindEvents() {
    const newBtn = document.querySelector('[data-action="new"]');
    if (newBtn) newBtn.addEventListener('click', openEditDialog);
  }

  function openEditDialog(product = null) {
    const isZh = I18n.get() === 'zh-CN';
    const isEdit = !!product;
    const p = product || { code:'', name:'', spec:'', unit:'pcs', category:'plywood', guidePrice:0, minPrice:0, description:'' };

    Modal.open({
      title: isEdit ? (isZh?'编辑产品':'Edit Product') : (isZh?'新建产品':'New Product'),
      width: 540,
      content: `
        <div style="display:grid; gap:12px;">
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
            <div>
              <label class="form-label">${isZh?'产品编码':'Code'} <span class="text-red">*</span></label>
              <input class="input w-full" id="prod-code" value="${p.code}" ${isEdit?'readonly':''} placeholder="${isEdit?'':'P-244-018-1'}">
            </div>
            <div>
              <label class="form-label">${isZh?'品类':'Category'}</label>
              <select class="input w-full" id="prod-category">
                ${['plywood','veneer'].map(c => {
                  const label = { plywood:'Plywood', veneer:'Veneer' }[c];
                  return `<option value="${c}" ${p.category===c?'selected':''}>${label}</option>`;
                }).join('')}
              </select>
            </div>
          </div>
          <div>
            <label class="form-label">${isZh?'产品名称':'Name'} <span class="text-red">*</span></label>
            <input class="input w-full" id="prod-name" value="${p.name}" placeholder="${isZh?'如:Decorative Board':'e.g. Decorative Board'}">
          </div>
          <div style="display:grid; grid-template-columns: 2fr 1fr; gap:12px;">
            <div>
              <label class="form-label">${isZh?'规格':'Spec'}</label>
              <input class="input w-full" id="prod-spec" value="${p.spec}" placeholder="${isZh?'如:2440×1220×18mm':'e.g. 2440×1220×18mm'}">
            </div>
            <div>
              <label class="form-label">${isZh?'单位':'Unit'}</label>
              <input class="input w-full" id="prod-unit" value="${p.unit}" placeholder="${isZh?'张/块/米':'pcs/m²'}">
            </div>
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
            <div>
              <label class="form-label">${isZh?'指导价':'Guide Price'} <span class="text-red">*</span></label>
              <div style="position:relative;">
                <span style="position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--text-3); font-size:13px; pointer-events:none;">$</span>
                <input class="input w-full" type="number" step="0.01" min="0" id="prod-guide" value="${((p.guidePrice || 0) / 100).toFixed(2)}" placeholder="${isZh?'默认成交价':'Default price'}" style="padding-left:24px;">
              </div>
              <div class="text-muted" style="font-size:10px; margin-top:3px;">${isZh?'例如:2.42':'e.g. 2.42'}</div>
            </div>
            <div>
              <label class="form-label">${isZh?'最低价':'Min Price'}</label>
              <div style="position:relative;">
                <span style="position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--text-3); font-size:13px; pointer-events:none;">$</span>
                <input class="input w-full" type="number" step="0.01" min="0" id="prod-min" value="${((p.minPrice || 0) / 100).toFixed(2)}" placeholder="${isZh?'低于此价需审批':'Below: needs approval'}" style="padding-left:24px;">
              </div>
              <div class="text-muted" style="font-size:10px; margin-top:3px;">${isZh?'通常为指导价的 92%':'Usually 92% of guide'}</div>
            </div>
          </div>
          <div>
            <label class="form-label">${isZh?'描述':'Description'}</label>
            <textarea class="input w-full" id="prod-desc" rows="2">${p.description || ''}</textarea>
          </div>
        </div>
      `,
      buttons: [
        { label: isZh?'取消':'Cancel' },
        { label: isZh?'保存':'Save', primary: true, onClick: () => {
          const data = {
            code: document.getElementById('prod-code').value.trim(),
            name: document.getElementById('prod-name').value.trim(),
            spec: document.getElementById('prod-spec').value.trim(),
            unit: document.getElementById('prod-unit').value.trim(),
            category: document.getElementById('prod-category').value,
            guidePrice: Utils.dollarsToCents(document.getElementById('prod-guide').value),
            minPrice: Utils.dollarsToCents(document.getElementById('prod-min').value),
            description: document.getElementById('prod-desc').value.trim(),
          };
          try {
            if (isEdit) {
              ProductService.update(product.id, data);
              Toast.success(isZh?'已保存':'Saved');
            } else {
              ProductService.create(data);
              Toast.success(isZh?'已创建':'Created');
            }
            renderKPIs(); renderTable();
            // 如果当前在产品详情页,触发该页面重新加载
            const detailRoute = (typeof Router !== 'undefined') && Router.current();
            if (detailRoute && detailRoute.route === 'product-detail' && window.View_product_detail) {
              window.View_product_detail.init(detailRoute);
            }
          } catch (e) { Toast.error(e.message); return false; }
        }}
      ],
    });
  }

  return { init, openEditDialog };
})();

window.ProductListModule = ProductListModule;
