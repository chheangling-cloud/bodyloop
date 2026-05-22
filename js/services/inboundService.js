/**
 * 入库 service
 * @module services/inboundService
 *
 * 5 种入库类型:
 *   purchase   采购入库 — 供应商 + 单价 + 总价
 *   production 生产入库 — 工单号
 *   return     退货入库 — 关联结算号
 *   initial    期初入库 — 仅期初导入
 *   gain       盘盈入库 — 盘点产生
 *
 * 业务规则:
 *   - 入库单状态:draft → confirmed(单向,不能改回)
 *   - 一旦 confirmed,自动:
 *       1. inventory.quantity += qty
 *       2. inventory.avgCost 用 WAC 公式重算
 *       3. inventory.lastInAt 更新
 *       4. 生成 stockMovement(inbound)
 *       5. 写 Workflow Timeline 事件
 *   - cancelled 必须在 confirmed 前操作
 */

const InboundService = (function () {
  'use strict';

  const TABLE = 'inbounds';

  function list() { return StockMovementRepo.list(); }
  function findById(id) { return StockMovementRepo.find(id); }

  /**
   * 创建入库单(草稿)
   */
  function create(data, operatorId) {
    if (!data.type)         throw new Error('请选择入库类型');
    if (!data.warehouseId)  throw new Error('请选择仓库');
    if (!data.items || data.items.length === 0) throw new Error('请至少添加 1 个物料');

    // 校验明细
    data.items.forEach((it, idx) => {
      if (!it.materialId) throw new Error(`第 ${idx+1} 行未选择物料`);
      if (!it.quantity || it.quantity <= 0) throw new Error(`第 ${idx+1} 行数量必须 > 0`);
      if (data.type === 'purchase' && (!it.unitCost || it.unitCost <= 0)) {
        throw new Error(`第 ${idx+1} 行采购单价必须 > 0`);
      }
    });

    if (data.type === 'purchase' && !data.supplier) {
      throw new Error('采购入库必须填写供应商');
    }

    const items = data.items.map(it => ({
      materialId: it.materialId,
      quantity: Number(it.quantity),
      unitCost: Number(it.unitCost) || 0,
      totalCost: Number(it.quantity) * (Number(it.unitCost) || 0),
      remark: it.remark || '',
    }));

    const totalQty = items.reduce((s, x) => s + x.quantity, 0);
    const totalCost = items.reduce((s, x) => s + x.totalCost, 0);

    const inboundDate = data.inboundDate || Utils.today();
    const no = IdGenerator.next('inboundOrder');

    const inbound = {
      id: `ib_${Utils.uuid().slice(0, 8)}`,
      no,
      type: data.type,
      warehouseId: data.warehouseId,
      status: 'draft',
      items,
      totalQty,
      totalCost,
      supplier: data.supplier || '',
      supplierContact: data.supplierContact || '',
      sourceRef: data.sourceRef || '',
      inboundDate,
      remark: data.remark || '',
      movementIds: [],
      // Workflow 预埋
      currentStep: 'warehouse_inbound_review',
      requiredRole: 'warehouse',
      blockedReason: null,
      workflowKey: 'standard_inbound',
      // 元信息
      createdBy: operatorId || 'unknown',
      createdAt: Utils.now(),
      updatedAt: Utils.now(),
      confirmedAt: null,
      confirmedBy: null,
    };
    StockMovementRepo.create(inbound);
    EventBus.emit('inbound.created', { inbound });
    return inbound;
  }

  /**
   * 确认入库 — 真正进库
   * 这里完成所有联动逻辑
   */
  function confirm(id, operatorId) {
    const ib = StockMovementRepo.find(id);
    if (!ib) throw new Error('入库单不存在');
    if (ib.status !== 'draft') throw new Error(`状态 ${ib.status} 不可确认`);

    const movementIds = [];

    ib.items.forEach(item => {
      // 1. 找/建库存
      const invId = `inv_${item.materialId}_${ib.warehouseId}`;
      let inv = InventoryRepo.find(invId);
      const qtyBefore = inv?.quantity || 0;
      const costBefore = inv?.avgCost || 0;

      if (!inv) {
        // 第一次入,新建库存记录
        inv = {
          id: invId,
          materialId: item.materialId,
          warehouseId: ib.warehouseId,
          quantity: item.quantity,
          lockedQuantity: 0,
          avgCost: item.unitCost,
          safetyStock: Math.max(10, Math.round(item.quantity * 0.1)),
          maxStock: item.quantity * 5,
          lastInAt: Utils.now(),
          lastOutAt: null,
          updatedAt: Utils.now(),
        };
        InventoryRepo.create(inv);
      } else {
        // 已有库存,WAC 加权平均
        const totalQty = qtyBefore + item.quantity;
        const newAvgCost = item.unitCost > 0
          ? Math.round((qtyBefore * costBefore + item.quantity * item.unitCost) / totalQty)
          : costBefore;
        InventoryRepo.update(invId, {
          quantity: totalQty,
          avgCost: newAvgCost,
          lastInAt: Utils.now(),
          updatedAt: Utils.now(),
        });
      }
      const qtyAfter = qtyBefore + item.quantity;
      const updatedInv = InventoryRepo.find(invId);

      // 2. 写流水
      const mvType = {
        purchase:   'purchase_in',
        production: 'production_in',
        return:     'return_in',
        initial:    'adjust_in',
        gain:       'inventory_gain',
      }[ib.type] || 'adjust_in';

      const movement = {
        id: `mv_${Utils.uuid().slice(0, 8)}`,
        no: `MV-${Utils.today().replace(/-/g,'')}-${String(Math.floor(Math.random()*900)+100)}`,
        movementType: mvType,
        materialId: item.materialId,
        warehouseId: ib.warehouseId,
        quantity: item.quantity,
        unitCost: item.unitCost || updatedInv.avgCost,
        totalCost: item.quantity * (item.unitCost || updatedInv.avgCost),
        qtyBefore,
        qtyAfter,
        costBefore,
        costAfter: updatedInv.avgCost,
        sourceType: ib.type,
        sourceId: ib.id,
        sourceNo: ib.no,
        relatedMovementId: null,
        movementDate: ib.inboundDate,
        remark: item.remark || ib.remark || '',
        // Workflow 预埋
        actorRole: 'warehouse',
        actionType: 'inbound_confirmed',
        stepKey: 'warehouse_inbound',
        createdBy: operatorId,
        createdAt: Utils.now(),
      };
      StockMovementRepo.create(movement);
      movementIds.push(movement.id);
    });

    // 3. 更新入库单状态
    StockMovementRepo.update(id, {
      status: 'confirmed',
      movementIds,
      confirmedAt: Utils.now(),
      confirmedBy: operatorId,
      currentStep: 'warehouse_inbound_done',
      requiredRole: null,
      updatedAt: Utils.now(),
    });

    EventBus.emit('inbound.confirmed', { inboundId: id, movementIds });
    EventBus.emit('inventory.changed', { reason: 'inbound', inboundId: id });
    return StockMovementRepo.find(id);
  }

  /**
   * 取消入库单(仅 draft 可取消)
   */
  function cancel(id, reason, operatorId) {
    const ib = StockMovementRepo.find(id);
    if (!ib) throw new Error('入库单不存在');
    if (ib.status !== 'draft') throw new Error('已入库单不可取消');
    StockMovementRepo.update(id, {
      status: 'cancelled',
      remark: (ib.remark || '') + (reason ? `\n[取消] ${reason}` : ''),
      updatedAt: Utils.now(),
    });
    EventBus.emit('inbound.cancelled', { inboundId: id, reason });
    return StockMovementRepo.find(id);
  }

  return { list, findById, create, confirm, cancel };
})();

window.InboundService = InboundService;
