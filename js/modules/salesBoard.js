/**
 * 销售看板 - 业务 BI
 */
const SalesBoardModule = (function () {
  'use strict';

  function init() {
    render();
    ['salesOrder.created','salesOrder.updated','salesOrder.confirmed','customer.created']
      .forEach(e => EventBus.on(e, render));
  }

  function render() {
    const isZh = I18n.get() === 'zh-CN';
    const stats = computeStats();

    document.getElementById('app-content').innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">${isZh?'销售看板':'Sales Board'}</h1>
          <div class="page-subtitle">${isZh?'业绩 · 销售员排行 · 客户活跃度':'Performance · Sales ranking · Customer activity'}</div>
        </div>
      </div>

      <div class="grid grid-cols-4 gap-3 mb-4">
        ${renderKPI(isZh?'本月订单':'Orders this Month', stats.monthOrders, stats.monthOrdersChange, 'emerald')}
        ${renderKPI(isZh?'本月销售额':'Revenue this Month', Utils.formatMoney(stats.monthRevenue), stats.monthRevenueChange, 'blue', true)}
        ${renderKPI(isZh?'活跃客户':'Active Customers', stats.activeCustomers, null, 'amber')}
        ${renderKPI(isZh?'新增客户':'New Customers', stats.newCustomers, null, 'violet')}
      </div>

      <div style="display:grid; grid-template-columns: 1.4fr 1fr; gap:12px; margin-bottom:16px;">
        <div class="ov-section" style="margin:0;">
          <div class="ov-section-head"><span>📈 ${isZh?'近 6 月销售趋势':'Revenue · Last 6 Months'}</span></div>
          <div class="ov-section-body" id="trend-chart" style="min-height:240px;"></div>
        </div>
        <div class="ov-section" style="margin:0;">
          <div class="ov-section-head"><span>🏆 ${isZh?'销售员排行(本月)':'Sales Ranking · This Month'}</span></div>
          <div class="ov-section-body" id="sales-ranking"></div>
        </div>
      </div>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:16px;">
        <div class="ov-section" style="margin:0;">
          <div class="ov-section-head"><span><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><circle cx="6" cy="6" r="2.5"/><path d="M1.5 13.5 a4.5 4.5 0 0 1 9 0"/><circle cx="11.5" cy="5.5" r="2"/><path d="M10.5 13.5 a4 4 0 0 1 4 -4"/></svg> ${isZh?'TOP 5 客户(本月)':'TOP 5 Customers · This Month'}</span></div>
          <div class="ov-section-body" id="top-customers"></div>
        </div>
        <div class="ov-section" style="margin:0;">
          <div class="ov-section-head"><span>${Icon.box(13)} ${isZh?'TOP 5 物料(本月)':'TOP 5 Materials · This Month'}</span></div>
          <div class="ov-section-body" id="top-materials"></div>
        </div>
      </div>

      <div class="ov-section">
        <div class="ov-section-head"><span>🎯 ${isZh?'待跟进':'Follow-up'}</span></div>
        <div class="ov-section-body" id="follow-up"></div>
      </div>
    `;

    renderTrendChart(stats.monthlyTrend);
    renderSalesRanking(stats.salesRanking);
    renderTopCustomers(stats.topCustomers);
    renderTopMaterials(stats.topMaterials);
    renderFollowUp(stats.followUps);
  }

  function renderKPI(label, value, change, color, isMoney) {
    const colorVar = `var(--${color})`;
    let changeHtml = '';
    if (change !== null && change !== undefined) {
      const up = change >= 0;
      changeHtml = `<div class="kpi-trend" style="color:${up?'var(--emerald)':'var(--red)'};">${up?'↑':'↓'} ${Math.abs(change).toFixed(1)}%</div>`;
    }
    return `
      <div class="kpi">
        <div class="kpi-bar ${color}"></div>
        <div class="kpi-label">${label}</div>
        <div class="kpi-value">${value}</div>
        ${changeHtml}
      </div>
    `;
  }

  function computeStats() {
    const isZh = I18n.get() === 'zh-CN';
    const now = Date.now();
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
    const prevMonthStart = new Date(monthStart); prevMonthStart.setMonth(prevMonthStart.getMonth() - 1);
    const allOrders = SalesOrderRepo.list().filter(o => o.status !== 'cancelled');

    const monthOrders = allOrders.filter(o => new Date(o.createdAt) >= monthStart);
    const prevMonthOrders = allOrders.filter(o => {
      const d = new Date(o.createdAt);
      return d >= prevMonthStart && d < monthStart;
    });
    const monthRevenue = monthOrders.reduce((s, o) => s + (o.totalAmount || 0), 0);
    const prevMonthRevenue = prevMonthOrders.reduce((s, o) => s + (o.totalAmount || 0), 0);

    // 月度趋势(近 6 月)
    const monthlyTrend = [];
    for (let i = 5; i >= 0; i--) {
      const start = new Date(); start.setDate(1); start.setHours(0,0,0,0); start.setMonth(start.getMonth() - i);
      const end = new Date(start); end.setMonth(end.getMonth() + 1);
      const list = allOrders.filter(o => {
        const d = new Date(o.createdAt);
        return d >= start && d < end;
      });
      monthlyTrend.push({
        month: (start.getMonth() + 1) + (isZh?'月':''),
        revenue: list.reduce((s, o) => s + (o.totalAmount || 0), 0),
        count: list.length,
      });
    }

    // 活跃客户(近 60 天有订单)+ 新增(本月首单)
    const cutoff60 = new Date(); cutoff60.setDate(cutoff60.getDate() - 60);
    const activeCustomerIds = new Set(allOrders.filter(o => new Date(o.createdAt) >= cutoff60).map(o => o.customerId));
    const customers = CustomerRepo.list().filter(c => c.status === 'active');
    const newCustomerIds = new Set();
    customers.forEach(c => {
      const firstOrder = allOrders.filter(o => o.customerId === c.id).sort((a,b) => new Date(a.createdAt)-new Date(b.createdAt))[0];
      if (firstOrder && new Date(firstOrder.createdAt) >= monthStart) {
        newCustomerIds.add(c.id);
      }
    });

    // 销售员排行(本月)
    const employees = EmployeeRepo.list().filter(e => e.role === 'sales');
    const salesRanking = employees.map(e => {
      const list = monthOrders.filter(o => o.salesId === e.id);
      return {
        empId: e.id, name: e.name,
        count: list.length,
        amount: list.reduce((s, o) => s + (o.totalAmount || 0), 0),
      };
    }).filter(x => x.count > 0).sort((a, b) => b.amount - a.amount);

    // TOP 5 客户
    const custMap = {};
    monthOrders.forEach(o => {
      custMap[o.customerId] = custMap[o.customerId] || { customerId: o.customerId, count: 0, amount: 0 };
      custMap[o.customerId].count += 1;
      custMap[o.customerId].amount += o.totalAmount || 0;
    });
    const topCustomers = Object.values(custMap).map(x => ({
      ...x, customer: CustomerRepo.find(x.customerId)
    })).filter(x => x.customer).sort((a, b) => b.amount - a.amount).slice(0, 5);

    // TOP 5 物料
    const matMap = {};
    monthOrders.forEach(o => {
      (o.items || []).forEach(it => {
        matMap[it.materialId] = matMap[it.materialId] || { materialId: it.materialId, qty: 0, amount: 0 };
        matMap[it.materialId].qty += it.qty || 0;
        matMap[it.materialId].amount += (it.qty || 0) * (it.unitPrice || 0);
      });
    });
    const topMaterials = Object.values(matMap).map(x => ({
      ...x, material: MaterialRepo.find(x.materialId)
    })).filter(x => x.material).sort((a, b) => b.amount - a.amount).slice(0, 5);

    // 待跟进
    const followUps = [];
    // 草稿超过 3 天未确认
    const draftOlder3d = allOrders.filter(o => {
      if (o.status !== 'draft') return false;
      const d = (now - new Date(o.createdAt).getTime()) / 86400000;
      return d > 3;
    });
    if (draftOlder3d.length > 0) {
      followUps.push({ type: 'stale_draft', label: isZh?`${draftOlder3d.length} 个草稿超 3 天未确认`:`${draftOlder3d.length} drafts pending >3 days`, items: draftOlder3d });
    }
    // 老客户(60 天前活跃)最近 60 天没下单
    const inactive = customers.filter(c => {
      const orders = allOrders.filter(o => o.customerId === c.id);
      if (orders.length === 0) return false;
      const last = Math.max(...orders.map(o => new Date(o.createdAt).getTime()));
      const daysSince = (now - last) / 86400000;
      return daysSince > 60 && daysSince < 180;  // 60-180 天没下单
    }).slice(0, 5);
    if (inactive.length > 0) {
      followUps.push({ type: 'inactive_customer', label: isZh?`${inactive.length} 个老客户超 60 天未下单`:`${inactive.length} dormant customers >60 days`, items: inactive });
    }

    return {
      monthOrders: monthOrders.length,
      monthOrdersChange: prevMonthOrders.length > 0 ? (monthOrders.length - prevMonthOrders.length) / prevMonthOrders.length * 100 : 0,
      monthRevenue,
      monthRevenueChange: prevMonthRevenue > 0 ? (monthRevenue - prevMonthRevenue) / prevMonthRevenue * 100 : 0,
      activeCustomers: activeCustomerIds.size,
      newCustomers: newCustomerIds.size,
      monthlyTrend, salesRanking, topCustomers, topMaterials, followUps,
    };
  }

  function renderTrendChart(data) {
    const isZh = I18n.get() === 'zh-CN';
    const max = Math.max(...data.map(d => d.revenue), 1);
    const w = 540, h = 200, pad = 30;
    const xStep = (w - pad * 2) / Math.max(1, data.length - 1);
    const points = data.map((d, i) => {
      const x = pad + i * xStep;
      const y = h - pad - (d.revenue / max) * (h - pad * 2);
      return { x, y, d };
    });
    const path = points.map((p, i) => (i === 0 ? 'M' : 'L') + p.x + ',' + p.y).join(' ');
    const area = `M${points[0].x},${h - pad} ` + points.map(p => `L${p.x},${p.y}`).join(' ') + ` L${points[points.length-1].x},${h - pad} Z`;

    document.getElementById('trend-chart').innerHTML = `
      <svg viewBox="0 0 ${w} ${h}" style="width:100%; height:auto;" preserveAspectRatio="none">
        <defs>
          <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="rgba(94, 183, 255, 0.25)"/>
            <stop offset="100%" stop-color="rgba(94, 183, 255, 0.02)"/>
          </linearGradient>
        </defs>
        <line x1="${pad}" y1="${h-pad}" x2="${w-pad}" y2="${h-pad}" stroke="var(--border-1)" stroke-width="1"/>
        <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${h-pad}" stroke="var(--border-1)" stroke-width="1"/>
        <path d="${area}" fill="url(#grad)" stroke="none"/>
        <path d="${path}" fill="none" stroke="#5EB7FF" stroke-width="2"/>
        ${points.map(p => `
          <circle cx="${p.x}" cy="${p.y}" r="3" fill="#5EB7FF"/>
          <text x="${p.x}" y="${h-pad+14}" font-size="10" fill="var(--text-3)" text-anchor="middle">${p.d.month}</text>
          <text x="${p.x}" y="${p.y-8}" font-size="9" fill="var(--text-2)" text-anchor="middle">${Utils.formatMoney(p.d.revenue).replace('$','')}</text>
        `).join('')}
        <text x="${pad-6}" y="${pad+4}" font-size="9" fill="var(--text-3)" text-anchor="end">${Utils.formatMoney(max).replace('$','')}</text>
        <text x="${pad-6}" y="${h-pad+4}" font-size="9" fill="var(--text-3)" text-anchor="end">0</text>
      </svg>
    `;
  }

  function renderSalesRanking(data) {
    const isZh = I18n.get() === 'zh-CN';
    if (data.length === 0) {
      document.getElementById('sales-ranking').innerHTML = `<div class="text-muted" style="font-size:12px;">${isZh?'本月暂无销售记录':'No sales this month'}</div>`;
      return;
    }
    const max = data[0].amount;
    document.getElementById('sales-ranking').innerHTML = data.map((s, i) => {
      const pct = max > 0 ? (s.amount / max * 100) : 0;
      return `
        <div style="padding:6px 0;">
          <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:3px;">
            <span><span class="text-muted" style="margin-right:6px;">${i+1}</span><span class="text-strong">${s.name}</span></span>
            <span class="font-mono">${Utils.formatMoney(s.amount)}</span>
          </div>
          <div style="height:5px; background:var(--bg-3); border-radius:3px; overflow:hidden;">
            <div style="height:100%; width:${pct}%; background:#5EB7FF;"></div>
          </div>
          <div class="text-muted" style="font-size:10px; margin-top:2px;">${s.count} ${isZh?'单':'orders'}</div>
        </div>
      `;
    }).join('');
  }

  function renderTopCustomers(data) {
    const isZh = I18n.get() === 'zh-CN';
    if (data.length === 0) {
      document.getElementById('top-customers').innerHTML = `<div class="text-muted" style="font-size:12px;">${isZh?'暂无数据':'No data'}</div>`;
      return;
    }
    document.getElementById('top-customers').innerHTML = `
      <table style="width:100%; font-size:12px; border-collapse:collapse;">
        ${data.map((x, i) => `
          <tr style="border-bottom:1px solid var(--border-1);">
            <td style="padding:8px 6px; width:24px; color:var(--text-3);">${i+1}</td>
            <td style="padding:8px 6px;"><a href="${Router.href('customer-detail',{id:x.customer.id})}" class="text-strong" style="text-decoration:none; color:inherit;">${x.customer.name}</a></td>
            <td style="padding:8px 6px; text-align:right;" class="font-mono">${Utils.formatMoney(x.amount)}</td>
            <td style="padding:8px 6px; text-align:right; width:50px;" class="text-muted">${x.count}</td>
          </tr>
        `).join('')}
      </table>
    `;
  }

  function renderTopMaterials(data) {
    const isZh = I18n.get() === 'zh-CN';
    if (data.length === 0) {
      document.getElementById('top-materials').innerHTML = `<div class="text-muted" style="font-size:12px;">${isZh?'暂无数据':'No data'}</div>`;
      return;
    }
    document.getElementById('top-materials').innerHTML = `
      <table style="width:100%; font-size:12px; border-collapse:collapse;">
        ${data.map((x, i) => `
          <tr style="border-bottom:1px solid var(--border-1);">
            <td style="padding:8px 6px; width:24px; color:var(--text-3);">${i+1}</td>
            <td style="padding:8px 6px;">
              <div class="text-strong">${x.material.name}</div>
              <div class="text-muted" style="font-size:10px;">${x.material.spec || ''}</div>
            </td>
            <td style="padding:8px 6px; text-align:right;" class="font-mono">${Utils.formatMoney(x.amount)}</td>
            <td style="padding:8px 6px; text-align:right; width:60px;" class="text-muted">${x.qty} ${x.material.unit || ''}</td>
          </tr>
        `).join('')}
      </table>
    `;
  }

  function renderFollowUp(items) {
    const isZh = I18n.get() === 'zh-CN';
    if (items.length === 0) {
      document.getElementById('follow-up').innerHTML = `<div class="text-muted" style="font-size:12px;">${Icon.check(13)} ${isZh?'暂无需跟进事项':'No follow-ups needed'}</div>`;
      return;
    }
    document.getElementById('follow-up').innerHTML = items.map(it => {
      const color = it.type === 'stale_draft' ? 'var(--amber)' : 'var(--blue)';
      const icon = it.type === 'stale_draft' ? '⏰' : '🤝';
      return `
        <div style="display:flex; gap:10px; padding:10px 12px; background:rgba(255,255,255,0.02); border-left:3px solid ${color}; border-radius:4px; margin-bottom:8px; font-size:12px;">
          <span style="color:${color}; font-size:14px;">${icon}</span>
          <div style="flex:1;">
            <div class="text-strong">${it.label}</div>
            <div style="margin-top:4px; display:flex; flex-wrap:wrap; gap:6px;">
              ${it.items.slice(0, 5).map(o => {
                if (it.type === 'stale_draft') {
                  return `<a href="${Router.href('order-detail',{id:o.id})}" class="text-accent font-mono" style="font-size:10px; text-decoration:none; padding:1px 6px; background:rgba(255,255,255,0.04); border-radius:3px;">${o.no}</a>`;
                } else {
                  return `<a href="${Router.href('customer-detail',{id:o.id})}" class="text-accent" style="font-size:10px; text-decoration:none; padding:1px 6px; background:rgba(255,255,255,0.04); border-radius:3px;">${o.name}</a>`;
                }
              }).join('')}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  return { init };
})();

window.SalesBoardModule = SalesBoardModule;
