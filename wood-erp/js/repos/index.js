/**
 * Repositories - 所有表的数据访问层
 * @module repos/index
 *
 * 一个文件管所有 Repo。原因:
 *   - 数量不多(15 个左右)
 *   - 都是简单的"DB.find + 几个业务查询",拆 15 个文件反而散
 *   - 单文件方便上云时一次性改造(全部加 await)
 *
 * 设计原则:
 *   - 这层只做"数据访问",不做业务规则
 *   - 业务规则放 services/
 *   - UI 放 modules/
 */

// ====== 客户 ======
const CustomerRepo = Object.assign(BaseRepo.create('customers'), {
  /** 取所有未删除/未归档的客户 */
  listActive() {
    return DB.find('customers').filter(c => !c.is_archived && c.status !== 'deleted');
  },
  findByCode(code) {
    return this.findBy('code', code);
  },
});

// ====== 销售订单 ======
const SalesOrderRepo = Object.assign(BaseRepo.create('salesOrders'), {
  /** 客户的活跃订单(用于计算 exposure) */
  listActiveByCustomer(customerId) {
    return DB.find('salesOrders', { customerId })
      .filter(o => !['completed', 'cancelled'].includes(o.status));
  },
  listByCustomer(customerId) {
    return DB.find('salesOrders', { customerId });
  },
  findByNo(no) {
    return this.findBy('no', no);
  },
});

// ====== 发货单(配送) ======
const DeliveryRepo = Object.assign(BaseRepo.create('deliveries'), {
  listByOrder(salesOrderId) {
    return DB.find('deliveries', { salesOrderId });
  },
  listByCustomer(customerId) {
    return DB.find('deliveries').filter(d => {
      const order = DB.findById('salesOrders', d.salesOrderId);
      return order?.customerId === customerId;
    });
  },
  listPendingSettlement(customerId) {
    return this.listByCustomer(customerId).filter(d => d.settlementStatus === 'pending');
  },
  listByVehicle(vehicleId) {
    return DB.find('deliveries').filter(d => d.vehicleId === vehicleId);
  },
});

// ====== 结算单 ======
const SettlementRepo = Object.assign(BaseRepo.create('settlements'), {
  listByCustomer(customerId) {
    return DB.find('settlements', { customerId });
  },
  listUnpaidByCustomer(customerId) {
    return DB.find('settlements').filter(s => s.customerId === customerId && s.status !== 'paid');
  },
  listOverdue() {
    const now = Date.now();
    return DB.find('settlements').filter(s => {
      if (s.status === 'paid') return false;
      if (!s.dueDate) return false;
      return new Date(s.dueDate).getTime() < now;
    });
  },
});

// ====== 物料/产品 ======
const MaterialRepo = Object.assign(BaseRepo.create('materials'), {
  listActive() {
    return DB.find('materials').filter(m => !m.is_archived && m.status !== 'deleted');
  },
  findByCode(code) {
    return this.findBy('code', code);
  },
});

// ====== 员工 ======
const EmployeeRepo = Object.assign(BaseRepo.create('employees'), {
  listByRole(role) {
    return DB.find('employees').filter(e => e.role === role);
  },
  listActive() {
    return DB.find('employees').filter(e => e.status !== 'deleted');
  },
});

// ====== 仓库 ======
const WarehouseRepo = Object.assign(BaseRepo.create('warehouses'), {
  listActive() {
    return DB.find('warehouses').filter(w => w.status !== 'deleted');
  },
});

// ====== 库存 ======
const InventoryRepo = Object.assign(BaseRepo.create('inventory'), {
  findByMaterialWarehouse(materialId, warehouseId) {
    return DB.find('inventory').find(i => i.materialId === materialId && i.warehouseId === warehouseId);
  },
  listByMaterial(materialId) {
    return DB.find('inventory', { materialId });
  },
  listByWarehouse(warehouseId) {
    return DB.find('inventory', { warehouseId });
  },
});

