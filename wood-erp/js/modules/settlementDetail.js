/**
 * 结算单详情/创建模块
 * @module modules/settlementDetail
 *
 * 模式:
 *   ?mode=create [&customer=ID&type=auto|manual&group=N]   创建模式
 *   ?id=xxx                                                 查看模式
 */

const SettlementDetailModule = (function () {
  'use strict';

  let model = null;
  let mode = 'view';
  let isDirty = false;
  let customer = null;

  // 创建模式专用
  let selectedBatch = null;       // 当前选中的批次 { creationType, groupNo, deliveries, totalAmount }
  let availableBatches = [];      // 该客户的所有可选批次
  let adjustment = 0;
  let adjustmentReason = '';
  let manualReason = '';
  let remark = '';

  function init(ctx) {
    const params = { get: function(k) { return (ctx && ctx.params && ctx.params[k]) || (ctx && ctx.query && ctx.query[k]); } };
    const id = params.get('id');
    const m = params.get('mode');

    if (m === 'create') {
      mode = 'create';
      model = makeEmpty();
      const cid = params.get('customer');
      const type = params.get('type');
      const group = params.get('group');
      if (cid) {
        customer = CustomerService.findById(cid);
        if (customer) {
          model.customerId = cid;
          loadBatchesForCustomer(cid);
          // 预选批次
          if (type && (type === 'auto' || type === 'manual')) {
            if (type === 'auto' && group) {
              selectedBatch = availableBatches.find(b => b.creationType === 'auto' && String(b.groupNo) === String(group));
            } else if (type === 'manual') {
              selectedBatch = availableBatches.find(b => b.creationType === 'manual');
            }
          }
        }
      }
    } else if (id) {
      const s = SettlementService.findById(id);
      if (!s) {
        document.querySelector('.app-main').innerHTML = `<div class="empty-state">${t('common.noData')}</div>`;
        return;
      }
      mode = 'view';
      model = Utils.deepClone(s);
      customer = CustomerService.findById(model.customerId);
    } else {
      document.querySelector('.app-main').innerHTML = `<div class="empty-state">${t('common.noData')}</div>`;
      return;
    }

    renderAll();

    window.addEventListener('beforeunload', (e) => {
      if (isDirty) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  function makeEmpty() {
    return {
      id: null,
      no: t('common.newUnsaved'),
      customerId: '',
      salesOrderIds: [],
      deliveryIds: [],
      truckCount: 0,
      settlementDate: Utils.today(),
      creationType: 'auto',
      manualReason: '',
      triggerReason: '',
      deliveredAmount: 0,
      adjustment: 0,
      adjustmentReason: '',
      payableAmount: 0,
      paidAmount: 0,
      unpaidAmount: 0,
      payments: [],
      dueDate: '',
      status: 'pending_confirm',
      remark: '',
    };
  }

  function loadBatchesForCustomer(customerId) {
    const r = SettlementService.getPendingForCustomer(customerId);
    availableBatches = [];
    r.groupedBatches.forEach(b => {
      availableBatches.push({
        creationType: 'auto',
        groupNo: b.groupNo,
        deliveries: b.deliveries,
        totalAmount: b.totalAmount,
        truckCount: b.deliveries.length,
      });
    });
    if (r.manualPending.length > 0) {
      availableBatches.push({
        creationType: 'manual',
        groupNo: null,
        deliveries: r.manualPending,
        totalAmount: r.manualPending.reduce((s, d) => s + d.totalAmount, 0),
        truckCount: r.manualPending.length,
      });
    }
  }

  // ---------- 渲染 ----------
  function renderAll() {
    renderHeader();
    renderSummary();
    renderDocHeader();
    renderMainContent();
    renderActionButtons();
    renderTimeline();
  }

  function renderHeader() {
    document.title = `${model.no} · ${t('brand.companyCn')}`;
    let badges = '';
    if (mode !== 'create') {
      badges = `${Badge.render('settlement','statusEnum',model.status)}`;
      // 逾期天数
      if (model.status === 'overdue' && model.overdueDays > 0) {
        badges += `<span class="text-red" style="margin-left:8px; font-size:12px;">${t('settlement.daysFromDue', model.overdueDays)}</span>`;
      }
    }
    // 触发方式标签(auto/forced/manual)
    let triggerBadge = '';
    if (model.triggerType) {
      const trigCfg = {
        auto:   { label: t('settlementCenter.tagAuto'),   bg:'var(--blue-bg)',  color:'var(--blue)' },
        forced: { label: t('settlementCenter.tagForced'), bg:'rgba(251,146,60,0.14)',  color:'#fb923c' },
        manual: { label: t('settlementCenter.tagManual'), bg:'rgba(148,163,184,0.14)', color:'#cbd5e1' },
      }[model.triggerType];
      if (trigCfg) {
        triggerBadge = `<span style="padding:2px 8px; border-radius:3px; font-size:11px; ${`background:${trigCfg.bg}; color:${trigCfg.color};`} margin-left: 8px;">${trigCfg.label}</span>`;
      }
    }

    document.getElementById('page-title').innerHTML = `
      <span class="font-mono">${model.no}</span>
      <span style="margin-left:10px;">${badges}</span>
      ${triggerBadge}
    `;
    if (customer) {
      let reasonRow = '';
      if (model.triggerReason) {
        reasonRow = `
          <div style="margin-top:6px; padding:6px 10px; background:var(--bg-3); border-radius:4px; font-size:11px;">
            <span class="text-muted">${I18n.get()==='zh-CN'?'触发原因':'Trigger Reason'}:</span>
            <span class="text-strong">${model.triggerReason}</span>
          </div>
        `;
      }
      document.getElementById('page-subtitle').innerHTML = `
        ${customer.name}
        <span style="color:var(--text-4); margin: 0 8px;">|</span>
        <span class="font-mono">${customer.code}</span>
        <span style="margin-left:10px;">${Badge.render('customer','riskLevelEnum',customer.riskLevel)}</span>
        ${reasonRow}
      `;
    } else {
      document.getElementById('page-subtitle').textContent = t('settlement.validate_needCustomer');
    }
  }

  function renderSummary() {
    const el = document.getElementById('summary-grid');
    if (mode === 'create' && !selectedBatch) {
      el.innerHTML = '';
      return;
    }

    const deliveredAmount = mode === 'create' ? selectedBatch.totalAmount : model.deliveredAmount;
    const payableAmount = mode === 'create' ? (deliveredAmount + adjustment) : model.payableAmount;
    const paidAmount = mode === 'create' ? 0 : model.paidAmount;
    const unpaidAmount = mode === 'create' ? payableAmount : model.unpaidAmount;
    const dueDate = mode === 'create'
      ? Utils.addDays(model.settlementDate, customer?.paymentDays || 30)
      : model.dueDate;

    let dueDisplay = Utils.formatDate(dueDate);
    if (mode !== 'create' && model.status !== 'paid' && model.status !== 'cancelled') {
      const today = Utils.today();
      const diff = Utils.diffDays(dueDate, new Date(today));
      // diff > 0 means overdue
      if (diff > 0) {
        dueDisplay += ` <span class="text-red" style="font-size:11px;">+${diff}d</span>`;
      } else if (diff > -7) {
        dueDisplay += ` <span class="text-amber" style="font-size:11px;">${diff}d</span>`;
      }
    }

    el.innerHTML = `
      <div class="summary-grid">
        <div class="summary-card payable">
          <div class="label">${t('settlement.payableAmount')}</div>
          <div class="value">${Utils.formatMoney(payableAmount)}</div>
        </div>
        <div class="summary-card paid">
          <div class="label">${t('settlement.paidAmount')}</div>
          <div class="value">${Utils.formatMoney(paidAmount)}</div>
        </div>
        <div class="summary-card unpaid">
          <div class="label">${t('settlement.unpaidAmount')}</div>
          <div class="value">${Utils.formatMoney(unpaidAmount)}</div>
        </div>
        <div class="summary-card due">
          <div class="label">${t('settlement.dueDate')}</div>
          <div class="value font-mono">${dueDisplay}</div>
        </div>
      </div>
    `;
  }

  function renderDocHeader() {
    const editable = (mode === 'create');
    const customers = editable ? _customersWithPending() : [];

    let html = `<div class="doc-header">`;

    if (editable && !customer) {
      html += `
        <div class="doc-field" style="grid-column: span 2;">
          <span class="doc-field-label">${t('delivery.customer')}</span>
          <select class="select" id="f-customer">
            <option value="">${t('settlement.selectCustomer')}</option>
            ${customers.map(c => `<option value="${c.id}">${c.name} (${c.code})</option>`).join('')}
          </select>
          <div class="form-help" style="font-size:10px;">${t('settlement.customerHint')}</div>
        </div>
      `;
    }

    html += `
      <div class="doc-field">
        <span class="doc-field-label">${t('settlement.settlementDate')}</span>
        ${editable ? `
          <input class="input" type="date" id="f-date" value="${model.settlementDate}">
        ` : `<span class="doc-field-value font-mono">${Utils.formatDate(model.settlementDate)}</span>`}
      </div>
      ${mode !== 'create' ? `
        <div class="doc-field">
          <span class="doc-field-label">${t('settlement.creationType')}</span>
          <span class="doc-field-value">${Badge.render('settlement','creationTypeEnum',model.creationType,{noDot:true})}</span>
        </div>
        <div class="doc-field">
          <span class="doc-field-label">${t('settlement.truckCount')}</span>
          <span class="doc-field-value font-mono">${model.truckCount}</span>
        </div>
        ${model.confirmedAt ? `
          <div class="doc-field">
            <span class="doc-field-label">${t('settlement.confirmedAt')}</span>
            <span class="doc-field-value font-mono">${Utils.formatDateTime(model.confirmedAt)}</span>
          </div>
        ` : ''}
        ${model.triggerReason ? `
          <div class="doc-field" style="grid-column: span 4;">
            <span class="doc-field-label">${t('settlement.triggerReason')}</span>
            <span class="doc-field-value">${model.triggerReason}</span>
          </div>
        ` : ''}
        ${model.manualReason ? `
          <div class="doc-field" style="grid-column: span 4;">
            <span class="doc-field-label">${t('settlement.manualReason')}</span>
            <span class="doc-field-value">${model.manualReason}</span>
          </div>
        ` : ''}
      ` : ''}
    `;

    html += `</div>`;
    document.getElementById('doc-header').innerHTML = html;

    if (editable) {
      const sel = document.getElementById('f-customer');
      if (sel) {
        sel.addEventListener('change', (e) => {
          customer = CustomerService.findById(e.target.value);
          model.customerId = e.target.value;
          if (customer) {
            loadBatchesForCustomer(customer.id);
            selectedBatch = null;
          }
          markDirty();
          renderAll();
        });
      }
      document.getElementById('f-date').addEventListener('change', (e) => {
        model.settlementDate = e.target.value;
        markDirty();
        renderSummary();
      });
    }
  }

  function renderMainContent() {
    const el = document.getElementById('main-content');
    if (mode === 'create') {
      el.innerHTML = renderCreateContent();
      bindCreateEvents();
    } else {
      el.innerHTML = renderViewContent();
    }
  }

  // ---------- 创建模式 ----------
  function renderCreateContent() {
    if (!customer) {
      return `<div class="empty-state">${t('settlement.validate_needCustomer')}</div>`;
    }
    if (availableBatches.length === 0) {
      return `<div class="empty-state">${t('settlement.noPendingBatches')}</div>`;
    }

    // 批次选择卡片
    const batchesHtml = availableBatches.map((b, idx) => {
      const isSelected = selectedBatch && b.creationType === selectedBatch.creationType
        && b.groupNo === selectedBatch.groupNo;
      const orderIds = Utils.unique(b.deliveries.map(d => d.salesOrderId));
      return `
        <div class="change-block" style="cursor:pointer; ${isSelected ? 'border-color: var(--accent); background: var(--accent-bg);' : ''}" data-batch-idx="${idx}">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div>
              <span style="font-weight:500;">
                ${b.creationType === 'auto'
                  ? '🚛 ' + t('settlement.batchGroupNo', b.groupNo)
                  : '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M8 1.5 L14.5 13.5 H1.5 Z"/><line x1="8" y1="6.5" x2="8" y2="9.5"/><line x1="8" y1="11.5" x2="8" y2="11.6"/></svg>️ ' + t('settlement.batchManualLabel')}
              </span>
              <span style="margin-left:8px;">${Badge.render('settlement','creationTypeEnum',b.creationType,{noDot:true})}</span>
            </div>
            <div>
              ${isSelected
                ? `<span class="text-accent" style="font-size:12px;">${Icon.check(13)} ${t('settlement.selectAllBatch').replace('使用','已选').replace('Use','Selected')}</span>`
                : ''}
            </div>
          </div>
          <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:8px; font-size:11px;">
            <div>
              <span class="text-muted">${t('settlement.truckCount')}</span>
              <span class="font-mono text-strong" style="margin-left:6px;">${b.truckCount}</span>
            </div>
            <div>
              <span class="text-muted">${t('settlement.relatedOrders')}</span>
              <span class="font-mono" style="margin-left:6px;">${orderIds.length}</span>
            </div>
            <div style="text-align:right;">
              <span class="text-muted">${t('settlement.deliveredAmount')}</span>
              <span class="font-mono text-strong" style="margin-left:6px;">${Utils.formatMoney(b.totalAmount)}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // 已选批次的详细 + 调整项
    let detailsHtml = '';
    if (selectedBatch) {
      const orderIds = Utils.unique(selectedBatch.deliveries.map(d => d.salesOrderId));
      detailsHtml = `
        <div class="card" style="margin-top:14px;">
          <div class="card-header"><div class="card-title">${t('settlement.relatedDeliveries')}</div></div>
          <div style="overflow-x:auto;">
            <table class="items-table">
              <thead>
                <tr>
                  <th>${t('delivery.no')}</th>
                  <th style="width:90px;">${t('delivery.customerTruckSeq')}</th>
                  <th style="width:110px;">${t('delivery.deliveryDate')}</th>
                  <th>${t('delivery.salesOrder')}</th>
                  <th style="width:110px;">${t('delivery.truckNo')}</th>
                  <th style="width:120px;" class="col-money">${t('common.amount')}</th>
                </tr>
              </thead>
              <tbody>
                ${selectedBatch.deliveries.map(d => {
                  const order = SalesOrderRepo.find(d.salesOrderId);
                  return `
                    <tr>
                      <td><span class="font-mono text-strong">${d.no}</span></td>
                      <td><span class="font-mono text-accent">#${d.customerTruckSequence}</span></td>
                      <td><span class="font-mono">${Utils.formatDate(d.deliveryDate)}</span></td>
                      <td><span class="font-mono">${order?.no || '-'}</span></td>
                      <td><span class="font-mono">${d.truckNo}</span></td>
                      <td class="col-money"><span class="font-mono text-strong">${Utils.formatMoney(d.totalAmount)}</span></td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="grid gap-3" style="grid-template-columns: 1fr 320px; margin-top:14px;">
          <div class="card">
            <div class="card-header"><div class="card-title">${t('settlement.settleAdjustment')}</div></div>
            <div class="card-body">
              ${selectedBatch.creationType === 'manual' ? `
                <div class="form-row">
                  <label class="form-label">${t('settlement.manualReason')} <span class="required">*</span></label>
                  <input class="input w-full" id="f-manualReason" value="${manualReason}" placeholder="${I18n.get()==='zh-CN'?'如:订单完结,车次不足':'e.g. Order completed, trucks insufficient'}">
                </div>
              ` : ''}
              <div class="form-row" style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                <div>
                  <label class="form-label">${t('settlement.adjustment')} (USD)</label>
                  <input class="input w-full" id="f-adjustment" type="number" step="0.01" value="${adjustment/100 || ''}" placeholder="0.00">
                  <div class="form-help" style="font-size:10px;">${t('settlement.settleAdjustmentHint')}</div>
                </div>
                <div>
                  <label class="form-label">${t('settlement.adjustmentReason')}</label>
                  <input class="input w-full" id="f-adjReason" value="${adjustmentReason}" placeholder="${I18n.get()==='zh-CN'?'如:运费 / 折扣':'e.g. shipping / discount'}">
                </div>
              </div>
              <div class="form-row">
                <label class="form-label">${t('settlement.settleRemark')}</label>
                <input class="input w-full" id="f-remark" value="${remark}">
              </div>
            </div>
          </div>
          <div class="totals-box">
            <div class="totals-row">
              <span class="text-muted">${t('settlement.deliveredAmount')}</span>
              <span class="font-mono">${Utils.formatMoney(selectedBatch.totalAmount)}</span>
            </div>
            <div class="totals-row">
              <span class="text-muted">${t('settlement.adjustment')}</span>
              <span class="font-mono ${adjustment < 0 ? 'text-red' : (adjustment > 0 ? 'text-emerald' : '')}">${adjustment >= 0 ? '+' : ''}${Utils.formatMoney(adjustment)}</span>
            </div>
            <div class="totals-row grand">
              <span>${t('settlement.payableAmount')}</span>
              <span class="font-mono">${Utils.formatMoney(selectedBatch.totalAmount + adjustment)}</span>
            </div>
            <div class="totals-row" style="margin-top:6px; padding-top:8px; border-top:1px dashed var(--border-2);">
              <span class="text-muted">${t('settlement.dueDate')}</span>
              <span class="font-mono">${Utils.formatDate(Utils.addDays(model.settlementDate, customer?.paymentDays || 30))}</span>
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div class="card mb-4">
        <div class="card-header"><div class="card-title">${t('settlement.selectBatch')}</div></div>
        <div class="card-body">${batchesHtml}</div>
      </div>
      ${detailsHtml}
    `;
  }

  function bindCreateEvents() {
    document.querySelectorAll('[data-batch-idx]').forEach(el => {
      el.addEventListener('click', () => {
        const idx = Number(el.dataset.batchIdx);
        selectedBatch = availableBatches[idx];
        markDirty();
        renderAll();
      });
    });

    const adjEl = document.getElementById('f-adjustment');
    if (adjEl) {
      adjEl.addEventListener('input', (e) => {
        adjustment = Utils.dollarsToCents(e.target.value);
        markDirty();
        renderMainContent();
        renderSummary();
      });
    }
    const adjRsn = document.getElementById('f-adjReason');
    if (adjRsn) adjRsn.addEventListener('input', (e) => { adjustmentReason = e.target.value; markDirty(); });
    const remEl = document.getElementById('f-remark');
    if (remEl) remEl.addEventListener('input', (e) => { remark = e.target.value; markDirty(); });
    const mr = document.getElementById('f-manualReason');
    if (mr) mr.addEventListener('input', (e) => { manualReason = e.target.value; markDirty(); });
  }

  // ---------- 查看模式 ----------
  function renderViewContent() {
    const deliveries = (model.deliveryIds || []).map(id => DeliveryRepo.find(id)).filter(d => d);
    const orderIds = Utils.unique(deliveries.map(d => d.salesOrderId));

    return `
      <div class="grid gap-3" style="grid-template-columns: 1fr 1fr;">
        <!-- 左:发货列表 -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">${t('settlement.relatedDeliveries')}</div>
            <span class="text-muted" style="font-size:11px;">${deliveries.length} ${I18n.get()==='zh-CN'?'车':'trucks'}</span>
          </div>
          <div style="overflow-x:auto;">
            <table class="items-table">
              <thead>
                <tr>
                  <th>${t('delivery.no')}</th>
                  <th style="width:60px;">${I18n.get()==='zh-CN'?'车次':'#'}</th>
                  <th style="width:90px;">${t('delivery.deliveryDate')}</th>
                  <th>${t('delivery.salesOrder')}</th>
                  <th style="width:110px;" class="col-money">${t('common.amount')}</th>
                </tr>
              </thead>
              <tbody>
                ${deliveries.map(d => {
                  const order = SalesOrderRepo.find(d.salesOrderId);
                  return `
                    <tr>
                      <td><a href="../deliveries/detail.html?id=${d.id}" class="font-mono text-strong" style="text-decoration:none; color:var(--accent);">${d.no}</a></td>
                      <td><span class="font-mono text-accent">#${d.customerTruckSequence}</span></td>
                      <td><span class="font-mono">${Utils.formatDate(d.deliveryDate)}</span></td>
                      <td><a href="../orders/detail.html?id=${d.salesOrderId}" class="font-mono" style="text-decoration:none; color:var(--accent);">${order?.no || '-'}</a></td>
                      <td class="col-money"><span class="font-mono">${Utils.formatMoney(d.totalAmount)}</span></td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- 右:收款记录 -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">${t('settlement.paymentRecords')}</div>
            ${['confirmed','partial_paid','overdue'].includes(model.status) ? `
              <button class="btn btn-sm btn-primary" data-action="addPayment">${t('settlement.addPayment')}</button>
            ` : ''}
          </div>
          ${(model.payments || []).length === 0 ? `
            <div class="empty-state">${t('settlement.noPayments')}</div>
          ` : `
            <div style="overflow-x:auto;">
              <table class="payment-table">
                <thead>
                  <tr>
                    <th>${t('settlement.paymentDate')}</th>
                    <th class="col-money">${t('settlement.paymentAmount')}</th>
                    <th>${t('settlement.paymentMethod')}</th>
                    <th>${t('settlement.paymentReference')}</th>
                  </tr>
                </thead>
                <tbody>
                  ${model.payments.map(p => `
                    <tr>
                      <td><span class="font-mono">${Utils.formatDate(p.paymentDate)}</span></td>
                      <td class="col-money"><span class="font-mono text-emerald">${Utils.formatMoney(p.amount)}</span></td>
                      <td>${Badge.render('settlement','paymentMethodEnum',p.method,{noDot:true})}</td>
                      <td><span class="font-mono text-muted">${p.reference || '-'}</span></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
      </div>

      ${model.remark ? `
        <div class="card" style="margin-top:14px;">
          <div class="card-header"><div class="card-title">${t('common.remark')}</div></div>
          <div class="card-body" style="font-size:12px;">${model.remark}</div>
        </div>
      ` : ''}
    `;
  }

  function renderActionButtons() {
    const buttons = [];
    if (mode === 'create') {
      buttons.push(`<button class="btn btn-secondary" data-action="cancel">${t('common.cancel')}</button>`);
      buttons.push(`<button class="btn btn-primary" data-action="save">${t('common.save')}</button>`);
    } else {
      const s = model.status;
      if (s === 'pending_confirm') {
        buttons.push(`<button class="btn btn-primary" data-action="confirm">${t('settlement.confirm')}</button>`);
        buttons.push(`<button class="btn btn-danger" data-action="cancelSettle">${t('settlement.cancel')}</button>`);
      } else if (['confirmed','partial_paid','overdue'].includes(s)) {
        buttons.push(`<button class="btn btn-primary" data-action="addPayment">${t('settlement.addPayment')}</button>`);
      }
      buttons.push(`<button class="btn btn-secondary" data-action="export">${typeof _exportIcon !== 'undefined' ? _exportIcon() : ''} ${I18n.get()==='zh-CN'?'导出对账单':'Export Statement'}</button>`);
      buttons.push(`<button class="btn btn-secondary" data-action="print">${t('common.print')}</button>`);
    }
    const wrap = document.getElementById('action-buttons');
    wrap.innerHTML = buttons.join('');
    wrap.onclick = (e) => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (action) handleAction(action);
    };
    // 详情页内部的「+收款」按钮也绑定
    document.querySelectorAll('#main-content [data-action]').forEach(btn => {
      btn.addEventListener('click', () => handleAction(btn.dataset.action));
    });
  }

  function renderTimeline() {
    if (!model.id) {
      document.getElementById('history-card').style.display = 'none';
      return;
    }
    const logs = ChangeLogRepo.list({ recordType: 'settlement', recordId: model.id })
      .sort((a, b) => new Date(b.operatedAt) - new Date(a.operatedAt));
    if (logs.length === 0) {
      document.getElementById('timeline').innerHTML = `<li class="text-muted">${t('common.noRecords')}</li>`;
      return;
    }
    const isZh = I18n.get() === 'zh-CN';
    // 用卡片样式渲染
    const html = logs.map((l, idx) => {
      const ch = l.changes?.[0] || {};
      const isCurrent = idx === 0;
      // 根据动作判断状态
      let state = 'pending';
      let icon = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="3,8 7,12 13,4"/></svg>';
      if (ch.newValue === 'paid' || ch.newValue === 'confirmed') {
        state = 'done';
      } else if (ch.newValue === 'partial_paid' || ch.newValue === 'pending_confirm') {
        state = 'active';
      } else if (ch.newValue === 'cancelled' || ch.newValue === 'overdue') {
        state = 'warning';
      }
      const title = ch.field === 'status'
        ? `${isZh?'状态变化':'Status'}: ${ch.oldValue || '-'} → ${ch.newValue}`
        : (l.reason || t('common.actions'));
      return `
        <li class="mini-tl-row state-${state} ${isCurrent ? 'current' : ''}" style="list-style:none;">
          <div class="mini-tl-icon">${icon}</div>
          <div class="mini-tl-content">
            <div class="mini-tl-title">${title}</div>
            <div class="mini-tl-meta">
              <span>${l.operatorName || '-'}</span>
              ${l.reason ? `<span class="separator">·</span><span>${l.reason}</span>` : ''}
              <span class="separator">·</span>
              <span class="num">${Utils.formatDateTime(l.operatedAt)}</span>
            </div>
          </div>
          ${isCurrent ? `<span class="mini-tl-now-badge">${isZh?'当前':'Now'}</span>` : ''}
        </li>
      `;
    }).join('');
    document.getElementById('timeline').innerHTML = html;
    // 把 timeline 容器自身改成 mini-tl-v3 样式(用 setAttribute 而不是改 class,避免破坏其他)
    const tl = document.getElementById('timeline');
    if (tl) {
      tl.classList.add('mini-tl-v3');
      tl.style.listStyle = 'none';
      tl.style.padding = '12px 0 0 0';
      tl.style.margin = '0';
    }
  }

  // ---------- 操作 ----------
  function markDirty() { isDirty = true; }
  function clearDirty() { isDirty = false; }

  function handleAction(action) {
    if (action === 'cancel') return doCancel();
    if (action === 'save') return doSave();
    if (action === 'confirm') return doConfirm();
    if (action === 'cancelSettle') return doCancelSettle();
    if (action === 'addPayment') return openPaymentModal();
    if (action === 'print') return window.print();
    if (action === 'export') return exportStatement();
  }

  function exportStatement() {
    if (!model.id || !customer) { Toast.warning('请先保存结算单'); return; }
    const dels = (model.deliveryIds || []).map(id => DeliveryRepo.find(id)).filter(Boolean);
    const payments = (model.payments || []);

    // Sheet 1: 结算单汇总
    const headerRows = [{
      field: '客户名称', value: customer.name,
    }, {
      field: '客户编号', value: customer.code,
    }, {
      field: '结算单号', value: model.no,
    }, {
      field: '结算日期', value: model.settlementDate,
    }, {
      field: '到期日', value: model.dueDate || '-',
    }, {
      field: '应收金额', value: (model.payableAmount || 0) / 100,
    }, {
      field: '已收金额', value: (model.paidAmount || 0) / 100,
    }, {
      field: '未收金额', value: ((model.payableAmount || 0) - (model.paidAmount || 0)) / 100,
    }];

    // Sheet 2: 发货明细
    const delRows = dels.map(d => {
      const vehicle = d.vehicleId ? VehicleRepo.find(d.vehicleId) : null;
      const items = d.items || [];
      const totalQty = items.reduce((s, i) => s + (i.qty || 0), 0);
      return {
        no: d.no,
        deliveryDate: d.deliveryDate,
        signedAt: (d.signedAt || '').slice(0, 10),
        plateNo: vehicle?.plateNo || d.truckNo || '',
        driver: vehicle?.driverName || d.driverName || '',
        itemSummary: items.slice(0, 3).map(i => `${i.materialName} × ${i.qty}`).join(', '),
        totalQty,
        amount: d.totalAmount || 0,
      };
    });

    // Sheet 3: 收款记录
    const payRows = payments.map(p => ({
      paymentDate: p.paymentDate,
      amount: p.amount,
      method: ({ transfer: '银行转账', cash: '现金', check: '承兑汇票', other: '其他' })[p.method] || p.method,
      referenceNo: p.referenceNo || '-',
      remark: p.remark || '',
    }));

    ExcelExporter.export({
      filename: `对账单_${customer.name}_${model.no}`,
      sheets: [
        {
          name: '结算单汇总',
          columns: [
            { key: 'field', label: '项目', width: 14 },
            { key: 'value', label: '内容', width: 30 },
          ],
          rows: headerRows,
        },
        {
          name: '发货明细',
          columns: [
            { key: 'no', label: 'DN号', width: 18 },
            { key: 'deliveryDate', label: '发车日', width: 12, format: 'date' },
            { key: 'signedAt', label: '签收日', width: 12, format: 'date' },
            { key: 'plateNo', label: '车牌', width: 12 },
            { key: 'driver', label: '司机', width: 10 },
            { key: 'itemSummary', label: '装车明细', width: 32 },
            { key: 'totalQty', label: '总件数', width: 10, format: 'number' },
            { key: 'amount', label: '金额', width: 14, format: 'currency' },
          ],
          rows: delRows,
        },
        {
          name: '收款记录',
          columns: [
            { key: 'paymentDate', label: '收款日', width: 12, format: 'date' },
            { key: 'amount', label: '金额', width: 14, format: 'currency' },
            { key: 'method', label: '方式', width: 12 },
            { key: 'referenceNo', label: '流水号', width: 16 },
            { key: 'remark', label: '备注', width: 24 },
          ],
          rows: payRows,
        },
      ],
    });
  }

  function doCancel() {
    if (isDirty) {
      Modal.confirm({
        title: t('common.discardChanges'),
        message: t('common.discardChangesMsg'),
        danger: true,
        onConfirm: () => { clearDirty(); Router.go('settlement-list'); }
      });
    } else {
      Router.go('settlement-list');
    }
  }

  function doSave() {
    if (!model.customerId) { Toast.warning(t('settlement.validate_needCustomer')); return; }
    if (!selectedBatch) { Toast.warning(t('settlement.validate_needBatch')); return; }
    if (selectedBatch.creationType === 'manual' && !manualReason.trim()) {
      Toast.warning(t('settlement.validate_needManualReason'));
      return;
    }
    try {
      const created = SettlementService.create({
        customerId: model.customerId,
        deliveryIds: selectedBatch.deliveries.map(d => d.id),
        creationType: selectedBatch.creationType,
        manualReason,
        adjustment,
        adjustmentReason,
        settlementDate: model.settlementDate,
        remark,
      }, 'emp_f01');
      Toast.success(t('settlement.saveSuccess', created.no));
      clearDirty();
      setTimeout(() => Router.go('settlement-detail', { id: created.id }), 400);
    } catch (e) {
      Toast.error(e.message);
    }
  }

  function doConfirm() {
    Modal.confirm({
      title: t('settlement.confirmTitle'),
      message: t('settlement.confirmConfirm', model.no),
      onConfirm: () => {
        try {
          SettlementService.confirm(model.id, 'emp_f01');
          Toast.success(t('settlement.confirmSuccess'));
          setTimeout(() => location.reload(), 400);
        } catch (e) { Toast.error(e.message); }
      }
    });
  }

  function doCancelSettle() {
    Modal.open({
      title: t('settlement.cancelTitle'),
      width: 460,
      content: `
        <div class="form-row" style="grid-template-columns:1fr">
          <div>
            <label class="form-label">${t('common.reason')} <span class="required">*</span></label>
            <input class="input w-full" id="cancel-reason" placeholder="${t('settlement.cancelReasonPlaceholder')}">
          </div>
        </div>
      `,
      buttons: [
        { label: t('common.cancel') },
        {
          label: t('common.confirm'),
          danger: true,
          onClick: () => {
            const r = document.getElementById('cancel-reason').value.trim();
            if (!r) { Toast.warning(t('common.pleaseEnter')); return false; }
            try {
              SettlementService.cancel(model.id, r, 'emp_f01');
              Toast.success(t('settlement.cancelSuccess'));
              setTimeout(() => location.reload(), 400);
            } catch (e) { Toast.error(e.message); return false; }
          }
        }
      ]
    });
  }

  function openPaymentModal() {
    Modal.open({
      title: t('settlement.paymentTitle'),
      width: 480,
      content: renderPaymentForm(model),
      buttons: [
        { label: t('common.cancel') },
        {
          label: t('common.confirm'),
          primary: true,
          onClick: () => {
            const amount = Utils.dollarsToCents(document.getElementById('pay-amount').value);
            const method = document.getElementById('pay-method').value;
            const date = document.getElementById('pay-date').value;
            const ref = document.getElementById('pay-reference').value;
            const remark = document.getElementById('pay-remark').value;
            if (!amount || amount <= 0) { Toast.warning(t('settlement.paymentValidate')); return false; }
            try {
              SettlementService.addPayment(model.id, { amount, method, paymentDate: date, reference: ref, remark }, 'emp_f01');
              Toast.success(t('settlement.paymentSuccess', (amount/100).toLocaleString()));
              setTimeout(() => location.reload(), 400);
            } catch (e) { Toast.error(e.message); return false; }
          }
        }
      ]
    });
  }

  function renderPaymentForm(s) {
    return `
      <div style="margin-bottom:14px; padding:10px 14px; background:var(--bg-3); border-radius:4px; font-size:12px;">
        <div class="flex justify-between" style="margin-bottom:4px;">
          <span class="text-muted">${t('settlement.payableAmount')}</span>
          <span class="font-mono">${Utils.formatMoney(s.payableAmount)}</span>
        </div>
        <div class="flex justify-between" style="margin-bottom:4px;">
          <span class="text-muted">${t('settlement.paidAmount')}</span>
          <span class="font-mono text-emerald">${Utils.formatMoney(s.paidAmount)}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-muted">${t('settlement.unpaidAmount')}</span>
          <span class="font-mono text-red">${Utils.formatMoney(s.unpaidAmount)}</span>
        </div>
      </div>
      <div class="form-row">
        <label class="form-label">${t('settlement.paymentAmount')} <span class="required">*</span></label>
        <input class="input w-full" id="pay-amount" type="number" min="0" step="0.01" max="${s.unpaidAmount/100}" value="${s.unpaidAmount/100}">
      </div>
      <div class="form-row">
        <label class="form-label">${t('settlement.paymentMethod')}</label>
        <select class="select w-full" id="pay-method">
          <option value="transfer">${tEnum('settlement','paymentMethodEnum','transfer')}</option>
          <option value="cash">${tEnum('settlement','paymentMethodEnum','cash')}</option>
          <option value="check">${tEnum('settlement','paymentMethodEnum','check')}</option>
          <option value="acceptance_bill">${tEnum('settlement','paymentMethodEnum','acceptance_bill')}</option>
        </select>
      </div>
      <div class="form-row">
        <label class="form-label">${t('settlement.paymentDate')}</label>
        <input class="input w-full" id="pay-date" type="date" value="${Utils.today()}">
      </div>
      <div class="form-row">
        <label class="form-label">${t('settlement.paymentReference')}</label>
        <input class="input w-full" id="pay-reference" placeholder="${t('settlement.paymentReferencePlaceholder')}">
      </div>
      <div class="form-row">
        <label class="form-label">${t('settlement.paymentRemark')}</label>
        <input class="input w-full" id="pay-remark">
      </div>
    `;
  }

  function _customersWithPending() {
    const allPending = SettlementService.getAllPending();
    const ids = Utils.unique(allPending.map(p => p.customerId));
    return ids.map(id => CustomerService.findById(id)).filter(c => c);
  }

  return { init };
})();

window.SettlementDetailModule = SettlementDetailModule;
