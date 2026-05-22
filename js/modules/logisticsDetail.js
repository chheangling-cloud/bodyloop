/**
 * LogisticsDetailModule - 物流车次详情
 * @module modules/logisticsDetail
 *
 * 一个 delivery 单 = 一个车次。本页负责:
 *   1. 显示 + 编辑车辆/司机/电话(最简)
 *   2. 出发/到达时间管理
 *   3. 回单上传(签收件扫描)
 *   4. 运费录入 + 付款标记(司机回执)
 *   5. 异常处理(可选)
 */

const LogisticsDetailModule = (function () {
  'use strict';

  let delivery = null;
  let order = null;
  let customer = null;

  function init(ctx) {
    const id = ctx.params.id;
    delivery = DeliveryRepo.find(id);
    if (!delivery) {
      document.getElementById('app-content').innerHTML = `
        <div class="page-header"><h1 class="page-title">404</h1></div>
        <div class="text-muted">车次不存在</div>
      `;
      return;
    }
    // 字段兼容:统一到 driver/phone(seed 用的是 driverName/driverPhone)
    if (!delivery.driver && delivery.driverName) delivery.driver = delivery.driverName;
    if (!delivery.phone && delivery.driverPhone) delivery.phone = delivery.driverPhone;
    order = SalesOrderRepo.find(delivery.salesOrderId);
    customer = order ? CustomerRepo.find(order.customerId) : null;
    render();
  }

  function render() {
    const isZh = I18n.get() === 'zh-CN';
    const st = delivery.transportStatus || 'pending';
    const cfg = SCHEMAS.delivery?.transportStatusEnum?.[st] || {};

    document.getElementById('app-content').innerHTML = `
      <div id="logistics-detail-root">
        <a href="${Router.href('logistics-list')}" class="text-muted" style="text-decoration:none; font-size:12px;">← ${isZh?'返回物流管理':'Back to Logistics'}</a>
        <div class="page-header" style="margin-top:8px;">
          <div>
            <h1 class="page-title">${delivery.no}
              <span style="margin-left:12px; padding:3px 10px; background:var(--bg-3); color:var(--${cfg.color || 'text-2'}); border-radius:4px; font-size:13px; font-weight:400;">
                ${cfg.label || st}
              </span>
            </h1>
            <div class="page-subtitle">
              ${order ? `<a href="${Router.href('order-detail', { id: order.id })}" class="text-accent" style="text-decoration:none;">${order.no}</a>${delivery.orderTruckSequence ? ` · ${isZh?'第':'No.'} ${delivery.orderTruckSequence} ${isZh?'车':''}` : ''} · ` : ''}
              ${customer?.name || '-'}
              ${delivery.customerTruckSequence ? ` <span class="text-muted" style="font-size:11px;">· ${isZh?'客户累计':'Customer Total'} ${delivery.customerTruckSequence} ${isZh?'车':'tr'}</span>` : ''}
            </div>
          </div>
          <div class="flex gap-2">
            <button class="btn btn-secondary btn-sm" data-action="edit-trip">${Icon.edit(13)} ${isZh?'编辑信息':'Edit'}</button>
          </div>
        </div>

        <!-- 4 个 KPI -->
        <div class="grid grid-cols-4 gap-3 mb-4">
          <div class="kpi">
            <div class="kpi-label">${isZh?'装车量':'Loaded'}</div>
            <div class="kpi-value">${(delivery.items || []).reduce((s, it) => s + (it.qty || 0), 0)} ${isZh?'件':'pcs'}</div>
            <div class="kpi-trend">${(delivery.items || []).length} ${isZh?'品类':'SKU(s)'}</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">${isZh?'出发时间':'Depart'}</div>
            <div class="kpi-value" style="font-size:14px;">${(delivery.departAt || delivery.shippedAt) ? Utils.formatDateTime(delivery.departAt || delivery.shippedAt).slice(0,16) : '-'}</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">${isZh?'签收时间':'Signed'}</div>
            <div class="kpi-value" style="font-size:14px;">${delivery.signedAt ? Utils.formatDateTime(delivery.signedAt).slice(0,16) : (delivery.etaAt ? `${isZh?'预计 ':'ETA '}${Utils.formatDateTime(delivery.etaAt).slice(0,16)}` : '-')}</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">${isZh?'运费':'Freight'}</div>
            <div class="kpi-value">${delivery.freight ? Sensitive.money(delivery.freight) : '-'}</div>
            <div class="kpi-trend" style="color:${delivery.freightPaid?'var(--emerald)':'var(--amber)'};">${delivery.freight ? (delivery.freightPaid ? (isZh?'已付':'paid') : (isZh?'未付':'unpaid')) : ''}</div>
          </div>
        </div>

        <div class="grid gap-3" style="grid-template-columns: 1fr 1fr;">
          <!-- 车辆/司机信息 -->
          <div class="ov-section">
            <div class="ov-section-head">
              <span>${Icon.truck(13)} ${isZh?'车辆与司机':'Vehicle & Driver'}</span>
              <a class="text-accent" style="font-size:11px; cursor:pointer; text-decoration:none;" data-action="edit-vehicle">${isZh?'编辑':'Edit'}</a>
            </div>
            <div class="ov-section-body">
              <div style="display:grid; grid-template-columns: 80px 1fr; gap:8px 12px; font-size:12px;">
                <span class="text-muted">${isZh?'车牌':'Truck #'}</span>
                <span class="font-mono ${delivery.truckNo ? 'text-strong' : 'text-muted'}">${delivery.truckNo || (isZh?'未填':'N/A')}</span>
                <span class="text-muted">${isZh?'司机':'Driver'}</span>
                <span class="${delivery.driver ? 'text-strong' : 'text-muted'}">${delivery.driver || (isZh?'未填':'N/A')}</span>
                <span class="text-muted">${isZh?'电话':'Phone'}</span>
                <span class="font-mono ${delivery.phone ? 'text-strong' : 'text-muted'}">${delivery.phone || (isZh?'未填':'N/A')}</span>
              </div>
            </div>
          </div>

          <!-- 送货地址 -->
          <div class="ov-section">
            <div class="ov-section-head">
              <span>${Icon.location ? Icon.location(13) : '📍'} ${isZh?'送货地点':'Destination'}</span>
            </div>
            <div class="ov-section-body">
              <div style="display:grid; grid-template-columns: 80px 1fr; gap:8px 12px; font-size:12px;">
                <span class="text-muted">${isZh?'客户':'Customer'}</span>
                <span class="text-strong">${customer?.name || '-'} <span class="text-muted">${customer?.code || ''}</span></span>
                <span class="text-muted">${isZh?'地址':'Address'}</span>
                <span class="text-strong">${delivery.deliveryAddress || customer?.address || (isZh?'未填':'N/A')}</span>
                <span class="text-muted">${isZh?'联系人':'Contact'}</span>
                <span>${customer?.contactName ? `${customer.contactName}${customer.phone ? ` · ${customer.phone}` : ''}` : (customer?.phone || '-')}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 状态推进 + 回单 + 运费 -->
        <div class="grid gap-3 mt-3" style="grid-template-columns: 1fr 1fr;">
          <div class="ov-section">
            <div class="ov-section-head"><span>${Icon.clipboard(13)} ${isZh?'运输跟踪':'Tracking'}</span></div>
            <div class="ov-section-body">
              ${_renderTrackingActions()}
            </div>
          </div>

          <div class="ov-section">
            <div class="ov-section-head">
              <span>${Icon.money(13)} ${isZh?'运费/回执':'Freight & Receipt'}</span>
              <a class="text-accent" style="font-size:11px; cursor:pointer; text-decoration:none;" data-action="edit-freight">${isZh?'记录':'Record'}</a>
            </div>
            <div class="ov-section-body">
              ${_renderFreightInfo()}
            </div>
          </div>
        </div>

        <!-- 回单上传(签收件扫描) -->
        <div class="ov-section mt-3">
          <div class="ov-section-head">
            <span>${Icon.paperclip(13)} ${isZh?'回单 / 签收件':'Receipt / Signed POD'}</span>
          </div>
          <div class="ov-section-body">
            <div id="receipt-upload-mount"></div>
            <div id="receipt-gallery" style="margin-top:12px;"></div>
          </div>
        </div>

        <!-- 装车明细 -->
        <div class="ov-section mt-3">
          <div class="ov-section-head"><span>${Icon.box(13)} ${isZh?'装车明细':'Loaded Items'}</span></div>
          <div class="ov-section-body" style="overflow-x:auto;">
            ${_renderItemsTable()}
          </div>
        </div>
      </div>
    `;

    _bindEvents();
    _mountReceipts();
  }

  function _renderTrackingActions() {
    const isZh = I18n.get() === 'zh-CN';
    const st = delivery.transportStatus || 'pending';
    // 状态进度示意 + 操作按钮
    const steps = [
      { key: 'pending',    label: isZh?'待发车':'Pending' },
      { key: 'in_transit', label: isZh?'运输中':'In Transit' },
      { key: 'signed',     label: isZh?'已签收':'Signed' },
    ];
    const idx = steps.findIndex(s => s.key === st);
    let html = `<div style="display:flex; gap:4px; align-items:center; margin-bottom:14px;">`;
    steps.forEach((s, i) => {
      const reached = idx >= i && st !== 'exception';
      const color = reached ? 'var(--emerald)' : 'var(--text-4)';
      html += `
        <div style="flex:1; display:flex; align-items:center; gap:4px;">
          <div style="width:10px; height:10px; border-radius:50%; background:${color};"></div>
          <span style="font-size:11px; color:${reached?'var(--text-2)':'var(--text-4)'};">${s.label}</span>
        </div>
        ${i < steps.length-1 ? `<div style="flex:1; height:1px; background:${idx > i ? 'var(--emerald)' : 'var(--border-1)'};"></div>` : ''}
      `;
    });
    html += '</div>';
    if (st === 'exception') {
      html += `<div style="padding:8px 12px; background:rgba(248,113,113,0.08); border-left:3px solid var(--red); border-radius:4px; font-size:12px; color:var(--red); margin-bottom:10px;">
        ${Icon.warning(11)} ${isZh?'异常':'Exception'}: ${delivery.exceptionReason || (isZh?'未填':'N/A')}
      </div>`;
    }
    // 操作按钮
    const actions = [];
    if (st === 'pending') {
      actions.push(`<button class="btn btn-primary btn-sm" data-action="depart">${Icon.truck(12)} ${isZh?'确认发车':'Depart'}</button>`);
    }
    if (st === 'in_transit') {
      actions.push(`<button class="btn btn-primary btn-sm" data-action="arrive">${Icon.check(12)} ${isZh?'确认到达':'Arrived'}</button>`);
      actions.push(`<button class="btn btn-secondary btn-sm" data-action="sign">${Icon.check(12)} ${isZh?'确认签收':'Sign'}</button>`);
    }
    if (st === 'signed') {
      actions.push(`<span class="text-emerald" style="font-size:12px;">${Icon.check(12)} ${isZh?'已签收 ':'Signed '} ${delivery.signedAt ? Utils.formatDate(delivery.signedAt) : ''}</span>`);
    }
    if (st !== 'signed' && st !== 'exception') {
      actions.push(`<button class="btn btn-ghost btn-sm" data-action="mark-exception" style="color:var(--red);">${Icon.warning(12)} ${isZh?'标记异常':'Mark Exception'}</button>`);
    }
    html += `<div style="display:flex; gap:8px; flex-wrap:wrap;">${actions.join('')}</div>`;
    return html;
  }

  function _renderFreightInfo() {
    const isZh = I18n.get() === 'zh-CN';
    if (!delivery.freight) {
      return `<div class="text-muted" style="font-size:12px;">${isZh?'尚未录入运费':'Freight not recorded'}</div>`;
    }
    return `
      <div style="display:grid; grid-template-columns: 90px 1fr; gap:8px 12px; font-size:12px;">
        <span class="text-muted">${isZh?'运费金额':'Amount'}</span>
        <span class="font-mono text-strong">${Sensitive.money(delivery.freight)}</span>
        <span class="text-muted">${isZh?'付款状态':'Status'}</span>
        <span style="color:${delivery.freightPaid?'var(--emerald)':'var(--amber)'};">${delivery.freightPaid ? (isZh?'✓ 已付':'✓ Paid') : (isZh?'⏳ 未付':'⏳ Unpaid')}</span>
        ${delivery.freightPaidAt ? `<span class="text-muted">${isZh?'付款时间':'Paid At'}</span><span>${Utils.formatDate(delivery.freightPaidAt)}</span>` : ''}
        ${delivery.freightRemark ? `<span class="text-muted">${isZh?'备注':'Note'}</span><span class="text-muted" style="font-size:11px;">${delivery.freightRemark}</span>` : ''}
      </div>
    `;
  }

  function _renderItemsTable() {
    const isZh = I18n.get() === 'zh-CN';
    const items = delivery.items || [];
    if (items.length === 0) return `<div class="text-muted" style="padding:14px 0; font-size:12px;">${isZh?'无装车明细':'No loaded items'}</div>`;
    return `
      <table style="width:100%; font-size:12px; border-collapse:collapse;">
        <thead>
          <tr style="background:var(--bg-3); color:var(--text-3); font-size:11px; text-transform:uppercase;">
            <th style="text-align:left; padding:8px 12px;">${isZh?'产品':'Product'}</th>
            <th style="text-align:left; padding:8px 12px;">${isZh?'规格':'Spec'}</th>
            <th style="text-align:right; padding:8px 12px;">${isZh?'数量':'Qty'}</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(it => {
            const m = MaterialRepo.find(it.materialId);
            return `
              <tr style="border-bottom:1px solid var(--border-1);">
                <td style="padding:10px 12px;" class="text-strong">${m?.name || '-'}</td>
                <td style="padding:10px 12px;" class="text-muted">${m?.spec || ''}</td>
                <td style="text-align:right; padding:10px 12px;" class="font-mono">${it.qty || 0} ${m?.unit || ''}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }

  function _mountReceipts() {
    if (typeof AttachmentService === 'undefined') return;
    // 已有回单画廊
    const allAtts = AttachmentService.list({ entityType: 'delivery', entityId: delivery.id });
    const receipts = allAtts.filter(a =>
      (a.caption || '').match(/回单|receipt|签收|pod/i)
    );
    const gallery = document.getElementById('receipt-gallery');
    if (receipts.length > 0 && gallery) {
      AttachmentViewer.renderGallery(gallery, receipts);
    } else if (gallery) {
      gallery.innerHTML = '';
    }
    // 上传组件
    const mount = document.getElementById('receipt-upload-mount');
    if (!mount) return;
    AttachmentUploader.create({
      mount: '#receipt-upload-mount',
      entityType: 'delivery',
      entityId: delivery.id,
      placeholder: I18n.get()==='zh-CN' ? '上传回单/签收单照片' : 'Upload receipt / POD photo',
      maxFiles: 5,
    });
  }

  function _bindEvents() {
    const isZh = I18n.get() === 'zh-CN';
    document.querySelectorAll('[data-action]').forEach(el => {
      el.addEventListener('click', () => {
        const a = el.dataset.action;
        if (a === 'edit-trip' || a === 'edit-vehicle')   _openEditTripDialog();
        if (a === 'edit-freight')                         _openFreightDialog();
        if (a === 'depart')                               _doDepart();
        if (a === 'arrive')                               _doArrive();
        if (a === 'sign')                                 _doSign();
        if (a === 'mark-exception')                       _openExceptionDialog();
      });
    });
  }

  function _openEditTripDialog() {
    const isZh = I18n.get() === 'zh-CN';
    const vehicles = VehicleService.list().filter(v => v.status === 'active');
    Modal.open({
      title: isZh?'编辑车次信息':'Edit Trip',
      width: 540,
      content: `
        <div style="display:grid; gap:14px;">
          <div>
            <label class="form-label">${isZh?'选择车辆':'Vehicle'} <span style="color:var(--red);">*</span></label>
            <select class="select w-full" id="t-vehicle">
              <option value="">${isZh?'-- 选择车辆 --':'-- Select vehicle --'}</option>
              ${vehicles.map(v => `<option value="${v.id}" ${v.id === delivery.vehicleId ? 'selected' : ''}>${v.plateNo} · ${v.driverName} · ${v.capacity || ''}</option>`).join('')}
            </select>
            <div class="text-muted" style="font-size:11px; margin-top:4px;">
              ${isZh?'找不到车辆?可以':'Need a new vehicle?'}
              <a class="text-accent" style="cursor:pointer;" id="t-quick-add">${isZh?'快速添加':'Quick add'}</a>
            </div>
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
            <div>
              <label class="form-label">${isZh?'本车次运费':'Trip Freight'}</label>
              <div style="position:relative;">
                <span style="position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--text-3);">$</span>
                <input class="input w-full" type="number" step="0.01" min="0" id="t-freight"
                  value="${delivery.freight ? (delivery.freight/100).toFixed(2) : '0'}" style="padding-left:24px;">
              </div>
              <div class="text-muted" style="font-size:11px; margin-top:4px;">${isZh?'选车辆后自动填入默认运费,可调整':'Auto-filled from vehicle default, adjustable'}</div>
            </div>
            <div>
              <label class="form-label">${isZh?'预计到达':'ETA'}</label>
              <input class="input w-full" type="datetime-local" id="t-eta" value="${delivery.etaAt ? new Date(delivery.etaAt).toISOString().slice(0,16) : ''}">
            </div>
          </div>
          <div>
            <label class="form-label">${isZh?'送货地址(覆盖客户默认地址)':'Destination Address (override)'}</label>
            <input class="input w-full" id="t-address" value="${delivery.deliveryAddress || ''}" placeholder="${customer?.address || ''}">
          </div>
        </div>
      `,
      buttons: [
        { label: isZh?'取消':'Cancel' },
        { label: isZh?'保存':'Save', primary: true, onClick: () => {
          const vehicleId = document.getElementById('t-vehicle').value;
          if (!vehicleId) { Toast.warning(isZh?'请选择车辆':'Please select a vehicle'); return false; }
          const vehicle = VehicleService.findById(vehicleId);
          const etaStr = document.getElementById('t-eta').value;
          const freightStr = document.getElementById('t-freight').value;
          const patch = {
            vehicleId,
            truckNo:     vehicle.plateNo,
            driver:      vehicle.driverName,
            driverName:  vehicle.driverName,
            phone:       vehicle.driverPhone,
            driverPhone: vehicle.driverPhone,
            freight: Math.round(parseFloat(freightStr || '0') * 100),
            etaAt:   etaStr ? new Date(etaStr).toISOString() : null,
            deliveryAddress: document.getElementById('t-address').value.trim(),
            updatedAt: Utils.now(),
          };
          DeliveryRepo.update(delivery.id, patch);
          delivery = DeliveryRepo.find(delivery.id);
          EventBus.emit('logistics.updated', { id: delivery.id });
          Toast.success(isZh?'已保存':'Saved');
          render();
        }},
      ],
    });

    // 选车辆时自动填默认运费
    setTimeout(() => {
      const sel = document.getElementById('t-vehicle');
      sel?.addEventListener('change', () => {
        const v = VehicleService.findById(sel.value);
        if (v && v.defaultFreight) {
          document.getElementById('t-freight').value = (v.defaultFreight / 100).toFixed(2);
        }
      });
      // 快速添加
      document.getElementById('t-quick-add')?.addEventListener('click', () => {
        Modal.close();
        if (typeof LogisticsModule !== 'undefined' && LogisticsModule.openVehicleManager) {
          LogisticsModule.openVehicleManager();
        }
      });
    }, 100);
  }

  function _openFreightDialog() {
    const isZh = I18n.get() === 'zh-CN';
    Modal.open({
      title: isZh?'记录运费 / 司机回执':'Record Freight',
      width: 460,
      content: `
        <div style="display:grid; gap:12px;">
          <div>
            <label class="form-label">${isZh?'运费金额':'Freight Amount'}</label>
            <div style="position:relative;">
              <span style="position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--text-3);">$</span>
              <input class="input w-full" type="number" step="0.01" min="0" id="f-amount"
                value="${((delivery.freight||0)/100).toFixed(2)}" style="padding-left:24px;">
            </div>
          </div>
          <div>
            <label class="form-label">${isZh?'付款状态':'Payment Status'}</label>
            <div style="display:flex; gap:14px; padding:6px 0;">
              <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:12px;">
                <input type="radio" name="f-paid" value="false" ${!delivery.freightPaid?'checked':''}> ${isZh?'未付':'Unpaid'}
              </label>
              <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:12px;">
                <input type="radio" name="f-paid" value="true" ${delivery.freightPaid?'checked':''}> ${isZh?'已付':'Paid'}
              </label>
            </div>
          </div>
          <div>
            <label class="form-label">${isZh?'备注':'Note'}</label>
            <textarea class="input w-full" id="f-remark" rows="2" placeholder="${isZh?'付款方式 / 凭证编号':'Payment method / reference'}">${delivery.freightRemark || ''}</textarea>
          </div>
        </div>
      `,
      buttons: [
        { label: isZh?'取消':'Cancel' },
        { label: isZh?'保存':'Save', primary: true, onClick: () => {
          const paid = document.querySelector('input[name="f-paid"]:checked')?.value === 'true';
          const patch = {
            freight:        Utils.dollarsToCents(document.getElementById('f-amount').value),
            freightPaid:    paid,
            freightPaidAt:  paid ? (delivery.freightPaidAt || Utils.now()) : null,
            freightRemark:  document.getElementById('f-remark').value.trim(),
            updatedAt: Utils.now(),
          };
          DeliveryRepo.update(delivery.id, patch);
          delivery = DeliveryRepo.find(delivery.id);
          EventBus.emit('logistics.updated', { id: delivery.id });
          Toast.success(isZh?'运费已更新':'Freight saved');
          render();
        }},
      ],
    });
  }

  function _doDepart() {
    const isZh = I18n.get() === 'zh-CN';
    // 必须先关联车辆
    if (!delivery.vehicleId && !delivery.truckNo) {
      Toast.warning(isZh?'请先编辑车次,选择车辆':'Please assign a vehicle first');
      _openEditTripDialog();
      return;
    }
    Modal.confirm({
      title: isZh?'确认发车':'Confirm Depart',
      message: isZh?'确认现在发车?系统将以当前时间记录为出发时间。':'Confirm depart now? Current time will be recorded as departure.',
      onConfirm: () => {
        // 当前时间,精确到分钟(秒清零)
        const now = new Date();
        now.setSeconds(0, 0);
        const departIso = now.toISOString();
        DeliveryRepo.update(delivery.id, {
          transportStatus: 'in_transit',
          departAt: departIso,
          shippedAt: delivery.shippedAt || departIso,
          updatedAt: Utils.now(),
        });
        delivery = DeliveryRepo.find(delivery.id);
        EventBus.emit('logistics.updated', { id: delivery.id });
        Toast.success(isZh?`已发车 ${Utils.formatDateTime(departIso).slice(0,16)}`:'Departed');
        render();
      }
    });
  }

  function _doArrive() {
    // 简化:跳过单独"到达"步骤,直接进签收(到达即签收的简化模型)
    _doSign();
  }

  function _doSign() {
    const isZh = I18n.get() === 'zh-CN';
    // 默认填当前时间(精确到分钟)
    const defNow = new Date();
    defNow.setSeconds(0, 0);
    const defaultDt = defNow.toISOString().slice(0, 16);

    Modal.open({
      title: isZh?'签收 + 上传回单':'Sign + Upload Receipt',
      width: 540,
      content: `
        <div style="display:grid; gap:14px;">
          <div>
            <label class="form-label">${isZh?'签收人':'Signed By'} <span style="color:var(--red);">*</span></label>
            <input class="input w-full" id="s-signer" placeholder="${isZh?'对方收货人姓名':'Name of recipient'}" value="${customer?.contactName || ''}">
          </div>
          <div>
            <label class="form-label">${isZh?'签收时间':'Signed At'} <span style="color:var(--red);">*</span></label>
            <input class="input w-full" type="datetime-local" id="s-time" value="${defaultDt}">
            <div class="text-muted" style="font-size:11px; margin-top:4px;">${isZh?'下班后卸货时,可手动改为实际签收时间(有回单为证)':'For after-hours unloading, set actual sign time (receipt proves it)'}</div>
          </div>
          <div>
            <label class="form-label">${isZh?'上传回单':'Upload Receipt'} <span style="color:var(--red);">*</span></label>
            <div id="s-uploader"></div>
            <div class="text-muted" style="font-size:11px; margin-top:4px;">${isZh?'必须上传至少一张回单/签收单照片':'At least one receipt/signed slip required'}</div>
          </div>
          <div>
            <label class="form-label">${isZh?'备注 (可选)':'Note (optional)'}</label>
            <textarea class="input w-full" id="s-note" rows="2"></textarea>
          </div>
        </div>
      `,
      buttons: [
        { label: isZh?'取消':'Cancel' },
        { label: isZh?'确认签收':'Confirm Sign', primary: true, onClick: () => {
          const signer = document.getElementById('s-signer').value.trim();
          if (!signer) { Toast.warning(isZh?'请填写签收人':'Signer required'); return false; }
          const dtStr = document.getElementById('s-time').value;
          if (!dtStr) { Toast.warning(isZh?'请选择签收时间':'Time required'); return false; }
          const signedIso = new Date(dtStr + ':00').toISOString();
          // 检查是否有回单
          const atts = AttachmentService.list({ entityType: 'delivery', entityId: delivery.id })
            .filter(a => (a.caption || '').includes('回单') || (a.caption || '').toLowerCase().includes('receipt'));
          if (atts.length === 0) {
            Toast.warning(isZh?'请上传至少一张回单':'Please upload at least one receipt');
            return false;
          }
          const note = document.getElementById('s-note').value.trim();
          DeliveryRepo.update(delivery.id, {
            transportStatus: 'signed',
            signedAt: signedIso,
            signedBy: signer,
            arrivedAt: delivery.arrivedAt || signedIso,
            signNote: note,
            updatedAt: Utils.now(),
          });
          delivery = DeliveryRepo.find(delivery.id);
          EventBus.emit('delivery.signed', { id: delivery.id });
          EventBus.emit('logistics.updated', { id: delivery.id });
          Toast.success(isZh?'签收成功':'Signed');
          render();
        }},
      ],
    });

    // 挂载回单上传组件(签收上传通过同一个 attachmentUploader)
    setTimeout(() => {
      if (typeof AttachmentUploader !== 'undefined') {
        AttachmentUploader.mount('#s-uploader', {
          entityType: 'delivery',
          entityId: delivery.id,
          captionPrefix: '回单',
          maxFiles: 5,
        });
      }
    }, 100);
  }

  function _openExceptionDialog() {
    const isZh = I18n.get() === 'zh-CN';
    Modal.open({
      title: isZh?'标记异常':'Mark Exception',
      width: 460,
      content: `
        <div style="display:grid; gap:12px;">
          <div>
            <label class="form-label">${isZh?'异常类型':'Type'}</label>
            <select class="input w-full" id="e-type">
              <option value="reject">${isZh?'客户拒收':'Rejected by customer'}</option>
              <option value="damage">${isZh?'货物破损':'Cargo damaged'}</option>
              <option value="short">${isZh?'件数短缺':'Short delivery'}</option>
              <option value="delay">${isZh?'严重延误':'Severe delay'}</option>
              <option value="other">${isZh?'其他':'Other'}</option>
            </select>
          </div>
          <div>
            <label class="form-label">${isZh?'详细说明':'Details'}</label>
            <textarea class="input w-full" id="e-reason" rows="3" placeholder="${isZh?'例如:破损 3 件,客户已拍照':'e.g. 3 damaged, customer took photos'}"></textarea>
          </div>
        </div>
      `,
      buttons: [
        { label: isZh?'取消':'Cancel' },
        { label: isZh?'标记':'Mark', primary: true, onClick: () => {
          const type = document.getElementById('e-type').value;
          const reason = document.getElementById('e-reason').value.trim();
          if (!reason) { Toast.warning(isZh?'请填写说明':'Please fill in details'); return false; }
          DeliveryRepo.update(delivery.id, {
            transportStatus: 'exception',
            exceptionType: type,
            exceptionReason: reason,
            updatedAt: Utils.now(),
          });
          delivery = DeliveryRepo.find(delivery.id);
          EventBus.emit('logistics.updated', { id: delivery.id });
          Toast.warning(isZh?'已标记异常':'Marked as exception');
          render();
        }},
      ],
    });
  }

  return { init };
})();

window.LogisticsDetailModule = LogisticsDetailModule;