// ====== 库存流水 ======
const StockMovementRepo = Object.assign(BaseRepo.create('stockMovements'), {
  listByMaterial(materialId, options = {}) {
    return DB.find('stockMovements', { materialId }, options);
  },
  listRecent(limit = 50) {
    const all = DB.find('stockMovements');
    return all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, limit);
  },
});

// ====== 订单任务 ======
const OrderTaskRepo = Object.assign(BaseRepo.create('orderTasks'), {
  listPendingByOrder(orderId) {
    return DB.find('orderTasks').filter(t => t.orderId === orderId && t.status === 'pending');
  },
  listPendingByRole(role) {
    return DB.find('orderTasks').filter(t => t.status === 'pending' && t.assignedRole === role);
  },
});

// ====== 车辆 ======
const VehicleRepo = Object.assign(BaseRepo.create('vehicles'), {
  listActive() {
    return DB.find('vehicles').filter(v => v.status === 'active');
  },
  findByPlate(plateNo) {
    return this.findBy('plateNo', plateNo);
  },
});

// ====== 车队 ======
const FleetRepo = Object.assign(BaseRepo.create('fleets'), {
  listActive() {
    return DB.find('fleets').filter(f => f.status !== 'disabled');
  },
});

// ====== 附件 ======
const AttachmentRepo = Object.assign(BaseRepo.create('attachments'), {
  listByEntity(entityType, entityId) {
    return DB.find('attachments').filter(a => a.entityType === entityType && a.entityId === entityId);
  },
});

// ====== 审批 ======
const ApprovalRepo = Object.assign(BaseRepo.create('approvals'), {
  listPending() {
    return DB.find('approvals', { status: 'pending' });
  },
  listByEntity(entityType, entityId) {
    return DB.find('approvals').filter(a => a.entityType === entityType && a.entityId === entityId);
  },
});

// ====== 通知 ======
const NotificationRepo = Object.assign(BaseRepo.create('notifications'), {
  listUnread(userId) {
    return DB.find('notifications').filter(n => n.status === 'unread' && (!n.targetUserId || n.targetUserId === userId));
  },
});

// ====== 变更日志 ======
const ChangeLogRepo = Object.assign(BaseRepo.create('changeLogs'), {
  listByEntity(entityType, entityId) {
    return DB.find('changeLogs').filter(l => l.entityType === entityType && l.entityId === entityId);
  },
});

// ====== 报价 ======
const QuotationRepo = Object.assign(BaseRepo.create('quotations'), {
  listByCustomer(customerId) {
    return DB.find('quotations', { customerId });
  },
});

// ====== 收款 ======
const PaymentRepo = BaseRepo.create('payments');

// ====== 盘点 ======
const StockTakingRepo = BaseRepo.create('stockTakings');

// ====== 库存锁定 ======
const InventoryLockRepo = Object.assign(BaseRepo.create('inventoryLocks'), {
  listActiveByOrder(orderId) {
    return DB.find('inventoryLocks', { relatedType: 'salesOrder', relatedId: orderId, status: 'active' });
  },
});

// ====== 信用事件流水 ======
const CreditEventRepo = BaseRepo.create('creditEvents');

// 暴露到 window
window.CustomerRepo = CustomerRepo;
window.SalesOrderRepo = SalesOrderRepo;
window.DeliveryRepo = DeliveryRepo;
window.SettlementRepo = SettlementRepo;
window.MaterialRepo = MaterialRepo;
window.EmployeeRepo = EmployeeRepo;
window.WarehouseRepo = WarehouseRepo;
window.InventoryRepo = InventoryRepo;
window.StockMovementRepo = StockMovementRepo;
window.OrderTaskRepo = OrderTaskRepo;
window.VehicleRepo = VehicleRepo;
window.FleetRepo = FleetRepo;
window.AttachmentRepo = AttachmentRepo;
window.ApprovalRepo = ApprovalRepo;
window.NotificationRepo = NotificationRepo;
window.ChangeLogRepo = ChangeLogRepo;
window.QuotationRepo = QuotationRepo;
window.PaymentRepo = PaymentRepo;
window.StockTakingRepo = StockTakingRepo;
window.InventoryLockRepo = InventoryLockRepo;
window.CreditEventRepo = CreditEventRepo;
