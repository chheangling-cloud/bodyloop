/**
 * 欠款看板模块
 * @module modules/debtBoard
 *
 * 5 个区域:
 *  - 顶部 4 个大 KPI
 *  - 账龄分析(水平条)
 *  - 风险分布(donut)
 *  - TOP 欠款客户(表)
 *  - 月度收款趋势(柱状图)
 *  - 逾期清单(表)
 */

const DebtBoardModule = (function () {
  'use strict';

  function init() {
    // 启动时先刷新逾期状态
    SettlementService.refreshOverdueStatus();

    renderKPIs();
    renderAging();
    renderRiskDistribution();
    renderTopDebtors();
    renderTrend();
    renderOverdueList();
  }

  // ========== 顶部 KPI ==========
  function renderKPIs() {
    const k = DebtBoardService.getTopKPIs();
    const deltaSub = t('debtBoard.monthlyCollectedSub', k.collectedDelta);
    const deltaCls = k.collectedDelta > 0 ? 'up' : (k.collectedDelta < 0 ? 'down' : '');

    document.getElementById('kpi-row').innerHTML = `
      <div class="big-kpi blue">
        <div class="label">${t('debtBoard.totalExposure')}</div>
        <div class="value">${Utils.formatMoney(k.totalExposure)}</div>
        <div class="sub">${t('debtBoard.totalExposureSub')}</div>
      </div>
      <div class="big-kpi red">
        <div class="label">${t('debtBoard.overdue')}</div>
        <div class="value">${Utils.formatMoney(k.overdueAmount)}</div>
        <div class="sub">${t('debtBoard.overdueSub', k.overdueCount)}</div>
      </div>
      <div class="big-kpi amber">
        <div class="label">${t('debtBoard.highRiskCount')}</div>
        <div class="value">${k.highRiskCount}</div>
        <div class="sub">${k.lockedCount > 0 ? `${t('debtBoard.lockedCount')}: ${k.lockedCount}` : t('debtBoard.highRiskSub')}</div>
      </div>
      <div class="big-kpi emerald">
        <div class="label">${t('debtBoard.monthlyCollected')}</div>
        <div class="value">${Utils.formatMoney(k.thisMonthCollected)}</div>
        <div class="sub ${deltaCls}">${deltaSub}</div>
      </div>
    `;
  }

  // ========== 账龄分析 ==========
  function renderAging() {
    const data = DebtBoardService.getAgingAnalysis();
    const order = ['not_due','overdue_30','overdue_60','overdue_90','overdue_90_plus'];
    const labels = {
      not_due: t('debtBoard.aging_not_due'),
      overdue_30: t('debtBoard.aging_overdue_30'),
      overdue_60: t('debtBoard.aging_overdue_60'),
      overdue_90: t('debtBoard.aging_overdue_90'),
      overdue_90_plus: t('debtBoard.aging_overdue_90_plus'),
    };

    if (data.total === 0) {
      document.getElementById('aging-content').innerHTML = `
        <div class="empty-state">${t('debtBoard.noDebt')}</div>
      `;
      return;
    }

    const maxAmount = Math.max(...order.map(k => data.buckets[k].amount));
    const rowsHtml = order.map(key => {
      const b = data.buckets[key];
      const widthPct = maxAmount > 0 ? Math.round(b.amount / maxAmount * 100) : 0;
      return `
        <div class="aging-row">
          <span class="label">${labels[key]}</span>
          <div class="bar-track">
            <div class="bar-fill ${key}" style="width:${widthPct}%"></div>
          </div>
          <span class="amount text-strong">${Utils.formatMoney(b.amount)}</span>
          <span class="pct">${b.count}笔 · ${b.percentage}%</span>
        </div>
      `;
    }).join('');

    document.getElementById('aging-content').innerHTML = `
      ${rowsHtml}
      <div style="margin-top:14px; padding-top:12px; border-top:1px dashed var(--border-2); display:flex; justify-content:space-between; font-size:12px;">
        <span class="text-muted">${I18n.get()==='zh-CN'?'合计未收':'Total Unpaid'}</span>
        <span class="font-mono text-strong">${Utils.formatMoney(data.total)}</span>
      </div>
    `;
  }

  // ========== 风险分布(donut) ==========
  function renderRiskDistribution() {
    const data = DebtBoardService.getRiskDistribution();
    const total = Object.values(data).reduce((s, d) => s + d.count, 0);

    // 计算 donut 段
    const colors = { normal: 'var(--emerald)', attention: 'var(--amber)', high: 'var(--red)', locked: 'var(--text-1)' };
    const radius = 60;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;
    const segments = [];
    const order = ['normal','attention','high','locked'];
    order.forEach(key => {
      const d = data[key];
      if (d.count === 0) return;
      const pct = total > 0 ? d.count / total : 0;
      const len = pct * circumference;
      segments.push({
        key,
        color: colors[key],
        dashLen: len,
        dashOffset: -offset,
      });
      offset += len;
    });

    const donutSvg = `
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r="${radius}" fill="none" stroke="var(--bg-3)" stroke-width="16"/>
        ${segments.map(s => `
          <circle cx="70" cy="70" r="${radius}" fill="none"
                  stroke="${s.color}" stroke-width="16"
                  stroke-dasharray="${s.dashLen} ${circumference}"
                  stroke-dashoffset="${s.dashOffset}"/>
        `).join('')}
      </svg>
    `;

    const listHtml = order.map(key => {
      const d = data[key];
      const pct = total > 0 ? Math.round(d.count / total * 100) : 0;
      return `
        <div class="risk-item">
          <span class="dot ${key}"></span>
          <span>${t('debtBoard.risk_' + key)}</span>
          <span class="font-mono text-strong">${d.count}</span>
          <span class="font-mono text-muted" style="font-size:11px;">${pct}%</span>
        </div>
      `;
    }).join('');

    document.getElementById('risk-dist-content').innerHTML = `
      <div class="risk-dist">
        <div class="donut">
          ${donutSvg}
          <div class="donut-center">
            <div class="num">${total}</div>
            <div class="lbl">${I18n.get()==='zh-CN'?'客户':'Customers'}</div>
          </div>
        </div>
        <div class="risk-list">${listHtml}</div>
      </div>
    `;
  }

  // ========== TOP 欠款客户 ==========
  function renderTopDebtors() {
    const customers = DebtBoardService.getTopDebtorCustomers(10);
    if (customers.length === 0) {
      document.getElementById('top-debtors-content').innerHTML = `<div class="empty-state">${t('debtBoard.noDebt')}</div>`;
      return;
    }

    const rowsHtml = customers.map((c, i) => {
      const rank = i + 1;
      const rankCls = rank <= 3 ? `rank-${rank}` : '';
      const usageCls = c.creditUsage > 90 ? 'text-red' : (c.creditUsage > 70 ? 'text-amber' : '');
      return `
        <tr style="cursor:pointer;" data-customer-id="${c.id}">
          <td><span class="rank-badge ${rankCls}">${rank}</span></td>
          <td>
            <div class="text-strong">${c.name}</div>
            <div class="text-muted" style="font-size:11px;">${c.code}</div>
          </td>
          <td class="text-right">
            <span class="font-mono text-strong">${Utils.formatMoney(c.exposure)}</span>
          </td>
          <td class="text-right">
            <span class="font-mono ${c.currentDebt > 0 ? 'text-red' : 'text-muted'}">${Utils.formatMoney(c.currentDebt)}</span>
          </td>
          <td class="text-right">
            <span class="font-mono ${c.overdueAmount > 0 ? 'text-red' : 'text-muted'}">${Utils.formatMoney(c.overdueAmount)}</span>
          </td>
          <td>
            <div style="display:flex; align-items:center; gap:6px;">
              <span class="font-mono ${usageCls}" style="min-width:40px;">${c.creditUsage}%</span>
              <div style="flex:1; min-width:50px; height:5px; background:var(--bg-3); border-radius:2px; overflow:hidden;">
                <div style="height:100%; background:${c.creditUsage > 90 ? 'var(--red)' : (c.creditUsage > 70 ? 'var(--amber)' : 'var(--emerald)')}; width:${Math.min(c.creditUsage, 100)}%;"></div>
              </div>
            </div>
          </td>
          <td>${Badge.render('customer','riskLevelEnum',c.riskLevel)}</td>
        </tr>
      `;
    }).join('');

    document.getElementById('top-debtors-content').innerHTML = `
      <table class="top-table">
        <thead>
          <tr>
            <th style="width:50px;">${t('debtBoard.rank')}</th>
            <th>${t('debtBoard.customer')}</th>
            <th class="text-right" style="width:120px;">${t('debtBoard.exposure')}</th>
            <th class="text-right" style="width:110px;">${t('debtBoard.totalDebt')}</th>
            <th class="text-right" style="width:110px;">${t('debtBoard.overdueAmount')}</th>
            <th style="width:140px;">${t('debtBoard.creditUsage')}</th>
            <th style="width:90px;">${t('common.status')}</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    `;

    document.getElementById('top-debtors-content').addEventListener('click', (e) => {
      const id = e.target.closest('[data-customer-id]')?.dataset.customerId;
      if (id) Router.go('customer-detail', { id });
    });
  }

  // ========== 月度收款趋势 ==========
  function renderTrend() {
    const data = DebtBoardService.getCollectionTrend();
    const maxAmount = Math.max(...data.map(d => d.collected), 1);

    if (maxAmount === 0) {
      document.getElementById('trend-content').innerHTML = `<div class="empty-state">${t('debtBoard.trendNoData')}</div>`;
      return;
    }

    const barsHtml = data.map(d => {
      const heightPct = maxAmount > 0 ? Math.round(d.collected / maxAmount * 100) : 0;
      // bar 占父容器的百分比高度,父容器是 trend-bar(100% 高度,有 flex-end 对齐)
      const heightPx = Math.max(4, Math.round(heightPct * 1.3)); // max ≈ 130px(留出顶部 hover 提示空间)
      return `
        <div class="trend-bar">
          <div class="bar" style="height:${heightPx}px;">
            <span class="bar-value">${Utils.formatMoney(d.collected)}</span>
          </div>
          <span class="label">${d.month.slice(5)}</span>
        </div>
      `;
    }).join('');

    document.getElementById('trend-content').innerHTML = `
      <div class="trend-chart">${barsHtml}</div>
      <div style="margin-top:14px; padding-top:12px; border-top:1px dashed var(--border-2); font-size:11px; color:var(--text-3); text-align:center;">
        ${I18n.get()==='zh-CN' ? '悬停查看金额' : 'Hover to see amount'}
      </div>
    `;
  }

  // ========== 逾期清单 ==========
  function renderOverdueList() {
    const overdueList = DebtBoardService.getOverdueList();

    if (overdueList.length === 0) {
      document.getElementById('overdue-content').innerHTML = `
        <div class="empty-state">${t('debtBoard.noOverdue')}</div>
      `;
      return;
    }

    const rowsHtml = overdueList.slice(0, 20).map(s => {
      const severe = s.overdueDaysCalculated > 60;
      return `
        <tr style="cursor:pointer;" data-settlement-id="${s.id}">
          <td><span class="font-mono text-strong">${s.no}</span></td>
          <td>
            <div class="text-strong">${s.customerName}</div>
            <div class="text-muted" style="font-size:11px;">${s.customerCode}</div>
          </td>
          <td>
            <span class="overdue-badge ${severe ? 'severe' : ''}">+${s.overdueDaysCalculated}d</span>
          </td>
          <td><span class="font-mono">${Utils.formatDate(s.dueDate)}</span></td>
          <td class="text-right"><span class="font-mono text-red text-strong">${Utils.formatMoney(s.unpaidAmount)}</span></td>
          <td>
            ${s.customerContact || '-'}<br>
            <span class="font-mono text-muted" style="font-size:11px;">${s.customerPhone || ''}</span>
          </td>
          <td>${Badge.render('customer','riskLevelEnum',s.customerRisk)}</td>
        </tr>
      `;
    }).join('');

    document.getElementById('overdue-content').innerHTML = `
      <table class="overdue-table">
        <thead>
          <tr>
            <th>${t('settlement.no')}</th>
            <th>${t('debtBoard.customer')}</th>
            <th style="width:80px;">${t('debtBoard.daysOverdue')}</th>
            <th style="width:110px;">${t('settlement.dueDate')}</th>
            <th class="text-right" style="width:130px;">${t('settlement.unpaidAmount')}</th>
            <th style="width:160px;">${t('debtBoard.contactInfo')}</th>
            <th style="width:90px;">${t('customer.riskLevel')}</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      ${overdueList.length > 20 ? `
        <div style="padding:10px; text-align:center; color:var(--text-3); font-size:11px;">
          ${I18n.get()==='zh-CN' ? `还有 ${overdueList.length - 20} 张未显示` : `${overdueList.length - 20} more not shown`}
        </div>
      ` : ''}
    `;

    document.getElementById('overdue-content').addEventListener('click', (e) => {
      const id = e.target.closest('[data-settlement-id]')?.dataset.settlementId;
      if (id) Router.go('settlement-detail', { id });
    });
  }

  return { init };
})();

window.DebtBoardModule = DebtBoardModule;
