/**
 * CustomerStats - 客户财务指标统一计算
 * @module services/customerStats
 *
 * 概念定义(全系统统一):
 *   exposure(当前占用)  = 所有未完成订单金额(待审/待出/已发未结/未到结算周期)
 *   receivables(应收款项) = 所有未付清的结算单(包含逾期 + 未到期)
 *   overdue(逾期金额)     = 应收款项中已过期未收的部分
 *
 * 这取代了旧字段:
 *   customer.currentDebt          → receivables
 *   customer.pendingDeliveryAmount → exposure - receivables(在途部分)
 *
 * 为什么不用 customer 表里的预算字段?
 *   - 那是 seed 时计算的快照,操作发生后不会自动更新
 *   - 实时计算保证准确(代价:性能 — 调用方应批量调用)
 */

const CustomerStats = (function () {
  'use strict';

  /**
   * 计算单个客户的完整指标
   * @returns {{ exposure, receivables, overdue, pending, overdueCount, available, usagePct, status }}
   */
  function compute(custId) {
    const c = CustomerRepo.find(custId);
    if (!c) return _empty();

    // exposure
    const exposure = SalesOrderRepo.list({ customerId: custId })
      .filter(o => !['completed', 'cancelled'].includes(o.status))
      .reduce((s, o) => s + (o.totalAmount || 0), 0);

    // receivables / overdue
    let pending = 0, overdue = 0, overdueCount = 0;
    const now = Date.now();
    SettlementRepo.list()
      .filter(s => s.customerId === custId && s.status !== 'paid')
      .forEach(s => {
        const unpaid = (s.unpaidAmount != null) ? s.unpaidAmount : (s.totalAmount || 0) - (s.paidAmount || 0);
        const dueDate = s.dueDate ? new Date(s.dueDate).getTime() : null;
        if (dueDate && dueDate < now) { overdue += unpaid; overdueCount++; }
        else pending += unpaid;
      });
    const receivables = pending + overdue;

    const limit = c.settlementPolicy?.credit?.limit || c.creditLimit || 0;
    const available = limit - exposure;
    const usagePct = limit > 0 ? Math.min(999, Math.round(exposure / limit * 100)) : 0;

    // status
    let status = 'ok';
    if (c.isLocked || c.frozen || c.shipmentLocked) status = 'frozen';
    else if (overdue > 0) status = 'frozen';
    else if (limit && exposure > limit) status = 'payment_required';

    return { exposure, receivables, overdue, pending, overdueCount, available, usagePct, status, limit };
  }

  /**
   * 批量计算所有客户(返回 Map<custId, stats>)
   * 性能优化:一次性取所有表,避免每客户都 DB.find
   */
  function computeAll(custIds) {
    const result = {};
    const allOrders = SalesOrderRepo.list();
    const allSettlements = SettlementRepo.list();
    const now = Date.now();

    (custIds || CustomerRepo.list().map(c => c.id)).forEach(custId => {
      const c = CustomerRepo.find(custId);
      if (!c) { result[custId] = _empty(); return; }

      const exposure = allOrders
        .filter(o => o.customerId === custId && !['completed', 'cancelled'].includes(o.status))
        .reduce((s, o) => s + (o.totalAmount || 0), 0);

      let pending = 0, overdue = 0, overdueCount = 0;
      allSettlements
        .filter(s => s.customerId === custId && s.status !== 'paid')
        .forEach(s => {
          const unpaid = (s.unpaidAmount != null) ? s.unpaidAmount : (s.totalAmount || 0) - (s.paidAmount || 0);
          const dueDate = s.dueDate ? new Date(s.dueDate).getTime() : null;
          if (dueDate && dueDate < now) { overdue += unpaid; overdueCount++; }
          else pending += unpaid;
        });
      const receivables = pending + overdue;

      const limit = c.settlementPolicy?.credit?.limit || c.creditLimit || 0;
      const available = limit - exposure;
      const usagePct = limit > 0 ? Math.min(999, Math.round(exposure / limit * 100)) : 0;

      let status = 'ok';
      if (c.isLocked || c.frozen || c.shipmentLocked) status = 'frozen';
      else if (overdue > 0) status = 'frozen';
      else if (limit && exposure > limit) status = 'payment_required';

      result[custId] = { exposure, receivables, overdue, pending, overdueCount, available, usagePct, status, limit };
    });

    return result;
  }

  function _empty() {
    return { exposure: 0, receivables: 0, overdue: 0, pending: 0, overdueCount: 0, available: 0, usagePct: 0, status: 'ok', limit: 0 };
  }

  return { compute, computeAll };
})();

window.CustomerStats = CustomerStats;
