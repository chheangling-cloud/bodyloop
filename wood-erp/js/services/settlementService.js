/**
 * 三车一结结算业务服务
 * @module services/settlementService
 *
 * 核心业务规则:
 * 1. 来源:
 *    - 自动(auto):基于已 grouped 的发货,系统建议批量结算
 *    - 手动(manual):基于 manual_pending 发货(订单完结但不足 3 车),需填原因
 * 2. 状态机:pending_confirm → confirmed → partial_paid → paid
 *           任何节点可 → cancelled,confirmed/partial_paid 超期 → overdue
 * 3. 创建结算单时:
 *    - 把发货的 settlementStatus 改为 'settled', settlementId = stl.id
 *    - 客户 currentDebt 不动(还要确认)
 * 4. confirmed 时:
 *    - 客户 currentDebt += unpaidAmount
 *    - 客户 pendingDeliveryAmount -= deliveredAmount(已转化为正式欠款)
 *    - 相关订单进入 settling 状态
 * 5. 收款:
 *    - 部分付 → partial_paid
 *    - 收齐 → paid,关联订单进入 completed 状态(如果该订单全部结算完了)
 * 6. 已 paid 不可改/不可取消
 */

const SettlementService = (function () {
  'use strict';

  const TABLE = 'settlements';

  // ========== 查询 ==========

  function list(query = {}, options = {}) {
    const opts = { sortBy: 'settlementDate', order: 'desc', ...options };
    return SettlementRepo.list(query, opts);
  }

  function findById(id) {
    return SettlementRepo.find(id);
  }

  function findByCustomer(customerId) {
    return SettlementRepo.list({ customerId }, { sortBy: 'settlementDate', order: 'desc' });
  }

  function search({ keyword, customerId, status, creationType, dateFrom, dateTo } = {}) {
    let rows = SettlementRepo.list({}, { sortBy: 'settlementDate', order: 'desc' });
    if (keyword) {
      rows = rows.filter(s => {
        const cust = CustomerRepo.find(s.customerId);
        return Utils.fuzzyMatch(s.no, keyword) ||
               Utils.fuzzyMatch(cust?.name, keyword) ||
               Utils.fuzzyMatch(s.triggerReason, keyword) ||
               Utils.fuzzyMatch(s.manualReason, keyword);
      });
    }
    if (customerId) rows = rows.filter(s => s.customerId === customerId);
    if (status) rows = rows.filter(s => s.status === status);
    if (creationType) rows = rows.filter(s => s.creationType === creationType);
    if (dateFrom) rows = rows.filter(s => s.settlementDate >= dateFrom);
    if (dateTo) rows = rows.filter(s => s.settlementDate <= dateTo);
    return rows;
  }

  /**
   * 查询客户待结算的发货 - 返回可分组的批次
   * @returns { groupedBatches: [{ groupNo, deliveries, totalAmount }], manualPending: [...], pending: [...] }
   */
  function getPendingForCustomer(customerId) {
    const deliveries = DeliveryRepo.list({ customerId });
    const grouped = deliveries.filter(d => d.settlementStatus === 'grouped');
    const manualPending = deliveries.filter(d => d.settlementStatus === 'manual_pending');
    const pending = deliveries.filter(d => d.settlementStatus === 'pending');

    // 按 group 分组
    const groupedMap = {};
    grouped.forEach(d => {
      const no = d.settlementGroupNo || 0;
      groupedMap[no] = groupedMap[no] || [];
      groupedMap[no].push(d);
    });

    const groupedBatches = Object.entries(groupedMap).map(([groupNo, deliveries]) => ({
      groupNo: Number(groupNo),
      deliveries: deliveries.sort((a, b) => a.customerTruckSequence - b.customerTruckSequence),
      totalAmount: deliveries.reduce((s, d) => s + d.totalAmount, 0),
    })).sort((a, b) => a.groupNo - b.groupNo);

    return { groupedBatches, manualPending, pending };
  }

  /** 所有客户的待结算清单(财务首屏用) */
  function getAllPending() {
    const result = [];
    const allDeliveries = DeliveryRepo.list().filter(d =>
      d.settlementStatus === 'grouped' || d.settlementStatus === 'manual_pending'
    );

    const byCustomer = {};
    allDeliveries.forEach(d => {
      byCustomer[d.customerId] = byCustomer[d.customerId] || [];
      byCustomer[d.customerId].push(d);
    });

    Object.entries(byCustomer).forEach(([customerId, deliveries]) => {
      const cust = CustomerRepo.find(customerId);
      // 按结算组分批
      const grouped = deliveries.filter(d => d.settlementStatus === 'grouped');
      const manualPending = deliveries.filter(d => d.settlementStatus === 'manual_pending');

      const groupedMap = {};
      grouped.forEach(d => {
        const no = d.settlementGroupNo;
        groupedMap[no] = groupedMap[no] || [];
        groupedMap[no].push(d);
      });

      Object.entries(groupedMap).forEach(([groupNo, ds]) => {
        result.push({
          customerId, customerName: cust?.name, customerCode: cust?.code,
          creationType: 'auto',
          groupNo: Number(groupNo),
          deliveries: ds,
          truckCount: ds.length,
          totalAmount: ds.reduce((s, d) => s + d.totalAmount, 0),
        });
      });

      if (manualPending.length > 0) {
        result.push({
          customerId, customerName: cust?.name, customerCode: cust?.code,
          creationType: 'manual',
          groupNo: null,
          deliveries: manualPending,
          truckCount: manualPending.length,
          totalAmount: manualPending.reduce((s, d) => s + d.totalAmount, 0),
        });
      }
    });

    return result;
  }

  // ========== CRUD ==========

  /**
   * 创建结算单
   * @param {object} data { customerId, deliveryIds, creationType, manualReason, adjustment, adjustmentReason, remark }
   */
  function create(data, operatorId) {
    if (!data.customerId) throw new Error('请选择客户');
    if (!data.deliveryIds || data.deliveryIds.length === 0) throw new Error('请至少选择 1 张发货单');

    const cust = CustomerRepo.find(data.customerId);
    if (!cust) throw new Error('客户不存在');

    // 检查所有发货单
    const deliveries = data.deliveryIds.map(id => DeliveryRepo.find(id)).filter(d => d);
    if (deliveries.length !== data.deliveryIds.length) {
      throw new Error('部分发货单不存在');
    }
    // 必须是该客户的
    const wrongCust = deliveries.find(d => d.customerId !== data.customerId);
    if (wrongCust) throw new Error(`发货单 ${wrongCust.no} 不属于该客户`);
    // 必须是 grouped 或 manual_pending(不能结算已 settled 的)
    const invalid = deliveries.find(d => !['grouped','manual_pending'].includes(d.settlementStatus));
    if (invalid) throw new Error(`发货单 ${invalid.no} 状态 ${invalid.settlementStatus} 不可结算`);

    // 手动结算必须填原因
    if (data.creationType === 'manual' && !data.manualReason) {
      throw new Error('手动结算必须填写原因');
    }

    const deliveredAmount = deliveries.reduce((s, d) => s + d.totalAmount, 0);
    const adjustment = Number(data.adjustment) || 0;
    const payableAmount = deliveredAmount + adjustment;
    const orderIds = Utils.unique(deliveries.map(d => d.salesOrderId));

    const settlementDate = data.settlementDate || Utils.today();
    const dueDate = Utils.addDays(settlementDate, cust.paymentDays || 30);
    const truckCount = deliveries.length;

    const no = IdGenerator.next('settlement');
    const settlement = {
      no,
      customerId: data.customerId,
      salesOrderIds: orderIds,
      deliveryIds: deliveries.map(d => d.id),
      truckCount,
      settlementDate,
      creationType: data.creationType || 'auto',
      manualReason: data.manualReason || '',
      triggerReason: data.creationType === 'manual'
        ? '手动结算'
        : `凑齐结算组 #${deliveries[0].settlementGroupNo || ''}`,
      deliveredAmount,
      adjustment,
      adjustmentReason: data.adjustmentReason || '',
      payableAmount,
      paidAmount: 0,
      unpaidAmount: payableAmount,
      payments: [],
      dueDate,
      overdueDays: 0,
      status: 'pending_confirm',
      remark: data.remark || '',
      createdBy: operatorId || 'unknown',
    };

    const inserted = SettlementRepo.create(settlement);

    // 标记发货单为 settled
    deliveries.forEach(d => {
      DeliveryRepo.update(d.id, {
        settlementStatus: 'settled',
        settlementId: inserted.id,
      });
    });

    _logChange(inserted.id, 'create', null, 'pending_confirm', operatorId, '创建结算单');
    EventBus.emit('settlement.created', inserted);

    return inserted;
  }

  /** 确认结算单(pending_confirm → confirmed) */
  function confirm(id, operatorId) {
    const s = findById(id);
    if (!s) throw new Error('结算单不存在');
    if (s.status !== 'pending_confirm') throw new Error(`当前状态(${s.status})不允许确认`);

    const updated = SettlementRepo.update(id, {
      status: 'confirmed',
      confirmedAt: Utils.now(),
      confirmedBy: operatorId,
    });

    // 客户欠款重算
    if (window.CustomerService) CustomerService.recalculate(s.customerId);

    // 相关订单进入 settling
    (s.salesOrderIds || []).forEach(orderId => {
      SalesOrderService.startSettling(orderId, operatorId);
    });

    _logChange(id, 'status_change', 'pending_confirm', 'confirmed', operatorId, '财务确认');
    EventBus.emit('settlement.confirmed', updated);
    return updated;
  }

  /** 取消结算单 */
  function cancel(id, reason, operatorId) {
    const s = findById(id);
    if (!s) throw new Error('结算单不存在');
    if (['paid','cancelled'].includes(s.status)) {
      throw new Error('已收齐或已取消的结算单不可再取消');
    }
    if (s.paidAmount > 0) {
      throw new Error('已有收款的结算单不可取消');
    }
    if (!reason) throw new Error('请填写取消原因');

    // 退回发货单状态
    (s.deliveryIds || []).forEach(did => {
      const d = DeliveryRepo.find(did);
      if (d) {
        // 退回 grouped(如果原本是 grouped),否则 pending
        // 简单起见,根据 creationType 判断
        const newStatus = s.creationType === 'manual' ? 'manual_pending' : 'grouped';
        DeliveryRepo.update(did, {
          settlementStatus: newStatus,
          settlementId: null,
        });
      }
    });

    const updated = SettlementRepo.update(id, {
      status: 'cancelled',
      remark: s.remark ? `${s.remark} | 取消: ${reason}` : `取消: ${reason}`,
    });
    _logChange(id, 'status_change', s.status, 'cancelled', operatorId, reason);
    if (window.CustomerService) CustomerService.recalculate(s.customerId);
    EventBus.emit('settlement.cancelled', updated);
    return updated;
  }

  /**
   * 收款登记
   * @param {string} settlementId
   * @param {object} payment { amount, method, reference, paymentDate, remark }
   */
  function addPayment(settlementId, payment, operatorId) {
    const s = findById(settlementId);
    if (!s) throw new Error('结算单不存在');
    if (!['confirmed','partial_paid','overdue'].includes(s.status)) {
      throw new Error(`当前状态(${s.status})不允许收款`);
    }
    const amount = Number(payment.amount) || 0;
    if (amount <= 0) throw new Error('收款金额必须大于 0');
    if (amount > s.unpaidAmount) {
      throw new Error(`收款金额 $${(amount/100).toLocaleString()} 超过未收 $${(s.unpaidAmount/100).toLocaleString()}`);
    }

    const newPayment = {
      paymentId: `pay_${Utils.uuid().slice(0, 8)}`,
      paymentDate: payment.paymentDate || Utils.today(),
      amount,
      method: payment.method || 'transfer',
      reference: payment.reference || '',
      remark: payment.remark || '',
      operatorId: operatorId || 'unknown',
    };

    const newPaid = s.paidAmount + amount;
    const newUnpaid = s.payableAmount - newPaid;
    let newStatus = s.status;
    if (newUnpaid === 0) {
      newStatus = 'paid';
    } else if (s.status === 'confirmed' || s.status === 'overdue') {
      newStatus = 'partial_paid';
    }

    const updated = SettlementRepo.update(settlementId, {
      payments: [...(s.payments || []), newPayment],
      paidAmount: newPaid,
      unpaidAmount: newUnpaid,
      status: newStatus,
    });

    _logChange(settlementId, 'payment', s.status, newStatus, operatorId,
      `收款 $${(amount/100).toLocaleString()}`);

    // 客户重算
    if (window.CustomerService) CustomerService.recalculate(s.customerId);

    // 收齐 → 检查相关订单是否可以完结
    if (newStatus === 'paid') {
      _maybeCompleteOrders(s.salesOrderIds, operatorId);
    }

    EventBus.emit('settlement.paymentReceived', { settlement: updated, payment: newPayment });
    return updated;
  }

  /** 检查相关订单是否所有结算都已 paid,如是则订单完结 */
  function _maybeCompleteOrders(orderIds, operatorId) {
    (orderIds || []).forEach(orderId => {
      const order = SalesOrderService.findById(orderId);
      if (!order) return;
      if (['completed','cancelled','draft'].includes(order.status)) return;

      // 该订单所有发货
      const deliveries = DeliveryRepo.list({ salesOrderId: orderId });
      // 必须全部 settled
      const allSettled = deliveries.length > 0 && deliveries.every(d => d.settlementStatus === 'settled');
      if (!allSettled) return;

      // 涉及的结算单全部 paid
      const settlementIds = Utils.unique(deliveries.map(d => d.settlementId).filter(Boolean));
      const allPaid = settlementIds.length > 0 && settlementIds.every(sid => {
        const stl = SettlementRepo.find(sid);
        return stl && stl.status === 'paid';
      });

      // 订单数量必须全部发完
      const totalQty = order.items.reduce((s, it) => s + (it.qty || 0), 0);
      const shippedQty = order.shippedQty || 0;
      const allShipped = shippedQty >= totalQty;

      if (allShipped && allPaid) {
        try {
          SalesOrderService.markCompleted(orderId, operatorId || 'system');
        } catch (e) {
          // 状态不对就跳过
        }
      }
    });
  }

  /** 调度:批量更新逾期状态 */
  function refreshOverdueStatus() {
    const today = Utils.today();
    const candidates = SettlementRepo.list().filter(s =>
      ['confirmed','partial_paid'].includes(s.status) && s.dueDate < today && s.unpaidAmount > 0
    );
    let changed = 0;
    candidates.forEach(s => {
      const overdueDays = Utils.diffDays(s.dueDate, new Date(today));
      SettlementRepo.update(s.id, { status: 'overdue', overdueDays });
      changed += 1;
    });
    return changed;
  }

  // ========== 私有 ==========

  function _logChange(recordId, category, oldValue, newValue, operatorId, reason) {
    ChangeLogRepo.create({
      recordType: 'settlement',
      recordId,
      changeCategory: category,
      changes: [{ field: 'status', fieldLabel: '状态', oldValue, newValue }],
      operatorId: operatorId || 'unknown',
      operatorName: _getOperatorName(operatorId),
      operatedAt: Utils.now(),
      reason: reason || '',
    });
  }

  function _getOperatorName(operatorId) {
    if (!operatorId || operatorId === 'system') return '系统';
    const emp = EmployeeRepo.find(operatorId);
    return emp?.name || operatorId;
  }

  return {
    list, findById, findByCustomer, search,
    getPendingForCustomer, getAllPending,
    create, confirm, cancel,
    addPayment,
    refreshOverdueStatus,
  };
})();

window.SettlementService = SettlementService;
