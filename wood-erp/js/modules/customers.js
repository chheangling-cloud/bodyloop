/**
 * 客户中心 - ERP Lite 放货控制台
 * @module modules/customers
 *
 * 定位:不是客户资料列表,而是「客户放货与信用控制页面」
 *
 * 核心问题:
 *   - 谁还能发货?
 *   - 谁快超额度?
 *   - 谁必须先付款?
 *   - 谁存在风险?
 *
 * 风控:Current Exposure = 所有未完成订单占用(不只是欠款)
 *   待审核 + 待出库 + 已发货未回款 + 未到结算周期
 */

const CustomersModule = (function () {
  'use strict';

  let dataTable = null;
  let filterStatus = 'all';      // all / ok / payment_required / frozen
  let filterMethod = 'all';      // all / 三车一结 / 月结 / 现金 / ...
  let searchKw = '';

  function init() {
    render();
    ['customer.updated','customer.created','customer.locked','customer.unlocked',
     'salesOrder.statusChanged','salesOrder.created','settlement.paid','delivery.created'
    ].forEach(e => EventBus.on(e, () => { if (document.getElementById('customer-root')) refresh(); }));
  }

  function render() {
    const isZh = I18n.get() === 'zh-CN';
    const cur = Session.current();

    document.getElementById('customer-root').innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">${isZh?'客户中心':'Customers'}</h1>
          <div class="page-subtitle">${isZh?'放货控制 · 信用占用 · 风险一览':'Shipment control · Credit · Risk overview'}</div>
        </div>
        <div class="flex gap-2">
          <button class="btn btn-secondary btn-sm" id="btn-export-customers">${typeof _exportIcon !== 'undefined' ? _exportIcon() : ''} ${isZh?'导出 Excel':'Export'}</button>
          ${cur.role === 'sales' || cur.role === 'manager' ? `<button class="btn btn-primary btn-sm" id="btn-new-cust">+ ${isZh?'新增客户':'New Customer'}</button>` : ''}
        </div>
      </div>

      <!-- 4 个核心 KPI:聚焦放货决策 -->
      <div class="grid grid-cols-4 gap-3 mb-4" id="cust-kpi"></div>

      <!-- 过滤 -->
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:14px;">
        <input id="cust-search" class="input" placeholder="${isZh?'搜索客户编号 / 名称 / 联系人':'Search code / name / contact'}" style="max-width:280px;">
        <select class="select" id="cust-filter-status">
          <option value="all">${isZh?'全部状态':'All status'}</option>
          <option value="ok">${isZh?'🟢 正常':'Normal'}</option>
          <option value="payment_required">${isZh?'🟡 需付款':'Payment Required'}</option>
          <option value="frozen">${isZh?'🔴 冻结':'Frozen'}</option>
        </select>
        <select class="select" id="cust-filter-method">
          <option value="all">${isZh?'全部结算方式':'All methods'}</option>
        </select>
        <span class="text-muted" style="margin-left:auto; font-size:12px;" id="cust-count"></span>
      </div>

      <div id="cust-table"></div>
    `;

    renderKPIs();
    fillMethodFilter();
    renderTable();
    _bindEvents();
  }

  function refresh() {
    renderKPIs();
    renderTable();
  }

  // ============== 核心:风控计算 ==============

  /**
   * 兼容字段路径(seed 用 rules.{truckCount,daysSinceLastSettlement,cumulativeAmount}
   *           新代码用 trigger.{truckCount,days,amount})
   */
  function _getRules(c) {
    const sp = c?.settlementPolicy;
    if (!sp) return {};
    // 新格式优先
    if (sp.trigger) {
      return {
        truck:  sp.trigger.truckCount,
        days:   sp.trigger.days,
        amount: sp.trigger.amount,
      };
    }
    // 老格式
    if (sp.rules) {
      return {
        truck:  sp.rules.truckCount,
        days:   sp.rules.daysSinceLastSettlement,
        amount: sp.rules.cumulativeAmount,
      };
    }
    return {};
  }

  // 每次渲染前批量预算所有客户的关键指标
  // 注意:统计逻辑在 CustomerStats 服务里(未来上云时这层在后端跑)
  // 但 customers.js 列表页有"结算进度"概念(看车次数),CustomerStats 没有,
  // 所以这里在 CustomerStats 基础上补 progress 字段
  let _statsCache = {};

  function _buildStatsCache(customers) {
    // 主指标:走 CustomerStats 服务统一计算
    const ids = customers.map(c => c.id);
    const statsMap = CustomerStats.computeAll(ids);

    // 列表页特有:车次结算进度
    const allOrders = SalesOrderRepo.list();
    const allDeliveries = DeliveryRepo.list({ is_archived: false });

    _statsCache = {};
    customers.forEach(c => {
      const s = statsMap[c.id];
      const rules = _getRules(c);
      let progress = null;
      if (rules.truck?.enabled) {
        const threshold = rules.truck.threshold || 3;
        const pendDels = allDeliveries.filter(d => {
          const order = allOrders.find(o => o.id === d.salesOrderId);
          return order?.customerId === c.id && d.settlementStatus === 'pending';
        });
        progress = { current: pendDels.length, threshold };
      }
      // 列表页的 status 还要考虑"车次结算阈值达到"(CustomerStats 没这逻辑)
      let status = s.status;
      if (status === 'ok' && progress && progress.current >= progress.threshold) {
        status = 'payment_required';
      }

      _statsCache[c.id] = {
        exposure:     s.exposure,
        pending:      s.pending,
        overdue:      s.overdue,
        receivables:  s.receivables,
        overdueCount: s.overdueCount,
        progress,
        status,
      };
    });
  }

  // 简单 getter,先看缓存
  function _calcExposure(custId) {
    return _statsCache[custId]?.exposure ?? 0;
  }
  function _calcReceivables(custId) {
    const s = _statsCache[custId];
    return {
      pending: s?.pending || 0,
      overdue: s?.overdue || 0,
      total:   s?.receivables || 0,
    };
  }
  function _calcSettleProgress(custId) {
    return _statsCache[custId]?.progress ?? null;
  }
  function _calcShipmentStatus(c) {
    return _statsCache[c.id]?.status ?? 'ok';
  }

  function _statusLabel(status) {
    const isZh = I18n.get() === 'zh-CN';
    return {
      ok:                isZh ? '正常' : 'Normal',
      payment_required:  isZh ? '需付款' : 'Payment',
      frozen:            isZh ? '冻结' : 'Frozen',
    }[status] || status;
  }

  function _statusColor(status) {
    return { ok: 'var(--emerald)', payment_required: 'var(--amber)', frozen: 'var(--red)' }[status] || 'var(--text-3)';
  }

  function _methodLabel(c) {
    const isZh = I18n.get() === 'zh-CN';
    const r = _getRules(c);
    const pay = c.settlementPolicy?.payment || {};
    const parts = [];
    if (r.truck?.enabled)  parts.push(isZh ? `${r.truck.threshold || 3}车一结` : `${r.truck.threshold || 3}-truck`);
    if (r.days?.enabled)   parts.push(isZh ? `${r.days.threshold || 30}天结` : `${r.days.threshold || 30}-day`);
    if (r.amount?.enabled) parts.push(isZh ? `按金额` : `Amount`);
    if (parts.length === 0) {
      return pay.method === 'cash' ? (isZh ? '现金' : 'Cash') : (isZh ? '现金' : 'Cash');
    }
    return parts.join(' + ');
  }

  // ============== KPI 顶部 ==============

  function renderKPIs() {
    const isZh = I18n.get() === 'zh-CN';
    const customers = CustomerRepo.list().filter(c => !c.is_archived && c.status !== 'deleted');
    _buildStatsCache(customers);
    let total = customers.length;
    let okCount = 0, payCount = 0, frozenCount = 0;
    let overCreditCount = 0;
    customers.forEach(c => {
      const s = _calcShipmentStatus(c);
      if (s === 'ok') okCount++;
      else if (s === 'payment_required') payCount++;
      else frozenCount++;
      const exp = _calcExposure(c.id);
      if (c.creditLimit && exp >= c.creditLimit * 0.8) overCreditCount++;
    });
    const kpis = [
      { label: isZh?'客户总数':'Customers', value: total,        sub: isZh?`${okCount} 个可发货`:`${okCount} can ship`, color: 'var(--text-1)' },
      { label: isZh?'需付款':'Payment Req', value: payCount,     sub: isZh?'达限制需收款':'Awaiting payment',           color: 'var(--amber)' },
      { label: isZh?'冻结':'Frozen',         value: frozenCount,  sub: isZh?'禁止发货':'Shipment blocked',                color: 'var(--red)' },
      { label: isZh?'额度临界':'Near Limit',  value: overCreditCount, sub: isZh?'占用 ≥ 80%':'Usage ≥ 80%',              color: 'var(--blue)' },
    ];
    document.getElementById('cust-kpi').innerHTML = kpis.map(k => `
      <div class="kpi">
        <div class="kpi-label">${k.label}</div>
        <div class="kpi-value" style="color:${k.color};">${k.value}</div>
        <div class="kpi-trend">${k.sub}</div>
      </div>
    `).join('');
  }

  // ============== 过滤器 ==============

  function fillMethodFilter() {
    const sel = document.getElementById('cust-filter-method');
    const customers = CustomerRepo.list().filter(c => !c.is_archived && c.status !== 'deleted');
    const methods = new Set();
    customers.forEach(c => {
      const m = _methodLabel(c);
      if (m) methods.add(m);
    });
    [...methods].sort().forEach(m => {
      const opt = document.createElement('option');
      opt.value = m; opt.textContent = m;
      sel.appendChild(opt);
    });
  }

  function _bindEvents() {
    document.getElementById('cust-search').addEventListener('input', (e) => {
      searchKw = e.target.value.trim().toLowerCase();
      renderTable();
    });
    document.getElementById('cust-filter-status').addEventListener('change', (e) => {
      filterStatus = e.target.value; renderTable();
    });
    document.getElementById('cust-filter-method').addEventListener('change', (e) => {
      filterMethod = e.target.value; renderTable();
    });
    const newBtn = document.getElementById('btn-new-cust');
    if (newBtn) newBtn.addEventListener('click', openCreateModal);
    const exportBtn = document.getElementById('btn-export-customers');
    if (exportBtn) exportBtn.addEventListener('click', exportCustomers);
  }

  function exportCustomers() {
    const customers = CustomerRepo.list().filter(c => !c.is_archived && c.status !== 'deleted');
    const modeLabel = {
      three_truck_one_settle: '三车一结',
      monthly: '月结',
      cash_on_delivery: '货到付款',
      manual: '手动',
    };
    const rows = customers.map(c => {
      const orders = SalesOrderRepo.list({ customerId: c.id });
      const setts = SettlementRepo.list({ customerId: c.id });
      const totalReceivable = setts.reduce((s, x) => s + ((x.payableAmount||0) - (x.paidAmount||0)), 0);
      const overdueAmt = setts.filter(s => s.status==='overdue').reduce((s, x) => s + ((x.payableAmount||0)-(x.paidAmount||0)), 0);
      return {
        code: c.code,
        name: c.name,
        contactName: c.contactName || '',
        phone: c.phone || '',
        address: c.address || '',
        creditLimit: c.creditLimit || 0,
        creditUsed: c.creditUsed || 0,
        settlementMode: modeLabel[c.settlementRule?.mode] || c.settlementRule?.mode || '-',
        paymentDays: c.paymentDays || 0,
        orderCount: orders.length,
        totalReceivable,
        overdueAmount: overdueAmt,
        status: c.status,
      };
    });
    ExcelExporter.exportSheet('客户档案_' + Utils.today(), '客户档案', [
      { key: 'code', label: '客户编号', width: 12 },
      { key: 'name', label: '客户名称', width: 18 },
      { key: 'contactName', label: '联系人', width: 12 },
      { key: 'phone', label: '电话', width: 14 },
      { key: 'address', label: '地址', width: 26 },
      { key: 'creditLimit', label: '信用额度', width: 14, format: 'currency' },
      { key: 'creditUsed', label: '已占用', width: 14, format: 'currency' },
      { key: 'settlementMode', label: '结算方式', width: 12 },
      { key: 'paymentDays', label: '账期(天)', width: 10, format: 'number' },
      { key: 'orderCount', label: '订单数', width: 8, format: 'number' },
      { key: 'totalReceivable', label: '应收', width: 14, format: 'currency' },
      { key: 'overdueAmount', label: '逾期金额', width: 14, format: 'currency' },
      { key: 'status', label: '状态', width: 10 },
    ], rows);
  }

  // ============== 主表 ==============

  function renderTable() {
    const isZh = I18n.get() === 'zh-CN';
    let customers = CustomerRepo.list().filter(c => !c.is_archived && c.status !== 'deleted');

    // 预算所有客户的指标(避免 N² 查询)— 必须在过滤之前,因为过滤可能用 _calcShipmentStatus
    _buildStatsCache(customers);

    if (filterStatus !== 'all') {
      customers = customers.filter(c => _calcShipmentStatus(c) === filterStatus);
    }
    if (filterMethod !== 'all') {
      customers = customers.filter(c => _methodLabel(c) === filterMethod);
    }
    if (searchKw) {
      customers = customers.filter(c => {
        return (c.name || '').toLowerCase().includes(searchKw)
          || (c.code || '').toLowerCase().includes(searchKw)
          || (c.contactName || '').toLowerCase().includes(searchKw)
          || (c.phone || '').toLowerCase().includes(searchKw);
      });
    }

    document.getElementById('cust-count').textContent = isZh ? `共 ${customers.length} 个客户` : `${customers.length} customers`;

    const columns = [
      { key: 'code',  label: isZh?'编号':'Code', width: '110px', sortable: true,
        render: r => `<span class="font-mono text-muted">${r.code || '-'}</span>`
      },
      { key: 'name',  label: isZh?'客户名称':'Name', width: '180px', sortable: true,
        render: r => {
          const status = _calcShipmentStatus(r);
          const dot = `<span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:${_statusColor(status)}; margin-right:6px; vertical-align:middle;"></span>`;
          return `<a href="${Router.href('customer-detail', { id: r.id })}" style="text-decoration:none;">
            ${dot}<span class="text-strong">${r.name}</span>
            ${r.contactName ? `<div class="text-muted" style="font-size:11px; margin-left:14px;">${r.contactName}${r.phone?' · '+r.phone:''}</div>` : ''}
          </a>`;
        }
      },
      { key: '_method', label: isZh?'结算方式':'Method', width: '130px',
        render: r => `<span style="font-size:11px; color:var(--text-2);">${_methodLabel(r)}</span>`
      },
      { key: 'creditLimit', label: isZh?'信用额度':'Credit Limit', width: '110px', align:'right', sortable: true,
        render: r => `<span class="font-mono text-muted">${Sensitive.credit(r.creditLimit)}</span>`
      },
      { key: '_exposure', label: isZh?'当前占用':'Exposure', width: '180px',
        sortKey: r => _calcExposure(r.id),
        render: r => {
          const exp = _calcExposure(r.id);
          if (!Sensitive.canSeeAmount()) {
            return `<span class="font-mono text-muted">***</span>`;
          }
          const limit = r.creditLimit || 0;
          const pct = limit > 0 ? Math.min(Math.round(exp / limit * 100), 999) : 0;
          const barColor = pct >= 100 ? 'var(--red)' : pct >= 80 ? 'var(--amber)' : 'var(--emerald)';
          const highlight = pct >= 90;
          return `
            <div style="display:flex; align-items:center; gap:8px;">
              <div style="flex:1; height:5px; background:var(--bg-3); border-radius:2px; overflow:hidden;">
                <div style="width:${Math.min(pct, 100)}%; height:100%; background:${barColor};"></div>
              </div>
              <span class="font-mono" style="font-size:11px; min-width:60px; text-align:right; color:${highlight?'var(--red)':'var(--text-2)'}; font-weight:${highlight?'600':'400'};">
                ${Utils.formatMoney(exp)}
              </span>
            </div>
            <div class="text-muted" style="font-size:10px; text-align:right; margin-top:2px;">${pct}%</div>
          `;
        }
      },
      { key: '_available', label: isZh?'可用额度':'Available', width: '110px', align:'right',
        sortKey: r => (r.creditLimit || 0) - _calcExposure(r.id),
        render: r => {
          const avail = (r.creditLimit || 0) - _calcExposure(r.id);
          if (!Sensitive.canSeeAmount()) return `<span class="font-mono text-muted">***</span>`;
          const color = avail < 0 ? 'var(--red)' : avail < (r.creditLimit || 0) * 0.2 ? 'var(--amber)' : 'var(--text-1)';
          return `<span class="font-mono" style="color:${color}; font-weight:${avail < 0 ? '600' : '400'};">${Utils.formatMoney(avail)}</span>`;
        }
      },
      { key: '_receivables', label: isZh?'应收 / 逾期':'Receivable', width: '120px', align:'right',
        render: r => {
          const { pending, overdue } = _calcReceivables(r.id);
          if (!Sensitive.canSeeAmount()) return `<span class="font-mono text-muted">***</span>`;
          if (pending === 0 && overdue === 0) return `<span class="text-muted">-</span>`;
          return `
            ${pending > 0 ? `<div class="font-mono" style="font-size:11px;">${Utils.formatMoney(pending)}</div>` : ''}
            ${overdue > 0 ? `<div class="font-mono text-red" style="font-size:11px; font-weight:600;">${isZh?'逾期 ':'Overdue '}${Utils.formatMoney(overdue)}</div>` : ''}
          `;
        }
      },
      { key: '_progress', label: isZh?'结算进度':'Progress', width: '90px', align:'center',
        render: r => {
          const p = _calcSettleProgress(r.id);
          if (!p) return `<span class="text-muted">-</span>`;
          const reached = p.current >= p.threshold;
          return `<span style="padding:2px 8px; background:${reached?'rgba(245,158,11,0.15)':'var(--bg-3)'}; color:${reached?'var(--amber)':'var(--text-2)'}; border-radius:3px; font-size:11px; font-weight:${reached?'600':'400'};">${p.current}/${p.threshold} ${isZh?'车':'tr'}</span>`;
        }
      },
      { key: '_status', label: isZh?'发货状态':'Status', width: '100px', align:'center',
        render: r => {
          const s = _calcShipmentStatus(r);
          return `<span style="padding:3px 10px; background:${_statusColor(s)}; color:#fff; border-radius:3px; font-size:11px; font-weight:500;">${_statusLabel(s)}</span>`;
        }
      },
      { key: '_actions', label: isZh?'操作':'Actions', width: '70px', align:'center', sortable: false,
        render: r => `<a href="${Router.href('customer-detail', { id: r.id })}" class="text-accent" style="text-decoration:none; font-size:11px;">${isZh?'详情 →':'View →'}</a>`
      },
    ];

    if (dataTable && dataTable.destroy) dataTable.destroy();
    dataTable = DataTable.create({
      mount: '#cust-table',
      columns,
      data: customers,
      pageSize: 20,
      compact: true,
    });
  }

  // ============== 新增弹窗 ==============

  function openCreateModal(opts) {
    const isZh = I18n.get() === 'zh-CN';
    const onCreated = opts && opts.onCreated;
    Modal.open({
      title: isZh?'新增客户':'New Customer',
      width: 560,
      content: `
        <style>
          .cust-form fieldset { border:1px solid var(--border-1); border-radius:6px; padding:14px 16px; margin-bottom:14px; }
          .cust-form legend { padding:0 8px; font-size:11px; color:var(--text-3); text-transform:uppercase; letter-spacing:0.6px; }
          .cust-form .grid-2 { display:grid; grid-template-columns: 1fr 1fr; gap:12px; }
          .cust-form .form-row { margin-bottom:10px; }
          .cust-form .form-row:last-child { margin-bottom:0; }
          .cust-form .hint { font-size:11px; color:var(--text-4); margin-top:4px; }
        </style>
        <div class="cust-form">

          <fieldset>
            <legend>${isZh?'基础信息':'Basic Info'}</legend>
            <div class="form-row">
              <label class="form-label">${isZh?'客户名称':'Name'} <span style="color:var(--red);">*</span></label>
              <input class="input w-full" id="new-name" placeholder="${isZh?'如:顺达建材有限公司':'Company name'}">
            </div>
            <div class="grid-2">
              <div class="form-row">
                <label class="form-label">${isZh?'联系人':'Contact'}</label>
                <input class="input w-full" id="new-contact">
              </div>
              <div class="form-row">
                <label class="form-label">${isZh?'电话':'Phone'}</label>
                <input class="input w-full" id="new-phone">
              </div>
            </div>
            <div class="form-row">
              <label class="form-label">${isZh?'地址':'Address'}</label>
              <input class="input w-full" id="new-address">
            </div>
          </fieldset>

          <fieldset>
            <legend>${isZh?'结算方式 (按需勾选,不勾代表现金交易)':'Settlement (uncheck = cash)'}</legend>
            <div style="display:grid; gap:10px;">

              <div style="display:flex; align-items:center; gap:8px;">
                <input type="checkbox" id="rule-truck">
                <label for="rule-truck" style="font-size:13px; min-width:90px; cursor:pointer;">${isZh?'按车次结算':'By trucks'}</label>
                <input class="input" id="new-truckThreshold" type="number" value="3" min="1" style="width:60px;">
                <span style="font-size:12px; color:var(--text-3);">${isZh?'车一结':'truck(s) per settle'}</span>
              </div>

              <div style="display:flex; align-items:center; gap:8px;">
                <input type="checkbox" id="rule-time">
                <label for="rule-time" style="font-size:13px; min-width:90px; cursor:pointer;">${isZh?'按账期结算':'By time'}</label>
                <input class="input" id="new-daysThreshold" type="number" value="30" min="1" style="width:60px;">
                <span style="font-size:12px; color:var(--text-3);">${isZh?'天一结':'day(s) per settle'}</span>
              </div>

              <div style="display:flex; align-items:center; gap:8px;">
                <input type="checkbox" id="rule-amount">
                <label for="rule-amount" style="font-size:13px; min-width:90px; cursor:pointer;">${isZh?'按金额结算':'By amount'}</label>
                <span style="font-size:12px; color:var(--text-3);">${isZh?'累计满':'reaches'}</span>
                <div style="position:relative;">
                  <span style="position:absolute; left:8px; top:50%; transform:translateY(-50%); color:var(--text-3); font-size:12px;">$</span>
                  <input class="input" id="new-amountThreshold" type="number" value="0" min="0" step="0.01" style="width:120px; padding-left:18px;">
                </div>
              </div>

            </div>
            <div class="hint" style="margin-top:10px;">${isZh?'不勾任何选项 = 现金交易,每单结清':'No selection = cash per order'}</div>
          </fieldset>

          <fieldset>
            <legend>${isZh?'信用控制':'Credit Control'}</legend>
            <div class="form-row">
              <label class="form-label">${isZh?'信用额度':'Credit Limit'}</label>
              <div style="position:relative;">
                <span style="position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--text-3);">$</span>
                <input class="input w-full" id="new-creditLimit" type="number" value="100000" min="0" step="100" style="padding-left:24px;">
              </div>
              <div class="hint">${isZh?'最大可挂账金额。超出后自动转"需付款"状态':'Max outstanding. Exceeding triggers "Payment Required"'}</div>
            </div>
          </fieldset>

        </div>
      `,
      buttons: [
        { label: isZh?'取消':'Cancel' },
        { label: isZh?'创建':'Create', primary: true, onClick: () => {
          const name = document.getElementById('new-name').value.trim();
          if (!name) { Toast.warning(isZh?'请输入客户名称':'Name required'); return false; }
          const truckEn = document.getElementById('rule-truck').checked;
          const timeEn  = document.getElementById('rule-time').checked;
          const amtEn   = document.getElementById('rule-amount').checked;
          const data = {
            name,
            shortName: name.slice(0, 4),
            contactName: document.getElementById('new-contact').value.trim(),
            phone:   document.getElementById('new-phone').value.trim(),
            address: document.getElementById('new-address').value.trim(),
            creditLimit: Utils.dollarsToCents(document.getElementById('new-creditLimit').value),
            paymentDays: timeEn ? (Number(document.getElementById('new-daysThreshold').value) || 30) : 30,
            settlementPolicy: {
              trigger: {
                truckCount: { enabled: truckEn, threshold: Number(document.getElementById('new-truckThreshold').value) || 3 },
                days:       { enabled: timeEn,  threshold: Number(document.getElementById('new-daysThreshold').value)  || 30 },
                amount:     { enabled: amtEn,   threshold: Utils.dollarsToCents(document.getElementById('new-amountThreshold').value) },
                combineMode: 'any',
              },
              payment: {
                method: (!truckEn && !timeEn && !amtEn) ? 'cash' : 'bank_transfer',
                days:   timeEn ? (Number(document.getElementById('new-daysThreshold').value) || 30) : 0,
              },
            },
          };
          try {
            const created = CustomerService.create(data, Session.current()?.id);
            Toast.success(isZh ? `已创建客户 ${created.name}` : `Created ${created.name}`);
            if (typeof onCreated === 'function') onCreated(created);
          } catch (e) {
            Toast.error(e.message);
            return false;
          }
        }},
      ],
    });
  }

  return { init, openCreateModal };
})();

window.CustomersModule = CustomersModule;
