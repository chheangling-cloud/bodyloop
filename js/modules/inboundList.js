/**
 * 入库管理 - 列表
 * @module modules/inboundList
 */

const InboundListModule = (function () {
  'use strict';

  let dataTable = null;

  function init() {
    renderKPIs();
    renderTable();
    ['inbound.created','inbound.confirmed','inbound.cancelled','inventory.changed']
      .forEach(e => EventBus.on(e, () => { renderKPIs(); refreshTable(); }));
  }

  function renderKPIs() {
    const isZh = I18n.get() === 'zh-CN';
    const all = InboundService.list();
    const monthAgo = Date.now() - 30 * 86400000;
    const monthList = all.filter(ib =>
      ib.status === 'confirmed' && new Date(ib.confirmedAt || ib.createdAt) >= monthAgo
    );
    const monthCount = monthList.length;
    const monthAmount = monthList.reduce((s, x) => s + (x.totalCost || 0), 0);
    const pending = all.filter(ib => ib.status === 'draft').length;

    document.getElementById('kpi-row').innerHTML = `
      <div class="kpi">
        <div class="kpi-bar emerald"></div>
        <div class="kpi-label">${t('inbound.kpiThisMonth')}</div>
        <div class="kpi-value">${monthCount}</div>
        <div class="kpi-trend">${t('inbound.kpiThisMonthSub')}</div>
      </div>
      <div class="kpi">
        <div class="kpi-bar blue"></div>
        <div class="kpi-label">${t('inbound.kpiThisMonthAmount')}</div>
        <div class="kpi-value">${Utils.formatMoney(monthAmount)}</div>
        <div class="kpi-trend">${isZh?'近 30 天':'last 30 days'}</div>
      </div>
      <div class="kpi">
        <div class="kpi-bar amber"></div>
        <div class="kpi-label">${t('inbound.kpiPendingConfirm')}</div>
        <div class="kpi-value">${pending}</div>
        <div class="kpi-trend">${t('inbound.kpiPendingConfirmSub')}</div>
      </div>
    `;
  }

  function renderTable() {
    const isZh = I18n.get() === 'zh-CN';
    const warehouses = WarehouseService.list();
    const whMap = Object.fromEntries(warehouses.map(w => [w.id, w.name]));

    const columns = [
      {
        key: 'no', label: t('inbound.colNo'), width: '160px',
        render: (r) => `<a class="font-mono text-strong text-accent" href="${Router.href('inbound-detail', { id: r.id })}" style="text-decoration:none;">${r.no}</a>`,
      },
      {
        key: 'type', label: t('inbound.colType'), width: '110px',
        render: (r) => renderTypeBadge(r.type),
      },
      {
        key: 'warehouseId', label: t('inbound.colWarehouse'), width: '110px',
        render: (r) => whMap[r.warehouseId] || r.warehouseId,
      },
      {
        key: 'totalQty', label: t('inbound.colQty'), width: '90px', align: 'right',
        render: (r) => `<span class="font-mono text-strong">+${r.totalQty}</span>`,
      },
      {
        key: 'totalCost', label: t('inbound.colAmount'), width: '120px', align: 'right',
        render: (r) => `<span class="font-mono">${Utils.formatMoney(r.totalCost)}</span>`,
      },
      {
        key: 'supplier', label: t('inbound.colSupplier'), width: '140px',
        render: (r) => r.supplier || `<span class="text-muted">-</span>`,
      },
      {
        key: 'inboundDate', label: t('inbound.colDate'), width: '110px',
        render: (r) => `<span class="font-mono">${Utils.formatDate(r.inboundDate)}</span>`,
      },
      {
        key: 'status', label: t('inbound.colStatus'), width: '100px',
        render: (r) => renderStatusBadge(r.status),
      },
    ];

    const data = InboundService.list().map(ib => ({
      ...ib,
      _ts: new Date(ib.updatedAt || ib.createdAt).getTime(),
    }));

    dataTable = DataTable.create({
      mount: '#inbound-table',
      columns,
      data,
      customSearch: (row, kw) =>
        Utils.fuzzyMatch(row.no, kw) ||
        Utils.fuzzyMatch(row.supplier, kw) ||
        Utils.fuzzyMatch(row.sourceRef, kw),
      searchPlaceholder: isZh?'搜索单号 / 供应商 / 来源单号':'Search no. / supplier',
      filters: [
        {
          key: 'type',
          options: [
            { value: '', label: isZh?'全部 · 类型':'All · Type' },
            { value: 'purchase',   label: t('inbound.typePurchase') },
            { value: 'production', label: t('inbound.typeProduction') },
            { value: 'return',     label: t('inbound.typeReturn') },
            { value: 'initial',    label: t('inbound.typeInitial') },
            { value: 'gain',       label: t('inbound.typeGain') },
          ],
        },
        {
          key: 'status',
          options: [
            { value: '', label: isZh?'全部 · 状态':'All · Status' },
            { value: 'draft',     label: t('inbound.statusDraft') },
            { value: 'confirmed', label: t('inbound.statusConfirmed') },
            { value: 'cancelled', label: t('inbound.statusCancelled') },
          ],
        },
        {
          key: 'warehouseId',
          options: [
            { value: '', label: isZh?'全部 · 仓库':'All · Warehouse' },
            ...warehouses.map(w => ({ value: w.id, label: w.name })),
          ],
        },
      ],
      defaultSortKey: '_ts',
      defaultSortOrder: 'desc',
      onRowClick: (row) => Router.go('inbound-detail', { id: row.id }),
      pageSize: 15,
    });
  }

  function refreshTable() {
    if (!dataTable) return;
    const data = InboundService.list().map(ib => ({
      ...ib,
      _ts: new Date(ib.updatedAt || ib.createdAt).getTime(),
    }));
    dataTable.setData(data);
  }

  function renderTypeBadge(type) {
    const map = {
      purchase:   { c:'var(--blue)', bg:'var(--blue-bg)',  labelKey:'inbound.typePurchase' },
      production: { c:'var(--emerald)', bg:'var(--emerald-bg)',   labelKey:'inbound.typeProduction' },
      return:     { c:'#fb923c', bg:'rgba(251,146,60,0.14)',  labelKey:'inbound.typeReturn' },
      initial:    { c:'#cbd5e1', bg:'rgba(148,163,184,0.14)', labelKey:'inbound.typeInitial' },
      gain:       { c:'#facc15', bg:'rgba(250,204,21,0.14)',  labelKey:'inbound.typeGain' },
    };
    const cf = map[type] || map.initial;
    return `<span style="padding:2px 7px; background:${cf.bg}; color:${cf.c}; border-radius:3px; font-size:11px;">${t(cf.labelKey)}</span>`;
  }

  function renderStatusBadge(status) {
    const map = {
      draft:     { c:'#94a3b8', bg:'rgba(148,163,184,0.14)', labelKey:'inbound.statusDraft' },
      confirmed: { c:'var(--emerald)', bg:'var(--emerald-bg)',   labelKey:'inbound.statusConfirmed' },
      cancelled: { c:'#94a3b8', bg:'rgba(148,163,184,0.14)', labelKey:'inbound.statusCancelled' },
    };
    const cf = map[status] || map.draft;
    return `<span style="padding:2px 8px; background:${cf.bg}; color:${cf.c}; border-radius:3px; font-size:11px; font-weight:500;">${t(cf.labelKey)}</span>`;
  }

  return { init };
})();

window.InboundListModule = InboundListModule;
