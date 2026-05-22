/**
 * ProductDetail - 产品详情页
 * @module modules/productDetail
 *
 * 4 Tab: 基本资料 / 价格策略 / 成交记录 / 库存
 */

const ProductDetailModule = (function () {
  'use strict';

  let product = null;
  let activeTab = 'basic';

  function init(ctx) {
    const id = ctx.params.id;
    product = ProductService.findById(id);
    if (!product) {
      document.getElementById('app-content').innerHTML = `<div class="empty-state">${I18n.get()==='zh-CN'?'产品不存在':'Product not found'}</div>`;
      return;
    }
    activeTab = (ctx.query && ctx.query.tab) || 'basic';
    render();
  }

  function render() {
    const isZh = I18n.get() === 'zh-CN';
    const isFinance = Session.is('finance') || Session.is('manager');

    document.getElementById('app-content').innerHTML = `
      <div class="back-link" style="font-size:11px; color:var(--text-3); margin-bottom:8px;">
        <a href="${Router.href('product-list')}" style="color:var(--text-3); text-decoration:none;">← ${isZh?'返回产品列表':'Back to Products'}</a>
      </div>
      ${renderHero(isFinance)}
      <div class="hub-layout" style="display:grid; grid-template-columns: 200px 1fr; gap:16px; margin-top:16px;">
        <aside id="prod-tabs"></aside>
        <main id="prod-tab-content"></main>
      </div>
    `;
    renderTabs(isFinance);
    renderTabContent();
  }

  function renderHero(isFinance) {
    const isZh = I18n.get() === 'zh-CN';
    const stock = ProductService.getCurrentStock(product.id);
    const categoryLabel = { plywood:'Plywood', veneer:'Veneer' }[product.category] || product.category;
    const stockColor = stock < 100 ? 'var(--amber)' : 'var(--emerald)';

    return `
      <div style="background: linear-gradient(135deg, var(--bg-2), var(--bg-1)); border:1px solid var(--border-1); border-radius:10px; padding:20px 24px;">
        <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:16px;">
          <div>
            <h1 style="font-size:22px; font-weight:600; margin:0 0 4px 0;">${product.name}</h1>
            <div style="font-size:12px; color:var(--text-3);">
              <span class="font-mono">${product.code}</span>
              ${product.spec ? `<span style="margin:0 6px; opacity:0.5;">·</span>${product.spec}` : ''}
              <span style="margin:0 6px; opacity:0.5;">·</span>${categoryLabel}
              ${product.status === 'archived' ? `<span style="margin:0 6px; opacity:0.5;">·</span><span class="text-muted">${Icon.box(13)} ${isZh?'已下架':'Archived'}</span>` : ''}
            </div>
          </div>
          ${isFinance ? `
            <div style="display:flex; gap:8px;">
              <button class="btn btn-secondary btn-sm" data-action="edit">${isZh?'编辑':'Edit'}</button>
              ${product.status === 'active'
                ? `<button class="btn btn-ghost btn-sm" data-action="archive">${isZh?'下架':'Archive'}</button>`
                : `<button class="btn btn-primary btn-sm" data-action="activate">${isZh?'上架':'Activate'}</button>`
              }
            </div>
          ` : ''}
        </div>
        <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:10px;">
          <div style="background:var(--bg-3); border-radius:6px; padding:10px 14px;">
            <div style="font-size:11px; color:var(--text-3);">${isZh?'指导价':'Guide Price'}</div>
            <div class="font-mono" style="font-size:17px; font-weight:600; margin-top:3px;">${Utils.formatMoney(product.guidePrice)}</div>
            <div style="font-size:10px; color:var(--text-3); margin-top:2px;">${isZh?'默认成交价':'Default price'} / ${product.unit}</div>
          </div>
          <div style="background:var(--bg-3); border-radius:6px; padding:10px 14px;">
            <div style="font-size:11px; color:var(--text-3);">${isZh?'最低价':'Min Price'}</div>
            <div class="font-mono" style="font-size:17px; font-weight:600; margin-top:3px; color:var(--amber);">${Utils.formatMoney(product.minPrice)}</div>
            <div style="font-size:10px; color:var(--text-3); margin-top:2px;">${isZh?'低于触发审批':'Below = needs approval'}</div>
          </div>
          <div style="background:var(--bg-3); border-radius:6px; padding:10px 14px;">
            <div style="font-size:11px; color:var(--text-3);">${isZh?'当前库存':'Current Stock'}</div>
            <div class="font-mono" style="font-size:17px; font-weight:600; margin-top:3px; color:${stockColor};">${stock || 0}</div>
            <div style="font-size:10px; color:var(--text-3); margin-top:2px;">${product.unit}</div>
          </div>
          <div style="background:var(--bg-3); border-radius:6px; padding:10px 14px;">
            <div style="font-size:11px; color:var(--text-3);">${isZh?'入库参考成本':'Avg Cost'}</div>
            <div class="font-mono" style="font-size:17px; font-weight:600; margin-top:3px; color:var(--text-2);">${Utils.formatMoney(product.price || 0)}</div>
            <div style="font-size:10px; color:var(--text-3); margin-top:2px;">/ ${product.unit}</div>
          </div>
        </div>
      </div>
    `;
  }

  function renderTabs(isFinance) {
    const isZh = I18n.get() === 'zh-CN';
    const deals = ProductService.getDealsByProduct(product.id);
    const tabs = [
      { key: 'basic',   label: isZh?'基本资料':'Basic',         icon: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><rect x="3.5" y="3" width="9" height="11" rx="1.5"/><rect x="6" y="1.5" width="4" height="3" rx="0.5"/></svg>' },
      { key: 'price',   label: isZh?'价格策略':'Price',         icon: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><rect x="1.5" y="3" width="13" height="10" rx="1.5"/><circle cx="8" cy="8" r="2.25"/></svg>' },
      { key: 'deals',   label: isZh?'成交记录':'Deals',         icon: '🛒', count: deals.length },
      { key: 'stock',   label: isZh?'库存':'Stock',             icon: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M2 5 L8 2 L14 5 L8 8 Z"/><path d="M2 5 V11 L8 14 V8"/><path d="M14 5 V11 L8 14"/></svg>' },
    ];
    document.getElementById('prod-tabs').innerHTML = `
      <nav style="display:flex; flex-direction:column; gap:2px;">
        ${tabs.map(t => `
          <div class="hub-tab ${activeTab === t.key ? 'active' : ''}" data-tab="${t.key}"
            style="padding:10px 14px; border-radius:6px; cursor:pointer; font-size:13px;
                   ${activeTab === t.key ? 'background:var(--bg-3); color:var(--text-1);' : 'color:var(--text-2);'}
                   display:flex; align-items:center; gap:10px;">
            <span style="opacity:0.7;">${t.icon}</span>
            <span style="flex:1;">${t.label}</span>
            ${t.count !== undefined ? `<span style="font-size:11px; color:var(--text-3); background:rgba(255,255,255,0.04); padding:1px 6px; border-radius:3px;">${t.count}</span>` : ''}
          </div>
        `).join('')}
      </nav>
    `;
    document.querySelectorAll('[data-tab]').forEach(el => {
      el.addEventListener('click', () => {
        activeTab = el.dataset.tab;
        Router.replace('product-detail', { id: product.id }, { tab: activeTab });
        renderTabs(isFinance); renderTabContent();
      });
    });
    // Hero 按钮
    document.querySelectorAll('[data-action]').forEach(el => {
      if (el.dataset.bound) return;
      el.dataset.bound = '1';
      el.addEventListener('click', () => {
        const action = el.dataset.action;
        if (action === 'edit')     ProductListModule.openEditDialog(product);
        if (action === 'archive')  doArchive();
        if (action === 'activate') doActivate();
      });
    });
  }

  function doArchive() {
    const isZh = I18n.get() === 'zh-CN';
    if (!confirm(isZh?'确定下架该产品?':'Archive this product?')) return;
    ProductService.archive(product.id);
    Toast.success(isZh?'已下架':'Archived');
    product = ProductService.findById(product.id);
    render();
  }
  function doActivate() {
    ProductService.activate(product.id);
    Toast.success(I18n.get()==='zh-CN'?'已上架':'Activated');
    product = ProductService.findById(product.id);
    render();
  }

  function renderTabContent() {
    if (activeTab === 'basic') return renderBasicTab();
    if (activeTab === 'price') return renderPriceTab();
    if (activeTab === 'deals') return renderDealsTab();
    if (activeTab === 'stock') return renderStockTab();
  }

  function renderBasicTab() {
    const isZh = I18n.get() === 'zh-CN';
    const creator = EmployeeRepo.find(product.createdBy);
    const updater = EmployeeRepo.find(product.updatedBy);
    document.getElementById('prod-tab-content').innerHTML = `
      <div class="ov-section">
        <div class="ov-section-head"><span>${isZh?'产品资料':'Product Info'}</span></div>
        <div class="ov-section-body">
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px 32px; font-size:13px;">
            ${row(isZh?'产品名称':'Name', product.name, true)}
            ${row(isZh?'产品编码':'Code', `<span class="font-mono">${product.code}</span>`)}
            ${row(isZh?'规格':'Spec', product.spec || '-')}
            ${row(isZh?'单位':'Unit', product.unit)}
            ${row(isZh?'品类':'Category', { plywood:'Plywood', veneer:'Veneer' }[product.category] || product.category)}
            ${row(isZh?'状态':'Status', product.status === 'active' ? (isZh?'<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><polyline points="3,8 7,12 13,4"/></svg> 在售':'<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><polyline points="3,8 7,12 13,4"/></svg> Active') : (isZh?'<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M2 5 L8 2 L14 5 L8 8 Z"/><path d="M2 5 V11 L8 14 V8"/><path d="M14 5 V11 L8 14"/></svg> 已下架':'<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M2 5 L8 2 L14 5 L8 8 Z"/><path d="M2 5 V11 L8 14 V8"/><path d="M14 5 V11 L8 14"/></svg> Archived'))}
          </div>
          ${product.description ? `
            <div style="margin-top:14px; padding-top:14px; border-top:1px solid var(--border-1);">
              <div class="text-muted" style="font-size:11px; margin-bottom:6px;">${isZh?'描述':'Description'}</div>
              <div style="font-size:13px;">${product.description}</div>
            </div>
          ` : ''}
        </div>
      </div>
      <div class="ov-section">
        <div class="ov-section-head"><span>${isZh?'追溯':'Audit'}</span></div>
        <div class="ov-section-body">
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px 32px; font-size:13px;">
            ${row(isZh?'创建人':'Created By', creator?.name || product.createdBy)}
            ${row(isZh?'创建时间':'Created At', Utils.formatDateTime(product.createdAt))}
            ${row(isZh?'最后修改':'Last Updated By', updater?.name || product.updatedBy)}
            ${row(isZh?'修改时间':'Updated At', Utils.formatDateTime(product.updatedAt))}
          </div>
        </div>
      </div>
    `;
  }

  function row(label, value, strong = false) {
    return `
      <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px dashed var(--border-1);">
        <span class="text-muted">${label}</span>
        <span class="${strong ? 'text-strong' : ''}">${value || '-'}</span>
      </div>
    `;
  }

  function renderPriceTab() {
    const isZh = I18n.get() === 'zh-CN';
    const guide = product.guidePrice || 0;
    const min = product.minPrice || 0;
    const cost = product.price || 0;
    const minDiscount = guide > 0 ? Math.round((guide - min) / guide * 100) : 0;
    const margin = cost > 0 ? Math.round((guide - cost) / guide * 100) : 0;

    document.getElementById('prod-tab-content').innerHTML = `
      <div class="ov-section">
        <div class="ov-section-head"><span>${Icon.money(13)} ${isZh?'价格阶梯':'Price Tiers'}</span></div>
        <div class="ov-section-body">
          <div style="display:flex; flex-direction:column; gap:10px;">
            <div style="display:flex; align-items:center; padding:12px 14px; background:rgba(52, 229, 164, 0.08); border-left:3px solid var(--emerald); border-radius:4px;">
              <div style="flex:1;">
                <div class="text-strong">${isZh?'指导价(标准成交价)':'Guide Price (Default)'}</div>
                <div class="text-muted" style="font-size:11px; margin-top:2px;">${isZh?'销售员下单时的默认填充值':'Pre-filled when sales create orders'}</div>
              </div>
              <div class="font-mono" style="font-size:20px; font-weight:600;">${Utils.formatMoney(guide)}</div>
            </div>
            <div style="display:flex; align-items:center; padding:12px 14px; background:rgba(250,204,21,0.06); border-left:3px solid #facc15; border-radius:4px;">
              <div style="flex:1;">
                <div class="text-strong">${isZh?'最低价(审批线)':'Min Price (Approval Line)'}</div>
                <div class="text-muted" style="font-size:11px; margin-top:2px;">${isZh?'销售员低于此价提交订单将触发财务审批':'Triggers Finance approval if sales price below'}</div>
              </div>
              <div class="text-right">
                <div class="font-mono" style="font-size:20px; font-weight:600; color:var(--amber);">${Utils.formatMoney(min)}</div>
                <div class="text-muted" style="font-size:11px;">- ${minDiscount}% ${isZh?'比指导价':'vs guide'}</div>
              </div>
            </div>
            ${product.vipPrice ? `
              <div style="display:flex; align-items:center; padding:12px 14px; background:rgba(96,165,250,0.04); border-left:3px solid #60a5fa; border-radius:4px; opacity:0.6;">
                <div style="flex:1;">
                  <div class="text-strong">${isZh?'VIP 价(预留)':'VIP Price (Reserved)'}</div>
                  <div class="text-muted" style="font-size:11px; margin-top:2px;">${isZh?'分级定价功能预留,暂不启用':'Reserved for tiered pricing'}</div>
                </div>
                <div class="font-mono" style="font-size:18px; font-weight:600; color:var(--text-3);">${Utils.formatMoney(product.vipPrice)}</div>
              </div>
            ` : ''}
            <div style="display:flex; align-items:center; padding:12px 14px; background:var(--bg-3); border-radius:4px;">
              <div style="flex:1;">
                <div class="text-muted">${isZh?'入库参考成本':'Avg Inbound Cost'}</div>
                <div class="text-muted" style="font-size:11px; margin-top:2px;">${isZh?'仓库录入,不影响销售':'From warehouse, not affecting sales'}</div>
              </div>
              <div class="text-right">
                <div class="font-mono" style="font-size:17px; color:var(--text-2);">${Utils.formatMoney(cost)}</div>
                <div class="text-muted" style="font-size:11px;">${isZh?'毛利约':'Approx margin'} ${margin}%</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="ov-section">
        <div class="ov-section-head"><span>${isZh?'审批策略':'Approval Strategy'}</span></div>
        <div class="ov-section-body">
          <div style="font-size:13px;">
            <div style="margin-bottom:8px;">
              <span class="text-muted">${isZh?'低于最低价审批':'Below-min approval'}: </span>
              <span class="text-strong">${product.needApproval ? (isZh?'<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><polyline points="3,8 7,12 13,4"/></svg> 已启用':'<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><polyline points="3,8 7,12 13,4"/></svg> Enabled') : (isZh?'<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg> 已禁用':'<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg> Disabled')}</span>
            </div>
            <div class="text-muted" style="font-size:11px;">
              ${isZh?'启用时:销售单价 < 最低价 时,订单进入「等待财务审批」状态,财务通过铃铛收到通知。':'When enabled, orders priced below minPrice enter "Pending Finance Approval" state with bell notification.'}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderDealsTab() {
    const isZh = I18n.get() === 'zh-CN';
    const deals = ProductService.getDealsByProduct(product.id);
    if (deals.length === 0) {
      document.getElementById('prod-tab-content').innerHTML = `
        <div class="coming-soon" style="padding:60px 20px; text-align:center;">
          <div style="font-size:32px; opacity:0.3; margin-bottom:12px;">🛒</div>
          <div class="text-muted">${isZh?'该产品尚无成交记录':'No deals yet'}</div>
        </div>
      `;
      return;
    }
    const prices = deals.map(d => d.unitPrice);
    const minP = Math.min(...prices), maxP = Math.max(...prices);
    const avgP = Math.round(prices.reduce((s,x)=>s+x,0) / prices.length);
    const lowCount = deals.filter(d => d.priceLevel === 'below_min').length;
    const customers = CustomerRepo.list();
    const custMap = Object.fromEntries(customers.map(c => [c.id, c]));
    const empMap = Object.fromEntries(EmployeeRepo.list().map(e => [e.id, e]));

    document.getElementById('prod-tab-content').innerHTML = `
      <div class="ov-section">
        <div class="ov-section-head">
          <span>🛒 ${isZh?'全部成交':'All Deals'}</span>
          <span class="text-muted" style="font-size:11px;">${deals.length} ${isZh?'笔':'deals'}</span>
        </div>
        <div class="ov-section-body" style="display:grid; grid-template-columns: repeat(4, 1fr); gap:10px;">
          <div style="background:var(--bg-3); padding:10px 14px; border-radius:6px;">
            <div class="text-muted" style="font-size:11px;">${isZh?'最低成交':'Min'}</div>
            <div class="font-mono text-strong">${Utils.formatMoney(minP)}</div>
          </div>
          <div style="background:var(--bg-3); padding:10px 14px; border-radius:6px;">
            <div class="text-muted" style="font-size:11px;">${isZh?'最高成交':'Max'}</div>
            <div class="font-mono text-strong">${Utils.formatMoney(maxP)}</div>
          </div>
          <div style="background:var(--bg-3); padding:10px 14px; border-radius:6px;">
            <div class="text-muted" style="font-size:11px;">${isZh?'平均':'Avg'}</div>
            <div class="font-mono text-strong">${Utils.formatMoney(avgP)}</div>
          </div>
          <div style="background:${lowCount>0?'rgba(248,113,113,0.06)':'var(--bg-3)'}; padding:10px 14px; border-radius:6px;">
            <div class="text-muted" style="font-size:11px;">${isZh?'低于最低价':'Below Min'}</div>
            <div class="font-mono text-strong" style="color:${lowCount>0?'var(--red)':''};">${lowCount}</div>
          </div>
        </div>
      </div>
      <div class="ov-section">
        <div class="ov-section-body">
          <div style="overflow-x:auto;">
            <table style="width:100%; font-size:12px; border-collapse:collapse;">
              <thead>
                <tr style="background:var(--bg-3); color:var(--text-3); text-transform:uppercase; font-size:11px;">
                  <th style="text-align:left; padding:8px 12px;">${isZh?'日期':'Date'}</th>
                  <th style="text-align:left; padding:8px 12px;">${isZh?'订单号':'Order'}</th>
                  <th style="text-align:left; padding:8px 12px;">${isZh?'客户':'Customer'}</th>
                  <th style="text-align:right; padding:8px 12px;">${isZh?'数量':'Qty'}</th>
                  <th style="text-align:right; padding:8px 12px;">${isZh?'单价':'Unit Price'}</th>
                  <th style="text-align:left; padding:8px 12px;">${isZh?'销售员':'Sales'}</th>
                </tr>
              </thead>
              <tbody>
                ${deals.map(d => {
                  const c = custMap[d.customerId];
                  const s = empMap[d.salesId];
                  const color = ProductService.priceLevelColor(d.priceLevel);
                  const icon = d.priceLevel === 'below_min' ? '' :
                               d.priceLevel === 'below_guide' ? '' :
                               d.priceLevel === 'over_guide' ? '' : '';
                  return `
                    <tr style="border-bottom:1px solid var(--border-1);">
                      <td style="padding:8px 12px;" class="font-mono">${Utils.formatDate(d.orderDate)}</td>
                      <td style="padding:8px 12px;"><a class="font-mono text-accent" href="${Router.href('order-detail',{id:d.orderId})}" style="text-decoration:none;">${d.orderNo}</a></td>
                      <td style="padding:8px 12px;">${c ? `<a href="${Router.href('customer-detail',{id:c.id})}" style="color:var(--text-1); text-decoration:none;">${c.name}</a>` : '-'}</td>
                      <td style="padding:8px 12px; text-align:right;" class="font-mono">${d.qty}</td>
                      <td style="padding:8px 12px; text-align:right;">
                        <span class="font-mono text-strong" style="color:${color};">${Utils.formatMoney(d.unitPrice)}</span>
                        ${icon ? `<span style="margin-left:4px;">${icon}</span>` : ''}
                      </td>
                      <td style="padding:8px 12px;" class="text-muted">${s?.name || '-'}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  function renderStockTab() {
    const isZh = I18n.get() === 'zh-CN';
    const invs = InventoryRepo.list({ materialId: product.id });
    const warehouses = WarehouseRepo.list();
    const whMap = Object.fromEntries(warehouses.map(w => [w.id, w]));
    if (invs.length === 0) {
      document.getElementById('prod-tab-content').innerHTML = `
        <div class="coming-soon" style="padding:60px 20px; text-align:center;">
          <div style="font-size:32px; opacity:0.3; margin-bottom:12px;"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M2 5 L8 2 L14 5 L8 8 Z"/><path d="M2 5 V11 L8 14 V8"/><path d="M14 5 V11 L8 14"/></svg></div>
          <div class="text-muted">${isZh?'该产品在仓库无库存记录':'No inventory record'}</div>
        </div>
      `;
      return;
    }
    document.getElementById('prod-tab-content').innerHTML = `
      <div class="ov-section">
        <div class="ov-section-head"><span>${Icon.box(13)} ${isZh?'各仓库存':'Stock by Warehouse'}</span></div>
        <div class="ov-section-body">
          <div style="overflow-x:auto;">
            <table style="width:100%; font-size:12px; border-collapse:collapse;">
              <thead>
                <tr style="background:var(--bg-3); color:var(--text-3); text-transform:uppercase; font-size:11px;">
                  <th style="text-align:left; padding:8px 12px;">${isZh?'仓库':'Warehouse'}</th>
                  <th style="text-align:right; padding:8px 12px;">${isZh?'总量':'Total'}</th>
                  <th style="text-align:right; padding:8px 12px;">${isZh?'锁定':'Locked'}</th>
                  <th style="text-align:right; padding:8px 12px;">${isZh?'可用':'Available'}</th>
                  <th style="text-align:right; padding:8px 12px;">${isZh?'安全库存':'Safety'}</th>
                  <th style="text-align:left; padding:8px 12px;">${isZh?'状态':'Status'}</th>
                </tr>
              </thead>
              <tbody>
                ${invs.map(i => {
                  const wh = whMap[i.warehouseId];
                  const avail = (i.quantity || 0) - (i.lockedQuantity || 0);
                  const safety = i.safetyStock || 0;
                  const isLow = avail < safety;
                  return `
                    <tr style="border-bottom:1px solid var(--border-1);">
                      <td style="padding:8px 12px;" class="text-strong">${wh?.name || i.warehouseId}</td>
                      <td style="padding:8px 12px; text-align:right;" class="font-mono">${i.quantity || 0}</td>
                      <td style="padding:8px 12px; text-align:right;" class="font-mono text-muted">${i.lockedQuantity || 0}</td>
                      <td style="padding:8px 12px; text-align:right;" class="font-mono text-strong" style="color:${isLow?'var(--amber)':''};">${avail}</td>
                      <td style="padding:8px 12px; text-align:right;" class="font-mono text-muted">${safety}</td>
                      <td style="padding:8px 12px;">
                        ${isLow ? `<span style="color:var(--amber); font-size:11px;">${Icon.warning(13)} ${isZh?'低于安全':'Low'}</span>` : `<span style="color:var(--emerald); font-size:11px;">${Icon.check(13)} ${isZh?'充足':'OK'}</span>`}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  return { init };
})();

window.ProductDetailModule = ProductDetailModule;
