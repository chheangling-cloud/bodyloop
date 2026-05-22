/**
 * 订单中心(v2)
 * @module modules/orderCenter
 *
 * 替代原"销售订单"列表页。
 * 核心:Tab 分阶段聚合,以订单为容器。
 *
 * Tab 数据源映射:
 *   全部:        所有订单 + 未转单的报价
 *   报价中:      quotations(status ≠ accepted/rejected)
 *   待确认:      salesOrders.status = draft
 *   生产中:      salesOrders.status ∈ {confirmed, in_production, preparing}
 *   发货中:      salesOrders.status ∈ {partial_shipped, shipped}
 *   待结算:      有 grouped/manual_pending 发货的订单
 *   待收款:      salesOrders.status = settling
 *   已完成:      salesOrders.status = completed
 *   异常:        信用强制 / 库存强制 / 逾期
 */

const OrderCenterModule = (function () {
  'use strict';

  let dataTable = null;
  let activeTab = 'all';
  let cachedRows = null;
  let showArchived = false;  // 是否显示归档订单

  // Tab 列表
  const TABS = [
    { key: 'all',              labelKey: 'orderCenter.tabAll' },
    { key: 'pendingConfirm',   labelKey: 'orderCenter.tabPendingConfirm' },
    { key: 'producing',        labelKey: 'orderCenter.tabProducing' },
    { key: 'shipping',         labelKey: 'orderCenter.tabShipping' },
    { key: 'pendingSettle',    labelKey: 'orderCenter.tabPendingSettle' },
    { key: 'pendingPayment',   labelKey: 'orderCenter.tabPendingPayment' },
    { key: 'completed',        labelKey: 'orderCenter.tabCompleted' },
    { key: 'exception',        labelKey: 'orderCenter.tabException' },
  ];

  function init(ctx) {
    // 从 router ctx 读 tab(支持深度链接)
    const urlTab = ctx?.query?.tab;
    if (urlTab && TABS.some(t => t.key === urlTab)) activeTab = urlTab;
    else activeTab = 'all';

    buildAllRows();
    renderTabs();
    renderTable();

    ['salesOrder.created','salesOrder.updated','salesOrder.statusChanged',
     'salesOrder.archived','salesOrder.restored',
     'delivery.created','delivery.signed','delivery.grouped',
     'settlement.created','settlement.confirmed','settlement.paymentReceived',
    ].forEach(e => EventBus.on(e, () => { cachedRows = null; buildAllRows(); renderTabs(); refreshTable(); }));
  }

  // ========== 数据构建 ==========

  /**
   * 把订单和报价都映射成统一的 "OrderCenter Row"
   */
  function buildAllRows() {
    const rows = [];

    // 1. 订单(salesOrders) - 按 showArchived 过滤
    SalesOrderRepo.list()
      .filter(o => showArchived ? (o.is_archived === true) : (o.is_archived !== true))
      .forEach(o => {
        rows.push(mapOrderToRow(o));
      });

    cachedRows = rows;
  }

  function mapOrderToRow(o) {
    const cust = CustomerRepo.find(o.customerId);
    const totalQty = (o.items || []).reduce((s, i) => s + (i.qty || 0), 0);
    const shippedQty = (o.items || []).reduce((s, i) => s + (i.deliveredQty || 0), 0);
    const deliveryPct = totalQty > 0 ? Math.round(shippedQty / totalQty * 100) : 0;

    // 结算状态
    const deliveries = DeliveryRepo.list({ salesOrderId: o.id });
    const settlements = SettlementRepo.list()
      .filter(s => (s.salesOrderIds || []).includes(o.id));
    const settPaid = settlements.length > 0 && settlements.every(s => s.status === 'paid');
    const settPartial = settlements.some(s => s.status === 'partial_paid');
    const settConfirmed = settlements.some(s => ['confirmed', 'partial_paid', 'overdue'].includes(s.status));
    const settGrouped = deliveries.some(d => d.settlementStatus === 'grouped');
    let settStatus = 'none';
    if (settPaid) settStatus = 'paid';
    else if (settPartial || settConfirmed) settStatus = 'confirmed';
    else if (settGrouped) settStatus = 'grouped';

    // 收款状态
    const totalPayable = settlements.reduce((s, x) => s + (x.payableAmount || 0), 0);
    const totalPaid = settlements.reduce((s, x) => s + (x.paidAmount || 0), 0);
    const hasOverdue = settlements.some(s => s.status === 'overdue');
    let payStatus = 'none';
    if (totalPayable > 0 && totalPaid >= totalPayable) payStatus = 'all';
    else if (totalPaid > 0) payStatus = 'partial';
    if (hasOverdue) payStatus = 'overdue';

    // Stage(基于订单状态)
    const stage = mapStatusToStage(o.status);

    // 风险
    const risk = computeRisk(o, cust, deliveries, settlements);

    return {
      kind: 'order',
      id: o.id,
      no: o.no,
      customerId: o.customerId,
      customerName: cust?.name,
      customerCode: cust?.code,
      stage,
      status: o.status,
      is_archived: o.is_archived === true,
      totalAmount: o.totalAmount,
      deliveryPct,
      settStatus,
      payStatus,
      risk,
      totalPayable, totalPaid,
      updatedAt: o.updatedAt || o.createdAt,
      // for filter
      _hasGroupedDelivery: settGrouped,
      _hasOverdue: hasOverdue,
      _isException: risk === 'exception',
    };
  }

  function mapStatusToStage(s) {
    if (s === 'draft') return 'draft';
    if (s === 'pending_price' || s === 'pending_finance') return 'pending_finance';
    if (s === 'pending_warehouse') return 'pending_warehouse';
    if (s === 'confirmed') return 'producing';
    if (s === 'preparing') return 'producing';
    if (s === 'shipped') return 'shipping';
    if (s === 'partial_shipped') return 'shipping';
    if (s === 'settling') return 'settling';
    if (s === 'settled') return 'settling';
    if (s === 'paid') return 'completed';
    if (s === 'completed') return 'completed';
    if (s === 'cancelled') return 'cancelled';
    return s;
  }

  /**
   * 计算订单风险
   *   exception: 信用强制发货 / 运输异常 / 逾期
   *   high:      高风险客户 / 接近信用额度
   *   note:      注意级
   *   none:      正常
   */
  function computeRisk(order, customer, deliveries, settlements) {
    // 异常优先
    const hasForcedDelivery = deliveries.some(d => d.creditCheckResult?.forced);
    const hasTransportException = deliveries.some(d => d.transportStatus === 'exception');
    const hasOverdue = settlements.some(s => s.status === 'overdue');
    if (hasForcedDelivery || hasTransportException || hasOverdue) return 'exception';

    if (customer?.shipmentLocked) return 'locked';
    if (customer?.riskLevel === 'high') return 'high';
    if (customer?.riskLevel === 'attention') return 'note';
    return 'none';
  }

  // ========== Tab 统计 ==========

  function countForTab(key) {
    if (!cachedRows) return 0;
    return cachedRows.filter(r => matchesTab(r, key)).length;
  }

  function matchesTab(row, tab) {
    if (tab === 'all') return true;
    if (tab === 'pendingConfirm') return row.kind === 'order' && (row.stage === 'draft' || row.stage === 'pending_price' || row.stage === 'pending_finance');
    if (tab === 'producing')      return row.kind === 'order' && (row.stage === 'pending_warehouse' || row.stage === 'producing');
    if (tab === 'shipping')       return row.kind === 'order' && row.stage === 'shipping';
    if (tab === 'pendingSettle')  return row.kind === 'order' && row._hasGroupedDelivery;
    if (tab === 'pendingPayment') return row.kind === 'order' && (row.stage === 'settling' || (row.settStatus === 'confirmed' && row.payStatus !== 'all'));
    if (tab === 'completed')      return row.kind === 'order' && row.stage === 'completed';
    if (tab === 'exception')      return row._isException;
    return false;
  }

  // ========== 渲染 ==========

  function renderTabs() {
    const html = TABS.map(tab => {
      const count = countForTab(tab.key);
      const isActive = tab.key === activeTab;
      return `
        <div class="order-tab ${isActive ? 'active' : ''}" data-tab="${tab.key}">
          <span>${t(tab.labelKey)}</span>
          <span class="count">${count}</span>
        </div>
      `;
    }).join('');
    const tabsEl = document.getElementById('order-tabs');
    if (!tabsEl) return;
    tabsEl.innerHTML = html;

    document.querySelectorAll('[data-tab]').forEach(el => {
      el.addEventListener('click', () => {
        activeTab = el.dataset.tab;
        // 更新 URL(不刷新)— 用 Router.replace 保持 hash 格式
        Router.replace('order-center', {}, { tab: activeTab });
        // 重新渲染
        renderTabs();
        refreshTable();
      });
    });
  }

  function renderTable() {
    const columns = [
      {
        key: 'no', label: t('orderCenter.colOrderNo'), width: '170px',
        render: (r) => {
          const isZh = I18n.get() === 'zh-CN';
          const archivedTag = r.is_archived
            ? `<span class="badge slate" style="margin-left:6px;">${isZh?'已归档':'Archived'}</span>`
            : '';
          return `<span class="font-mono text-strong text-accent">${r.no}</span>${archivedTag}`;
        },
      },
      {
        key: 'customerName', label: t('orderCenter.colCustomer'),
        render: (r) => `
          <div class="text-strong">${r.customerName || '-'}</div>
          <div class="text-muted" style="font-size:11px;">${r.customerCode || ''}</div>
        `,
      },
      {
        key: 'totalAmount', label: t('common.amount'), width: '110px', align: 'right',
        render: (r) => `<span class="font-mono text-strong">${Sensitive.money(r.totalAmount)}</span>`,
      },
      {
        key: 'stage', label: t('orderCenter.colStage'), width: '120px',
        render: (r) => renderStageBadge(r.stage),
      },
      {
        key: 'deliveryPct', label: t('orderCenter.colDeliveryProgress'), width: '120px',
        render: (r) => {
          if (r.deliveryPct === null || r.deliveryPct === undefined) {
            return `<span class="text-muted">-</span>`;
          }
          const cls = r.deliveryPct >= 100 ? 'full' : (r.deliveryPct > 0 ? 'partial' : '');
          return `
            <div class="progress-mini">
              <div class="progress-mini-bar"><div class="fill ${cls}" style="width:${Math.min(100, r.deliveryPct)}%"></div></div>
              <span class="pct">${r.deliveryPct}%</span>
            </div>
          `;
        },
      },
      {
        key: 'settStatus', label: t('orderCenter.colSettlementStatus'), width: '90px',
        render: (r) => renderSettStatus(r.settStatus),
      },
      {
        key: 'payStatus', label: t('orderCenter.colPaymentStatus'), width: '90px',
        render: (r) => renderPayStatus(r.payStatus),
      },
      {
        key: 'risk', label: t('orderCenter.colRisk'), width: '80px',
        render: (r) => renderRiskBadge(r.risk),
      },
      {
        key: 'updatedAt', label: t('orderCenter.colUpdated'), width: '110px',
        sortKey: '_ts',
        render: (r) => `<span class="relative-time">${relativeTime(r.updatedAt)}</span>`,
      },
      {
        key: '_actions', label: t('common.actions'), width: '70px', sortable: false,
        render: (r) => `<button class="btn btn-sm btn-ghost" data-id="${r.id}" data-kind="${r.kind}">${t('orderCenter.actionView')}</button>`,
      },
    ];

    const data = cachedRows
      .filter(r => matchesTab(r, activeTab))
      .map(r => ({ ...r, _ts: new Date(r.updatedAt).getTime() }));

    dataTable = DataTable.create({
      mount: '#order-table',
      columns,
      data,
      customSearch: (row, keyword) =>
        Utils.fuzzyMatch(row.no, keyword) ||
        Utils.fuzzyMatch(row.customerName, keyword) ||
        Utils.fuzzyMatch(row.customerCode, keyword),
      searchPlaceholder: t('orderCenter.searchPlaceholder'),
      filters: [
        {
          key: 'risk',
          options: [
            { value: '',          label: t('common.all') + ' · ' + t('orderCenter.colRisk') },
            { value: 'none',      label: t('orderCenter.riskNone') },
            { value: 'note',      label: t('orderCenter.riskNote') },
            { value: 'high',      label: t('orderCenter.riskHigh') },
            { value: 'locked',    label: t('orderCenter.riskLocked') },
            { value: 'exception', label: t('orderCenter.riskException') },
          ]
        },
      ],
      defaultSortKey: '_ts',
      defaultSortOrder: 'desc',
      onRowClick: (row) => openDetail(row),
      actions: [
        { key: 'new', label: t('orderCenter.actionNew'), primary: true, requireAction: 'orderCreate', onClick: () => openCreate() },
        {
          key: 'toggleArchived',
          label: showArchived
            ? (I18n.get()==='zh-CN'?'返回活跃订单':'Back to Active')
            : (I18n.get()==='zh-CN'?'查看归档订单':'View Archived'),
          requireAction: 'orderViewArchived',
          onClick: () => {
            showArchived = !showArchived;
            cachedRows = null;
            buildAllRows();
            renderTable();
          },
        },
      ],
      pageSize: 15,
    });

    document.getElementById('order-table').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-id]');
      if (!btn) return;
      e.stopPropagation();
      openDetail({ id: btn.dataset.id, kind: btn.dataset.kind });
    });
  }

  function refreshTable() {
    if (!dataTable) return;
    const data = cachedRows
      .filter(r => matchesTab(r, activeTab))
      .map(r => ({ ...r, _ts: new Date(r.updatedAt).getTime() }));
    dataTable.setData(data);
  }

  // ========== Render Helpers ==========

  function renderStageBadge(stage) {
    const isZh = I18n.get() === 'zh-CN';
    const labelMap = {
      quoting:           t('orderCenter.stageQuoting'),
      draft:             t('orderCenter.stageDraft'),
      pending_price:     isZh ? '待财务审批' : 'Pending Finance',
      pending_finance:   isZh ? '待财务审批' : 'Pending Finance',
      pending_warehouse: isZh ? '待接单' : 'Pending Warehouse',
      producing:         isZh ? '备货中' : 'Preparing',
      preparing:         isZh ? '备货中' : 'Preparing',
      shipping:          isZh ? '发货中' : 'Shipping',
      settling:          isZh ? '已结算' : 'Settled',
      completed:         isZh ? '已完成' : 'Completed',
      cancelled:         t('orderCenter.stageCancelled'),
    };
    const label = labelMap[stage] || stage;
    const cls = `stage-${stage}`;
    return `<span class="stage-badge ${cls}"><span class="dot"></span>${label}</span>`;
  }

  function renderSettStatus(s) {
    if (!s || s === 'none') return `<span class="text-muted">-</span>`;
    if (s === 'grouped')   return `<span class="text-amber" style="font-size:11px;">●</span> <span style="font-size:11px;">${t('orderCenter.settGrouped')}</span>`;
    if (s === 'confirmed') return `<span class="text-blue" style="font-size:11px;">●</span> <span style="font-size:11px;">${t('orderCenter.settConfirmed')}</span>`;
    if (s === 'paid')      return `<span class="text-emerald" style="font-size:11px;">●</span> <span style="font-size:11px;">${t('orderCenter.settPaid')}</span>`;
    return `<span class="text-muted">${s}</span>`;
  }

  function renderPayStatus(s) {
    if (!s || s === 'none') return `<span class="text-muted">-</span>`;
    if (s === 'partial')   return `<span class="text-amber" style="font-size:11px;">●</span> <span style="font-size:11px;">${t('orderCenter.payPartial')}</span>`;
    if (s === 'all')       return `<span class="text-emerald" style="font-size:11px;">●</span> <span style="font-size:11px;">${t('orderCenter.payAll')}</span>`;
    if (s === 'overdue')   return `<span class="text-red" style="font-size:11px;">●</span> <span style="font-size:11px;">${t('orderCenter.payOverdue')}</span>`;
    return `<span class="text-muted">${s}</span>`;
  }

  function renderRiskBadge(risk) {
    const config = {
      none:      { label: 'orderCenter.riskNone',      bg: 'var(--emerald-bg)', color: 'var(--emerald)' },
      note:      { label: 'orderCenter.riskNote',      bg: 'var(--amber-bg)',   color: 'var(--amber)' },
      high:      { label: 'orderCenter.riskHigh',      bg: 'var(--orange-bg)',  color: 'var(--orange)' },
      locked:    { label: 'orderCenter.riskLocked',    bg: 'var(--red-bg)',     color: 'var(--red)' },
      exception: { label: 'orderCenter.riskException', bg: 'var(--red-bg)',     color: 'var(--red)' },
    }[risk] || { label: 'orderCenter.riskNone', bg: 'var(--slate-bg)', color: 'var(--text-3)' };
    return `<span style="display:inline-block; padding:2px 8px; background:${config.bg}; color:${config.color}; border-radius:3px; font-size:11px; font-weight:500;">${t(config.label)}</span>`;
  }

  function relativeTime(iso) {
    if (!iso) return '-';
    const ms = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(ms / 3600000);
    const days = Math.floor(ms / 86400000);
    const isZh = I18n.get() === 'zh-CN';
    if (days >= 7) return Utils.formatDate(iso);
    if (days >= 1) return isZh ? `${days} 天前` : `${days}d ago`;
    if (hours >= 1) return isZh ? `${hours} 小时前` : `${hours}h ago`;
    if (minutes >= 1) return isZh ? `${minutes} 分钟前` : `${minutes}m ago`;
    return isZh ? '刚刚' : 'just now';
  }

  function openDetail(row) {
    Router.go('order-detail', { id: row.id });
  }

  function openCreate() {
    Router.go('order-new');
  }

  return { init };
})();

window.OrderCenterModule = OrderCenterModule;
