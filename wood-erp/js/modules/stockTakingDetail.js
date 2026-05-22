/**
 * 盘点单详情模块
 * @module modules/stockTakingDetail
 *
 * 三个模式:
 *   ?id=xxx 草稿/盘点中 → 可编辑(填实盘数)
 *   ?id=xxx 已完成/已取消 → 只读
 */

const StockTakingDetailModule = (function () {
  'use strict';

  let model = null;
  let warehouse = null;
  let isDirty = false;

  function init(ctx) {
    const params = { get: function(k) { return (ctx && ctx.params && ctx.params[k]) || (ctx && ctx.query && ctx.query[k]); } };
    const id = params.get('id');
    if (!id) {
      document.querySelector('.app-main').innerHTML = `<div class="empty-state">${t('common.noData')}</div>`;
      return;
    }
    const s = StockTakingService.findById(id);
    if (!s) {
      document.querySelector('.app-main').innerHTML = `<div class="empty-state">${t('common.noData')}</div>`;
      return;
    }
    model = Utils.deepClone(s);
    warehouse = WarehouseRepo.find(model.warehouseId);

    renderAll();
    window.addEventListener('beforeunload', (e) => {
      if (isDirty) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  function isEditable() {
    return model.status === 'draft' || model.status === 'in_progress';
  }

  function renderAll() {
    renderHeader();
    renderSummary();
    renderDocHeader();
    renderItems();
    renderActions();
  }

  function renderHeader() {
    document.title = `${model.no} · ${t('brand.companyCn')}`;
    document.getElementById('page-title').innerHTML = `
      <span class="font-mono">${model.no}</span>
      <span style="margin-left:10px;">${Badge.render('stockTaking','statusEnum',model.status)}</span>
    `;
    document.getElementById('page-subtitle').textContent =
      `${warehouse?.name || '-'} · ${Utils.formatDate(model.takingDate)}`;
  }

  function renderSummary() {
    document.getElementById('summary-grid').innerHTML = `
      <div class="summary-grid">
        <div class="summary-card in">
          <div class="label">${I18n.get()==='zh-CN'?'盘盈数量':'Surplus Qty'}</div>
          <div class="value">+${Utils.formatNumber(model.totalDiffIn || 0)}</div>
        </div>
        <div class="summary-card out">
          <div class="label">${I18n.get()==='zh-CN'?'盘亏数量':'Shortage Qty'}</div>
          <div class="value">-${Utils.formatNumber(model.totalDiffOut || 0)}</div>
        </div>
        <div class="summary-card diff">
          <div class="label">${t('stockTaking.diffCost')}</div>
          <div class="value">${(model.totalDiffCost || 0) >= 0 ? '+' : ''}${Sensitive.cost(model.totalDiffCost || 0)}</div>
        </div>
      </div>
    `;
  }

  function renderDocHeader() {
    document.getElementById('doc-header').innerHTML = `
      <div class="doc-header">
        <div class="doc-field">
          <span class="doc-field-label">${t('inventory.warehouse')}</span>
          <span class="doc-field-value text-strong">${warehouse?.name || '-'}</span>
        </div>
        <div class="doc-field">
          <span class="doc-field-label">${t('stockTaking.takingDate')}</span>
          <span class="doc-field-value font-mono">${Utils.formatDate(model.takingDate)}</span>
        </div>
        <div class="doc-field">
          <span class="doc-field-label">${t('common.remark')}</span>
          <span class="doc-field-value">${model.remark || '-'}</span>
        </div>
        ${model.completedAt ? `
          <div class="doc-field">
            <span class="doc-field-label">${t('stockTaking.completedAt')}</span>
            <span class="doc-field-value font-mono">${Utils.formatDateTime(model.completedAt)}</span>
          </div>
        ` : `
          <div class="doc-field">
            <span class="doc-field-label">${I18n.get()==='zh-CN'?'盘点人':'Operator'}</span>
            <span class="doc-field-value">${(EmployeeRepo.find(model.operatorId) || {}).name || '-'}</span>
          </div>
        `}
      </div>
    `;
  }

  function renderItems() {
    const editable = isEditable();
    document.getElementById('items-title').textContent =
      I18n.get()==='zh-CN'
        ? `盘点明细(${model.items.length} 个物料)`
        : `Items (${model.items.length})`;
    document.getElementById('btn-fill-all').style.display = editable ? 'inline-flex' : 'none';

    const head = `
      <thead>
        <tr>
          <th style="width:40px;">#</th>
          <th>${t('inventory.material')}</th>
          <th style="width:140px;">${t('common.spec')}</th>
          <th style="width:60px;">${t('common.unit')}</th>
          <th style="width:90px;" class="col-money">${t('stockTaking.systemQty')}</th>
          <th style="width:110px;" class="col-money">${t('stockTaking.actualQty')}</th>
          <th style="width:90px;" class="col-money">${t('stockTaking.diffQty')}</th>
          <th style="width:100px;" class="col-money">${t('inventory.avgCost')}</th>
          <th style="width:120px;" class="col-money">${t('stockTaking.diffCost')}</th>
        </tr>
      </thead>
    `;

    const rowsHtml = model.items.map((it, idx) => {
      const mat = MaterialRepo.find(it.materialId);
      const hasActual = it.actualQty !== null && it.actualQty !== undefined && it.actualQty !== '';
      const diff = hasActual ? (it.actualQty - it.systemQty) : null;
      const diffCost = diff !== null ? diff * (it.unitCost || 0) : null;

      let rowCls = '';
      if (diff !== null && diff > 0) rowCls = 'has-surplus';
      else if (diff !== null && diff < 0) rowCls = 'has-shortage';

      return `
        <tr class="${rowCls}" data-line-idx="${idx}">
          <td>${idx + 1}</td>
          <td><span class="text-strong">${mat?.name || it.materialName}</span></td>
          <td><span class="text-muted">${it.spec || mat?.spec || '-'}</span></td>
          <td>${it.unit || mat?.unit || '-'}</td>
          <td class="col-money font-mono">${Utils.formatNumber(it.systemQty)}</td>
          <td class="col-money">
            ${editable ? `
              <input class="input" type="number" min="0" data-line-idx="${idx}"
                     value="${hasActual ? it.actualQty : ''}"
                     placeholder="${it.systemQty}">
            ` : `<span class="font-mono">${hasActual ? Utils.formatNumber(it.actualQty) : '-'}</span>`}
          </td>
          <td class="col-money">
            ${diff === null
              ? '<span class="text-muted">-</span>'
              : (diff === 0
                ? '<span class="font-mono text-muted">0</span>'
                : `<span class="font-mono ${diff > 0 ? 'text-emerald' : 'text-red'}">${diff > 0 ? '+' : ''}${diff}</span>`)
            }
          </td>
          <td class="col-money font-mono text-muted" style="font-size:11px;">${Sensitive.cost(it.unitCost || 0)}</td>
          <td class="col-money">
            ${diffCost === null
              ? '<span class="text-muted">-</span>'
              : (diffCost === 0
                ? '<span class="font-mono text-muted">$0.00</span>'
                : `<span class="font-mono ${diffCost > 0 ? 'text-emerald' : 'text-red'}">${diffCost > 0 ? '+' : ''}${Sensitive.cost(diffCost)}</span>`)
            }
          </td>
        </tr>
      `;
    }).join('');

    document.getElementById('items-table').innerHTML = head + `<tbody>${rowsHtml}</tbody>`;

    if (editable) {
      document.querySelectorAll('.items-table input[data-line-idx]').forEach(input => {
        input.addEventListener('input', (e) => {
          const idx = Number(e.target.dataset.lineIdx);
          const val = e.target.value;
          model.items[idx].actualQty = val === '' ? null : Number(val);
          markDirty();
          // 局部更新
          const item = model.items[idx];
          const diff = item.actualQty !== null ? item.actualQty - item.systemQty : null;
          item.diffQty = diff || 0;
          item.diffCost = (diff || 0) * (item.unitCost || 0);
          // 重新计算汇总
          recalcSummary();
          renderSummary();
          // 重新渲染该行
          renderItems();
        });
      });

      document.getElementById('btn-fill-all').onclick = () => {
        model.items.forEach(it => {
          if (it.actualQty === null || it.actualQty === undefined || it.actualQty === '') {
            it.actualQty = it.systemQty;
            it.diffQty = 0;
            it.diffCost = 0;
          }
        });
        markDirty();
        recalcSummary();
        renderAll();
      };
    }
  }

  function recalcSummary() {
    model.totalDiffIn = model.items
      .filter(i => (i.diffQty || 0) > 0)
      .reduce((s, i) => s + i.diffQty, 0);
    model.totalDiffOut = model.items
      .filter(i => (i.diffQty || 0) < 0)
      .reduce((s, i) => s + Math.abs(i.diffQty), 0);
    model.totalDiffCost = model.items.reduce((s, i) => s + (i.diffCost || 0), 0);
  }

  function renderActions() {
    const buttons = [];
    if (model.status === 'draft') {
      buttons.push(`<button class="btn btn-secondary" data-action="save">${t('common.save')}</button>`);
      buttons.push(`<button class="btn btn-primary" data-action="complete">${t('stockTaking.complete')}</button>`);
      buttons.push(`<button class="btn btn-danger" data-action="cancelTake">${t('stockTaking.cancel')}</button>`);
    } else if (model.status === 'in_progress') {
      buttons.push(`<button class="btn btn-secondary" data-action="save">${t('common.save')}</button>`);
      buttons.push(`<button class="btn btn-primary" data-action="complete">${t('stockTaking.complete')}</button>`);
      buttons.push(`<button class="btn btn-danger" data-action="cancelTake">${t('stockTaking.cancel')}</button>`);
    }
    buttons.push(`<button class="btn btn-secondary" data-action="print">${t('common.print')}</button>`);

    const wrap = document.getElementById('action-buttons');
    wrap.innerHTML = buttons.join('');
    wrap.onclick = (e) => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (action) handleAction(action);
    };
  }

  function markDirty() { isDirty = true; }
  function clearDirty() { isDirty = false; }

  function handleAction(action) {
    if (action === 'save') return doSave();
    if (action === 'complete') return doComplete();
    if (action === 'cancelTake') return doCancel();
    if (action === 'print') return window.print();
  }

  function doSave() {
    try {
      StockTakingService.update(model.id, { items: model.items }, 'emp_w01');
      Toast.success(t('common.saved'));
      clearDirty();
    } catch (e) { Toast.error(e.message); }
  }

  function doComplete() {
    // 先保存
    try { StockTakingService.update(model.id, { items: model.items }, 'emp_w01'); }
    catch (e) { Toast.error(e.message); return; }

    const unfilled = model.items.filter(i =>
      i.actualQty === null || i.actualQty === undefined || i.actualQty === ''
    ).length;
    if (unfilled > 0) {
      Toast.warning(t('stockTaking.validate_unfilledItems', unfilled));
      return;
    }

    Modal.confirm({
      title: t('stockTaking.completeTitle'),
      message: t('stockTaking.completeConfirm', model.no),
      onConfirm: () => {
        try {
          StockTakingService.complete(model.id, 'emp_w01');
          Toast.success(t('stockTaking.completeSuccess'));
          clearDirty();
          setTimeout(() => location.reload(), 500);
        } catch (e) { Toast.error(e.message); }
      }
    });
  }

  function doCancel() {
    Modal.open({
      title: t('stockTaking.cancelTitle'),
      width: 460,
      content: `
        <div class="form-row" style="grid-template-columns:1fr">
          <div>
            <label class="form-label">${t('common.reason')} <span class="required">*</span></label>
            <input class="input w-full" id="cancel-reason" placeholder="${t('stockTaking.cancelReasonPlaceholder')}">
          </div>
        </div>
      `,
      buttons: [
        { label: t('common.cancel') },
        {
          label: t('common.confirm'),
          danger: true,
          onClick: () => {
            const reason = document.getElementById('cancel-reason').value.trim();
            if (!reason) { Toast.warning(t('common.pleaseEnter')); return false; }
            try {
              StockTakingService.cancel(model.id, reason, 'emp_w01');
              Toast.success(t('stockTaking.cancelSuccess'));
              setTimeout(() => location.reload(), 400);
            } catch (e) { Toast.error(e.message); return false; }
          }
        }
      ]
    });
  }

  return { init };
})();

window.StockTakingDetailModule = StockTakingDetailModule;
