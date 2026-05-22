/**
 * 财务 service
 * @module services/financeService
 *
 * 负责:
 *   - payment 表的 CRUD(独立于 settlement.payments)
 *   - creditEvent 流水
 *   - 财务 KPI / 欠款分析 / 信用风险
 *
 * 设计:不与 SettlementService 重复职责,而是 wrap 之
 *   - 创建 payment 时,同时更新对应 settlement 的 paidAmount/unpaidAmount/status
 *   - settlement.payments 仍然保留(向后兼容),但权威数据在 payments 表
 */

const FinanceService = (function () {
  'use strict';

  // ===== Payment =====

  function listPayments(query = {}) {
    return PaymentRepo.list(query, { sortBy: 'paymentDate', order: 'desc' });
  }

  function findPayment(id) {
    return PaymentRepo.find(id);
  }

  function getPaymentsBySettlement(settlementId) {
    return PaymentRepo.list({ settlementId }, { sortBy: 'paymentDate', order: 'asc' });
  }

  function getPaymentsByCustomer(customerId) {
    return PaymentRepo.list({ customerId }, { sortBy: 'paymentDate', order: 'desc' });
  }

  /**
   * 创建收款记录(财务录入)
   * 自动:
   *   1. payment 表插入 status='pending_confirm'
   *   2. 等 confirmPayment 才真正影响 settlement
   */
  function createPayment(data, operatorId) {
    if (!data.settlementId) throw new Error('请选择结算单');
    if (!data.amount || data.amount <= 0) throw new Error('收款金额必须 > 0');
    if (!data.method) throw new Error('请选择收款方式');

    const settlement = SettlementRepo.find(data.settlementId);
    if (!settlement) throw new Error('结算单不存在');

    const no = IdGenerator.next('payment');
    const payment = {
      id: `pay_${Utils.uuid().slice(0, 8)}`,
      no,
      settlementId: data.settlementId,
      customerId: settlement.customerId,
      amount: Number(data.amount),
      paymentDate: data.paymentDate || Utils.today(),
      method: data.method,
      reference: data.reference || '',
      receiptUrl: data.receiptUrl || '',
      attachments: data.attachments || [],
      status: 'pending_confirm',
      currentStep: 'finance_review',
      requiredRole: 'finance',
      confirmedBy: null,
      confirmedAt: null,
      rejectedReason: null,
      remark: data.remark || '',
      createdBy: operatorId || 'unknown',
      createdAt: Utils.now(),
      updatedAt: Utils.now(),
    };
    PaymentRepo.create(payment);
    EventBus.emit('payment.created', { payment });
    return payment;
  }

  /**
   * 确认收款(财务审核)
   */
  function confirmPayment(id, operatorId) {
    const p = findPayment(id);
    if (!p) throw new Error('收款单不存在');
    if (p.status !== 'pending_confirm') throw new Error(`状态 ${p.status} 不可确认`);

    PaymentRepo.update(id, {
      status: 'confirmed',
      currentStep: 'finance_collected',
      requiredRole: null,
      confirmedBy: operatorId,
      confirmedAt: Utils.now(),
      updatedAt: Utils.now(),
    });

    // 同时把 payment 加到对应 settlement(老结构)+ 重算
    const settlement = SettlementRepo.find(p.settlementId);
    if (settlement) {
      const payments = (settlement.payments || []).filter(x => x.id !== p.id);
      payments.push({
        id: p.id,
        no: p.no,
        amount: p.amount,
        paymentDate: p.paymentDate,
        method: p.method,
        reference: p.reference,
        receiptUrl: p.receiptUrl,
      });
      const paidAmount = payments.reduce((s, x) => s + (x.amount || 0), 0);
      const payableAmount = settlement.payableAmount || 0;
      const unpaidAmount = Math.max(0, payableAmount - paidAmount);

      let newStatus = settlement.status;
      if (paidAmount >= payableAmount) newStatus = 'paid';
      else if (paidAmount > 0) newStatus = 'partial_paid';

      SettlementRepo.update(p.settlementId, {
        payments,
        paidAmount,
        unpaidAmount,
        status: newStatus,
        updatedAt: Utils.now(),
      });

      EventBus.emit('settlement.paymentReceived', { settlementId: p.settlementId, paymentId: p.id, newStatus });
    }
    EventBus.emit('payment.confirmed', { paymentId: id });
    return findPayment(id);
  }

  /**
   * 驳回收款(财务驳回)
   */
  function rejectPayment(id, reason, operatorId) {
    const p = findPayment(id);
    if (!p) throw new Error('收款单不存在');
    if (p.status !== 'pending_confirm') throw new Error(`状态 ${p.status} 不可驳回`);
    if (!reason) throw new Error('请填写驳回原因');

    PaymentRepo.update(id, {
      status: 'rejected',
      currentStep: 'finance_review',
      requiredRole: 'finance',
      rejectedReason: reason,
      updatedAt: Utils.now(),
    });
    EventBus.emit('payment.rejected', { paymentId: id, reason });
    return findPayment(id);
  }

  // ===== Credit Event =====

  function listCreditEvents(query = {}) {
    return CreditEventRepo.list(query, { sortBy: 'createdAt', order: 'desc' });
  }

  function logCreditEvent(data, operatorId) {
    const event = {
      id: `cev_${Utils.uuid().slice(0, 8)}`,
      customerId: data.customerId,
      type: data.type,
      oldValue: data.oldValue,
      newValue: data.newValue,
      triggerBy: operatorId || 'system',
      reason: data.reason || '',
      relatedType: data.relatedType || null,
      relatedId: data.relatedId || null,
      createdAt: Utils.now(),
    };
    CreditEventRepo.create(event);
    EventBus.emit('creditEvent.logged', { event });
    return event;
  }

  // ===== KPI / 看板 =====

  function getFinanceKPIs() {
    const settlements = SettlementRepo.list();
    const customers = CustomerRepo.list().filter(c => c.status === 'active');
    const monthAgo = Date.now() - 30 * 86400000;

    // 待收(应收 - 已收)
    const totalReceivable = settlements
      .filter(s => ['confirmed','partial_paid','overdue'].includes(s.status))
      .reduce((s, x) => s + (x.unpaidAmount || 0), 0);

    // 本月已收
    const allPayments = listPayments({ status: 'confirmed' });
    const monthCollected = allPayments
      .filter(p => new Date(p.paymentDate).getTime() >= monthAgo)
      .reduce((s, p) => s + (p.amount || 0), 0);

    // 待确认收款
    const pendingPayments = listPayments({ status: 'pending_confirm' });
    const pendingPaymentAmount = pendingPayments.reduce((s, p) => s + (p.amount || 0), 0);

    // 逾期
    const overdueSettlements = settlements.filter(s => s.status === 'overdue');
    const overdueAmount = overdueSettlements.reduce((s, x) => s + (x.unpaidAmount || 0), 0);

    // 信用风险客户
    const atRiskCustomers = customers.filter(c => {
      const lim = c.settlementPolicy?.credit?.limit || c.creditLimit || 0;
      const used = (c.currentDebt || 0) + (c.pendingDeliveryAmount || 0);
      return lim > 0 && used / lim > 0.9;
    });

    return {
      totalReceivable,
      monthCollected,
      pendingPaymentCount: pendingPayments.length,
      pendingPaymentAmount,
      overdueCount: overdueSettlements.length,
      overdueAmount,
      atRiskCount: atRiskCustomers.length,
      atRiskCustomers,
      monthPaymentCount: allPayments.filter(p => new Date(p.paymentDate).getTime() >= monthAgo).length,
    };
  }

  /** 账龄分析 */
  function getAgingAnalysis() {
    const buckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    const settlements = SettlementRepo.list()
      .filter(s => ['confirmed','partial_paid','overdue'].includes(s.status));
    const today = Date.now();
    settlements.forEach(s => {
      if (!s.dueDate || !s.unpaidAmount) return;
      const days = Math.floor((today - new Date(s.dueDate).getTime()) / 86400000);
      const amt = s.unpaidAmount || 0;
      if (days <= 30)       buckets['0-30']  += amt;
      else if (days <= 60)  buckets['31-60'] += amt;
      else if (days <= 90)  buckets['61-90'] += amt;
      else                  buckets['90+']   += amt;
    });
    return buckets;
  }

  return {
    listPayments, findPayment, getPaymentsBySettlement, getPaymentsByCustomer,
    createPayment, confirmPayment, rejectPayment,
    listCreditEvents, logCreditEvent,
    getFinanceKPIs, getAgingAnalysis,
  };
})();

window.FinanceService = FinanceService;
