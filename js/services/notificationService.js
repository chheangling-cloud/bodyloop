/**
 * NotificationService - 通知/待办
 * @module services/notificationService
 *
 * - 不做实时推送(单用户系统)
 * - 按 targetRole / targetUserId 分流
 * - 当前用户(Session)可读自己的 + 角色匹配的
 *
 * 使用:
 *   NotificationService.create({ targetRole: 'finance', type: 'approval_needed', ... })
 *   NotificationService.listForCurrent()     → 当前用户的所有未读+已读
 *   NotificationService.unreadCount()        → 数字
 *   NotificationService.markRead(id)
 *   NotificationService.markAllRead()
 */

const NotificationService = (function () {
  'use strict';

  const TABLE = 'notifications';

  function create(data) {
    if (!data.targetRole && !data.targetUserId) {
      console.warn('[Notification] need targetRole or targetUserId', data);
      return null;
    }
    const n = {
      id: `notif_${Utils.uuid().slice(0, 8)}`,
      targetRole:   data.targetRole || null,
      targetUserId: data.targetUserId || null,
      type:         data.type || 'generic',
      title:        data.title || '',
      description:  data.description || '',
      entityType:   data.entityType || null,
      entityId:     data.entityId || null,
      link:         data.link || null,
      status:       'unread',
      createdBy:    data.createdBy || (typeof Session !== 'undefined' ? Session.currentUserId() : 'system'),
      createdAt:    Utils.now(),
      readAt:       null,
    };
    NotificationRepo.create(n);
    EventBus.emit('notification.created', n);
    return n;
  }

  /** 当前用户能看到的:targetUserId === me 或 targetRole === my role */
  function listForCurrent(opts = {}) {
    const cur = Session.current();
    const includeRead = opts.includeRead !== false;
    const limit = opts.limit || 50;
    return NotificationRepo.list()
      .filter(n => {
        if (!includeRead && n.status !== 'unread') return false;
        if (n.targetUserId && n.targetUserId === cur.id) return true;
        if (n.targetRole && n.targetRole === cur.role) return true;
        return false;
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit);
  }

  function unreadCount() {
    return listForCurrent({ includeRead: false }).length;
  }

  function markRead(id) {
    const n = NotificationRepo.find(id);
    if (!n) return null;
    if (n.status === 'unread') {
      NotificationRepo.update(id, { status: 'read', readAt: Utils.now() });
      EventBus.emit('notification.read', { id });
    }
    return NotificationRepo.find(id);
  }

  function markAllRead() {
    const list = listForCurrent({ includeRead: false });
    list.forEach(n => NotificationRepo.update(n.id, { status: 'read', readAt: Utils.now() }));
    EventBus.emit('notification.allRead', { count: list.length });
    return list.length;
  }

  function dismiss(id) {
    NotificationRepo.update(id, { status: 'dismissed' });
    EventBus.emit('notification.dismissed', { id });
  }

  return { create, listForCurrent, unreadCount, markRead, markAllRead, dismiss };
})();

window.NotificationService = NotificationService;
