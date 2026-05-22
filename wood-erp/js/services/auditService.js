/**
 * AuditService - 操作日志中心
 * @module services/auditService
 *
 * 设计原则:
 *   - 所有业务数据变更都应该过 AuditService.log()
 *   - 自动从 Session 取 operator 信息
 *   - 物理表名仍叫 changeLogs(向后兼容)
 *   - 新代码用 AuditService,老代码 ChangeLogRepo.create(...) 也继续工作
 *
 * 字段标准:
 *   entityType: 'customer'|'salesOrder'|'settlement'|'inventory'|'payment'|'inbound'|...
 *   entityId
 *   action: 'create'|'update'|'delete'|'status_change'|'approve'|'reject'|'lock'|'unlock'
 *   changes: [{ field, fieldLabel, oldValue, newValue }]
 *   operatorId/Name/Role(从 Session 自动填)
 *   reason
 */

const AuditService = (function () {
  'use strict';

  // 字段同义:为兼容老 schema,recordType==entityType, recordId==entityId, changeCategory==action
  const TABLE = 'changeLogs';

  /**
   * 写一条审计日志
   * @param {Object} opts
   * @param {string} opts.entityType
   * @param {string} opts.entityId
   * @param {string} opts.action       'create'|'update'|'status_change'|'approve'|'reject'|...
   * @param {Array}  opts.changes      [{ field, fieldLabel, oldValue, newValue }]
   * @param {string} opts.reason
   * @param {Object} opts.operator     (可选)显式指定 operator,否则从 Session 取
   * @param {Object} opts.metadata     (可选)其他元信息
   */
  function log(opts) {
    if (!opts.entityType || !opts.entityId) {
      console.warn('[Audit] missing entityType/entityId', opts);
      return null;
    }
    const op = opts.operator || (typeof Session !== 'undefined' ? Session.snapshot() : {
      operatorId: 'system', operatorName: '系统', operatorRole: 'system', operatorDepartment: ''
    });

    const entry = {
      id: `clog_${Utils.uuid().slice(0, 8)}`,
      // 兼容字段(老 schema)
      recordType: opts.entityType,
      recordId:   opts.entityId,
      changeCategory: opts.action || 'update',
      // 新字段
      entityType: opts.entityType,
      entityId:   opts.entityId,
      action:     opts.action || 'update',
      changes:    opts.changes || [],
      reason:     opts.reason || '',
      // operator 信息(为 RBAC 铺路)
      operatorId:         op.operatorId   || op.id    || 'unknown',
      operatorName:       op.operatorName || op.name  || '',
      operatorRole:       op.operatorRole || op.role  || 'system',
      operatorDepartment: op.operatorDepartment || op.department || '',
      // 元信息
      metadata:   opts.metadata || {},
      operatedAt: Utils.now(),
      createdAt:  Utils.now(),
    };
    ChangeLogRepo.create(entry);
    EventBus.emit('audit.logged', entry);
    return entry;
  }

  /** 查询某实体的所有操作历史 */
  function listForEntity(entityType, entityId) {
    return ChangeLogRepo.list().filter(l =>
      (l.recordType === entityType || l.entityType === entityType) &&
      (l.recordId === entityId || l.entityId === entityId)
    ).sort((a, b) => new Date(b.operatedAt || b.createdAt) - new Date(a.operatedAt || a.createdAt));
  }

  /** 查询某操作员的所有操作 */
  function listByOperator(operatorId, opts = {}) {
    const limit = opts.limit || 100;
    return ChangeLogRepo.list()
      .filter(l => l.operatorId === operatorId)
      .sort((a, b) => new Date(b.operatedAt || b.createdAt) - new Date(a.operatedAt || a.createdAt))
      .slice(0, limit);
  }

  /** 按动作类型查询(管理者看板用)*/
  function listByAction(action, opts = {}) {
    const limit = opts.limit || 100;
    return ChangeLogRepo.list()
      .filter(l => (l.action || l.changeCategory) === action)
      .sort((a, b) => new Date(b.operatedAt || b.createdAt) - new Date(a.operatedAt || a.createdAt))
      .slice(0, limit);
  }

  /** 全局最近 N 条审计 */
  function listRecent(limit = 50) {
    return ChangeLogRepo.list()
      .sort((a, b) => new Date(b.operatedAt || b.createdAt) - new Date(a.operatedAt || a.createdAt))
      .slice(0, limit);
  }

  return { log, listForEntity, listByOperator, listByAction, listRecent };
})();

window.AuditService = AuditService;
