/**
 * 欠款看板聚合服务
 * @module services/debtBoardService
 *
 * 纯只读聚合,不修改任何数据。
 * 数据来源:customers, settlements
 *
 * 账龄(基于结算单 dueDate):
 *   - 未到期(due in future)
 *   - 1-30 天逾期
 *   - 31-60 天逾期
 *   - 61-90 天逾期
 *   - 90+ 天逾期
 */

const DebtBoardService = (function () {
  'use strict';

  function _today() { return new Date(Utils.today()); }

  // ========== 顶部 KPI ==========
  function getTopKPIs() {
    const customers = CustomerRepo.list().filter(c => c.status !== 'deleted');
    const statsMap = CustomerStats.computeAll(customers.map(c => c.id));

    // 应收款项总额 + 逾期金额总额(全系统统一概念)
    let totalReceivables = 0, totalOverdue = 0;
    customers.forEach(c => {
      const s = statsMap[c.id];
      totalReceivables += s.receivables;
      totalOverdue += s.overdue;
    });
    const locked = customers.filter(c => c.shipmentLocked).length;

    // 高风险 = 应收逾期 / 占用超额度
    const highRisk = customers.filter(c => {
      const s = statsMap[c.id];
      return s.overdue > 0 || s.usagePct > 90;
    }).length;

    // 本月已收(vs 上月对比)
    const today = _today();
    const monthAgo = Utils.addDays(Utils.today(), -30);
    const prevMonthStart = Utils.addDays(Utils.today(), -60);
    let thisMonthCollected = 0;
    let prevMonthCollected = 0;
    SettlementRepo.list().forEach(s => {
      (s.payments || []).forEach(p => {
        if (p.paymentDate >= monthAgo) thisMonthCollected += p.amount;
        else if (p.paymentDate >= prevMonthStart) prevMonthCollected += p.amount;
      });
    });
    const collectedDelta = prevMonthCollected > 0
      ? Math.round((thisMonthCollected - prevMonthCollected) / prevMonthCollected * 100)
      : 0;

    // 统计有多少张逾期结算单(给"待催收"用)
    let overdueCount = 0;
    customers.forEach(c => { overdueCount += (statsMap[c.id]?.overdueCount || 0); });

    return {
      // 新字段
      totalReceivables,   // 应收款项总额(含逾期)
      totalOverdue,       // 逾期金额总额
      // 兼容老调用
      totalDebt: totalReceivables,
      totalPending: 0,                       // 旧"在途风险"概念已并入 receivables
      totalExposure: totalReceivables,
      overdueAmount: totalOverdue,
      overdueCount,
      lockedCount: locked,
      highRiskCount: highRisk,
      activeCustomers: customers.length,
      thisMonthCollected,
      prevMonthCollected,
      collectedDelta,
    };
  }

  // ========== 账龄分析 ==========
  function getAgingAnalysis() {
    const today = _today();
    const buckets = {
      not_due:    { label: 'not_due',    days: '未到期',  amount: 0, count: 0 },
      overdue_30: { label: 'overdue_30', days: '1-30天',  amount: 0, count: 0 },
      overdue_60: { label: 'overdue_60', days: '31-60天', amount: 0, count: 0 },
      overdue_90: { label: 'overdue_90', days: '61-90天', amount: 0, count: 0 },
      overdue_90_plus: { label: 'overdue_90_plus', days: '90+天', amount: 0, count: 0 },
    };

    const activeSettlements = SettlementRepo.list().filter(s =>
      ['confirmed','partial_paid','overdue'].includes(s.status) && (s.unpaidAmount || 0) > 0
    );

    activeSettlements.forEach(s => {
      const dueDate = new Date(s.dueDate);
      const diffDays = Utils.diffDays(s.dueDate, today);
      // diffDays > 0 表示已经过期了 diffDays 天
      let bucket;
      if (diffDays <= 0) bucket = 'not_due';
      else if (diffDays <= 30) bucket = 'overdue_30';
      else if (diffDays <= 60) bucket = 'overdue_60';
      else if (diffDays <= 90) bucket = 'overdue_90';
      else bucket = 'overdue_90_plus';

      buckets[bucket].amount += s.unpaidAmount;
      buckets[bucket].count += 1;
    });

    const total = Object.values(buckets).reduce((s, b) => s + b.amount, 0);
    Object.values(buckets).forEach(b => {
      b.percentage = total > 0 ? Math.round(b.amount / total * 100) : 0;
    });

    return { buckets, total };
  }

  // ========== TOP 欠款客户 ==========
  // 排序按"应收款项"(含逾期)降序
  function getTopDebtorCustomers(limit = 10) {
    const customers = CustomerRepo.list().filter(c => c.status !== 'deleted');
    const statsMap = CustomerStats.computeAll(customers.map(c => c.id));

    return customers
      .map(c => {
        const s = statsMap[c.id];
        return {
          ...c,
          // 用 CustomerStats 提供的字段
          exposure: s.exposure,
          receivables: s.receivables,        // 应收款项
          overdueAmount: s.overdue,          // 逾期金额(替代 overdueAmount 老字段)
          currentDebt: s.receivables,        // 兼容老调用(列表里"客户欠款" → 应收款项)
          creditUsage: s.usagePct,
        };
      })
      .filter(c => c.receivables > 0)
      .sort((a, b) => b.receivables - a.receivables)
      .slice(0, limit);
  }

  // ========== 风险分布 ==========
  function getRiskDistribution() {
    const customers = CustomerRepo.list().filter(c => c.status !== 'deleted');
    const dist = {
      normal:    { count: 0, debt: 0, label: 'normal' },
      attention: { count: 0, debt: 0, label: 'attention' },
      high:      { count: 0, debt: 0, label: 'high' },
      locked:    { count: 0, debt: 0, label: 'locked' },
    };
    customers.forEach(c => {
      const key = c.riskLevel || 'normal';
      if (dist[key]) {
        dist[key].count += 1;
        // 改为应收款项(原"在途+欠款")
        const stats = CustomerStats.compute(c.id);
        dist[key].debt += stats.receivables;
      }
    });
    return dist;
  }

  // ========== 逾期清单(结算单粒度) ==========
  function getOverdueList() {
    return SettlementRepo.list()
      .filter(s => s.status === 'overdue')
      .map(s => {
        const cust = CustomerRepo.find(s.customerId);
        const overdueDays = Utils.diffDays(s.dueDate, _today());
        return {
          ...s,
          customerName: cust?.name,
          customerCode: cust?.code,
          customerPhone: cust?.phone,
          customerContact: cust?.contact,
          customerRisk: cust?.riskLevel,
          customerLocked: cust?.shipmentLocked,
          overdueDaysCalculated: overdueDays,
        };
      })
      .sort((a, b) => b.overdueDaysCalculated - a.overdueDaysCalculated);
  }

  // ========== 月度收款趋势(近 6 个月) ==========
  function getCollectionTrend() {
    const today = _today();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const monthStart = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const monthEnd = new Date(today.getFullYear(), today.getMonth() - i + 1, 0);
      const startStr = Utils.formatDate(monthStart);
      const endStr = Utils.formatDate(monthEnd);
      let collected = 0;
      SettlementRepo.list().forEach(s => {
        (s.payments || []).forEach(p => {
          if (p.paymentDate >= startStr && p.paymentDate <= endStr) {
            collected += p.amount;
          }
        });
      });
      months.push({
        month: `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`,
        collected,
      });
    }
    return months;
  }

  return {
    getTopKPIs,
    getAgingAnalysis,
    getTopDebtorCustomers,
    getRiskDistribution,
    getOverdueList,
    getCollectionTrend,
  };
})();

window.DebtBoardService = DebtBoardService;
