/**
 * 客户业务服务
 * @module services/customerService
 *
 * 封装客户相关的业务逻辑(CRUD + 衍生计算)。
 * UI 层只调用此服务,不直接操作 DB。
 *
 * 未来重构时,此层整体迁移到后端 Service。
 */

const CustomerService = (function () {
  'use strict';

  const TABLE = 'customers';

  // ---------- 查询 ----------

  /** 获取所有客户(默认排除已删除) */
  function list(query = {}, options = {}) {
    const results = CustomerRepo.list(query, options);
    // 默认排除已归档客户(显式 includeArchived 才显示)
    if (options.includeArchived) return results;
    return results.filter(r => !(r.is_archived === true));
  }

  /** 取所有已归档客户 */
  function listArchived() {
    return CustomerRepo.list().filter(r => r.is_archived === true);
  }

  /** 根据 ID 查 */
  function findById(id) {
    return CustomerRepo.find(id);
  }

  /** 搜索(关键字 + 筛选条件) */
  function search({ keyword, riskLevel, status, level, settlementMode } = {}) {
    let list = CustomerRepo.list();
    if (keyword) {
      list = list.filter(c =>
        Utils.fuzzyMatch(c.code, keyword) ||
        Utils.fuzzyMatch(c.name, keyword) ||
        Utils.fuzzyMatch(c.shortName, keyword) ||
        Utils.fuzzyMatch(c.contact, keyword) ||
        Utils.fuzzyMatch(c.phone, keyword)
      );
    }
    if (riskLevel) list = list.filter(c => c.riskLevel === riskLevel);
    if (status) list = list.filter(c => c.status === status);
    if (level) list = list.filter(c => c.level === level);
    if (settlementMode) list = list.filter(c => c.settlementRule?.mode === settlementMode);
    return list;
  }

  // ---------- 计算 ----------

  /**
   * 重新计算客户的派生统计(欠款、风险等级)
   * 应在订单/发货/结算/收款变化后调用
   */
  function recalculate(customerId) {
    const cust = CustomerRepo.find(customerId);
    if (!cust) return null;

    const orders = SalesOrderRepo.list({ customerId });
    const deliveries = DeliveryRepo.list({ customerId });
    const settlements = SettlementRepo.list({ customerId });

    const validStl = settlements.filter(s => s.status !== 'cancelled');

    const stats = {
      totalOrderAmount: Utils.sum(orders.filter(o => o.status !== 'cancelled'), 'totalAmount'),
      totalDeliveredAmount: Utils.sum(deliveries, 'totalAmount'),
      totalSettledAmount: Utils.sum(validStl, 'payableAmount'),
      totalPaidAmount: Utils.sum(validStl, 'paidAmount'),
    };
    stats.currentDebt = stats.totalSettledAmount - stats.totalPaidAmount;
    stats.pendingDeliveryAmount = Utils.sum(
      deliveries.filter(d => d.settlementStatus !== 'settled'),
      'totalAmount'
    );

    const overdueStl = validStl.filter(s => s.status === 'overdue');
    stats.overdueAmount = Utils.sum(overdueStl, 'unpaidAmount');
    stats.overdueDays = overdueStl.reduce((max, s) => Math.max(max, s.overdueDays || 0), 0);

    // 风险等级
    let riskLevel;
    if (cust.shipmentLocked) {
      riskLevel = 'locked';
    } else {
      const totalExposure = stats.currentDebt + stats.pendingDeliveryAmount;
      const usage = cust.creditLimit > 0 ? (totalExposure / cust.creditLimit) * 100 : 0;
      if (stats.overdueDays > 30 || usage > 90) riskLevel = 'high';
      else if (stats.overdueDays > 0 || usage > 70) riskLevel = 'attention';
      else riskLevel = 'normal';
    }

    return CustomerRepo.update(customerId, { ...stats, riskLevel });
  }

  /** 获取客户的信用使用率(%) */
  function getCreditUsage(customer) {
    if (!customer.creditLimit) return 0;
    const exposure = (customer.currentDebt || 0) + (customer.pendingDeliveryAmount || 0);
    return Utils.percent(exposure, customer.creditLimit, 1);
  }

  // ---------- 信用控制 ----------

  /**
   * 信用检查(发货前调用)
   * @param {string} customerId
   * @param {number} amount 本次新增发货金额
   * @returns {{ passed, reason, debtAfter, creditLimit }}
   */
  function checkCredit(customerId, amount) {
    const cust = CustomerRepo.find(customerId);
    if (!cust) return { passed: false, reason: '客户不存在' };
    if (cust.shipmentLocked) return { passed: false, reason: `客户已被锁定: ${cust.lockedReason}` };

    const exposure = (cust.currentDebt || 0) + (cust.pendingDeliveryAmount || 0);
    const afterAmount = exposure + amount;

    if (afterAmount > cust.creditLimit) {
      return {
        passed: false,
        reason: `超出信用额度:总暴露 ${Utils.formatMoney(afterAmount)} > 额度 ${Utils.formatMoney(cust.creditLimit)}`,
        debtBefore: exposure,
        debtAfter: afterAmount,
        creditLimit: cust.creditLimit,
      };
    }
    return {
      passed: true,
      debtBefore: exposure,
      debtAfter: afterAmount,
      creditLimit: cust.creditLimit,
    };
  }

  /** 锁定客户发货 */
  function lockShipment(customerId, reason, operatorId) {
    const cust = CustomerRepo.find(customerId);
    if (!cust) return null;
    const updated = CustomerRepo.update(customerId, {
      shipmentLocked: true,
      lockedReason: reason,
      lockedAt: Utils.now(),
      riskLevel: 'locked',
    });
    // 写日志
    ChangeLogRepo.create({
      recordType: 'customer',
      recordId: customerId,
      changeCategory: 'credit_lock',
      changes: [{ field: 'shipmentLocked', fieldLabel: '发货锁定', oldValue: false, newValue: true }],
      operatorId: operatorId || 'system',
      operatorName: '系统',
      operatedAt: Utils.now(),
      reason,
    });
    EventBus.emit('customer.locked', { customerId, reason });
    return updated;
  }

  /** 解锁客户发货 */
  function unlockShipment(customerId, reason, operatorId) {
    const cust = CustomerRepo.find(customerId);
    if (!cust) return null;
    const updated = CustomerRepo.update(customerId, {
      shipmentLocked: false,
      lockedReason: '',
      lockedAt: null,
    });
    recalculate(customerId);
    ChangeLogRepo.create({
      recordType: 'customer',
      recordId: customerId,
      changeCategory: 'credit_unlock',
      changes: [{ field: 'shipmentLocked', fieldLabel: '发货锁定', oldValue: true, newValue: false }],
      operatorId: operatorId || 'system',
      operatorName: '操作员',
      operatedAt: Utils.now(),
      reason,
    });
    EventBus.emit('customer.unlocked', { customerId, reason });
    return updated;
  }

  // ---------- CRUD ----------

  function create(data, operatorId) {
    const code = IdGenerator.nextCustomerCode();
    const customer = {
      code,
      name: data.name,
      shortName: data.shortName || data.name?.slice(0, 4) || '',
      contact: data.contact || '',
      phone: data.phone || '',
      address: data.address || '',
      taxNo: data.taxNo || '',
      creditLimit: data.creditLimit || 0,
      settlementRule: data.settlementRule || {
        mode: 'three_truck_one_settle',
        truckThreshold: 3,
        amountThreshold: 0,
        triggerLogic: 'any',
      },
      paymentDays: data.paymentDays || 30,
      shipmentLocked: false,
      lockedReason: '',
      lockedAt: null,
      totalOrderAmount: 0,
      totalDeliveredAmount: 0,
      totalSettledAmount: 0,
      totalPaidAmount: 0,
      currentDebt: 0,
      pendingDeliveryAmount: 0,
      overdueAmount: 0,
      overdueDays: 0,
      level: data.level || 'C',
      riskLevel: 'normal',
      status: 'active',
      remark: data.remark || '',
      createdBy: operatorId || 'unknown',
    };
    const inserted = CustomerRepo.create(customer);
    EventBus.emit('customer.created', inserted);
    return inserted;
  }

  function update(id, patch, operatorId) {
    const before = CustomerRepo.find(id);
    if (!before) return null;
    const updated = CustomerRepo.update(id, patch);

    // 记录变更
    const changes = [];
    Object.keys(patch).forEach(k => {
      if (before[k] !== updated[k] && typeof patch[k] !== 'object') {
        changes.push({ field: k, fieldLabel: k, oldValue: before[k], newValue: updated[k] });
      }
    });
    if (changes.length > 0) {
      ChangeLogRepo.create({
        recordType: 'customer',
        recordId: id,
        changeCategory: 'direct_edit',
        changes,
        operatorId: operatorId || 'unknown',
        operatorName: '操作员',
        operatedAt: Utils.now(),
        reason: '客户信息修改',
      });
    }
    EventBus.emit('customer.updated', updated);
    return updated;
  }

  function freeze(id, reason, operatorId) {
    return update(id, { status: 'frozen' }, operatorId);
  }

  function activate(id, operatorId) {
    return update(id, { status: 'active' }, operatorId);
  }

  // ---------- 关联数据 ----------

  /** 获取客户的全部相关单据(详情页用) */
  function getRelatedRecords(customerId) {
    return {
      quotations: [],   // quotation 模块已废弃
      salesOrders: SalesOrderRepo.list({ customerId }, { sortBy: 'orderDate', order: 'desc' }),
      deliveries: DeliveryRepo.list({ customerId }, { sortBy: 'deliveryDate', order: 'desc' }),
      settlements: SettlementRepo.list({ customerId }, { sortBy: 'settlementDate', order: 'desc' }),
    };
  }

  return {
    list,
    listArchived,
    findById,
    search,
    recalculate,
    getCreditUsage,
    checkCredit,
    lockShipment,
    unlockShipment,
    create,
    update,
    freeze,
    activate,
    getRelatedRecords,
  };
})();

window.CustomerService = CustomerService;
