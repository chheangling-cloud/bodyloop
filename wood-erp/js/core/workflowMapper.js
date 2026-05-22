/**
 * Workflow Mapper - 工作流步骤映射
 * @module core/workflowMapper
 *
 * 这就是我们的轻量级 workflow 系统。
 *
 * 设计哲学:
 *   - LITE ERP 不需要可配置的 workflow engine
 *   - 木材厂只有一种订单流程,没人会去拖拉拽配置审批节点
 *   - 直接硬编码业务流程,简单 100 倍,可读 100 倍
 *
 * 组成(三个文件已构成完整工作流):
 *   - workflowMapper.js       (本文件) - 节点定义 / 显示映射 / 步骤推断
 *   - services/orderTaskService.js     - 状态机推进 / task 创建 / 审批
 *   - services/approvalService.js      - 审批节点的请求/批准/驳回
 *
 * 新增节点:统一改 OrderTaskService._advance() 一处。
 *
 * 字段约定:
 *   - status:业务状态(状态机管)
 *   - currentStep:工作流步骤(粗粒度,跨角色)
 *   - requiredRole:谁能推进
 *   - blockedReason:为啥卡住
 */

const WorkflowMapper = (function () {
  'use strict';

  // ===== 标准订单工作流定义 =====
  const ORDER_STEPS = {
    // step key → { label, role, severity }
    'sales_create':      { labelZh: '销售创建',   labelEn: 'Sales: Create',      role: 'sales',     severity: 'neutral' },
    'sales_confirm':     { labelZh: '销售确认',   labelEn: 'Sales: Confirm',     role: 'sales',     severity: 'info' },
    'warehouse_prep':    { labelZh: '仓储备货',   labelEn: 'Warehouse: Prepare', role: 'warehouse', severity: 'info' },
    'warehouse_ship':    { labelZh: '仓储发货',   labelEn: 'Warehouse: Ship',    role: 'warehouse', severity: 'info' },
    'delivery_transit':  { labelZh: '运输中',     labelEn: 'In Transit',         role: 'warehouse', severity: 'info' },
    'delivery_signed':   { labelZh: '客户签收',   labelEn: 'Customer Signed',    role: 'system',    severity: 'success' },
    'finance_review':    { labelZh: '财务审核',   labelEn: 'Finance: Review',    role: 'finance',   severity: 'warning' },
    'finance_confirmed': { labelZh: '财务已确认', labelEn: 'Finance: Confirmed', role: 'finance',   severity: 'info' },
    'finance_collected': { labelZh: '已收款',     labelEn: 'Collected',          role: 'finance',   severity: 'success' },
    'order_completed':   { labelZh: '订单完结',   labelEn: 'Order Completed',    role: 'system',    severity: 'success' },
    'order_cancelled':   { labelZh: '订单取消',   labelEn: 'Order Cancelled',    role: 'system',    severity: 'neutral' },
    'order_exception':   { labelZh: '订单异常',   labelEn: 'Order Exception',    role: 'manager',   severity: 'danger' },
  };

  // ===== 结算工作流 =====
  const SETTLEMENT_STEPS = {
    'settle_create':      { labelZh: '结算创建',   labelEn: 'Settlement Created', role: 'system',  severity: 'info' },
    'finance_review':     { labelZh: '财务审核',   labelEn: 'Finance: Review',    role: 'finance', severity: 'warning' },
    'finance_confirmed':  { labelZh: '已确认',     labelEn: 'Confirmed',          role: 'finance', severity: 'info' },
    'collecting':         { labelZh: '催收中',     labelEn: 'Collecting',         role: 'finance', severity: 'warning' },
    'collected':          { labelZh: '已收齐',     labelEn: 'Collected',          role: 'finance', severity: 'success' },
    'overdue':            { labelZh: '已逾期',     labelEn: 'Overdue',            role: 'finance', severity: 'danger' },
  };

  // ===== 发货工作流 =====
  const DELIVERY_STEPS = {
    'created':       { labelZh: '已创建',   labelEn: 'Created',     role: 'sales',     severity: 'neutral' },
    'preparing':     { labelZh: '备货中',   labelEn: 'Preparing',   role: 'warehouse', severity: 'info' },
    'in_transit':    { labelZh: '运输中',   labelEn: 'In Transit',  role: 'warehouse', severity: 'info' },
    'signed':        { labelZh: '已签收',   labelEn: 'Signed',      role: 'system',    severity: 'success' },
    'exception':     { labelZh: '异常',     labelEn: 'Exception',   role: 'manager',   severity: 'danger' },
  };

  /**
   * 从订单 status 推 workflow step
   * 老订单状态 → 新 step 映射
   */
  function deriveOrderStep(order) {
    if (!order) return null;

    const status = order.status;
    let currentStep, requiredRole, blockedReason = null;

    switch (status) {
      case 'draft':
        currentStep = 'sales_confirm';
        requiredRole = 'sales';
        break;
      case 'confirmed':
        currentStep = 'warehouse_prep';
        requiredRole = 'warehouse';
        break;
      case 'in_production':
      case 'preparing':
        currentStep = 'warehouse_prep';
        requiredRole = 'warehouse';
        break;
      case 'partial_shipped':
        currentStep = 'warehouse_ship';
        requiredRole = 'warehouse';
        break;
      case 'shipped':
        currentStep = 'delivery_signed';
        requiredRole = null;  // 等客户签收
        break;
      case 'settling':
        currentStep = 'finance_review';
        requiredRole = 'finance';
        break;
      case 'completed':
        currentStep = 'order_completed';
        requiredRole = null;
        break;
      case 'cancelled':
        currentStep = 'order_cancelled';
        requiredRole = null;
        break;
      default:
        currentStep = status;
        requiredRole = null;
    }

    // 阻塞检测(简单版)
    if (order.creditExceeded) {
      blockedReason = I18n.get() === 'zh-CN' ? '客户信用超额' : 'Credit exceeded';
    }

    return {
      currentStep,
      requiredRole,
      blockedReason,
      workflowKey: 'standard_order',
    };
  }

  /**
   * 从结算单 status 推 step
   */
  function deriveSettlementStep(settlement) {
    if (!settlement) return null;
    let currentStep, requiredRole, blockedReason = null;

    switch (settlement.status) {
      case 'pending_confirm':
      case 'draft':
        currentStep = 'finance_review';
        requiredRole = 'finance';
        break;
      case 'confirmed':
        currentStep = 'collecting';
        requiredRole = 'finance';
        break;
      case 'partial_paid':
        currentStep = 'collecting';
        requiredRole = 'finance';
        break;
      case 'paid':
        currentStep = 'collected';
        requiredRole = null;
        break;
      case 'overdue':
        currentStep = 'overdue';
        requiredRole = 'finance';
        blockedReason = I18n.get() === 'zh-CN' ? '客户逾期未付款' : 'Customer overdue';
        break;
      case 'cancelled':
        currentStep = 'settle_create';
        requiredRole = null;
        break;
      default:
        currentStep = settlement.status;
    }

    return {
      currentStep,
      requiredRole,
      blockedReason,
      workflowKey: 'standard_settlement',
    };
  }

  /**
   * 从发货 status 推 step
   */
  function deriveDeliveryStep(delivery) {
    if (!delivery) return null;
    const trans = delivery.transportStatus || 'pending';

    let currentStep, requiredRole;
    switch (trans) {
      case 'pending':     currentStep = 'preparing';  requiredRole = 'warehouse'; break;
      case 'preparing':   currentStep = 'preparing';  requiredRole = 'warehouse'; break;
      case 'in_transit':  currentStep = 'in_transit'; requiredRole = null;        break;
      case 'signed':      currentStep = 'signed';     requiredRole = null;        break;
      case 'exception':   currentStep = 'exception';  requiredRole = 'manager';   break;
      default:            currentStep = trans;        requiredRole = null;
    }
    return {
      currentStep,
      requiredRole,
      blockedReason: null,
      workflowKey: 'standard_delivery',
    };
  }

  /**
   * 给某个 entity 自动补 workflow 字段
   * 不破坏原数据,只 merge
   */
  function annotate(entity, kind) {
    if (!entity) return entity;
    let derived;
    if (kind === 'order')        derived = deriveOrderStep(entity);
    else if (kind === 'settlement') derived = deriveSettlementStep(entity);
    else if (kind === 'delivery')   derived = deriveDeliveryStep(entity);
    else return entity;

    if (!derived) return entity;

    // 不覆盖已经存在的值
    if (!entity.currentStep)  entity.currentStep  = derived.currentStep;
    if (entity.requiredRole === undefined) entity.requiredRole = derived.requiredRole;
    if (entity.blockedReason === undefined) entity.blockedReason = derived.blockedReason;
    if (!entity.workflowKey)  entity.workflowKey  = derived.workflowKey;
    return entity;
  }

  /** 取 step 元信息(label / role / severity)*/
  function getStepMeta(workflowKey, stepKey) {
    const defs = {
      'standard_order':      ORDER_STEPS,
      'standard_settlement': SETTLEMENT_STEPS,
      'standard_delivery':   DELIVERY_STEPS,
    };
    const map = defs[workflowKey] || ORDER_STEPS;
    const meta = map[stepKey];
    if (!meta) return { label: stepKey, role: 'system', severity: 'neutral' };
    return {
      label: I18n.get() === 'zh-CN' ? meta.labelZh : meta.labelEn,
      role: meta.role,
      severity: meta.severity,
    };
  }

  /** 列出某 workflow 所有步骤(预埋,供未来 Workflow 可视化)*/
  function getAllSteps(workflowKey) {
    const defs = {
      'standard_order':      ORDER_STEPS,
      'standard_settlement': SETTLEMENT_STEPS,
      'standard_delivery':   DELIVERY_STEPS,
    };
    return defs[workflowKey] || ORDER_STEPS;
  }

  /**
   * 把 Timeline event type 映射到 actionType + stepKey
   * 这是 Workflow Engine 未来消费的核心映射
   */
  function deriveTimelineMeta(event) {
    if (!event) return {};
    const map = {
      'quotation_created':      { actionType: 'quotation_created',      stepKey: 'sales_create',      stepStatus: 'completed', actorRole: 'sales' },
      'quotation_accepted':     { actionType: 'quotation_accepted',     stepKey: 'sales_create',      stepStatus: 'completed', actorRole: 'sales' },
      'order_created':          { actionType: 'order_created',          stepKey: 'sales_create',      stepStatus: 'completed', actorRole: 'sales' },
      'order_confirmed':        { actionType: 'order_confirmed',        stepKey: 'sales_confirm',     stepStatus: 'completed', actorRole: 'sales' },
      'status_change':          { actionType: 'order_status_change',    stepKey: null,                stepStatus: 'in_progress', actorRole: null },
      'appendix':               { actionType: 'order_appendix',         stepKey: 'sales_confirm',     stepStatus: 'completed', actorRole: 'sales' },
      'delivery':               { actionType: 'shipment_created',       stepKey: 'warehouse_ship',    stepStatus: 'completed', actorRole: 'warehouse' },
      'delivery_signed':         { actionType: 'shipment_signed',        stepKey: 'delivery_signed',   stepStatus: 'completed', actorRole: 'system' },
      'delivery_grouped':       { actionType: 'shipment_grouped',       stepKey: 'finance_review',    stepStatus: 'pending',   actorRole: 'system' },
      'delivery_exception':     { actionType: 'shipment_exception',     stepKey: 'delivery_transit',  stepStatus: 'rejected',  actorRole: 'warehouse' },
      'settlement_created':     { actionType: 'settlement_created',     stepKey: 'finance_review',    stepStatus: 'pending',   actorRole: 'finance' },
      'settlement_auto_triggered':  { actionType: 'settlement_auto_triggered',  stepKey: 'finance_review', stepStatus: 'pending',   actorRole: 'system' },
      'settlement_force_triggered': { actionType: 'settlement_force_triggered', stepKey: 'finance_review', stepStatus: 'pending',   actorRole: 'finance' },
      'settlement_confirmed':   { actionType: 'settlement_confirmed',   stepKey: 'finance_confirmed', stepStatus: 'completed', actorRole: 'finance' },
      'settlement_overdue':     { actionType: 'settlement_overdue',     stepKey: 'collecting',        stepStatus: 'in_progress', actorRole: 'system' },
      'payment':                { actionType: 'payment_received',       stepKey: 'finance_collected', stepStatus: 'completed', actorRole: 'finance' },
      'completed':              { actionType: 'order_completed',        stepKey: 'order_completed',   stepStatus: 'completed', actorRole: 'system' },
      'risk':                   { actionType: 'risk_event',             stepKey: null,                stepStatus: 'rejected',  actorRole: 'manager' },
      'exception':              { actionType: 'order_exception',        stepKey: 'order_exception',   stepStatus: 'rejected',  actorRole: 'manager' },
      // 仓储事件
      'inbound_created':        { actionType: 'inbound_created',         stepKey: 'warehouse_inbound_review', stepStatus: 'in_progress', actorRole: 'warehouse' },
      'inbound_confirmed':      { actionType: 'inbound_confirmed',       stepKey: 'warehouse_inbound_done',   stepStatus: 'completed',   actorRole: 'warehouse' },
      'inbound_cancelled':      { actionType: 'inbound_cancelled',       stepKey: 'warehouse_inbound_review', stepStatus: 'rejected',    actorRole: 'warehouse' },
      'stock_consumed':         { actionType: 'stock_consumed',          stepKey: 'warehouse_ship',           stepStatus: 'completed',   actorRole: 'warehouse' },
      'stock_locked':           { actionType: 'stock_locked',            stepKey: 'warehouse_prep',           stepStatus: 'in_progress', actorRole: 'warehouse' },
      'stock_released':         { actionType: 'stock_released',          stepKey: 'warehouse_prep',           stepStatus: 'rejected',    actorRole: 'warehouse' },
    };
    const meta = map[event.type] || {};
    // actorRole 推导优先级:
    //   1. 映射定义里的 actorRole(对发货等"角色固定"的事件)
    //   2. event.operator.role(普通操作)
    //   3. 'system' 兜底
    let actorRole;
    const forceRoleTypes = new Set([
      'delivery', 'delivery_signed', 'delivery_grouped', 'delivery_exception',
      'settlement_auto_triggered', 'settlement_force_triggered', 'settlement_overdue',
      'stock_consumed', 'stock_locked', 'stock_released',
      'inbound_created', 'inbound_confirmed', 'inbound_cancelled',
    ]);
    if (forceRoleTypes.has(event.type) && meta.actorRole) {
      actorRole = meta.actorRole;
    } else {
      actorRole = event.operator?.role || meta.actorRole || 'system';
    }
    return {
      actionType: meta.actionType || event.type,
      stepKey:    meta.stepKey || null,
      stepStatus: meta.stepStatus || 'completed',
      actorRole,
      workflowKey: 'standard_order',
    };
  }

  return {
    deriveOrderStep,
    deriveSettlementStep,
    deriveDeliveryStep,
    annotate,
    getStepMeta,
    getAllSteps,
    deriveTimelineMeta,
    ORDER_STEPS,
    SETTLEMENT_STEPS,
    DELIVERY_STEPS,
  };
})();

window.WorkflowMapper = WorkflowMapper;
