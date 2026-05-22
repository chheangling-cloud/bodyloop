/**
 * 销售订单业务服务
 * @module services/salesOrderService
 *
 * 核心业务规则:
 * 1. 状态机:draft → confirmed → in_production/preparing → partial_shipped → shipped → settling → completed
 * 2. 订单是销售模块的核心枢纽,关联报价(来源)、附录(变更)、发货(出库)、结算(收款)
 * 3. 已发货的订单不可取消,只能继续推进
 * 4. 订单完结后(completed)不可再操作
 * 5. 订单数量/单价通过附录变更,不能直接改 items
 *    - 通过 confirm() 之后,items 锁定,只能由 AppendixService 修改
 */

const SalesOrderService = (function () {
  'use strict';

  const TABLE = 'salesOrders';

  // ========== 查询 ==========

  function list(query = {}, options = {}) {
    const opts = { sortBy: 'orderDate', order: 'desc', ...options };
    return SalesOrderRepo.list(query, opts);
  }

  function findById(id) {
    return SalesOrderRepo.find(id);
  }

  /** 综合搜索 */
  function search({ keyword, customerId, status, dateFrom, dateTo } = {}) {
    let rows = SalesOrderRepo.list({}, { sortBy: 'orderDate', order: 'desc' });
    if (keyword) {
      rows = rows.filter(o => {
        const cust = CustomerRepo.find(o.customerId);
        return Utils.fuzzyMatch(o.no, keyword) ||
               Utils.fuzzyMatch(cust?.name, keyword) ||
               Utils.fuzzyMatch(cust?.shortName, keyword);
      });
    }
    if (customerId) rows = rows.filter(o => o.customerId === customerId);
    if (status) rows = rows.filter(o => o.status === status);
    if (dateFrom) rows = rows.filter(o => o.orderDate >= dateFrom);
    if (dateTo)   rows = rows.filter(o => o.orderDate <= dateTo);
    return rows;
  }

  /** 获取订单的全部关联数据(详情页用) */
  function getRelatedRecords(orderId) {
    const order = findById(orderId);
    if (!order) return null;
    return {
      order,
      customer: CustomerRepo.find(order.customerId),
      quotation: null,   // quotation 模块已废弃
      appendices: [],   // appendix 模块已废弃
      deliveries: DeliveryRepo.list({ salesOrderId: orderId }, { sortBy: 'deliveryDate', order: 'desc' }),
      settlements: order.deliveryIds?.length
        ? _findSettlementsForOrder(orderId)
        : [],
    };
  }

  function _findSettlementsForOrder(orderId) {
    // 一个订单可能关联多个结算单(三车一结跨订单)
    return SettlementRepo.list().filter(s =>
      Array.isArray(s.salesOrderIds) && s.salesOrderIds.includes(orderId)
    );
  }

  // ========== 计算 ==========

  function calculateAmounts(items, taxRate) {
    const subtotal = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0);
    const taxAmount = Math.round(subtotal * (Number(taxRate) || 0) / 100);
    return { subtotal, taxAmount, totalAmount: subtotal + taxAmount };
  }

  function calculateLineAmount(qty, unitPrice) {
    return Math.round((Number(qty) || 0) * (Number(unitPrice) || 0));
  }

  /** 重算订单的发货进度(从 deliveries 表反推) */
  function recalculateProgress(orderId) {
    const order = findById(orderId);
    if (!order) return null;

    const deliveries = DeliveryRepo.list({ salesOrderId: orderId });
    const shippedAmount = Utils.sum(deliveries, 'totalAmount');

    // 每个明细行的 deliveredQty 也要重算
    const items = order.items.map(it => {
      let delivered = 0;
      deliveries.forEach(d => {
        const matched = (d.items || []).find(di => di.lineId === it.lineId);
        if (matched) delivered += Number(matched.qty) || 0;
      });
      return { ...it, deliveredQty: delivered };
    });

    const shippedQty = items.reduce((s, it) => s + (it.deliveredQty || 0), 0);

    return SalesOrderRepo.update(orderId, { items, shippedAmount, shippedQty });
  }

  // ========== CRUD ==========

  /** 直接创建空订单(草稿) */
  function create(data, operatorId) {
    if (!data.customerId) throw new Error('customerId required');
    const items = (data.items || []).map(it => _normalizeItem(it));
    const taxRate = data.taxRate !== undefined ? Number(data.taxRate) : 13;
    const { subtotal, taxAmount, totalAmount } = calculateAmounts(items, taxRate);

    // 业务员 ID:兼容多种字段名 (salesmanId / salesPersonId / salesId)
    const salesman = data.salesmanId || data.salesPersonId || data.salesId || operatorId || '';
    const creator  = operatorId || salesman || 'unknown';

    const no = IdGenerator.next('salesOrder');
    const order = {
      no,
      quotationId: data.quotationId || null,
      customerId: data.customerId,
      orderDate: data.orderDate || Utils.today(),
      deliveryDate: data.deliveryDate || Utils.addDays(Utils.today(), 14),
      plannedTruckCount: Math.max(1, Number(data.plannedTruckCount) || 1),
      items,
      subtotal,
      taxRate,
      taxAmount,
      totalAmount,
      originalTotalAmount: totalAmount,
      appendixIds: [],
      deliveryIds: [],
      status: 'draft',
      shippedQty: 0,
      shippedAmount: 0,
      settledAmount: 0,
      salesmanId: salesman,
      remark: data.remark || '',
      createdBy: creator,
    };
    const inserted = SalesOrderRepo.create(order);
    _logChange(inserted.id, 'status_change', null, 'draft', creator, '创建订单');
    EventBus.emit('salesOrder.created', inserted);
    return inserted;
  }

  /** 编辑订单(仅草稿可改 items;其他状态只能改少数字段) */
  function update(id, patch, operatorId) {
    const before = findById(id);
    if (!before) return null;
    if (before.status === 'completed' || before.status === 'cancelled') {
      throw new Error('已完结或已取消的订单不可修改');
    }
    if (before.status !== 'draft' && patch.items) {
      throw new Error('非草稿状态的订单不能直接改明细,请用附录');
    }

    if (patch.items) {
      patch.items = patch.items.map(it => _normalizeItem(it));
      const taxRate = patch.taxRate !== undefined ? Number(patch.taxRate) : before.taxRate;
      const { subtotal, taxAmount, totalAmount } = calculateAmounts(patch.items, taxRate);
      patch.subtotal = subtotal;
      patch.taxAmount = taxAmount;
      patch.totalAmount = totalAmount;
      patch.taxRate = taxRate;
      // 草稿时 originalTotalAmount 跟着变
      if (before.status === 'draft') patch.originalTotalAmount = totalAmount;
    }

    const updated = SalesOrderRepo.update(id, patch);
    EventBus.emit('salesOrder.updated', updated);
    return updated;
  }

  function _normalizeItem(it) {
    return {
      lineId: it.lineId || `oi_${Utils.uuid().slice(0, 8)}`,
      materialId: it.materialId,
      materialName: it.materialName,
      spec: it.spec || '',
      unit: it.unit || '',
      qty: Number(it.qty) || 0,
      originalQty: it.originalQty !== undefined ? it.originalQty : (Number(it.qty) || 0),
      deliveredQty: it.deliveredQty || 0,
      unitPrice: Number(it.unitPrice) || 0,
      originalUnitPrice: it.originalUnitPrice !== undefined ? it.originalUnitPrice : (Number(it.unitPrice) || 0),
      amount: calculateLineAmount(it.qty, it.unitPrice),
      remark: it.remark || '',
    };
  }

  // ========== 状态机动作 ==========

  /** 草稿 → 已确认(锁定 items) */
  function confirm(id, operatorId) {
    const order = findById(id);
    if (!order) throw new Error('Order not found');
    if (order.status !== 'draft') throw new Error(`当前状态(${order.status})不允许确认`);
    if (!order.items || order.items.length === 0) throw new Error('订单至少需要 1 行明细');
    if (!order.customerId) throw new Error('请选择客户');

    const updated = SalesOrderRepo.update(id, { status: 'confirmed' });
    _logChange(id, 'status_change', 'draft', 'confirmed', operatorId, '确认订单');

    // 联动:锁定库存(Phase 3)
    if (typeof InventoryService !== 'undefined' && InventoryService.lockForOrder) {
      try {
        const result = InventoryService.lockForOrder(id, order.items.map(it => ({
          materialId: it.materialId,
          quantity: it.qty || it.quantity || 0,
        })));
        if (result.shortage.length > 0) {
          console.warn(`订单 ${order.no} 库存不足:`, result.shortage);
          // 把短缺信息挂到订单上,UI 可以查询
          SalesOrderRepo.update(id, {
            stockShortage: result.shortage,
            blockedReason: I18n.get()==='zh-CN' 
              ? `库存不足:${result.shortage.map(s => s.materialName + ' 缺 ' + s.short).join(', ')}`
              : `Stock shortage: ${result.shortage.map(s => s.materialName + ' short ' + s.short).join(', ')}`,
          });
          EventBus.emit('salesOrder.stockShortage', { order: updated, shortage: result.shortage });
        } else {
          // 完全锁住,清除可能存在的旧 blockedReason
          SalesOrderRepo.update(id, { stockShortage: null, blockedReason: null });
        }
      } catch (e) {
        console.error('lockForOrder failed:', e);
      }
    }

    EventBus.emit('salesOrder.confirmed', updated);
    return updated;
  }

  /** 已确认 → 生产中 */
  function startProduction(id, operatorId) {
    const order = findById(id);
    if (!order) throw new Error('Order not found');
    if (order.status !== 'confirmed') throw new Error(`当前状态(${order.status})不允许进入生产`);
    const updated = SalesOrderRepo.update(id, { status: 'in_production' });
    _logChange(id, 'status_change', 'confirmed', 'in_production', operatorId, '开始生产');
    EventBus.emit('salesOrder.production_started', updated);
    return updated;
  }

  /** 已确认 / 生产中 → 备货中 */
  function startPreparing(id, operatorId) {
    const order = findById(id);
    if (!order) throw new Error('Order not found');
    if (!['confirmed', 'in_production'].includes(order.status)) {
      throw new Error(`当前状态(${order.status})不允许进入备货`);
    }
    const updated = SalesOrderRepo.update(id, { status: 'preparing' });
    _logChange(id, 'status_change', order.status, 'preparing', operatorId, '开始备货');
    EventBus.emit('salesOrder.preparing', updated);
    return updated;
  }

  /**
   * 由发货模块调用:发货后自动推进订单状态
   * 注意:不是手动操作,而是 DeliveryService.create 时自动调
   */
  function applyDelivery(orderId, operatorId) {
    const updated = recalculateProgress(orderId);
    if (!updated) return null;

    // 根据已发货量更新状态
    const totalQty = updated.items.reduce((s, it) => s + (it.qty || 0), 0);
    const shippedQty = updated.shippedQty || 0;
    let newStatus = updated.status;

    if (shippedQty >= totalQty && totalQty > 0) {
      // 全部发完
      if (['confirmed', 'in_production', 'preparing', 'partial_shipped'].includes(updated.status)) {
        newStatus = 'shipped';
      }
    } else if (shippedQty > 0) {
      // 部分发货
      if (['confirmed', 'in_production', 'preparing'].includes(updated.status)) {
        newStatus = 'partial_shipped';
      }
    }

    if (newStatus !== updated.status) {
      const after = SalesOrderRepo.update(orderId, { status: newStatus });
      _logChange(orderId, 'status_change', updated.status, newStatus, operatorId || 'system', '发货推进');
      EventBus.emit('salesOrder.statusAdvanced', after);
      return after;
    }
    return updated;
  }

  /** 由结算模块调用:开始结算 */
  function startSettling(id, operatorId) {
    const order = findById(id);
    if (!order) return null;
    if (order.status === 'shipped' || order.status === 'partial_shipped') {
      const updated = SalesOrderRepo.update(id, { status: 'settling' });
      _logChange(id, 'status_change', order.status, 'settling', operatorId || 'system', '进入结算');
      EventBus.emit('salesOrder.settling', updated);
      return updated;
    }
    return order;
  }

  /** 完结订单(结算全部完成后) */
  function markCompleted(id, operatorId) {
    const order = findById(id);
    if (!order) throw new Error('Order not found');
    if (order.status === 'completed') return order;
    if (!['shipped', 'settling', 'partial_shipped'].includes(order.status)) {
      throw new Error(`当前状态(${order.status})不允许完结`);
    }
    const updated = SalesOrderRepo.update(id, { status: 'completed' });
    _logChange(id, 'status_change', order.status, 'completed', operatorId, '订单完结');
    EventBus.emit('salesOrder.completed', updated);
    return updated;
  }

  /** 取消订单 */
  function cancel(id, reason, operatorId) {
    const order = findById(id);
    if (!order) throw new Error('Order not found');
    if (['completed', 'cancelled'].includes(order.status)) {
      throw new Error('已完结或已取消的订单不可再取消');
    }
    if (order.shippedAmount > 0) {
      throw new Error('已有发货的订单不可取消,请先处理发货');
    }
    if (!reason) throw new Error('请填写取消原因');

    const updated = SalesOrderRepo.update(id, { status: 'cancelled', remark: `[已取消] ${reason}` });
    _logChange(id, 'status_change', order.status, 'cancelled', operatorId, reason);

    // 联动:释放该订单所有库存锁定(Phase 3)
    if (typeof InventoryService !== 'undefined' && InventoryService.releaseForOrder) {
      try {
        InventoryService.releaseForOrder(id, `订单取消: ${reason}`);
      } catch (e) {
        console.error('releaseForOrder failed:', e);
      }
    }

    EventBus.emit('salesOrder.cancelled', updated);
    return updated;
  }

  /** 删除(仅草稿) */
  function remove(id, operatorId) {
    const order = findById(id);
    if (!order) return false;
    if (order.status !== 'draft') throw new Error('只有草稿状态可以删除');
    SalesOrderRepo.remove(id);
    _logChange(id, 'status_change', 'draft', 'deleted', operatorId, '删除');
    EventBus.emit('salesOrder.deleted', { id });
    return true;
  }

  // ========== 工具 ==========

  /** 检查订单是否还能再发货 */
  function canDeliver(orderId) {
    const order = findById(orderId);
    if (!order) return { ok: false, reason: 'Order not found' };
    if (['draft', 'completed', 'cancelled'].includes(order.status)) {
      return { ok: false, reason: `订单状态 ${order.status} 不能发货` };
    }
    const remaining = order.items.reduce((s, it) => s + Math.max(0, (it.qty || 0) - (it.deliveredQty || 0)), 0);
    if (remaining <= 0) return { ok: false, reason: '订单数量已全部发完' };
    return { ok: true, remainingQty: remaining };
  }

  /** 获取明细行的剩余可发数量 */
  function getRemainingQty(orderId) {
    const order = findById(orderId);
    if (!order) return {};
    const remaining = {};
    order.items.forEach(it => {
      remaining[it.lineId] = Math.max(0, (it.qty || 0) - (it.deliveredQty || 0));
    });
    return remaining;
  }

  // ========== 私有 ==========

  function _logChange(recordId, category, oldValue, newValue, operatorId, reason) {
    ChangeLogRepo.create({
      recordType: 'salesOrder',
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
    list, findById, search, getRelatedRecords,
    calculateAmounts, calculateLineAmount, recalculateProgress,
    create, update, remove,
    confirm, startProduction, startPreparing,
    applyDelivery, startSettling, markCompleted, cancel,
    canDeliver, getRemainingQty,
  };
})();

window.SalesOrderService = SalesOrderService;
