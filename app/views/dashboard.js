/**
 * View: 工作台(主控)
 * @module app/views/dashboard
 */

window.View_dashboard = (function () {
  'use strict';

  function init(ctx) {
    const isZh = I18n.get() === 'zh-CN';

    // 计算 KPI
    const orders = SalesOrderRepo.list();
    const activeOrders = orders.filter(o =>
      !['completed', 'cancelled'].includes(o.status)
    ).length;
    const completedThisMonth = orders.filter(o => {
      if (o.status !== 'completed') return false;
      const updated = new Date(o.updatedAt || o.createdAt);
      const monthAgo = new Date(Date.now() - 30 * 86400000);
      return updated >= monthAgo;
    }).length;

    const customers = CustomerRepo.list().filter(c => c.status !== 'deleted');
    const statsMap = CustomerStats.computeAll(customers.map(c => c.id));
    let totalReceivables = 0, totalOverdue = 0, highRiskCount = 0;
    customers.forEach(c => {
      const cs = statsMap[c.id];
      totalReceivables += cs.receivables;
      totalOverdue += cs.overdue;
      if (cs.overdue > 0 || cs.usagePct > 90 || cs.status === 'frozen') highRiskCount++;
    });

    const inventory = InventoryRepo.list();
    const totalValue = inventory.reduce((s, i) => s + (i.quantity || 0) * (i.avgCost || 0), 0);
    const lowStock = inventory.filter(i => {
      const available = (i.quantity || 0) - (i.lockedQuantity || 0);
      return available < (i.safetyStock || 0);
    }).length;

    const overdueSettlements = SettlementRepo.list().filter(s => s.status === 'overdue');
    const overdueAmount = Utils.sum(overdueSettlements, 'unpaidAmount');

    // 最近活跃订单(取 5 个最近更新)
    const recentOrders = [...orders]
      .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
      .slice(0, 6);

    document.getElementById('app-content').innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">${t('nav.dashboard')}</h1>
          <div class="page-subtitle">
            ${isZh ? '森达木业 ERP 工作台 · 全局概览' : 'Sendar Wood ERP Dashboard · Overview'}
          </div>
        </div>
      </div>

      <!-- 4 大 KPI -->
      <div class="grid grid-cols-4 gap-3 mb-4">
        <div class="kpi" style="cursor:pointer;" data-go="order-center">
          <div class="kpi-bar blue"></div>
          <div class="kpi-label">${isZh ? '进行中订单' : 'Active Orders'}</div>
          <div class="kpi-value">${activeOrders}</div>
          <div class="kpi-trend">${isZh ? `本月完成 ${completedThisMonth}` : `${completedThisMonth} done this month`}</div>
        </div>
        <div class="kpi" style="cursor:pointer;" data-go="debt-board">
          <div class="kpi-bar red"></div>
          <div class="kpi-label">${isZh ? '逾期金额' : 'Overdue'}</div>
          <div class="kpi-value">${Utils.formatMoney(overdueAmount)}</div>
          <div class="kpi-trend">${isZh ? `${overdueSettlements.length} 张待催收` : `${overdueSettlements.length} settlements`}</div>
        </div>
        <div class="kpi" style="cursor:pointer;" data-go="inventory-list">
          <div class="kpi-bar emerald"></div>
          <div class="kpi-label">${isZh ? '库存总价值' : 'Inventory Value'}</div>
          <div class="kpi-value">${Utils.formatMoney(totalValue)}</div>
          <div class="kpi-trend">${isZh ? `${lowStock} 个低库存` : `${lowStock} low-stock`}</div>
        </div>
        <div class="kpi" style="cursor:pointer;" data-go="customer-list">
          <div class="kpi-bar amber"></div>
          <div class="kpi-label">${isZh ? '应收款项' : 'Receivables'}</div>
          <div class="kpi-value">${Utils.formatMoney(totalReceivables)}</div>
          <div class="kpi-trend">${isZh ? `${highRiskCount} 个高风险` : `${highRiskCount} high-risk`}</div>
        </div>
      </div>

      <!-- 快捷入口 -->
      <div class="grid grid-cols-2 gap-3 mb-4">
        <a href="${Router.href('order-center')}" class="card entry-card" style="text-decoration:none; padding:18px;">
          <div style="display:flex; align-items:center; gap:12px;">
            <div class="entry-icon">${Icon.clipboard(20)}</div>
            <div>
              <div class="text-strong" style="font-size:14px;">${t('nav.orderCenter')}</div>
              <div class="text-muted" style="font-size:11px;">${isZh ? '订单全生命周期管理' : 'Order full lifecycle'}</div>
            </div>
          </div>
        </a>
        <a href="${Router.href('customer-list')}" class="card entry-card" style="text-decoration:none; padding:18px;">
          <div style="display:flex; align-items:center; gap:12px;">
            <div class="entry-icon">${Icon.users(20)}</div>
            <div>
              <div class="text-strong" style="font-size:14px;">${t('nav.customers')}</div>
              <div class="text-muted" style="font-size:11px;">${customers.length} ${isZh ? '个客户' : 'customers'}</div>
            </div>
          </div>
        </a>
      </div>

      <!-- 最近订单 -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">${isZh ? '最近更新的订单' : 'Recently Updated Orders'}</div>
          <a href="${Router.href('order-center')}" class="text-accent" style="font-size:11px; text-decoration:none;">
            ${isZh ? '查看全部 →' : 'View All →'}
          </a>
        </div>
        <div style="overflow-x:auto;">
          <table style="width:100%; font-size:12px; border-collapse:collapse;">
            <thead>
              <tr style="background: var(--bg-3); color: var(--text-3); text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em;">
                <th style="text-align:left; padding:8px 12px;">${t('orderCenter.colOrderNo')}</th>
                <th style="text-align:left; padding:8px 12px;">${t('orderCenter.colCustomer')}</th>
                <th style="text-align:right; padding:8px 12px;">${t('common.amount')}</th>
                <th style="text-align:left; padding:8px 12px;">${t('orderCenter.colStage')}</th>
                <th style="text-align:left; padding:8px 12px;">${t('orderCenter.colUpdated')}</th>
              </tr>
            </thead>
            <tbody>
              ${recentOrders.map(o => {
                const cust = CustomerRepo.find(o.customerId);
                return `
                  <tr style="border-bottom:1px solid var(--border-1); cursor:pointer;" data-go="order-detail" data-id="${o.id}">
                    <td style="padding:10px 12px;" class="font-mono text-accent text-strong">${o.no}</td>
                    <td style="padding:10px 12px;">${cust?.name || '-'}</td>
                    <td style="padding:10px 12px; text-align:right;" class="font-mono text-strong">${Utils.formatMoney(o.totalAmount)}</td>
                    <td style="padding:10px 12px;">${tEnum('salesOrder','statusEnum',o.status)}</td>
                    <td style="padding:10px 12px;" class="font-mono text-muted">${Utils.formatDate(o.updatedAt || o.createdAt)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // 绑定点击跳转
    document.getElementById('app-content').addEventListener('click', (e) => {
      const target = e.target.closest('[data-go]');
      if (!target) return;
      const route = target.dataset.go;
      const id = target.dataset.id;
      if (id) Router.go(route, { id });
      else Router.go(route);
    });
  }

  function _inboxRouteForCurrent() {
    const cur = (typeof Session !== 'undefined' && Session.current) ? Session.current() : null;
    const role = cur?.role || 'sales';
    if (role === 'finance') return 'inbox-finance';
    if (role === 'warehouse') return 'inbox-warehouse';
    return 'inbox-sales';
  }

  function _inboxSubtitle(isZh) {
    const cur = (typeof Session !== 'undefined' && Session.current) ? Session.current() : null;
    const role = cur?.role || 'sales';
    if (typeof OrderTaskService === 'undefined') return isZh ? '任务流转中心' : 'Workflow center';
    const count = OrderTaskService.countMyTasks(role, cur?.id);
    return count > 0
      ? (isZh ? `${count} 项待办 → ${role === 'finance' ? '财务' : role === 'warehouse' ? '仓管' : '销售'}` : `${count} pending tasks`)
      : (isZh ? '暂无待办,任务流转中心' : 'No pending tasks');
  }

  return { init };
})();
