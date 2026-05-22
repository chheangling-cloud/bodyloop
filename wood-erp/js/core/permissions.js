/**
 * RBAC 权限中央表
 * @module js/core/permissions
 *
 * 单一来源:所有权限检查走 Perm API
 *
 * 用法:
 *   Perm.can('orderCreate')                // 当前角色能否创建订单
 *   Perm.can('orderEdit', { order })       // 上下文相关(如:订单已审核?)
 *   Perm.canSeeField('cost')               // 字段是否可见
 *   Perm.canAccessRoute('inventory-list')  // 路由是否可访问
 *   Perm.homeRoute()                       // 当前角色的工作台路由
 *   Perm.reason(action)                    // 无权限时的提示文案
 *
 * 角色: sales / warehouse / finance / manager
 */

const Perm = (function () {
  'use strict';

  // ============================================================
  // 角色 → 权限矩阵
  // ============================================================

  // Action = 系统内所有可控操作的标识符
  const ROLE_PERMISSIONS = {

    // ============== 销售 ==============
    sales: {
      home: 'inbox-sales',
      sections: ['dashboard', 'sales'],         // 可访问的侧栏分组
      routes: [
        'dashboard',
        'inbox-sales',
        'customer-list', 'customer-detail',
        'order-center', 'order-detail', 'order-new',
        'sales-board',
        'product-list', 'product-detail',       // 只看产品,不看成本
      ],
      actions: {
        // === 客户 ===
        customerView:       true,
        customerCreate:     true,
        customerEdit:       true,    // 基础资料
        customerCreditEdit: false,   // 信用额度只读
        customerPaymentDaysEdit: false,
        customerFreeze:     false,
        customerDelete:     false,
        customerArchive:    false,   // 归档:仅财务/经理
        customerRestore:    false,
        // === 订单 ===
        orderView:          true,
        orderCreate:        true,
        orderEdit:          'unconfirmed',   // 只能改未审核
        orderEditPrice:     'unconfirmed',   // 已审核后价格锁
        orderApprove:       false,
        orderReject:        false,
        orderForceShip:     false,
        orderLock:          false,
        orderArchive:       false,
        orderRestore:       false,
        orderViewArchived:  'partial',  // 可看部分归档订单(自己的)
        // === 发货/库存 ===
        deliveryView:       true,
        deliveryCreate:     false,    // 销售不直接发货,只看
        inventoryView:      'quantityOnly',  // 只看数量,不看成本
        inventoryEdit:      false,
        inventoryInbound:   false,
        inventoryOutbound:  false,
        inventoryStockTake: false,
        // === 财务 ===
        financeView:        false,
        paymentRegister:    false,
        settlementCreate:   false,
        settlementView:     false,
        creditView:         true,    // 销售可以看客户欠款/逾期
      },
      fields: {
        canSee:    ['amount', 'salePrice', 'price', 'credit', 'qty', 'customerDebt', 'creditLimit', 'paymentDays'],
        cannotSee: ['cost', 'profit', 'fullFinanceFlow', 'wac'],
      },
    },

    // ============== 仓管 ==============
    warehouse: {
      home: 'inbox-warehouse',
      sections: ['dashboard', 'warehouse'],
      routes: [
        'dashboard',
        'inbox-warehouse',
        'customer-list', 'customer-detail',                // 仓管要看客户地址(只读)
        'warehouse-list', 'inventory-list',
        'inbound-list', 'inbound-detail',
        'outbound-list',                                   // 出库/发货
        'movement-list',
        'stock-taking-list', 'stock-taking-detail',
        'logistics-list', 'logistics-detail',              // 物流管理
        'order-center', 'order-detail',   // 仓管要看订单详情来发货
        'product-list', 'product-detail',
      ],
      actions: {
        // === 客户 ===
        customerView:       false,
        customerCreate:     false,
        customerEdit:       false,
        customerCreditEdit: false,
        customerPaymentDaysEdit: false,
        customerFreeze:     false,
        customerDelete:     false,
        customerArchive:    false,
        customerRestore:    false,
        // === 订单 ===
        orderView:          true,    // 看待发货订单
        orderCreate:        false,
        orderEdit:          false,
        orderEditPrice:     false,
        orderApprove:       false,
        orderReject:        false,
        orderForceShip:     false,
        orderLock:          false,
        orderArchive:       false,
        orderRestore:       false,
        orderViewArchived:  false,
        // === 发货/库存 ===
        deliveryView:       true,
        deliveryCreate:     true,
        deliveryMarkLoaded: true,
        deliveryMarkShipped: true,
        inventoryView:      true,
        inventoryEdit:      true,
        inventoryInbound:   true,
        inventoryOutbound:  true,
        inventoryStockTake: true,
        // === 财务 ===
        financeView:        false,
        paymentRegister:    false,
        settlementCreate:   false,
        settlementView:     false,
        creditView:         false,
      },
      fields: {
        canSee:    ['qty', 'spec', 'warehouse', 'wac'],
        cannotSee: ['amount', 'salePrice', 'price', 'cost', 'profit', 'credit', 'customerDebt', 'creditLimit', 'paymentDays'],
      },
    },

    // ============== 财务 ==============
    finance: {
      home: 'inbox-finance',
      sections: ['dashboard', 'sales', 'warehouse', 'finance'],
      routes: [
        'dashboard',
        'inbox-finance',
        'finance-center', 'product-list', 'product-detail',
        'settlement-list', 'settlement-detail',
        'debt-board',
        'order-center', 'order-detail',   // 财务看全部订单 + 审核
        'customer-list', 'customer-detail',
        'inventory-list', 'movement-list',   // 财务看库存流水
        'warehouse-list',
        'outbound-list', 'logistics-list', 'logistics-detail',  // 财务只读
        'sales-board',
      ],
      actions: {
        // === 客户 ===
        customerView:       true,
        customerCreate:     true,
        customerEdit:       true,
        customerCreditEdit: true,    // 财务核心权限
        customerPaymentDaysEdit: true,
        customerFreeze:     true,
        customerDelete:     false,
        customerArchive:    true,    // 财务可归档
        customerRestore:    true,
        // === 订单 ===
        orderView:          true,    // 全部订单
        orderCreate:        false,
        orderEdit:          false,
        orderEditPrice:     false,
        orderApprove:       true,    // 财务核心
        orderReject:        true,
        orderForceShip:     true,
        orderLock:          true,
        orderArchive:       true,
        orderRestore:       true,
        orderViewArchived:  true,
        // === 发货/库存 ===
        deliveryView:       true,
        deliveryCreate:     false,   // 财务不直接发货
        inventoryView:      true,
        inventoryEdit:      false,   // 财务不直接改库存
        inventoryInbound:   false,
        inventoryOutbound:  false,
        inventoryStockTake: false,
        movementDelete:     false,   // 不能删流水
        // === 财务 ===
        financeView:        true,
        paymentRegister:    true,
        settlementCreate:   true,
        settlementView:     true,
        creditView:         true,
      },
      fields: {
        canSee:    ['amount', 'salePrice', 'price', 'cost', 'profit', 'qty', 'credit', 'customerDebt', 'creditLimit', 'paymentDays', 'wac', 'fullFinanceFlow'],
        cannotSee: [],
      },
    },

    // ============== 经理 / 超级管理员 ==============
    manager: {
      home: 'dashboard',
      sections: ['dashboard', 'sales', 'warehouse', 'finance', 'others'],
      routes: '*',
      actions: '*',     // 全权
      fields: {
        canSee: '*',
        cannotSee: [],
      },
    },

    // ============== 销售经理(销售 + 审批/驳回/归档/全部归档查看)==============
    sales_manager: {
      home: 'inbox-sales',
      sections: ['dashboard', 'sales', 'others'],
      routes: [
        'dashboard',
        'inbox-sales',
        'customer-list', 'customer-detail',
        'order-center', 'order-detail', 'order-new',
        'sales-board',
        'product-list', 'product-detail',
        'admin-users',
      ],
      actions: {
        // 销售普通权限
        customerView: true, customerCreate: true, customerEdit: true,
        customerCreditEdit: true, customerPaymentDaysEdit: true,
        customerFreeze: true, customerDelete: false,
        customerArchive: true, customerRestore: true,
        orderView: true, orderCreate: true,
        orderEdit: true, orderEditPrice: true,
        orderApprove: false, orderReject: false,
        orderForceShip: false, orderLock: false,
        orderArchive: true, orderRestore: true,
        orderViewArchived: true,
        deliveryView: true, deliveryCreate: false,
        inventoryView: 'quantityOnly', inventoryEdit: false,
        inventoryInbound: false, inventoryOutbound: false, inventoryStockTake: false,
        financeView: false,
        paymentRegister: false,
        settlementCreate: false, settlementView: false,
        creditView: true,
      },
      fields: {
        canSee: ['amount', 'salePrice', 'price', 'credit', 'qty', 'customerDebt', 'creditLimit', 'paymentDays'],
        cannotSee: ['cost', 'profit', 'fullFinanceFlow', 'wac'],
      },
    },

    // ============== 仓管经理(仓管 + 调拨/调整/盘点完整权限)==============
    warehouse_manager: {
      home: 'inbox-warehouse',
      sections: ['dashboard', 'warehouse', 'others'],
      routes: [
        'dashboard',
        'inbox-warehouse',
        'order-center', 'order-detail',
        'warehouse-list', 'inventory-list',
        'inbound-list', 'inbound-detail',
        'outbound-list',
        'logistics-list', 'logistics-detail',
        'stock-taking-list', 'stock-taking-detail',
        'movement-list',
        'product-list', 'product-detail',
        'admin-users',
      ],
      actions: {
        customerView: true, customerCreate: false, customerEdit: false,
        customerCreditEdit: false, customerPaymentDaysEdit: false,
        customerFreeze: false, customerDelete: false,
        customerArchive: false, customerRestore: false,
        orderView: true, orderCreate: false, orderEdit: false, orderApprove: false,
        deliveryView: true, deliveryCreate: true,
        inventoryView: true, inventoryEdit: true,
        inventoryInbound: true, inventoryOutbound: true, inventoryStockTake: true,
        warehouseManage: true,     // 新增:管理仓库主数据
        vehicleManage: true,
        fleetManage: true,
        financeView: false, paymentRegister: false,
        settlementCreate: false, settlementView: false,
        creditView: false,
      },
      fields: {
        canSee: ['qty', 'spec', 'warehouse', 'wac', 'cost'],
        cannotSee: ['profit', 'fullFinanceFlow'],
      },
    },

    // ============== 财务经理(财务 + 强制审批/调整/归档)==============
    finance_manager: {
      home: 'inbox-finance',
      sections: ['dashboard', 'sales', 'warehouse', 'finance', 'others'],
      routes: [
        'dashboard',
        'inbox-finance',
        'finance-center', 'product-list', 'product-detail',
        'customer-list', 'customer-detail',
        'order-center', 'order-detail',
        'settlement-list', 'settlement-detail',
        'debt-board',
        'warehouse-list', 'inventory-list', 'movement-list',
        'sales-board',
        'admin-users',
      ],
      actions: {
        customerView: true, customerCreate: true, customerEdit: true,
        customerCreditEdit: true, customerPaymentDaysEdit: true,
        customerFreeze: true, customerDelete: false,
        customerArchive: true, customerRestore: true,
        orderView: true, orderCreate: false,
        orderEdit: false, orderEditPrice: false,
        orderApprove: true, orderReject: true,
        orderForceShip: true, orderLock: true,
        orderArchive: true, orderRestore: true,
        orderViewArchived: true,
        deliveryView: true, deliveryCreate: false,
        inventoryView: true, inventoryEdit: false,
        financeView: true, paymentRegister: true,
        settlementCreate: true, settlementConfirm: true,
        settlementView: true, settlementCancel: true,
        creditView: true, creditAdjust: true,
        productPriceEdit: true,
      },
      fields: {
        canSee: '*',
        cannotSee: [],
      },
    },

    // ============== 总经理 / CEO / 超级管理员(全权)==============
    general_manager: {
      home: 'dashboard',
      sections: ['dashboard', 'sales', 'warehouse', 'finance', 'others'],
      routes: '*',
      actions: '*',
      fields: { canSee: '*', cannotSee: [] },
    },
    ceo: {
      home: 'dashboard',
      sections: ['dashboard', 'sales', 'warehouse', 'finance', 'others'],
      routes: '*',
      actions: '*',
      fields: { canSee: '*', cannotSee: [] },
    },
    super_admin: {
      home: 'dashboard',
      sections: ['dashboard', 'sales', 'warehouse', 'finance', 'others'],
      routes: '*',
      actions: '*',     // 包括用户管理 / 权限管理
      fields: { canSee: '*', cannotSee: [] },
    },
  };

  // ============================================================
  // 角色注册表(用于 UI 展示 / 用户管理)
  // ============================================================
  const ROLE_REGISTRY = [
    { key: 'sales',             label: '销售',         labelEn: 'Sales',              level: 1, color: 'var(--blue)',     group: 'sales',     hint: '能下单、查看客户' },
    { key: 'sales_manager',     label: '销售经理',     labelEn: 'Sales Manager',      level: 2, color: 'var(--blue)',     group: 'sales',     hint: '销售 + 改信用额度 / 归档订单' },
    { key: 'warehouse',         label: '仓管',         labelEn: 'Warehouse',          level: 1, color: 'var(--orange)',   group: 'warehouse', hint: '拣货、装车、签收' },
    { key: 'warehouse_manager', label: '仓管经理',     labelEn: 'Warehouse Manager',  level: 2, color: 'var(--orange)',   group: 'warehouse', hint: '仓管 + 调拨 / 调整 / 仓库主数据' },
    { key: 'finance',           label: '财务',         labelEn: 'Finance',            level: 1, color: 'var(--amber)',    group: 'finance',   hint: '审批订单、登记收款' },
    { key: 'finance_manager',   label: '财务经理',     labelEn: 'Finance Manager',    level: 2, color: 'var(--amber)',    group: 'finance',   hint: '财务 + 强制审批 / 调整价格' },
    { key: 'general_manager',   label: '总经理',       labelEn: 'General Manager',    level: 3, color: 'var(--violet)',   group: 'mgmt',      hint: '全模块只读 / 强制操作' },
    { key: 'ceo',               label: 'CEO',          labelEn: 'CEO',                level: 4, color: 'var(--violet)',   group: 'mgmt',      hint: '同总经理,品牌区分' },
    { key: 'super_admin',       label: '超级管理员',   labelEn: 'Super Admin',        level: 5, color: 'var(--red)',      group: 'mgmt',      hint: '可管理用户与权限' },
    // 历史:manager → general_manager 的别名
    { key: 'manager',           label: '经理(旧)',  labelEn: 'Manager (legacy)',   level: 3, color: 'var(--violet)',   group: 'mgmt',      hint: '兼容,等同总经理',  hidden: true },
  ];

  // ============================================================
  // 权限覆盖层(超级管理员在 UI 改的会存到 localStorage)
  // 结构: { [roleKey]: { [actionKey]: true|false|'condition' } }
  // ============================================================
  const OVERRIDE_KEY = 'wood_erp_perm_overrides';

  function _loadOverrides() {
    try {
      const raw = localStorage.getItem(OVERRIDE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }
  function _saveOverrides(o) {
    try { localStorage.setItem(OVERRIDE_KEY, JSON.stringify(o)); }
    catch (e) { console.warn('保存权限覆盖失败:', e.message); }
  }

  // 兜底:supervisor / system 等其他角色 → 等同 manager 全权(以防数据里有)
  function _roleConfig(role) {
    const base = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.manager;
    const overrides = _loadOverrides();
    const roleOverride = overrides[role];
    if (!roleOverride) return base;
    // 合并:base.actions 可能是 '*',此时把它展开成对象再合并
    let actions;
    if (base.actions === '*') {
      // 全权角色:从 listAllActions 生成 true map
      actions = {};
      Object.values(ROLE_PERMISSIONS).forEach(cfg => {
        if (cfg.actions !== '*' && cfg.actions) {
          Object.keys(cfg.actions).forEach(k => { actions[k] = true; });
        }
      });
    } else {
      actions = { ...(base.actions || {}) };
    }
    // 应用 overlay
    Object.entries(roleOverride).forEach(([k, v]) => { actions[k] = v; });
    return { ...base, actions };
  }

  function _currentRole() {
    try { return Session.currentRole(); } catch (e) { return 'sales'; }
  }

  // ============================================================
  // Public API
  // ============================================================

  /**
   * 检查角色是否可以执行某操作
   * @param {string} action  动作 key,如 'orderApprove'
   * @param {object} ctx     上下文,如 { order } - 部分动作需要
   * @returns {boolean}
   */
  function can(action, ctx) {
    const cfg = _roleConfig(_currentRole());
    if (cfg.actions === '*') return true;
    const v = cfg.actions[action];
    if (v === undefined) return false;
    if (v === true)  return true;
    if (v === false) return false;

    // 字符串值表示条件性权限
    if (v === 'unconfirmed') {
      // 订单未审核才能改 (草稿/待审核状态)
      const order = ctx?.order;
      if (!order) return true;   // 没传 ctx → 默认允许(让 UI 自己再细查)
      const unconfirmedStatuses = ['draft', 'pending_approval', 'pending_finance'];
      return unconfirmedStatuses.includes(order.status);
    }
    if (v === 'quantityOnly') {
      // 库存只看数量,不让改
      return ctx?.readOnly === true;
    }
    return false;
  }

  /**
   * 字段是否可见
   * @param {string} fieldKey  字段标识
   * @returns {boolean}
   */
  function canSeeField(fieldKey) {
    const cfg = _roleConfig(_currentRole());
    if (cfg.fields.canSee === '*') return true;
    if (cfg.fields.cannotSee.includes(fieldKey)) return false;
    return cfg.fields.canSee.includes(fieldKey);
  }

  /**
   * 路由是否可访问
   */
  function canAccessRoute(routeKey) {
    const cfg = _roleConfig(_currentRole());
    if (cfg.routes === '*') return true;
    return cfg.routes.includes(routeKey);
  }

  /**
   * 侧栏 section 是否可见
   */
  function canSeeSection(section) {
    const cfg = _roleConfig(_currentRole());
    if (cfg.sections === '*') return true;
    return cfg.sections.includes(section) || section === 'others';
    // 'others' 是"未启用"功能区,所有角色都可见(disabled)
  }

  /**
   * 当前角色的工作台路由
   */
  function homeRoute() {
    return _roleConfig(_currentRole()).home;
  }

  /**
   * 无权限时的提示文案
   */
  function reason(action) {
    const role = _currentRole();
    const isZh = (typeof I18n !== 'undefined' && I18n.get && I18n.get() === 'zh-CN');
    const roleLabel = (typeof Roles !== 'undefined' && Roles.label) ? Roles.label(role) :
      (isZh ? { sales:'销售', warehouse:'仓管', finance:'财务', manager:'经理' }[role] || role : role);

    // 特定操作的精准提示
    const messages = {
      orderApprove:       isZh ? '仅财务可审核订单' : 'Only Finance can approve orders',
      orderReject:        isZh ? '仅财务可驳回订单' : 'Only Finance can reject orders',
      orderForceShip:     isZh ? '仅财务可强制放货' : 'Only Finance can force ship',
      orderLock:          isZh ? '仅财务可锁定订单' : 'Only Finance can lock orders',
      orderEditPrice:     isZh ? '订单已审核,价格已锁定' : 'Order approved, price locked',
      orderEdit:          isZh ? '订单已审核,无法修改' : 'Order approved, cannot edit',
      customerCreditEdit: isZh ? '仅财务可修改信用额度' : 'Only Finance can edit credit limit',
      customerPaymentDaysEdit: isZh ? '仅财务可修改账期' : 'Only Finance can edit payment days',
      customerFreeze:     isZh ? '仅财务可冻结客户' : 'Only Finance can freeze customer',
      inventoryEdit:      isZh ? '仅仓管可修改库存' : 'Only Warehouse can edit inventory',
      inventoryInbound:   isZh ? '仅仓管可入库' : 'Only Warehouse can do inbound',
      inventoryOutbound:  isZh ? '仅仓管可出库' : 'Only Warehouse can do outbound',
      deliveryCreate:     isZh ? '仅仓管可创建发货' : 'Only Warehouse can create delivery',
      paymentRegister:    isZh ? '仅财务可登记收款' : 'Only Finance can register payment',
      settlementCreate:   isZh ? '仅财务可创建结算' : 'Only Finance can create settlement',
      customerArchive:    isZh ? '仅财务可归档客户' : 'Only Finance can archive customer',
      customerRestore:    isZh ? '仅财务可恢复归档客户' : 'Only Finance can restore customer',
      orderArchive:       isZh ? '仅财务可归档订单' : 'Only Finance can archive order',
      orderRestore:       isZh ? '仅财务可恢复归档订单' : 'Only Finance can restore order',
    };
    if (messages[action]) return messages[action];

    // 通用兜底
    return isZh ? `当前角色 (${roleLabel}) 无此权限` : `Role "${roleLabel}" has no permission`;
  }

  /**
   * 渲染带权限的按钮(若无权限,自动 disabled + tooltip)
   * @param {string} html      按钮 HTML(不含 disabled)
   * @param {string} action    动作 key
   * @param {object} ctx       可选上下文
   * @returns {string}
   */
  function button(html, action, ctx) {
    if (can(action, ctx)) return html;
    const r = reason(action);
    // 给所有按钮统一加 disabled + title + 视觉灰显
    return html
      .replace(/^<button/i, `<button disabled title="${r}" data-no-perm="1"`)
      .replace(/^<a /i, `<a data-no-perm="1" title="${r}" style="opacity:0.45; pointer-events:none;" `);
  }

  /**
   * 列出所有可用角色(用于用户管理 UI)
   * @param {boolean} includeHidden 是否包含历史/隐藏角色
   */
  function listRoles(includeHidden = false) {
    return ROLE_REGISTRY.filter(r => includeHidden || !r.hidden);
  }

  /**
   * 取角色显示信息
   */
  function getRoleInfo(key) {
    return ROLE_REGISTRY.find(r => r.key === key);
  }

  /**
   * 取所有可控 action 的列表(用于动态权限矩阵 UI)
   */
  function listAllActions() {
    const set = new Set();
    Object.values(ROLE_PERMISSIONS).forEach(cfg => {
      if (cfg.actions !== '*' && cfg.actions) {
        Object.keys(cfg.actions).forEach(k => set.add(k));
      }
    });
    return Array.from(set).sort();
  }

  /**
   * 设置某角色的某 action 权限(用于权限矩阵编辑)
   * @param {string} role
   * @param {string} action
   * @param {boolean|string} value true/false/'unconfirmed' 等
   */
  function setActionPermission(role, action, value) {
    const overrides = _loadOverrides();
    if (!overrides[role]) overrides[role] = {};
    overrides[role][action] = value;
    _saveOverrides(overrides);
    EventBus && EventBus.emit && EventBus.emit('perm.changed', { role, action, value });
  }

  /**
   * 取某角色某 action 的当前生效值(合并 default + override)
   */
  function getActionPermission(role, action) {
    const cfg = _roleConfig(role);
    if (cfg.actions === '*') return true;
    return cfg.actions[action];
  }

  /**
   * 取某角色某 action 的 default(不算 override)
   */
  function getDefaultActionPermission(role, action) {
    const base = ROLE_PERMISSIONS[role];
    if (!base) return undefined;
    if (base.actions === '*') return true;
    return base.actions[action];
  }

  /**
   * 取某角色的所有覆盖,key=action, value=overrideValue
   */
  function getOverrides(role) {
    const overrides = _loadOverrides();
    return overrides[role] || {};
  }

  /**
   * 清除某角色的所有覆盖,恢复默认
   */
  function clearOverrides(role) {
    const overrides = _loadOverrides();
    if (role === undefined) {
      _saveOverrides({});
    } else {
      delete overrides[role];
      _saveOverrides(overrides);
    }
    EventBus && EventBus.emit && EventBus.emit('perm.reset', { role });
  }

  /**
   * 清除单个 action 的覆盖(恢复该 cell 的默认值)
   */
  function clearActionOverride(role, action) {
    const overrides = _loadOverrides();
    if (overrides[role]) {
      delete overrides[role][action];
      if (Object.keys(overrides[role]).length === 0) delete overrides[role];
      _saveOverrides(overrides);
    }
    EventBus && EventBus.emit && EventBus.emit('perm.changed', { role, action, value: undefined });
  }

  /**
   * 当前用户是否有权编辑权限矩阵
   */
  function canEditPermissions() {
    const role = _currentRole();
    return ['super_admin', 'general_manager', 'ceo', 'manager'].includes(role);
  }

  return {
    can, canSeeField, canAccessRoute, canSeeSection,
    homeRoute, reason, button,
    listRoles, getRoleInfo, listAllActions,
    // 矩阵编辑
    setActionPermission, getActionPermission, getDefaultActionPermission,
    getOverrides, clearOverrides, clearActionOverride,
    canEditPermissions,
    // 调试用
    _config: _roleConfig,
    _role: _currentRole,
  };
})();

window.Perm = Perm;
