/**
 * 库存流水模块
 * @module modules/movements
 */

const MovementsModule = (function () {
  'use strict';

  let dataTable = null;

  function init() {
    renderKPIs();
    renderTable();
    ['inventory.changed','inventory.transferred','stockTaking.completed'
    ].forEach(e => EventBus.on(e, () => { renderKPIs(); refreshTable(); }));
  }

  function renderKPIs() {
    const all = InventoryService.listMovements();
    const monthAgo = Utils.addDays(Utils.today(), -30);
    const recent = all.filter(m => m.movementDate >= monthAgo);

    const enumDir = SCHEMAS.stockMovement.movementTypeEnum;
    const inMv = recent.filter(m => enumDir[m.movementType]?.direction === 'in');
    const outMv = recent.filter(m => enumDir[m.movementType]?.direction === 'out');
    const inQty = inMv.reduce((s, m) => s + (m.quantity || 0), 0);
    const outQty = outMv.reduce((s, m) => s + (m.quantity || 0), 0);
    const inValue = inMv.reduce((s, m) => s + (m.totalCost || 0), 0);
    const outValue = outMv.reduce((s, m) => s + (m.totalCost || 0), 0);

    document.getElementById('kpi-row').innerHTML = `
      <div class="kpi">
        <div class="kpi-bar emerald"></div>
        <div class="kpi-label">${t('stockMovement.kpiInbound')}</div>
        <div class="kpi-value">${Utils.formatNumber(inQty)}</div>
        <div class="kpi-trend">${inMv.length} ${I18n.get()==='zh-CN'?'条流水':'records'}</div>
      </div>
      <div class="kpi">
        <div class="kpi-bar red"></div>
        <div class="kpi-label">${t('stockMovement.kpiOutbound')}</div>
        <div class="kpi-value">${Utils.formatNumber(outQty)}</div>
        <div class="kpi-trend">${outMv.length} ${I18n.get()==='zh-CN'?'条流水':'records'}</div>
      </div>
      <div class="kpi">
        <div class="kpi-bar blue"></div>
        <div class="kpi-label">${t('stockMovement.kpiInValue')}</div>
        <div class="kpi-value">${Sensitive.cost(inValue)}</div>
        <div class="kpi-trend">${I18n.get()==='zh-CN'?'近 30 天':'Last 30 days'}</div>
      </div>
      <div class="kpi">
        <div class="kpi-bar amber"></div>
        <div class="kpi-label">${t('stockMovement.kpiOutValue')}</div>
        <div class="kpi-value">${Sensitive.cost(outValue)}</div>
        <div class="kpi-trend">${I18n.get()==='zh-CN'?'近 30 天':'Last 30 days'}</div>
      </div>
    `;
  }

  function renderTable() {
    const warehouses = WarehouseService.list();
    const whOptions = [{ value: '', label: t('common.all') + ' · ' + t('inventory.warehouse') }]
      .concat(warehouses.map(w => ({ value: w.id, label: w.name })));

    const enumDir = SCHEMAS.stockMovement.movementTypeEnum;
    const movTypeOptions = [{ value: '', label: t('common.all') + ' · ' + t('stockMovement.movementType') }]
      .concat(Object.keys(enumDir).map(key => ({ value: key, label: tEnum('stockMovement','movementTypeEnum',key) })));

    const columns = [
      {
        key: 'movementDate', label: t('stockMovement.movementDate'), width: '100px',
        render: (r) => `<span class="font-mono">${Utils.formatDate(r.movementDate)}</span>`,
      },
      {
        key: 'no', label: t('stockMovement.no'), width: '160px',
        render: (r) => `<span class="font-mono text-strong">${r.no}</span>`,
      },
      {
        key: '_direction', label: t('stockMovement.direction'), width: '50px', align: 'center', sortable: false,
        render: (r) => {
          const dir = enumDir[r.movementType]?.direction;
          return `<span class="dir-badge ${dir}">${dir === 'in' ? '↓' : '↑'}</span>`;
        },
      },
      {
        key: 'movementType', label: t('stockMovement.movementType'), width: '110px',
        render: (r) => Badge.render('stockMovement','movementTypeEnum',r.movementType,{noDot:true}),
      },
      {
        key: 'materialId', label: t('stockMovement.materialName'),
        render: (r) => {
          const m = MaterialRepo.find(r.materialId);
          return `
            <div class="text-strong">${m?.name || '-'}</div>
            <div class="text-muted" style="font-size:11px;">${m?.spec || ''}</div>
          `;
        },
      },
      {
        key: 'warehouseId', label: t('stockMovement.warehouseName'), width: '110px',
        render: (r) => {
          const w = WarehouseRepo.find(r.warehouseId);
          return `<span>${w?.name || '-'}</span>`;
        },
      },
      {
        key: 'quantity', label: t('stockMovement.quantity'), width: '110px', align: 'right',
        render: (r) => {
          const dir = enumDir[r.movementType]?.direction;
          const cls = dir === 'in' ? 'text-emerald' : 'text-red';
          const sign = dir === 'in' ? '+' : '-';
          return `<span class="font-mono ${cls} text-strong">${sign}${Utils.formatNumber(r.quantity)}</span>`;
        },
      },
      {
        key: 'unitCost', label: t('stockMovement.unitCost'), width: '90px', align: 'right',
        render: (r) => `<span class="font-mono text-muted" style="font-size:11px;">${Sensitive.cost(r.unitCost || 0)}</span>`,
      },
      {
        key: '_qtyChange', label: I18n.get()==='zh-CN'?'账面变化':'Stock Change', width: '160px', align: 'right', sortable: false,
        render: (r) => {
          return `
            <div class="font-mono" style="font-size:11px;">
              <span class="text-muted">${Utils.formatNumber(r.qtyBefore)}</span>
              <span class="text-muted"> → </span>
              <span class="text-strong">${Utils.formatNumber(r.qtyAfter)}</span>
            </div>
          `;
        },
      },
      {
        key: 'sourceNo', label: t('stockMovement.sourceNo'), width: '160px',
        render: (r) => {
          if (!r.sourceNo && !r.sourceId) return '<span class="text-muted">-</span>';
          // 销售出库可链接到物流车次详情
          if (r.sourceType === 'delivery' && r.sourceId) {
            return `<a href="${Router.href('logistics-detail', { id: r.sourceId })}" class="font-mono text-accent" style="text-decoration:none;">${r.sourceNo || r.sourceId}</a>`;
          }
          return `<span class="font-mono text-muted">${r.sourceNo || '-'}</span>`;
        },
      },
    ];

    dataTable = DataTable.create({
      mount: '#mv-table',
      columns,
      data: InventoryService.listMovements(),
      customSearch: (row, keyword) => {
        const mat = MaterialRepo.find(row.materialId);
        return Utils.fuzzyMatch(row.no, keyword) ||
               Utils.fuzzyMatch(mat?.name, keyword) ||
               Utils.fuzzyMatch(row.sourceNo, keyword) ||
               Utils.fuzzyMatch(row.remark, keyword);
      },
      searchPlaceholder: t('stockMovement.searchPlaceholder'),
      filters: [
        { key: 'warehouseId', options: whOptions },
        { key: 'movementType', options: movTypeOptions },
        {
          key: '_direction',
          options: [
            { value: '', label: t('common.all') + ' · ' + t('stockMovement.direction') },
            { value: 'in', label: t('stockMovement.directionIn') },
            { value: 'out', label: t('stockMovement.directionOut') },
          ],
          predicate: (r, v) => enumDir[r.movementType]?.direction === v,
        },
      ],
      defaultSortKey: 'movementDate',
      defaultSortOrder: 'desc',
      pageSize: 20,
    });
  }

  function refreshTable() {
    if (dataTable) dataTable.setData(InventoryService.listMovements());
  }

  return { init };
})();

window.MovementsModule = MovementsModule;
