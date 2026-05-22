/**
 * 发货业务服务
 * @module services/deliveryService
 *
 * 核心业务规则:
 * 1. 仅 confirmed/in_production/preparing/partial_shipped/shipped 状态的订单可发货
 * 2. 发货数量不能超过剩余可发数量(qty - deliveredQty)
 * 3. 创建时:信用检查 → 客户欠款总额 + 本次金额 > 信用额度 → 警告
 *    业务可强制发货,但客户会被锁定(shipmentLocked=true)
 * 4. 创建后立即:
 *    a. 调用 SalesOrderService.applyDelivery 推进订单状态
 *    b. 三车一结自动分组检查
 *    c. CustomerService.recalculate 重算客户风险
 * 5. 客户级累计车次号:全局递增,跨订单累计(三车一结的核心)
 * 6. 已结算(settled)的发货不可删除/修改
 */

const DeliveryService = (function () {
  'use strict';

  const TABLE = 'deliveries';

  // ========== 查询 ==========

  function list(query = {}, options = {}) {
    const opts = { sortBy: 'deliveryDate', order: 'desc', ...options };
    return DeliveryRepo.list(query, opts);
  }

  function findById(id) {
    return DeliveryRepo.find(id);
  }

  function findByOrder(orderId) {
    return DeliveryRepo.list({ salesOrderId: orderId }, { sortBy: 'deliveryDate', order: 'desc' });
  }

  function findByCustomer(customerId) {
    return DeliveryRepo.list({ customerId }, { sortBy: 'deliveryDate', order: 'desc' });
  }

  function search({ keyword, customerId, salesOrderId, settlementStatus, transportStatus, dateFrom, dateTo } = {}) {
    let rows = DeliveryRepo.list({}, { sortBy: 'deliveryDate', order: 'desc' });
    if (keyword) {
      rows = rows.filter(d => {
        const cust = CustomerRepo.find(d.customerId);
        const order = SalesOrderRepo.find(d.salesOrderId);
        return Utils.fuzzyMatch(d.no, keyword) ||
               Utils.fuzzyMatch(d.truckNo, keyword) ||
               Utils.fuzzyMatch(d.driverName, keyword) ||
               Utils.fuzzyMatch(cust?.name, keyword) ||
               Utils.fuzzyMatch(order?.no, keyword);
      });
    }
    if (customerId) rows = rows.filter(d => d.customerId === customerId);
    if (salesOrderId) rows = rows.filter(d => d.salesOrderId === salesOrderId);
    if (settlementStatus) rows = rows.filter(d => d.settlementStatus === settlementStatus);
    if (transportStatus) rows = rows.filter(d => d.transportStatus === transportStatus);
    if (dateFrom) rows = rows.filter(d => d.deliveryDate >= dateFrom);
    if (dateTo) rows = rows.filter(d => d.deliveryDate <= dateTo);
    return rows;
  }

  // ========== 信用检查 ==========

  /**
   * 创建发货前的信用检查
   * @returns { passed, level: 'ok'|'warning'|'blocked', debtBefore, debtAfter, creditLimit, overflow }
   */
  function checkCredit(customerId, deliveryAmount) {
    const cust = CustomerRepo.find(customerId);
    if (!cust) return { passed: false, level: 'blocked', reason: 'Customer not found' };

    // 已锁定:必须先解锁
    if (cust.shipmentLocked) {
      return {
        passed: false,
        level: 'blocked',
        reason: cust.lockedReason || '客户发货已锁定',
        debtBefore: cust.currentDebt + cust.pendingDeliveryAmount,
        debtAfter: cust.currentDebt + cust.pendingDeliveryAmount + deliveryAmount,
        creditLimit: cust.creditLimit,
      };
    }

    const debtBefore = (cust.currentDebt || 0) + (cust.pendingDeliveryAmount || 0);
    const debtAfter = debtBefore + deliveryAmount;
    const limit = cust.creditLimit || 0;

    let level = 'ok';
    if (limit > 0 && debtAfter > limit) {
      level = 'warning'; // 警告但可强制
    }
    return {
      passed: level !== 'blocked',
      level,
      debtBefore,
      debtAfter,
      creditLimit: limit,
      overflow: Math.max(0, debtAfter - limit),
      usage: limit > 0 ? Math.round((debtAfter / limit) * 100) : 0,
    };
  }

  // ========== 计算 ==========

  function calculateTotal(items) {
    return items.reduce((s, it) => s + ((Number(it.qty) || 0) * (Number(it.unitPrice) || 0)), 0);
  }

  /** 获取客户下一个累计车次号 */
  function _nextCustomerTruckSequence(customerId) {
    const all = DeliveryRepo.list({ customerId });
    const max = all.reduce((m, d) => Math.max(m, d.customerTruckSequence || 0), 0);
    return max + 1;
  }

  /** 获取订单下一个车次号 */
  function _nextOrderTruckSequence(salesOrderId) {
    const all = DeliveryRepo.list({ salesOrderId });
    const max = all.reduce((m, d) => Math.max(m, d.orderTruckSequence || 0), 0);
    return max + 1;
  }

  // ========== CRUD ==========

  /**
   * 创建发货单
   * @param {object} data
   * @param {boolean} forceCredit 是否强制(信用警告时)
   * @returns {object} { delivery, creditResult, groupedDeliveries, locked }
   */
  function create(data, forceCredit, operatorId) {
    if (!data.salesOrderId) throw new Error('请选择订单');
    if (!data.customerId) throw new Error('请选择客户');
    const order = SalesOrderRepo.find(data.salesOrderId);
    if (!order) throw new Error('订单不存在');

    // 订单状态检查 — 加入新 9 状态机的可发货状态
    const allowedStatuses = [
      'confirmed','in_production','preparing','partial_shipped','shipped',  // 历史兼容
      'ready_to_ship','in_transit','picking','signed',                       // 新状态
    ];
    if (!allowedStatuses.includes(order.status)) {
      throw new Error(`订单状态 ${order.status} 不允许发货`);
    }

    // 明细检查
    const items = (data.items || []).filter(it => it.qty > 0).map(it => ({
      lineId: it.lineId,
      materialId: it.materialId,
      materialName: it.materialName,
      spec: it.spec || '',
      unit: it.unit || '',
      qty: Number(it.qty) || 0,
      unitPrice: Number(it.unitPrice) || 0,
      amount: Math.round((Number(it.qty) || 0) * (Number(it.unitPrice) || 0)),
    }));
    if (items.length === 0) throw new Error('请至少选择 1 行发货明细');

    // 数量检查:不能超过剩余可发
    const remaining = SalesOrderService.getRemainingQty(order.id);
    const errors = [];
    items.forEach(it => {
      const max = remaining[it.lineId] || 0;
      if (it.qty > max) {
        errors.push(`${it.materialName}: 本次发 ${it.qty} 超过剩余 ${max}`);
      }
    });
    if (errors.length > 0) throw new Error(errors.join('; '));

    const totalAmount = calculateTotal(items);

    // 信用检查
    const creditResult = checkCredit(data.customerId, totalAmount);
    if (creditResult.level === 'blocked') {
      throw new Error(`信用检查未通过: ${creditResult.reason}`);
    }
    if (creditResult.level === 'warning' && !forceCredit) {
      // 不能直接创建,返回警告让调用方决定
      const err = new Error('CREDIT_WARNING');
      err.creditResult = creditResult;
      throw err;
    }

    const customerTruckSequence = _nextCustomerTruckSequence(data.customerId);
    const orderTruckSequence = _nextOrderTruckSequence(data.salesOrderId);

    const no = IdGenerator.next('delivery');
    const delivery = {
      no,
      salesOrderId: data.salesOrderId,
      customerId: data.customerId,
      deliveryDate: data.deliveryDate || Utils.today(),
      truckNo: data.truckNo || '',
      driverName: data.driverName || '',
      driverPhone: data.driverPhone || '',
      customerTruckSequence,
      orderTruckSequence,
      items,
      totalAmount,
      settlementGroupNo: 0,
      settlementStatus: 'pending',
      settlementId: null,
      transportStatus: data.transportStatus || 'pending',
      signedAt: null,
      signedBy: null,
      creditCheckResult: {
        passed: creditResult.passed,
        level: creditResult.level,
        debtBefore: creditResult.debtBefore,
        debtAfter: creditResult.debtAfter,
        creditLimit: creditResult.creditLimit,
        forced: forceCredit === true,
      },
      remark: data.remark || '',
      createdBy: operatorId || 'unknown',
    };

    const inserted = DeliveryRepo.create(delivery);

    // 关联到订单
    const updatedOrder = SalesOrderRepo.find(order.id);
    SalesOrderRepo.update(order.id, {
      deliveryIds: Array.from(new Set([...(updatedOrder.deliveryIds || []), inserted.id]))
    });

    // 推进订单
    SalesOrderService.applyDelivery(order.id, operatorId);

    // 三车一结分组检查
    const groupedDeliveries = _checkAndApplyGrouping(data.customerId);

    // 客户重算 + 自动锁定检查
    const lockResult = _checkAndLockCustomer(data.customerId, forceCredit);

    EventBus.emit('delivery.created', { delivery: inserted, creditResult, groupedDeliveries, lockResult });

    return {
      delivery: DeliveryRepo.find(inserted.id),
      creditResult,
      groupedDeliveries,
      locked: lockResult.locked,
    };
  }

  /** 编辑发货单(限非已结算) */
  function update(id, patch, operatorId) {
    const before = findById(id);
    if (!before) return null;
    if (before.settlementStatus === 'settled') {
      throw new Error('已结算的发货单不可修改');
    }
    if (before.settlementStatus === 'grouped' && patch.items) {
      throw new Error('已凑齐的发货单不可改明细,请先打散结算组');
    }
    const updated = DeliveryRepo.update(id, patch);
    EventBus.emit('delivery.updated', updated);
    return updated;
  }

  /** 标记签收 */
  function markSigned(id, signedBy, operatorId, options = {}) {
    const d = findById(id);
    if (!d) throw new Error('Not found');
    if (d.transportStatus === 'signed') return d;

    const force = options.force === true;
    const stockMovements = [];

    if (window.InventoryService) {
      // 优先用新的联动:消耗预占锁(Phase 3)
      if (InventoryService.consumeForDelivery && d.salesOrderId) {
        try {
          const movements = InventoryService.consumeForDelivery(
            d.id,
            d.salesOrderId,
            (d.items || []).map(it => ({
              materialId: it.materialId,
              quantity: it.qty || it.quantity || 0,
            }))
          );
          movements.forEach(m => stockMovements.push(m.id));
        } catch (e) {
          console.error('consumeForDelivery failed, fallback to recordOutbound:', e);
        }
      }

      // 兜底:如果新逻辑没生成任何流水(锁定不够或异常),用老路径
      if (stockMovements.length === 0) {
        const defaultWarehouseId = options.warehouseId || 'wh_finished';
        const shortages = [];
        for (const item of (d.items || [])) {
          if (!item.materialId) continue;
          const inv = InventoryService.getInventory(item.materialId, defaultWarehouseId);
          const available = inv?.quantity || 0;
          if (item.qty > available) {
            shortages.push({
              materialId: item.materialId,
              materialName: item.materialName,
              requested: item.qty,
              available,
              shortage: item.qty - available,
            });
          }
        }

        if (shortages.length > 0 && !force) {
          const err = new Error('STOCK_INSUFFICIENT');
          err.code = 'STOCK_INSUFFICIENT';
          err.shortages = shortages;
          throw err;
        }

        for (const item of (d.items || [])) {
          if (!item.materialId) continue;
          const result = InventoryService.recordOutbound({
            materialId: item.materialId,
            warehouseId: defaultWarehouseId,
            quantity: item.qty,
            movementType: 'sales_out',
            sourceType: 'delivery',
            sourceId: d.id,
            sourceNo: d.no,
            force,
            remark: `客户 ${d.customerId} 发货 ${d.no}`,
          }, operatorId);
          stockMovements.push(result.movement.id);
        }
      }
    }

    const updated = DeliveryRepo.update(id, {
      transportStatus: 'signed',
      signedAt: Utils.now(),
      signedBy: signedBy || '客户',
      stockMovementIds: stockMovements,
    });
    EventBus.emit('delivery.signed', updated);
    return updated;
  }

  /** 标记运输中 */
  function startTransport(id, operatorId) {
    const d = findById(id);
    if (!d) throw new Error('Not found');
    if (d.transportStatus !== 'pending') throw new Error(`当前运输状态(${d.transportStatus})不允许此操作`);
    const updated = DeliveryRepo.update(id, { transportStatus: 'in_transit' });
    EventBus.emit('delivery.in_transit', updated);
    return updated;
  }

  /** 标记异常 */
  function markException(id, reason, operatorId) {
    const updated = DeliveryRepo.update(id, {
      transportStatus: 'exception',
      remark: reason ? `[异常] ${reason}` : `[异常]`,
    });
    EventBus.emit('delivery.exception', updated);
    return updated;
  }

  /** 删除发货单(限 pending 状态) */
  function remove(id, operatorId) {
    const d = findById(id);
    if (!d) return false;
    if (d.settlementStatus !== 'pending') {
      throw new Error('已分组/已结算的发货单不可删除');
    }
    if (d.transportStatus === 'signed') {
      throw new Error('已签收的发货单不可删除');
    }
    const orderId = d.salesOrderId;
    const customerId = d.customerId;

    DeliveryRepo.remove(id);

    // 从订单中移除
    const order = SalesOrderRepo.find(orderId);
    if (order) {
      SalesOrderRepo.update(orderId, {
        deliveryIds: (order.deliveryIds || []).filter(did => did !== id)
      });
    }

    // 重算订单进度
    SalesOrderService.applyDelivery(orderId, operatorId);

    // 重算客户
    if (window.CustomerService) CustomerService.recalculate(customerId);

    EventBus.emit('delivery.deleted', { id });
    return true;
  }

  // ========== 三车一结分组 ==========

  /**
   * 检查并应用结算分组
   * 委派给 SettlementPolicyEngine 评估每客户的策略:
   *   - 评估满足任意条件 → 标记 grouped
   *   - 不满足 → 保持 pending
   *
   * 注意:本函数只标记分组,不创建结算单。创建结算单在 PolicyEngine.tryAutoSettle 或 UI 触发。
   */
  function _checkAndApplyGrouping(customerId) {
    const cust = CustomerRepo.find(customerId);
    if (!cust) return [];

    // 没有 PolicyEngine 时降级到老逻辑(向后兼容)
    if (typeof SettlementPolicyEngine === 'undefined') {
      return _checkAndApplyGroupingLegacy(customerId);
    }

    const result = SettlementPolicyEngine.evaluate(customerId);
    if (!result.triggered) return [];

    // 找出本批要分组的发货:
    //   有车次条件 → 按车次阈值切批
    //   无车次条件 → 全部入这批
    const policy = result.policy;
    const truckRule = policy.rules.truckCount;
    let toGroup;
    if (truckRule.enabled && truckRule.threshold > 0) {
      toGroup = result.eligibleDeliveries.slice(0, truckRule.threshold);
    } else {
      toGroup = result.eligibleDeliveries;
    }

    if (toGroup.length === 0) return [];

    const groupNo = toGroup[0].customerTruckSequence;
    const groupedDeliveries = [];
    toGroup.forEach(item => {
      DeliveryRepo.update(item.id, {
        settlementStatus: 'grouped',
        settlementGroupNo: groupNo,
      });
      groupedDeliveries.push(DeliveryRepo.find(item.id));
    });
    EventBus.emit('delivery.grouped', {
      customerId,
      groupNo,
      deliveries: toGroup,
      triggerReasons: result.reasons,
      triggerType: 'auto',
    });

    return groupedDeliveries;
  }

  /**
   * 老的固定 3 车一结逻辑(降级用)
   */
  function _checkAndApplyGroupingLegacy(customerId) {
    const cust = CustomerRepo.find(customerId);
    if (!cust || cust.settlementRule?.mode !== 'three_truck_one_settle') return [];

    const rule = cust.settlementRule;
    const truckThreshold = rule.truckThreshold || 3;
    const amountThreshold = rule.amountThreshold || 0;
    const triggerLogic = rule.triggerLogic || 'any';

    const pending = DeliveryRepo.list({ customerId, settlementStatus: 'pending' })
      .sort((a, b) => a.customerTruckSequence - b.customerTruckSequence);

    if (pending.length === 0) return [];

    const groupedDeliveries = [];
    let accumulator = [];
    let accumAmount = 0;

    for (const d of pending) {
      accumulator.push(d);
      accumAmount += d.totalAmount;

      const truckMet = accumulator.length >= truckThreshold;
      const amountMet = amountThreshold > 0 && accumAmount >= amountThreshold;
      let trigger = false;
      if (triggerLogic === 'all') {
        trigger = truckMet && (amountThreshold === 0 || amountMet);
      } else {
        trigger = truckMet || amountMet;
      }

      if (trigger) {
        const groupNo = accumulator[0].customerTruckSequence;
        accumulator.forEach(item => {
          DeliveryRepo.update(item.id, {
            settlementStatus: 'grouped',
            settlementGroupNo: groupNo,
          });
          groupedDeliveries.push(DeliveryRepo.find(item.id));
        });
        EventBus.emit('delivery.grouped', { customerId, groupNo, deliveries: accumulator });
        accumulator = [];
        accumAmount = 0;
      }
    }

    return groupedDeliveries;
  }

  /**
   * 手动结算:把订单结束但车次不足的 pending 发货标记为 manual_pending
   * 触发场景:订单完结但只发了 1 车,需要财务手动结算
   */
  function markForManualSettlement(customerId, salesOrderId, reason, operatorId) {
    const pendingForOrder = DeliveryRepo.list({
      customerId,
      salesOrderId,
      settlementStatus: 'pending'
    });
    if (pendingForOrder.length === 0) return [];

    if (!reason) throw new Error('请填写手动结算原因');

    const updated = [];
    pendingForOrder.forEach(d => {
      const u = DeliveryRepo.update(d.id, {
        settlementStatus: 'manual_pending',
        remark: d.remark ? `${d.remark} | 手动结算: ${reason}` : `手动结算: ${reason}`,
      });
      updated.push(u);
    });

    EventBus.emit('delivery.markedForManual', { customerId, salesOrderId, deliveries: updated });
    return updated;
  }

  // ========== 客户锁定检查 ==========

  function _checkAndLockCustomer(customerId, forced) {
    if (!window.CustomerService) return { locked: false };
    CustomerService.recalculate(customerId);

    const cust = CustomerRepo.find(customerId);
    if (!cust) return { locked: false };

    const exposure = (cust.currentDebt || 0) + (cust.pendingDeliveryAmount || 0);

    // 已经锁定就不重复锁
    if (cust.shipmentLocked) return { locked: true, alreadyLocked: true };

    // 超信用额度 → 自动锁定
    if (cust.creditLimit > 0 && exposure > cust.creditLimit) {
      const overflow = exposure - cust.creditLimit;
      const reason = `欠款总额 $${(exposure/100).toLocaleString()} 超出信用额度 $${(cust.creditLimit/100).toLocaleString()},超额 $${(overflow/100).toLocaleString()}`;
      CustomerService.lockShipment(customerId, reason, 'system');
      return { locked: true, justLocked: true, reason };
    }

    return { locked: false };
  }

  // ========== 工具:获取「可发货」订单列表 ==========

  function getDeliverableOrders(customerId) {
    let orders = SalesOrderService.list();
    if (customerId) orders = orders.filter(o => o.customerId === customerId);
    return orders.filter(o => {
      if (!['confirmed','in_production','preparing','partial_shipped'].includes(o.status)) return false;
      // 还有剩余可发数量
      const remaining = (o.items || []).reduce((s, it) =>
        s + Math.max(0, (it.qty || 0) - (it.deliveredQty || 0)), 0);
      return remaining > 0;
    });
  }

  return {
    list, findById, findByOrder, findByCustomer, search,
    checkCredit, calculateTotal,
    create, update, remove,
    markSigned, startTransport, markException,
    markForManualSettlement,
    getDeliverableOrders,
  };
})();

window.DeliveryService = DeliveryService;
