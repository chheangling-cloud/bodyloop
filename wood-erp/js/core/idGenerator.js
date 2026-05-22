/**
 * 业务单据号生成器
 * @module core/idGenerator
 *
 * 统一管理各类单据的前缀,避免散落各处。
 * 实际生成调用 DB.nextSequence()。
 */

const IdGenerator = (function () {
  'use strict';

  const PREFIXES = {
    customer:        'C',     // 客户编号
    quotation:       'Q',     // 报价单
    salesOrder:      'SO',    // 销售订单
    appendix:        'APP',   // 附录
    delivery:        'DN',    // 配送单(Delivery Note)
    settlement:      'STL',   // 结算单
    payment:         'PAY',   // 收款记录
    purchaseOrder:   'PO',    // 采购单(预留)
    productionOrder: 'MO',    // 生产单(预留)
    inboundOrder:    'IN',    // 入库单(预留)
    outboundOrder:   'OUT',   // 出库单(预留)
    transportOrder:  'TR',    // 运输单(预留)
    financeRecord:   'FN',    // 财务记录(预留)
    // 仓储
    warehouse:       'WH',    // 仓库
    stockMovement:   'MV',    // 库存流水
    stockTaking:     'STK',   // 盘点单
    transferOrder:   'TRF',   // 调拨单
  };

  /** 生成下一个单据号 */
  function next(type) {
    const prefix = PREFIXES[type];
    if (!prefix) throw new Error(`未知单据类型: ${type}`);
    return DB.nextSequence(prefix);
  }

  /** 自定义客户编码:C-2026-001 */
  function nextCustomerCode() {
    const year = new Date().getFullYear();
    const meta = DB.getMeta();
    const key = `customer_${year}`;
    meta.sequences[key] = (meta.sequences[key] || 0) + 1;
    DB.setMeta(meta);
    return `C-${year}-${String(meta.sequences[key]).padStart(3, '0')}`;
  }

  return { next, nextCustomerCode, PREFIXES };
})();

window.IdGenerator = IdGenerator;
