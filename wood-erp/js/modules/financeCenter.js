/**
 * 财务中心 - 4 Tab(收款 / 欠款 / 信用 / 财务事件)
 * @module modules/financeCenter
 */

const FinanceCenterModule = (function () {
  'use strict';

  let activeTab = 'payments';

  function init(ctx) {
    const isZh = I18n.get() === 'zh-CN';
    activeTab = (ctx?.query?.tab) || 'payments';

    document.getElementById('app-content').innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">${t('financeCenter.title')}</h1>
          <div class="page-subtitle">${t('financeCenter.subtitle')}</div>
        </div>
        <div>
          <button class="btn btn-secondary btn-sm" id="btn-export-fc">${typeof _exportIcon !== 'undefined' ? _exportIcon() : ''} 导出 Excel</button>
        </div>
      </div>
      <div class="grid grid-cols-4 gap-3 mb-4" id="fc-kpi-row"></div>
      <div class="order-tabs" id="fc-tabs"></div>
      <div id="fc-content"></div>
    `;

    renderKPIs();
    renderTabs();
    renderContent();

    const ebtn = document.getElementById('btn-export-fc');
    if (ebtn) ebtn.addEventListener('click', exportFinance);

    ['payment.created','payment.confirmed','payment.rejected','settlement.paymentReceived'
    ].forEach(e => EventBus.on(e, () => { renderKPIs(); renderContent(); }));
  }

  function exportFinance() {
    // 根据 activeTab 导出对应数据
    const isZh = I18n.get() === 'zh-CN';
    if (activeTab === 'payments') {
      const payments = PaymentRepo.list().sort((a,b) => (b.paymentDate||'').localeCompare(a.paymentDate||''));
      const methodLabel = { transfer: '银行转账', cash: '现金', check: '承兑汇票', other: '其他' };
      const rows = payments.map(p => {
        const cust = CustomerRepo.find(p.customerId) || {};
        const sett = p.settlementId ? SettlementRepo.find(p.settlementId) : null;
        return {
          no: p.no,
          paymentDate: p.paymentDate,
          customer: cust.name || '-',
          settlementNo: sett?.no || '-',
          amount: p.amount,
          method: methodLabel[p.method] || p.method,
          referenceNo: p.referenceNo || '-',
          status: p.status === 'confirmed' ? '已确认' : (p.status === 'pending' ? '待确认' : p.status),
          remark: p.remark || '',
        };
      });
      ExcelExporter.exportSheet('收款流水_' + Utils.today(), '收款流水', [
        { key: 'no', label: '收款单号', width: 18 },
        { key: 'paymentDate', label: '收款日', width: 12, format: 'date' },
        { key: 'customer', label: '客户', width: 16 },
        { key: 'settlementNo', label: '关联结算', width: 18 },
        { key: 'amount', label: '金额', width: 14, format: 'currency' },
        { key: 'method', label: '方式', width: 10 },
        { key: 'referenceNo', label: '流水号', width: 16 },
        { key: 'status', label: '状态', width: 10 },
        { key: 'remark', label: '备注', width: 20 },
      ], rows);
    } else {
      Toast.info(isZh ? '当前 Tab 暂不支持导出,请切换到收款流水' : 'Switch to Payments tab to export');
    }
  }

  function renderKPIs() {
    const k = FinanceService.getFinanceKPIs();
    document.getElementById('fc-kpi-row').innerHTML = `
      <div class="kpi">
        <div class="kpi-bar red"></div>
        <div class="kpi-label">${t('financeCenter.kpiReceivable')}</div>
        <div class="kpi-value">${Utils.formatMoney(k.totalReceivable)}</div>
        <div class="kpi-trend">${t('financeCenter.kpiReceivableSub')}</div>
      </div>
      <div class="kpi">
        <div class="kpi-bar emerald"></div>
        <div class="kpi-label">${t('financeCenter.kpiMonthCollected')}</div>
        <div class="kpi-value">${Utils.formatMoney(k.monthCollected)}</div>
        <div class="kpi-trend">${k.monthPaymentCount} ${t('financeCenter.kpiMonthCollectedSub')}</div>
      </div>
      <div class="kpi">
        <div class="kpi-bar amber"></div>
        <div class="kpi-label">${t('financeCenter.kpiPending')}</div>
        <div class="kpi-value">${k.pendingPaymentCount}</div>
        <div class="kpi-trend">${Utils.formatMoney(k.pendingPaymentAmount)}</div>
      </div>
      <div class="kpi">
        <div class="kpi-bar red"></div>
        <div class="kpi-label">${t('financeCenter.kpiOverdue')}</div>
        <div class="kpi-value">${Utils.formatMoney(k.overdueAmount)}</div>
        <div class="kpi-trend">${k.overdueCount} ${t('financeCenter.kpiOverdueSub')}</div>
      </div>
    `;
  }

  function renderTabs() {
    const isZh = I18n.get() === 'zh-CN';
    const k = FinanceService.getFinanceKPIs();
    const tabs = [
      { key: 'payments', label: t('financeCenter.tabPayments'), count: FinanceService.listPayments().length, icon: Icon.money(13) },
      { key: 'debt',     label: t('financeCenter.tabDebt'),     count: null, icon: Icon.warning(13) },
      { key: 'credit',   label: t('financeCenter.tabCredit'),   count: k.atRiskCount, icon: Icon.bank(13) },
      { key: 'events',   label: t('financeCenter.tabEvents'),   count: FinanceService.listCreditEvents().length, icon: Icon.receipt(13) },
    ];
    document.getElementById('fc-tabs').innerHTML = tabs.map(tb => `
      <div class="order-tab ${activeTab === tb.key ? 'active' : ''}" data-tab="${tb.key}">
        <span class="tab-icon-svg">${tb.icon}</span> ${tb.label} ${tb.count !== null ? `<span class="count">${tb.count}</span>` : ''}
      </div>
    `).join('');
    document.getElementById('fc-tabs').querySelectorAll('[data-tab]').forEach(el => {
      el.addEventListener('click', () => {
        activeTab = el.dataset.tab;
        renderTabs(); renderContent();
        Router.replace('finance-center', {}, { tab: activeTab });
      });
    });
  }

  function renderContent() {
    if (activeTab === 'payments') return renderPayments();
    if (activeTab === 'debt')     return renderDebt();
    if (activeTab === 'credit')   return renderCredit();
    if (activeTab === 'events')   return renderEvents();
  }

  // ===== Tab 1: 收款流水 =====
  function renderPayments() {
    const isZh = I18n.get() === 'zh-CN';
    const payments = FinanceService.listPayments();
    const customers = CustomerRepo.list();
    const settlements = SettlementRepo.list();
    const custMap = Object.fromEntries(customers.map(c => [c.id, c]));
    const stlMap = Object.fromEntries(settlements.map(s => [s.id, s]));

    const columns = [
      {
        key: 'paymentDate', label: t('financeCenter.colDate'), width: '110px',
        render: r => `<span class="font-mono">${Utils.formatDate(r.paymentDate)}</span>`,
      },
      {
        key: 'no', label: t('financeCenter.colNo'), width: '170px',
        render: r => `<span class="font-mono text-strong">${r.no}</span>`,
      },
      {
        key: 'customerId', label: t('financeCenter.colCustomer'),
        render: r => {
          const c = custMap[r.customerId];
          return c ? `<a class="text-strong" href="${Router.href('customer-detail',{id:c.id})}" style="text-decoration:none; color:var(--text-1);">${c.name}</a>` : '-';
        },
      },
      {
        key: 'settlementId', label: t('financeCenter.colSettlement'), width: '170px',
        render: r => {
          const s = stlMap[r.settlementId];
          return s ? `<a class="font-mono text-accent" href="${Router.href('settlement-detail',{id:s.id})}" style="text-decoration:none;">${s.no}</a>` : '-';
        },
      },
      {
        key: 'amount', label: t('financeCenter.colAmount'), width: '130px', align: 'right',
        render: r => `<span class="font-mono text-emerald text-strong">+${Utils.formatMoney(r.amount)}</span>`,
      },
      {
        key: 'method', label: t('financeCenter.colMethod'), width: '110px',
        render: r => renderMethodBadge(r.method),
      },
      {
        key: 'reference', label: t('financeCenter.colReference'), width: '130px',
        render: r => r.reference ? `<span class="font-mono text-muted">${r.reference}</span>` : '-',
      },
      {
        key: 'status', label: t('financeCenter.colStatus'), width: '100px',
        render: r => renderStatusBadge(r.status),
      },
      {
        key: 'receipt', label: t('financeCenter.colReceipt'), width: '110px', sortable: false,
        render: r => `<button class="btn btn-sm btn-ghost" data-receipt-id="${r.id}">🧾 ${isZh?'查看':'View'}</button>`,
      },
    ];

    document.getElementById('fc-content').innerHTML = `<div id="fc-payments-table"></div>`;
    DataTable.create({
      mount: '#fc-payments-table',
      columns,
      data: payments.map(p => ({ ...p, _ts: new Date(p.paymentDate).getTime() })),
      customSearch: (row, kw) =>
        Utils.fuzzyMatch(row.no, kw) ||
        Utils.fuzzyMatch(row.reference, kw) ||
        Utils.fuzzyMatch(custMap[row.customerId]?.name, kw),
      searchPlaceholder: isZh?'搜索收款单号 / 客户 / 流水号':'Search no. / customer / ref',
      filters: [
        {
          key: 'status',
          options: [
            { value: '', label: isZh?'全部 · 状态':'All · Status' },
            { value: 'pending_confirm', label: t('financeCenter.statusPending') },
            { value: 'confirmed',       label: t('financeCenter.statusConfirmed') },
            { value: 'rejected',        label: t('financeCenter.statusRejected') },
          ],
        },
        {
          key: 'method',
          options: [
            { value: '', label: isZh?'全部 · 方式':'All · Method' },
            { value: 'bank_transfer',   label: t('financeCenter.methodBank') },
            { value: 'cash',            label: t('financeCenter.methodCash') },
            { value: 'check',           label: t('financeCenter.methodCheck') },
            { value: 'acceptance_bill', label: t('financeCenter.methodAcceptance') },
            { value: 'other',           label: t('financeCenter.methodOther') },
          ],
        },
      ],
      defaultSortKey: '_ts',
      defaultSortOrder: 'desc',
      pageSize: 15,
    });

    document.getElementById('fc-payments-table').addEventListener('click', e => {
      const btn = e.target.closest('[data-receipt-id]');
      if (!btn) return;
      openReceipt(btn.dataset.receiptId);
    });
  }

  function openReceipt(paymentId) {
    const p = FinanceService.findPayment(paymentId);
    if (!p) return;
    const cust = CustomerRepo.find(p.customerId);
    const s = SettlementRepo.find(p.settlementId);
    const isZh = I18n.get() === 'zh-CN';

    Modal.open({
      title: isZh?'银行水单':'Bank Receipt',
      width: 480,
      content: `
        <div style="background: white; padding: 40px; color: #1a1a1a; font-family: serif; border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
          <div style="text-align:center; border-bottom:1px solid #aaa; padding-bottom:12px; margin-bottom:16px;">
            <div style="font-size:14px; color:#666;">中国工商银行 ICBC</div>
            <div style="font-size:18px; font-weight:bold; margin-top:8px;">${methodTitle(p.method, isZh)}</div>
          </div>
          <table style="width:100%; font-size:13px; line-height: 2;">
            <tr><td style="color:#666; width:30%;">${isZh?'日期':'Date'}</td><td style="font-family: var(--font-mono);">${p.paymentDate}</td></tr>
            <tr><td style="color:#666;">${isZh?'金额':'Amount'}</td><td style="font-family: var(--font-mono); font-weight:bold; font-size:16px;">${Utils.formatMoney(p.amount)}</td></tr>
            <tr><td style="color:#666;">${isZh?'付款方':'From'}</td><td>${cust?.name || ''}</td></tr>
            <tr><td style="color:#666;">${isZh?'收款方':'To'}</td><td>森达木业有限公司</td></tr>
            <tr><td style="color:#666;">${isZh?'用途':'Purpose'}</td><td>${s?.no || p.settlementId} ${isZh?'货款':'Settlement'}</td></tr>
            <tr><td style="color:#666;">${isZh?'流水号':'Reference'}</td><td style="font-family: var(--font-mono);">${p.reference || '-'}</td></tr>
            <tr><td style="color:#666;">${isZh?'状态':'Status'}</td><td>${p.status === 'confirmed' ? (isZh?'已确认':'Confirmed') : (isZh?'待确认':'Pending')}</td></tr>
          </table>
          <div style="margin-top:30px; text-align:right; color:#888; font-size:12px;">
            ${isZh?'银行盖章':'BANK STAMP'} ⊙
          </div>
        </div>
      `,
      buttons: [
        ...(p.status === 'pending_confirm' ? [
          { label: isZh?'驳回':'Reject', onClick: () => doReject(paymentId) },
          { label: isZh?'确认收款':'Confirm', primary: true, onClick: () => doConfirm(paymentId) }
        ] : [{ label: isZh?'关闭':'Close' }])
      ]
    });
  }

  function doConfirm(id) {
    try {
      FinanceService.confirmPayment(id, 'emp_f01');
      Toast.success(I18n.get()==='zh-CN'?'收款已确认':'Payment confirmed');
      renderKPIs(); renderContent();
    } catch (e) { Toast.error(e.message); return false; }
  }

  function doReject(id) {
    const isZh = I18n.get() === 'zh-CN';
    Modal.open({
      title: isZh?'驳回收款':'Reject Payment',
      width: 400,
      content: `<div><label class="form-label">${isZh?'驳回原因':'Reason'}</label><textarea class="input w-full" id="rej-reason" rows="3"></textarea></div>`,
      buttons: [
        { label: isZh?'取消':'Cancel' },
        { label: isZh?'确认':'OK', primary: true, onClick: () => {
          const reason = document.getElementById('rej-reason').value.trim();
          if (!reason) { Toast.warning(isZh?'请填写原因':'Reason required'); return false; }
          try {
            FinanceService.rejectPayment(id, reason, 'emp_f01');
            Toast.success(isZh?'已驳回':'Rejected');
            renderKPIs(); renderContent();
          } catch (e) { Toast.error(e.message); return false; }
        }}
      ]
    });
  }

  // ===== Tab 2: 欠款分析 =====
  function renderDebt() {
    const isZh = I18n.get() === 'zh-CN';
    const aging = FinanceService.getAgingAnalysis();
    const total = Object.values(aging).reduce((s, x) => s + x, 0);

    const settlements = SettlementRepo.list()
      .filter(s => ['confirmed','partial_paid','overdue'].includes(s.status));
    const customers = CustomerRepo.list();
    const custMap = Object.fromEntries(customers.map(c => [c.id, c]));

    // 客户欠款 TOP 10
    const byCust = {};
    settlements.forEach(s => {
      byCust[s.customerId] = byCust[s.customerId] || { customer: custMap[s.customerId], unpaid: 0, count: 0, overdueCount: 0 };
      byCust[s.customerId].unpaid += (s.unpaidAmount || 0);
      byCust[s.customerId].count += 1;
      if (s.status === 'overdue') byCust[s.customerId].overdueCount += 1;
    });
    const topCustomers = Object.values(byCust)
      .filter(x => x.unpaid > 0 && x.customer)
      .sort((a, b) => b.unpaid - a.unpaid)
      .slice(0, 10);

    document.getElementById('fc-content').innerHTML = `
      <div class="ov-grid" style="grid-template-columns: repeat(4, 1fr);">
        ${['0-30', '31-60', '61-90', '90+'].map(bucket => {
          const amt = aging[bucket];
          const pct = total > 0 ? Math.round(amt / total * 100) : 0;
          const color = bucket === '0-30' ? 'var(--emerald)' :
                        bucket === '31-60' ? 'var(--amber)' :
                        bucket === '61-90' ? 'var(--orange)' : 'var(--red)';
          return `
            <div class="ov-card">
              <div class="label">${isZh?'账龄':'Aging'} ${bucket} ${isZh?'天':'days'}</div>
              <div class="value" style="color:${color};">${Utils.formatMoney(amt)}</div>
              <div class="sub">${pct}% ${isZh?'占比':''}</div>
              <div class="progress"><div class="progress-fill" style="width:${pct}%; background:${color};"></div></div>
            </div>
          `;
        }).join('')}
      </div>

      <div class="ov-section">
        <div class="ov-section-head"><span>${isZh?'TOP 10 欠款客户':'Top 10 Customers by Debt'}</span></div>
        <div style="overflow-x:auto;">
          <table style="width:100%; font-size:12px; border-collapse:collapse;">
            <thead>
              <tr style="background:var(--bg-3); color:var(--text-3); text-transform:uppercase; font-size:11px;">
                <th style="text-align:left; padding:8px 12px;">${isZh?'排名':'#'}</th>
                <th style="text-align:left; padding:8px 12px;">${isZh?'客户':'Customer'}</th>
                <th style="text-align:right; padding:8px 12px;">${isZh?'未付总额':'Unpaid Total'}</th>
                <th style="text-align:right; padding:8px 12px;">${isZh?'结算数':'Settlements'}</th>
                <th style="text-align:right; padding:8px 12px;">${isZh?'已逾期':'Overdue'}</th>
                <th style="text-align:left; padding:8px 12px;">${isZh?'风险':'Risk'}</th>
              </tr>
            </thead>
            <tbody>
              ${topCustomers.map((x, idx) => {
                const c = x.customer;
                const lim = c.settlementPolicy?.credit?.limit || c.creditLimit || 0;
                const cs = CustomerStats.compute(c.id);
                const used = cs.exposure;
                const usePct = cs.usagePct;
                let riskColor = usePct > 90 ? 'var(--red)' : usePct > 70 ? 'var(--amber)' : 'var(--emerald)';
                return `
                  <tr style="border-bottom:1px solid var(--border-1); cursor:pointer;" data-cust-id="${c.id}">
                    <td style="padding:10px 12px;" class="font-mono text-muted">${idx+1}</td>
                    <td style="padding:10px 12px;" class="text-strong">${c.name}</td>
                    <td style="padding:10px 12px; text-align:right;" class="font-mono ${x.unpaid > 0 ? 'text-red' : ''}">${Utils.formatMoney(x.unpaid)}</td>
                    <td style="padding:10px 12px; text-align:right;" class="font-mono">${x.count}</td>
                    <td style="padding:10px 12px; text-align:right;" class="font-mono ${x.overdueCount > 0 ? 'text-red' : 'text-muted'}">${x.overdueCount}</td>
                    <td style="padding:10px 12px;">
                      <span style="font-size:11px;"><span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:${riskColor}; margin-right:4px;"></span>${usePct}%</span>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('fc-content').querySelectorAll('[data-cust-id]').forEach(el => {
      el.addEventListener('click', () => Router.go('customer-detail', { id: el.dataset.custId }));
    });
  }

  // ===== Tab 3: 信用 =====
  function renderCredit() {
    const isZh = I18n.get() === 'zh-CN';
    const customers = CustomerRepo.list().filter(c => c.status === 'active');
    
    const enriched = customers.map(c => {
      const cs = CustomerStats.compute(c.id);
      const lim = cs.limit;
      return { ...c, _lim: lim, _used: cs.exposure, _pct: cs.usagePct, _receivables: cs.receivables, _overdue: cs.overdue };
    }).sort((a, b) => b._pct - a._pct);

    document.getElementById('fc-content').innerHTML = `
      <div class="ov-section">
        <div class="ov-section-head"><span>${isZh?'客户信用使用率(按风险排序)':'Customer Credit Usage'}</span></div>
        <div style="overflow-x:auto;">
          <table style="width:100%; font-size:12px; border-collapse:collapse;">
            <thead>
              <tr style="background:var(--bg-3); color:var(--text-3); text-transform:uppercase; font-size:11px;">
                <th style="text-align:left; padding:8px 12px;">${isZh?'客户':'Customer'}</th>
                <th style="text-align:right; padding:8px 12px;">${isZh?'信用额度':'Limit'}</th>
                <th style="text-align:right; padding:8px 12px;">${isZh?'已用':'Used'}</th>
                <th style="text-align:left; padding:8px 12px; width:200px;">${isZh?'使用率':'Usage'}</th>
                <th style="text-align:left; padding:8px 12px;">${isZh?'超额策略':'Over-limit'}</th>
                <th style="text-align:left; padding:8px 12px;">${isZh?'锁定':'Locked'}</th>
              </tr>
            </thead>
            <tbody>
              ${enriched.map(c => {
                const color = c._pct > 90 ? 'var(--red)' : c._pct > 70 ? 'var(--amber)' : 'var(--emerald)';
                const policy = c.settlementPolicy?.credit?.action || (c.shipmentLocked ? 'auto_lock' : 'warn_force');
                const policyLabel = {
                  auto_lock:  isZh?'自动锁定':'Auto-lock',
                  warn_force: isZh?'警告强制':'Warn & Force',
                  warn_only:  isZh?'仅警告':'Warn only',
                }[policy] || policy;
                return `
                  <tr style="border-bottom:1px solid var(--border-1); cursor:pointer;" data-cust-id="${c.id}">
                    <td style="padding:10px 12px;">
                      <div class="text-strong">${c.name}</div>
                      <div class="text-muted" style="font-size:11px;">${c.code}</div>
                    </td>
                    <td style="padding:10px 12px; text-align:right;" class="font-mono">${Utils.formatMoney(c._lim)}</td>
                    <td style="padding:10px 12px; text-align:right;" class="font-mono ${c._used > 0 ? 'text-strong' : 'text-muted'}">${Utils.formatMoney(c._used)}</td>
                    <td style="padding:10px 12px;">
                      <div style="display:flex; align-items:center; gap:8px;">
                        <div style="flex:1; height:6px; background:var(--bg-3); border-radius:3px; overflow:hidden;">
                          <div style="height:100%; width:${Math.min(c._pct, 100)}%; background:${color};"></div>
                        </div>
                        <span class="font-mono" style="font-size:11px; color:${color}; min-width:36px; text-align:right;">${c._pct}%</span>
                      </div>
                    </td>
                    <td style="padding:10px 12px;"><span style="font-size:11px;">${policyLabel}</span></td>
                    <td style="padding:10px 12px;">
                      ${c.shipmentLocked
                        ? `<span class="text-red" style="font-size:11px;"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5.5 7 V5 a2.5 2.5 0 0 1 5 0 V7"/></svg> ${isZh?'已锁定':'Locked'}</span>`
                        : `<span class="text-muted" style="font-size:11px;">-</span>`}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
    document.getElementById('fc-content').querySelectorAll('[data-cust-id]').forEach(el => {
      el.addEventListener('click', () => Router.go('customer-detail', { id: el.dataset.custId }));
    });
  }

  // ===== Tab 4: 财务事件 =====
  function renderEvents() {
    const isZh = I18n.get() === 'zh-CN';
    const events = FinanceService.listCreditEvents();

    if (events.length === 0) {
      document.getElementById('fc-content').innerHTML = `
        <div class="empty-state" style="padding:40px;">
          <div style="font-size:32px; opacity:0.3; margin-bottom:12px;"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><rect x="3.5" y="3" width="9" height="11" rx="1.5"/><rect x="6" y="1.5" width="4" height="3" rx="0.5"/></svg></div>
          <div class="text-muted">${isZh?'暂无财务事件':'No credit events yet'}</div>
          <div class="text-muted" style="font-size:11px; margin-top:6px;">${isZh?'当信用额度变更、超额锁定、逾期触发时,事件会自动记录在这里':'Events auto-logged on credit changes, over-limit, overdue, etc.'}</div>
        </div>
      `;
      return;
    }

    const typeMap = {
      limit_changed:      { color: 'var(--blue)',   icon: '📊' },
      over_limit_warning: { color: 'var(--amber)',  icon: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M8 1.5 L14.5 13.5 H1.5 Z"/><line x1="8" y1="6.5" x2="8" y2="9.5"/><line x1="8" y1="11.5" x2="8" y2="11.6"/></svg>' },
      auto_locked:        { color: 'var(--red)',    icon: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5.5 7 V5 a2.5 2.5 0 0 1 5 0 V7"/></svg>' },
      unlocked:           { color: 'var(--emerald)', icon: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><polyline points="3,8 7,12 13,4"/></svg>' },
      overdue_triggered:  { color: 'var(--red)',    icon: '⏰' },
      policy_updated:     { color: 'var(--text-3)', icon: '⚙' },
    };

    document.getElementById('fc-content').innerHTML = `
      <div class="ov-section">
        <div class="ov-section-head"><span>${isZh?'财务事件流':'Credit Events'}</span></div>
        <div class="ov-section-body">
          ${events.map(e => {
            const cust = CustomerRepo.find(e.customerId);
            const cf = typeMap[e.type] || { color: 'var(--text-3)', icon: '•' };
            return `
              <div style="display:grid; grid-template-columns: 30px 1fr 200px; gap:12px; padding:10px 0; border-bottom:1px solid var(--border-1);">
                <div style="font-size:18px; color:${cf.color};">${cf.icon}</div>
                <div>
                  <div class="text-strong" style="font-size:13px;">${tEnum('creditEvent','typeEnum',e.type)}</div>
                  <div class="text-muted" style="font-size:11px;">
                    ${cust ? cust.name : e.customerId}
                    ${e.oldValue ? ` · ${e.oldValue} → ${e.newValue}` : ''}
                  </div>
                  ${e.reason ? `<div class="text-muted" style="font-size:11px; margin-top:2px;">${e.reason}</div>` : ''}
                </div>
                <div class="text-muted font-mono" style="font-size:11px; text-align:right;">${Utils.formatDateTime(e.createdAt)}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  // ===== 辅助 =====

  function methodTitle(method, isZh) {
    const map = {
      bank_transfer:   isZh?'电汇凭证':'WIRE TRANSFER RECEIPT',
      cash:            isZh?'现金收据':'CASH RECEIPT',
      check:           isZh?'支票':'CHECK',
      acceptance_bill: isZh?'承兑汇票':'ACCEPTANCE BILL',
      other:           isZh?'收款凭证':'PAYMENT RECEIPT',
    };
    return map[method] || (isZh?'收款凭证':'PAYMENT RECEIPT');
  }

  function renderMethodBadge(method) {
    const map = {
      bank_transfer:   { c:'var(--blue)', bg:'var(--blue-bg)',  l:'methodBank' },
      cash:            { c:'#cbd5e1', bg:'rgba(148,163,184,0.14)', l:'methodCash' },
      check:           { c:'#facc15', bg:'rgba(250,204,21,0.14)',  l:'methodCheck' },
      acceptance_bill: { c:'#fb923c', bg:'rgba(251,146,60,0.14)',  l:'methodAcceptance' },
      other:           { c:'#94a3b8', bg:'rgba(148,163,184,0.14)', l:'methodOther' },
    };
    const cf = map[method] || map.other;
    return `<span style="padding:2px 7px; background:${cf.bg}; color:${cf.c}; border-radius:3px; font-size:11px;">${t('financeCenter.' + cf.l)}</span>`;
  }

  function renderStatusBadge(status) {
    const map = {
      pending_confirm: { c:'#facc15', bg:'rgba(250,204,21,0.14)', l:'statusPending' },
      confirmed:       { c:'var(--emerald)', bg:'var(--emerald-bg)',  l:'statusConfirmed' },
      rejected:        { c:'#f87171', bg:'rgba(248,113,113,0.16)', l:'statusRejected' },
    };
    const cf = map[status] || map.pending_confirm;
    return `<span style="padding:2px 8px; background:${cf.bg}; color:${cf.c}; border-radius:3px; font-size:11px; font-weight:500;">${t('financeCenter.' + cf.l)}</span>`;
  }

  return { init };
})();

window.FinanceCenterModule = FinanceCenterModule;
