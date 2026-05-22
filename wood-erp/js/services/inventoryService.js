/**
 * 库存服务
 * @module services/inventoryService
 *
 * 核心业务规则:
 * 1. inventory.quantity 是缓存,每次进出账都会更新
 * 2. 每条流水(stockMovement)都有方向(in/out),记录 qtyBefore→qtyAfter, costBefore→costAfter
 * 3. WAC(加权平均成本):
 *    入库:newCost = (oldQty*oldCost + inQty*inCost) / (oldQty + inQty)
 *    出库:用当前 WAC,不变 avgCost
 *    盘盈 adjust_in:可不更新 cost(保持 avgCost)
 * 4. 库存不足:warning(level='warning')允许调用方传 force=true 强制
 * 5. 删除流水(revertMovement)= 反向操作,生成 reverse 标记的流水
 */

const InventoryService = (function () {
  'use strict';

  const INV_TABLE = 'inventory';
  const MV_TABLE = 'stockMovements';

  // ========== 查询 ==========

  /** 单条库存查询(物料 × 仓库) */
  function getInventory(materialId, warehouseId) {
    const list = InventoryRepo.list({ materialId, warehouseId });
    return list[0] || null;
  }

  /** 物料在所有仓的库存 */
  function getByMaterial(materialId) {
    return InventoryRepo.list({ materialId });
  }

  /** 仓库的所有物料库存 */
  function getByWarehouse(warehouseId) {
    return InventoryRepo.list({ warehouseId });
  }

  /** 所有库存(看板用) */
  function listAll() {
    return InventoryRepo.list();
  }

  /** 低库存预警 - 基于可用量(quantity - lockedQuantity)*/
  function getLowStock() {
    return InventoryRepo.list().filter(i => {
      const available = (i.quantity || 0) - (i.lockedQuantity || 0);
      return available < (i.safetyStock || 0);
    });
  }

  /** 流水查询 */
  function listMovements(query = {}, options = {}) {
    const opts = { sortBy: 'movementDate', order: 'desc', ...options };
    return StockMovementRepo.list(query, opts);
  }

  function findMovement(id) { return StockMovementRepo.find(id); }

  function searchMovements({ keyword, materialId, warehouseId, movementType, direction, dateFrom, dateTo } = {}) {
    let rows = StockMovementRepo.list({}, { sortBy: 'movementDate', order: 'desc' });
    if (keyword) {
      rows = rows.filter(m => {
        const mat = MaterialRepo.find(m.materialId);
        return Utils.fuzzyMatch(m.no, keyword) ||
               Utils.fuzzyMatch(mat?.name, keyword) ||
               Utils.fuzzyMatch(m.sourceNo, keyword) ||
               Utils.fuzzyMatch(m.remark, keyword);
      });
    }
    if (materialId) rows = rows.filter(m => m.materialId === materialId);
    if (warehouseId) rows = rows.filter(m => m.warehouseId === warehouseId);
    if (movementType) rows = rows.filter(m => m.movementType === movementType);
    if (direction) {
      const enumDir = SCHEMAS.stockMovement.movementTypeEnum;
      rows = rows.filter(m => enumDir[m.movementType]?.direction === direction);
    }
    if (dateFrom) rows = rows.filter(m => m.movementDate >= dateFrom);
    if (dateTo) rows = rows.filter(m => m.movementDate <= dateTo);
    return rows;
  }

  // ========== 核心操作 ==========

  /**
   * 入库
   * @param {object} params { materialId, warehouseId, quantity, unitCost, movementType, sourceType, sourceId, sourceNo, remark }
   * @returns 生成的流水 { ok, movement, newInventory }
   */
  function recordInbound(params, operatorId) {
    const { materialId, warehouseId, quantity, unitCost, movementType, sourceType, sourceId, sourceNo, remark } = params;
    if (!materialId) throw new Error('请选择物料');
    if (!warehouseId) throw new Error('请选择仓库');
    if (!quantity || quantity <= 0) throw new Error('入库数量必须大于 0');

    const mat = MaterialRepo.find(materialId);
    if (!mat) throw new Error('物料不存在');
    const wh = WarehouseRepo.find(warehouseId);
    if (!wh) throw new Error('仓库不存在');
    if (wh.status !== 'active') throw new Error(`仓库 ${wh.name} 已停用`);

    let inv = getInventory(materialId, warehouseId);
    const qtyBefore = inv?.quantity || 0;
    const costBefore = inv?.avgCost || 0;
    const inQty = Number(quantity);
    const inCost = Number(unitCost) || costBefore || (mat.price ? Math.round(mat.price * 0.7) : 0);

    // WAC 计算
    let newCost;
    if (qtyBefore === 0) {
      newCost = inCost;
    } else {
      newCost = Math.round((qtyBefore * costBefore + inQty * inCost) / (qtyBefore + inQty));
    }
    const newQty = qtyBefore + inQty;

    // 写流水
    const movementDate = params.movementDate || Utils.today();
    const movement = {
      no: IdGenerator.next('stockMovement'),
      movementType: movementType || 'purchase_in',
      materialId,
      warehouseId,
      quantity: inQty,
      unitCost: inCost,
      totalCost: inQty * inCost,
      qtyBefore,
      qtyAfter: newQty,
      costBefore,
      costAfter: newCost,
      sourceType: sourceType || 'manual',
      sourceId: sourceId || null,
      sourceNo: sourceNo || '',
      relatedMovementId: null,
      movementDate,
      remark: remark || '',
      createdBy: operatorId || 'unknown',
    };
    const insertedMv = StockMovementRepo.create(movement);

    // 更新/创建库存
    if (inv) {
      InventoryRepo.update(inv.id, {
        quantity: newQty,
        avgCost: newCost,
        lastInAt: Utils.now(),
      });
    } else {
      // 新建库存记录
      const safetyStock = Math.round(inQty * 0.1);
      InventoryRepo.create({
        materialId,
        warehouseId,
        quantity: inQty,
        avgCost: newCost,
        safetyStock,
        maxStock: inQty * 5,
        lastInAt: Utils.now(),
        lastOutAt: null,
      });
    }

    EventBus.emit('inventory.changed', { materialId, warehouseId, movement: insertedMv });
    return { ok: true, movement: insertedMv, newInventory: getInventory(materialId, warehouseId) };
  }

  /**
   * 出库
   * @param {object} params { materialId, warehouseId, quantity, movementType, sourceType, sourceId, sourceNo, force, remark }
   * @returns { ok, movement, newInventory, warning?: { reason, available } }
   */
  function recordOutbound(params, operatorId) {
    const { materialId, warehouseId, quantity, movementType, sourceType, sourceId, sourceNo, force, remark } = params;
    if (!materialId) throw new Error('请选择物料');
    if (!warehouseId) throw new Error('请选择仓库');
    if (!quantity || quantity <= 0) throw new Error('出库数量必须大于 0');

    const inv = getInventory(materialId, warehouseId);
    const qtyBefore = inv?.quantity || 0;
    const outQty = Number(quantity);

    // 库存不足检查
    if (outQty > qtyBefore && !force) {
      const err = new Error('STOCK_INSUFFICIENT');
      err.code = 'STOCK_INSUFFICIENT';
      err.available = qtyBefore;
      err.requested = outQty;
      err.shortage = outQty - qtyBefore;
      throw err;
    }

    const costBefore = inv?.avgCost || 0;
    const newQty = qtyBefore - outQty;  // 可能为负
    const unitCost = costBefore;  // 出库用当前 WAC

    // 写流水
    const movementDate = params.movementDate || Utils.today();
    const movement = {
      no: IdGenerator.next('stockMovement'),
      movementType: movementType || 'sales_out',
      materialId,
      warehouseId,
      quantity: outQty,
      unitCost,
      totalCost: outQty * unitCost,
      qtyBefore,
      qtyAfter: newQty,
      costBefore,
      costAfter: costBefore,  // 出库不变 avgCost
      sourceType: sourceType || 'manual',
      sourceId: sourceId || null,
      sourceNo: sourceNo || '',
      relatedMovementId: null,
      movementDate,
      remark: remark || (force && outQty > qtyBefore ? `[强制]超出 ${outQty - qtyBefore}` : ''),
      forced: force === true && outQty > qtyBefore,
      createdBy: operatorId || 'unknown',
    };
    const insertedMv = StockMovementRepo.create(movement);

    if (inv) {
      InventoryRepo.update(inv.id, {
        quantity: newQty,
        lastOutAt: Utils.now(),
      });
    } else {
      // 没有库存记录但 force 出库 → 建一条负库存
      InventoryRepo.create({
        materialId,
        warehouseId,
        quantity: newQty,
        avgCost: 0,
        safetyStock: 0,
        maxStock: 0,
        lastInAt: null,
        lastOutAt: Utils.now(),
      });
    }

    EventBus.emit('inventory.changed', { materialId, warehouseId, movement: insertedMv });
    return { ok: true, movement: insertedMv, newInventory: getInventory(materialId, warehouseId) };
  }

  /**
   * 撤销流水(逆向操作)
   * 场景:发货单删除时,要撤销之前的销售出库
   */
  function reverseMovement(movementId, reason, operatorId) {
    const mv = findMovement(movementId);
    if (!mv) throw new Error('流水不存在');
    if (mv.reversed) throw new Error('该流水已被撤销');

    const enumDir = SCHEMAS.stockMovement.movementTypeEnum;
    const direction = enumDir[mv.movementType]?.direction;
    if (!direction) throw new Error(`未知流水类型 ${mv.movementType}`);

    // 反向:原入库 → 反向出库,原出库 → 反向入库
    const reverseType = direction === 'in' ? 'adjust_out' : 'adjust_in';

    const inv = getInventory(mv.materialId, mv.warehouseId);
    const qtyBefore = inv?.quantity || 0;
    const newQty = direction === 'in' ? qtyBefore - mv.quantity : qtyBefore + mv.quantity;
    const costBefore = inv?.avgCost || 0;

    const reverseMv = {
      no: IdGenerator.next('stockMovement'),
      movementType: reverseType,
      materialId: mv.materialId,
      warehouseId: mv.warehouseId,
      quantity: mv.quantity,
      unitCost: mv.unitCost,
      totalCost: mv.totalCost,
      qtyBefore,
      qtyAfter: newQty,
      costBefore,
      costAfter: costBefore,  // 反向操作不变 avgCost
      sourceType: 'reverse',
      sourceId: mv.id,
      sourceNo: mv.no,
      relatedMovementId: mv.id,
      movementDate: Utils.today(),
      remark: `撤销 ${mv.no}: ${reason || ''}`,
      isReverse: true,
      createdBy: operatorId || 'unknown',
    };
    const inserted = StockMovementRepo.create(reverseMv);

    // 标记原流水
    StockMovementRepo.update(mv.id, { reversed: true, reversedBy: inserted.id });

    // 更新库存
    if (inv) {
      InventoryRepo.update(inv.id, {
        quantity: newQty,
        lastOutAt: direction === 'in' ? Utils.now() : inv.lastOutAt,
        lastInAt: direction === 'out' ? Utils.now() : inv.lastInAt,
      });
    }

    EventBus.emit('inventory.changed', { materialId: mv.materialId, warehouseId: mv.warehouseId, movement: inserted });
    return inserted;
  }

  /**
   * 手动调整库存(盘点/直接调)
   * @param {object} params { materialId, warehouseId, newQty, reason }
   * @returns 生成的流水
   */
  function adjustStock(params, operatorId) {
    const { materialId, warehouseId, newQty, reason } = params;
    const inv = getInventory(materialId, warehouseId);
    const currentQty = inv?.quantity || 0;
    const targetQty = Number(newQty);
    const diff = targetQty - currentQty;
    if (diff === 0) return null;

    if (diff > 0) {
      return recordInbound({
        materialId, warehouseId,
        quantity: diff,
        unitCost: inv?.avgCost || 0,
        movementType: 'adjust_in',
        sourceType: 'adjustment',
        sourceNo: reason || '手动调整',
        remark: reason || '手动调整',
      }, operatorId);
    } else {
      return recordOutbound({
        materialId, warehouseId,
        quantity: -diff,
        movementType: 'adjust_out',
        sourceType: 'adjustment',
        sourceNo: reason || '手动调整',
        force: true,  // 调整允许
        remark: reason || '手动调整',
      }, operatorId);
    }
  }

  /**
   * 仓间调拨
   * @param {object} params { fromWarehouseId, toWarehouseId, items: [{materialId, quantity}], remark, force }
   * @returns 一对流水(out + in)
   */
  function transferStock(params, operatorId) {
    const { fromWarehouseId, toWarehouseId, items, remark, force } = params;
    if (!fromWarehouseId || !toWarehouseId) throw new Error('请选择源仓库和目标仓库');
    if (fromWarehouseId === toWarehouseId) throw new Error('源仓库和目标仓库不能相同');
    if (!items || items.length === 0) throw new Error('请至少选择 1 个物料');

    // 先校验所有出库可行性
    for (const item of items) {
      const inv = getInventory(item.materialId, fromWarehouseId);
      const available = inv?.quantity || 0;
      if (item.quantity > available && !force) {
        const err = new Error('STOCK_INSUFFICIENT');
        err.code = 'STOCK_INSUFFICIENT';
        err.materialId = item.materialId;
        err.available = available;
        err.requested = item.quantity;
        throw err;
      }
    }

    const transferDate = params.transferDate || Utils.today();
    const movements = [];
    items.forEach(item => {
      const inv = getInventory(item.materialId, fromWarehouseId);
      const unitCost = inv?.avgCost || 0;

      // 出库
      const outResult = recordOutbound({
        materialId: item.materialId,
        warehouseId: fromWarehouseId,
        quantity: item.quantity,
        movementType: 'transfer_out',
        sourceType: 'transfer',
        sourceId: params.transferId || null,
        sourceNo: params.transferNo || `调拨${transferDate}`,
        movementDate: transferDate,
        force,
        remark: remark || `调拨到 ${toWarehouseId}`,
      }, operatorId);

      // 入库(用源仓的 WAC 作为入库成本)
      const inResult = recordInbound({
        materialId: item.materialId,
        warehouseId: toWarehouseId,
        quantity: item.quantity,
        unitCost,
        movementType: 'transfer_in',
        sourceType: 'transfer',
        sourceId: params.transferId || null,
        sourceNo: params.transferNo || `调拨${transferDate}`,
        movementDate: transferDate,
        remark: remark || `从 ${fromWarehouseId} 调入`,
      }, operatorId);

      // 关联
      StockMovementRepo.update(outResult.movement.id, { relatedMovementId: inResult.movement.id });
      StockMovementRepo.update(inResult.movement.id, { relatedMovementId: outResult.movement.id });

      movements.push({ out: outResult.movement, in: inResult.movement });
    });

    EventBus.emit('inventory.transferred', { fromWarehouseId, toWarehouseId, movements });
    return movements;
  }

  // ========== 库存价值 / 汇总 ==========

  function getTotalValue() {
    return InventoryRepo.list().reduce((s, i) => s + (i.quantity || 0) * (i.avgCost || 0), 0);
  }

  function getKPIs() {
    const inventory = InventoryRepo.list();
    const totalSkus = inventory.length;
    const totalValue = inventory.reduce((s, i) => s + (i.quantity || 0) * (i.avgCost || 0), 0);
    const lowStockCount = inventory.filter(i => {
      const available = (i.quantity || 0) - (i.lockedQuantity || 0);
      return available < (i.safetyStock || 0);
    }).length;
    const negativeCount = inventory.filter(i => (i.quantity || 0) < 0).length;
    const warehouseCount = WarehouseRepo.list({ status: 'active' }).length;
    // 新加:总锁定量统计
    const totalLocked = inventory.reduce((s, i) => s + (i.lockedQuantity || 0) * (i.avgCost || 0), 0);
    const lockedSkuCount = inventory.filter(i => (i.lockedQuantity || 0) > 0).length;
    return { totalSkus, totalValue, lowStockCount, negativeCount, warehouseCount, totalLocked, lockedSkuCount };
  }

  // ====== 库存锁定 / 预占(销售订单确认时调用)======

  /**
   * 为某订单锁定库存(预占)
   * @returns { locks: [], shortage: [] }  shortage 是不够锁的列表
   */
  function lockForOrder(orderId, items) {
    const locks = [];
    const shortage = [];

    items.forEach(item => {
      const mat = MaterialRepo.find(item.materialId);
      if (!mat) { shortage.push({ ...item, reason: 'material not found' }); return; }

      // 找该物料所有仓库的库存,优先扣可用最多的仓
      const invs = InventoryRepo.list({ materialId: item.materialId })
        .map(i => ({ ...i, available: (i.quantity || 0) - (i.lockedQuantity || 0) }))
        .filter(i => i.available > 0)
        .sort((a, b) => b.available - a.available);

      let remaining = item.quantity;
      for (const inv of invs) {
        if (remaining <= 0) break;
        const lockQty = Math.min(inv.available, remaining);
        // 创建锁定记录
        const lock = {
          id: `lock_${Utils.uuid().slice(0, 8)}`,
          inventoryId: inv.id,
          materialId: item.materialId,
          warehouseId: inv.warehouseId,
          relatedType: 'salesOrder',
          relatedId: orderId,
          quantity: lockQty,
          status: 'active',
          reason: `订单 ${orderId} 预占`,
          createdAt: Utils.now(),
          releasedAt: null,
        };
        InventoryLockRepo.create(lock);
        locks.push(lock);

        // 更新 inventory.lockedQuantity
        InventoryRepo.update(inv.id, {
          lockedQuantity: (inv.lockedQuantity || 0) + lockQty,
          updatedAt: Utils.now(),
        });
        remaining -= lockQty;
      }

      if (remaining > 0) {
        shortage.push({
          materialId: item.materialId,
          materialName: mat.name,
          needed: item.quantity,
          short: remaining,
        });
      }
    });

    if (locks.length > 0) {
      EventBus.emit('inventory.locked', { orderId, locks, shortage });
    }
    return { locks, shortage };
  }

  /**
   * 释放某订单的所有锁定(订单取消时)
   */
  function releaseForOrder(orderId, reason) {
    const locks = InventoryLockRepo.list({ relatedType: 'salesOrder', relatedId: orderId, status: 'active' });
    locks.forEach(lock => {
      const inv = InventoryRepo.find(lock.inventoryId);
      if (inv) {
        InventoryRepo.update(lock.inventoryId, {
          lockedQuantity: Math.max(0, (inv.lockedQuantity || 0) - lock.quantity),
          updatedAt: Utils.now(),
        });
      }
      InventoryLockRepo.update(lock.id, {
        status: 'released',
        releasedAt: Utils.now(),
        reason: lock.reason + (reason ? ` | 释放原因: ${reason}` : ''),
      });
    });
    EventBus.emit('inventory.released', { orderId, count: locks.length });
    return locks.length;
  }

  /**
   * 消耗锁定库存(发货签收时)
   * 把 lockedQuantity 真扣成 quantity 实减
   * @param {string} orderId
   * @param {Array} items [{ materialId, quantity }]
   * @returns 生成的 movement 列表
   */
  function consumeForDelivery(deliveryId, orderId, items) {
    const movements = [];
    items.forEach(item => {
      // 找该订单 + 该物料的 active 锁
      const locks = InventoryLockRepo.list({
        relatedType: 'salesOrder',
        relatedId: orderId,
        materialId: item.materialId,
        status: 'active'
      });

      let remaining = item.quantity;
      for (const lock of locks) {
        if (remaining <= 0) break;
        const consume = Math.min(lock.quantity, remaining);
        const inv = InventoryRepo.find(lock.inventoryId);
        if (!inv) continue;

        const qtyBefore = inv.quantity;
        const costBefore = inv.avgCost || 0;
        const qtyAfter = qtyBefore - consume;
        const lockedAfter = Math.max(0, (inv.lockedQuantity || 0) - consume);

        // 1. inventory 真减
        InventoryRepo.update(lock.inventoryId, {
          quantity: qtyAfter,
          lockedQuantity: lockedAfter,
          lastOutAt: Utils.now(),
          updatedAt: Utils.now(),
        });

        // 2. 锁定记录:全部消耗 → consumed,部分消耗 → 减锁定量
        if (consume >= lock.quantity) {
          InventoryLockRepo.update(lock.id, {
            status: 'consumed',
            releasedAt: Utils.now(),
          });
        } else {
          InventoryLockRepo.update(lock.id, {
            quantity: lock.quantity - consume,
          });
        }

        // 3. 写流水
        const movement = {
          id: `mv_${Utils.uuid().slice(0, 8)}`,
          no: `MV-${Utils.today().replace(/-/g,'')}-${String(Math.floor(Math.random()*900)+100)}`,
          movementType: 'sale_out',
          materialId: item.materialId,
          warehouseId: lock.warehouseId,
          quantity: -consume,
          unitCost: costBefore,
          totalCost: -consume * costBefore,
          qtyBefore,
          qtyAfter,
          costBefore,
          costAfter: costBefore,
          sourceType: 'delivery',
          sourceId: deliveryId,
          sourceNo: '',
          movementDate: Utils.today(),
          remark: `发货消耗`,
          actorRole: 'warehouse',
          actionType: 'inventory_consumed',
          stepKey: 'warehouse_ship',
          createdBy: 'system',
          createdAt: Utils.now(),
        };
        StockMovementRepo.create(movement);
        movements.push(movement);

        remaining -= consume;
      }

      // 如果还没扣完(锁定不够),直接从可用库存扣
      if (remaining > 0) {
        const invs = InventoryRepo.list({ materialId: item.materialId })
          .filter(i => (i.quantity || 0) - (i.lockedQuantity || 0) > 0)
          .sort((a, b) => ((b.quantity||0) - (b.lockedQuantity||0)) - ((a.quantity||0) - (a.lockedQuantity||0)));
        for (const inv of invs) {
          if (remaining <= 0) break;
          const available = (inv.quantity || 0) - (inv.lockedQuantity || 0);
          const consume = Math.min(available, remaining);
          InventoryRepo.update(inv.id, {
            quantity: inv.quantity - consume,
            lastOutAt: Utils.now(),
            updatedAt: Utils.now(),
          });
          const movement = {
            id: `mv_${Utils.uuid().slice(0, 8)}`,
            no: `MV-${Utils.today().replace(/-/g,'')}-${String(Math.floor(Math.random()*900)+100)}`,
            movementType: 'sale_out',
            materialId: item.materialId,
            warehouseId: inv.warehouseId,
            quantity: -consume,
            unitCost: inv.avgCost,
            totalCost: -consume * inv.avgCost,
            qtyBefore: inv.quantity,
            qtyAfter: inv.quantity - consume,
            costBefore: inv.avgCost,
            costAfter: inv.avgCost,
            sourceType: 'delivery',
            sourceId: deliveryId,
            sourceNo: '',
            movementDate: Utils.today(),
            remark: '发货直接扣库存(无预占)',
            actorRole: 'warehouse',
            actionType: 'inventory_consumed',
            stepKey: 'warehouse_ship',
            createdBy: 'system',
            createdAt: Utils.now(),
          };
          StockMovementRepo.create(movement);
          movements.push(movement);
          remaining -= consume;
        }
      }
    });

    EventBus.emit('inventory.consumed', { deliveryId, orderId, movementCount: movements.length });
    // P2-2: 通知库存视图刷新(每个 movement 都广播一次)
    movements.forEach(m => {
      EventBus.emit('inventory.changed', { materialId: m.materialId, warehouseId: m.warehouseId, movement: m });
    });
    EventBus.emit('stockMovement.created', { movements });
    return movements;
  }

  return {
    getInventory, getByMaterial, getByWarehouse, listAll, getLowStock,
    listMovements, findMovement, searchMovements,
    recordInbound, recordOutbound, reverseMovement, adjustStock, transferStock,
    getTotalValue, getKPIs,
    // 库存联动
    lockForOrder, releaseForOrder, consumeForDelivery,
  };
})();

window.InventoryService = InventoryService;
