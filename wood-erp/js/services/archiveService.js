/**
 * 归档统一服务 (Archive Service)
 * @module js/services/archiveService
 *
 * 核心理念:
 *   - 禁止物理删除核心业务数据
 *   - 软删除标记: is_archived, archived_at, archived_by, archive_reason
 *   - 所有归档/恢复操作必须走本服务
 *   - 自动写审计日志
 *   - 列表查询默认 WHERE is_archived = false (各 service 自动加)
 *
 * 用法:
 *   ArchiveService.canArchive('customer', customer)       → { ok, reasons[] }
 *   ArchiveService.archive('customer', id, reason)        → 写标记 + 审计
 *   ArchiveService.restore('customer', id, reason)        → 撤销 + 审计
 *   ArchiveService.isArchived(record)                     → boolean
 *   ArchiveService.listArchived('customers')              → Array
 *
 * 权限:
 *   销售/仓管:无归档权
 *   财务:可归档客户/订单/恢复
 *   经理:全权
 */

const ArchiveService = (function () {
  'use strict';

  /**
   * 判断记录是否已归档
   */
  function isArchived(record) {
    return record && (record.is_archived === true || record.isArchived === true);
  }

  /**
   * 客户归档前检查
   *   - 无未完成订单
   *   - 无未结清欠款
   *   - 无进行中的发货
   *   - 无未审核 SO
   */
  function canArchiveCustomer(customer) {
    const reasons = [];
    if (!customer) return { ok: false, reasons: ['客户不存在 / Customer not found'] };
    const isZh = (typeof I18n !== 'undefined' && I18n.get && I18n.get() === 'zh-CN');

    // 1. 未完成订单
    const activeOrders = SalesOrderRepo.list({ customerId: customer.id })
      .filter(o => !isArchived(o) && !['completed', 'cancelled', 'rejected'].includes(o.status));
    if (activeOrders.length > 0) {
      reasons.push(isZh
        ? `有 ${activeOrders.length} 张未完成订单`
        : `${activeOrders.length} unfinished order(s)`);
    }

    // 2. 未结清欠款
    if ((customer.currentDebt || 0) > 0) {
      reasons.push(isZh
        ? `未结清欠款 ${Utils.formatMoney(customer.currentDebt)}`
        : `Outstanding debt ${Utils.formatMoney(customer.currentDebt)}`);
    }

    // 3. 进行中的发货
    const pendingDeliveries = DeliveryRepo.list({ customerId: customer.id })
      .filter(d => !isArchived(d) && d.transportStatus !== 'signed' && d.transportStatus !== 'cancelled');
    if (pendingDeliveries.length > 0) {
      reasons.push(isZh
        ? `有 ${pendingDeliveries.length} 条进行中的发货`
        : `${pendingDeliveries.length} pending delivery(s)`);
    }

    // 4. 未审核 SO
    const pendingApproval = SalesOrderRepo.list({ customerId: customer.id })
      .filter(o => !isArchived(o) && ['pending_approval', 'pending_finance', 'draft'].includes(o.status));
    if (pendingApproval.length > 0) {
      reasons.push(isZh
        ? `有 ${pendingApproval.length} 张待审核订单`
        : `${pendingApproval.length} pending-approval order(s)`);
    }

    return { ok: reasons.length === 0, reasons };
  }

  /**
   * 订单归档前检查
   *   - 必须 Completed 或 Cancelled
   */
  function canArchiveOrder(order) {
    const reasons = [];
    if (!order) return { ok: false, reasons: ['订单不存在'] };
    const isZh = (typeof I18n !== 'undefined' && I18n.get && I18n.get() === 'zh-CN');
    if (!['completed', 'cancelled'].includes(order.status)) {
      reasons.push(isZh
        ? '只有已完成或已取消的订单可归档'
        : 'Only Completed or Cancelled orders can be archived');
    }
    return { ok: reasons.length === 0, reasons };
  }

  /**
   * 通用 canArchive
   */
  function canArchive(entityType, record) {
    if (entityType === 'customer') return canArchiveCustomer(record);
    if (entityType === 'salesOrder' || entityType === 'order') return canArchiveOrder(record);
    return { ok: true, reasons: [] };
  }

  /**
   * 归档(写软删除标记 + 审计日志)
   * @param {string} entityType  'customer' | 'salesOrder' | 'stockMovement'
   * @param {string} table       对应的 DB 表名 'customers' | 'salesOrders' | ...
   * @param {string} id
   * @param {string} reason
   */
  function _doArchive(entityType, table, id, reason) {
    const record = DB.findById(table, id);
    if (!record) throw new Error('记录不存在');
    if (isArchived(record)) return record;

    // 检查
    const check = canArchive(entityType, record);
    if (!check.ok) {
      throw new Error(check.reasons.join('; '));
    }

    const cur = (typeof Session !== 'undefined') ? Session.snapshot() : { operatorId: 'system' };
    const beforeStatus = record.status;

    const updated = DB.update(table, id, {
      is_archived: true,
      archived_at: Utils.now(),
      archived_by: cur.operatorId,
      archive_reason: reason || '',
      status: record.status === 'cancelled' ? 'cancelled' : 'archived',
    });

    // 审计日志
    if (typeof AuditService !== 'undefined') {
      AuditService.log({
        entityType,
        entityId: id,
        action: 'archive',
        changes: [
          { field: 'is_archived', oldValue: false, newValue: true },
          { field: 'status', oldValue: beforeStatus, newValue: 'archived' },
        ],
        remark: reason,
      });
    }

    if (typeof EventBus !== 'undefined') {
      EventBus.emit(`${entityType}.archived`, { id, record: updated });
    }

    return updated;
  }

  /**
   * 取消归档(恢复)
   */
  function _doRestore(entityType, table, id, reason) {
    const record = DB.findById(table, id);
    if (!record) throw new Error('记录不存在');
    if (!isArchived(record)) return record;

    const cur = (typeof Session !== 'undefined') ? Session.snapshot() : { operatorId: 'system' };
    const updated = DB.update(table, id, {
      is_archived: false,
      archived_at: null,
      restored_at: Utils.now(),
      restored_by: cur.operatorId,
      // 客户:归档时 status 改为 archived,恢复时回到 active
      // 订单:归档时保留 status (completed/cancelled),恢复时去掉 archived 标记即可
      status: entityType === 'customer' ? 'active' : record.status,
    });

    if (typeof AuditService !== 'undefined') {
      AuditService.log({
        entityType,
        entityId: id,
        action: 'restore',
        changes: [
          { field: 'is_archived', oldValue: true, newValue: false },
        ],
        remark: reason,
      });
    }

    if (typeof EventBus !== 'undefined') {
      EventBus.emit(`${entityType}.restored`, { id, record: updated });
    }

    return updated;
  }

  /** 客户归档/恢复 */
  function archiveCustomer(id, reason) { return _doArchive('customer', 'customers', id, reason); }
  function restoreCustomer(id, reason) { return _doRestore('customer', 'customers', id, reason); }

  /** 订单归档/恢复 */
  function archiveOrder(id, reason) { return _doArchive('salesOrder', 'salesOrders', id, reason); }
  function restoreOrder(id, reason) { return _doRestore('salesOrder', 'salesOrders', id, reason); }

  /** 库存流水自动归档(超过 N 天) */
  function autoArchiveStockMovements(daysOld) {
    const days = daysOld || 90;
    const cutoff = Date.now() - days * 86400000;
    const records = StockMovementRepo.list().filter(r =>
      !isArchived(r) && new Date(r.createdAt).getTime() < cutoff
    );
    let count = 0;
    records.forEach(r => {
      StockMovementRepo.update(r.id, {
        is_archived: true,
        archived_at: Utils.now(),
        archived_by: 'system',
        archive_reason: `auto archive: >${days} days old`,
      });
      count++;
    });
    return count;
  }

  /**
   * 取归档列表
   */
  function listArchived(table) {
    return DB.find(table).filter(r => isArchived(r));
  }

  /**
   * 取非归档列表(各 service 应使用)
   */
  function listActive(table, filter) {
    return DB.find(table, filter || {}).filter(r => !isArchived(r));
  }

  return {
    isArchived,
    canArchive,
    canArchiveCustomer,
    canArchiveOrder,
    archiveCustomer, restoreCustomer,
    archiveOrder, restoreOrder,
    autoArchiveStockMovements,
    listArchived, listActive,
  };
})();

window.ArchiveService = ArchiveService;
