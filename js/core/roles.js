/**
 * Role 系统 - 岗位定义
 * @module core/roles
 *
 * 用于 Timeline / Workflow 引擎(未来)的 actorRole 着色与权限判断。
 * 现阶段不做权限校验,只做色块显示和未来接入预埋。
 */

const ROLES = {
  sales: {
    key: 'sales',
    labelZh: '销售',
    labelEn: 'Sales',
    color: 'var(--blue)',      // 青
    bg: 'var(--blue-bg)',
  },
  warehouse: {
    key: 'warehouse',
    labelZh: '仓储',
    labelEn: 'Warehouse',
    color: '#fb923c',      // 橙
    bg: 'rgba(251, 146, 60, 0.14)',
  },
  finance: {
    key: 'finance',
    labelZh: '财务',
    labelEn: 'Finance',
    color: '#facc15',      // 黄
    bg: 'rgba(250, 204, 21, 0.14)',
  },
  manager: {
    key: 'manager',
    labelZh: '经理',
    labelEn: 'Manager',
    color: '#a78bfa',      // 紫
    bg: 'rgba(167, 139, 250, 0.14)',
  },
  supervisor: {
    key: 'supervisor',
    labelZh: '主管',
    labelEn: 'Supervisor',
    color: '#f472b6',      // 粉
    bg: 'rgba(244, 114, 182, 0.14)',
  },
  system: {
    key: 'system',
    labelZh: '系统',
    labelEn: 'System',
    color: '#94a3b8',      // 灰
    bg: 'rgba(148, 163, 184, 0.14)',
  },
};

const Roles = {
  /** 取 role 对象 */
  get(key) { return ROLES[key] || ROLES.system; },

  /** 取当前语言下的标签 */
  label(key) {
    const r = ROLES[key] || ROLES.system;
    return I18n.get() === 'zh-CN' ? r.labelZh : r.labelEn;
  },

  /** 色块 */
  color(key) { return (ROLES[key] || ROLES.system).color; },
  bg(key)    { return (ROLES[key] || ROLES.system).bg; },

  /** 所有可选 role(用于下拉等)*/
  all() { return Object.values(ROLES); },

  /**
   * 从员工对象推 role:
   *   1. 优先 emp.role(seed 时已经写好)
   *   2. 兜底:看 id 前缀(emp_s* / emp_w* / emp_f* / emp_m*)
   *   3. 全部失败 → 'system'
   */
  inferFromEmployee(emp) {
    if (!emp) return 'system';
    if (emp.role && ROLES[emp.role]) return emp.role;
    if (!emp.id) return 'system';
    const idStr = String(emp.id);
    if (idStr.startsWith('emp_s')) return 'sales';
    if (idStr.startsWith('emp_w')) return 'warehouse';
    if (idStr.startsWith('emp_f')) return 'finance';
    if (idStr.startsWith('emp_m')) return 'manager';
    return 'system';
  },

  /** 用员工 ID 推 role(优先查 DB,前缀兜底)*/
  inferFromEmployeeId(empId) {
    if (!empId) return 'system';
    if (empId === 'system') return 'system';
    // 优先从 DB.employees 查
    if (typeof DB !== 'undefined') {
      const emp = DB.findById('employees', empId);
      if (emp && emp.role && ROLES[emp.role]) return emp.role;
    }
    // 前缀兜底
    const idStr = String(empId);
    if (idStr.startsWith('emp_s')) return 'sales';
    if (idStr.startsWith('emp_w')) return 'warehouse';
    if (idStr.startsWith('emp_f')) return 'finance';
    if (idStr.startsWith('emp_m')) return 'manager';
    return 'system';
  },

  /** 渲染 role 徽章(供 UI 复用)*/
  renderBadge(role) {
    const r = ROLES[role] || ROLES.system;
    const label = I18n.get() === 'zh-CN' ? r.labelZh : r.labelEn;
    return `<span style="display:inline-flex; align-items:center; gap:4px; padding:2px 7px; background:${r.bg}; color:${r.color}; border-radius:3px; font-size:10px; font-weight:500;">
      <span style="width:5px; height:5px; border-radius:50%; background:${r.color};"></span>
      ${label}
    </span>`;
  },

  /** 渲染 role 色条(左侧色块,用于 Timeline 事件左边)*/
  renderColorBar(role) {
    const c = (ROLES[role] || ROLES.system).color;
    return `<span style="display:inline-block; width:3px; height:14px; background:${c}; border-radius:1px; vertical-align:middle;"></span>`;
  },
};

window.ROLES = ROLES;
window.Roles = Roles;
