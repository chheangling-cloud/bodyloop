/**
 * 订单 Timeline 聚合服务
 * @module services/orderTimelineService
 *
 * 把订单生命周期上所有事件聚合成一条时间线。
 * 数据来源(全部已存在):
 *   - quotation (报价接受)
 *   - salesOrder (创建、状态变化)
 *   - changeLogs (状态变化、附录、收款等)
 *   - appendix (订单修改)
 *   - delivery (发货、签收、运输异常)
 *   - settlement (创建、确认、收款)
 *
 * 不存独立表,实时聚合。
 *
 * 节点类型:
 *   quotation_accepted   报价接受
 *   order_created        订单创建
 *   order_confirmed      订单确认
 *   status_change        状态推进(其他)
 *   appendix             订单修改
 *   delivery             发货
 *   delivery_signed      签收
 *   delivery_grouped     三车凑齐
 *   delivery_exception   运输异常
 *   settlement_created   结算创建
 *   settlement_confirmed 财务确认
 *   payment              收款
 *   risk                 风险/警告
 *   exception            异常
 *   file                 文件上传(mock)
 *   completed            订单完结
 */

const OrderTimelineService = (function () {
  'use strict';

  // 严重程度颜色映射
  const SEVERITY = {
    quotation_accepted:   'success',
    order_created:        'info',
    order_confirmed:      'success',
    status_change:        'neutral',
    appendix:             'warning',
    delivery:             'info',
    delivery_signed:      'success',
    delivery_grouped:     'warning',
    delivery_exception:   'danger',
    settlement_created:        'info',
    settlement_auto_triggered: 'info',
    settlement_force_triggered:'warning',
    settlement_overdue:        'danger',
    settlement_confirmed:      'success',
    payment:              'success',
    risk:                 'danger',
    exception:            'danger',
    file:                 'neutral',
    completed:            'success',
    // 仓储事件
    inbound_created:      'info',
    inbound_confirmed:    'success',
    inbound_cancelled:    'neutral',
    stock_consumed:       'info',
    stock_locked:         'info',
    stock_released:       'neutral',
  };

  /**
   * 构建订单的完整 timeline
   * @param {string} orderId
   * @returns {Array} 事件数组(按时间正序)
   */
  function buildTimeline(orderId) {
    const order = SalesOrderRepo.find(orderId);
    if (!order) return [];

    const events = [];

    // 1. (报价接受已废弃)

    // 2. 订单创建
    events.push(_makeEvent({
      type: 'order_created',
      timestamp: order.createdAt,
      title: I18n.get() === 'zh-CN' ? `订单创建 ${order.no}` : `Order Created ${order.no}`,
      description: I18n.get() === 'zh-CN'
        ? `创建订单,金额 ${Utils.formatMoney(order.totalAmount)},含 ${(order.items || []).length} 个明细`
        : `Order created, amount ${Utils.formatMoney(order.totalAmount)}, ${(order.items || []).length} items`,
      relatedId: order.id,
      relatedType: 'salesOrder',
      metadata: { amount: order.totalAmount, itemCount: (order.items || []).length },
      operator: _resolveOperator(order.salesmanId || order.salesPersonId || order.createdBy),
      attachments: _mockAttachments('order_created', order.no, 'order', order.id),
    }));

    // 3. 订单状态变化(从 changeLogs 提取)
    const orderLogs = ChangeLogRepo.list({
      recordType: 'salesOrder',
      recordId: order.id,
    });
    orderLogs.forEach(log => {
      const change = log.changes?.[0] || {};
      if (change.field === 'status') {
        const oldS = change.oldValue;
        const newS = change.newValue;
        // 跳过噪音 event:初始 null→draft 不必显示给用户
        // 也跳过 oldS 为空的(从无到有的 creation 已经在 order_created 显示)
        if (!oldS || oldS === 'null' || (oldS == null && newS === 'draft')) return;

        // 特殊状态:确认 / 完成 单独 type
        let type = 'status_change';
        let title;
        if (newS === 'confirmed') {
          type = 'order_confirmed';
          title = I18n.get() === 'zh-CN' ? '订单确认' : 'Order Confirmed';
        } else if (newS === 'completed') {
          type = 'completed';
          title = I18n.get() === 'zh-CN' ? '订单完结' : 'Order Completed';
        } else {
          title = I18n.get() === 'zh-CN'
            ? `状态变化:${_statusLabel(oldS)} → ${_statusLabel(newS)}`
            : `Status Change: ${_statusLabel(oldS)} → ${_statusLabel(newS)}`;
        }
        events.push(_makeEvent({
          type,
          timestamp: log.operatedAt,
          title,
          description: log.reason || '',
          metadata: { statusBefore: oldS, statusAfter: newS },
          operator: _resolveOperator(log.operatorId),
        }));
      }
    });

    // 4. (订单修改已废弃 — appendix 模块已移除,用 changeLog 反推)

    // 5. 发货(创建 / 签收 / 异常)
    const deliveries = DeliveryRepo.list({ salesOrderId: order.id });
    deliveries.forEach(d => {
      // 5a. 发货创建
      events.push(_makeEvent({
        type: 'delivery',
        timestamp: d.createdAt || d.deliveryDate + 'T08:00:00.000Z',
        title: I18n.get() === 'zh-CN' ? `发货 ${d.no}` : `Delivery ${d.no}`,
        description: I18n.get() === 'zh-CN'
          ? `车次 #${d.customerTruckSequence} · ${d.truckNo || '-'} · ${d.driverName || '-'} · ${Utils.formatMoney(d.totalAmount)}`
          : `Truck #${d.customerTruckSequence} · ${d.truckNo || '-'} · ${d.driverName || '-'} · ${Utils.formatMoney(d.totalAmount)}`,
        relatedId: d.id,
        relatedType: 'delivery',
        metadata: {
          amount: d.totalAmount,
          truckNo: d.truckNo,
          driverName: d.driverName,
          customerTruckSeq: d.customerTruckSequence,
          credit: d.creditCheckResult,
        },
        operator: _resolveOperator(d.createdBy),
        attachments: _mockAttachments('delivery', d.no, 'delivery', d.id),
      }));

      // 5b. 信用警告(如果是强制发货)
      if (d.creditCheckResult?.forced || d.creditCheckResult?.level === 'warning') {
        events.push(_makeEvent({
          type: 'risk',
          timestamp: d.createdAt || d.deliveryDate + 'T08:01:00.000Z',
          title: I18n.get() === 'zh-CN' ? '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M8 1.5 L14.5 13.5 H1.5 Z"/><line x1="8" y1="6.5" x2="8" y2="9.5"/><line x1="8" y1="11.5" x2="8" y2="11.6"/></svg> 信用警告' : '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M8 1.5 L14.5 13.5 H1.5 Z"/><line x1="8" y1="6.5" x2="8" y2="9.5"/><line x1="8" y1="11.5" x2="8" y2="11.6"/></svg> Credit Warning',
          description: I18n.get() === 'zh-CN'
            ? `本次发货后客户欠款 ${Utils.formatMoney(d.creditCheckResult.debtAfter)} / ${Utils.formatMoney(d.creditCheckResult.creditLimit)} (${Math.round(d.creditCheckResult.debtAfter / d.creditCheckResult.creditLimit * 100)}%)`
            : `After this delivery, customer debt ${Utils.formatMoney(d.creditCheckResult.debtAfter)} / ${Utils.formatMoney(d.creditCheckResult.creditLimit)} (${Math.round(d.creditCheckResult.debtAfter / d.creditCheckResult.creditLimit * 100)}%)`,
          metadata: { credit: d.creditCheckResult },
          operator: { id: 'system', name: I18n.get() === 'zh-CN' ? '系统' : 'System', role: 'auto' },
        }));
      }

      // 5c. 签收
      if (d.signedAt) {
        events.push(_makeEvent({
          type: 'delivery_signed',
          timestamp: d.signedAt,
          title: I18n.get() === 'zh-CN' ? `签收 ${d.no}` : `Signed ${d.no}`,
          description: I18n.get() === 'zh-CN'
            ? `签收人:${d.signedBy || '-'}`
            : `Signed by ${d.signedBy || '-'}`,
          relatedId: d.id,
          relatedType: 'delivery',
          operator: _resolveOperator(d.signedBy ? null : d.createdBy),
          attachments: _mockAttachments('delivery_signed', d.no, 'delivery', d.id),
        }));

        // 5c-2. 库存消耗(根据 stockMovementIds 推断,仅签收后才有)
        const consumeMovements = (d.stockMovementIds || [])
          .map(mid => StockMovementRepo.find(mid))
          .filter(m => m && m.movementType === 'sale_out');
        if (consumeMovements.length > 0) {
          const totalQty = consumeMovements.reduce((s, m) => s + Math.abs(m.quantity || 0), 0);
          const matIds = [...new Set(consumeMovements.map(m => m.materialId))];
          events.push(_makeEvent({
            type: 'stock_consumed',
            timestamp: new Date(new Date(d.signedAt).getTime() + 60000).toISOString(),
            title: I18n.get() === 'zh-CN' ? `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M2 5 L8 2 L14 5 L8 8 Z"/><path d="M2 5 V11 L8 14 V8"/><path d="M14 5 V11 L8 14"/></svg> 库存出库 ${d.no}` : `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M2 5 L8 2 L14 5 L8 8 Z"/><path d="M2 5 V11 L8 14 V8"/><path d="M14 5 V11 L8 14"/></svg> Stock Out ${d.no}`,
            description: I18n.get() === 'zh-CN'
              ? `${matIds.length} 个物料 · 共 ${totalQty} 件出库`
              : `${matIds.length} item(s) · ${totalQty} units shipped`,
            relatedId: d.id,
            relatedType: 'delivery',
            metadata: { totalQty, matCount: matIds.length, movementIds: consumeMovements.map(m=>m.id) },
            operator: { id: 'system', name: I18n.get()==='zh-CN'?'系统':'System', role: 'system', department: '' },
          }));
        }
      }

      // 5d. 三车凑齐
      if (d.settlementStatus === 'grouped' || d.settlementStatus === 'settled') {
        // 这条放在凑齐的那一刻(取最后一车的 createdAt)
        // 不每条发货都放,只放分组的最后一条
        if (d.settlementGroupNo > 0) {
          // 这是同一组里最后(累计车次最大)的发货,加一条
          const sameGroup = deliveries.filter(x =>
            x.settlementGroupNo === d.settlementGroupNo &&
            x.settlementStatus !== 'pending'
          );
          if (sameGroup.length > 0) {
            const lastInGroup = sameGroup.sort((a, b) =>
              b.customerTruckSequence - a.customerTruckSequence
            )[0];
            if (lastInGroup.id === d.id) {
              events.push(_makeEvent({
                type: 'delivery_grouped',
                timestamp: d.createdAt || d.deliveryDate + 'T18:00:00.000Z',
                title: I18n.get() === 'zh-CN'
                  ? `三车凑齐 · 结算组 #${d.settlementGroupNo}`
                  : `Group Filled · Settlement #${d.settlementGroupNo}`,
                description: I18n.get() === 'zh-CN'
                  ? `已凑齐 ${sameGroup.length} 车,等待财务确认`
                  : `${sameGroup.length} trucks grouped, awaiting finance`,
                metadata: { groupNo: d.settlementGroupNo, truckCount: sameGroup.length },
                operator: { id: 'system', name: I18n.get() === 'zh-CN' ? '系统' : 'System', role: 'auto' },
              }));
            }
          }
        }
      }

      // 5e. 运输异常
      if (d.transportStatus === 'exception') {
        events.push(_makeEvent({
          type: 'delivery_exception',
          timestamp: d.updatedAt || d.createdAt,
          title: I18n.get() === 'zh-CN' ? `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M8 1.5 L14.5 13.5 H1.5 Z"/><line x1="8" y1="6.5" x2="8" y2="9.5"/><line x1="8" y1="11.5" x2="8" y2="11.6"/></svg> 运输异常 ${d.no}` : `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M8 1.5 L14.5 13.5 H1.5 Z"/><line x1="8" y1="6.5" x2="8" y2="9.5"/><line x1="8" y1="11.5" x2="8" y2="11.6"/></svg> Transport Exception ${d.no}`,
          description: d.remark || '',
          relatedId: d.id,
          relatedType: 'delivery',
          operator: _resolveOperator(d.createdBy),
        }));
      }
    });

    // 6. 结算(创建 / 确认 / 收款)
    const settlements = SettlementRepo.list()
      .filter(s => (s.salesOrderIds || []).includes(order.id));
    settlements.forEach(s => {
      // 6a. 结算创建(根据 triggerType 区分 auto / forced / manual)
      const trigger = s.triggerType || 'manual';
      let createType = 'settlement_created';
      let titlePrefix;
      let descExtra = '';
      const isZh = I18n.get() === 'zh-CN';

      if (trigger === 'auto') {
        createType = 'settlement_auto_triggered';
        titlePrefix = isZh ? '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><rect x="2.5" y="5" width="11" height="9" rx="1.5"/><circle cx="6" cy="9" r="0.5" fill="currentColor"/><circle cx="10" cy="9" r="0.5" fill="currentColor"/></svg> 自动触发结算' : '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><rect x="2.5" y="5" width="11" height="9" rx="1.5"/><circle cx="6" cy="9" r="0.5" fill="currentColor"/><circle cx="10" cy="9" r="0.5" fill="currentColor"/></svg> Auto-triggered Settlement';
        descExtra = s.triggerReason
          ? (isZh ? ` · 触发条件:${s.triggerReason}` : ` · Trigger: ${s.triggerReason}`)
          : '';
      } else if (trigger === 'forced') {
        createType = 'settlement_force_triggered';
        titlePrefix = isZh ? '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M5 8 V3.5 a1.25 1.25 0 0 1 2.5 0 V8 M7.5 7 V2.5 a1.25 1.25 0 0 1 2.5 0 V8 M10 7 V3.5 a1.25 1.25 0 0 1 2.5 0 V11 a4 4 0 0 1 -7 2"/></svg> 财务手动提前' : '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M5 8 V3.5 a1.25 1.25 0 0 1 2.5 0 V8 M7.5 7 V2.5 a1.25 1.25 0 0 1 2.5 0 V8 M10 7 V3.5 a1.25 1.25 0 0 1 2.5 0 V11 a4 4 0 0 1 -7 2"/></svg> Force-settled by Finance';
        descExtra = s.triggerReason
          ? (isZh ? ` · 原因:${s.triggerReason}` : ` · Reason: ${s.triggerReason}`)
          : '';
      } else {
        titlePrefix = isZh ? '结算创建' : 'Settlement Created';
      }

      events.push(_makeEvent({
        type: createType,
        timestamp: s.createdAt || s.settlementDate + 'T09:00:00.000Z',
        title: `${titlePrefix} ${s.no}`,
        description: (isZh
          ? `${s.truckCount} 车 · 应收 ${Utils.formatMoney(s.payableAmount)}`
          : `${s.truckCount} trucks · ${Utils.formatMoney(s.payableAmount)}`) + descExtra,
        relatedId: s.id,
        relatedType: 'settlement',
        metadata: {
          amount: s.payableAmount,
          truckCount: s.truckCount,
          triggerType: trigger,
          triggerReason: s.triggerReason,
          triggerConditions: s.triggerConditions,
        },
        operator: _resolveOperator(s.createdBy),
        attachments: _mockAttachments('settlement_created', s.no, 'settlement', s.id),
      }));

      // 6b. 财务确认
      if (s.confirmedAt) {
        events.push(_makeEvent({
          type: 'settlement_confirmed',
          timestamp: s.confirmedAt,
          title: I18n.get() === 'zh-CN' ? `财务确认 ${s.no}` : `Finance Confirmed ${s.no}`,
          description: I18n.get() === 'zh-CN'
            ? `到期日 ${Utils.formatDate(s.dueDate)}`
            : `Due ${Utils.formatDate(s.dueDate)}`,
          relatedId: s.id,
          relatedType: 'settlement',
          metadata: { amount: s.payableAmount, dueDate: s.dueDate },
          operator: _resolveOperator(s.confirmedBy),
          attachments: _mockAttachments('settlement_confirmed', s.no, 'settlement', s.id),
        }));
      }

      // 6b-2. 逾期事件(如果当前 status === overdue 且 dueDate 已过)
      if (s.status === 'overdue' && s.dueDate) {
        const overdueDays = Math.max(0, Math.floor((Date.now() - new Date(s.dueDate).getTime()) / 86400000));
        events.push(_makeEvent({
          type: 'settlement_overdue',
          timestamp: s.dueDate + 'T00:00:00.000Z',
          title: I18n.get() === 'zh-CN' ? `⏰ ${s.no} 已逾期` : `⏰ ${s.no} Overdue`,
          description: I18n.get() === 'zh-CN'
            ? `逾期 ${overdueDays} 天 · 未收 ${Utils.formatMoney(s.unpaidAmount || s.payableAmount)}`
            : `${overdueDays} day(s) overdue · ${Utils.formatMoney(s.unpaidAmount || s.payableAmount)} unpaid`,
          relatedId: s.id,
          relatedType: 'settlement',
          metadata: { overdueDays, unpaid: s.unpaidAmount },
          operator: { id: 'system', name: I18n.get() === 'zh-CN' ? '系统' : 'System', role: 'auto' },
        }));
      }

      // 6c. 收款(每笔单独一个事件)
      (s.payments || []).forEach(p => {
        events.push(_makeEvent({
          type: 'payment',
          timestamp: p.paymentDate + 'T10:00:00.000Z',
          title: I18n.get() === 'zh-CN' ? `收款 ${Utils.formatMoney(p.amount)}` : `Payment ${Utils.formatMoney(p.amount)}`,
          description: I18n.get() === 'zh-CN'
            ? `结算单 ${s.no} · ${_methodLabel(p.method)}${p.reference ? ' · ' + p.reference : ''}`
            : `Settlement ${s.no} · ${_methodLabel(p.method)}${p.reference ? ' · ' + p.reference : ''}`,
          relatedId: s.id,
          relatedType: 'settlement',
          metadata: { amount: p.amount, method: p.method, reference: p.reference },
          operator: _resolveOperator(p.operatorId),
          attachments: _mockAttachments('payment', p.paymentId || s.no, 'settlement', s.id),
        }));
      });
    });

    // 按时间排序
    events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // 计算每个事件与上一个的时间差,加入 description 后
    for (let i = 1; i < events.length; i++) {
      events[i].timeSinceLast = _timeDiff(events[i - 1].timestamp, events[i].timestamp);
    }

    // 给所有事件统一打上订单号 + 订单 ID(可在 UI 显示订单标识)
    events.forEach(e => {
      e.orderId = order.id;
      e.orderNo = order.no;
    });

    return events;
  }

  /** 提取节点的所有附件 */
  function getAttachments(orderId) {
    const events = buildTimeline(orderId);
    const all = [];
    events.forEach(e => {
      (e.attachments || []).forEach(a => {
        all.push({ ...a, eventType: e.type, eventTitle: e.title, eventTimestamp: e.timestamp });
      });
    });
    return all;
  }

  // ========== 私有 ==========

  function _makeEvent(opts) {
    const evt = {
      id: `tl_${Utils.uuid().slice(0, 8)}`,
      type: opts.type,
      severity: SEVERITY[opts.type] || 'neutral',
      timestamp: opts.timestamp,
      title: opts.title || '',
      description: opts.description || '',
      relatedId: opts.relatedId || null,
      relatedType: opts.relatedType || null,
      metadata: opts.metadata || {},
      operator: opts.operator || null,
      attachments: opts.attachments || [],
      // ===== 订单关联(让 timeline 事件能反推所属订单)=====
      orderId: opts.orderId || null,
      orderNo: opts.orderNo || null,
    };
    // ===== Workflow 预埋字段 =====
    if (typeof WorkflowMapper !== 'undefined') {
      const wf = WorkflowMapper.deriveTimelineMeta(evt);
      evt.actorRole    = wf.actorRole;
      evt.actionType   = wf.actionType;
      evt.stepKey      = wf.stepKey;
      evt.stepStatus   = wf.stepStatus;
      evt.workflowKey  = wf.workflowKey;
    } else {
      // 兜底
      evt.actorRole   = opts.operator?.role || 'system';
      evt.actionType  = opts.type;
      evt.stepKey     = null;
      evt.stepStatus  = 'completed';
      evt.workflowKey = 'standard_order';
    }
    return evt;
  }

  function _resolveOperator(operatorId) {
    const isZh = I18n.get() === 'zh-CN';
    if (!operatorId || operatorId === 'system' || operatorId === 'unknown') {
      return { id: 'system', name: isZh ? '系统' : 'System', role: 'system', department: '' };
    }
    const emp = (typeof EmployeeRepo !== 'undefined') ? EmployeeRepo.find(operatorId) : null;
    if (!emp) {
      return { id: operatorId, name: isZh ? '系统' : 'System', role: 'system', department: '' };
    }
    return {
      id: emp.id,
      name: emp.name,
      role: emp.role || (typeof Roles !== 'undefined' ? Roles.inferFromEmployeeId(operatorId) : 'system'),
      department: emp.department || '',
    };
  }

  function _statusLabel(value) {
    return tEnum('salesOrder', 'statusEnum', value);
  }

  function _methodLabel(value) {
    return tEnum('settlement', 'paymentMethodEnum', value);
  }

  /** 展开 appendix.changes 对象为统一数组 */
  function _flattenAppendixChanges(changes) {
    const arr = [];
    (changes.itemModifications || []).forEach(m => {
      arr.push({
        type: 'modify',
        field: m.field,
        lineId: m.lineId,
        materialName: m.materialName,
        oldValue: m.oldValue,
        newValue: m.newValue,
      });
    });
    (changes.addedItems || []).forEach(a => {
      arr.push({ type: 'add', materialName: a.materialName, qty: a.qty, unitPrice: a.unitPrice });
    });
    (changes.removedItems || []).forEach(r => {
      arr.push({ type: 'remove', materialName: r.materialName, lineId: r.lineId });
    });
    if (changes.deliveryDate) {
      arr.push({ type: 'modify', field: 'deliveryDate', oldValue: changes.deliveryDate.oldValue, newValue: changes.deliveryDate.newValue });
    }
    if (changes.paymentTerm) {
      arr.push({ type: 'modify', field: 'paymentTerm', oldValue: changes.paymentTerm.oldValue, newValue: changes.paymentTerm.newValue });
    }
    return arr;
  }

  function _timeDiff(from, to) {
    const ms = new Date(to) - new Date(from);
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(ms / 3600000);
    const days = Math.floor(ms / 86400000);
    const isZh = I18n.get() === 'zh-CN';
    if (days >= 1) return isZh ? `${days} 天后` : `${days} day(s) later`;
    if (hours >= 1) return isZh ? `${hours} 小时后` : `${hours} hour(s) later`;
    if (minutes >= 1) return isZh ? `${minutes} 分钟后` : `${minutes} min later`;
    return isZh ? '同时' : 'same moment';
  }

  // ========== Mock 附件 ==========

  /**
   * 给不同类型事件生成 mock 附件
   * PDF 是占位,图片用 placeholder.com 或本地 base64 简单灰块
   */
  /**
   * 从 AttachmentService 真查附件。
   * 同时兼容旧 mock 行为:如果该实体确实没有真附件,返回空数组(不再造假数据)
   *
   * @param {string} eventType - 'order_created' | 'delivery' | 'payment' 等(用于过滤,可选)
   * @param {string} ref       - 实体 ID 或单号(实体 ID 优先,单号会做兜底匹配)
   * @param {string} entityType - 'order' | 'delivery' | 'settlement' | 'task' | 'payment'
   * @param {string} entityId   - 实体的真 ID
   */
  function _mockAttachments(eventType, ref, entityType, entityId) {
    // 优先用 entityType + entityId 真查 AttachmentService
    if (typeof AttachmentService !== 'undefined' && entityType && entityId) {
      const real = AttachmentService.list({ entityType, entityId });
      return real.map(a => ({
        id: a.id,
        name: a.filename,
        type: a.mimeType?.startsWith('image/') ? 'image' : 'file',
        size: a.size,
        url: a.url,
        previewUrl: a.thumbnailUrl || a.url,
        caption: a.caption,
        uploadedBy: a.uploadedByName,
        real: true,
      }));
    }
    return [];
  }

  return {
    buildTimeline,
    getAttachments,
    SEVERITY,
  };
})();

window.OrderTimelineService = OrderTimelineService;
