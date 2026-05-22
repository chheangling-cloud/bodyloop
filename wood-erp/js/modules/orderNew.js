/**
 * OrderNew - 新建订单 3-Step Form (按截图重做)
 * Step 1: 选客户
 * Step 2: 添加产品 + 物流 + 备注(整合大屏页)
 * Step 3: 确认 + 创建
 *
 * 财务检查环节已删除 — 100% 订单都进财务审批,无需前置展示
 */

const OrderNewModule = (function () {
  'use strict';

  let state = null;

  function init(ctx) {
    const customerId = ctx?.query?.customerId || null;
    const cust = customerId ? CustomerRepo.find(customerId) : null;

    state = {
      step: cust ? 2 : 1,
      customer: cust,
      items: [{ materialId: '', spec: '', unit: '', qty: 0, unitPrice: 0 }],
      deliveryDate: Utils.addDays(Utils.today(), 14),
      plannedTruckCount: 1,
      transportMode: 'road',
      deliveryAddress: '',
      driverNote: '',
      paymentMethod: 'monthly',
      remark: '',
      attachments: [],
      approveReason: '',
      submitImmediately: true,
    };
    render();
  }

  function render() {
    const isZh = I18n.get() === 'zh-CN';
    document.getElementById('order-new-root').innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
        <div style="display:flex; align-items:center; gap:12px;">
          <a href="${state.customer ? Router.href('customer-detail',{id:state.customer.id}) : Router.href('order-center')}"
             style="color:var(--text-3); text-decoration:none; font-size:13px;">←</a>
          <h1 style="font-size:18px; font-weight:600; margin:0;">${isZh?'新建销售订单':'New Sales Order'}</h1>
          <span style="padding:2px 8px; font-size:11px; background:var(--bg-3); border-radius:3px; color:var(--text-3);">${isZh?'草稿':'Draft'}</span>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-secondary btn-sm" data-cancel-top>${isZh?'×':'Close'}</button>
        </div>
      </div>
      ${renderStepper()}
      <div id="step-body" style="margin-top:20px;"></div>
    `;
    renderStepBody();
    document.querySelector('[data-cancel-top]')?.addEventListener('click', () => Router.go('order-center'));
  }

  function renderStepper() {
    const isZh = I18n.get() === 'zh-CN';
    const steps = [
      { num: 1, label: isZh?'选择客户':'Customer' },
      { num: 2, label: isZh?'添加产品':'Products' },
      { num: 3, label: isZh?'确认订单':'Confirm' },
    ];
    return `
      <div style="display:flex; align-items:center; padding:14px 20px; background:var(--bg-2); border:1px solid var(--border-1); border-radius:8px;">
        ${steps.map((s, idx) => {
          const isCurrent = state.step === s.num;
          const isDone = state.step > s.num;
          const color = isDone ? 'var(--emerald)' : isCurrent ? 'var(--emerald)' : 'var(--text-4)';
          const bg = isDone ? 'var(--emerald-bg)' : isCurrent ? 'var(--emerald-bg)' : 'transparent';
          const border = isDone || isCurrent ? 'var(--emerald)' : 'var(--border-2)';
          return `
            <div style="display:flex; align-items:center; ${idx<steps.length-1?'flex:1;':''}">
              <div style="display:flex; align-items:center; gap:10px;">
                <div style="width:28px; height:28px; border-radius:50%; background:${bg}; border:1.5px solid ${border}; color:${color}; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:600;">
                  ${isDone ? '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3,8 7,12 13,4"/></svg>' : s.num}
                </div>
                <span style="font-size:13px; color:${color}; font-weight:${isCurrent || isDone ? 600 : 400};">${s.label}</span>
              </div>
              ${idx<steps.length-1 ? `<div style="flex:1; height:1.5px; background:${isDone?'var(--emerald)':'var(--border-2)'}; margin:0 16px;"></div>` : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderStepBody() {
    if (state.step === 1) return renderStep1();
    if (state.step === 2) return renderStep2();
    if (state.step === 3) return renderStep3();
  }

  // ============================================================
  // Step 1: 选客户
  // ============================================================
  function renderStep1() {
    const isZh = I18n.get() === 'zh-CN';
    const customers = CustomerRepo.list().filter(c => c.status === 'active');
    customers.forEach(c => {
      const lastOrder = SalesOrderRepo.list({ customerId: c.id })
        .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
      c._lastOrderTime = lastOrder ? new Date(lastOrder.createdAt).getTime() : 0;
    });
    customers.sort((a, b) => b._lastOrderTime - a._lastOrderTime);

    document.getElementById('step-body').innerHTML = `
      <div class="ov-section">
        <div class="ov-section-head">
          <span>${isZh?'选择客户':'Select Customer'}</span>
          <button class="btn btn-sm btn-primary" id="new-cust-btn" style="margin-left:auto;">
            + ${isZh?'新建客户':'New Customer'}
          </button>
        </div>
        <div class="ov-section-body">
          <input type="text" id="cust-search" class="input"
            placeholder="${isZh?'搜索客户名 / 编号 / 联系人':'Search'}"
            style="width:100%; margin-bottom:14px;">
          <div id="cust-list" style="max-height:520px; overflow-y:auto;">
            ${renderCustomerList(customers)}
          </div>
        </div>
      </div>
      <div style="display:flex; justify-content:space-between; margin-top:16px;">
        <button class="btn btn-ghost" data-cancel>${isZh?'取消':'Cancel'}</button>
      </div>
    `;

    document.getElementById('cust-search').addEventListener('input', e => {
      const kw = e.target.value.trim().toLowerCase();
      const filtered = customers.filter(c =>
        !kw || c.name.toLowerCase().includes(kw) || (c.code||'').toLowerCase().includes(kw) ||
        (c.contactName || '').toLowerCase().includes(kw)
      );
      document.getElementById('cust-list').innerHTML = renderCustomerList(filtered);
      bindCustomerSelect();
    });
    bindCustomerSelect();

    document.getElementById('new-cust-btn').addEventListener('click', openNewCustomerModal);
    document.querySelector('[data-cancel]')?.addEventListener('click', () => Router.go('order-center'));
  }

  function openNewCustomerModal() {
    CustomersModule.openCreateModal({
      onCreated: (cust) => {
        state.customer = cust;
        state.step = 2;
        // 收货地址预填
        state.deliveryAddress = cust.address || '';
        render();
      },
    });
  }

  function renderCustomerList(customers) {
    const isZh = I18n.get() === 'zh-CN';
    if (customers.length === 0) {
      return `<div class="text-muted" style="padding:20px; text-align:center;">${isZh?'无匹配客户':'No matching'}</div>`;
    }
    return customers.map(c => {
      const lim = c.settlementPolicy?.credit?.limit || c.creditLimit || 0;
      const used = (c.currentDebt || 0) + (c.pendingDeliveryAmount || 0);
      const pct = lim > 0 ? Math.round(used / lim * 100) : 0;
      const pctColor = pct > 90 ? 'var(--red)' : pct > 70 ? 'var(--amber)' : 'var(--emerald)';
      return `
        <div data-cust-id="${c.id}" class="cust-pick"
          style="padding:12px 14px; border:1px solid var(--border-1); border-radius:6px; margin-bottom:8px; cursor:pointer;"
          onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border-1)'">
          <div style="display:flex; justify-content:space-between; align-items:start;">
            <div>
              <div class="text-strong" style="font-size:13px;">${c.name}</div>
              <div class="text-muted" style="font-size:11px; margin-top:2px;">
                <span class="font-mono">${c.code}</span>
                ${c.contactName ? ' · ' + c.contactName : ''}
                ${c.shipmentLocked ? ` · <span style="color:var(--red);">${isZh?'锁定':'Locked'}</span>` : ''}
              </div>
            </div>
            <div style="text-align:right;">
              <div class="text-muted" style="font-size:10px;">${isZh?'欠款':'Debt'}</div>
              <div class="font-mono" style="font-size:12px; ${(c.currentDebt||0)>0?'color:var(--text-1);':'color:var(--text-3);'}">${Utils.formatMoney(c.currentDebt||0)}</div>
              <div style="font-size:10px; color:${pctColor}; margin-top:2px;">${isZh?'信用':'Credit'} ${pct}%</div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  function bindCustomerSelect() {
    document.querySelectorAll('[data-cust-id]').forEach(el => {
      el.addEventListener('click', () => {
        state.customer = CustomerRepo.find(el.dataset.custId);
        state.deliveryAddress = state.customer?.address || '';
        state.step = 2;
        render();
      });
    });
  }

  // ============================================================
  // Step 2: 添加产品 + 物流 + 备注(按截图布局)
  // ============================================================
  function renderStep2() {
    const isZh = I18n.get() === 'zh-CN';
    const c = state.customer;
    const products = ProductService.list({ status: 'active' });

    // 客户信用
    const lim = c.settlementPolicy?.credit?.limit || c.creditLimit || 0;
    const used = (c.currentDebt || 0) + (c.pendingDeliveryAmount || 0);
    const available = Math.max(0, lim - used);
    const pct = lim > 0 ? Math.round(used / lim * 100) : 0;
    const creditTight = pct >= 80;
    const paymentDays = c.settlementPolicy?.payment?.days || c.paymentDays || 30;

    // 风险检查
    const risks = _computeRisks();

    document.getElementById('step-body').innerHTML = `
      <!-- 客户卡片 -->
      <div style="background:var(--bg-2); border:1px solid var(--border-1); border-radius:8px; padding:16px 20px; margin-bottom:14px;">
        <div style="display:grid; grid-template-columns: 48px 2.5fr 1fr 1fr 1fr 1.5fr auto; gap:16px; align-items:center;">
          <div style="width:48px; height:48px; border-radius:50%; background:var(--blue-bg); color:var(--blue); display:flex; align-items:center; justify-content:center; font-size:18px; font-weight:600;">
            ${(c.name || '?').charAt(0)}
          </div>
          <div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="text-strong" style="font-size:14px;">${c.name}</span>
              <span style="padding:2px 8px; font-size:10px; border-radius:3px; background:var(--emerald-bg); color:var(--emerald);">${isZh?'正常客户':'Normal'}</span>
            </div>
            <div class="text-muted" style="font-size:11px; margin-top:4px;">
              <span class="font-mono">${c.code}</span>
              ${c.contactName ? ` · ${isZh?'联系人':'Contact'}: ${c.contactName}` : ''}
              ${c.phone ? ` · ${c.phone}` : ''}
            </div>
          </div>
          <div>
            <div class="text-muted" style="font-size:10px;">${isZh?'信用额度':'Credit Limit'}</div>
            <div class="font-mono text-strong" style="font-size:13px; margin-top:2px;">${Utils.formatMoney(lim)}</div>
          </div>
          <div>
            <div class="text-muted" style="font-size:10px;">${isZh?'可用额度':'Available'}</div>
            <div class="font-mono text-strong" style="font-size:13px; margin-top:2px; color:${creditTight?'var(--amber)':'var(--emerald)'};">${Utils.formatMoney(available)}</div>
          </div>
          <div>
            <div class="text-muted" style="font-size:10px;">${isZh?'账期':'Days'}</div>
            <div class="text-strong" style="font-size:13px; margin-top:2px;">${paymentDays} ${isZh?'天':'days'}</div>
          </div>
          <div>
            <div class="text-muted" style="font-size:10px;">${isZh?'收货地址':'Address'}</div>
            <div class="text-strong" style="font-size:12px; margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:200px;" title="${c.address||''}">${c.address || (isZh?'未填':'-')}</div>
          </div>
          <button class="btn btn-secondary btn-sm" data-change-cust>${isZh?'更换客户':'Change'}</button>
        </div>
      </div>

      <!-- 产品表 -->
      <div style="background:var(--bg-2); border:1px solid var(--border-1); border-radius:8px; padding:16px 20px; margin-bottom:14px;">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
          <span class="text-strong" style="font-size:14px;">${isZh?'订单产品':'Order Products'}</span>
          <button class="btn btn-secondary btn-sm" id="add-item">+ ${isZh?'添加产品':'Add Product'}</button>
          <button class="btn btn-secondary btn-sm" id="add-custom">+ ${isZh?'创建临时规格':'Custom Product'}</button>
          <span style="flex:1;"></span>
        </div>

        <div style="overflow-x:auto;">
          <table class="order-items-table" style="width:100%; font-size:12px; border-collapse:separate; border-spacing:0;">
            <thead>
              <tr style="background:var(--bg-3); color:var(--text-3); text-transform:uppercase; font-size:10px; height:36px;">
                <th style="text-align:center; padding:0 8px; width:36px;">#</th>
                <th style="text-align:left; padding:0 12px; width:200px;">${isZh?'产品':'Product'}</th>
                <th style="text-align:left; padding:0 12px; width:200px;">${isZh?'规格':'Spec'}</th>
                <th style="text-align:left; padding:0 12px; width:130px;">${isZh?'库存可用':'Stock'}</th>
                <th style="text-align:right; padding:0 12px; width:110px;">${isZh?'数量':'Qty'}</th>
                <th style="text-align:left; padding:0 12px; width:60px;">${isZh?'单位':'Unit'}</th>
                <th style="text-align:right; padding:0 12px; width:200px;">${isZh?'单价':'Unit Price'}</th>
                <th style="text-align:right; padding:0 12px;">${isZh?'小计':'Subtotal'}</th>
              </tr>
            </thead>
            <tbody id="items-tbody">${renderItemRows(products)}</tbody>
          </table>
        </div>
      </div>

      <!-- 风险提示(智能化) -->
      ${risks.length > 0 ? `
        <div style="margin-bottom:14px; padding:14px 18px; background:rgba(248,113,113,0.06); border:1px solid rgba(248,113,113,0.25); border-radius:6px;">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--red)" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.5 L15 13 H1 z"/><line x1="8" y1="6" x2="8" y2="9.5"/><circle cx="8" cy="11.5" r="0.8" fill="var(--red)"/></svg>
            <span class="text-strong" style="color:var(--red); font-size:13px;">${isZh?'风险提示':'Risk Alert'}</span>
          </div>
          <div style="display:flex; gap:24px; font-size:12px; color:var(--text-2);">
            ${risks.map(r => `<span><span style="color:${r.color};">●</span> ${r.message}</span>`).join('')}
          </div>
        </div>
      ` : ''}

      <!-- 4 列 box -->
      <div style="display:grid; grid-template-columns: 1.3fr 1.3fr 1fr 1fr; gap:14px; margin-bottom:14px;">

        <!-- 订单信息 -->
        <div style="background:var(--bg-2); border:1px solid var(--border-1); border-radius:8px; padding:14px 16px;">
          <div class="text-strong" style="font-size:13px; margin-bottom:12px;">${isZh?'订单信息':'Order Info'}</div>
          <div style="display:grid; gap:10px;">
            <div>
              <label class="text-muted" style="font-size:11px;">${isZh?'交期':'Delivery Date'} <span style="color:var(--red);">*</span></label>
              <input type="date" class="input" id="delivery-date" value="${state.deliveryDate}" style="width:100%; margin-top:4px;">
            </div>
            <div>
              <label class="text-muted" style="font-size:11px;">${isZh?'付款方式':'Payment'}</label>
              <select class="select w-full" id="payment-method" style="margin-top:4px;">
                <option value="monthly" ${state.paymentMethod==='monthly'?'selected':''}>${isZh?'月结':'Monthly'}</option>
                <option value="cod" ${state.paymentMethod==='cod'?'selected':''}>${isZh?'货到付款':'COD'}</option>
                <option value="prepay" ${state.paymentMethod==='prepay'?'selected':''}>${isZh?'预付':'Prepay'}</option>
                <option value="cash" ${state.paymentMethod==='cash'?'selected':''}>${isZh?'现金':'Cash'}</option>
              </select>
            </div>
            <div>
              <label class="text-muted" style="font-size:11px;">${isZh?'备注':'Remark'}</label>
              <textarea class="input" id="remark" rows="3" style="width:100%; margin-top:4px; resize:vertical;"
                placeholder="${isZh?'可选,如:首次合作 / 加急生产 / 特殊要求等...':'Optional'}">${state.remark || ''}</textarea>
            </div>
          </div>
        </div>

        <!-- 物流信息 -->
        <div style="background:var(--bg-2); border:1px solid var(--border-1); border-radius:8px; padding:14px 16px;">
          <div style="display:flex; align-items:center; gap:6px; margin-bottom:12px;">
            <span class="text-strong" style="font-size:13px;">${isZh?'物流信息':'Logistics'}</span>
            <span class="text-muted" style="font-size:11px;">(${isZh?'可选':'Optional'})</span>
          </div>
          <div style="display:grid; gap:10px;">
            <div>
              <label class="text-muted" style="font-size:11px;">${isZh?'运输方式':'Mode'}</label>
              <select class="select w-full" id="transport-mode" style="margin-top:4px;">
                <option value="road" ${state.transportMode==='road'?'selected':''}>${isZh?'公路运输':'Road'}</option>
                <option value="rail" ${state.transportMode==='rail'?'selected':''}>${isZh?'铁路运输':'Rail'}</option>
                <option value="self_pickup" ${state.transportMode==='self_pickup'?'selected':''}>${isZh?'客户自提':'Self-pickup'}</option>
              </select>
            </div>
            <div>
              <label class="text-muted" style="font-size:11px;">
                ${isZh?'预计车次数':'Planned Trucks'}
                <span style="color:var(--text-4);" title="${isZh?'订单将分几车发货,影响仓库装车任务数':'How many trucks'}">ⓘ</span>
              </label>
              <input type="number" class="input" id="planned-truck-count" value="${state.plannedTruckCount}" min="1" max="20" style="width:100%; margin-top:4px;">
            </div>
            <div>
              <label class="text-muted" style="font-size:11px;">${isZh?'送货地址':'Delivery Address'}</label>
              <input type="text" class="input" id="delivery-address" value="${state.deliveryAddress || ''}" style="width:100%; margin-top:4px;">
            </div>
            <div>
              <label class="text-muted" style="font-size:11px;">${isZh?'司机备注':'Driver Note'}</label>
              <input type="text" class="input" id="driver-note" value="${state.driverNote || ''}" placeholder="${isZh?'司机注意事项...':'Notes...'}" style="width:100%; margin-top:4px;">
            </div>
          </div>
        </div>

        <!-- 订单摘要 -->
        <div style="background:var(--bg-2); border:1px solid var(--border-1); border-radius:8px; padding:14px 16px;">
          <div class="text-strong" style="font-size:13px; margin-bottom:12px;">${isZh?'订单摘要':'Summary'}</div>
          ${_renderSummary(isZh)}
        </div>

        <!-- 订单金额 -->
        <div style="background:var(--bg-2); border:1px solid var(--border-1); border-radius:8px; padding:14px 16px;">
          <div class="text-strong" style="font-size:13px; margin-bottom:12px;">${isZh?'订单金额':'Amount'}</div>
          ${_renderAmount(isZh)}
        </div>
      </div>

      <!-- 底部按钮 -->
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:16px;">
        <button class="btn btn-ghost" data-prev>${isZh?'← 返回选客户':'← Back'}</button>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-secondary" data-save-draft>${isZh?'保存草稿':'Save Draft'}</button>
          <button class="btn btn-primary" data-next>${isZh?'下一步:确认':'Next'} →</button>
        </div>
      </div>
    `;

    bindItemRows(products);
    document.getElementById('add-item').addEventListener('click', () => {
      state.items.push({ materialId: '', spec: '', unit: '', qty: 0, unitPrice: 0 });
      renderStep2();
    });
    document.getElementById('add-custom').addEventListener('click', openCustomProductModal);
    document.querySelector('[data-change-cust]').addEventListener('click', () => { state.step = 1; render(); });
    document.getElementById('delivery-date').addEventListener('change', e => { state.deliveryDate = e.target.value; });
    document.getElementById('planned-truck-count').addEventListener('change', e => {
      state.plannedTruckCount = Math.max(1, Math.min(20, Number(e.target.value) || 1));
      renderStep2();
    });
    document.getElementById('payment-method').addEventListener('change', e => { state.paymentMethod = e.target.value; });
    document.getElementById('transport-mode').addEventListener('change', e => { state.transportMode = e.target.value; });
    document.getElementById('delivery-address').addEventListener('input', e => { state.deliveryAddress = e.target.value; });
    document.getElementById('driver-note').addEventListener('input', e => { state.driverNote = e.target.value; });
    document.getElementById('remark').addEventListener('input', e => { state.remark = e.target.value; });

    document.querySelector('[data-prev]').addEventListener('click', () => { state.step = 1; render(); });
    document.querySelector('[data-next]').addEventListener('click', () => {
      const valid = state.items.filter(it => it.materialId && it.qty > 0 && it.unitPrice > 0);
      if (valid.length === 0) {
        Toast.warning(I18n.get()==='zh-CN'?'请添加至少一个有效产品行':'Add at least one valid item');
        return;
      }
      state.items = valid;
      state.step = 3;
      render();
    });
    document.querySelector('[data-save-draft]').addEventListener('click', () => {
      const valid = state.items.filter(it => it.materialId && it.qty > 0 && it.unitPrice > 0);
      if (valid.length === 0) {
        Toast.warning(I18n.get()==='zh-CN'?'请添加至少一个有效产品行':'Add at least one valid item');
        return;
      }
      state.items = valid;
      state.submitImmediately = false;
      createOrder();
    });
  }

  function renderItemRows(products) {
    const isZh = I18n.get() === 'zh-CN';
    return state.items.map((it, idx) => {
      const p = it.materialId ? ProductService.findById(it.materialId) : null;
      const stock = p ? ProductService.getCurrentStock(p.id) : 0;
      const stockStatus = !p ? null : (stock >= (it.qty || 0) ? 'enough' : 'short');
      const stockBadge = stockStatus === 'enough'
        ? `<span style="padding:1px 6px; font-size:10px; border-radius:3px; background:var(--emerald-bg); color:var(--emerald);">${isZh?'充足':'OK'}</span>`
        : stockStatus === 'short' ? `<span style="padding:1px 6px; font-size:10px; border-radius:3px; background:var(--red-bg); color:var(--red);">${isZh?'不足':'Short'}</span>` : '';

      // 单价偏离指导价(用作变色)
      let unitPriceColor = 'var(--text-1)';
      if (p && p.guidePrice > 0 && it.unitPrice > 0) {
        const diffPct = (it.unitPrice - p.guidePrice) / p.guidePrice;
        if (diffPct < -0.15) unitPriceColor = 'var(--amber)';
        else if (diffPct > 0.15) unitPriceColor = 'var(--blue)';
      }

      const isCustom = p && p.category === 'custom';

      return `
        <tr class="order-row" style="border-bottom:1px solid var(--border-1); height:56px;" data-row-idx="${idx}">
          <td style="padding:0 8px; text-align:center; color:var(--text-3); vertical-align:middle;">
            <span class="row-num">${idx + 1}</span>
            ${state.items.length > 1 ? `<button class="row-delete-btn" data-remove-row="${idx}" title="${isZh?'删除':'Remove'}"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="3,4 13,4"/><path d="M5 4 V2.5 a1 1 0 0 1 1 -1 H10 a1 1 0 0 1 1 1 V4"/><path d="M4 4 L4.5 13.5 a1 1 0 0 0 1 1 H10.5 a1 1 0 0 0 1 -1 L12 4"/></svg></button>` : ''}
          </td>
          <td style="padding:0 12px; vertical-align:middle;">
            <div style="display:flex; gap:4px; align-items:center;">
              <select class="input" data-row="${idx}" data-field="materialId" style="flex:1; font-size:12px; height:32px;">
                <option value="">${isZh?'选择产品':'Select'}</option>
                ${products.map(m => `<option value="${m.id}" ${it.materialId===m.id?'selected':''}>${m.name}${m.category==='custom'?' [定制]':''}</option>`).join('')}
              </select>
              <button class="esel-btn esel-add" data-prod-add="${idx}" title="${isZh?'新建产品':'Add Product'}"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/></svg></button>
              <button class="esel-btn esel-edit" data-prod-edit="${idx}" title="${isZh?'编辑产品':'Edit'}" ${!it.materialId?'disabled':''}><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M11 2.5 l2.5 2.5 -8.5 8.5 H2.5 V11 z"/></svg></button>
            </div>
            ${p ? `<div class="text-muted font-mono" style="font-size:10px; margin-top:3px;">${p.code}${isCustom?' · <span style="color:var(--violet);">定制</span>':''}</div>` : ''}
          </td>
          <td style="padding:0 12px; vertical-align:middle;">
            <div style="font-size:12px;">${it.spec || '-'}</div>
          </td>
          <td style="padding:0 12px; vertical-align:middle;">
            ${p ? `
              <div style="display:flex; align-items:center; gap:6px; flex-wrap:nowrap;">
                <span class="font-mono" style="font-size:12px;">${stock}</span>
                <span style="color:var(--text-3); font-size:10px;">${p.unit || ''}</span>
                ${stockBadge}
              </div>
            ` : '<span class="text-muted">-</span>'}
          </td>
          <td style="padding:0 12px; vertical-align:middle; text-align:right;">
            <input type="number" class="input no-spin" data-row="${idx}" data-field="qty"
                   value="${it.qty || ''}" min="0" step="1" style="width:80px; text-align:right; font-size:12px; height:32px;">
          </td>
          <td style="padding:0 12px; vertical-align:middle;">
            <span class="text-muted" style="font-size:12px;">${it.unit || '-'}</span>
          </td>
          <td style="padding:0 12px; vertical-align:middle;">
            <div style="display:flex; align-items:center; justify-content:flex-end; gap:8px;">
              ${p && p.guidePrice ? `<span class="text-muted" style="font-size:10px; white-space:nowrap;">${isZh?'指导价':'Guide'} ${Utils.formatMoney(p.guidePrice)}</span>` : ''}
              <input type="number" class="input no-spin" data-row="${idx}" data-field="unitPrice"
                     value="${it.unitPrice ? (it.unitPrice / 100).toFixed(2) : ''}" min="0" step="0.01"
                     style="width:90px; text-align:right; font-size:12px; height:32px; color:${unitPriceColor};">
            </div>
          </td>
          <td style="padding:0 12px; text-align:right; vertical-align:middle;" class="font-mono">${Utils.formatMoney((it.qty||0) * (it.unitPrice||0))}</td>
        </tr>
      `;
    }).join('');
  }

  function bindItemRows(products) {
    document.querySelectorAll('[data-row]').forEach(el => {
      el.addEventListener('change', e => {
        const idx = +e.target.dataset.row;
        const field = e.target.dataset.field;
        if (field === 'materialId') {
          const m = ProductService.findById(e.target.value);
          state.items[idx].materialId = e.target.value;
          state.items[idx].spec = m?.spec || '';
          state.items[idx].unit = m?.unit || '';
          if (m && !state.items[idx].unitPrice) {
            const histPrice = _lastPriceForCustomerMaterial(state.customer.id, e.target.value);
            state.items[idx].unitPrice = histPrice || m.guidePrice || 0;
          }
        } else if (field === 'unitPrice') {
          state.items[idx].unitPrice = Utils.dollarsToCents(e.target.value);
        } else {
          state.items[idx][field] = Number(e.target.value) || 0;
        }
        renderStep2();
      });
    });
    document.querySelectorAll('[data-remove-row]').forEach(el => {
      el.addEventListener('click', () => {
        const idx = +el.dataset.removeRow;
        state.items.splice(idx, 1);
        renderStep2();
      });
    });

    // 产品行 — 新建产品
    document.querySelectorAll('[data-prod-add]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = +btn.dataset.prodAdd;
        openQuickProductModal(null, (created) => {
          state.items[idx].materialId = created.id;
          state.items[idx].spec = created.spec || '';
          state.items[idx].unit = created.unit || '';
          state.items[idx].unitPrice = created.guidePrice || 0;
          renderStep2();
        });
      });
    });

    // 产品行 — 编辑产品
    document.querySelectorAll('[data-prod-edit]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = +btn.dataset.prodEdit;
        const matId = state.items[idx].materialId;
        if (!matId) return;
        openQuickProductModal(matId, () => renderStep2());
      });
    });
  }

  // ============================================================
  // 快速新建/编辑产品(从订单页直接操作)
  // ============================================================
  function openQuickProductModal(productId, onDone) {
    const isZh = I18n.get() === 'zh-CN';
    const p = productId ? ProductService.findById(productId) : null;
    Modal.open({
      title: productId ? (isZh?'编辑产品':'Edit Product') : (isZh?'快速新建产品':'Quick New Product'),
      width: 520,
      content: `
        <div style="display:grid; gap:12px;">
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div>
              <label class="form-label">${isZh?'产品名称':'Name'} <span style="color:var(--red);">*</span></label>
              <input id="qp-name" class="input w-full" value="${p?.name||''}">
            </div>
            <div>
              <label class="form-label">${isZh?'品类':'Category'}</label>
              <select id="qp-cat" class="select w-full">
                <option value="plywood" ${(p?.category||'plywood')==='plywood'?'selected':''}>Plywood</option>
                <option value="veneer" ${p?.category==='veneer'?'selected':''}>Veneer</option>
                <option value="custom" ${p?.category==='custom'?'selected':''}>${isZh?'定制':'Custom'}</option>
              </select>
            </div>
          </div>
          <div>
            <label class="form-label">${isZh?'规格':'Spec'}</label>
            <input id="qp-spec" class="input w-full" value="${p?.spec||''}" placeholder="2.44 × 1.22 × 0.012m">
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div>
              <label class="form-label">${isZh?'单位':'Unit'}</label>
              <input id="qp-unit" class="input w-full" value="${p?.unit||'pcs'}">
            </div>
            <div>
              <label class="form-label">${isZh?'编号':'Code'}</label>
              <input id="qp-code" class="input w-full" value="${p?.code||''}" ${productId?'disabled':''} placeholder="${isZh?'留空自动':'Auto'}">
            </div>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div>
              <label class="form-label">${isZh?'指导价':'Guide Price'} <span style="color:var(--red);">*</span></label>
              <div style="position:relative;">
                <span style="position:absolute; left:10px; top:50%; transform:translateY(-50%); color:var(--text-3);">$</span>
                <input id="qp-guide" class="input w-full" type="number" step="0.01" min="0"
                  value="${p?.guidePrice?(p.guidePrice/100).toFixed(2):''}" style="padding-left:22px;">
              </div>
            </div>
            <div>
              <label class="form-label">${isZh?'最低价':'Min Price'}</label>
              <div style="position:relative;">
                <span style="position:absolute; left:10px; top:50%; transform:translateY(-50%); color:var(--text-3);">$</span>
                <input id="qp-min" class="input w-full" type="number" step="0.01" min="0"
                  value="${p?.minPrice?(p.minPrice/100).toFixed(2):''}" style="padding-left:22px;">
              </div>
            </div>
          </div>
        </div>
      `,
      buttons: [
        { label: isZh?'取消':'Cancel' },
        { label: productId?(isZh?'保存':'Save'):(isZh?'创建':'Create'), primary: true, onClick: () => {
          const name = document.getElementById('qp-name').value.trim();
          if (!name) { Toast.warning(isZh?'请输入产品名称':'Name required'); return false; }
          const guide = Math.round(parseFloat(document.getElementById('qp-guide').value||'0')*100);
          if (!guide) { Toast.warning(isZh?'请输入指导价':'Guide price required'); return false; }
          const min = Math.round(parseFloat(document.getElementById('qp-min').value||'0')*100) || Math.round(guide*0.85);
          const data = {
            name,
            spec: document.getElementById('qp-spec').value.trim(),
            unit: document.getElementById('qp-unit').value.trim()||'pcs',
            category: document.getElementById('qp-cat').value,
            guidePrice: guide,
            minPrice: min,
            price: guide,
          };
          try {
            let result;
            if (productId) {
              result = ProductService.update(productId, data, Session.current()?.id);
              Toast.success(isZh?'已保存':'Saved');
            } else {
              data.code = document.getElementById('qp-code').value.trim() || ('P-' + Date.now().toString(36).toUpperCase().slice(-4));
              result = ProductService.create(data);
              Toast.success(isZh?`已创建 ${result.name}`:`Created ${result.name}`);
            }
            if (onDone) onDone(result);
          } catch (e) { Toast.error(e.message); return false; }
        }},
      ],
    });
  }

  // ============================================================
  // 临时规格产品 Modal
  // ============================================================
  function openCustomProductModal() {
    const isZh = I18n.get() === 'zh-CN';
    Modal.open({
      title: isZh?'创建临时规格产品':'Custom Product',
      width: 540,
      content: `
        <div style="padding:10px 12px; background:rgba(167,139,250,0.08); border-left:3px solid var(--violet); border-radius:4px; margin-bottom:14px; font-size:12px; color:var(--text-2);">
          ${isZh?'临时规格产品提交订单后将自动进入产品库,归类为"定制",可后续在产品管理中调整':'Custom product will be added to product library after order submission, categorized as "Custom"'}
        </div>
        <div style="display:grid; gap:12px;">
          <div>
            <label class="form-label">${isZh?'产品名称':'Name'} <span style="color:var(--red);">*</span></label>
            <input id="cp-name" class="input w-full" placeholder="${isZh?'如:E 板(定制)':'e.g. E Board (Custom)'}">
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
            <div>
              <label class="form-label">${isZh?'规格':'Spec'}</label>
              <input id="cp-spec" class="input w-full" placeholder="${isZh?'如:2.44 × 1.22 × 0.020m':'e.g. 2.44 × 1.22 × 0.020m'}">
            </div>
            <div>
              <label class="form-label">${isZh?'单位':'Unit'}</label>
              <input id="cp-unit" class="input w-full" value="pcs">
            </div>
          </div>
          <div>
            <label class="form-label">${isZh?'指导价':'Guide Price'} <span style="color:var(--red);">*</span></label>
            <div style="position:relative;">
              <span style="position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--text-3);">$</span>
              <input id="cp-guide" class="input w-full" type="number" step="0.01" min="0" placeholder="0.00" style="padding-left:24px;">
            </div>
          </div>
        </div>
      `,
      buttons: [
        { label: isZh?'取消':'Cancel' },
        { label: isZh?'创建':'Create', primary: true, onClick: () => {
          const name = document.getElementById('cp-name').value.trim();
          if (!name) { Toast.warning('请输入产品名称'); return false; }
          const guideDollars = parseFloat(document.getElementById('cp-guide').value || '0');
          if (guideDollars <= 0) { Toast.warning('请输入指导价'); return false; }
          const code = `CUSTOM-${Date.now().toString(36).toUpperCase()}`;
          const guideCents = Math.round(guideDollars * 100);
          try {
            const p = ProductService.create({
              code,
              name,
              category: 'custom',  // 归类为"定制"
              spec: document.getElementById('cp-spec').value.trim(),
              unit: document.getElementById('cp-unit').value.trim() || 'pcs',
              price: guideCents,
              guidePrice: guideCents,
              minPrice: Math.round(guideCents * 0.85),
              needApproval: true,
            });
            Toast.success(`已创建临时产品 ${name}`);
            // 找到第一个空行,塞进去;没空行就加一行
            const emptyIdx = state.items.findIndex(it => !it.materialId);
            if (emptyIdx >= 0) {
              state.items[emptyIdx] = {
                materialId: p.id, spec: p.spec, unit: p.unit, qty: 0, unitPrice: p.guidePrice,
              };
            } else {
              state.items.push({
                materialId: p.id, spec: p.spec, unit: p.unit, qty: 0, unitPrice: p.guidePrice,
              });
            }
            renderStep2();
          } catch (e) {
            Toast.error(e.message);
            return false;
          }
        }},
      ],
    });
  }

  // ============================================================
  // 风险计算(智能化:不再说"低于最低价",改成更合理的提示)
  // ============================================================
  function _computeRisks() {
    const isZh = I18n.get() === 'zh-CN';
    const risks = [];

    // 1. 库存不足
    let stockShortCount = 0;
    state.items.forEach(it => {
      if (!it.materialId || !it.qty) return;
      const p = ProductService.findById(it.materialId);
      if (!p) return;
      const stock = ProductService.getCurrentStock(p.id);
      if (stock < it.qty) stockShortCount++;
    });
    if (stockShortCount > 0) {
      risks.push({
        type: 'stock_short',
        color: 'var(--red)',
        message: isZh ? `${stockShortCount} 个产品库存不足` : `${stockShortCount} item(s) low stock`,
      });
    }

    // 2. 单价偏离指导价过多(≥30%)
    let priceDeviationCount = 0;
    state.items.forEach(it => {
      if (!it.materialId || !it.unitPrice) return;
      const p = ProductService.findById(it.materialId);
      if (!p || !p.guidePrice) return;
      const diff = Math.abs((it.unitPrice - p.guidePrice) / p.guidePrice);
      if (diff >= 0.30) priceDeviationCount++;
    });
    if (priceDeviationCount > 0) {
      risks.push({
        type: 'price_deviation',
        color: 'var(--blue)',
        message: isZh ? `${priceDeviationCount} 个产品单价偏离指导价较大` : `${priceDeviationCount} item(s) price deviates from guide`,
      });
    }

    // 3. 客户信用紧张
    const c = state.customer;
    if (c) {
      const lim = c.settlementPolicy?.credit?.limit || c.creditLimit || 0;
      const used = (c.currentDebt || 0) + (c.pendingDeliveryAmount || 0);
      const orderTotal = _total();
      const expectedUsed = used + orderTotal;
      if (lim > 0 && expectedUsed / lim > 0.85) {
        risks.push({
          type: 'credit_tight',
          color: 'var(--amber)',
          message: isZh ? '客户当前可用额度较低' : 'Customer credit nearly exhausted',
        });
      }
    }

    // 4. 临时定制产品提示(财务必审)
    const customCount = state.items.filter(it => {
      if (!it.materialId) return false;
      const p = ProductService.findById(it.materialId);
      return p && p.category === 'custom';
    }).length;
    if (customCount > 0) {
      risks.push({
        type: 'custom_product',
        color: 'var(--violet)',
        message: isZh ? `${customCount} 个临时定制产品` : `${customCount} custom item(s)`,
      });
    }

    return risks;
  }

  function _renderSummary(isZh) {
    const itemCount = state.items.filter(it => it.materialId && it.qty > 0).length;
    const totalQty = state.items.reduce((s, it) => s + (it.qty || 0), 0);
    // 估算体积/重量(用规格;假设每 pc 一定体积)
    let totalVolume = 0;
    let totalWeight = 0;
    state.items.forEach(it => {
      if (!it.materialId || !it.qty) return;
      const p = ProductService.findById(it.materialId);
      if (!p) return;
      // 从 spec 解析:形如 "2.44 × 1.22 × 0.012m"
      const m = (p.spec || '').match(/([\d.]+)\s*[×x]\s*([\d.]+)\s*[×x]\s*([\d.]+)/);
      if (m) {
        const v = parseFloat(m[1]) * parseFloat(m[2]) * parseFloat(m[3]);
        totalVolume += v * it.qty;
        totalWeight += v * it.qty * 600;  // 估算密度 600 kg/m³
      }
    });
    return `
      <div style="display:grid; gap:8px; font-size:12px;">
        <div style="display:flex; justify-content:space-between;">
          <span class="text-muted">${isZh?'产品种类':'Item Types'}</span>
          <span class="text-strong">${itemCount}</span>
        </div>
        <div style="display:flex; justify-content:space-between;">
          <span class="text-muted">${isZh?'总数量':'Total Qty'}</span>
          <span class="text-strong">${totalQty} pcs</span>
        </div>
        <div style="display:flex; justify-content:space-between;">
          <span class="text-muted">${isZh?'预计体积':'Est. Volume'}</span>
          <span class="text-strong">${totalVolume.toFixed(2)} m³</span>
        </div>
        <div style="display:flex; justify-content:space-between;">
          <span class="text-muted">${isZh?'预计重量':'Est. Weight'}</span>
          <span class="text-strong">${totalWeight.toFixed(0)} kg</span>
        </div>
        <div style="display:flex; justify-content:space-between;">
          <span class="text-muted">${isZh?'预计车次数':'Trucks'}</span>
          <span class="text-strong">${state.plannedTruckCount} ${isZh?'车':''}</span>
        </div>
      </div>
    `;
  }

  function _renderAmount(isZh) {
    const subtotal = _total();
    const discount = 0;
    const tax = 0;
    const grand = subtotal - discount + tax;
    return `
      <div style="display:grid; gap:8px; font-size:12px;">
        <div style="display:flex; justify-content:space-between;">
          <span class="text-muted">${isZh?'商品总额':'Subtotal'}</span>
          <span class="font-mono">${Utils.formatMoney(subtotal)}</span>
        </div>
        <div style="display:flex; justify-content:space-between;">
          <span class="text-muted">${isZh?'折扣金额':'Discount'}</span>
          <span class="font-mono">${Utils.formatMoney(discount)}</span>
        </div>
        <div style="display:flex; justify-content:space-between;">
          <span class="text-muted">${isZh?'税费':'Tax'}</span>
          <span class="font-mono">${Utils.formatMoney(tax)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; padding-top:8px; border-top:1px solid var(--border-1);">
          <span class="text-strong">${isZh?'订单合计':'Total'}</span>
          <span class="font-mono text-strong" style="font-size:18px; color:var(--emerald);">${Utils.formatMoney(grand)}</span>
        </div>
      </div>
    `;
  }

  // ============================================================
  // Step 3: 确认
  // ============================================================
  function renderStep3() {
    const isZh = I18n.get() === 'zh-CN';
    const total = _total();
    const cur = Session.current();
    const customCount = state.items.filter(it => {
      const p = it.materialId ? ProductService.findById(it.materialId) : null;
      return p && p.category === 'custom';
    }).length;

    document.getElementById('step-body').innerHTML = `
      <div class="ov-section">
        <div class="ov-section-head"><span>${isZh?'确认订单信息':'Confirm Order'}</span></div>
        <div class="ov-section-body">
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px 30px; font-size:13px;">
            <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px dashed var(--border-1);">
              <span class="text-muted">${isZh?'客户':'Customer'}</span>
              <span class="text-strong">${state.customer.name}</span>
            </div>
            <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px dashed var(--border-1);">
              <span class="text-muted">${isZh?'销售':'Sales'}</span>
              <span>${cur.name}</span>
            </div>
            <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px dashed var(--border-1);">
              <span class="text-muted">${isZh?'明细数':'Items'}</span>
              <span>${state.items.length} ${isZh?'项 · 共':'item(s) · '} ${state.items.reduce((s,it)=>s+(it.qty||0),0)} ${isZh?'件':'units'}</span>
            </div>
            <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px dashed var(--border-1);">
              <span class="text-muted">${isZh?'订单金额':'Amount'}</span>
              <span class="font-mono text-strong">${Utils.formatMoney(total)}</span>
            </div>
            <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px dashed var(--border-1);">
              <span class="text-muted">${isZh?'交期':'Delivery'}</span>
              <span class="font-mono">${state.deliveryDate}</span>
            </div>
            <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px dashed var(--border-1);">
              <span class="text-muted">${isZh?'预计车次':'Trucks'}</span>
              <span class="font-mono">${state.plannedTruckCount} ${isZh?'车':''}</span>
            </div>
            <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px dashed var(--border-1);">
              <span class="text-muted">${isZh?'送货地址':'Address'}</span>
              <span style="font-size:12px; max-width:280px; text-align:right;">${state.deliveryAddress || '-'}</span>
            </div>
            <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px dashed var(--border-1);">
              <span class="text-muted">${isZh?'付款方式':'Payment'}</span>
              <span>${({monthly:'月结', cod:'货到付款', prepay:'预付', cash:'现金'})[state.paymentMethod] || state.paymentMethod}</span>
            </div>
          </div>
          ${state.remark ? `
            <div style="margin-top:14px; padding:10px 14px; background:var(--bg-3); border-radius:4px;">
              <div class="text-muted" style="font-size:11px; margin-bottom:4px;">${isZh?'备注':'Remark'}</div>
              <div style="font-size:12px;">${state.remark}</div>
            </div>
          ` : ''}
          ${customCount > 0 ? `
            <div style="margin-top:14px; padding:10px 14px; background:rgba(167,139,250,0.08); border-left:3px solid var(--violet); border-radius:4px;">
              <div class="text-strong" style="font-size:12px; color:var(--violet);">${customCount} ${isZh?'个临时定制产品':'custom item(s)'}</div>
              <div class="text-muted" style="font-size:11px; margin-top:4px;">${isZh?'订单经财务审批后,定制产品将进入正式产品管理':'After approval, custom items will join product library'}</div>
            </div>
          ` : ''}
        </div>
      </div>

      <div class="ov-section" style="margin-top:14px;">
        <div class="ov-section-head"><span>${Icon.paperclip ? Icon.paperclip(13) : '📎'} ${isZh?'附件(可选)':'Attachments'}</span></div>
        <div class="ov-section-body">
          <div id="order-att-mount"></div>
          <div class="text-muted" style="font-size:11px; margin-top:6px;">${isZh?'例如:客户聊天截图、合同 PDF':'e.g. chat screenshots, contract PDF'}</div>
        </div>
      </div>

      <div class="ov-section" style="margin-top:14px;">
        <div class="ov-section-head"><span>${isZh?'申请理由(可选)':'Approval Reason (Optional)'}</span></div>
        <div class="ov-section-body">
          <div class="text-muted" style="font-size:11px; margin-bottom:8px;">${isZh?'订单提交后将进入财务审批,可填写补充说明,加快财务理解':'Order will go to Finance approval. Provide context to speed up review.'}</div>
          <textarea class="input" id="approve-reason" rows="2" style="width:100%; resize:vertical;"
            placeholder="${isZh?'如:客户长期合作 / 老客户特殊价 / 急单 / 临时定制':'e.g. Long-term customer / Custom spec / Urgent'}">${state.approveReason || ''}</textarea>
        </div>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:16px;">
        <button class="btn btn-ghost" data-prev>${isZh?'← 上一步':'← Back'}</button>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-secondary" data-save-draft>${isZh?'保存草稿':'Save Draft'}</button>
          <button class="btn btn-primary" data-create>${Icon.check(13)} ${isZh?'创建并提交财务审批':'Create & Submit'}</button>
        </div>
      </div>
    `;

    // 附件上传
    if (!window.__orderNewUploader || window.__orderNewUploader._destroyed) {
      window.__orderNewUploader = AttachmentUploader.create({
        mount: '#order-att-mount',
        entityType: 'order',
        entityId: 'pending-' + Date.now(),
        placeholder: isZh?'客户聊天截图 / 合同 PDF':'Chat / Contract',
        maxFiles: 5,
      });
    }
    document.getElementById('approve-reason').addEventListener('input', e => { state.approveReason = e.target.value; });
    document.querySelector('[data-prev]').addEventListener('click', () => { state.step = 2; render(); });
    document.querySelector('[data-create]').addEventListener('click', () => {
      state.submitImmediately = true;
      createOrder();
    });
    document.querySelector('[data-save-draft]').addEventListener('click', () => {
      state.submitImmediately = false;
      createOrder();
    });
  }

  // ============================================================
  // Utils
  // ============================================================
  function _lastPriceForCustomerMaterial(customerId, materialId) {
    const orders = SalesOrderRepo.list({ customerId })
      .filter(o => o.status !== 'cancelled')
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    for (const o of orders) {
      for (const it of (o.items || [])) {
        if (it.materialId === materialId && it.unitPrice > 0) return it.unitPrice;
      }
    }
    return null;
  }

  function _total() {
    return state.items.reduce((s, it) => s + (it.qty || 0) * (it.unitPrice || 0), 0);
  }

  function createOrder() {
    const isZh = I18n.get() === 'zh-CN';
    try {
      const cur = Session.current();
      const items = state.items.map(it => {
        const m = MaterialRepo.find(it.materialId);
        const lineId = `oi_${Utils.uuid().slice(0,8)}`;
        return {
          lineId,
          materialId: it.materialId,
          materialName: m?.name || '-',
          spec: it.spec,
          unit: it.unit,
          qty: it.qty,
          originalQty: it.qty,
          deliveredQty: 0,
          unitPrice: it.unitPrice,
          originalUnitPrice: it.unitPrice,
          amount: it.qty * it.unitPrice,
          remark: '',
        };
      });
      const orderData = {
        customerId: state.customer.id,
        orderDate: Utils.today(),
        deliveryDate: state.deliveryDate,
        plannedTruckCount: state.plannedTruckCount || 1,
        items,
        salesId: cur.id,
        salesPersonId: cur.id,
        remark: state.remark,
        deliveryAddress: state.deliveryAddress,
        driverNote: state.driverNote,
        paymentMethod: state.paymentMethod,
        transportMode: state.transportMode,
        attachments: state.attachments,
        approveReason: state.approveReason || '',
      };
      const order = SalesOrderService.create(orderData, cur.id);

      if (window.__orderNewUploader) {
        const tempAtts = window.__orderNewUploader.getAttachments();
        tempAtts.forEach(att => {
          AttachmentRepo.update(att.id, { entityId: order.id, entityType: 'order' });
        });
        window.__orderNewUploader._destroyed = true;
      }

      const submitNow = state.submitImmediately !== false;
      if (submitNow) {
        try {
          OrderTaskService.submitOrder(order.id, cur.id);
          Toast.success(isZh?`订单 ${order.no} 已提交财务审批`:`Order ${order.no} submitted`);
        } catch (e) {
          Toast.warning(isZh?`订单已创建但提交失败: ${e.message}`:`Order created but submit failed: ${e.message}`);
        }
      } else {
        Toast.success(isZh?`订单 ${order.no} 已保存为草稿`:`Order ${order.no} saved as draft`);
      }

      setTimeout(() => Router.go('order-detail', { id: order.id }), 400);
    } catch (e) {
      console.error(e);
      Toast.error(e.message || (isZh?'创建失败':'Create failed'));
    }
  }

  return { init };
})();

window.OrderNewModule = OrderNewModule;
