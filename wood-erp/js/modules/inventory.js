/**
 * 库存看板模块
 * @module modules/inventory
 *
 * 显示所有库存(物料 × 仓库),提供:
 * - 入库/出库/调整/调拨 操作
 * - 低库存预警
 * - 按仓库筛选
 */

const InventoryModule = (function () {
  'use strict';

  let dataTable = null;

  function init() {
    renderKPIs();
    renderTable();

    ['inventory.changed','inventory.transferred','warehouse.created'
    ].forEach(e => EventBus.on(e, () => { renderKPIs(); refreshTable(); }));
  }

  function renderKPIs() {
    const k = InventoryService.getKPIs();
    document.getElementById('kpi-row').innerHTML = `
      <div class="kpi">
        <div class="kpi-bar blue"></div>
        <div class="kpi-label">${t('inventory.kpiTotalSkus')}</div>
        <div class="kpi-value">${k.totalSkus}</div>
        <div class="kpi-trend">${t('inventory.kpiTotalSkusSub')}</div>
      </div>
      <div class="kpi">
        <div class="kpi-bar emerald"></div>
        <div class="kpi-label">${t('inventory.kpiTotalValue')}</div>
        <div class="kpi-value">${Sensitive.cost(k.totalValue)}</div>
        <div class="kpi-trend">${t('inventory.kpiTotalValueSub')}</div>
      </div>
      <div class="kpi">
        <div class="kpi-bar amber"></div>
        <div class="kpi-label">${t('inventory.kpiLowStock')}</div>
        <div class="kpi-value">${k.lowStockCount}</div>
        <div class="kpi-trend">${t('inventory.kpiLowStockSub')}</div>
      </div>
      <div class="kpi">
        <div class="kpi-bar red"></div>
        <div class="kpi-label">${t('inventory.kpiNegative')}</div>
        <div class="kpi-value">${k.negativeCount}</div>
        <div class="kpi-trend">${t('inventory.kpiNegativeSub')}</div>
      </div>
    `;
  }

  function renderTable() {
    const warehouses = WarehouseService.list();
    const whOptions = [{ value: '', label: t('common.all') + ' · ' + t('inventory.warehouse') }]
      .concat(warehouses.map(w => ({ value: w.id, label: w.name })));

    const columns = [
      {
        key: 'materialId', label: t('inventory.material'),
        render: (r) => {
          const mat = MaterialRepo.find(r.materialId);
          return `
            <div class="text-strong">${mat?.name || '-'}</div>
            <div class="text-muted" style="font-size:11px;">${mat?.spec || ''}</div>
          `;
        },
      },
      {
        key: 'warehouseId', label: t('inventory.warehouse'), width: '120px',
        render: (r) => {
          const wh = WarehouseRepo.find(r.warehouseId);
          return `<span>${wh?.name || '-'}</span>`;
        },
      },
      {
        key: 'quantity', label: t('inventory.quantity'), width: '180px', align: 'right',
        render: (r) => {
          const mat = MaterialRepo.find(r.materialId);
          const qty = r.quantity || 0;
          const locked = r.lockedQuantity || 0;
          const available = qty - locked;
          const safety = r.safetyStock || 0;
          const max = r.maxStock || (safety * 7) || qty;
          let cls = 'normal';
          let statusLabel = t('inventory.statusNormal');
          if (qty < 0) { cls = 'negative'; statusLabel = t('inventory.statusNegative'); }
          else if (qty === 0) { cls = 'empty'; statusLabel = t('inventory.statusEmpty'); }
          else if (available < safety) { cls = 'low'; statusLabel = t('inventory.statusLow'); }
          const pct = max > 0 ? Math.min(100, Math.max(0, qty / max * 100)) : 0;
          const lockedPct = qty > 0 ? Math.min(100, locked / qty * 100) : 0;
          const barCls = available < safety ? 'low' : (qty > safety * 4 ? 'over' : 'normal');
          const isZh = I18n.get() === 'zh-CN';
          return `
            <div style="text-align:right;">
              <div class="font-mono ${qty < 0 ? 'text-red' : (available < safety ? 'text-amber' : 'text-strong')}">${Utils.formatNumber(qty)} ${mat?.unit || ''}</div>
              ${locked > 0 ? `
                <div class="font-mono" style="font-size:10px; color:var(--amber);">${isZh?'锁定':'Locked'} ${Utils.formatNumber(locked)} · ${isZh?'可用':'Avail'} ${Utils.formatNumber(available)}</div>
              ` : ''}
              <div class="qty-bar-track" style="position:relative;">
                <div class="qty-bar-fill ${barCls}" style="width:${pct}%"></div>
                ${locked > 0 ? `<div style="position:absolute; top:0; right:0; height:100%; width:${lockedPct * pct / 100}%; background:rgba(250,204,21,0.5);"></div>` : ''}
              </div>
              <div class="text-muted" style="font-size:10px;">
                <span class="stock-status-dot ${cls}"></span>${statusLabel} ·
                ${t('inventory.safetyStock')}: ${safety}
              </div>
            </div>
          `;
        },
      },
      {
        key: 'avgCost', label: t('inventory.avgCost'), width: '110px', align: 'right',
        render: (r) => `<span class="font-mono">${Sensitive.cost(r.avgCost || 0)}</span>`,
      },
      {
        key: 'totalValue', label: t('inventory.totalValue'), width: '120px', align: 'right',
        sortKey: '_value',
        render: (r) => {
          const v = (r.quantity || 0) * (r.avgCost || 0);
          return `<span class="font-mono text-strong">${Sensitive.cost(v)}</span>`;
        },
      },
      {
        key: 'lastInAt', label: t('inventory.lastInAt'), width: '105px',
        render: (r) => r.lastInAt
          ? `<span class="font-mono text-muted" style="font-size:11px;">${Utils.formatDate(r.lastInAt)}</span>`
          : `<span class="text-muted">-</span>`,
      },
      {
        key: '_actions', label: t('common.actions'), width: '170px', sortable: false,
        render: (r) => `
          <button class="btn btn-sm btn-ghost" data-action="inbound" data-mat="${r.materialId}" data-wh="${r.warehouseId}">${t('inventory.inbound')}</button>
          <button class="btn btn-sm btn-ghost" data-action="adjust" data-mat="${r.materialId}" data-wh="${r.warehouseId}">${t('inventory.adjust')}</button>
        `,
      },
    ];

    // 给每行加一个 _value 方便排序
    const data = InventoryService.listAll().map(r => ({
      ...r,
      _value: (r.quantity || 0) * (r.avgCost || 0),
    }));

    dataTable = DataTable.create({
      mount: '#inventory-table',
      columns,
      data,
      customSearch: (row, keyword) => {
        const mat = MaterialRepo.find(row.materialId);
        const wh = WarehouseRepo.find(row.warehouseId);
        return Utils.fuzzyMatch(mat?.name, keyword) ||
               Utils.fuzzyMatch(mat?.spec, keyword) ||
               Utils.fuzzyMatch(wh?.name, keyword);
      },
      searchPlaceholder: t('inventory.searchPlaceholder'),
      filters: [
        { key: 'warehouseId', options: whOptions },
        {
          key: '_stockStatus',
          options: [
            { value: '', label: t('common.all') + ' · ' + t('common.status') },
            { value: 'low', label: t('inventory.statusLow') },
            { value: 'normal', label: t('inventory.statusNormal') },
            { value: 'negative', label: t('inventory.statusNegative') },
          ],
          predicate: (r, v) => {
            const qty = r.quantity || 0;
            const safety = r.safetyStock || 0;
            if (v === 'negative') return qty < 0;
            if (v === 'low') return qty >= 0 && qty < safety;
            if (v === 'normal') return qty >= safety;
            return true;
          }
        },
      ],
      defaultSortKey: '_value',
      defaultSortOrder: 'desc',
      actions: [
        { key: 'transfer', label: t('inventory.actionTransfer'), primary: false, onClick: () => openTransferModal() },
      ],
      pageSize: 15,
    });

    document.getElementById('inventory-table').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      e.stopPropagation();
      const action = btn.dataset.action;
      const matId = btn.dataset.mat;
      const whId = btn.dataset.wh;
      if (action === 'inbound') openInboundModal(matId, whId);
      else if (action === 'adjust') openAdjustModal(matId, whId);
    });
  }

  function refreshTable() {
    if (dataTable) {
      const data = InventoryService.listAll().map(r => ({
        ...r,
        _value: (r.quantity || 0) * (r.avgCost || 0),
      }));
      dataTable.setData(data);
    }
  }

  // ========== 入库弹窗 ==========
  function openInboundModal(materialId, warehouseId) {
    const mat = MaterialRepo.find(materialId);
    const wh = WarehouseRepo.find(warehouseId);
    const inv = InventoryService.getInventory(materialId, warehouseId);
    const defaultCost = inv?.avgCost || (mat?.price ? Math.round(mat.price * 0.7) : 0);

    Modal.open({
      title: t('inventory.inboundTitle'),
      width: 460,
      content: `
        <div style="padding:10px 14px; background:var(--bg-3); border-radius:4px; font-size:12px; margin-bottom:14px;">
          <div class="flex justify-between" style="margin-bottom:4px;">
            <span class="text-muted">${t('inventory.material')}</span>
            <span class="text-strong">${mat?.name || '-'} ${mat?.spec ? '(' + mat.spec + ')' : ''}</span>
          </div>
          <div class="flex justify-between" style="margin-bottom:4px;">
            <span class="text-muted">${t('inventory.warehouse')}</span>
            <span>${wh?.name || '-'}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted">${I18n.get()==='zh-CN'?'当前库存':'Current Stock'}</span>
            <span class="font-mono ${(inv?.quantity || 0) < 0 ? 'text-red' : ''}">${inv?.quantity || 0} ${mat?.unit || ''}</span>
          </div>
        </div>
        <div class="form-row">
          <label class="form-label">${t('inventory.inboundType')}</label>
          <select class="select w-full" id="in-type">
            <option value="purchase_in" selected>${tEnum('stockMovement','movementTypeEnum','purchase_in')}</option>
            <option value="production_in">${tEnum('stockMovement','movementTypeEnum','production_in')}</option>
            <option value="return_in">${tEnum('stockMovement','movementTypeEnum','return_in')}</option>
          </select>
        </div>
        <div class="form-row">
          <label class="form-label">${t('inventory.inboundQty')} <span class="required">*</span></label>
          <input class="input w-full" id="in-qty" type="number" min="1">
        </div>
        <div class="form-row">
          <label class="form-label">${t('inventory.inboundCost')}</label>
          <input class="input w-full" id="in-cost" type="number" min="0" step="0.01" value="${(defaultCost/100).toFixed(2)}">
        </div>
        <div class="form-row">
          <label class="form-label">${t('inventory.inboundSource')}</label>
          <input class="input w-full" id="in-source">
        </div>
        <div class="form-row">
          <label class="form-label">${t('common.remark')}</label>
          <input class="input w-full" id="in-remark">
        </div>
      `,
      buttons: [
        { label: t('common.cancel') },
        {
          label: t('common.confirm'),
          primary: true,
          onClick: () => {
            const qty = Number(document.getElementById('in-qty').value);
            const cost = Utils.dollarsToCents(document.getElementById('in-cost').value);
            const movType = document.getElementById('in-type').value;
            const source = document.getElementById('in-source').value;
            const remark = document.getElementById('in-remark').value;
            if (!qty || qty <= 0) { Toast.warning(t('inventory.validate_qtyPositive')); return false; }
            try {
              InventoryService.recordInbound({
                materialId, warehouseId, quantity: qty, unitCost: cost,
                movementType: movType, sourceNo: source, remark,
              }, 'emp_w01');
              Toast.success(t('inventory.inboundSuccess', qty, mat?.name));
            } catch (e) { Toast.error(e.message); return false; }
          }
        }
      ]
    });
  }

  // ========== 调整弹窗 ==========
  function openAdjustModal(materialId, warehouseId) {
    const mat = MaterialRepo.find(materialId);
    const wh = WarehouseRepo.find(warehouseId);
    const inv = InventoryService.getInventory(materialId, warehouseId);
    const currentQty = inv?.quantity || 0;

    Modal.open({
      title: t('inventory.adjustTitle'),
      width: 460,
      content: `
        <div style="padding:10px 14px; background:var(--bg-3); border-radius:4px; font-size:12px; margin-bottom:14px;">
          <div class="flex justify-between" style="margin-bottom:4px;">
            <span class="text-muted">${t('inventory.material')}</span>
            <span class="text-strong">${mat?.name || '-'}</span>
          </div>
          <div class="flex justify-between" style="margin-bottom:4px;">
            <span class="text-muted">${t('inventory.warehouse')}</span>
            <span>${wh?.name || '-'}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted">${t('inventory.adjustCurrentQty')}</span>
            <span class="font-mono">${currentQty} ${mat?.unit || ''}</span>
          </div>
        </div>
        <div class="form-row">
          <label class="form-label">${t('inventory.adjustNewQty')} <span class="required">*</span></label>
          <input class="input w-full" id="adj-qty" type="number" value="${currentQty}">
        </div>
        <div class="form-row">
          <label class="form-label">${t('inventory.adjustReason')} <span class="required">*</span></label>
          <input class="input w-full" id="adj-reason" placeholder="${I18n.get()==='zh-CN'?'如: 盘点调整 / 修正错账':'e.g. Stock-take / Fix error'}">
        </div>
      `,
      buttons: [
        { label: t('common.cancel') },
        {
          label: t('common.confirm'),
          primary: true,
          onClick: () => {
            const newQty = Number(document.getElementById('adj-qty').value);
            const reason = document.getElementById('adj-reason').value.trim();
            if (!reason) { Toast.warning(t('common.pleaseEnter')); return false; }
            if (newQty === currentQty) { Toast.info(I18n.get()==='zh-CN'?'数量未变':'No change'); return false; }
            try {
              InventoryService.adjustStock({
                materialId, warehouseId, newQty, reason,
              }, 'emp_w01');
              Toast.success(t('inventory.adjustSuccess'));
            } catch (e) { Toast.error(e.message); return false; }
          }
        }
      ]
    });
  }

  // ========== 调拨弹窗 ==========
  function openTransferModal() {
    const warehouses = WarehouseService.listActive();

    Modal.open({
      title: t('inventory.transferTitle'),
      width: 700,
      content: `
        <div class="grid gap-3" style="grid-template-columns: 1fr 1fr; margin-bottom:14px;">
          <div>
            <label class="form-label">${t('inventory.transferFrom')} <span class="required">*</span></label>
            <select class="select w-full" id="tf-from">
              <option value="">${t('whCommon.selectWarehouse')}</option>
              ${warehouses.map(w => `<option value="${w.id}">${w.name}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="form-label">${t('inventory.transferTo')} <span class="required">*</span></label>
            <select class="select w-full" id="tf-to">
              <option value="">${t('whCommon.selectWarehouse')}</option>
              ${warehouses.map(w => `<option value="${w.id}">${w.name}</option>`).join('')}
            </select>
          </div>
        </div>
        <div style="margin-bottom:8px;">
          <span class="form-label">${t('inventory.transferItems')}</span>
          <button class="btn btn-sm btn-secondary" id="tf-add" style="float:right;">${t('inventory.transferAddItem')}</button>
        </div>
        <div id="tf-items" style="min-height:60px; max-height:300px; overflow-y:auto;"></div>
        <div class="form-row">
          <label class="form-label">${t('common.remark')}</label>
          <input class="input w-full" id="tf-remark">
        </div>
      `,
      buttons: [
        { label: t('common.cancel') },
        {
          label: t('common.confirm'),
          primary: true,
          onClick: () => {
            const fromId = document.getElementById('tf-from').value;
            const toId = document.getElementById('tf-to').value;
            const remark = document.getElementById('tf-remark').value;
            if (!fromId || !toId) { Toast.warning(t('whCommon.selectWarehouse')); return false; }
            if (fromId === toId) { Toast.warning(t('inventory.validate_sameWarehouse')); return false; }
            const items = collectTransferItems();
            if (items.length === 0) { Toast.warning(I18n.get()==='zh-CN'?'请添加调拨物料':'Please add items'); return false; }
            try {
              const movements = InventoryService.transferStock({
                fromWarehouseId: fromId, toWarehouseId: toId,
                items, remark,
              }, 'emp_w01');
              Toast.success(t('inventory.transferSuccess', movements.length));
            } catch (e) {
              if (e.code === 'STOCK_INSUFFICIENT') {
                const mat = MaterialRepo.find(e.materialId);
                Toast.error(`${mat?.name || ''}: 需要${e.requested}, 仅有${e.available}`);
              } else { Toast.error(e.message); }
              return false;
            }
          }
        }
      ]
    });

    document.getElementById('tf-add').onclick = () => addTransferRow();
    document.getElementById('tf-from').onchange = () => updateTransferRows();
    addTransferRow();
  }

  function addTransferRow() {
    const container = document.getElementById('tf-items');
    const id = 'tf-row-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    const materials = MaterialRepo.list();
    const fromId = document.getElementById('tf-from').value;

    const div = document.createElement('div');
    div.id = id;
    div.style.cssText = 'display:grid; grid-template-columns: 2fr 1fr 80px 30px; gap:6px; margin-bottom:6px; align-items:center;';
    div.innerHTML = `
      <select class="select tf-mat-sel">
        <option value="">${t('whCommon.selectMaterial')}</option>
        ${materials.map(m => `<option value="${m.id}">${m.name}${m.spec ? ' (' + m.spec + ')' : ''}</option>`).join('')}
      </select>
      <input class="input tf-qty-input" type="number" min="1" placeholder="${t('inventory.transferQty')}">
      <span class="text-muted tf-avail" style="font-size:11px; font-family:var(--font-mono);">-</span>
      <button class="btn btn-sm btn-ghost" onclick="this.parentElement.remove()" style="padding:4px 8px;">×</button>
    `;
    container.appendChild(div);

    div.querySelector('.tf-mat-sel').addEventListener('change', (e) => {
      updateTransferAvail(div, e.target.value, fromId);
    });
  }

  function updateTransferAvail(rowEl, matId, fromId) {
    const span = rowEl.querySelector('.tf-avail');
    if (!matId || !fromId) { span.textContent = '-'; return; }
    const inv = InventoryService.getInventory(matId, fromId);
    span.textContent = inv ? `可用: ${inv.quantity}` : '可用: 0';
    span.style.color = (inv?.quantity || 0) === 0 ? 'var(--red)' : 'var(--text-3)';
  }

  function updateTransferRows() {
    const fromId = document.getElementById('tf-from').value;
    document.querySelectorAll('#tf-items > div').forEach(row => {
      const sel = row.querySelector('.tf-mat-sel');
      updateTransferAvail(row, sel.value, fromId);
    });
  }

  function collectTransferItems() {
    const items = [];
    document.querySelectorAll('#tf-items > div').forEach(row => {
      const matId = row.querySelector('.tf-mat-sel').value;
      const qty = Number(row.querySelector('.tf-qty-input').value);
      if (matId && qty > 0) items.push({ materialId: matId, quantity: qty });
    });
    return items;
  }

  // ===== 顶部按钮入口(无 materialId,提供完整表单)=====
  function openInboundFromTop() {
    openInboundModalFull();
  }

  function openAdjustFromTop() {
    openAdjustModalFull();
  }

  function openTransferFromTop() {
    // 已有 openTransferModal,直接调
    openTransferModal();
  }

  /**
   * 完整入库弹窗 - 选类型 + 选仓 + 多行物料
   */
  function openInboundModalFull() {
    const isZh = I18n.get() === 'zh-CN';
    const warehouses = WarehouseService.list();
    const materials = MaterialRepo.list();

    Modal.open({
      title: t('inbound.new'),
      width: 760,
      content: `
        <div style="display:flex; flex-direction:column; gap:14px;">
          <div class="form-row" style="grid-template-columns: 1fr 1fr; gap:14px;">
            <div>
              <label class="form-label">${t('inbound.formType')} <span class="required">*</span></label>
              <select class="select w-full" id="ib-type">
                <option value="purchase">${t('inbound.typePurchase')}</option>
                <option value="production">${t('inbound.typeProduction')}</option>
                <option value="return">${t('inbound.typeReturn')}</option>
                <option value="initial">${t('inbound.typeInitial')}</option>
                <option value="gain">${t('inbound.typeGain')}</option>
              </select>
            </div>
            <div>
              <label class="form-label">${t('inbound.formWarehouse')} <span class="required">*</span></label>
              <div style="display:flex; gap:4px;">
                <select class="select" id="ib-warehouse" style="flex:1;">
                  ${warehouses.map(w => `<option value="${w.id}">${w.name}</option>`).join('')}
                </select>
                <button type="button" class="esel-btn esel-add" id="ib-add-wh" title="${isZh?'新建仓库':'Add Warehouse'}"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/></svg></button>
                <button type="button" class="esel-btn esel-edit" id="ib-edit-wh" title="${isZh?'编辑仓库':'Edit Warehouse'}"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M11 2.5 l2.5 2.5 -8.5 8.5 H2.5 V11 z"/></svg></button>
              </div>
            </div>
          </div>

          <!-- 类型相关字段 -->
          <div id="ib-type-fields"></div>

          <div class="form-row" style="grid-template-columns: 1fr 1fr; gap:14px;">
            <div>
              <label class="form-label">${t('inbound.formInboundDate')}</label>
              <input class="input w-full" id="ib-date" type="date" value="${Utils.today()}">
            </div>
            <div>
              <label class="form-label">${t('inbound.formSourceRef')}</label>
              <input class="input w-full" id="ib-source-ref" placeholder="">
            </div>
          </div>

          <div>
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
              <span class="text-strong" style="font-size:13px;">${t('inbound.formItems')} <span class="required">*</span></span>
              <button class="btn btn-sm btn-secondary" id="ib-add-item">${t('inbound.formAddItem')}</button>
            </div>
            <div id="ib-items-table" style="border:1px solid var(--border-1); border-radius:4px; overflow:hidden;">
              <table style="width:100%; font-size:12px; border-collapse:collapse;">
                <thead>
                  <tr style="background:var(--bg-3);">
                    <th style="padding:6px 8px; text-align:left;">${t('inbound.formItemMaterial')}</th>
                    <th style="padding:6px 8px; text-align:right; width:100px;">${t('inbound.formItemQty')}</th>
                    <th style="padding:6px 8px; text-align:right; width:120px;" id="th-cost">${t('inbound.formItemUnitCost')}</th>
                    <th style="padding:6px 8px; text-align:right; width:120px;">${t('inbound.formItemTotal')}</th>
                    <th style="padding:6px 8px; width:30px;"></th>
                  </tr>
                </thead>
                <tbody id="ib-items-tbody"></tbody>
              </table>
            </div>
            <div style="text-align:right; margin-top:6px; font-size:13px;">
              ${isZh?'合计':'Total'}: <span class="font-mono text-strong" id="ib-total-amount">$0.00</span> / <span class="font-mono" id="ib-total-qty">0</span> ${isZh?'件':'units'}
            </div>
          </div>

          <div>
            <label class="form-label">${t('inbound.formRemark')}</label>
            <textarea class="input w-full" id="ib-remark" rows="2"></textarea>
          </div>
        </div>
      `,
      buttons: [
        { label: t('common.cancel') },
        {
          label: t('common.confirm'),
          primary: true,
          onClick: () => submitInboundForm(),
        }
      ]
    });

    renderTypeFields('purchase');
    addItemRow();

    document.getElementById('ib-type').addEventListener('change', e => {
      renderTypeFields(e.target.value);
      // 更新表头(非采购单价隐藏)
      const th = document.getElementById('th-cost');
      if (e.target.value === 'purchase') {
        th.textContent = t('inbound.formItemUnitCost');
        th.style.display = '';
      } else {
        th.textContent = t('inbound.formItemUnitCost');
      }
    });
    document.getElementById('ib-add-item').addEventListener('click', addItemRow);

    // 仓库 + 新建 / 编辑
    document.getElementById('ib-add-wh')?.addEventListener('click', () => {
      const isZh = I18n.get() === 'zh-CN';
      _warehouseModal(null, (created) => {
        const sel = document.getElementById('ib-warehouse');
        if (sel) {
          const opt = new Option(created.name, created.id, true, true);
          sel.add(opt);
          sel.value = created.id;
        }
      });
    });
    document.getElementById('ib-edit-wh')?.addEventListener('click', () => {
      const sel = document.getElementById('ib-warehouse');
      const whId = sel?.value;
      if (!whId) return;
      _warehouseModal(whId, (updated) => {
        const opt = sel.options[sel.selectedIndex];
        if (opt && updated) opt.text = updated.name;
      });
    });
  }

  function renderTypeFields(type) {
    const isZh = I18n.get() === 'zh-CN';
    const c = document.getElementById('ib-type-fields');
    if (!c) return;
    if (type === 'purchase') {
      const suppliers = _getSupplierList();
      c.innerHTML = `
        <div class="form-row" style="grid-template-columns: 1fr 1fr; gap:14px;">
          <div>
            <label class="form-label">${t('inbound.formSupplier')} <span class="required">*</span></label>
            <div style="display:flex; gap:4px;">
              <input class="input" id="ib-supplier" list="ib-supplier-list" style="flex:1;" placeholder="${t('inbound.formSupplierPlaceholder')}">
              <datalist id="ib-supplier-list">
                ${suppliers.map(s => `<option value="${s}">`).join('')}
              </datalist>
              <button type="button" class="esel-btn esel-add" id="ib-save-supplier" title="${isZh?'保存供应商':'Save Supplier'}"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/></svg></button>
            </div>
            <div class="text-muted" style="font-size:10px; margin-top:3px;">${isZh?'可直接输入或从历史选择':'Type or pick from history'}</div>
          </div>
          <div>
            <label class="form-label">${t('inbound.formContact')}</label>
            <input class="input w-full" id="ib-supplier-contact" placeholder="">
          </div>
        </div>
      `;
      // 保存供应商按钮
      document.getElementById('ib-save-supplier')?.addEventListener('click', () => {
        const name = document.getElementById('ib-supplier')?.value.trim();
        if (!name) return;
        _saveSupplier(name);
        Toast.success(isZh?`已保存供应商 "${name}" 到历史`:`Saved "${name}"`);
      });
    } else {
      c.innerHTML = '';
    }
    // 更新 sourceRef 占位
    const ref = document.getElementById('ib-source-ref');
    if (ref) {
      if (type === 'purchase')   ref.placeholder = t('inbound.formSourceRefPlaceholderPurchase');
      else if (type === 'production') ref.placeholder = t('inbound.formSourceRefPlaceholderProduction');
      else if (type === 'return')     ref.placeholder = t('inbound.formSourceRefPlaceholderReturn');
      else ref.placeholder = '';
    }
  }

  function addItemRow() {
    const materials = MaterialRepo.list();
    const tbody = document.getElementById('ib-items-tbody');
    if (!tbody) return;
    const idx = tbody.children.length;
    const tr = document.createElement('tr');
    tr.style.borderTop = '1px solid var(--border-1)';
    tr.innerHTML = `
      <td style="padding:6px 8px;">
        <select class="select w-full ib-mat" style="width:100%;">
          <option value="">— ${I18n.get()==='zh-CN'?'选择物料':'Select material'} —</option>
          ${materials.map(m => `<option value="${m.id}">${m.name} · ${m.spec}</option>`).join('')}
        </select>
      </td>
      <td style="padding:6px 8px;">
        <input class="input ib-qty" type="number" min="0" step="0.01" placeholder="0" style="width:100%; text-align:right;">
      </td>
      <td style="padding:6px 8px;">
        <input class="input ib-cost" type="number" min="0" step="0.01" placeholder="0.00" style="width:100%; text-align:right;">
      </td>
      <td style="padding:6px 8px; text-align:right; font-family:var(--font-mono);" class="ib-subtotal">$0.00</td>
      <td style="padding:6px 8px; text-align:center;">
        <button class="btn-icon ib-del" type="button" style="background:transparent; border:0; color:var(--text-3); cursor:pointer;">×</button>
      </td>
    `;
    tbody.appendChild(tr);
    tr.querySelector('.ib-qty').addEventListener('input', recalcItems);
    tr.querySelector('.ib-cost').addEventListener('input', recalcItems);
    tr.querySelector('.ib-del').addEventListener('click', () => { tr.remove(); recalcItems(); });
  }

  function recalcItems() {
    let totalAmount = 0, totalQty = 0;
    document.querySelectorAll('#ib-items-tbody tr').forEach(tr => {
      const qty = parseFloat(tr.querySelector('.ib-qty').value) || 0;
      const cost = parseFloat(tr.querySelector('.ib-cost').value) || 0;
      const subtotal = qty * cost;
      tr.querySelector('.ib-subtotal').textContent = `$${subtotal.toFixed(2)}`;
      totalAmount += subtotal;
      totalQty += qty;
    });
    document.getElementById('ib-total-amount').textContent = `$${totalAmount.toFixed(2)}`;
    document.getElementById('ib-total-qty').textContent = totalQty.toFixed(2).replace(/\.00$/, '');
  }

  function submitInboundForm() {
    const type = document.getElementById('ib-type').value;
    const warehouseId = document.getElementById('ib-warehouse').value;
    const inboundDate = document.getElementById('ib-date').value;
    const sourceRef = document.getElementById('ib-source-ref').value.trim();
    const remark = document.getElementById('ib-remark').value.trim();
    const supplier = document.getElementById('ib-supplier')?.value.trim() || '';
    const supplierContact = document.getElementById('ib-supplier-contact')?.value.trim() || '';

    const items = [];
    document.querySelectorAll('#ib-items-tbody tr').forEach(tr => {
      const matId = tr.querySelector('.ib-mat').value;
      const qty = parseFloat(tr.querySelector('.ib-qty').value) || 0;
      const cost = parseFloat(tr.querySelector('.ib-cost').value) || 0;
      if (matId && qty > 0) {
        items.push({
          materialId: matId,
          quantity: qty,
          unitCost: Math.round(cost * 100),  // 转分
        });
      }
    });

    if (items.length === 0) {
      Toast.warning(t('inbound.validateNoItems'));
      return false;
    }

    try {
      const ib = InboundService.create({
        type, warehouseId, inboundDate, sourceRef, remark,
        supplier, supplierContact, items,
      }, 'emp_w01');
      // 立即确认(草稿没必要,简化流程)
      InboundService.confirm(ib.id, 'emp_w01');
      Toast.success(t('inbound.confirmSuccess', ib.no));
      EventBus.emit('inventory.changed', { reason: 'inbound' });
    } catch (e) {
      Toast.error(e.message);
      return false;
    }
  }

  /**
   * 完整调整库存弹窗(对没材料-仓库组合也能用)
   */
  function openAdjustModalFull() {
    const isZh = I18n.get() === 'zh-CN';
    const warehouses = WarehouseService.list();
    const materials = MaterialRepo.list();
    Modal.open({
      title: isZh?'库存调整':'Adjust Inventory',
      width: 480,
      content: `
        <div style="display:flex; flex-direction:column; gap:12px;">
          <div>
            <label class="form-label">${isZh?'物料':'Material'} <span class="required">*</span></label>
            <select class="select w-full" id="adj-mat">
              <option value="">— ${isZh?'选择物料':'Select'} —</option>
              ${materials.map(m => `<option value="${m.id}">${m.name} · ${m.spec}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="form-label">${isZh?'仓库':'Warehouse'} <span class="required">*</span></label>
            <select class="select w-full" id="adj-wh">
              ${warehouses.map(w => `<option value="${w.id}">${w.name}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="form-label">${isZh?'调整数量':'Adjustment'} <span class="required">*</span></label>
            <input class="input w-full" id="adj-qty" type="number" step="0.01" placeholder="${isZh?'正数加,负数减':'+/- amount'}">
            <div class="text-muted" style="font-size:11px; margin-top:4px;">${isZh?'例:+50(盘盈),-30(盘亏)':'e.g. +50 (gain), -30 (loss)'}</div>
          </div>
          <div>
            <label class="form-label">${isZh?'原因':'Reason'} <span class="required">*</span></label>
            <textarea class="input w-full" id="adj-reason" rows="2" placeholder="${isZh?'如:盘点调整 / 报废 / 质检不合格':'e.g. Stocktake / scrap / QC fail'}"></textarea>
          </div>
        </div>
      `,
      buttons: [
        { label: t('common.cancel') },
        {
          label: t('common.confirm'),
          primary: true,
          onClick: () => {
            const matId = document.getElementById('adj-mat').value;
            const whId = document.getElementById('adj-wh').value;
            const qty = parseFloat(document.getElementById('adj-qty').value);
            const reason = document.getElementById('adj-reason').value.trim();
            if (!matId) { Toast.warning(isZh?'请选择物料':'Select material'); return false; }
            if (!qty) { Toast.warning(isZh?'请填写调整数量':'Enter adjustment'); return false; }
            if (!reason) { Toast.warning(isZh?'请填写原因':'Enter reason'); return false; }
            try {
              InventoryService.adjustStock({
                materialId: matId, warehouseId: whId, quantity: qty, reason,
              }, 'emp_w01');
              Toast.success(isZh?'调整成功':'Adjusted');
              EventBus.emit('inventory.changed', { reason: 'adjust' });
            } catch (e) {
              Toast.error(e.message);
              return false;
            }
          }
        }
      ]
    });
  }

  /** 供应商历史(localStorage 简单存储) */
  function _getSupplierList() {
    try { return JSON.parse(localStorage.getItem('wood_erp_suppliers') || '[]'); } catch { return []; }
  }
  function _saveSupplier(name) {
    const list = _getSupplierList();
    if (!list.includes(name)) { list.unshift(name); if (list.length > 50) list.pop(); }
    try { localStorage.setItem('wood_erp_suppliers', JSON.stringify(list)); } catch {}
  }

  /** 仓库快速新建/编辑 Modal */
  function _warehouseModal(warehouseId, onDone) {
    const isZh = I18n.get() === 'zh-CN';
    const wh = warehouseId ? WarehouseRepo.find(warehouseId) : null;
    Modal.open({
      title: warehouseId ? (isZh?'编辑仓库':'Edit Warehouse') : (isZh?'新建仓库':'New Warehouse'),
      width: 440,
      content: `
        <div style="display:grid; gap:12px;">
          <div>
            <label class="form-label">${isZh?'仓库名称':'Name'} <span style="color:var(--red);">*</span></label>
            <input id="wh-name" class="input w-full" value="${wh?.name||''}" placeholder="${isZh?'如:A 仓、成品库':'e.g. Warehouse A'}">
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div>
              <label class="form-label">${isZh?'仓库代码':'Code'}</label>
              <input id="wh-code" class="input w-full" value="${wh?.code||''}" ${warehouseId?'disabled':''} placeholder="${isZh?'留空自动':'Auto'}">
            </div>
            <div>
              <label class="form-label">${isZh?'类型':'Type'}</label>
              <select id="wh-type" class="select w-full">
                <option value="main" ${(wh?.type||'main')==='main'?'selected':''}>${isZh?'主仓':'Main'}</option>
                <option value="finished" ${wh?.type==='finished'?'selected':''}>${isZh?'成品仓':'Finished'}</option>
                <option value="raw" ${wh?.type==='raw'?'selected':''}>${isZh?'原料仓':'Raw'}</option>
                <option value="transit" ${wh?.type==='transit'?'selected':''}>${isZh?'中转仓':'Transit'}</option>
              </select>
            </div>
          </div>
          <div>
            <label class="form-label">${isZh?'地址':'Location'}</label>
            <input id="wh-addr" class="input w-full" value="${wh?.address||''}">
          </div>
        </div>
      `,
      buttons: [
        { label: isZh?'取消':'Cancel' },
        { label: warehouseId?(isZh?'保存':'Save'):(isZh?'创建':'Create'), primary: true, onClick: () => {
          const name = document.getElementById('wh-name').value.trim();
          if (!name) { Toast.warning(isZh?'请输入仓库名称':'Name required'); return false; }
          const data = {
            name,
            code: document.getElementById('wh-code').value.trim() || ('WH-' + Date.now().toString(36).toUpperCase().slice(-4)),
            type: document.getElementById('wh-type').value,
            address: document.getElementById('wh-addr').value.trim(),
            status: 'active',
          };
          try {
            let result;
            if (warehouseId) {
              WarehouseRepo.update(warehouseId, data);
              result = WarehouseRepo.find(warehouseId);
            } else {
              result = WarehouseRepo.create({ ...data, id: 'wh_' + Utils.uuid().slice(0,8), createdAt: Utils.now() });
            }
            Toast.success(isZh?'已保存':'Saved');
            if (onDone) onDone(result);
          } catch (e) { Toast.error(e.message); return false; }
        }},
      ],
    });
  }

  return { init, openInboundFromTop, openAdjustFromTop, openTransferFromTop };
})();

window.InventoryModule = InventoryModule;
