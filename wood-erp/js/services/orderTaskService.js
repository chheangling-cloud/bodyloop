/**
 * OrderTaskService - 订单 OA 任务流转引擎
 * @module services/orderTaskService
 *
 * 设计:
 *   每个订单在 OA 流转中始终持有 0-N 个 pending 任务
 *   一个任务被完成 → 自动建下一个任务 → 订单状态推进
 *
 * 状态机:
 *   draft → submit() → pending_price (有低价) / pending_warehouse (正常)
 *   pending_price → approve_price() → pending_warehouse
 *                → reject_price()  → draft (产生 order_revise task)
 *   pending_warehouse → accept_warehouse() → preparing
 *   preparing → ship() → shipped
 *   shipped → create_settlement() → settled
 *   settled → register_payment() → paid
 *
 * Task 数据:
 * {
 *   id, no, orderId, type, status, assignedRole, assigneeId,
 *   createdAt, completedAt, completedBy, completedComment,
 *   rejectedAt, rejectedBy, rejectedReason,
 *   priority, metadata
 * }
 */

const OrderTaskService = (function () {
  'use strict';

  const TABLE = 'orderTasks';

  // ============== 创建任务 ==============

  function create(data) {
    const cur = (typeof Session !== 'undefined') ? Session.snapshot() : { operatorId: 'system' };
    const task = {
      id: `task_${Utils.uuid().slice(0, 8)}`,
      no: `TSK-${Utils.today().replace(/-/g, '')}-${String(OrderTaskRepo.list().length + 1).padStart(4, '0')}`,
      orderId: data.orderId,
      type: data.type,
      status: 'pending',
      assignedRole: data.assignedRole,
      assigneeId: data.assigneeId || null,    // null = 角色内任何人都可接
      priority: data.priority || 'normal',     // urgent | high | normal | low
      title: data.title || '',
      description: data.description || '',
      metadata: data.metadata || {},
      createdAt: Utils.now(),
      createdBy: data.createdBy || cur.operatorId,
      completedAt: null,
      completedBy: null,
      completedComment: null,
      rejectedAt: null,
      rejectedBy: null,
      rejectedReason: null,
    };
    OrderTaskRepo.create(task);

    // 同时发通知
    if (typeof NotificationService !== 'undefined') {
      const typeLabel = (SCHEMAS.orderTask?.typeEnum?.[task.type]?.label) || task.type;
      NotificationService.create({
        targetRole: task.assignedRole,
        type: 'task',
        priority: task.priority === 'urgent' ? 'high' : 'normal',
        title: `${Icon.clipboard(13)} ${typeLabel} 待处理`,
        body: task.title || task.description || `新任务待处理: ${task.no}`,
        link: `#/orders/${task.orderId}`,
        relatedType: 'orderTask',
        relatedId: task.id,
      });
    }

    if (typeof EventBus !== 'undefined') {
      EventBus.emit('orderTask.created', task);
    }
    return task;
  }

  // ============== 完成任务 + 推进状态 ==============

  function complete(taskId, comment, operatorId) {
    const task = OrderTaskRepo.find(taskId);
    if (!task) throw new Error('Task not found');
    if (task.status !== 'pending') throw new Error(`Task already ${task.status}`);
    const cur = (typeof Session !== 'undefined') ? Session.snapshot() : { operatorId: operatorId || 'system' };

    const updated = OrderTaskRepo.update(taskId, {
      status: 'completed',
      completedAt: Utils.now(),
      completedBy: operatorId || cur.operatorId,
      completedComment: comment || '',
    });

    AuditService.log({
      entityType: 'orderTask',
      entityId: taskId,
      action: 'complete',
      reason: comment,
    });

    // 推进订单状态 + 触发下一个 task
    _advance(task);

    EventBus.emit('orderTask.completed', updated);
    return updated;
  }

  function reject(taskId, reason, operatorId) {
    const task = OrderTaskRepo.find(taskId);
    if (!task) throw new Error('Task not found');
    if (task.status !== 'pending') throw new Error(`Task already ${task.status}`);
    if (!reason) throw new Error('驳回必须填写理由');
    const cur = (typeof Session !== 'undefined') ? Session.snapshot() : { operatorId: operatorId || 'system' };

    const updated = OrderTaskRepo.update(taskId, {
      status: 'rejected',
      rejectedAt: Utils.now(),
      rejectedBy: operatorId || cur.operatorId,
      rejectedReason: reason,
    });

    AuditService.log({
      entityType: 'orderTask',
      entityId: taskId,
      action: 'reject',
      reason,
    });

    _onRejected(task, reason);

    EventBus.emit('orderTask.rejected', updated);
    return updated;
  }

  // ============== 状态推进核心(8 步业务链) ==============
  // draft → pending_finance → pending_picking → picking → ready_to_ship
  //        → in_transit → signed → settled → paid

  function _advance(completedTask) {
    const order = SalesOrderRepo.find(completedTask.orderId);
    if (!order) return;

    switch (completedTask.type) {
      case 'finance_approve':
      case 'price_approve': {
        // ✅ 财务通过 → pending_picking + 锁定库存 + 建拣货 task
        _updateOrderStatus(order.id, 'pending_picking');
        // 锁定库存(如果没锁过)
        if (typeof InventoryService !== 'undefined' && InventoryService.lockForOrder) {
          try {
            const lockResult = InventoryService.lockForOrder(order.id, (order.items || []).map(it => ({
              materialId: it.materialId,
              quantity: it.qty - (it.deliveredQty || 0),
            })));
            if (lockResult.shortage && lockResult.shortage.length > 0) {
              const shortMsg = lockResult.shortage.map(s => `${s.materialName} 缺 ${s.short}`).join(', ');
              SalesOrderRepo.update(order.id, {
                stockShortage: lockResult.shortage,
                blockedReason: `库存不足:${shortMsg}`,
              });
            }
          } catch (e) {
            console.warn('[OA] 锁定库存失败:', e.message);
          }
        }
        // 建拣货任务
        create({
          orderId: order.id,
          type: 'warehouse_pick',
          assignedRole: 'warehouse',
          title: `订单 ${order.no} 等待拣货`,
          description: `客户:${(CustomerRepo.find(order.customerId) || {}).name || ''} · 共 ${(order.items || []).length} 项物料`,
          priority: 'normal',
        });
        break;
      }

      case 'warehouse_prepare':
      case 'warehouse_pick': {
        // ✅ 拣货完成 → ready_to_ship + 真实扣库存
        _updateOrderStatus(order.id, 'ready_to_ship');
        _consumeStockForOrder(order, completedTask);
        // 根据预计车次数 N 创建 N 个派车任务
        const plannedTrucks = Math.max(1, Number(order.plannedTruckCount) || 1);
        for (let i = 1; i <= plannedTrucks; i++) {
          create({
            orderId: order.id,
            type: 'warehouse_dispatch',
            assignedRole: 'warehouse',
            title: `订单 ${order.no} 第 ${i}/${plannedTrucks} 车 派车装车`,
            description: `选择车辆、司机,登记发车信息`,
            priority: 'normal',
            metadata: { truckIndex: i, totalTrucks: plannedTrucks },
          });
        }
        break;
      }

      case 'warehouse_dispatch': {
        // ✅ 派车完成 = 已经创建了 delivery + 状态置为 in_transit
        // (实际派车通过 dispatchTruck() 接口实现,见下面)
        // 本 case 只在所有 dispatch 任务完成 / 部分完成时推进订单状态
        _refreshOrderStatusAfterDispatch(order);
        // 为这辆车建签收任务
        create({
          orderId: order.id,
          type: 'delivery_sign',
          assignedRole: 'warehouse',
          title: `订单 ${order.no} 等待签收回单`,
          description: `等待客户签收并上传回单`,
          priority: 'normal',
          metadata: completedTask.metadata,
        });
        break;
      }

      case 'delivery_sign': {
        // ✅ 该车签收完成 → 检查是否所有车都签收
        _refreshOrderStatusAfterSign(order);
        // 如果全部签收,自动建结算任务
        const allSigned = _isAllDeliverySigned(order.id);
        if (allSigned) {
          create({
            orderId: order.id,
            type: 'settlement_create',
            assignedRole: 'finance',
            title: `订单 ${order.no} 等待创建结算单`,
            description: `所有车次已签收,可发起结算`,
            priority: 'normal',
          });
        }
        break;
      }

      case 'warehouse_ship': {
        // 历史兼容:旧 warehouse_ship 仍按老逻辑做(创建 delivery + 立即签收)
        const del = _createDeliveryForOrder(order, completedTask);
        const updated = SalesOrderRepo.find(order.id);
        const totalQty = (updated.items || []).reduce((s, it) => s + (it.qty || 0), 0);
        const shippedQty = (updated.items || []).reduce((s, it) => s + (it.deliveredQty || 0), 0);
        const newStatus = (totalQty > 0 && shippedQty >= totalQty) ? 'signed' : 'in_transit';
        _updateOrderStatus(order.id, newStatus);
        if (newStatus === 'signed') {
          create({
            orderId: order.id,
            type: 'settlement_create',
            assignedRole: 'finance',
            title: `订单 ${order.no} 等待创建结算单`,
            description: `所有车次已签收,可发起结算`,
            priority: 'normal',
          });
        }
        break;
      }

      case 'settlement_create':
        _updateOrderStatus(order.id, 'settled');
        _createSettlementForOrder(order, completedTask);
        create({
          orderId: order.id,
          type: 'payment_register',
          assignedRole: 'finance',
          title: `订单 ${order.no} 等待登记收款`,
          description: `结算单已开,等待客户付款`,
          priority: 'normal',
        });
        break;

      case 'payment_register':
        _updateOrderStatus(order.id, 'paid');
        _registerPaymentForOrder(order, completedTask);
        break;

      case 'order_revise':
        // 销售修改完成 → 重新走提交流程
        break;
    }
  }

  /** 拣货完成时实际扣库存 + 记流水 */
  function _consumeStockForOrder(order, task) {
    if (typeof InventoryService === 'undefined') return;
    const defaultWarehouseId = 'wh_finished';
    (order.items || []).forEach(it => {
      if (!it.materialId) return;
      const qty = (it.qty || 0) - (it.deliveredQty || 0);
      if (qty <= 0) return;
      try {
        if (InventoryService.recordOutbound) {
          InventoryService.recordOutbound({
            materialId: it.materialId,
            warehouseId: defaultWarehouseId,
            quantity: qty,
            movementType: 'pick',
            sourceType: 'order_pick',
            sourceId: order.id,
            sourceNo: order.no,
            force: true,
            remark: `订单 ${order.no} 拣货扣库存(任务 ${task.no || task.id})`,
          }, task.completedBy);
        }
      } catch (e) {
        console.warn('[OA] 拣货扣库存失败:', it.materialName, e.message);
      }
    });
  }

  /** 派车后:如有 delivery 在运输,订单状态 → in_transit */
  function _refreshOrderStatusAfterDispatch(order) {
    if (typeof DeliveryRepo === 'undefined') return;
    const dels = DeliveryRepo.list({ salesOrderId: order.id });
    const anyInTransit = dels.some(d => d.transportStatus === 'in_transit' || d.transportStatus === 'pending');
    if (anyInTransit) {
      _updateOrderStatus(order.id, 'in_transit');
    }
  }

  /** 签收后:全部签收 → signed,否则保持 in_transit/partial */
  function _refreshOrderStatusAfterSign(order) {
    if (typeof DeliveryRepo === 'undefined') return;
    const dels = DeliveryRepo.list({ salesOrderId: order.id });
    if (dels.length === 0) return;
    const allSigned = dels.every(d => d.transportStatus === 'signed');
    const anySigned = dels.some(d => d.transportStatus === 'signed');
    if (allSigned) {
      _updateOrderStatus(order.id, 'signed');
    } else if (anySigned) {
      _updateOrderStatus(order.id, 'in_transit');
    }
  }

  function _isAllDeliverySigned(orderId) {
    if (typeof DeliveryRepo === 'undefined') return false;
    const dels = DeliveryRepo.list({ salesOrderId: orderId });
    if (dels.length === 0) return false;
    return dels.every(d => d.transportStatus === 'signed');
  }

  // ====== 业务数据联动 ======

  function _createDeliveryForOrder(order, task) {
    if (typeof DeliveryService === 'undefined') return null;
    const cust = CustomerRepo.find(order.customerId) || {};
    try {
      const result = DeliveryService.create({
        salesOrderId: order.id,
        salesOrderNo: order.no,
        customerId: order.customerId,
        customerName: cust.name,
        items: (order.items || []).map(it => ({
          lineId: it.lineId,            // ← 关键:传 lineId,否则数量检查失败
          materialId: it.materialId,
          materialName: it.materialName,
          spec: it.spec,
          unit: it.unit,
          qty: it.qty - (it.deliveredQty || 0),
          unitPrice: it.unitPrice,
          amount: (it.qty - (it.deliveredQty || 0)) * it.unitPrice,
        })).filter(it => it.qty > 0),
        deliveryDate: Utils.today(),
        truckNo: 'AUTO-' + Utils.uuid().slice(0, 4).toUpperCase(),
        driverName: '系统自动',
        remark: `OA 流转:由任务 ${task.no || task.id} 自动生成`,
      }, true, task.completedBy);  // forceCredit=true 跳过信用警告
      // DeliveryService.create 返回 {delivery, creditResult, ...},需要解构
      const delivery = result?.delivery || result;
      if (!delivery || !delivery.id) {
        console.warn('[OA] 自动创建发货单返回空');
        return null;
      }
      // 立即标记已签收
      if (DeliveryService.markSigned) {
        try {
          DeliveryService.markSigned(delivery.id, '系统签收', task.completedBy, { force: true });
        } catch(e) {
          console.warn('[OA] 自动签收失败:', e.message);
        }
      }
      return delivery;
    } catch (e) {
      console.warn('[OA] 自动创建发货单失败:', e.message);
      return null;
    }
  }

  function _createSettlementForOrder(order, task) {
    if (typeof SettlementService === 'undefined') return null;
    // 找该订单下未结算的已签收发货单
    const deliveries = DeliveryRepo.list({ salesOrderId: order.id })
      .filter(d => d.transportStatus === 'signed')
      .filter(d => !d.settlementStatus || d.settlementStatus === 'pending' || d.settlementStatus === 'grouped' || d.settlementStatus === 'manual_pending');
    if (deliveries.length === 0) {
      console.warn('[OA] 自动创建结算单失败: 该订单无可结算的发货单');
      return null;
    }
    // 先把这些发货单标记为 manual_pending(允许结算)
    deliveries.forEach(d => {
      if (d.settlementStatus !== 'grouped' && d.settlementStatus !== 'manual_pending') {
        DeliveryRepo.update(d.id, { settlementStatus: 'manual_pending' });
      }
    });
    try {
      const settlement = SettlementService.create({
        customerId: order.customerId,
        customerName: (CustomerRepo.find(order.customerId) || {}).name,
        deliveryIds: deliveries.map(d => d.id),
        settlementDate: Utils.today(),
        creationType: 'manual',
        manualReason: `OA 流转:由任务 ${task.no || task.id} 自动生成`,
        remark: 'OA 自动结算',
      }, task.completedBy);
      // 财务"确认"结算单(变 confirmed,允许收款)
      if (settlement && SettlementService.confirm) {
        try { SettlementService.confirm(settlement.id, task.completedBy); } catch(e) {
          console.warn('[OA] 自动确认结算失败:', e.message);
        }
      }
      return settlement;
    } catch (e) {
      console.warn('[OA] 自动创建结算单失败:', e.message);
      return null;
    }
  }

  function _registerPaymentForOrder(order, task) {
    if (typeof SettlementService === 'undefined') return;
    // 找该订单关联的所有未付清的结算单
    const settlements = SettlementRepo.list()
      .filter(s => (s.salesOrderIds || []).includes(order.id))
      .filter(s => s.status === 'confirmed' || s.status === 'partial_paid' || s.status === 'overdue');
    if (settlements.length === 0) {
      console.warn('[OA] 自动登记收款失败: 该订单无可收款的结算单');
      return;
    }
    settlements.forEach(st => {
      const unpaid = st.unpaidAmount != null
        ? st.unpaidAmount
        : (st.payableAmount || 0) - (st.paidAmount || 0);
      if (unpaid <= 0) return;
      if (SettlementService.addPayment) {
        try {
          SettlementService.addPayment(st.id, {
            amount: unpaid,
            paymentDate: Utils.today(),
            method: 'transfer',
            remark: `OA 流转:由任务 ${task.no || task.id} 自动登记`,
          }, task.completedBy);
        } catch (e) {
          console.warn('[OA] 自动登记收款失败:', e.message);
        }
      }
    });
  }

  function _onRejected(rejectedTask, reason) {
    const order = SalesOrderRepo.find(rejectedTask.orderId);
    if (!order) return;

    // ✅ 财务审批驳回(包括新的 finance_approve 和旧的 price_approve / credit_approve)
    // → 订单回 draft + 建修改 task 给销售
    if (['finance_approve', 'price_approve', 'credit_approve'].includes(rejectedTask.type)) {
      _updateOrderStatus(order.id, 'draft', { rejectedReason: reason, rejectedAt: Utils.now() });
      create({
        orderId: order.id,
        type: 'order_revise',
        assignedRole: 'sales',
        assigneeId: order.salesmanId,  // 指派给原销售
        title: `订单 ${order.no} 被驳回,请修改`,
        description: `驳回理由: ${reason}`,
        priority: 'high',
      });
    }
  }

  function _updateOrderStatus(orderId, newStatus, extra = {}) {
    const before = SalesOrderRepo.find(orderId);
    const oldStatus = before?.status;
    SalesOrderRepo.update(orderId, {
      status: newStatus,
      updatedAt: Utils.now(),
      ...extra,
    });
    // 记录到 ChangeLog,让 Timeline 能读到
    if (oldStatus !== newStatus && typeof ChangeLogRepo !== 'undefined') {
      const cur = (typeof Session !== 'undefined') ? Session.snapshot() : null;
      ChangeLogRepo.create({
        recordType: 'salesOrder',
        recordId: orderId,
        changeCategory: 'status_change',
        changes: [{
          field: 'status',
          fieldLabel: '状态',
          oldValue: oldStatus,
          newValue: newStatus,
        }],
        operatorId: cur?.operatorId || 'system',
        operatorName: cur?.operatorName || '系统',
        operatedAt: Utils.now(),
        reason: `状态变化: ${oldStatus || '-'} → ${newStatus}`,
      });
    }
    EventBus.emit('salesOrder.statusChanged', { orderId, oldStatus, newStatus });
  }

  // ============== 订单提交入口 ==============

  /**
   * 销售员提交订单(从 draft → 进入 OA)
   * @returns {object} 新建的 task
   */
  /**
   * 提交订单 (销售): draft → pending_finance (所有订单必走财务审批)
   * @returns {object} 新建的 task
   */
  function submitOrder(orderId, operatorId) {
    const order = SalesOrderRepo.find(orderId);
    if (!order) throw new Error('订单不存在');
    if (order.status !== 'draft') throw new Error(`订单状态 ${order.status},不能提交`);

    // 检查是否有低价 item (用于提示优先级,不再用于分支)
    const hasLowPrice = _hasLowPrice(order);

    // 取消该订单所有 pending 的 order_revise 任务(销售完成了修改)
    OrderTaskRepo.list({ orderId, status: 'pending', type: 'order_revise' }).forEach(t => {
      OrderTaskRepo.update(t.id, {
        status: 'completed',
        completedAt: Utils.now(),
        completedBy: operatorId,
        completedComment: '销售员重新提交',
      });
    });

    // 防御:清理任何遗留的 pending 业务 task(确保 draft → submit 后只有一个 task)
    // 这覆盖了 schema 升级期间产生的脏数据
    OrderTaskRepo.list({ orderId, status: 'pending' }).forEach(t => {
      if (['warehouse_prepare','warehouse_ship','settlement_create','payment_register','finance_approve','price_approve'].includes(t.type)) {
        OrderTaskRepo.update(t.id, {
          status: 'skipped',
          completedAt: Utils.now(),
          completedBy: 'system',
          completedComment: '订单重新提交,清理遗留任务',
        });
      }
    });

    // ✅ 严格流程:所有订单都必须财务审批,无例外
    _updateOrderStatus(orderId, 'pending_finance');

    let title, description, priority;
    if (hasLowPrice) {
      const lowItems = _getLowItemSummary(order);
      title = `订单 ${order.no} 等待财务审批 [价格异常]`;
      description = lowItems.summary;
      priority = 'high';
    } else {
      title = `订单 ${order.no} 等待财务审批`;
      const cust = CustomerRepo.find(order.customerId) || {};
      description = `客户:${cust.name || ''} · 总额 ${Utils.formatMoney(order.totalAmount)}`;
      priority = 'normal';
    }

    const task = create({
      orderId,
      type: 'finance_approve',
      assignedRole: 'finance',
      title,
      description,
      metadata: hasLowPrice ? { lowItems: _getLowItemSummary(order).items, hasLowPrice: true } : { hasLowPrice: false },
      priority,
    });

    AuditService.log({
      entityType: 'salesOrder',
      entityId: orderId,
      action: 'submit',
      reason: '提交财务审批',
    });

    EventBus.emit('salesOrder.submitted', { orderId, hasLowPrice, task });
    return task;
  }

  // ============== 辅助函数 ==============

  function _hasLowPrice(order) {
    if (typeof ProductService === 'undefined') return false;
    return (order.items || []).some(it => {
      const p = ProductService.findById(it.materialId);
      if (!p) return false;
      return ProductService.priceLevel(it.unitPrice, p) === 'below_min';
    });
  }

  function _getLowItemSummary(order) {
    const items = [];
    let totalDiff = 0;
    (order.items || []).forEach(it => {
      const p = ProductService.findById(it.materialId);
      if (!p) return;
      const level = ProductService.priceLevel(it.unitPrice, p);
      if (level === 'below_min') {
        const diff = p.minPrice - it.unitPrice;
        items.push({
          productName: p.name,
          unit: p.unit,
          qty: it.qty,
          unitPrice: it.unitPrice,
          minPrice: p.minPrice,
          diff,
        });
        totalDiff += diff * (it.qty || 1);
      }
    });
    const summary = `${items.length} 项低于最低价,合计让利 ${Utils.formatMoney(totalDiff)}`;
    return { items, totalDiff, summary };
  }

  // ============== 查询 ==============

  /** 当前订单所有 pending 任务 */
  function getPendingByOrder(orderId) {
    return OrderTaskRepo.list({ orderId, status: 'pending' });
  }

  /** 订单所有任务(含已完成,用于 timeline) */
  function getAllByOrder(orderId) {
    return OrderTaskRepo.list({ orderId })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  /** 我的待办(按角色,按类型分组) */
  function getMyInbox(role, employeeId) {
    const all = OrderTaskRepo.list().filter(t =>
      t.status === 'pending' &&
      t.assignedRole === role &&
      (!t.assigneeId || t.assigneeId === employeeId)
    );
    // 按 type 分组
    const groups = {};
    all.forEach(t => {
      const k = t.type;
      if (!groups[k]) groups[k] = [];
      groups[k].push(t);
    });
    // 排序:urgent → high → normal → low
    const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
    Object.values(groups).forEach(arr => {
      arr.sort((a, b) =>
        (priorityOrder[a.priority] || 9) - (priorityOrder[b.priority] || 9) ||
        new Date(a.createdAt) - new Date(b.createdAt)
      );
    });
    return groups;
  }

  /** 我的待办计数(用于铃铛 / 徽章) */
  function countMyTasks(role, employeeId) {
    return OrderTaskRepo.list().filter(t =>
      t.status === 'pending' &&
      t.assignedRole === role &&
      (!t.assigneeId || t.assigneeId === employeeId)
    ).length;
  }

  function findById(id) {
    return OrderTaskRepo.find(id);
  }

  // ============== 新业务 API:派车装车 + 签收 ==============

  /**
   * 派车装车:完成 warehouse_dispatch 任务
   * @param {string} taskId   warehouse_dispatch 任务 id
   * @param {object} params   { vehicleId, driverName, driverPhone, items: [{lineId, qty}], freight, departAt, remark }
   * @param {string} operatorId
   * @returns {object} { task, delivery }
   */
  function dispatchTruck(taskId, params, operatorId) {
    const task = OrderTaskRepo.find(taskId);
    if (!task) throw new Error('任务不存在');
    if (task.type !== 'warehouse_dispatch') throw new Error('任务类型不是派车');
    if (task.status !== 'pending') throw new Error(`任务状态 ${task.status},不能操作`);
    if (!params.vehicleId) throw new Error('请选择车辆');

    const order = SalesOrderRepo.find(task.orderId);
    if (!order) throw new Error('订单不存在');

    // 取车辆信息
    const vehicle = (typeof VehicleRepo !== 'undefined') ? VehicleRepo.find(params.vehicleId) : null;
    if (!vehicle) throw new Error('车辆不存在');

    // 装车明细:用户传 items,或默认全订单剩余
    let items;
    if (params.items && params.items.length > 0) {
      items = params.items.map(pi => {
        const oi = (order.items || []).find(it => it.lineId === pi.lineId);
        if (!oi) throw new Error(`订单明细 ${pi.lineId} 不存在`);
        return {
          lineId: oi.lineId,
          materialId: oi.materialId,
          materialName: oi.materialName,
          spec: oi.spec || '',
          unit: oi.unit || '',
          qty: Number(pi.qty) || 0,
          unitPrice: oi.unitPrice,
          amount: Math.round((Number(pi.qty) || 0) * oi.unitPrice),
        };
      }).filter(it => it.qty > 0);
    } else {
      // 默认平均分:订单总剩余 / 计划车次数
      const plannedTrucks = Math.max(1, Number(order.plannedTruckCount) || 1);
      const truckIndex = task.metadata?.truckIndex || 1;
      const isLastTruck = truckIndex >= plannedTrucks;
      items = (order.items || []).map(oi => {
        const remaining = (oi.qty || 0) - (oi.deliveredQty || 0);
        if (remaining <= 0) return null;
        // 最后一车装完所有剩余;否则平均分
        const truckQty = isLastTruck
          ? remaining
          : Math.floor(remaining / (plannedTrucks - truckIndex + 1));
        return {
          lineId: oi.lineId,
          materialId: oi.materialId,
          materialName: oi.materialName,
          spec: oi.spec || '',
          unit: oi.unit || '',
          qty: truckQty,
          unitPrice: oi.unitPrice,
          amount: Math.round(truckQty * oi.unitPrice),
        };
      }).filter(it => it && it.qty > 0);
    }

    if (items.length === 0) throw new Error('装车明细为空');

    // 调 DeliveryService.create 真实建发货单
    let delivery = null;
    if (typeof DeliveryService === 'undefined') {
      throw new Error('DeliveryService 未加载');
    }
    const result = DeliveryService.create({
      salesOrderId: order.id,
      salesOrderNo: order.no,
      customerId: order.customerId,
      vehicleId: vehicle.id,
      truckNo: vehicle.plateNumber || vehicle.plateNo || vehicle.truckNo,
      driverName: params.driverName || vehicle.driverName || '',
      driverPhone: params.driverPhone || vehicle.driverPhone || '',
      freight: Number(params.freight) || 0,
      items,
      deliveryDate: params.departAt || Utils.today(),
      transportStatus: 'in_transit',   // ← 派车后即进入运输中
      remark: params.remark || `第 ${task.metadata?.truckIndex || 1} 车 (任务 ${task.no})`,
    }, true, operatorId);

    delivery = result?.delivery || result;
    if (!delivery || !delivery.id) {
      throw new Error('创建发货单失败');
    }

    // 完成任务,挂上 deliveryId
    const updated = OrderTaskRepo.update(taskId, {
      status: 'completed',
      completedAt: Utils.now(),
      completedBy: operatorId,
      completedComment: `派车 ${vehicle.plateNumber || vehicle.plateNo} · 司机 ${params.driverName || vehicle.driverName || '-'}`,
      metadata: { ...task.metadata, deliveryId: delivery.id, vehicleId: vehicle.id },
    });

    AuditService.log({
      entityType: 'orderTask',
      entityId: taskId,
      action: 'dispatch',
      reason: `派车 ${vehicle.plateNumber || vehicle.plateNo}`,
    });

    // 推进订单 + 建签收任务
    _advance(updated);
    EventBus.emit('orderTask.dispatched', { task: updated, delivery });
    return { task: updated, delivery };
  }

  /**
   * 签收回单:完成 delivery_sign 任务
   * @param {string} taskId
   * @param {object} params  { signedBy, signedAt, attachments: [{id, url, name}], remark }
   * @param {string} operatorId
   */
  function signDelivery(taskId, params, operatorId) {
    const task = OrderTaskRepo.find(taskId);
    if (!task) throw new Error('任务不存在');
    if (task.type !== 'delivery_sign') throw new Error('任务类型不是签收');
    if (task.status !== 'pending') throw new Error(`任务状态 ${task.status},不能操作`);

    const deliveryId = task.metadata?.deliveryId;
    if (!deliveryId) throw new Error('任务未关联发货单');

    const delivery = DeliveryRepo.find(deliveryId);
    if (!delivery) throw new Error('发货单不存在');

    // 标签收
    if (DeliveryService.markSigned) {
      try {
        DeliveryService.markSigned(
          deliveryId,
          params.signedBy || '客户',
          operatorId,
          { force: true }
        );
      } catch (e) {
        console.warn('[OA] 签收时扣库存失败(已忽略):', e.message);
      }
    }

    // 上传附件(回单照片)
    if (params.attachments && params.attachments.length > 0 && typeof AttachmentRepo !== 'undefined') {
      params.attachments.forEach(att => {
        try {
          AttachmentRepo.update(att.id, { entityId: deliveryId, entityType: 'delivery' });
        } catch (e) {}
      });
    }

    // 完成任务
    const updated = OrderTaskRepo.update(taskId, {
      status: 'completed',
      completedAt: Utils.now(),
      completedBy: operatorId,
      completedComment: `签收人 ${params.signedBy || '客户'}`,
      metadata: { ...task.metadata, signedBy: params.signedBy, signedAt: params.signedAt || Utils.today() },
    });

    AuditService.log({
      entityType: 'orderTask',
      entityId: taskId,
      action: 'sign',
      reason: `签收发货单 ${delivery.no}`,
    });

    _advance(updated);
    EventBus.emit('orderTask.signed', { task: updated, delivery });
    return { task: updated, delivery };
  }

  return {
    create, complete, reject,
    submitOrder,
    dispatchTruck, signDelivery,
    getPendingByOrder, getAllByOrder,
    getMyInbox, countMyTasks,
    findById,
  };
})();

window.OrderTaskService = OrderTaskService;
