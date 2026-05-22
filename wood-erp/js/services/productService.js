/**
 * ProductService - 产品(物料目录)
 * @module services/productService
 *
 * 设计:
 *   - 物理表是 materials,但语义上是"产品"
 *   - 财务管理(增删改),销售只读
 *   - 价格策略:guidePrice + minPrice + needApproval
 *
 * 与库存的关系:
 *   - 产品定义"什么东西可卖"
 *   - 库存(inventory 表)记录"实物有多少",通过 materialId 关联
 *
 * 价格审核规则:
 *   priceLevel(unitPrice, product):
 *     'over_guide'      高于指导价   → 绿 <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><polyline points="3,8 7,12 13,4"/></svg>
 *     'standard'        等于指导价   → 无标记
 *     'below_guide'     低于指导价   → 黄 <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M8 1.5 L14.5 13.5 H1.5 Z"/><line x1="8" y1="6.5" x2="8" y2="9.5"/><line x1="8" y1="11.5" x2="8" y2="11.6"/></svg>
 *     'below_min'       低于最低价   → 红 <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5.5 7 V5 a2.5 2.5 0 0 1 5 0 V7"/></svg> (需财务审批)
 */

const ProductService = (function () {
  'use strict';

  const TABLE = 'materials';   // 物理表名

  function list(opts = {}) {
    let arr = MaterialRepo.list();
    if (opts.status) arr = arr.filter(p => p.status === opts.status);
    if (opts.category) arr = arr.filter(p => p.category === opts.category);
    return arr.sort((a, b) => (a.code || '').localeCompare(b.code || ''));
  }

  function findById(id) {
    return MaterialRepo.find(id);
  }

  function findByCode(code) {
    return MaterialRepo.list().find(p => p.code === code);
  }

  function create(data) {
    if (!data.code) throw new Error('产品编码不能为空');
    if (!data.name) throw new Error('产品名称不能为空');
    if (findByCode(data.code)) throw new Error(`产品编码 ${data.code} 已存在`);
    const guide = Number(data.guidePrice) || 0;
    const min = Number(data.minPrice) || Math.round(guide * 0.92);
    const cur = (typeof Session !== 'undefined') ? Session.snapshot() : { operatorId: 'system' };

    const product = {
      id: `mat_${Utils.uuid().slice(0, 8)}`,
      code: data.code,
      name: data.name,
      category: data.category || 'plywood',
      spec: data.spec || '',
      unit: data.unit || '张',
      price: Number(data.price) || 0,
      status: 'active',
      guidePrice: guide,
      minPrice: min,
      vipPrice: Number(data.vipPrice) || Math.round(guide * 0.95),
      needApproval: data.needApproval !== false,
      image: data.image || '',
      description: data.description || '',
      createdBy: cur.operatorId,
      createdAt: Utils.now(),
      updatedBy: cur.operatorId,
      updatedAt: Utils.now(),
    };
    MaterialRepo.create(product);
    AuditService.log({
      entityType: 'product',
      entityId: product.id,
      action: 'create',
      changes: [
        { field: 'code', fieldLabel: '编码', oldValue: null, newValue: product.code },
        { field: 'name', fieldLabel: '名称', oldValue: null, newValue: product.name },
        { field: 'guidePrice', fieldLabel: '指导价', oldValue: null, newValue: product.guidePrice },
        { field: 'minPrice', fieldLabel: '最低价', oldValue: null, newValue: product.minPrice },
      ],
    });
    EventBus.emit('product.created', product);
    return product;
  }

  function update(id, patch) {
    const before = findById(id);
    if (!before) throw new Error('产品不存在');
    const cur = (typeof Session !== 'undefined') ? Session.snapshot() : { operatorId: 'system' };

    // 提取变化
    const watched = ['name','spec','unit','category','status','guidePrice','minPrice','vipPrice','needApproval','description'];
    const changes = [];
    const labels = { name:'名称', spec:'规格', unit:'单位', category:'品类', status:'状态',
                     guidePrice:'指导价', minPrice:'最低价', vipPrice:'VIP价', needApproval:'需审批', description:'描述' };
    watched.forEach(k => {
      if (k in patch && patch[k] !== before[k]) {
        changes.push({ field: k, fieldLabel: labels[k], oldValue: before[k], newValue: patch[k] });
      }
    });

    const updated = MaterialRepo.update(id, {
      ...patch,
      updatedBy: cur.operatorId,
      updatedAt: Utils.now(),
    });

    if (changes.length > 0) {
      AuditService.log({
        entityType: 'product',
        entityId: id,
        action: 'update',
        changes,
      });
    }
    EventBus.emit('product.updated', { id, before, after: updated });
    return updated;
  }

  function archive(id, reason) {
    const before = findById(id);
    if (!before) throw new Error('产品不存在');
    if (before.status === 'archived') return before;
    return update(id, { status: 'archived' });
  }

  function activate(id) {
    return update(id, { status: 'active' });
  }

  /**
   * 价格分级
   * @returns {string} 'over_guide' | 'standard' | 'below_guide' | 'below_min'
   */
  function priceLevel(unitPrice, product) {
    if (!product) return 'standard';
    const guide = product.guidePrice || 0;
    const min   = product.minPrice || 0;
    if (guide === 0) return 'standard';
    if (unitPrice > guide) return 'over_guide';
    if (unitPrice === guide) return 'standard';
    if (unitPrice >= min) return 'below_guide';
    return 'below_min';
  }

  function priceLevelLabel(level) {
    const isZh = I18n.get() === 'zh-CN';
    const map = {
      over_guide:  isZh?'高于指导价':'Above guide',
      standard:    isZh?'标准价':'Standard',
      below_guide: isZh?'低于指导价':'Below guide',
      below_min:   isZh?'低于最低价':'Below minimum',
    };
    return map[level] || level;
  }

  function priceLevelColor(level) {
    return {
      over_guide:  'var(--emerald)',     // 绿
      standard:    'var(--text-2)',
      below_guide: '#facc15',     // 黄
      below_min:   '#f87171',     // 红
    }[level] || 'var(--text-2)';
  }

  /** 当前库存(从 inventory 表反查)*/
  function getCurrentStock(productId) {
    const invs = InventoryRepo.list({ materialId: productId });
    return invs.reduce((s, i) => s + ((i.quantity || 0) - (i.lockedQuantity || 0)), 0);
  }

  /** 价格历史分组 — 按产品 ID,带价格分级标记 */
  function getPriceHistoryByCustomer(customerId) {
    const orders = SalesOrderRepo.list({ customerId }).filter(o => o.status !== 'cancelled');
    const groups = {};
    orders.forEach(o => {
      (o.items || []).forEach(it => {
        const k = it.materialId;
        if (!groups[k]) {
          const prod = findById(it.materialId);
          groups[k] = {
            productId: it.materialId,
            productName: it.materialName,
            spec: it.spec,
            unit: it.unit,
            guidePrice: prod?.guidePrice || 0,
            minPrice: prod?.minPrice || 0,
            items: [],
          };
        }
        const prod = findById(it.materialId);
        groups[k].items.push({
          qty: it.qty,
          unitPrice: it.unitPrice,
          orderId: o.id,
          orderNo: o.no,
          orderDate: o.orderDate || o.createdAt,
          salesId: o.salesmanId,
          priceLevel: priceLevel(it.unitPrice, prod),
        });
      });
    });
    return Object.values(groups).sort((a, b) => b.items.length - a.items.length);
  }

  /** 产品的所有成交记录(产品详情 Tab 用)*/
  function getDealsByProduct(productId) {
    const orders = SalesOrderRepo.list().filter(o => o.status !== 'cancelled');
    const deals = [];
    const prod = findById(productId);
    orders.forEach(o => {
      (o.items || []).forEach(it => {
        if (it.materialId !== productId) return;
        deals.push({
          orderId: o.id,
          orderNo: o.no,
          orderDate: o.orderDate || o.createdAt,
          customerId: o.customerId,
          salesId: o.salesmanId,
          qty: it.qty,
          unitPrice: it.unitPrice,
          amount: it.amount,
          priceLevel: priceLevel(it.unitPrice, prod),
        });
      });
    });
    return deals.sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate));
  }

  function stats() {
    const all = list();
    return {
      total:    all.length,
      active:   all.filter(p => p.status === 'active').length,
      archived: all.filter(p => p.status === 'archived').length,
    };
  }

  return {
    list, findById, findByCode,
    create, update, archive, activate,
    priceLevel, priceLevelLabel, priceLevelColor,
    getCurrentStock,
    getPriceHistoryByCustomer, getDealsByProduct,
    stats,
  };
})();

window.ProductService = ProductService;
