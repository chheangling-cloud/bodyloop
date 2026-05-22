/**
 * 结算策略引擎
 * @module services/settlementPolicyEngine
 *
 * 职责:
 *   - 解析客户的 settlementPolicy
 *   - 评估当前是否应触发结算(车次/天数/金额任意组合)
 *   - 提供"即将触发"预测(每个条件的进度)
 *   - 扫描所有客户(给 UI 用)
 *   - 强制结算(财务手动提前)
 */

const SettlementPolicyEngine = (function () {
  'use strict';

  // ====== 默认策略(老客户兜底)======
  const DEFAULT_POLICY = {
    rules: {
      truckCount:              { enabled: true,  threshold: 3 },
      daysSinceLastSettlement: { enabled: false, threshold: 30 },
      cumulativeAmount:        { enabled: false, threshold: 5000000 },
    },
    mode: 'ANY',
    credit: { limit: 10000000, action: 'warn_force' },
  };

  /**
   * 取客户当前策略,降级到默认
   */
  function getPolicy(customerId) {
    const cust = CustomerRepo.find(customerId);
    if (!cust) return null;
    if (cust.settlementPolicy) {
      return Utils.deepClone(cust.settlementPolicy);
    }
    // 老客户兼容:从老字段构造
    const policy = Utils.deepClone(DEFAULT_POLICY);
    policy.credit.limit = cust.creditLimit || policy.credit.limit;
    policy.credit.action = cust.shipmentLocked ? 'auto_lock' : 'warn_force';
    return policy;
  }

  /**
   * 设置/更新客户策略
   */
  function setPolicy(customerId, newPolicy, operatorId) {
    const cust = CustomerRepo.find(customerId);
    if (!cust) throw new Error('Customer not found');

    const oldPolicy = cust.settlementPolicy ? Utils.deepClone(cust.settlementPolicy) : null;
    cust.settlementPolicy = Utils.deepClone(newPolicy);
    cust.settlementPolicy.updatedAt = Utils.now();
    cust.settlementPolicy.updatedBy = operatorId || 'unknown';

    // 同步老字段(向后兼容)
    if (newPolicy.credit?.limit) {
      cust.creditLimit = newPolicy.credit.limit;
    }

    cust.updatedAt = Utils.now();
    CustomerRepo.update(customerId, cust);

    EventBus.emit('settlementPolicy.updated', {
      customerId, oldPolicy, newPolicy: cust.settlementPolicy, operatorId
    });

    return cust.settlementPolicy;
  }

  /**
   * 评估客户当前是否触发结算
   *
   * @returns {
   *   triggered: boolean,
   *   policy: 当前策略,
   *   conditions: [{ type, enabled, met, value, threshold, label }],
   *   reasons: ['满足:车次 3/3', '满足:30 天'],
   *   eligibleDeliveries: [...],   // 待结算的发货单
   *   progress: 0-100,             // 总体最近触发进度
   * }
   */
  function evaluate(customerId) {
    const policy = getPolicy(customerId);
    if (!policy) {
      return { triggered: false, reasons: ['客户不存在'], conditions: [], eligibleDeliveries: [], progress: 0 };
    }

    // 拿待结算发货
    const eligibleDeliveries = DeliveryRepo.list().filter(d =>
      d.customerId === customerId &&
      d.transportStatus === 'signed' &&
      d.settlementStatus === 'pending'
    );

    if (eligibleDeliveries.length === 0) {
      return {
        triggered: false,
        policy,
        reasons: [],
        conditions: [],
        eligibleDeliveries: [],
        progress: 0,
      };
    }

    // 排序找最早一车(用于"距首车"算天数)
    eligibleDeliveries.sort((a, b) => new Date(a.signedAt || a.deliveryDate) - new Date(b.signedAt || b.deliveryDate));
    const firstDeliveryAt = eligibleDeliveries[0].signedAt || eligibleDeliveries[0].deliveryDate;
    const totalAmount = eligibleDeliveries.reduce((s, d) => s + (d.totalAmount || 0), 0);

    // ===== 评估每个条件 =====
    const conditions = [];

    if (policy.rules.truckCount.enabled) {
      const value = eligibleDeliveries.length;
      const threshold = policy.rules.truckCount.threshold;
      conditions.push({
        type: 'truckCount',
        enabled: true,
        met: value >= threshold,
        value, threshold,
        progress: Math.min(100, Math.round(value / threshold * 100)),
        label: I18n.get() === 'zh-CN'
          ? `车次 ${value}/${threshold}`
          : `Trucks ${value}/${threshold}`,
      });
    }

    if (policy.rules.daysSinceLastSettlement.enabled) {
      const days = Math.floor((Date.now() - new Date(firstDeliveryAt).getTime()) / 86400000);
      const threshold = policy.rules.daysSinceLastSettlement.threshold;
      conditions.push({
        type: 'days',
        enabled: true,
        met: days >= threshold,
        value: days, threshold,
        progress: Math.min(100, Math.round(days / threshold * 100)),
        label: I18n.get() === 'zh-CN'
          ? `天数 ${days}/${threshold} 天`
          : `${days}/${threshold} days`,
      });
    }

    if (policy.rules.cumulativeAmount.enabled) {
      const value = totalAmount;
      const threshold = policy.rules.cumulativeAmount.threshold;
      conditions.push({
        type: 'amount',
        enabled: true,
        met: value >= threshold,
        value, threshold,
        progress: Math.min(100, Math.round(value / threshold * 100)),
        label: I18n.get() === 'zh-CN'
          ? `累计 ${Utils.formatMoney(value)}/${Utils.formatMoney(threshold)}`
          : `Amount ${Utils.formatMoney(value)}/${Utils.formatMoney(threshold)}`,
      });
    }

    if (conditions.length === 0) {
      return {
        triggered: false,
        policy,
        reasons: [I18n.get() === 'zh-CN' ? '无可用条件' : 'No active rule'],
        conditions: [],
        eligibleDeliveries,
        progress: 0,
      };
    }

    // ===== 组合判断 =====
    const triggered = policy.mode === 'ALL'
      ? conditions.every(c => c.met)
      : conditions.some(c => c.met);

    const reasons = conditions.filter(c => c.met).map(c => c.label);

    // 总体进度:ANY 取最高,ALL 取最低
    const progress = policy.mode === 'ALL'
      ? Math.min(...conditions.map(c => c.progress))
      : Math.max(...conditions.map(c => c.progress));

    return {
      triggered,
      policy,
      reasons,
      conditions,
      eligibleDeliveries,
      progress,
      totalAmount,
      firstDeliveryAt,
    };
  }

  /**
   * 自动触发结算(签收时调用)
   * 返回 { settlement, triggered, reason } 或 { triggered: false }
   */
  function tryAutoSettle(customerId, operatorId) {
    const result = evaluate(customerId);
    if (!result.triggered) return { triggered: false, ...result };

    // 找出最早 N 车作为本次结算
    const policy = result.policy;
    const truckRule = policy.rules.truckCount;

    let deliveryIds;
    if (truckRule.enabled && truckRule.threshold > 0) {
      // 按车次阈值切批
      deliveryIds = result.eligibleDeliveries.slice(0, truckRule.threshold).map(d => d.id);
    } else {
      // 没车次限制 → 全部入这次结算
      deliveryIds = result.eligibleDeliveries.map(d => d.id);
    }

    const settlement = _createSettlement({
      customerId,
      deliveryIds,
      triggerType: 'auto',
      triggerReason: result.reasons.join(', '),
      triggerConditions: result.conditions.filter(c => c.met).map(c => c.type),
      operatorId: operatorId || 'system',
    });

    return { triggered: true, settlement, reasons: result.reasons };
  }

  /**
   * 强制结算(财务手动提前)
   */
  function forceSettle(customerId, opts = {}) {
    const reason = (opts.reason || '').trim();
    if (!reason) {
      const err = new Error(I18n.get() === 'zh-CN'
        ? '强制结算必须填写原因'
        : 'Force settlement requires a reason');
      err.code = 'REASON_REQUIRED';
      throw err;
    }
    const eligibleDeliveries = DeliveryRepo.list().filter(d =>
      d.customerId === customerId &&
      d.transportStatus === 'signed' &&
      d.settlementStatus === 'pending'
    );
    if (eligibleDeliveries.length === 0) {
      const err = new Error(I18n.get() === 'zh-CN'
        ? '该客户没有待结算的发货'
        : 'No deliveries to settle');
      err.code = 'NO_ELIGIBLE_DELIVERIES';
      throw err;
    }
    const settlement = _createSettlement({
      customerId,
      deliveryIds: eligibleDeliveries.map(d => d.id),
      triggerType: 'forced',
      triggerReason: reason,
      triggerConditions: ['manual'],
      operatorId: opts.operatorId || 'unknown',
    });
    return { triggered: true, settlement, reason };
  }

  /**
   * 内部:创建结算单(把发货从 pending → grouped,标记 triggerType)
   * 用 SettlementService 但加 triggerType 元信息
   */
  function _createSettlement({ customerId, deliveryIds, triggerType, triggerReason, triggerConditions, operatorId }) {
    // 1. 先把发货单从 pending → grouped(SettlementService.create 只接受 grouped/manual_pending)
    //    用 customerTruckSequence 作 groupNo(和老逻辑一致)
    const deliveries = deliveryIds.map(id => DeliveryRepo.find(id)).filter(Boolean);
    if (deliveries.length === 0) {
      throw new Error('No valid deliveries');
    }
    const groupNo = deliveries[0].customerTruckSequence || Date.now();
    deliveries.forEach(d => {
      if (d.settlementStatus === 'pending') {
        DeliveryRepo.update(d.id, {
          settlementStatus: 'grouped',
          settlementGroupNo: groupNo,
        });
      }
    });

    // 2. 调 SettlementService.create
    const settlement = SettlementService.create({
      customerId,
      deliveryIds,
      creationType: triggerType === 'forced' ? 'manual' : 'auto',
      manualReason: triggerType === 'forced' ? triggerReason : '',
    }, operatorId);

    // 3. 加 triggerType 元信息
    settlement.triggerType = triggerType;
    settlement.triggerReason = triggerReason;
    settlement.triggerConditions = triggerConditions || [];
    SettlementRepo.update(settlement.id, settlement);

    // 4. 把发货标记为 settled(create 内部已经做了,这里二次确保)
    deliveryIds.forEach(did => {
      const d = DeliveryRepo.find(did);
      if (d && d.settlementStatus !== 'settled') {
        d.settlementId = settlement.id;
        DeliveryRepo.update(did, d);
      }
    });

    EventBus.emit('settlement.autoTriggered', {
      settlement, triggerType, triggerReason, customerId
    });

    return settlement;
  }

  /**
   * 扫描所有客户,找出该触发结算的
   * 返回 [{ customerId, customer, evaluation }]
   */
  function scanAll() {
    const customers = CustomerRepo.list().filter(c => c.status === 'active');
    const results = [];
    customers.forEach(c => {
      const evalRes = evaluate(c.id);
      if (evalRes.eligibleDeliveries.length > 0) {
        results.push({ customerId: c.id, customer: c, evaluation: evalRes });
      }
    });
    // 排序:已触发的排前,然后按 progress 降序
    results.sort((a, b) => {
      if (a.evaluation.triggered !== b.evaluation.triggered) {
        return a.evaluation.triggered ? -1 : 1;
      }
      return b.evaluation.progress - a.evaluation.progress;
    });
    return results;
  }

  /**
   * 扫描并自动执行所有该触发的结算(给"批量触发"按钮用)
   */
  function runAutoScan(operatorId) {
    const scan = scanAll();
    const triggered = scan.filter(r => r.evaluation.triggered);
    const results = [];
    triggered.forEach(r => {
      try {
        const res = tryAutoSettle(r.customerId, operatorId);
        if (res.triggered) results.push(res);
      } catch (e) {
        console.error('auto settle failed for', r.customerId, e);
      }
    });
    return results;
  }

  return {
    getPolicy,
    setPolicy,
    evaluate,
    tryAutoSettle,
    forceSettle,
    scanAll,
    runAutoScan,
    DEFAULT_POLICY,
  };
})();

window.SettlementPolicyEngine = SettlementPolicyEngine;
