/**
 * 盘点单服务
 * @module services/stockTakingService
 *
 * 状态流: draft → in_progress → completed (或 cancelled)
 *
 * 业务规则:
 * - 创建时:从仓库当前库存生成 items(systemQty = 当前 quantity)
 * - 用户填实盘数(actualQty),计算差异
 * - 完成时:为每行有差异的 item 生成 adjust_in 或 adjust_out 流水
 * - 已完成不可改
 */

const StockTakingService = (function () {
  'use strict';

  const TABLE = 'stockTakings';

  function list(query = {}, options = {}) {
    const opts = { sortBy: 'takingDate', order: 'desc', ...options };
    return StockTakingRepo.list(query, opts);
  }

  function findById(id) { return StockTakingRepo.find(id); }

  function search({ keyword, warehouseId, status, dateFrom, dateTo } = {}) {
    let rows = StockTakingRepo.list({}, { sortBy: 'takingDate', order: 'desc' });
    if (keyword) {
      rows = rows.filter(s => {
        const wh = WarehouseRepo.find(s.warehouseId);
        return Utils.fuzzyMatch(s.no, keyword) ||
               Utils.fuzzyMatch(wh?.name, keyword) ||
               Utils.fuzzyMatch(s.remark, keyword);
      });
    }
    if (warehouseId) rows = rows.filter(s => s.warehouseId === warehouseId);
    if (status) rows = rows.filter(s => s.status === status);
    if (dateFrom) rows = rows.filter(s => s.takingDate >= dateFrom);
    if (dateTo) rows = rows.filter(s => s.takingDate <= dateTo);
    return rows;
  }

  /**
   * 创建盘点单(从仓库当前库存生成 items)
   * @param {object} data { warehouseId, takingDate, remark, materialIds? (可选,限定盘点哪些物料) }
   */
  function create(data, operatorId) {
    if (!data.warehouseId) throw new Error('请选择仓库');

    let inventory = InventoryRepo.list({ warehouseId: data.warehouseId });
    if (data.materialIds && data.materialIds.length > 0) {
      inventory = inventory.filter(i => data.materialIds.includes(i.materialId));
    }

    const items = inventory.map(inv => {
      const mat = MaterialRepo.find(inv.materialId);
      return {
        materialId: inv.materialId,
        materialName: mat?.name,
        spec: mat?.spec,
        unit: mat?.unit,
        systemQty: inv.quantity || 0,
        actualQty: null,  // 用户来填
        diffQty: 0,
        diffCost: 0,
        unitCost: inv.avgCost || 0,
        remark: '',
      };
    });

    const no = IdGenerator.next('stockTaking');
    const taking = {
      no,
      warehouseId: data.warehouseId,
      takingDate: data.takingDate || Utils.today(),
      status: 'draft',
      items,
      totalDiffIn: 0,
      totalDiffOut: 0,
      totalDiffCost: 0,
      operatorId: operatorId || null,
      completedAt: null,
      completedBy: null,
      remark: data.remark || '',
      createdBy: operatorId || 'unknown',
    };
    const inserted = StockTakingRepo.create(taking);
    EventBus.emit('stockTaking.created', inserted);
    return inserted;
  }

  /** 更新盘点单(填实盘数) */
  function update(id, patch, operatorId) {
    const before = findById(id);
    if (!before) throw new Error('盘点单不存在');
    if (before.status === 'completed' || before.status === 'cancelled') {
      throw new Error(`${before.status === 'completed' ? '已完成' : '已取消'}的盘点单不可修改`);
    }

    if (patch.items) {
      // 重算每行的 diff
      patch.items = patch.items.map(it => {
        const actualQty = it.actualQty === null || it.actualQty === '' ? null : Number(it.actualQty);
        const diffQty = actualQty !== null ? actualQty - it.systemQty : 0;
        return {
          ...it,
          actualQty,
          diffQty,
          diffCost: diffQty * (it.unitCost || 0),
        };
      });

      // 汇总
      patch.totalDiffIn = patch.items.filter(i => i.diffQty > 0).reduce((s, i) => s + i.diffQty, 0);
      patch.totalDiffOut = patch.items.filter(i => i.diffQty < 0).reduce((s, i) => s + Math.abs(i.diffQty), 0);
      patch.totalDiffCost = patch.items.reduce((s, i) => s + (i.diffCost || 0), 0);
    }

    const updated = StockTakingRepo.update(id, patch);
    EventBus.emit('stockTaking.updated', updated);
    return updated;
  }

  /** 启动盘点(draft → in_progress) */
  function start(id, operatorId) {
    const s = findById(id);
    if (!s) throw new Error('盘点单不存在');
    if (s.status !== 'draft') throw new Error('只有草稿状态可以启动');
    const updated = StockTakingRepo.update(id, { status: 'in_progress' });
    EventBus.emit('stockTaking.started', updated);
    return updated;
  }

  /** 完成盘点 → 生成调整流水 */
  function complete(id, operatorId) {
    const s = findById(id);
    if (!s) throw new Error('盘点单不存在');
    if (!['draft', 'in_progress'].includes(s.status)) {
      throw new Error('只有草稿/盘点中状态可以完成');
    }

    // 必须所有 actualQty 都已填
    const unfilled = s.items.filter(i => i.actualQty === null || i.actualQty === undefined);
    if (unfilled.length > 0) {
      throw new Error(`还有 ${unfilled.length} 个物料未填实盘数`);
    }

    // 为每个有差异的 item 生成流水
    const diffItems = s.items.filter(i => (i.diffQty || 0) !== 0);
    diffItems.forEach(it => {
      const diff = it.diffQty;
      if (diff > 0) {
        InventoryService.recordInbound({
          materialId: it.materialId,
          warehouseId: s.warehouseId,
          quantity: diff,
          unitCost: it.unitCost,
          movementType: 'adjust_in',
          sourceType: 'stockTaking',
          sourceId: s.id,
          sourceNo: s.no,
          remark: `盘盈 ${diff}`,
        }, operatorId);
      } else {
        InventoryService.recordOutbound({
          materialId: it.materialId,
          warehouseId: s.warehouseId,
          quantity: -diff,
          movementType: 'adjust_out',
          sourceType: 'stockTaking',
          sourceId: s.id,
          sourceNo: s.no,
          force: true,  // 盘亏强制
          remark: `盘亏 ${-diff}`,
        }, operatorId);
      }
    });

    const updated = StockTakingRepo.update(id, {
      status: 'completed',
      completedAt: Utils.now(),
      completedBy: operatorId,
    });
    EventBus.emit('stockTaking.completed', updated);
    return updated;
  }

  function cancel(id, reason, operatorId) {
    const s = findById(id);
    if (!s) throw new Error('盘点单不存在');
    if (s.status === 'completed') throw new Error('已完成的盘点单不可取消');
    if (!reason) throw new Error('请填写取消原因');
    const updated = StockTakingRepo.update(id, {
      status: 'cancelled',
      remark: s.remark ? `${s.remark} | 取消: ${reason}` : `取消: ${reason}`,
    });
    EventBus.emit('stockTaking.cancelled', updated);
    return updated;
  }

  function remove(id, operatorId) {
    const s = findById(id);
    if (!s) return false;
    if (s.status !== 'draft') throw new Error('只有草稿状态可以删除');
    StockTakingRepo.remove(id);
    EventBus.emit('stockTaking.deleted', { id });
    return true;
  }

  return {
    list, findById, search,
    create, update, start, complete, cancel, remove,
  };
})();

window.StockTakingService = StockTakingService;
