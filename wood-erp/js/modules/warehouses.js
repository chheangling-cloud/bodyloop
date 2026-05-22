/**
 * 仓库管理模块
 * @module modules/warehouses
 */

const WarehousesModule = (function () {
  'use strict';

  let dataTable = null;

  function init() {
    renderTable();
    ['warehouse.created','warehouse.updated','inventory.changed'
    ].forEach(e => EventBus.on(e, () => refreshTable()));
  }

  function renderTable() {
    const columns = [
      {
        key: 'code', label: t('warehouse.code'), width: '120px',
        render: (r) => `<span class="font-mono text-strong">${r.code}</span>`,
      },
      {
        key: 'name', label: t('warehouse.name'),
        render: (r) => `<span class="text-strong">${r.name}</span>`,
      },
      {
        key: 'type', label: t('warehouse.type'), width: '100px',
        render: (r) => Badge.render('warehouse','typeEnum',r.type,{noDot:true}),
      },
      {
        key: 'manager', label: t('warehouse.manager'), width: '110px',
        render: (r) => r.manager || '<span class="text-muted">-</span>',
      },
      {
        key: '_skus', label: t('warehouse.totalSkus'), width: '90px', align: 'right', sortable: false,
        render: (r) => {
          const s = WarehouseService.getStats(r.id);
          return `<span class="font-mono">${s.totalSkus}</span>`;
        },
      },
      {
        key: '_qty', label: t('warehouse.totalQty'), width: '110px', align: 'right', sortable: false,
        render: (r) => {
          const s = WarehouseService.getStats(r.id);
          return `<span class="font-mono">${Utils.formatNumber(s.totalQty)}</span>`;
        },
      },
      {
        key: '_value', label: t('warehouse.totalValue'), width: '130px', align: 'right', sortable: false,
        render: (r) => {
          const s = WarehouseService.getStats(r.id);
          return `<span class="font-mono text-strong">${Utils.formatMoney(s.totalValue)}</span>`;
        },
      },
      {
        key: '_low', label: t('warehouse.lowStock'), width: '80px', align: 'right', sortable: false,
        render: (r) => {
          const s = WarehouseService.getStats(r.id);
          return s.lowStock > 0
            ? `<span class="font-mono text-amber">${s.lowStock}</span>`
            : `<span class="font-mono text-muted">0</span>`;
        },
      },
      {
        key: 'status', label: t('common.status'), width: '90px',
        render: (r) => Badge.render('warehouse','statusEnum',r.status),
      },
      {
        key: '_actions', label: t('common.actions'), width: '140px', sortable: false,
        render: (r) => `
          <button class="btn btn-sm btn-ghost" data-action="edit" data-id="${r.id}">${t('common.edit')}</button>
          ${r.status === 'active'
            ? `<button class="btn btn-sm btn-ghost text-red" data-action="disable" data-id="${r.id}">${t('warehouse.disable')}</button>`
            : `<button class="btn btn-sm btn-ghost text-emerald" data-action="enable" data-id="${r.id}">${t('warehouse.enable')}</button>`
          }
        `,
      },
    ];

    dataTable = DataTable.create({
      mount: '#wh-table',
      columns,
      data: WarehouseService.list(),
      customSearch: (row, keyword) =>
        Utils.fuzzyMatch(row.code, keyword) ||
        Utils.fuzzyMatch(row.name, keyword) ||
        Utils.fuzzyMatch(row.manager, keyword),
      searchPlaceholder: t('warehouse.searchPlaceholder'),
      filters: [
        {
          key: 'type',
          options: [
            { value: '', label: t('common.all') + ' · ' + t('warehouse.type') },
            { value: 'main', label: tEnum('warehouse','typeEnum','main') },
            { value: 'finished', label: tEnum('warehouse','typeEnum','finished') },
            { value: 'semi_finished', label: tEnum('warehouse','typeEnum','semi_finished') },
            { value: 'raw', label: tEnum('warehouse','typeEnum','raw') },
            { value: 'virtual', label: tEnum('warehouse','typeEnum','virtual') },
          ]
        },
        {
          key: 'status',
          options: [
            { value: '', label: t('common.all') + ' · ' + t('common.status') },
            { value: 'active', label: tEnum('warehouse','statusEnum','active') },
            { value: 'disabled', label: tEnum('warehouse','statusEnum','disabled') },
          ]
        },
      ],
      defaultSortKey: 'code',
      defaultSortOrder: 'asc',
      actions: [
        { key: 'new', label: t('warehouse.actionNew'), primary: true, onClick: () => openCreate() }
      ],
      pageSize: 20,
    });

    document.getElementById('wh-table').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      e.stopPropagation();
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (action === 'edit') openEdit(id);
      else if (action === 'disable') doDisable(id);
      else if (action === 'enable') doEnable(id);
    });
  }

  function refreshTable() {
    if (dataTable) dataTable.setData(WarehouseService.list());
  }

  function openCreate() {
    openForm({}, 'create');
  }

  function openEdit(id) {
    const w = WarehouseService.findById(id);
    if (!w) return;
    openForm(w, 'edit');
  }

  function openForm(data, mode) {
    Modal.open({
      title: mode === 'create' ? t('warehouse.create') : t('warehouse.edit'),
      width: 480,
      content: `
        <div class="grid gap-3" style="grid-template-columns: 1fr 1fr;">
          <div>
            <label class="form-label">${t('warehouse.code')} <span class="required">*</span></label>
            <input class="input w-full" id="wh-code" value="${data.code || ''}" ${mode === 'edit' ? 'readonly' : ''}>
          </div>
          <div>
            <label class="form-label">${t('warehouse.type')}</label>
            <select class="select w-full" id="wh-type">
              ${['main','finished','semi_finished','raw','virtual'].map(t2 => `
                <option value="${t2}" ${data.type === t2 ? 'selected' : ''}>${tEnum('warehouse','typeEnum',t2)}</option>
              `).join('')}
            </select>
          </div>
        </div>
        <div class="form-row">
          <label class="form-label">${t('warehouse.name')} <span class="required">*</span></label>
          <input class="input w-full" id="wh-name" value="${data.name || ''}">
        </div>
        <div class="form-row">
          <label class="form-label">${t('warehouse.manager')}</label>
          <input class="input w-full" id="wh-manager" value="${data.manager || ''}">
        </div>
        <div class="form-row">
          <label class="form-label">${t('warehouse.address')}</label>
          <input class="input w-full" id="wh-address" value="${data.address || ''}">
        </div>
        <div class="form-row">
          <label class="form-label">${t('common.remark')}</label>
          <input class="input w-full" id="wh-remark" value="${data.remark || ''}">
        </div>
      `,
      buttons: [
        { label: t('common.cancel') },
        {
          label: t('common.confirm'),
          primary: true,
          onClick: () => {
            const code = document.getElementById('wh-code').value.trim();
            const name = document.getElementById('wh-name').value.trim();
            const type = document.getElementById('wh-type').value;
            const manager = document.getElementById('wh-manager').value.trim();
            const address = document.getElementById('wh-address').value.trim();
            const remark = document.getElementById('wh-remark').value.trim();
            if (!code) { Toast.warning(t('warehouse.validate_needCode')); return false; }
            if (!name) { Toast.warning(t('warehouse.validate_needName')); return false; }
            try {
              if (mode === 'create') {
                WarehouseService.create({ code, name, type, manager, address, remark }, 'emp_w01');
              } else {
                WarehouseService.update(data.id, { name, type, manager, address, remark }, 'emp_w01');
              }
              Toast.success(t('warehouse.saveSuccess'));
            } catch (e) { Toast.error(e.message); return false; }
          }
        }
      ]
    });
  }

  function doDisable(id) {
    const w = WarehouseService.findById(id);
    Modal.confirm({
      title: t('warehouse.disable'),
      message: `${I18n.get()==='zh-CN' ? '确认停用' : 'Disable'} <strong>${w.name}</strong>?`,
      danger: true,
      onConfirm: () => {
        try {
          WarehouseService.disable(id, 'emp_w01');
          Toast.success(t('common.operationSuccess'));
        } catch (e) { Toast.error(e.message); }
      }
    });
  }

  function doEnable(id) {
    try {
      WarehouseService.enable(id, 'emp_w01');
      Toast.success(t('common.operationSuccess'));
    } catch (e) { Toast.error(e.message); }
  }

  return { init };
})();

window.WarehousesModule = WarehousesModule;
