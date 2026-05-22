/**
 * 路由配置(集中管理)
 * @module app/routes
 *
 * 每条路由约定:
 *   key:           唯一标识(用于 Router.go(key))
 *   path:          URL 模式(支持 :id 占位符)
 *   title:         () => string,显示在浏览器标题/面包屑末段
 *   sidebar:       { section, key } 侧栏高亮位置
 *   breadcrumbs:   面包屑数组,'self' 表示当前节点,其他是 route key
 *   view:          View 模块的 key,会加载 window.View_{view}.init(ctx)
 */

const ROUTES = {

  // ====== 主控 ======
  'dashboard': {
    path: '/',
    title: () => t('nav.dashboard'),
    sidebar: { section: 'dashboard', key: 'dashboard' },
    breadcrumbs: ['self'],
    view: 'dashboard',
  },

  // ====== 销售模块 ======
  'customer-list': {
    path: '/customers',
    title: () => t('customer.title'),
    sidebar: { section: 'dashboard', key: 'customer-list' },
    breadcrumbs: ['self'],
    view: 'customer-list',
  },
  'customer-detail': {
    path: '/customers/:id',
    title: () => t('customer.detailTitle'),
    sidebar: { section: 'dashboard', key: 'customer-list' },
    breadcrumbs: ['customer-list', 'self'],
    view: 'customer-hub',
  },
  'order-center': {
    path: '/orders',
    title: () => t('orderCenter.title'),
    sidebar: { section: 'sales', key: 'order-center' },
    breadcrumbs: ['sales', 'self'],
    view: 'order-center',
  },
  'order-new': {
    path: '/orders/new',
    title: () => t('orderNew.title') || (I18n.get()==='zh-CN'?'新建订单':'New Order'),
    sidebar: { section: 'sales', key: 'order-center' },
    breadcrumbs: ['sales', 'order-center', 'self'],
    view: 'order-new',
  },
  'order-detail': {
    path: '/orders/:id',
    title: () => t('orderCenter.title'),
    sidebar: { section: 'sales', key: 'order-center' },
    breadcrumbs: ['sales', 'order-center', 'self'],
    view: 'order-detail',
  },
  'debt-board': {
    path: '/debt-board',
    title: () => t('debtBoard.title'),
    sidebar: { section: 'finance', key: 'debt-board' },
    breadcrumbs: ['finance', 'self'],
    view: 'debt-board',
  },
  'settlement-list': {
    path: '/settlements',
    title: () => t('settlement.title'),
    sidebar: { section: 'finance', key: 'settlements' },
    breadcrumbs: ['finance', 'self'],
    view: 'settlement-list',
  },
  'settlement-detail': {
    path: '/settlements/:id',
    title: () => t('settlement.detailTitle'),
    sidebar: { section: 'finance', key: 'settlements' },
    breadcrumbs: ['finance', 'settlement-list', 'self'],
    view: 'settlement-detail',
  },

  // ====== 仓储模块(重构后 7 项) ======
  // 1. 工作台 = inbox-warehouse(已存在)
  // 2. 库存 = inventory-list(整合 warehouse-list,后者作 tab/filter)
  'warehouse-list': {
    path: '/warehouse/warehouses',
    title: () => t('warehouse.title'),
    sidebar: { section: 'warehouse', key: 'inventory' },   // 归入「库存」
    breadcrumbs: ['warehouse', 'self'],
    view: 'warehouse-list',
  },
  'inventory-list': {
    path: '/warehouse/inventory',
    title: () => t('inventory.title'),
    sidebar: { section: 'warehouse', key: 'inventory' },
    breadcrumbs: ['warehouse', 'self'],
    view: 'inventory-list',
  },
  // 3. 入库
  'inbound-list': {
    path: '/warehouse/inbounds',
    title: () => t('inbound.title'),
    sidebar: { section: 'warehouse', key: 'inbound' },
    breadcrumbs: ['warehouse', 'self'],
    view: 'inbound-list',
  },
  'inbound-detail': {
    path: '/warehouse/inbounds/:id',
    title: () => t('inbound.detailTitle'),
    sidebar: { section: 'warehouse', key: 'inbound' },
    breadcrumbs: ['warehouse', 'inbound-list', 'self'],
    view: 'inbound-detail',
  },
  // 4. 出库/发货 (订单视角)
  'outbound-list': {
    path: '/warehouse/outbound',
    title: () => I18n.get()==='zh-CN' ? '出库/发货' : 'Outbound',
    sidebar: { section: 'warehouse', key: 'outbound' },
    breadcrumbs: ['warehouse', 'self'],
    view: 'outbound-list',
  },
  // 5. 库存流水
  'movement-list': {
    path: '/warehouse/movements',
    title: () => t('stockMovement.title'),
    sidebar: { section: 'warehouse', key: 'movements' },
    breadcrumbs: ['warehouse', 'self'],
    view: 'movement-list',
  },
  // 6. 盘点
  'stock-taking-list': {
    path: '/warehouse/stock-takings',
    title: () => t('stockTaking.title'),
    sidebar: { section: 'warehouse', key: 'stocktaking' },
    breadcrumbs: ['warehouse', 'self'],
    view: 'stock-taking-list',
  },
  'stock-taking-detail': {
    path: '/warehouse/stock-takings/:id',
    title: () => t('stockTaking.detailTitle'),
    sidebar: { section: 'warehouse', key: 'stocktaking' },
    breadcrumbs: ['warehouse', 'stock-taking-list', 'self'],
    view: 'stock-taking-detail',
  },
  // 7. 物流管理 (车次视角)
  'logistics-list': {
    path: '/warehouse/logistics',
    title: () => I18n.get()==='zh-CN' ? '物流管理' : 'Logistics',
    sidebar: { section: 'warehouse', key: 'logistics' },
    breadcrumbs: ['warehouse', 'self'],
    view: 'logistics-list',
  },
  'logistics-detail': {
    path: '/warehouse/logistics/:id',
    title: () => I18n.get()==='zh-CN' ? '车次详情' : 'Trip Detail',
    sidebar: { section: 'warehouse', key: 'logistics' },
    breadcrumbs: ['warehouse', 'logistics-list', 'self'],
    view: 'logistics-detail',
  },

  // ===== 历史 delivery 路由(别名,重定向到 logistics) =====
  'delivery-list':   { redirectTo: 'logistics-list' },
  'delivery-detail': { redirectTo: 'logistics-detail' },

  'finance-center': {
    path: '/finance',
    title: () => t('financeCenter.title'),
    sidebar: { section: 'finance', key: 'financeCenter' },
    breadcrumbs: ['finance', 'self'],
    view: 'finance-center',
  },

  'product-list': {
    path: '/products',
    title: () => t('product.title') || (I18n.get()==='zh-CN'?'产品管理':'Products'),
    sidebar: { section: 'finance', key: 'productList' },
    breadcrumbs: ['finance', 'self'],
    view: 'product-list',
  },
  'product-detail': {
    path: '/products/:id',
    title: () => t('product.detailTitle') || (I18n.get()==='zh-CN'?'产品详情':'Product Detail'),
    sidebar: { section: 'finance', key: 'productList' },
    breadcrumbs: ['finance', 'product-list', 'self'],
    view: 'product-detail',
  },

  'sales-board': {
    path: '/sales-board',
    title: () => t('salesBoard.title') || (I18n.get()==='zh-CN'?'销售看板':'Sales Board'),
    sidebar: { section: 'sales', key: 'sales-board' },
    breadcrumbs: ['sales', 'self'],
    view: 'sales-board',
  },

  'inbox-finance': {
    path: '/inbox/finance',
    title: () => I18n.get()==='zh-CN'?'财务工作台':'Finance Inbox',
    sidebar: { section: 'finance', key: 'inbox-finance' },
    breadcrumbs: ['finance', 'self'],
    view: 'inbox-view',
    params: { role: 'finance' },
  },
  'inbox-warehouse': {
    path: '/inbox/warehouse',
    title: () => I18n.get()==='zh-CN'?'仓管工作台':'Warehouse Inbox',
    sidebar: { section: 'warehouse', key: 'inbox-warehouse' },
    breadcrumbs: ['warehouse', 'self'],
    view: 'inbox-view',
    params: { role: 'warehouse' },
  },
  'inbox-sales': {
    path: '/inbox/sales',
    title: () => I18n.get()==='zh-CN'?'销售工作台':'Sales Inbox',
    sidebar: { section: 'sales', key: 'inbox-sales' },
    breadcrumbs: ['sales', 'self'],
    view: 'inbox-view',
    params: { role: 'sales' },
  },

  'admin-users': {
    path: '/admin/users',
    title: () => I18n.get()==='zh-CN'?'用户与权限':'Users & Permissions',
    sidebar: { section: 'others', key: 'admin-users' },
    breadcrumbs: ['self'],
    view: 'admin-users',
  },

};

/**
 * 面包屑虚拟节点(不是真实路由,只用作面包屑导航的分组)
 * key 用于 breadcrumbs 数组里,引导用户到所在分组的主入口
 */
const BREADCRUMB_GROUPS = {
  sales:     { label: () => t('nav.section_sales'),     goTo: 'order-center' },
  warehouse: { label: () => t('nav.section_warehouse'), goTo: 'inventory-list' },
  finance:   { label: () => t('nav.section_finance') || (I18n.get()==='zh-CN'?'财务模块':'Finance'), goTo: 'finance-center' },
};

window.ROUTES = ROUTES;
window.BREADCRUMB_GROUPS = BREADCRUMB_GROUPS;
