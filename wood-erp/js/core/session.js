/**
 * Session - 当前用户(模拟登录)
 * @module core/session
 *
 * 为未来 RBAC + 登录系统铺路:
 *   - 当前阶段:单用户 mock,可随时切换身份测试
 *   - 未来:接入真实登录后,只改 Session.init(),所有 service 代码不变
 *
 * 使用方式:
 *   Session.current()         → { id, name, role, department }
 *   Session.currentUserId()   → 'emp_s01'
 *   Session.is('sales')       → true/false
 *   Session.switchTo(id)      → 切换身份
 */

const Session = (function () {
  'use strict';

  const STORAGE_KEY = 'wood-erp-session';
  let _current = null;

  function init() {
    // 优先从持久化恢复
    const data = Storage.getPref(STORAGE_KEY);
    if (data) {
      const emp = DB.findById('employees', data.id);
      if (emp) {
        _current = _shape(emp);
        return;
      }
    }
    // 默认:第一个销售(王志强)
    const defaultEmp = DB.findById('employees', 'emp_s01') ||
                       DB.find('employees').find(e => e.role === 'sales') ||
                       DB.find('employees')[0];
    if (defaultEmp) {
      _current = _shape(defaultEmp);
      _persist();
    } else {
      _current = { id: 'system', name: '系统', role: 'system', department: '' };
    }
  }

  function _shape(emp) {
    return {
      id: emp.id,
      name: emp.name,
      role: emp.role || 'system',
      department: emp.department || '',
    };
  }

  function _persist() {
    Storage.setPref(STORAGE_KEY, _current);
  }

  function current() {
    if (!_current) init();
    return _current;
  }

  function currentUserId() {
    return current().id;
  }

  function currentUserName() {
    return current().name;
  }

  function currentRole() {
    return current().role;
  }

  function is(role) {
    return current().role === role;
  }

  function isAny(...roles) {
    return roles.includes(current().role);
  }

  function switchTo(empId) {
    const emp = DB.findById('employees', empId);
    if (!emp) throw new Error(`员工不存在: ${empId}`);
    _current = _shape(emp);
    _persist();
    EventBus.emit('session.changed', _current);
  }

  /** 当前用户的简短描述(供 audit_log 等使用)*/
  function snapshot() {
    const c = current();
    return {
      operatorId: c.id,
      operatorName: c.name,
      operatorRole: c.role,
      operatorDepartment: c.department,
    };
  }

  return {
    init,
    current, currentUserId, currentUserName, currentRole,
    is, isAny,
    switchTo,
    snapshot,
  };
})();

window.Session = Session;
