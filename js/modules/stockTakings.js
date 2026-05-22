/**
 * 盘点列表模块
 * @module modules/stockTakings
 */

const StockTakingsModule = (function () {
  'use strict';

  let dataTable = null;

  function init() {
    renderKPIs();
    renderTable();
    ['stockTaking.created','stockTaking.updated','stockTaking.completed',
     'stockTaking.cancelled','stockTaking.deleted'
    ].forEach(e => EventBus.on(e, () => { renderKPIs(); refreshTable(); }));
  }

  function renderKPIs() {
    const all = StockTakingService.list();
    const monthAgo = Utils.addDays(Utils.today(), -30);

    const draftCount = all.filter(s => s.status === 'draft').length;
    const inProgressCount = all.filter(s => s.status === 'in_progress').length;
    const completedThisMonth = all.filter(s =>
      s.status === 'completed' && s.takingDate >= monthAgo
    ).length;
    const totalDiff = all.filter(s =>
      s.status === 'completed' && s.takingDate >= monthAgo
    ).reduce((sum, s) => sum + Math.abs(s.totalDiffCost || 0), 0);

    document.getElementById('kpi-row').innerHTML = `
      <div class="kpi">
        <div class="kpi-bar slate"></div>
        <div class="kpi-label">${t('stockTaking.kpiDraft')}</div>
        <div class="kpi-value">${draftCount}</div>
        <div class="kpi-trend">${I18n.get()==='zh-CN'?'待启动':'Pending'}</div>
      </div>
      <div class="kpi">
        <div class="kpi-bar amber"></div>
        <div class="kpi-label">${t('stockTaking.kpiInProgress')}</div>
        <div class="kpi-value">${inProgressCount}</div>
        <div class="kpi-trend">${I18n.get()==='zh-CN'?'盘点中':'In progress'}</div>
      </div>
      <div class="kpi">
        <div class="kpi-bar emerald"></div>
        <div class="kpi-label">${t('stockTaking.kpiCompletedThisMonth')}</div>
        <div class="kpi-value">${completedThisMonth}</div>
        <div class="kpi-trend">${I18n.get()==='zh-CN'?'近 30 天':'Last 30 days'}</div>
      </div>
      <div class="kpi">
        <div class="kpi-bar blue"></div>
        <div class="kpi-label">${t('stockTaking.kpiTotalDiff')}</div>
        <div class="kpi-value">${Sensitive.cost(totalDiff)}</div>
        <div class="kpi-trend">${I18n.get()==='zh-CN'?'本月累计':'This month'}</div>
      </div>
    `;
  }

  function renderTable() {
    const warehouses = WarehouseService.list();
    const whOptions = [{ value: '', label: t('common.all') + ' · ' + t('inventory.warehouse') }]
      .concat(warehouses.map(w => ({ value: w.id, label: w.name })));

    const columns = [
      {
        key: 'no', label: t('stockTaking.no'), width: '160px',
        render: (r) => `<span class="font-mono text-strong">${r.no}</span>`,
      },
      {
        key: 'warehouseId', label: t('inventory.warehouse'), width: '120px',
        render: (r) => {
          const w = WarehouseRepo.find(r.warehouseId);
          return `<span>${w?.name || '-'}</span>`;
        },
      },
      {
        key: 'takingDate', label: t('stockTaking.takingDate'), width: '110px',
        render: (r) => `<span class="font-mono">${Utils.formatDate(r.takingDate)}</span>`,
      },
      {
        key: '_itemCount', label: I18n.get()==='zh-CN'?'物料数':'Items', width: '70px', align: 'right', sortable: false,
        render: (r) => `<span class="font-mono">${(r.items || []).length}</span>`,
      },
      {
        key: 'totalDiffIn', label: I18n.get()==='zh-CN'?'盘盈':'Surplus', width: '90px', align: 'right',
        render: (r) => r.totalDiffIn > 0
          ? `<span class="font-mono text-emerald">+${r.totalDiffIn}</span>`
          : `<span class="text-muted">-</span>`,
      },
      {
        key: 'totalDiffOut', label: I18n.get()==='zh-CN'?'盘亏':'Shortage', width: '90px', align: 'right',
        render: (r) => r.totalDiffOut > 0
          ? `<span class="font-mono text-red">-${r.totalDiffOut}</span>`
          : `<span class="text-muted">-</span>`,
      },
      {
        key: 'totalDiffCost', label: t('stockTaking.diffCost'), width: '110px', align: 'right',
        render: (r) => {
          const v = r.totalDiffCost || 0;
          if (v === 0) return `<span class="text-muted">-</span>`;
          const cls = v > 0 ? 'text-emerald' : 'text-red';
          return `<span class="font-mono ${cls}">${v > 0 ? '+' : ''}${Sensitive.cost(v)}</span>`;
        },
      },
      {
        key: 'status', label: t('common.status'), width: '100px',
        render: (r) => Badge.render('stockTaking','statusEnum',r.status),
      },
      {
        key: '_actions', label: t('common.actions'), width: '90px', sortable: false,
        render: (r) => `<button class="btn btn-sm btn-ghost" data-id="${r.id}">${t('common.view')}</button>`,
      },
    ];

    dataTable = DataTable.create({
      mount: '#stk-table',
      columns,
      data: StockTakingService.list(),
      customSearch: (row, keyword) => {
        const wh = WarehouseRepo.find(row.warehouseId);
        return Utils.fuzzyMatch(row.no, keyword) ||
               Utils.fuzzyMatch(wh?.name, keyword) ||
               Utils.fuzzyMatch(row.remark, keyword);
      },
      searchPlaceholder: t('stockTaking.searchPlaceholder'),
      filters: [
        { key: 'warehouseId', options: whOptions },
        {
          key: 'status',
          options: [
            { value: '', label: t('common.all') + ' · ' + t('common.status') },
            { value: 'draft',       label: tEnum('stockTaking','statusEnum','draft') },
            { value: 'in_progress', label: tEnum('stockTaking','statusEnum','in_progress') },
            { value: 'completed',   label: tEnum('stockTaking','statusEnum','completed') },
            { value: 'cancelled',   label: tEnum('stockTaking','statusEnum','cancelled') },
          ]
        },
      ],
      defaultSortKey: 'takingDate',
      defaultSortOrder: 'desc',
      onRowClick: (row) => openDetail(row.id),
      actions: [
        { key: 'new', label: t('stockTaking.actionNew'), primary: true, onClick: () => openCreate() }
      ],
      pageSize: 20,
    });

    document.getElementById('stk-table').addEventListener('click', (e) => {
      const id = e.target.closest('[data-id]')?.dataset.id;
      if (id) { e.stopPropagation(); openDetail(id); }
    });
  }

  function refreshTable() {
    if (dataTable) dataTable.setData(StockTakingService.list());
  }

  function openDetail(id) { Router.go('stock-taking-detail', { id }); }

  function openCreate() {
    const warehouses = WarehouseService.listActive();
    Modal.open({
      title: t('stockTaking.createTitle'),
      width: 460,
      content: `
        <div class="form-row">
          <label class="form-label">${t('inventory.warehouse')} <span class="required">*</span></label>
          <select class="select w-full" id="stk-wh">
            <option value="">${t('whCommon.selectWarehouse')}</option>
            ${warehouses.map(w => `<option value="${w.id}">${w.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-row">
          <label class="form-label">${t('stockTaking.takingDate')}</label>
          <input class="input w-full" id="stk-date" type="date" value="${Utils.today()}">
        </div>
        <div class="form-row">
          <label class="form-label">${t('common.remark')}</label>
          <input class="input w-full" id="stk-remark">
        </div>
      `,
      buttons: [
        { label: t('common.cancel') },
        {
          label: t('common.confirm'),
          primary: true,
          onClick: () => {
            const warehouseId = document.getElementById('stk-wh').value;
            const takingDate = document.getElementById('stk-date').value;
            const remark = document.getElementById('stk-remark').value;
            if (!warehouseId) { Toast.warning(t('stockTaking.validate_needWarehouse')); return false; }
            try {
              const created = StockTakingService.create({ warehouseId, takingDate, remark }, 'emp_w01');
              Toast.success(t('stockTaking.saveSuccess', created.no));
              setTimeout(() => Router.go('stock-taking-detail', { id: created.id }), 400);
            } catch (e) { Toast.error(e.message); return false; }
          }
        }
      ]
    });
  }

  return { init };
})();

window.StockTakingsModule = StockTakingsModule;
