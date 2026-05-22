/**
 * ApprovalService - 审批节点
 * @module services/approvalService
 *
 * 设计原则:
 *   - 不做完整审批流引擎,只做"单次审批节点"
 *   - 每个 approval 代表一次"等待某角色处理"的状态
 *   - 触发后自动生成 notification 通知对应角色
 *
 * 使用:
 *   ApprovalService.request({
 *     entityType: 'salesOrder', entityId: 'so_xxx',
 *     action: 'finance_approve',
 *     requiredRole: 'finance',
 *     requestReason: '订单创建,需要财务审核',
 *     attachments: []
 *   })
 *   ApprovalService.approve(approvalId, comment, attachments)
 *   ApprovalService.reject(approvalId, reason)
 */

const ApprovalService = (function () {
  'use strict';

  const TABLE = 'approvals';

  function request(data) {
    if (!data.entityType || !data.entityId) throw new Error('approval 需要 entityType + entityId');
    if (!data.requiredRole) throw new Error('approval 需要 requiredRole');
    if (!data.action) throw new Error('approval 需要 action');

    const cur = Session.current();
    const approval = {
      id: `apr_${Utils.uuid().slice(0, 8)}`,
      entityType:    data.entityType,
      entityId:      data.entityId,
      action:        data.action,
      requiredRole:  data.requiredRole,
      status:        'pending',
      requestedBy:   cur.id,
      requestedByName: cur.name,
      requestedAt:   Utils.now(),
      requestReason: data.requestReason || '',
      approvedBy:    null,
      approvedAt:    null,
      approveComment: null,
      rejectedBy:    null,
      rejectedAt:    null,
      rejectedReason: null,
      attachments:   data.attachments || [],
    };
    ApprovalRepo.create(approval);

    // 自动写审计
    AuditService.log({
      entityType: data.entityType,
      entityId: data.entityId,
      action: 'approval_requested',
      reason: data.requestReason || '',
      metadata: { approvalId: approval.id, action: data.action },
    });

    // 自动通知对应角色
    NotificationService.create({
      targetRole:  data.requiredRole,
      type:        'approval_needed',
      title:       data.notificationTitle || `${_actionLabel(data.action)} 待审批`,
      description: data.requestReason || '',
      entityType:  data.entityType,
      entityId:    data.entityId,
      link:        data.link || null,
    });

    EventBus.emit('approval.requested', approval);
    return approval;
  }

  function approve(approvalId, comment, attachments) {
    const a = ApprovalRepo.find(approvalId);
    if (!a) throw new Error('审批不存在');
    if (a.status !== 'pending') throw new Error(`状态 ${a.status} 不可批准`);

    const cur = Session.current();
    ApprovalRepo.update(approvalId, {
      status:        'approved',
      approvedBy:    cur.id,
      approvedAt:    Utils.now(),
      approveComment: comment || '',
      attachments:   [...(a.attachments || []), ...(attachments || [])],
    });

    AuditService.log({
      entityType: a.entityType,
      entityId:   a.entityId,
      action:     'approved',
      reason:     comment || '',
      metadata:   { approvalId, action: a.action },
    });

    // 通知发起人
    NotificationService.create({
      targetUserId: a.requestedBy,
      type:         'generic',
      title:        `${_actionLabel(a.action)} 已批准`,
      description:  comment || '',
      entityType:   a.entityType,
      entityId:     a.entityId,
    });

    EventBus.emit('approval.approved', { approval: ApprovalRepo.find(approvalId), entityType: a.entityType, entityId: a.entityId });
    return ApprovalRepo.find(approvalId);
  }

  function reject(approvalId, reason) {
    const a = ApprovalRepo.find(approvalId);
    if (!a) throw new Error('审批不存在');
    if (a.status !== 'pending') throw new Error(`状态 ${a.status} 不可驳回`);
    if (!reason) throw new Error('请填写驳回原因');

    const cur = Session.current();
    ApprovalRepo.update(approvalId, {
      status:         'rejected',
      rejectedBy:     cur.id,
      rejectedAt:     Utils.now(),
      rejectedReason: reason,
    });

    AuditService.log({
      entityType: a.entityType, entityId: a.entityId,
      action: 'rejected', reason,
      metadata: { approvalId, action: a.action },
    });

    NotificationService.create({
      targetUserId: a.requestedBy,
      type: 'generic',
      title: `${_actionLabel(a.action)} 已驳回`,
      description: reason,
      entityType: a.entityType, entityId: a.entityId,
    });

    EventBus.emit('approval.rejected', { approval: ApprovalRepo.find(approvalId), entityType: a.entityType, entityId: a.entityId });
    return ApprovalRepo.find(approvalId);
  }

  function listForEntity(entityType, entityId) {
    return ApprovalRepo.list().filter(a => a.entityType === entityType && a.entityId === entityId)
      .sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));
  }

  function listPending(opts = {}) {
    const role = opts.role;  // 可选:只看某角色的
    return ApprovalRepo.list()
      .filter(a => a.status === 'pending' && (!role || a.requiredRole === role))
      .sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));
  }

  function _actionLabel(action) {
    const isZh = I18n.get() === 'zh-CN';
    const map = {
      finance_approve:    isZh?'财务审核':'Finance Approval',
      credit_override:    isZh?'信用超额放行':'Credit Override',
      manual_settlement:  isZh?'手动结算':'Manual Settlement',
      payment_confirm:    isZh?'收款确认':'Payment Confirmation',
      manager_review:     isZh?'经理审批':'Manager Review',
      low_price_approve:  isZh?'低价审批':'Low Price Approval',
    };
    return map[action] || action;
  }

  return { request, approve, reject, listForEntity, listPending };
})();

window.ApprovalService = ApprovalService;
