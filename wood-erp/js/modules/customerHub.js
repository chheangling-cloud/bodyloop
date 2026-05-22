/**
 * CustomerHub - 客户运营中心(重构后客户详情)
 * Hero Section + 6 Tab(侧边布局)
 * 
 * Tabs:
 *   1. overview  概览
 *   2. orders    订单(生命周期卡片)
 *   3. timeline  Timeline(客户级)
 *   4. policy    财务策略
 *   5. risk      风险
 *   6. files     附件
 */

const CustomerHubModule = (function () {
  'use strict';

  let customer = null;
  let activeTab = 'overview';
  let orders = [], deliveries = [], settlements = [], payments = [];

  function init(ctx) {
    const id = ctx.params.id;
    customer = CustomerRepo.find(id);
    if (!customer) {
      document.getElementById('customer-hub-root').innerHTML =
        `<div class="empty-state">${I18n.get()==='zh-CN'?'客户不存在':'Customer not found'}</div>`;
      return;
    }
    // 默认 tab 从 URL 来
    activeTab = (ctx.query && ctx.query.tab) || 'overview';
    loadData();
    render();
    // 监听
    ['salesOrder.created','salesOrder.updated','salesOrder.confirmed',
     'settlement.confirmed','payment.confirmed','customer.updated',
     'delivery.signed','delivery.created'].forEach(e =>
      EventBus.on(e, () => { loadData(); render(); })
    );
  }

  function loadData() {
    orders      = SalesOrderRepo.list({ customerId: customer.id });
    deliveries  = DeliveryRepo.list({ customerId: customer.id });
    settlements = SettlementRepo.list({ customerId: customer.id });
    payments    = PaymentRepo.list({ customerId: customer.id });
  }

  function render() {
    const isZh = I18n.get() === 'zh-CN';
    document.getElementById('customer-hub-root').innerHTML = `
      <div class="back-link" style="font-size:11px; color:var(--text-3); margin-bottom:8px;">
        <a href="${Router.href('customer-list')}" style="color:var(--text-3); text-decoration:none;">← ${isZh?'返回客户列表':'Back to Customer List'}</a>
      </div>
      ${renderHero()}
      <div class="hub-layout" style="display:grid; grid-template-columns: 220px 1fr; gap:16px; margin-top:16px;">
        <aside id="hub-tabs"></aside>
        <main id="hub-content"></main>
      </div>
    `;
    renderTabs();
    renderTabContent();
  }

  // ===== Hero =====
  function renderHero() {
    const isZh = I18n.get() === 'zh-CN';
    const stats = computeStats();
    const policy = customer.settlementPolicy || {};
    const lim = policy.credit?.limit || customer.creditLimit || 0;
    const used = stats.exposure;    // 当前占用(新概念)
    const pct = lim > 0 ? Math.min(999, Math.round(used / lim * 100)) : 0;
    const pctColor = pct > 90 ? 'var(--red)' : pct > 70 ? 'var(--amber)' : 'var(--emerald)';
    const overdueColor = stats.overdue > 0 ? 'var(--red)' : 'var(--text-3)';
    
    // 当前策略简述
    const policyLabel = _renderTriggerSummary(policy.trigger);
    // 最近订单状态
    const lastOrder = [...orders].sort((a, b) => new Date(b.updatedAt||b.createdAt) - new Date(a.updatedAt||a.createdAt))[0];

    // 等级 + 类型
    const grade = customer.creditGrade || customer.grade || '-';
    const custType = customer.customerType ? (typeof tEnum !== 'undefined' ? tEnum('customer','typeEnum',customer.customerType) : customer.customerType) : '';
    
    return `
      <div class="customer-hero" style="
        background: linear-gradient(135deg, var(--bg-2), var(--bg-1));
        border: 1px solid var(--border-1);
        border-radius: 10px;
        padding: 20px 24px;
      ">
        <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:16px;">
          <div>
            <h1 style="font-size:22px; font-weight:600; margin:0 0 4px 0;">${customer.name}</h1>
            <div style="font-size:12px; color:var(--text-3);">
              <span class="font-mono">${customer.code}</span>
              ${grade !== '-' ? `<span style="margin:0 6px; opacity:0.5;">·</span><span style="padding:1px 7px; background:rgba(96,165,250,0.14); color:#60a5fa; border-radius:3px; font-size:10px;">${grade}</span>` : ''}
              ${custType ? `<span style="margin:0 6px; opacity:0.5;">·</span>${custType}` : ''}
              ${customer.shipmentLocked ? `<span style="margin:0 6px; opacity:0.5;">·</span><span style="color:var(--red);"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5.5 7 V5 a2.5 2.5 0 0 1 5 0 V7"/></svg> ${isZh?'发货已锁定':'Shipment Locked'}</span>` : ''}
            </div>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-secondary btn-sm" data-action="edit">${isZh?'编辑':'Edit'}</button>
            <button class="btn btn-primary btn-sm" data-action="new-order">+ ${isZh?'新建订单':'New Order'}</button>
          </div>
        </div>

        <div class="hero-kpis" style="display:grid; grid-template-columns: repeat(6, 1fr); gap:10px;">
          ${renderHeroKpi(isZh?'当前占用':'Exposure', Sensitive.credit(used), isZh?'未完成订单合计':'Active orders total', used > 0 ? 'var(--text-1)' : 'var(--text-3)')}
          ${renderHeroKpi(isZh?'可用额度':'Available', Sensitive.credit(Math.max(0, lim - used)), `${pct}% ${isZh?'已用':'used'}`, lim - used < 0 ? 'var(--red)' : 'var(--text-1)')}
          ${renderHeroKpi(isZh?'信用占用率':'Credit Usage', pct + '%', `${Sensitive.credit(used)} / ${Sensitive.credit(lim)}`, pctColor)}
          ${renderHeroKpi(isZh?'应收款项':'Receivables', Sensitive.credit(stats.receivables), isZh?'未结清合计':'Unsettled total', stats.receivables > 0 ? 'var(--text-1)' : 'var(--text-3)')}
          ${renderHeroKpi(isZh?'逾期金额':'Overdue', Sensitive.credit(stats.overdue), stats.overdueCount > 0 ? `${stats.overdueCount} ${isZh?'张未收':'unpaid'}` : (isZh?'无逾期':'No overdue'), overdueColor)}
          ${renderHeroKpi(isZh?'当前策略':'Policy', policyLabel, isZh?'结算触发':'Trigger', 'var(--text-1)')}
        </div>

        ${lastOrder ? `
          <div style="margin-top:14px; padding-top:14px; border-top:1px solid var(--border-1); font-size:12px; color:var(--text-2);">
            ${isZh?'最近订单':'Latest order'}: 
            <a href="${Router.href('order-detail',{id:lastOrder.id})}" class="font-mono text-accent" style="text-decoration:none; margin:0 4px;">${lastOrder.no}</a>
            ${_renderOrderStatusInline(lastOrder)}
            <span style="margin-left:8px; opacity:0.6;">${Utils.formatDate(lastOrder.updatedAt || lastOrder.createdAt)}</span>
          </div>
        ` : ''}
      </div>
    `;
  }

  function renderHeroKpi(label, value, sub, valueColor) {
    return `
      <div style="background:var(--bg-3); border-radius:6px; padding:10px 14px;">
        <div style="font-size:11px; color:var(--text-3);">${label}</div>
        <div style="font-size:17px; font-weight:600; color:${valueColor}; margin-top:3px;" class="font-mono">${value}</div>
        ${sub ? `<div style="font-size:10px; color:var(--text-3); margin-top:2px;">${sub}</div>` : ''}
      </div>
    `;
  }

  function _renderTriggerSummary(trigger) {
    if (!trigger) return '-';
    const isZh = I18n.get() === 'zh-CN';
    const parts = [];
    if (trigger.truckCount?.enabled) parts.push(isZh?`${trigger.truckCount.threshold}车`:`${trigger.truckCount.threshold}T`);
    if (trigger.days?.enabled) parts.push(isZh?`${trigger.days.threshold}天`:`${trigger.days.threshold}D`);
    if (trigger.amount?.enabled) parts.push(Utils.formatMoney(trigger.amount.threshold));
    return parts.length > 0 ? parts.join(' / ') : (isZh?'未设':'Not set');
  }

  function _renderOrderStatusInline(o) {
    const sv = (typeof SCHEMAS !== 'undefined' && SCHEMAS.salesOrder?.statusEnum?.[o.status]) || {};
    const label = sv.label || o.status;
    const color = ({
      draft: 'var(--text-3)', confirmed: 'var(--blue)',
      preparing: 'var(--amber)', partial_shipped: 'var(--amber)',
      shipped: 'var(--emerald)', partial_settled: 'var(--amber)',
      settled: 'var(--emerald)', completed: 'var(--emerald)',
      cancelled: 'var(--text-3)',
    })[o.status] || 'var(--text-2)';
    return `<span style="padding:1px 7px; background:rgba(255,255,255,0.04); color:${color}; border-radius:3px; font-size:11px;">${label}</span>`;
  }

  // ===== Stats 计算 =====
  // 概念:
  //   receivables(应收款项) = 所有未付清的结算单(包含逾期和未到期)
  //   overdue(逾期金额)     = 应收款项中已过期未收的部分
  //   exposure(当前占用)    = 所有未完成订单金额(含待发货 + 已发未结 + 已结未付)
  function computeStats() {
    const now = Date.now();
    // 应收款项 & 逾期
    let receivables = 0, overdue = 0, overdueCount = 0;
    settlements
      .filter(s => s.status !== 'paid')
      .forEach(s => {
        const unpaid = (s.unpaidAmount != null) ? s.unpaidAmount : (s.totalAmount || 0) - (s.paidAmount || 0);
        receivables += unpaid;
        const dueDate = s.dueDate ? new Date(s.dueDate).getTime() : null;
        if (dueDate && dueDate < now) { overdue += unpaid; overdueCount++; }
      });

    // 当前占用 = 所有未完成订单总金额
    const exposure = orders
      .filter(o => !['completed', 'cancelled'].includes(o.status))
      .reduce((s, o) => s + (o.totalAmount || 0), 0);

    const orderCount = orders.length;
    const totalOrderAmount = orders.reduce((s, o) => s + (o.totalAmount || 0), 0);
    const settledAmount = settlements.reduce((s, x) => s + (x.payableAmount || 0), 0);
    const paidAmount = settlements.reduce((s, x) => s + (x.paidAmount || 0), 0);

    return {
      // 新概念
      receivables,      // 应收款项(含逾期)
      overdue,          // 逾期金额
      overdueCount,
      exposure,         // 当前占用
      // 旧字段保留向后兼容
      currentDebt: receivables,
      pendingDelivery: exposure - receivables > 0 ? exposure - receivables : 0,
      // 总计字段
      orderCount,
      totalOrderAmount,
      settledAmount,
      paidAmount,
    };
  }

  // ===== Tabs 渲染 =====
  function renderTabs() {
    const isZh = I18n.get() === 'zh-CN';
    const attachments = _countAttachments();
    const tabs = [
      { key: 'overview', label: isZh?'概览':'Overview',     icon: '□' },
      { key: 'orders',   label: isZh?'订单':'Orders',       icon: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><rect x="3.5" y="3" width="9" height="11" rx="1.5"/><rect x="6" y="1.5" width="4" height="3" rx="0.5"/></svg>', count: orders.length },
      { key: 'prices',   label: isZh?'价格历史':'Prices',   icon: '💲' },
      { key: 'policy',   label: isZh?'财务策略':'Policy',    icon: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><rect x="1.5" y="3" width="13" height="10" rx="1.5"/><circle cx="8" cy="8" r="2.25"/></svg>' },
      { key: 'risk',     label: isZh?'风险':'Risk',         icon: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M8 1.5 L14.5 13.5 H1.5 Z"/><line x1="8" y1="6.5" x2="8" y2="9.5"/><line x1="8" y1="11.5" x2="8" y2="11.6"/></svg>' },
      { key: 'files',    label: isZh?'附件':'Files',        icon: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M11 4.5 L5.5 10 a2.5 2.5 0 0 0 3.5 3.5 L14 8 a4 4 0 0 0 -5.5 -5.5 L3 8 a5 5 0 0 0 7 7 L14.5 10.5"/></svg>', count: attachments },
    ];
    document.getElementById('hub-tabs').innerHTML = `
      <nav style="display:flex; flex-direction:column; gap:2px;">
        ${tabs.map(t => `
          <div class="hub-tab ${activeTab === t.key ? 'active' : ''}" data-tab="${t.key}"
            style="padding:10px 14px; border-radius:6px; cursor:pointer; font-size:13px;
                   ${activeTab === t.key
                     ? 'background:var(--bg-3); color:var(--text-1);'
                     : 'color:var(--text-2);'}
                   display:flex; align-items:center; gap:10px;">
            <span style="opacity:0.7;">${t.icon}</span>
            <span style="flex:1;">${t.label}</span>
            ${t.count !== undefined && t.count !== null ? `<span style="font-size:11px; color:var(--text-3); background:rgba(255,255,255,0.04); padding:1px 6px; border-radius:3px;">${t.count}</span>` : ''}
          </div>
        `).join('')}
      </nav>
    `;
    document.querySelectorAll('.hub-tab').forEach(el => {
      el.addEventListener('click', () => {
        activeTab = el.dataset.tab;
        Router.replace('customer-detail', { id: customer.id }, { tab: activeTab });
        renderTabs(); renderTabContent();
      });
    });

    // Hero 按钮
    document.querySelectorAll('[data-action]').forEach(el => {
      if (el.dataset.bound) return;
      el.dataset.bound = '1';
      el.addEventListener('click', () => {
        const action = el.dataset.action;
        if (action === 'edit') openEditDialog();
        else if (action === 'new-order') openNewOrder();
      });
    });
  }

  function renderTabContent() {
    if (activeTab === 'overview') return renderOverviewTab();
    if (activeTab === 'orders')   return renderOrdersTab();
    if (activeTab === 'prices')   return renderPricesTab();
    if (activeTab === 'policy')   return renderPolicyTab();
    if (activeTab === 'risk')     return renderRiskTab();
    if (activeTab === 'files')    return renderFilesTab();
  }

  // ===== Tab 1: 概览 =====
  function renderOverviewTab() {
    const isZh = I18n.get() === 'zh-CN';
    const stats = computeStats();
    const totalShipped = deliveries.filter(d => d.transportStatus === 'signed').length;
    const truckCount = deliveries.filter(d => d.transportStatus === 'signed').length;
    
    // 智能建议(简单规则推导)
    const suggestions = [];
    const lim = customer.settlementPolicy?.credit?.limit || customer.creditLimit || 0;
    const usagePct = lim > 0 ? stats.exposure / lim * 100 : 0;
    if (usagePct > 85) suggestions.push({ 
      icon: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M8 1.5 L14.5 13.5 H1.5 Z"/><line x1="8" y1="6.5" x2="8" y2="9.5"/><line x1="8" y1="11.5" x2="8" y2="11.6"/></svg>', color: 'var(--amber)',
      text: isZh?`客户信用占用 ${Math.round(usagePct)}%,建议催收 ${Sensitive.credit(stats.receivables)} 减压`:`Credit usage ${Math.round(usagePct)}%, suggest collecting ${Sensitive.credit(stats.receivables)}`
    });
    if (stats.overdueCount > 0) suggestions.push({
      icon: '⏰', color: 'var(--red)',
      text: isZh?`${stats.overdueCount} 张结算已逾期`:`${stats.overdueCount} settlement(s) overdue`
    });
    const trigger = customer.settlementPolicy?.trigger;
    if (trigger?.truckCount?.enabled) {
      const unsettled = deliveries.filter(d => d.transportStatus === 'signed' && !d.settlementId).length;
      if (unsettled > 0 && unsettled < trigger.truckCount.threshold) {
        suggestions.push({
          icon: '🚛', color: 'var(--blue)',
          text: isZh?`距下次结算还差 ${trigger.truckCount.threshold - unsettled} 车`:`${trigger.truckCount.threshold - unsettled} more truck(s) to trigger settlement`
        });
      }
    }
    
    // 最近订单(5 条最新)— Timeline 只在订单详情里
    const recentOrders = [...orders]
      .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
      .slice(0, 5);

    document.getElementById('hub-content').innerHTML = `
      <div class="ov-section">
        <div class="ov-section-head"><span>📊 ${isZh?'业务概览':'Business Overview'}</span></div>
        <div class="ov-section-body">
          <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:8px 32px; font-size:13px;">
            <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px dashed var(--border-1);">
              <span class="text-muted">${isZh?'累计订单':'Total Orders'}</span>
              <span><span class="text-strong">${stats.orderCount}</span> ${isZh?'单':'orders'} · <span class="font-mono">${Sensitive.money(stats.totalOrderAmount)}</span></span>
            </div>
            <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px dashed var(--border-1);">
              <span class="text-muted">${isZh?'累计发货':'Total Shipped'}</span>
              <span><span class="text-strong">${totalShipped}</span> ${isZh?'车':'truck(s)'}</span>
            </div>
            <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px dashed var(--border-1);">
              <span class="text-muted">${isZh?'已结算':'Settled'}</span>
              <span class="font-mono">${Sensitive.money(stats.settledAmount)}</span>
            </div>
            <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px dashed var(--border-1);">
              <span class="text-muted">${isZh?'已收款':'Collected'}</span>
              <span class="font-mono text-emerald">${Sensitive.money(stats.paidAmount)}</span>
            </div>
          </div>
        </div>
      </div>

      ${suggestions.length > 0 ? `
        <div class="ov-section">
          <div class="ov-section-head"><span>💡 ${isZh?'智能建议':'Suggestions'}</span></div>
          <div class="ov-section-body">
            ${suggestions.map(s => `
              <div style="display:flex; gap:10px; padding:10px 12px; background:rgba(255,255,255,0.02); border-left:3px solid ${s.color}; border-radius:4px; margin-bottom:8px; font-size:12px;">
                <span style="color:${s.color}; font-size:14px;">${s.icon}</span>
                <span>${s.text}</span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <div class="ov-section">
        <div class="ov-section-head">
          <span>${Icon.clipboard(13)} ${isZh?'最近订单':'Recent Orders'}</span>
          <a href="javascript:void(0)" data-go-orders class="text-accent" style="font-size:11px; text-decoration:none;">${isZh?'查看全部 →':'View all →'}</a>
        </div>
        <div class="ov-section-body">
          ${recentOrders.length === 0 ? `<div class="text-muted" style="font-size:12px;">${isZh?'暂无订单':'No orders yet'}</div>` : recentOrders.map(o => {
            const statusBadge = _renderOrderStatusInline(o);
            return `
              <a href="${Router.href('order-detail',{id:o.id})}" style="display:block; padding:10px 12px; border-bottom:1px solid var(--border-1); text-decoration:none; color:inherit;" class="recent-order-row">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <div>
                    <span class="font-mono text-strong text-accent">${o.no}</span>
                    <span style="margin-left:8px;">${statusBadge}</span>
                  </div>
                  <span class="font-mono">${Sensitive.money(o.totalAmount)}</span>
                </div>
                <div class="text-muted" style="font-size:11px; margin-top:3px;">
                  ${Utils.formatDate(o.updatedAt || o.createdAt)} · ${(o.items || []).length} ${isZh?'个明细':'items'}
                </div>
              </a>
            `;
          }).join('')}
        </div>
      </div>
    `;

    document.querySelector('[data-go-orders]')?.addEventListener('click', () => {
      activeTab = 'orders';
      Router.replace('customer-detail', { id: customer.id }, { tab: activeTab });
      renderTabs(); renderTabContent();
    });
  }

  // ===== Tab 2: 订单(生命周期卡片)=====
  function renderOrdersTab() {
    const isZh = I18n.get() === 'zh-CN';
    if (orders.length === 0) {
      document.getElementById('hub-content').innerHTML = `
        <div class="coming-soon" style="padding:60px 20px; text-align:center;">
          <div style="font-size:32px; opacity:0.3; margin-bottom:12px;"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><rect x="3.5" y="3" width="9" height="11" rx="1.5"/><rect x="6" y="1.5" width="4" height="3" rx="0.5"/></svg></div>
          <div class="text-muted">${isZh?'该客户尚无订单':'No orders yet'}</div>
          <button class="btn btn-primary btn-sm" style="margin-top:16px;" data-action="new-order">+ ${isZh?'创建第一个订单':'Create First Order'}</button>
        </div>
      `;
      document.querySelector('[data-action="new-order"]')?.addEventListener('click', openNewOrder);
      return;
    }
    const sorted = [...orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    document.getElementById('hub-content').innerHTML = `
      <div style="display:flex; flex-direction:column; gap:10px;">
        ${sorted.map(o => renderOrderCard(o)).join('')}
      </div>
    `;
    document.querySelectorAll('[data-order-id]').forEach(el => {
      el.addEventListener('click', () => Router.go('order-detail', { id: el.dataset.orderId }));
    });
  }

  function renderOrderCard(o) {
    const isZh = I18n.get() === 'zh-CN';
    // 7 状态:draft / pending_price / pending_warehouse / preparing / shipped / settled / paid
    const steps = [
      { key:'created',  label: isZh?'已下单':'Ordered',   done: true },
      { key:'approved', label: isZh?'已审批':'Approved',  done: !['draft','pending_price','pending_finance','cancelled'].includes(o.status) },
      { key:'shipped',  label: isZh?'已发货':'Shipped',   done: ['shipped','settled','paid'].includes(o.status) },
      { key:'settled',  label: isZh?'已结算':'Settled',   done: ['settled','paid'].includes(o.status) },
      { key:'paid',     label: isZh?'已收款':'Paid',      done: ['paid'].includes(o.status) },
    ];

    // 收款进度
    const orderSettlements = settlements.filter(s => (s.salesOrderIds || []).includes(o.id));
    const paidPct = orderSettlements.length > 0
      ? Math.round(orderSettlements.reduce((s,x)=>s+(x.paidAmount||0),0) / Math.max(1, orderSettlements.reduce((s,x)=>s+(x.payableAmount||0),0)) * 100)
      : 0;
    
    const salesEmp = EmployeeRepo.find(o.salesId);
    const itemsCount = (o.items || []).length;
    const risk = o.stockShortage?.length > 0 ? 'stock' : (o.status === 'cancelled' ? 'cancel' : 'normal');
    const riskBadge = risk === 'stock' 
      ? `<span style="font-size:11px; color:var(--amber);">${Icon.warning(13)} ${isZh?'库存不足':'Stock short'}</span>`
      : risk === 'cancel'
        ? `<span style="font-size:11px; color:var(--text-3);">${Icon.x(13)} ${isZh?'已取消':'Cancelled'}</span>`
        : `<span style="font-size:11px; color:var(--emerald);">● ${isZh?'正常':'Normal'}</span>`;

    return `
      <div data-order-id="${o.id}" class="order-card" style="
        background: var(--bg-2);
        border: 1px solid var(--border-1);
        border-radius: 8px;
        padding: 14px 16px;
        cursor: pointer;
        transition: border-color 0.15s;
      " onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border-1)'">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div>
            <span class="font-mono text-strong" style="font-size:13px;">${o.no}</span>
            <span style="margin-left:10px;" class="font-mono">${Sensitive.money(o.totalAmount)}</span>
          </div>
          ${riskBadge}
        </div>
        
        <div class="lifecycle-bar" style="display:flex; align-items:center; margin:12px 0; gap:0;">
          ${steps.map((s, idx) => `
            <div style="flex:1; display:flex; align-items:center; ${idx > 0 ? 'margin-left:-1px;' : ''}">
              <div style="
                width:18px; height:18px; border-radius:50%;
                background: ${s.done ? 'var(--emerald)' : 'var(--bg-3)'};
                border: 2px solid ${s.done ? 'var(--emerald)' : 'var(--border-1)'};
                display:flex; align-items:center; justify-content:center;
                font-size:10px; color:${s.done ? '#0f172a' : 'var(--text-3)'};
                flex-shrink:0;
              ">${s.done ? '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><polyline points="3,8 7,12 13,4"/></svg>' : ''}</div>
              ${idx < steps.length - 1 ? `<div style="flex:1; height:2px; background:${s.done && steps[idx+1].done ? 'var(--emerald)' : 'var(--border-1)'}; margin: 0 -1px;"></div>` : ''}
            </div>
          `).join('')}
        </div>
        <div style="display:flex; justify-content:space-between; font-size:10px; color:var(--text-3); margin-top:-4px;">
          ${steps.map(s => `<span style="flex:1; text-align:center;">${s.label}</span>`).join('')}
        </div>
        
        <div style="margin-top:14px; padding-top:10px; border-top:1px solid var(--border-1); display:flex; justify-content:space-between; font-size:11px; color:var(--text-3);">
          <span>${isZh?'创建于':'Created'} ${Utils.formatDate(o.createdAt)} · ${isZh?'销售':'Sales'}: ${salesEmp?.name || '-'}</span>
          <span>${itemsCount} ${isZh?'个明细':'item(s)'} · ${isZh?'已收':'Paid'} ${paidPct}%</span>
        </div>
      </div>
    `;
  }


  // ===== Tab 3: 价格历史 =====
  function renderPricesTab() {
    const isZh = I18n.get() === 'zh-CN';
    // 用 ProductService 拿带产品基准的分组(指导价/最低价/价格等级)
    const groups = ProductService.getPriceHistoryByCustomer(customer.id);

    if (groups.length === 0) {
      document.getElementById('hub-content').innerHTML = `
        <div class="coming-soon" style="padding:60px 20px; text-align:center;">
          <div style="font-size:32px; opacity:0.3; margin-bottom:12px;">💲</div>
          <div class="text-muted">${isZh?'该客户尚无成交记录':'No price history'}</div>
          <div class="text-muted" style="font-size:11px; margin-top:6px;">${isZh?'订单创建后,每条明细的价格会自动归入这里':'Order line prices appear here automatically'}</div>
        </div>
      `;
      return;
    }

    const totalRecords = groups.reduce((s, g) => s + g.items.length, 0);
    const lowMinCount = groups.reduce((s, g) => s + g.items.filter(i => i.priceLevel === 'below_min').length, 0);

    document.getElementById('hub-content').innerHTML = `
      <div class="ov-section">
        <div class="ov-section-head">
          <span>💲 ${isZh?'订单成交价格记录':'Price History'}</span>
          <span class="text-muted" style="font-size:11px;">${groups.length} ${isZh?'个产品':'products'} · ${totalRecords} ${isZh?'条记录':'records'}</span>
        </div>
      </div>
      ${lowMinCount > 0 ? `
        <div style="padding:10px 14px; background:rgba(248,113,113,0.06); border-left:3px solid var(--red); border-radius:4px; margin-bottom:14px; font-size:12px;">
          <span class="text-red"></span>
          ${isZh?`该客户共有 <span class="text-strong">${lowMinCount}</span> 笔低于最低价的成交,建议复盘价格策略`:`This customer has <span class="text-strong">${lowMinCount}</span> deals priced below minimum`}
        </div>
      ` : ''}
      ${groups.map(g => {
        const sorted = [...g.items].sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate));
        const prices = g.items.map(it => it.unitPrice).filter(p => p > 0);
        const minDealPrice = prices.length ? Math.min(...prices) : 0;
        const maxDealPrice = prices.length ? Math.max(...prices) : 0;
        const avgPrice = prices.length ? Math.round(prices.reduce((s, x) => s + x, 0) / prices.length) : 0;
        const lowMinInGroup = g.items.filter(i => i.priceLevel === 'below_min').length;

        return `
          <div class="ov-section">
            <div class="ov-section-head">
              <span><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M2 5 L8 2 L14 5 L8 8 Z"/><path d="M2 5 V11 L8 14 V8"/><path d="M14 5 V11 L8 14"/></svg> <a href="${Router.href('product-detail',{id:g.productId})}" style="color:var(--text-1); text-decoration:none;">${g.productName}</a>${g.spec ? '<span class="text-muted" style="margin-left:6px;">' + g.spec + '</span>' : ''}</span>
              <span class="text-muted" style="font-size:11px;">${g.items.length} ${isZh?'笔':'deals'}</span>
            </div>
            ${(g.guidePrice > 0 || g.minPrice > 0) ? `
              <div style="padding:8px 14px; background:rgba(74,222,128,0.04); display:flex; gap:18px; font-size:11px; border-bottom:1px solid var(--border-1);">
                <span class="text-muted">${isZh?'基准':'Baseline'}:</span>
                ${g.guidePrice > 0 ? `<span><span class="text-muted">${isZh?'指导价':'Guide'}</span> <span class="font-mono text-emerald">${Utils.formatMoney(g.guidePrice)}</span></span>` : ''}
                ${g.minPrice > 0 ? `<span><span class="text-muted">${isZh?'最低价':'Min'}</span> <span class="font-mono text-amber">${Utils.formatMoney(g.minPrice)}</span></span>` : ''}
                ${lowMinInGroup > 0 ? `<span style="margin-left:auto;"><span class="text-red">${lowMinInGroup} ${isZh?'笔异常':'below min'}</span></span>` : ''}
              </div>
            ` : ''}
            <div style="overflow-x:auto;">
              <table style="width:100%; font-size:12px; border-collapse:collapse;">
                <thead>
                  <tr style="background:var(--bg-3); color:var(--text-3); text-transform:uppercase; font-size:11px;">
                    <th style="text-align:left; padding:8px 12px;">${isZh?'日期':'Date'}</th>
                    <th style="text-align:left; padding:8px 12px;">${isZh?'订单号':'Order No.'}</th>
                    <th style="text-align:right; padding:8px 12px;">${isZh?'数量':'Qty'}</th>
                    <th style="text-align:right; padding:8px 12px;">${isZh?'单价':'Unit Price'}</th>
                    <th style="text-align:left; padding:8px 12px;">${isZh?'级别':'Level'}</th>
                    <th style="text-align:left; padding:8px 12px;">${isZh?'销售':'Sales'}</th>
                  </tr>
                </thead>
                <tbody>
                  ${sorted.map(h => {
                    const sales = EmployeeRepo.find(h.salesId);
                    const color = ProductService.priceLevelColor(h.priceLevel);
                    const icon = h.priceLevel === 'below_min' ? '' :
                                 h.priceLevel === 'below_guide' ? '' :
                                 h.priceLevel === 'over_guide' ? '' : '';
                    return `
                      <tr style="border-bottom:1px solid var(--border-1); ${h.priceLevel === 'below_min' ? 'background:rgba(248,113,113,0.03);' : ''}">
                        <td style="padding:8px 12px;" class="font-mono text-muted">${Utils.formatDate(h.orderDate)}</td>
                        <td style="padding:8px 12px;">
                          <a href="${Router.href('order-detail',{id:h.orderId})}" class="font-mono text-accent" style="text-decoration:none;">${h.orderNo}</a>
                        </td>
                        <td style="padding:8px 12px; text-align:right;" class="font-mono">${h.qty} ${g.unit || ''}</td>
                        <td style="padding:8px 12px; text-align:right;" class="font-mono text-strong" style="color:${color};">
                          ${Utils.formatMoney(h.unitPrice)}
                        </td>
                        <td style="padding:8px 12px;">
                          ${icon ? `<span style="font-size:13px;">${icon}</span>` : ''}
                          <span class="text-muted" style="font-size:11px; margin-left:4px;">${ProductService.priceLevelLabel(h.priceLevel)}</span>
                        </td>
                        <td style="padding:8px 12px;" class="text-muted">${sales?.name || '-'}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
            <div style="padding:10px 14px; background:var(--bg-3); display:flex; gap:24px; font-size:11px; color:var(--text-2);">
              <span>${isZh?'最低成交':'Min Deal'} <span class="font-mono">${Utils.formatMoney(minDealPrice)}</span></span>
              <span>${isZh?'最高成交':'Max Deal'} <span class="font-mono">${Utils.formatMoney(maxDealPrice)}</span></span>
              <span>${isZh?'平均':'Avg'} <span class="font-mono text-strong">${Utils.formatMoney(avgPrice)}</span></span>
              ${maxDealPrice > 0 ? `<span style="margin-left:auto;">${isZh?'价差':'Range'} <span class="font-mono">${Math.round((maxDealPrice - minDealPrice) / maxDealPrice * 100)}%</span></span>` : ''}
            </div>
          </div>
        `;
      }).join('')}
    `;
  }

  /** 从该客户所有订单的 items 反推价格历史 */
  function _buildPriceHistory() {
    const out = [];
    orders.forEach(o => {
      if (o.status === 'cancelled') return;
      (o.items || []).forEach(it => {
        if (!it.materialId || !it.unitPrice) return;
        out.push({
          materialId:   it.materialId,
          materialName: it.materialName || (MaterialRepo.find(it.materialId) || {}).name || '-',
          spec:         it.spec || (MaterialRepo.find(it.materialId) || {}).spec || '',
          unit:         it.unit || (MaterialRepo.find(it.materialId) || {}).unit || '',
          qty:          it.qty || it.quantity || 0,
          unitPrice:    it.unitPrice,
          orderId:      o.id,
          orderNo:      o.no,
          orderDate:    o.createdAt,
          salesId:      o.salesId,
        });
      });
    });
    return out;
  }

  // ===== Tab 4: 财务策略 =====
  function renderPolicyTab() {
    const isZh = I18n.get() === 'zh-CN';
    const policy = customer.settlementPolicy || {};
    const lim = policy.credit?.limit || customer.creditLimit || 0;
    const stats = computeStats();
    const used = stats.exposure;
    const pct = lim > 0 ? Math.min(999, Math.round(used / lim * 100)) : 0;
    const pctColor = pct > 90 ? 'var(--red)' : pct > 70 ? 'var(--amber)' : 'var(--emerald)';

    const trigger = policy.trigger || {};
    const action = policy.credit?.action || 'warn_force';
    const actionLabels = {
      auto_lock:  { zh:'自动锁定发货', en:'Auto-lock shipment' },
      warn_force: { zh:'警告但允许强制', en:'Warn, allow override' },
      warn_only:  { zh:'仅警告',         en:'Warn only' },
    };

    document.getElementById('hub-content').innerHTML = `
      <div class="ov-section">
        <div class="ov-section-head">
          <span>${Icon.money(13)} ${isZh?'结算触发规则':'Settlement Trigger'}</span>
          ${Perm.button(`<button class="btn btn-sm btn-ghost" data-edit-policy>${isZh?'编辑策略':'Edit Policy'}</button>`, 'customerCreditEdit')}
        </div>
        <div class="ov-section-body">
          <div style="display:grid; gap:10px; font-size:13px;">
            <div style="display:flex; gap:14px; align-items:center; padding:8px 12px; background:${trigger.truckCount?.enabled ? 'rgba(74,222,128,0.04)' : 'var(--bg-3)'}; border-radius:4px;">
              <span style="font-size:16px;">${trigger.truckCount?.enabled ? '☑' : '☐'}</span>
              <span style="flex:1;">${isZh?'车次条件':'Truck count'} ${trigger.truckCount?.enabled ? `<span class="text-strong">每 ${trigger.truckCount.threshold} 车自动结算</span>` : `<span class="text-muted">${isZh?'未启用':'Disabled'}</span>`}</span>
            </div>
            <div style="display:flex; gap:14px; align-items:center; padding:8px 12px; background:${trigger.days?.enabled ? 'rgba(74,222,128,0.04)' : 'var(--bg-3)'}; border-radius:4px;">
              <span style="font-size:16px;">${trigger.days?.enabled ? '☑' : '☐'}</span>
              <span style="flex:1;">${isZh?'时间条件':'Days'} ${trigger.days?.enabled ? `<span class="text-strong">距首笔签收 ${trigger.days.threshold} 天</span>` : `<span class="text-muted">${isZh?'未启用':'Disabled'}</span>`}</span>
            </div>
            <div style="display:flex; gap:14px; align-items:center; padding:8px 12px; background:${trigger.amount?.enabled ? 'rgba(74,222,128,0.04)' : 'var(--bg-3)'}; border-radius:4px;">
              <span style="font-size:16px;">${trigger.amount?.enabled ? '☑' : '☐'}</span>
              <span style="flex:1;">${isZh?'金额条件':'Amount'} ${trigger.amount?.enabled ? `<span class="text-strong">累计超过 ${Utils.formatMoney(trigger.amount.threshold)}</span>` : `<span class="text-muted">${isZh?'未启用':'Disabled'}</span>`}</span>
            </div>
            <div style="font-size:11px; color:var(--text-3); padding-left:38px;">
              ${isZh?'组合方式':'Mode'}: ${trigger.combineMode === 'all' ? (isZh?'所有条件都满足':'All conditions') : (isZh?'任一条件满足即触发':'Any condition')}
            </div>
          </div>
        </div>
      </div>

      <div class="ov-section">
        <div class="ov-section-head"><span><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><polygon points="8,1.5 14.5,4.5 1.5,4.5"/><line x1="3" y1="6.5" x2="3" y2="12.5"/><line x1="6.5" y1="6.5" x2="6.5" y2="12.5"/><line x1="9.5" y1="6.5" x2="9.5" y2="12.5"/><line x1="13" y1="6.5" x2="13" y2="12.5"/><line x1="1.5" y1="14" x2="14.5" y2="14"/></svg> ${isZh?'信用控制':'Credit Control'}</span></div>
        <div class="ov-section-body">
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:14px 30px; font-size:13px;">
            <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px dashed var(--border-1);">
              <span class="text-muted">${isZh?'信用额度':'Credit Limit'}</span>
              <span class="font-mono text-strong">${Sensitive.credit(lim)}</span>
            </div>
            <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px dashed var(--border-1);">
              <span class="text-muted">${isZh?'应收款项':'Receivables'}</span>
              <span class="font-mono">${Sensitive.credit(stats.receivables)}</span>
            </div>
            <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px dashed var(--border-1);">
              <span class="text-muted">${isZh?'逾期金额':'Overdue'}</span>
              <span class="font-mono" style="color:${stats.overdue > 0 ? 'var(--red)' : 'var(--text-2)'};">${Sensitive.credit(stats.overdue)}</span>
            </div>
            <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px dashed var(--border-1);">
              <span class="text-muted">${isZh?'当前占用':'Exposure'}</span>
              <span class="font-mono text-strong" style="color:${pctColor};">${Sensitive.credit(used)} (${pct}%)</span>
            </div>
          </div>
          <div style="margin-top:14px;">
            <div style="height:8px; background:var(--bg-3); border-radius:4px; overflow:hidden;">
              <div style="height:100%; width:${Math.min(pct, 100)}%; background:${pctColor}; transition: width 0.3s;"></div>
            </div>
            <div style="margin-top:6px; font-size:11px; color:${pctColor};">
              ${pct > 90 ? (isZh?'危险':'Risky') : pct > 70 ? (isZh?'偏高':'High') : (isZh?'健康':'Healthy')}
            </div>
          </div>
          <div style="margin-top:18px; padding-top:14px; border-top:1px solid var(--border-1);">
            <div class="text-muted" style="font-size:12px; margin-bottom:8px;">${isZh?'超额处理策略':'Over-limit action'}:</div>
            <div style="display:flex; flex-direction:column; gap:6px; font-size:12px;">
              ${['auto_lock','warn_force','warn_only'].map(a => `
                <label style="display:flex; align-items:center; gap:8px; padding:6px 10px; border-radius:4px; ${action===a ? 'background:rgba(74,222,128,0.06); border-left:3px solid var(--emerald);' : ''}">
                  <input type="radio" name="overlim-action" ${action===a ? 'checked' : ''} disabled>
                  <span>${isZh ? actionLabels[a].zh : actionLabels[a].en}</span>
                </label>
              `).join('')}
            </div>
          </div>
        </div>
      </div>

      <div class="ov-section">
        <div class="ov-section-head"><span>💳 ${isZh?'付款条件':'Payment Terms'}</span></div>
        <div class="ov-section-body">
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px 30px; font-size:13px;">
            <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px dashed var(--border-1);">
              <span class="text-muted">${isZh?'账期':'Payment Days'}</span>
              <span>${policy.payment?.days || 30} ${isZh?'天':'days'}</span>
            </div>
            <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px dashed var(--border-1);">
              <span class="text-muted">${isZh?'默认收款方式':'Default Method'}</span>
              <span>${(typeof tEnum !== 'undefined' && policy.payment?.method) ? tEnum('payment','methodEnum',policy.payment.method) : (isZh?'银行转账':'Bank Transfer')}</span>
            </div>
            <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px dashed var(--border-1);">
              <span class="text-muted">${isZh?'自动催收':'Auto Remind'}</span>
              <span>${policy.payment?.autoRemind !== false ? (isZh?`逾期 ${policy.payment?.remindAfter || 7} 天后`:`After ${policy.payment?.remindAfter || 7} days overdue`) : (isZh?'关闭':'Off')}</span>
            </div>
          </div>
        </div>
      </div>
    `;

    document.querySelector('[data-edit-policy]')?.addEventListener('click', openEditPolicyDialog);
  }

  // ===== Tab 5: 风险 =====
  function renderRiskTab() {
    const isZh = I18n.get() === 'zh-CN';
    const stats = computeStats();
    const lim = customer.settlementPolicy?.credit?.limit || customer.creditLimit || 0;
    const used = stats.exposure;
    const pct = lim > 0 ? Math.min(999, Math.round(used / lim * 100)) : 0;
    const remain = Math.max(0, lim - used);
    
    const overdueStls = settlements.filter(s => {
      if (s.status === 'paid') return false;
      if (!s.dueDate) return false;
      return new Date(s.dueDate).getTime() < Date.now();
    });
    const forcedDeliveries = deliveries.filter(d => d.creditCheckResult?.forced);

    document.getElementById('hub-content').innerHTML = `
      <div class="ov-section">
        <div class="ov-section-head"><span><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><polygon points="8,1.5 14.5,4.5 1.5,4.5"/><line x1="3" y1="6.5" x2="3" y2="12.5"/><line x1="6.5" y1="6.5" x2="6.5" y2="12.5"/><line x1="9.5" y1="6.5" x2="9.5" y2="12.5"/><line x1="13" y1="6.5" x2="13" y2="12.5"/><line x1="1.5" y1="14" x2="14.5" y2="14"/></svg> ${isZh?'信用风险':'Credit Risk'}</span></div>
        <div class="ov-section-body">
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px 30px; font-size:13px;">
            <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px dashed var(--border-1);">
              <span class="text-muted">${isZh?'信用额度':'Credit Limit'}</span>
              <span class="font-mono">${Sensitive.credit(lim)}</span>
            </div>
            <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px dashed var(--border-1);">
              <span class="text-muted">${isZh?'使用率':'Usage'}</span>
              <span class="font-mono text-strong">${pct}%</span>
            </div>
            <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px dashed var(--border-1);">
              <span class="text-muted">${isZh?'应收款项':'Receivables'}</span>
              <span class="font-mono">${Sensitive.credit(stats.receivables)}</span>
            </div>
            <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px dashed var(--border-1);">
              <span class="text-muted">${isZh?'逾期金额':'Overdue'}</span>
              <span class="font-mono" style="color:${stats.overdue > 0 ? 'var(--red)' : 'var(--text-2)'};">${Sensitive.credit(stats.overdue)}</span>
            </div>
            <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px dashed var(--border-1);">
              <span class="text-muted">${isZh?'距锁定阈值':'Till lock'}</span>
              <span class="font-mono ${remain < lim * 0.1 ? 'text-red' : ''}">${Utils.formatMoney(remain)}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="ov-section">
        <div class="ov-section-head"><span>⏰ ${isZh?'逾期风险':'Overdue Risk'}</span></div>
        <div class="ov-section-body">
          ${overdueStls.length === 0
            ? `<div class="text-muted" style="font-size:12px;">${isZh?'<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><polyline points="3,8 7,12 13,4"/></svg> 无逾期结算':'<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><polyline points="3,8 7,12 13,4"/></svg> No overdue'}</div>`
            : overdueStls.map(s => {
                const days = Math.floor((Date.now() - new Date(s.dueDate).getTime()) / 86400000);
                return `
                  <div style="padding:10px 12px; background:rgba(248,113,113,0.06); border-left:3px solid var(--red); border-radius:4px; margin-bottom:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                      <a href="${Router.href('settlement-detail',{id:s.id})}" class="font-mono text-strong text-accent" style="text-decoration:none;">${s.no}</a>
                      <span class="font-mono text-red">${Utils.formatMoney(s.unpaidAmount)}</span>
                    </div>
                    <div class="text-muted" style="font-size:11px; margin-top:3px;">${isZh?'逾期':'Overdue'} ${days} ${isZh?'天':'days'} · ${isZh?'到期':'Due'} ${Utils.formatDate(s.dueDate)}</div>
                  </div>
                `;
              }).join('')}
        </div>
      </div>

      ${forcedDeliveries.length > 0 ? `
        <div class="ov-section">
          <div class="ov-section-head"><span><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5.5 7 V5 a2.5 2.5 0 0 1 5 0"/></svg> ${isZh?'强制发货历史':'Forced Delivery History'}</span></div>
          <div class="ov-section-body">
            ${forcedDeliveries.map(d => `
              <div style="padding:10px 12px; background:rgba(251,146,60,0.06); border-left:3px solid var(--amber); border-radius:4px; margin-bottom:8px;">
                <div style="display:flex; justify-content:space-between;">
                  <a href="${Router.href('logistics-detail',{id:d.id})}" class="font-mono text-strong text-accent" style="text-decoration:none;">${d.no}</a>
                  <span class="text-muted font-mono" style="font-size:11px;">${Utils.formatDate(d.deliveryDate)}</span>
                </div>
                <div class="text-muted" style="font-size:11px; margin-top:3px;">${isZh?'信用超额强制放行':'Credit override'}</div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    `;
  }

  // ===== Tab 6: 附件 =====
  function renderFilesTab() {
    const isZh = I18n.get() === 'zh-CN';
    const allFiles = _collectCustomerAttachments();
    
    if (allFiles.length === 0) {
      document.getElementById('hub-content').innerHTML = `
        <div class="coming-soon" style="padding:60px 20px; text-align:center;">
          <div style="font-size:32px; opacity:0.3; margin-bottom:12px;"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M11 4.5 L5.5 10 a2.5 2.5 0 0 0 3.5 3.5 L14 8 a4 4 0 0 0 -5.5 -5.5 L3 8 a5 5 0 0 0 7 7 L14.5 10.5"/></svg></div>
          <div class="text-muted">${isZh?'暂无附件':'No attachments'}</div>
        </div>
      `;
      return;
    }
    
    document.getElementById('hub-content').innerHTML = `
      <div class="ov-section">
        <div class="ov-section-head">
          <span><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M11 4.5 L5.5 10 a2.5 2.5 0 0 0 3.5 3.5 L14 8 a4 4 0 0 0 -5.5 -5.5 L3 8 a5 5 0 0 0 7 7 L14.5 10.5"/></svg> ${isZh?'所有附件':'All Attachments'}</span>
          <span class="text-muted" style="font-size:11px;">${allFiles.length} ${isZh?'个文件':'files'}</span>
        </div>
        <div class="ov-section-body">
          <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap:12px;">
            ${allFiles.map(f => `
              <div style="border:1px solid var(--border-1); border-radius:6px; padding:10px 12px; background:var(--bg-2); display:flex; gap:10px;">
                <div style="font-size:20px;">${f.icon || (f.type === 'image' ? '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><rect x="2" y="3" width="12" height="10" rx="1"/><circle cx="6" cy="7" r="1"/><polyline points="2,11 6,8 9,10 14,5"/></svg>' : '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M9 1.5 H4 a1.5 1.5 0 0 0 -1.5 1.5 V13 a1.5 1.5 0 0 0 1.5 1.5 H12 a1.5 1.5 0 0 0 1.5 -1.5 V5.5 Z"/><polyline points="9,1.5 9,5.5 13.5,5.5"/></svg>')}</div>
                <div style="flex:1; min-width:0;">
                  <div class="text-strong" style="font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${f.name}</div>
                  <div class="text-muted" style="font-size:10px;">${f._orderNo || ''} · ${_formatBytes(f.size || 0)}</div>
                  <div class="text-muted" style="font-size:10px; margin-top:2px;">${Utils.formatDate(f._ts)}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  /** 从订单 timeline 收集附件(只为 Files Tab 用)*/
  function _collectCustomerAttachments() {
    if (typeof OrderTimelineService === 'undefined') return [];
    const all = [];
    orders.forEach(o => {
      const events = OrderTimelineService.buildTimeline(o.id) || [];
      events.forEach(e => {
        (e.attachments || []).forEach(att => {
          all.push({ ...att, _ts: e.timestamp, _orderNo: o.no });
        });
      });
    });
    return all.sort((a, b) => new Date(b._ts) - new Date(a._ts));
  }

  function _countAttachments() {
    return _collectCustomerAttachments().length;
  }

  function _formatBytes(b) {
    if (b < 1024) return b + 'B';
    if (b < 1024*1024) return (b/1024).toFixed(0) + 'KB';
    return (b/1024/1024).toFixed(1) + 'MB';
  }

  // ===== 编辑客户基本资料 (4 段式,跟新增对齐) =====
  function openEditDialog() {
    const isZh = I18n.get() === 'zh-CN';
    const c = customer;
    const pay = c.settlementPolicy?.payment || {};
    const trig = c.settlementPolicy?.trigger || {};
    const accepted = pay.acceptedMethods || c.paymentMethods || ['cash', 'bank_transfer'];
    const isAccepted = (m) => accepted.includes(m);

    Modal.open({
      title: isZh?'编辑客户':'Edit Customer',
      width: 640,
      content: `
        <style>
          .cust-form fieldset { border:1px solid var(--border-1); border-radius:6px; padding:14px 16px; margin-bottom:14px; }
          .cust-form legend { padding:0 8px; font-size:11px; color:var(--text-3); text-transform:uppercase; letter-spacing:0.6px; }
          .cust-form .grid-2 { display:grid; grid-template-columns: 1fr 1fr; gap:12px; }
          .cust-form .grid-3 { display:grid; grid-template-columns: 1fr 1fr 1fr; gap:12px; }
          .cust-form .form-row { margin-bottom:10px; }
          .cust-form .form-row:last-child { margin-bottom:0; }
          .cust-form .checkbox-row { display:flex; flex-wrap:wrap; gap:14px; padding:8px 0; }
          .cust-form .checkbox-row label { display:flex; align-items:center; gap:5px; font-size:12px; color:var(--text-2); cursor:pointer; }
          .cust-form .checkbox-row input[type="checkbox"] { width:14px; height:14px; cursor:pointer; }
          .cust-form .hint { font-size:11px; color:var(--text-4); margin-top:4px; }
        </style>
        <div class="cust-form">

          <fieldset>
            <legend>${isZh?'1. 基础信息':'1. Basic Info'}</legend>
            <div class="form-row">
              <label class="form-label">${isZh?'客户名称':'Name'} <span class="text-red">*</span></label>
              <input type="text" class="input w-full" id="ec-name" value="${c.name || ''}">
            </div>
            <div class="grid-2">
              <div class="form-row">
                <label class="form-label">${isZh?'客户编号':'Code'}</label>
                <input type="text" class="input w-full" value="${c.code || ''}" disabled style="opacity:0.6;">
              </div>
              <div class="form-row">
                <label class="form-label">${isZh?'等级':'Grade'}</label>
                <select class="input w-full" id="ec-grade">
                  ${['A级','B级','C级','D级'].map(g => `<option value="${g}" ${(c.creditGrade||c.grade)===g?'selected':''}>${g}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="grid-2">
              <div class="form-row">
                <label class="form-label">${isZh?'联系人':'Contact'}</label>
                <input type="text" class="input w-full" id="ec-contactName" value="${c.contactName || ''}">
              </div>
              <div class="form-row">
                <label class="form-label">${isZh?'电话':'Phone'}</label>
                <input type="text" class="input w-full" id="ec-phone" value="${c.phone || ''}">
              </div>
            </div>
            <div class="form-row">
              <label class="form-label">${isZh?'地址':'Address'}</label>
              <input type="text" class="input w-full" id="ec-address" value="${c.address || ''}">
            </div>
            <div class="form-row">
              <label class="form-label">${isZh?'客户类型':'Type'}</label>
              <select class="input w-full" id="ec-type">
                ${[
                  ['factory', isZh?'木材厂':'Factory'],
                  ['furniture', isZh?'家具厂':'Furniture'],
                  ['distributor', isZh?'经销商':'Distributor'],
                  ['retail', isZh?'零售':'Retail'],
                  ['other', isZh?'其他':'Other'],
                ].map(([v,l]) => `<option value="${v}" ${c.customerType===v?'selected':''}>${l}</option>`).join('')}
              </select>
            </div>
          </fieldset>

          <fieldset>
            <legend>${isZh?'2. 付款条件':'2. Payment Methods'}</legend>
            <div class="form-row">
              <label class="form-label">${isZh?'接受的付款方式':'Accepted Methods'}</label>
              <div class="checkbox-row">
                <label><input type="checkbox" name="ec-payMethod" value="cash" ${isAccepted('cash')?'checked':''}> ${isZh?'现金':'Cash'}</label>
                <label><input type="checkbox" name="ec-payMethod" value="bank_transfer" ${isAccepted('bank_transfer')?'checked':''}> ${isZh?'银行转账':'Bank Transfer'}</label>
                <label><input type="checkbox" name="ec-payMethod" value="check" ${isAccepted('check')?'checked':''}> ${isZh?'支票':'Check'}</label>
                <label><input type="checkbox" name="ec-payMethod" value="acceptance_bill" ${isAccepted('acceptance_bill')?'checked':''}> ${isZh?'承兑汇票':'Acceptance'}</label>
              </div>
            </div>
            <div class="grid-2">
              <div class="form-row">
                <label class="form-label">${isZh?'首选方式':'Preferred'}</label>
                <select class="input w-full" id="ec-preferredMethod">
                  ${['bank_transfer','cash','check','acceptance_bill'].map(m => {
                    const labels = { bank_transfer: isZh?'银行转账':'Bank Transfer', cash: isZh?'现金':'Cash', check: isZh?'支票':'Check', acceptance_bill: isZh?'承兑汇票':'Acceptance' };
                    return `<option value="${m}" ${(pay.method||'bank_transfer')===m?'selected':''}>${labels[m]}</option>`;
                  }).join('')}
                </select>
              </div>
              <div class="form-row">
                <label class="form-label">${isZh?'账期(天)':'Payment Days'}</label>
                <input type="number" class="input w-full" id="ec-paymentDays" value="${pay.days || c.paymentDays || 30}" min="0" max="365">
              </div>
            </div>
          </fieldset>

          <fieldset>
            <legend>${isZh?'3. 备注':'3. Remark'}</legend>
            <div class="form-row">
              <textarea class="input w-full" id="ec-remark" rows="2">${c.remark || ''}</textarea>
              <div class="hint">${isZh?'结算触发规则和信用额度在「财务策略」中单独配置(需财务权限)':'Trigger rules & credit limit are in "Finance Policy" (Finance only)'}</div>
            </div>
          </fieldset>

        </div>
      `,
      buttons: [
        { label: isZh?'取消':'Cancel' },
        { label: isZh?'保存':'Save', primary: true, onClick: () => {
          const name = document.getElementById('ec-name').value.trim();
          if (!name) { Toast.warning(isZh?'请填写客户名称':'Name required'); return false; }
          const acceptedMethods = Array.from(document.querySelectorAll('input[name="ec-payMethod"]:checked')).map(c => c.value);
          const newPay = {
            ...pay,
            acceptedMethods,
            method: document.getElementById('ec-preferredMethod').value,
            days: Number(document.getElementById('ec-paymentDays').value) || 30,
          };
          const patch = {
            name,
            creditGrade: document.getElementById('ec-grade').value,
            contactName: document.getElementById('ec-contactName').value.trim(),
            phone: document.getElementById('ec-phone').value.trim(),
            address: document.getElementById('ec-address').value.trim(),
            customerType: document.getElementById('ec-type').value,
            remark: document.getElementById('ec-remark').value.trim(),
            paymentMethods: acceptedMethods,         // 兼容老字段
            paymentDays: newPay.days,                // 兼容老字段
            settlementPolicy: { ...(c.settlementPolicy||{}), payment: newPay },
            updatedAt: Utils.now(),
          };
          _saveCustomerWithAudit(c, patch, isZh?'基本资料更新':'Basic info updated');
        }},
      ],
    });
  }

  // ===== 编辑财务策略 =====
  function openEditPolicyDialog() {
    const isZh = I18n.get() === 'zh-CN';
    const c = customer;
    const p = c.settlementPolicy || {};
    const trig = p.trigger || {};
    const lim = p.credit?.limit || c.creditLimit || 0;
    const action = p.credit?.action || 'warn_force';
    const pay = p.payment || {};

    Modal.open({
      title: isZh?'编辑财务策略':'Edit Finance Policy',
      width: 580,
      content: `
        <div style="display:grid; gap:16px;">
          <div>
            <div class="text-strong" style="font-size:13px; margin-bottom:8px;">${isZh?'结算触发规则':'Trigger Rules'}</div>
            <div style="display:flex; flex-direction:column; gap:8px;">
              <div style="display:flex; align-items:center; gap:10px; padding:8px 12px; background:var(--bg-3); border-radius:4px;">
                <input type="checkbox" id="ep-truck-en" ${trig.truckCount?.enabled?'checked':''}>
                <span style="flex:1; font-size:12px;">${isZh?'车次条件':'Truck Count'} ${isZh?'每':'every'}
                  <input type="number" id="ep-truck-th" class="input" value="${trig.truckCount?.threshold||3}" min="1" max="20" style="width:60px; display:inline-block;">
                  ${isZh?'车':'truck(s)'}</span>
              </div>
              <div style="display:flex; align-items:center; gap:10px; padding:8px 12px; background:var(--bg-3); border-radius:4px;">
                <input type="checkbox" id="ep-days-en" ${trig.days?.enabled?'checked':''}>
                <span style="flex:1; font-size:12px;">${isZh?'时间条件':'Days'} ${isZh?'距首笔签收':'from first sign'}
                  <input type="number" id="ep-days-th" class="input" value="${trig.days?.threshold||30}" min="1" max="365" style="width:60px; display:inline-block;">
                  ${isZh?'天':'days'}</span>
              </div>
              <div style="display:flex; align-items:center; gap:10px; padding:8px 12px; background:var(--bg-3); border-radius:4px;">
                <input type="checkbox" id="ep-amt-en" ${trig.amount?.enabled?'checked':''}>
                <span style="flex:1; font-size:12px;">${isZh?'金额条件':'Amount'} ${isZh?'累计超过 $':'over $'}
                  <input type="number" id="ep-amt-th" class="input" value="${((trig.amount?.threshold || 50000) / 100).toFixed(2)}" min="0" step="100" style="width:100px; display:inline-block;">
                  </span>
              </div>
            </div>
            <div style="margin-top:8px; font-size:11px; color:var(--text-3); padding-left:8px;">
              ${isZh?'组合方式':'Combine'}: 
              <label style="margin-left:8px;"><input type="radio" name="ep-combine" value="any" ${(trig.combineMode||'any')==='any'?'checked':''}> ${isZh?'任一满足':'Any'}</label>
              <label style="margin-left:10px;"><input type="radio" name="ep-combine" value="all" ${trig.combineMode==='all'?'checked':''}> ${isZh?'全部满足':'All'}</label>
            </div>
          </div>

          <div>
            <div class="text-strong" style="font-size:13px; margin-bottom:8px;">${isZh?'信用控制':'Credit'}</div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
              <div>
                <label class="form-label">${isZh?'信用额度':'Limit'}</label>
                <div style="position:relative;">
                  <span style="position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--text-3); font-size:13px; pointer-events:none;">$</span>
                  <input type="number" class="input w-full" id="ep-credit-limit" value="${(lim/100).toFixed(2)}" min="0" step="100" style="padding-left:24px;">
                </div>
              </div>
              <div>
                <label class="form-label">${isZh?'超额处理':'Over-limit Action'}</label>
                <select class="input w-full" id="ep-credit-action">
                  <option value="auto_lock" ${action==='auto_lock'?'selected':''}>${isZh?'自动锁定发货':'Auto-lock'}</option>
                  <option value="warn_force" ${action==='warn_force'?'selected':''}>${isZh?'警告但允许强制':'Warn, allow'}</option>
                  <option value="warn_only" ${action==='warn_only'?'selected':''}>${isZh?'仅警告':'Warn only'}</option>
                </select>
              </div>
            </div>
          </div>

          <div>
            <div class="text-strong" style="font-size:13px; margin-bottom:8px;">${isZh?'付款条件':'Payment'}</div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
              <div>
                <label class="form-label">${isZh?'账期(天)':'Days'}</label>
                <input type="number" class="input w-full" id="ep-pay-days" value="${pay.days||30}" min="0" max="365">
              </div>
              <div>
                <label class="form-label">${isZh?'默认方式':'Method'}</label>
                <select class="input w-full" id="ep-pay-method">
                  ${['bank_transfer','cash','check','acceptance_bill','other'].map(m => {
                    const labels = {
                      bank_transfer: isZh?'银行转账':'Bank Transfer',
                      cash: isZh?'现金':'Cash',
                      check: isZh?'支票':'Check',
                      acceptance_bill: isZh?'承兑汇票':'Acceptance',
                      other: isZh?'其他':'Other',
                    };
                    return `<option value="${m}" ${pay.method===m?'selected':''}>${labels[m]}</option>`;
                  }).join('')}
                </select>
              </div>
            </div>
          </div>
        </div>
      `,
      buttons: [
        { label: isZh?'取消':'Cancel' },
        { label: isZh?'保存策略':'Save', primary: true, onClick: () => {
          const combine = document.querySelector('input[name="ep-combine"]:checked')?.value || 'any';
          const newLim = Utils.dollarsToCents(document.getElementById('ep-credit-limit').value);
          const newAction = document.getElementById('ep-credit-action').value;
          const newPolicy = {
            ...p,
            trigger: {
              truckCount: { enabled: document.getElementById('ep-truck-en').checked, threshold: Number(document.getElementById('ep-truck-th').value) || 3 },
              days:       { enabled: document.getElementById('ep-days-en').checked,  threshold: Number(document.getElementById('ep-days-th').value)  || 30 },
              amount:     { enabled: document.getElementById('ep-amt-en').checked,   threshold: Utils.dollarsToCents(document.getElementById('ep-amt-th').value) || 50000 },
              combineMode: combine,
            },
            credit: {
              ...(p.credit || {}),
              limit: newLim,
              action: newAction,
            },
            payment: {
              ...pay,
              days: Number(document.getElementById('ep-pay-days').value) || 30,
              method: document.getElementById('ep-pay-method').value,
            },
          };
          const patch = {
            settlementPolicy: newPolicy,
            creditLimit: newLim,        // 同步老字段
            updatedAt: Utils.now(),
          };
          // 收集变更字段(用于审计)
          const changes = [];
          if ((p.credit?.limit || c.creditLimit || 0) !== newLim) {
            changes.push({ field: 'creditLimit', fieldLabel: isZh?'信用额度':'Credit Limit', oldValue: p.credit?.limit || c.creditLimit || 0, newValue: newLim });
          }
          if ((p.credit?.action || 'warn_force') !== newAction) {
            changes.push({ field: 'overLimitAction', fieldLabel: isZh?'超额策略':'Over-limit Action', oldValue: p.credit?.action || 'warn_force', newValue: newAction });
          }
          _saveCustomerWithAudit(c, patch, isZh?'财务策略更新':'Finance policy updated', changes, 'policy_updated');
          // 触发 creditEvent(如果额度变化)
          if (changes.find(ch => ch.field === 'creditLimit') && window.FinanceService?.logCreditEvent) {
            FinanceService.logCreditEvent({
              customerId: c.id,
              type: 'limit_changed',
              oldValue: changes.find(ch => ch.field === 'creditLimit').oldValue,
              newValue: newLim,
              reason: isZh?'手动调整信用额度':'Manual credit limit change',
              relatedType: 'customer', relatedId: c.id,
            }, Session.currentUserId());
          }
        }},
      ],
    });
  }

  function _saveCustomerWithAudit(c, patch, reason, changes, action) {
    CustomerRepo.update(c.id, patch);
    if (window.AuditService?.log) {
      AuditService.log({
        entityType: 'customer',
        entityId: c.id,
        action: action || 'update',
        changes: changes || [],
        reason: reason,
      });
    }
    EventBus.emit('customer.updated', { id: c.id, patch });
    Toast.success(reason);
    // 重新加载
    customer = CustomerRepo.find(c.id);
    render();
  }

  function openNewOrder() {
    Router.go('order-new', {}, { customerId: customer.id });
  }

  return { init };
})();

window.CustomerHubModule = CustomerHubModule;
