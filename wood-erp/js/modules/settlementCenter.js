/**
 * 结算中心(新)
 * @module modules/settlementCenter
 *
 * 区别于老的 settlements.js:
 *   - 5 KPI(不再是 4)
 *   - "即将自动触发"预测区(★)
 *   - 列表带策略标签 + 进度
 *   - 强制结算按钮
 */

const SettlementCenterModule = (function () {
  'use strict';

  let upcomingCache = null;
  let dataTable = null;

  function init(ctx) {
    document.getElementById('app-content').innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">${t('settlementCenter.title')}</h1>
          <div class="page-subtitle">${t('settlementCenter.subtitle')}</div>
        </div>
        <div>
          <button class="btn btn-secondary btn-sm" id="btn-export-st">${typeof _exportIcon !== 'undefined' ? _exportIcon() : ''} 导出 Excel</button>
        </div>
      </div>

      <div class="grid grid-cols-5 gap-3 mb-4" id="kpi-row"></div>

      <!-- 即将自动触发 -->
      <div class="card mb-4" id="upcoming-card">
        <div class="card-header">
          <div>
            <div class="card-title">${t('settlementCenter.upcomingTitle')}</div>
            <div class="text-muted" style="font-size:11px;">${t('settlementCenter.upcomingSub')}</div>
          </div>
          <button class="btn btn-sm btn-primary" id="btn-run-scan">${t('settlementCenter.actionRunScan')}</button>
        </div>
        <div id="upcoming-list" style="padding: 0;"></div>
      </div>

      <!-- 列表 -->
      <div id="settlement-table"></div>
    `;

    upcomingCache = SettlementPolicyEngine.scanAll();
    renderKPIs();
    renderUpcoming();
    renderTable();

    document.getElementById('btn-run-scan').addEventListener('click', runScan);
    const ebtn = document.getElementById('btn-export-st');
    if (ebtn) ebtn.addEventListener('click', exportSettlements);

    ['settlement.autoTriggered','settlement.created','settlement.confirmed','settlement.paymentReceived'
    ].forEach(e => EventBus.on(e, () => {
      upcomingCache = SettlementPolicyEngine.scanAll();
      renderKPIs(); renderUpcoming(); refreshTable();
    }));
  }

  function exportSettlements() {
    const setts = SettlementRepo.list().sort((a,b) => (b.settlementDate||'').localeCompare(a.settlementDate||''));
    const statusLabel = {
      draft: '草稿', pending_confirm: '待确认', confirmed: '待收款',
      partial_paid: '部分收款', paid: '已收齐', overdue: '已逾期',
      cancelled: '已取消',
    };
    const triggerLabel = { auto: '自动', manual: '手动' };
    const modeLabel = { days: '按天数', truck: '按车次', amount: '按金额', amount_trigger: '按金额' };
    const rows = setts.map(s => {
      const cust = CustomerRepo.find(s.customerId) || {};
      const payable = s.payableAmount || 0;
      const paid = s.paidAmount || 0;
      return {
        no: s.no,
        customer: cust.name || '-',
        customerCode: cust.code || '-',
        settlementDate: s.settlementDate,
        dueDate: s.dueDate || '-',
        creationType: triggerLabel[s.creationType] || s.creationType,
        triggerMode: modeLabel[s.triggerMode] || s.triggerMode || '-',
        truckCount: s.truckCount || 0,
        payableAmount: payable,
        paidAmount: paid,
        unpaidAmount: payable - paid,
        status: statusLabel[s.status] || s.status,
        confirmedAt: (s.confirmedAt || '').slice(0, 10),
        remark: s.remark || '',
      };
    });
    ExcelExporter.exportSheet('结算单_' + Utils.today(), '结算单列表', [
      { key: 'no', label: '结算单号', width: 18 },
      { key: 'customer', label: '客户', width: 16 },
      { key: 'customerCode', label: '客户编号', width: 12 },
      { key: 'settlementDate', label: '结算日', width: 12, format: 'date' },
      { key: 'dueDate', label: '到期日', width: 12, format: 'date' },
      { key: 'creationType', label: '触发', width: 8 },
      { key: 'triggerMode', label: '触发方式', width: 10 },
      { key: 'truckCount', label: '车次数', width: 8, format: 'number' },
      { key: 'payableAmount', label: '应收', width: 14, format: 'currency' },
      { key: 'paidAmount', label: '已收', width: 14, format: 'currency' },
      { key: 'unpaidAmount', label: '未收', width: 14, format: 'currency' },
      { key: 'status', label: '状态', width: 10 },
      { key: 'confirmedAt', label: '确认日', width: 12, format: 'date' },
      { key: 'remark', label: '备注', width: 20 },
    ], rows);
  }

  // ========== KPI ==========

  function renderKPIs() {
    const settlements = SettlementService.list();
    const customers = CustomerRepo.list();
    const isZh = I18n.get() === 'zh-CN';

    // 待结算:已签收未生成结算的发货
    const pendingDeliveries = DeliveryRepo.list().filter(d =>
      d.transportStatus === 'signed' && d.settlementStatus === 'pending'
    );
    const pendingCount = pendingDeliveries.length;
    const pendingAmount = pendingDeliveries.reduce((s, d) => s + (d.totalAmount || 0), 0);

    // 待确认:status auto_generated / draft
    const toConfirm = settlements.filter(s =>
      ['draft','auto_generated'].includes(s.status) ||
      (s.triggerType === 'auto' && !s.confirmedAt)
    );

    // 已逾期
    const overdue = settlements.filter(s => s.status === 'overdue');

    // 本月已收
    const monthAgo = Date.now() - 30 * 86400000;
    let monthPaid = 0;
    settlements.forEach(s => {
      (s.payments || []).forEach(p => {
        if (new Date(p.paymentDate).getTime() >= monthAgo) {
          monthPaid += p.amount || 0;
        }
      });
    });

    // 信用占用 > 90% 的活跃客户(高风险)
    const atRisk = customers.filter(c => {
      if (c.status !== 'active') return false;
      const cs = CustomerStats.compute(c.id);
      return cs.usagePct > 90;
    }).length;

    document.getElementById('kpi-row').innerHTML = `
      <div class="kpi">
        <div class="kpi-bar blue"></div>
        <div class="kpi-label">${t('settlementCenter.kpiPending')}</div>
        <div class="kpi-value">${pendingCount}</div>
        <div class="kpi-trend">${Utils.formatMoney(pendingAmount)}</div>
      </div>
      <div class="kpi">
        <div class="kpi-bar amber"></div>
        <div class="kpi-label">${t('settlementCenter.kpiToConfirm')}</div>
        <div class="kpi-value">${toConfirm.length}</div>
        <div class="kpi-trend">${t('settlementCenter.kpiToConfirmSub')}</div>
      </div>
      <div class="kpi">
        <div class="kpi-bar red"></div>
        <div class="kpi-label">${t('settlementCenter.kpiOverdue')}</div>
        <div class="kpi-value">${overdue.length}</div>
        <div class="kpi-trend">${Utils.formatMoney(overdue.reduce((s,x)=>s+(x.unpaidAmount||0),0))}</div>
      </div>
      <div class="kpi">
        <div class="kpi-bar emerald"></div>
        <div class="kpi-label">${t('settlementCenter.kpiPaidMonth')}</div>
        <div class="kpi-value">${Utils.formatMoney(monthPaid)}</div>
        <div class="kpi-trend">${t('settlementCenter.kpiPaidMonthSub')}</div>
      </div>
      <div class="kpi">
        <div class="kpi-bar amber"></div>
        <div class="kpi-label">${t('settlementCenter.kpiAtRisk')}</div>
        <div class="kpi-value">${atRisk}</div>
        <div class="kpi-trend">${t('settlementCenter.kpiAtRiskSub')}</div>
      </div>
    `;
  }

  // ========== 即将触发 ==========

  function renderUpcoming() {
    const items = upcomingCache.slice(0, 10);  // 最多 10 条
    const isZh = I18n.get() === 'zh-CN';

    if (items.length === 0) {
      document.getElementById('upcoming-list').innerHTML = `
        <div class="empty-state" style="padding: 30px;">
          <div style="font-size:24px; opacity:0.3; margin-bottom:8px;">○</div>
          <div class="text-muted" style="font-size:12px;">${t('settlementCenter.upcomingEmpty')}</div>
        </div>
      `;
      return;
    }

    document.getElementById('upcoming-list').innerHTML = items.map(item => {
      const cust = item.customer;
      const ev = item.evaluation;
      const triggered = ev.triggered;
      // 取最高进度的条件作主显示
      const primaryCond = ev.conditions.reduce((max, c) => c.progress > max.progress ? c : max, { progress: 0 });

      // 条件指标
      const condBars = ev.conditions.map(c => {
        const color = c.met ? 'var(--emerald)' : (c.progress > 70 ? 'var(--amber)' : 'var(--blue)');
        return `
          <div style="display:flex; align-items:center; gap:6px; min-width:100px;">
            <span class="text-muted" style="font-size:10px;">${c.label}</span>
            <div style="flex:1; height:5px; background:var(--bg-3); border-radius:2px; overflow:hidden;">
              <div style="height:100%; background:${color}; width:${c.progress}%; transition:width .3s ease;"></div>
            </div>
          </div>
        `;
      }).join('');

      const totalAmount = ev.totalAmount || 0;
      const truckCount = ev.eligibleDeliveries.length;

      return `
        <div style="padding: 14px 18px; border-bottom: 1px solid var(--border-1); display: grid; grid-template-columns: 200px 1fr 130px 200px; gap: 16px; align-items: center;">
          <div>
            <a href="${Router.href('customer-detail', { id: cust.id })}" class="text-strong" style="text-decoration:none; color:var(--text-1);">${cust.name}</a>
            <div class="text-muted" style="font-size:11px; margin-top:2px;">${cust.code} · ${policyModeLabel(ev.policy)}</div>
          </div>
          <div style="display:flex; gap:12px; flex-wrap:wrap;">
            ${condBars}
          </div>
          <div style="text-align:right;">
            <div class="font-mono text-strong">${Utils.formatMoney(totalAmount)}</div>
            <div class="text-muted" style="font-size:11px;">${truckCount} ${isZh?'车':'truck(s)'}</div>
          </div>
          <div style="text-align:right;">
            ${triggered
              ? `<span class="badge badge-amber" style="margin-right:6px;">${isZh ? '可结算' : 'Ready'}</span>`
              : `<span class="text-muted" style="font-size:11px; margin-right:8px;">${ev.progress}%</span>`
            }
            <button class="btn btn-sm btn-primary" data-action="force-settle" data-cust-id="${cust.id}">
              ${t('settlementCenter.actionForceSettle')}
            </button>
          </div>
        </div>
      `;
    }).join('');

    document.getElementById('upcoming-list').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action="force-settle"]');
      if (!btn) return;
      openForceSettle(btn.dataset.custId);
    });
  }

  function policyModeLabel(policy) {
    if (!policy) return '';
    const isZh = I18n.get() === 'zh-CN';
    return policy.mode === 'ALL' ? t('settlementCenter.modeAll') : t('settlementCenter.modeAny');
  }

  // ========== 列表 ==========

  function renderTable() {
    const columns = [
      {
        key: 'no', label: t('settlementCenter.colNo'), width: '160px',
        render: (r) => `<a class="font-mono text-strong text-accent" href="${Router.href('settlement-detail', { id: r.id })}" style="text-decoration:none;">${r.no}</a>`,
      },
      {
        key: 'customerName', label: t('settlementCenter.colCustomer'),
        render: (r) => `
          <div class="text-strong">${r.customerName || '-'}</div>
          <div class="text-muted" style="font-size:11px;">${r.customerCode || ''}</div>
        `,
      },
      {
        key: 'triggerType', label: t('settlementCenter.colPolicy'), width: '160px', sortable: false,
        render: (r) => renderTriggerTags(r),
      },
      {
        key: 'truckAmount', label: t('settlementCenter.colTruckAmount'), width: '130px', align: 'right',
        render: (r) => `
          <div class="font-mono text-strong">${Utils.formatMoney(r.payableAmount)}</div>
          <div class="text-muted" style="font-size:11px;">${r.truckCount || 0} ${I18n.get()==='zh-CN'?'车':'truck(s)'}</div>
        `,
      },
      {
        key: 'paid', label: t('settlementCenter.colReceived'), width: '140px', align: 'right',
        render: (r) => {
          const paid = r.paidAmount || 0;
          const unpaid = r.unpaidAmount || (r.payableAmount - paid);
          return `
            <div class="font-mono text-emerald">${Utils.formatMoney(paid)}</div>
            <div class="font-mono ${unpaid > 0 ? 'text-red' : 'text-muted'}" style="font-size:11px;">/ ${Utils.formatMoney(unpaid)}</div>
          `;
        },
      },
      {
        key: 'dueDate', label: t('settlementCenter.colDueDate'), width: '110px',
        render: (r) => renderDueDate(r),
      },
      {
        key: 'status', label: t('settlementCenter.colStatus'), width: '100px',
        render: (r) => renderStatusBadge(r.status),
      },
      {
        key: 'risk', label: t('settlementCenter.colRisk'), width: '70px',
        render: (r) => renderRiskBadge(r.risk),
      },
      {
        key: '_actions', label: t('common.actions'), width: '90px', sortable: false,
        render: (r) => {
          if (r.status === 'overdue') {
            return `<button class="btn btn-sm btn-danger" data-id="${r.id}">${t('settlementCenter.actionCollect')}</button>`;
          }
          return `<button class="btn btn-sm btn-ghost" data-id="${r.id}">${t('settlementCenter.actionView')}</button>`;
        },
      },
    ];

    const data = SettlementService.list().map(s => {
      const cust = CustomerRepo.find(s.customerId);
      const cs = cust ? CustomerStats.compute(cust.id) : null;
      const usePct = cs ? cs.usagePct / 100 : 0;
      let risk = 'none';
      if (usePct > 0.9) risk = 'high';
      else if (usePct > 0.7) risk = 'note';
      if (s.status === 'overdue') risk = 'high';

      return {
        ...s,
        customerName: cust?.name,
        customerCode: cust?.code,
        risk,
        _ts: new Date(s.updatedAt || s.createdAt).getTime(),
      };
    });

    dataTable = DataTable.create({
      mount: '#settlement-table',
      columns,
      data,
      customSearch: (row, kw) =>
        Utils.fuzzyMatch(row.no, kw) ||
        Utils.fuzzyMatch(row.customerName, kw) ||
        Utils.fuzzyMatch(row.triggerReason, kw),
      searchPlaceholder: t('settlement.searchPlaceholder'),
      filters: [
        {
          key: 'status',
          options: [
            { value: '', label: t('common.all') + ' · ' + t('common.status') },
            { value: 'draft',          label: t('settlementCenter.statusDraft') },
            { value: 'confirmed',      label: t('settlementCenter.statusConfirm') },
            { value: 'partial_paid',   label: t('settlementCenter.statusPartial') },
            { value: 'paid',           label: t('settlementCenter.statusPaid') },
            { value: 'overdue',        label: t('settlementCenter.statusOverdue') },
            { value: 'cancelled',      label: t('settlementCenter.statusCancelled') },
          ],
        },
        {
          key: 'triggerType',
          options: [
            { value: '', label: I18n.get()==='zh-CN' ? '全部 · 触发方式' : 'All · Trigger' },
            { value: 'auto',   label: t('settlementCenter.tagAuto') },
            { value: 'forced', label: t('settlementCenter.tagForced') },
            { value: 'manual', label: t('settlementCenter.tagManual') },
          ],
        },
        {
          key: 'risk',
          options: [
            { value: '', label: I18n.get()==='zh-CN' ? '全部 · 风险' : 'All · Risk' },
            { value: 'none', label: I18n.get()==='zh-CN' ? '正常' : 'Normal' },
            { value: 'note', label: I18n.get()==='zh-CN' ? '注意' : 'Note' },
            { value: 'high', label: I18n.get()==='zh-CN' ? '高' : 'High' },
          ],
        },
      ],
      defaultSortKey: '_ts',
      defaultSortOrder: 'desc',
      onRowClick: (row) => Router.go('settlement-detail', { id: row.id }),
      pageSize: 15,
    });

    document.getElementById('settlement-table').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-id]');
      if (!btn) return;
      e.stopPropagation();
      Router.go('settlement-detail', { id: btn.dataset.id });
    });
  }

  function refreshTable() {
    if (!dataTable) return;
    const data = SettlementService.list().map(s => {
      const cust = CustomerRepo.find(s.customerId);
      return {
        ...s,
        customerName: cust?.name,
        customerCode: cust?.code,
        risk: 'none',
        _ts: new Date(s.updatedAt || s.createdAt).getTime(),
      };
    });
    dataTable.setData(data);
  }

  // ========== 渲染辅助 ==========

  function renderTriggerTags(s) {
    const tags = [];
    const tt = s.triggerType || 'manual';
    const tagColor = {
      auto:   'background:var(--blue-bg); color:var(--blue);',
      forced: 'background:rgba(251,146,60,0.14); color:#fb923c;',
      manual: 'background:rgba(148,163,184,0.14); color:#cbd5e1;',
    }[tt];
    tags.push(`<span style="padding:1px 7px; border-radius:3px; font-size:10px; ${tagColor}">${
      t('settlementCenter.tag' + tt.charAt(0).toUpperCase() + tt.slice(1))
    }</span>`);
    // 条件标签(只 auto 显示)
    if (tt === 'auto' && s.triggerConditions) {
      const condTagColor = 'background:rgba(96,165,250,0.14); color:#60a5fa;';
      s.triggerConditions.forEach(c => {
        const label = {
          truckCount: t('settlementCenter.tagTruck'),
          days: t('settlementCenter.tagDays'),
          amount: t('settlementCenter.tagAmount'),
        }[c];
        if (label) {
          tags.push(`<span style="padding:1px 7px; border-radius:3px; font-size:10px; ${condTagColor}">${label}</span>`);
        }
      });
    }
    return `<div style="display:flex; gap:4px; flex-wrap:wrap;">${tags.join('')}</div>`;
  }

  function renderDueDate(s) {
    if (!s.dueDate) return `<span class="text-muted">-</span>`;
    const days = Math.floor((new Date(s.dueDate).getTime() - Date.now()) / 86400000);
    const isZh = I18n.get() === 'zh-CN';
    if (s.status === 'paid' || s.status === 'cancelled') {
      return `<span class="font-mono text-muted">${Utils.formatDate(s.dueDate)}</span>`;
    }
    if (days < 0) {
      return `<div>
        <div class="font-mono text-muted" style="font-size:11px;">${Utils.formatDate(s.dueDate)}</div>
        <div class="text-red font-mono" style="font-size:11px;">${isZh ? '逾期' : 'Overdue'} ${Math.abs(days)} ${isZh ? '天' : 'd'}</div>
      </div>`;
    }
    return `<div>
      <div class="font-mono">${Utils.formatDate(s.dueDate)}</div>
      <div class="text-muted" style="font-size:11px;">${days} ${isZh ? '天后' : 'days'}</div>
    </div>`;
  }

  function renderStatusBadge(status) {
    const config = {
      draft:        { label: 'settlementCenter.statusDraft',     color: '#cbd5e1', bg: 'rgba(148,163,184,0.14)' },
      confirmed:    { label: 'settlementCenter.statusConfirm',   color: 'var(--blue)', bg: 'var(--blue-bg)' },
      partial_paid: { label: 'settlementCenter.statusPartial',   color: '#facc15', bg: 'rgba(250,204,21,0.14)' },
      paid:         { label: 'settlementCenter.statusPaid',      color: 'var(--emerald)', bg: 'var(--emerald-bg)' },
      overdue:      { label: 'settlementCenter.statusOverdue',   color: '#f87171', bg: 'rgba(248,113,113,0.16)' },
      cancelled:    { label: 'settlementCenter.statusCancelled', color: '#94a3b8', bg: 'rgba(100,116,139,0.14)' },
    }[status] || { label: status, color: '#94a3b8', bg: 'rgba(100,116,139,0.14)' };
    return `<span style="padding:2px 8px; background:${config.bg}; color:${config.color}; border-radius:3px; font-size:11px; font-weight:500;">${t(config.label)}</span>`;
  }

  function renderRiskBadge(risk) {
    const config = {
      none: { label: '正常',  color: 'var(--emerald)' },
      note: { label: '注意',  color: '#facc15' },
      high: { label: '高',    color: '#f87171' },
    }[risk] || { label: '-', color: '#94a3b8' };
    const enLabel = { '正常': 'OK', '注意': 'Note', '高': 'High' }[config.label] || config.label;
    const lbl = I18n.get() === 'zh-CN' ? config.label : enLabel;
    return `<span style="font-size:11px;"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${config.color};margin-right:4px;"></span>${lbl}</span>`;
  }

  // ========== 强制结算弹窗 ==========

  function openForceSettle(custId) {
    const cust = CustomerRepo.find(custId);
    if (!cust) return;
    const ev = SettlementPolicyEngine.evaluate(custId);
    if (ev.eligibleDeliveries.length === 0) {
      Toast.warning(I18n.get()==='zh-CN' ? '该客户没有待结算发货' : 'No deliveries to settle');
      return;
    }

    Modal.open({
      title: t('settlementCenter.forceSettleTitle'),
      width: 500,
      content: `
        <div style="padding:14px 16px; background:var(--bg-3); border-radius:6px; margin-bottom:16px;">
          <div class="text-strong" style="margin-bottom:6px;">${cust.name}</div>
          <div class="text-muted" style="font-size:12px;">
            ${t('settlementCenter.forceSettleEligibleCount', ev.eligibleDeliveries.length, Utils.formatMoney(ev.totalAmount))}
          </div>
        </div>
        <div class="form-row" style="grid-template-columns:1fr">
          <div>
            <label class="form-label">${t('settlementCenter.forceSettleReasonLabel')} <span class="required">*</span></label>
            <textarea class="input w-full" id="force-reason" rows="3" placeholder="${t('settlementCenter.forceSettleReasonPlaceholder')}"></textarea>
          </div>
        </div>
      `,
      buttons: [
        { label: t('common.cancel') },
        {
          label: t('common.confirm'),
          primary: true,
          onClick: () => {
            const reason = document.getElementById('force-reason').value.trim();
            if (!reason) {
              Toast.warning(t('settlementCenter.forceSettleErrorReason'));
              return false;
            }
            try {
              const r = SettlementPolicyEngine.forceSettle(custId, {
                reason,
                operatorId: 'emp_f01',
              });
              Toast.success(t('settlementCenter.forceSettleSuccess', r.settlement.no));
              upcomingCache = SettlementPolicyEngine.scanAll();
              renderKPIs(); renderUpcoming(); refreshTable();
              setTimeout(() => Router.go('settlement-detail', { id: r.settlement.id }), 800);
            } catch (e) {
              Toast.error(e.message);
              return false;
            }
          }
        }
      ]
    });
  }

  // ========== 一键扫描 ==========

  function runScan() {
    const results = SettlementPolicyEngine.runAutoScan('emp_f01');
    if (results.length === 0) {
      Toast.info(I18n.get()==='zh-CN' ? '当前没有可自动触发的结算' : 'No settlement to auto-trigger');
      return;
    }
    Toast.success(t('settlementCenter.actionRunScanDone', results.length));
    upcomingCache = SettlementPolicyEngine.scanAll();
    renderKPIs(); renderUpcoming(); refreshTable();
  }

  return { init };
})();

window.SettlementCenterModule = SettlementCenterModule;
