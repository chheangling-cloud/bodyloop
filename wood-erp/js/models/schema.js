/**
 * 数据 Schema 定义
 * @module models/schema
 *
 * 集中定义所有实体的:
 * 1. 表名(供 DB 调用)
 * 2. 字段说明
 * 3. 状态机
 * 4. 枚举值与中文标签
 *
 * 这份文件相当于"前端的数据库 DDL",
 * 未来 IT 部门重构时可直接转成后端 Entity 定义。
 */

const SCHEMAS = {

  // ==================== 客户 ====================
  customer: {
    table: 'customers',
    statusEnum: {
      active:  { label: '正常', color: 'emerald' },
      frozen:  { label: '冻结', color: 'slate' },
      deleted: { label: '已删除', color: 'slate' },
    },
    riskLevelEnum: {
      normal:    { label: '正常',     color: 'emerald' },
      attention: { label: '注意',     color: 'amber' },
      high:      { label: '高风险',   color: 'orange' },
      locked:    { label: '锁定发货', color: 'red' },
    },
    levelEnum: {
      A: { label: 'A级', color: 'violet' },
      B: { label: 'B级', color: 'blue' },
      C: { label: 'C级', color: 'slate' },
    },
    settlementModeEnum: {
      three_truck_one_settle: { label: '三车一结',     color: 'blue' },
      monthly:                 { label: '月结',         color: 'violet' },
      cash:                    { label: '现金结算',     color: 'emerald' },
      account_period:          { label: '账期',         color: 'amber' },
    },
  },

  // ==================== 销售订单 ====================
  salesOrder: {
    table: 'salesOrders',
    // === 重新设计的 9 状态机(每步必须前一步完成) ===
    // draft → pending_finance → pending_picking → picking → ready_to_ship
    //        → in_transit → signed → settled → paid
    statusEnum: {
      draft:             { label: '草稿',           color: 'slate' },
      pending_finance:   { label: '待财务审批',     color: 'amber' },
      pending_price:     { label: '待财务审批',     color: 'red' },     // 历史兼容
      pending_picking:   { label: '待拣货',         color: 'amber' },
      pending_warehouse: { label: '待拣货',         color: 'amber' },   // 历史兼容,等同 pending_picking
      picking:           { label: '拣货中',         color: 'blue' },
      preparing:         { label: '拣货中',         color: 'blue' },    // 历史兼容,等同 picking
      ready_to_ship:     { label: '待装车',         color: 'blue' },
      in_transit:        { label: '运输中',         color: 'blue' },
      partial_shipped:   { label: '部分签收',       color: 'blue' },    // 历史兼容
      shipped:           { label: '已签收',         color: 'emerald' }, // 历史兼容
      signed:            { label: '已签收',         color: 'emerald' },
      settled:           { label: '已结算',         color: 'violet' },
      paid:              { label: '已收款',         color: 'emerald' },
      completed:         { label: '已完成',         color: 'emerald' },  // 历史兼容
      cancelled:         { label: '已取消',         color: 'slate' },
    },
    stateMachine: {
      initial: 'draft',
      states: {
        draft:             { transitions: { submit: 'pending_finance', cancel: 'cancelled' } },
        pending_finance:   { transitions: { approve: 'pending_picking', reject: 'draft', cancel: 'cancelled' } },
        pending_picking:   { transitions: { startPicking: 'picking', cancel: 'cancelled' } },
        picking:           { transitions: { finishPicking: 'ready_to_ship', cancel: 'cancelled' } },
        ready_to_ship:     { transitions: { dispatch: 'in_transit' } },
        in_transit:        { transitions: { sign: 'signed', signPartial: 'in_transit' } },
        signed:            { transitions: { settle: 'settled' } },
        settled:           { transitions: { pay: 'paid' } },
        paid:              { transitions: {} },
        cancelled:         { transitions: {} },
      },
    },
  },

  // ==================== 发货单 ====================
  delivery: {
    table: 'deliveries',
    // 双状态:结算 + 运输
    settlementStatusEnum: {
      pending:        { label: '未分组',       color: 'slate' },
      grouped:        { label: '已凑齐',       color: 'blue' },
      settled:        { label: '已结算',       color: 'emerald' },
      manual_pending: { label: '待手动结算',   color: 'amber' },
    },
    transportStatusEnum: {
      pending:    { label: '待发车',   color: 'slate' },
      in_transit: { label: '运输中',   color: 'blue' },
      signed:     { label: '已签收',   color: 'emerald' },
      exception:  { label: '异常',     color: 'red' },
    },
  },

  // ==================== 结算单 ====================
  settlement: {
    table: 'settlements',
    statusEnum: {
      pending_confirm: { label: '待财务确认', color: 'amber' },
      confirmed:       { label: '已确认',     color: 'blue' },
      partial_paid:    { label: '部分收款',   color: 'amber' },
      paid:            { label: '已收齐',     color: 'emerald' },
      overdue:         { label: '逾期',       color: 'red' },
      cancelled:       { label: '已取消',     color: 'slate' },
    },
    creationTypeEnum: {
      auto:   { label: '自动结算', color: 'blue' },
      manual: { label: '手动结算', color: 'orange' },
    },
    stateMachine: {
      initial: 'pending_confirm',
      states: {
        pending_confirm: { transitions: { confirm: 'confirmed', cancel: 'cancelled' } },
        confirmed:       { transitions: { partialPay: 'partial_paid', payAll: 'paid', overdue: 'overdue', cancel: 'cancelled' } },
        partial_paid:    { transitions: { payAll: 'paid', overdue: 'overdue' } },
        paid:            { transitions: {} },
        overdue:         { transitions: { partialPay: 'partial_paid', payAll: 'paid' } },
        cancelled:       { transitions: {} },
      },
    },
    paymentMethodEnum: {
      transfer:        { label: '银行转账', color: 'blue' },
      cash:            { label: '现金',     color: 'emerald' },
      check:           { label: '支票',     color: 'violet' },
      acceptance_bill: { label: '承兑汇票', color: 'amber' },
    },
  },

  // ==================== 物料/产品 ====================
  // 表名仍是 materials,但语义上是"产品":
  //   - 财务管理(定价、上下架)
  //   - 销售只读(下单选品)
  //   - 仓储关联(库存数量按此 SKU 计)
  material: {
    table: 'materials',
    categoryEnum: {
      plywood: { label: 'Plywood',  color: 'emerald' },
      veneer:  { label: 'Veneer',   color: 'blue' },
      custom:  { label: '定制',     color: 'violet' },
    },
    statusEnum: {
      active:   { label: '在售', color: 'emerald' },
      archived: { label: '下架', color: 'slate' },
    },
  },

  // ==================== 产品(产品视图,实际表是 materials)====================
  product: {
    table: 'materials',
    categoryEnum: {
      plywood: { label: 'Plywood',  color: 'emerald' },
      veneer:  { label: 'Veneer',   color: 'blue' },
      custom:  { label: '定制',     color: 'violet' },
    },
    statusEnum: {
      active:   { label: '在售', color: 'emerald' },
      archived: { label: '下架', color: 'slate' },
    },
  },

  // ==================== 订单任务(OA 流转)====================
  orderTask: {
    table: 'orderTasks',
    typeEnum: {
      finance_approve:     { label: '财务审批',     color: 'amber',   forRole: 'finance'   },
      price_approve:       { label: '价格审批',     color: 'red',     forRole: 'finance'   },  // 历史兼容
      credit_approve:      { label: '信用审批',     color: 'amber',   forRole: 'finance'   },
      warehouse_prepare:   { label: '开始拣货',     color: 'amber',   forRole: 'warehouse' },  // 历史兼容名
      warehouse_pick:      { label: '拣货',         color: 'amber',   forRole: 'warehouse' },  // 新:从 prepare 到 pick
      warehouse_dispatch:  { label: '派车装车',     color: 'blue',    forRole: 'warehouse' },  // 新:每车一个
      delivery_sign:       { label: '回单签收',     color: 'blue',    forRole: 'warehouse' },  // 新:签收回单
      warehouse_ship:      { label: '装车发货',     color: 'blue',    forRole: 'warehouse' },  // 历史兼容
      settlement_create:   { label: '创建结算单',   color: 'violet',  forRole: 'finance'   },
      payment_register:    { label: '登记收款',     color: 'emerald', forRole: 'finance'   },
      order_revise:        { label: '修改订单',     color: 'slate',   forRole: 'sales'     },
    },
    statusEnum: {
      pending:   { label: '待处理', color: 'amber' },
      completed: { label: '已完成', color: 'emerald' },
      rejected:  { label: '已驳回', color: 'red' },
      skipped:   { label: '已跳过', color: 'slate' },
    },
  },

  // ==================== 员工 ====================
  employee: {
    table: 'employees',
    roleEnum: {
      sales:      { label: '销售',     color: 'blue' },
      finance:    { label: '财务',     color: 'violet' },
      warehouse:  { label: '仓库',     color: 'amber' },
      production: { label: '生产',     color: 'emerald' },
      transport:  { label: '运输',     color: 'slate' },
      manager:    { label: '管理层',   color: 'red' },
    },
  },

  // ==================== 变更日志 ====================
  changeLog: {
    table: 'changeLogs',
    categoryEnum: {
      status_change:    { label: '状态变化',   color: 'blue' },
      appendix_modify:  { label: '附录修改',   color: 'violet' },
      direct_edit:      { label: '直接编辑',   color: 'slate' },
      auto_calc:        { label: '系统计算',   color: 'slate' },
      credit_lock:      { label: '信用锁定',   color: 'red' },
      credit_unlock:    { label: '解除锁定',   color: 'emerald' },
      payment:          { label: '收款',       color: 'emerald' },
    },
  },

  // ==================== 仓库 ====================
  warehouse: {
    table: 'warehouses',
    typeEnum: {
      main:          { label: '主仓',       color: 'blue' },
      finished:      { label: '成品仓',     color: 'emerald' },
      semi_finished: { label: '半成品仓',   color: 'amber' },
      raw:           { label: '原料仓',     color: 'violet' },
      virtual:       { label: '虚拟仓',     color: 'slate' },
    },
    statusEnum: {
      active:   { label: '正常',     color: 'emerald' },
      disabled: { label: '已停用',   color: 'slate' },
    },
  },

  // ==================== 库存 ====================
  // 一条记录 = 一个(物料, 仓库)的库存状态
  inventory: {
    table: 'inventory',
    // 字段: { id, materialId, warehouseId, quantity, avgCost(WAC),
    //        safetyStock, maxStock, lastInAt, lastOutAt, updatedAt }
  },

  // ==================== 库存流水 ====================
  stockMovement: {
    table: 'stockMovements',
    movementTypeEnum: {
      // 入库类
      purchase_in:    { label: '采购入库',   color: 'blue',     direction: 'in' },
      production_in:  { label: '生产入库',   color: 'emerald',  direction: 'in' },
      adjust_in:      { label: '盘盈',       color: 'amber',    direction: 'in' },
      return_in:      { label: '退货入库',   color: 'violet',   direction: 'in' },
      transfer_in:    { label: '调拨入库',   color: 'blue',     direction: 'in' },
      // 出库类
      sales_out:      { label: '销售出库',   color: 'emerald',  direction: 'out' },
      production_use: { label: '生产领用',   color: 'amber',    direction: 'out' },
      adjust_out:     { label: '盘亏',       color: 'red',      direction: 'out' },
      scrap_out:      { label: '报废',       color: 'red',      direction: 'out' },
      transfer_out:   { label: '调拨出库',   color: 'blue',     direction: 'out' },
    },
    // 字段: { id, no, movementType, materialId, warehouseId, quantity(>0),
    //        unitCost, totalCost, qtyBefore, qtyAfter, costBefore, costAfter,
    //        sourceType, sourceId, sourceNo, // 来源单据(发货/盘点/调拨)
    //        relatedMovementId, // 对应的反向流水(调拨配对)
    //        movementDate, remark, createdBy, createdAt }
  },

  // ==================== 盘点单 ====================
  stockTaking: {
    table: 'stockTakings',
    statusEnum: {
      draft:       { label: '草稿',     color: 'slate' },
      in_progress: { label: '盘点中',   color: 'amber' },
      completed:   { label: '已完成',   color: 'emerald' },
      cancelled:   { label: '已取消',   color: 'slate' },
    },
    // 字段: { id, no, warehouseId, takingDate, status,
    //        items: [{ materialId, systemQty, actualQty, diffQty, diffCost, remark }],
    //        totalDiffIn, totalDiffOut, totalDiffCost,
    //        operatorId, completedAt, completedBy, remark, createdBy }
  },

  // ==================== 调拨单 ====================
  transferOrder: {
    table: 'transferOrders',
    statusEnum: {
      draft:      { label: '草稿',     color: 'slate' },
      in_transit: { label: '在途',     color: 'amber' },
      received:   { label: '已收货',   color: 'emerald' },
      cancelled:  { label: '已取消',   color: 'slate' },
    },
  },

  // ==================== 入库单 ====================
  inbound: {
    table: 'inbounds',
    statusEnum: {
      draft:     { label: '草稿',   color: 'slate' },
      confirmed: { label: '已入库', color: 'emerald' },
      cancelled: { label: '已取消', color: 'slate' },
    },
    typeEnum: {
      purchase:   { label: '采购入库', color: 'blue' },
      production: { label: '生产入库', color: 'emerald' },
      return:     { label: '退货入库', color: 'amber' },
      initial:    { label: '期初入库', color: 'slate' },
      gain:       { label: '盘盈入库', color: 'amber' },
    },
    // 字段: { id, no, type, warehouseId, status, 
    //        items: [{ materialId, quantity, unitCost, totalCost, remark }],
    //        totalCost, totalQty,
    //        supplier, supplierContact,   // 仅采购
    //        sourceRef,                    // 关联单号(退货=结算号,生产=工单号)
    //        inboundDate, remark, 
    //        movementIds: [],
    //        confirmedAt, confirmedBy,
    //        createdBy, createdAt, updatedAt }
  },

  // ==================== 库存锁定 ====================
  inventoryLock: {
    table: 'inventoryLocks',
    statusEnum: {
      active:   { label: '锁定中', color: 'amber' },
      consumed: { label: '已消耗', color: 'slate' },
      released: { label: '已释放', color: 'slate' },
    },
  },

  // ==================== 收款记录(独立表)====================
  payment: {
    table: 'payments',
    statusEnum: {
      pending_confirm: { label: '待确认', color: 'amber' },
      confirmed:       { label: '已确认', color: 'emerald' },
      rejected:        { label: '已驳回', color: 'red' },
    },
    methodEnum: {
      bank_transfer:   { label: '银行转账', color: 'blue' },
      cash:            { label: '现金',     color: 'slate' },
      check:           { label: '支票',     color: 'amber' },
      acceptance_bill: { label: '承兑汇票', color: 'amber' },
      other:           { label: '其他',     color: 'slate' },
    },
    // 字段: { id, no, settlementId, customerId, amount, paymentDate, method,
    //        reference, receiptUrl, attachments,
    //        status, currentStep, requiredRole,
    //        confirmedBy, confirmedAt, rejectedReason,
    //        remark, createdBy, createdAt, updatedAt }
  },

  // ==================== 信用事件(独立表)====================
  creditEvent: {
    table: 'creditEvents',
    typeEnum: {
      limit_changed:        { label: '额度变更',   color: 'blue' },
      over_limit_warning:   { label: '超额警告',   color: 'amber' },
      auto_locked:          { label: '自动锁定',   color: 'red' },
      unlocked:             { label: '解除锁定',   color: 'emerald' },
      overdue_triggered:    { label: '逾期触发',   color: 'red' },
      policy_updated:       { label: '策略调整',   color: 'slate' },
    },
    // 字段: { id, customerId, type, oldValue, newValue,
    //        triggerBy: 'auto' | empId, reason,
    //        relatedType, relatedId, createdAt }
  },

  // ==================== 通知/待办 ====================
  notification: {
    table: 'notifications',
    statusEnum: {
      unread:    { label: '未读', color: 'blue' },
      read:      { label: '已读', color: 'slate' },
      dismissed: { label: '忽略', color: 'slate' },
    },
    typeEnum: {
      approval_needed:    { label: '待审批',     color: 'amber' },
      overdue_warning:    { label: '逾期警告',   color: 'red' },
      stock_low:          { label: '低库存',     color: 'amber' },
      payment_received:   { label: '收款到账',   color: 'emerald' },
      credit_warning:     { label: '信用警告',   color: 'amber' },
      stock_shortage:     { label: '库存不足',   color: 'red' },
      generic:            { label: '通知',       color: 'blue' },
    },
  },

  // ==================== 审批 ====================
  approval: {
    table: 'approvals',
    statusEnum: {
      pending:   { label: '待处理', color: 'amber' },
      approved:  { label: '已批准', color: 'emerald' },
      rejected:  { label: '已驳回', color: 'red' },
      cancelled: { label: '已取消', color: 'slate' },
    },
  },

  // ==================== 附件 ====================
  attachment: {
    table: 'attachments',
    // 附件无 statusEnum,只有 is_archived 软删除
  },

};

/** 表名列表(供 DB 重置时遍历) */
const ALL_TABLES = Object.values(SCHEMAS).map(s => s.table);

window.SCHEMAS = SCHEMAS;
window.ALL_TABLES = ALL_TABLES;
