/**
 * 仓库管理服务
 * @module services/warehouseService
 *
 * 简单 CRUD,不涉及库存逻辑(库存归 InventoryService)
 */

const WarehouseService = (function () {
  'use strict';

  const TABLE = 'warehouses';

  function list(query = {}, options = {}) {
    const opts = { sortBy: 'code', order: 'asc', ...options };
    return WarehouseRepo.list(query, opts);
  }

  function findById(id) { return WarehouseRepo.find(id); }

  function listActive() {
    return list({ status: 'active' });
  }

  function create(data, operatorId) {
    if (!data.name) throw new Error('请填写仓库名称');
    if (!data.code) throw new Error('请填写仓库编码');
    // 编码唯一
    const exists = list().find(w => w.code === data.code);
    if (exists) throw new Error(`仓库编码 ${data.code} 已存在`);

    const warehouse = {
      code: data.code,
      name: data.name,
      type: data.type || 'main',
      status: data.status || 'active',
      address: data.address || '',
      manager: data.manager || '',
      remark: data.remark || '',
      createdBy: operatorId || 'unknown',
    };
    const inserted = WarehouseRepo.create(warehouse);
    EventBus.emit('warehouse.created', inserted);
    return inserted;
  }

  function update(id, patch, operatorId) {
    const before = findById(id);
    if (!before) return null;
    if (patch.code && patch.code !== before.code) {
      const dup = list().find(w => w.code === patch.code && w.id !== id);
      if (dup) throw new Error(`仓库编码 ${patch.code} 已存在`);
    }
    const updated = WarehouseRepo.update(id, patch);
    EventBus.emit('warehouse.updated', updated);
    return updated;
  }

  function disable(id, operatorId) {
    // 停用前检查:库存为 0 才能停用
    const stock = InventoryRepo.list({ warehouseId: id }).reduce((s, i) => s + (i.quantity || 0), 0);
    if (stock > 0) throw new Error(`仓库还有 ${stock} 件库存,无法停用`);
    return update(id, { status: 'disabled' }, operatorId);
  }

  function enable(id, operatorId) {
    return update(id, { status: 'active' }, operatorId);
  }

  /** 仓库的库存统计 */
  function getStats(warehouseId) {
    const inventory = InventoryRepo.list({ warehouseId });
    const totalSkus = inventory.length;
    const totalQty = inventory.reduce((s, i) => s + (i.quantity || 0), 0);
    const totalValue = inventory.reduce((s, i) => s + (i.quantity || 0) * (i.avgCost || 0), 0);
    const lowStock = inventory.filter(i => (i.quantity || 0) < (i.safetyStock || 0)).length;
    return { totalSkus, totalQty, totalValue, lowStock };
  }

  return {
    list, findById, listActive,
    create, update, disable, enable,
    getStats,
  };
})();

window.WarehouseService = WarehouseService;
