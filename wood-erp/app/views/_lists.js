// ====================================================
// 列表页 Views(批量)
// 每个 view 渲染 HTML 模板 + 调用对应老 module 的 init
// ====================================================

// 导出图标(下载箭头)
function _exportIcon() {
  return '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M2 11v2.5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V11"/><polyline points="5,7 8,10 11,7"/><line x1="8" y1="10" x2="8" y2="2"/></svg>';
}
window._exportIcon = _exportIcon;

window.View_order_center = (function () {
  function init(ctx) {
    document.getElementById('app-content').innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">${t('orderCenter.title')}</h1>
          <div class="page-subtitle">${t('orderCenter.subtitle')}</div>
        </div>
        <div>
          <button class="btn btn-secondary btn-sm" id="btn-export-orders">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;">
              <path d="M2 11v2.5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V11"/>
              <polyline points="5,7 8,10 11,7"/>
              <line x1="8" y1="10" x2="8" y2="2"/>
            </svg>
            <span style="margin-left:4px;">导出 Excel</span>
          </button>
        </div>
      </div>
      <div class="order-tabs" id="order-tabs"></div>
      <div id="order-table"></div>
    `;
    OrderCenterModule.init(ctx);
    document.getElementById('btn-export-orders').addEventListener('click', exportOrders);
  }
  function exportOrders() {
    const orders = SalesOrderRepo.list().filter(o => !o.is_archived);
    if (orders.length === 0) { Toast.warning('无订单可导出'); return; }
    const statusLabel = {
      draft: '草稿', pending_finance: '待财务审批', pending_picking: '待拣货',
      pending_warehouse: '待拣货', picking: '拣货中', preparing: '拣货中',
      ready_to_ship: '待装车', in_transit: '运输中', partial_shipped: '部分签收',
      signed: '已签收', shipped: '已签收', settled: '已结算', paid: '已收款',
      completed: '已完成', cancelled: '已取消',
    };
    const rows = orders.map(o => {
      const cust = CustomerRepo.find(o.customerId) || {};
      const sales = EmployeeRepo.find(o.salesmanId) || {};
      const dels = DeliveryRepo.list({ salesOrderId: o.id });
      const setts = SettlementRepo.list().filter(s => (s.salesOrderIds || []).includes(o.id));
      const paid = setts.reduce((s, x) => s + (x.paidAmount || 0), 0);
      const payable = setts.reduce((s, x) => s + (x.payableAmount || 0), 0);
      const totalQty = (o.items || []).reduce((s, i) => s + (i.qty || 0), 0);
      const shippedQty = (o.items || []).reduce((s, i) => s + (i.deliveredQty || 0), 0);
      return {
        no: o.no,
        customer: cust.name || '-',
        customerCode: cust.code || '-',
        status: statusLabel[o.status] || o.status,
        orderDate: o.orderDate,
        deliveryDate: o.deliveryDate,
        plannedTruckCount: o.plannedTruckCount || 1,
        totalAmount: o.totalAmount,
        deliveryCount: dels.length,
        totalQty,
        shippedQty,
        deliveryPct: totalQty > 0 ? Math.round(shippedQty / totalQty * 100) + '%' : '0%',
        settlementAmount: payable,
        paidAmount: paid,
        unpaidAmount: payable - paid,
        salesman: sales.name || '-',
        remark: o.remark || '',
      };
    });
    ExcelExporter.exportSheet('订单中心_' + Utils.today(), '订单列表', [
      { key: 'no', label: '订单号', width: 18 },
      { key: 'customer', label: '客户', width: 16 },
      { key: 'customerCode', label: '客户编号', width: 12 },
      { key: 'status', label: '状态', width: 12 },
      { key: 'orderDate', label: '下单日', width: 12, format: 'date' },
      { key: 'deliveryDate', label: '交期', width: 12, format: 'date' },
      { key: 'plannedTruckCount', label: '计划车次', width: 10, format: 'number' },
      { key: 'totalAmount', label: '订单金额', width: 14, format: 'currency' },
      { key: 'deliveryCount', label: '已发车次', width: 10, format: 'number' },
      { key: 'totalQty', label: '订货数量', width: 10, format: 'number' },
      { key: 'shippedQty', label: '已发数量', width: 10, format: 'number' },
      { key: 'deliveryPct', label: '发货率', width: 8 },
      { key: 'settlementAmount', label: '应收', width: 14, format: 'currency' },
      { key: 'paidAmount', label: '已收', width: 14, format: 'currency' },
      { key: 'unpaidAmount', label: '未收', width: 14, format: 'currency' },
      { key: 'salesman', label: '销售员', width: 10 },
      { key: 'remark', label: '备注', width: 24 },
    ], rows);
  }
  return { init };
})();

window.View_settlement_list = (function () {
  function init(ctx) {
    // 调用新的结算中心模块(_lists.js 不再渲染老布局)
    SettlementCenterModule.init(ctx);
  }
  return { init };
})();

window.View_debt_board = (function () {
  function init(ctx) {
    document.getElementById('app-content').innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">${t('debtBoard.title')}</h1>
          <div class="page-subtitle">${t('debtBoard.subtitle')}</div>
        </div>
        <div>
          <button class="btn btn-secondary btn-sm" id="btn-export-debt">${_exportIcon()} 导出 Excel</button>
        </div>
      </div>
      <div class="grid grid-cols-4 gap-3 mb-4" id="kpi-row"></div>
      <div class="grid gap-3 mb-4" style="grid-template-columns: 2fr 1fr;">
        <div class="card">
          <div class="card-header"><div class="card-title">${t('debtBoard.agingTitle')}</div></div>
          <div class="card-body" id="aging-content"></div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">${t('debtBoard.riskDistTitle')}</div></div>
          <div class="card-body" id="risk-dist-content"></div>
        </div>
      </div>
      <div class="grid gap-3 mb-4" style="grid-template-columns: 2fr 1fr;">
        <div class="card">
          <div class="card-header">
            <div class="card-title">${t('debtBoard.topDebtorsTitle')}</div>
            <span class="text-muted" style="font-size:11px;">${t('debtBoard.topDebtorsSubtitle')}</span>
          </div>
          <div id="top-debtors-content" style="overflow-x:auto;"></div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">${t('debtBoard.trendTitle')}</div></div>
          <div class="card-body" id="trend-content"></div>
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <div class="card-title">${t('debtBoard.overdueListTitle')}</div>
          <span class="text-muted" style="font-size:11px;">${t('debtBoard.overdueListSubtitle')}</span>
        </div>
        <div id="overdue-content" style="overflow-x:auto;"></div>
      </div>
    `;
    DebtBoardModule.init();
    document.getElementById('btn-export-debt').addEventListener('click', exportDebt);
  }
  function exportDebt() {
    const overdueSetts = SettlementRepo.list().filter(s =>
      s.status === 'overdue' || (s.status === 'confirmed' && s.dueDate && s.dueDate < Utils.today())
    );
    const rows = overdueSetts.map(s => {
      const cust = CustomerRepo.find(s.customerId) || {};
      const payable = s.payableAmount || 0;
      const paid = s.paidAmount || 0;
      const today = new Date(Utils.today());
      const due = s.dueDate ? new Date(s.dueDate) : null;
      const overdueDays = due ? Math.max(0, Math.floor((today - due) / 86400000)) : 0;
      let agingBucket;
      if (overdueDays === 0) agingBucket = '未逾期';
      else if (overdueDays <= 30) agingBucket = '1-30 天';
      else if (overdueDays <= 60) agingBucket = '31-60 天';
      else if (overdueDays <= 90) agingBucket = '61-90 天';
      else agingBucket = '90+ 天';
      return {
        customer: cust.name || '-',
        customerCode: cust.code || '-',
        contactName: cust.contactName || '',
        phone: cust.phone || '',
        settlementNo: s.no,
        settlementDate: s.settlementDate,
        dueDate: s.dueDate || '-',
        overdueDays,
        agingBucket,
        payableAmount: payable,
        paidAmount: paid,
        unpaidAmount: payable - paid,
        riskLevel: cust.riskLevel || '-',
      };
    }).sort((a, b) => b.overdueDays - a.overdueDays);
    ExcelExporter.exportSheet('欠款催收_' + Utils.today(), '催收清单', [
      { key: 'customer', label: '客户', width: 16 },
      { key: 'customerCode', label: '编号', width: 12 },
      { key: 'contactName', label: '联系人', width: 12 },
      { key: 'phone', label: '电话', width: 14 },
      { key: 'settlementNo', label: '结算单号', width: 18 },
      { key: 'settlementDate', label: '结算日', width: 12, format: 'date' },
      { key: 'dueDate', label: '到期日', width: 12, format: 'date' },
      { key: 'overdueDays', label: '逾期天数', width: 10, format: 'number' },
      { key: 'agingBucket', label: '账龄', width: 10 },
      { key: 'payableAmount', label: '应收', width: 14, format: 'currency' },
      { key: 'paidAmount', label: '已收', width: 14, format: 'currency' },
      { key: 'unpaidAmount', label: '未收', width: 14, format: 'currency' },
      { key: 'riskLevel', label: '风险等级', width: 10 },
    ], rows);
  }
  return { init };
})();

// ====== 仓储 list views ======

window.View_warehouse_list = (function () {
  function init(ctx) {
    document.getElementById('app-content').innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">${t('warehouse.title')}</h1>
          <div class="page-subtitle">${t('warehouse.subtitle')}</div>
        </div>
      </div>
      <div id="wh-table"></div>
    `;
    WarehousesModule.init();
  }
  return { init };
})();

window.View_inventory_list = (function () {
  function init(ctx) {
    document.getElementById('app-content').innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">${t('inventory.title')}</h1>
          <div class="page-subtitle">${t('inventory.subtitle')}</div>
        </div>
        <div class="flex gap-2">
          <button class="btn btn-secondary btn-sm" id="btn-export-inv">${_exportIcon()} 导出 Excel</button>
          <button class="btn btn-primary" data-action="open-inbound">${t('inbound.new')}</button>
          <button class="btn btn-secondary" data-action="open-adjust">${t('inventory.adjust') || '+ 调整'}</button>
          <button class="btn btn-secondary" data-action="open-transfer">${t('inventory.transfer') || '+ 调拨'}</button>
        </div>
      </div>
      <div class="grid grid-cols-4 gap-3 mb-4" id="kpi-row"></div>
      <div id="inventory-table"></div>
    `;
    InventoryModule.init();
    document.querySelector('[data-action="open-inbound"]').addEventListener('click', () => InventoryModule.openInboundFromTop());
    document.querySelector('[data-action="open-adjust"]').addEventListener('click', () => InventoryModule.openAdjustFromTop());
    document.querySelector('[data-action="open-transfer"]').addEventListener('click', () => InventoryModule.openTransferFromTop());
    document.getElementById('btn-export-inv').addEventListener('click', () => {
      const inv = InventoryRepo.list();
      const rows = inv.map(i => {
        const m = MaterialRepo.find(i.materialId) || {};
        const wh = WarehouseRepo.find(i.warehouseId) || {};
        const available = (i.quantity || 0) - (i.lockedQuantity || 0);
        const isLow = m.safetyStock && available < (i.safetyStock || m.safetyStock || 0);
        return {
          material: m.name || '-',
          spec: m.spec || '',
          unit: m.unit || '',
          warehouse: wh.name || '-',
          quantity: i.quantity || 0,
          locked: i.lockedQuantity || 0,
          available,
          avgCost: i.avgCost || 0,
          totalValue: (i.avgCost || 0) * (i.quantity || 0),
          safetyStock: i.safetyStock || 0,
          status: isLow ? '低库存' : '正常',
        };
      });
      ExcelExporter.exportSheet('库存_' + Utils.today(), '库存列表', [
        { key: 'material', label: '物料名', width: 24 },
        { key: 'spec', label: '规格', width: 18 },
        { key: 'unit', label: '单位', width: 8 },
        { key: 'warehouse', label: '仓库', width: 10 },
        { key: 'quantity', label: '在库数量', width: 12, format: 'number' },
        { key: 'locked', label: '已锁定', width: 10, format: 'number' },
        { key: 'available', label: '可用', width: 10, format: 'number' },
        { key: 'avgCost', label: '加权成本', width: 12, format: 'currency' },
        { key: 'totalValue', label: '库存总值', width: 14, format: 'currency' },
        { key: 'safetyStock', label: '安全库存', width: 10, format: 'number' },
        { key: 'status', label: '状态', width: 10 },
      ], rows);
    });
  }
  return { init };
})();

window.View_movement_list = (function () {
  function init(ctx) {
    document.getElementById('app-content').innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">${t('stockMovement.title')}</h1>
          <div class="page-subtitle">${t('stockMovement.subtitle')}</div>
        </div>
        <div>
          <button class="btn btn-secondary btn-sm" id="btn-export-mv">${_exportIcon()} 导出 Excel</button>
        </div>
      </div>
      <div class="grid grid-cols-4 gap-3 mb-4" id="kpi-row"></div>
      <div id="mv-table"></div>
    `;
    MovementsModule.init();
    document.getElementById('btn-export-mv').addEventListener('click', () => {
      const movements = StockMovementRepo.list().sort((a,b) => (b.movedAt||b.createdAt||'').localeCompare(a.movedAt||a.createdAt||''));
      const typeLabel = {
        adjust_in: '调整入', adjust_out: '调整出', inbound: '采购入库',
        outbound: '销售出库', pick: '拣货出库', transfer_in: '调拨入',
        transfer_out: '调拨出', stock_take: '盘点调整',
      };
      const rows = movements.map(m => {
        const mat = MaterialRepo.find(m.materialId) || {};
        const wh = WarehouseRepo.find(m.warehouseId) || {};
        return {
          no: m.no,
          movedAt: m.movedAt || m.createdAt,
          type: typeLabel[m.movementType] || m.movementType,
          material: mat.name,
          spec: mat.spec || '',
          warehouse: wh.name,
          quantity: m.quantity,
          unitCost: m.unitCost || 0,
          totalCost: m.totalCost || 0,
          sourceNo: m.sourceNo || '-',
          remark: m.remark || '',
        };
      });
      ExcelExporter.exportSheet('库存流水_' + Utils.today(), '库存流水', [
        { key: 'no', label: '流水号', width: 18 },
        { key: 'movedAt', label: '日期', width: 12, format: 'date' },
        { key: 'type', label: '类型', width: 10 },
        { key: 'material', label: '物料', width: 22 },
        { key: 'spec', label: '规格', width: 18 },
        { key: 'warehouse', label: '仓库', width: 10 },
        { key: 'quantity', label: '数量', width: 10, format: 'number' },
        { key: 'unitCost', label: '单价', width: 10, format: 'currency' },
        { key: 'totalCost', label: '总额', width: 14, format: 'currency' },
        { key: 'sourceNo', label: '关联单据', width: 16 },
        { key: 'remark', label: '备注', width: 24 },
      ], rows);
    });
  }
  return { init };
})();

window.View_stock_taking_list = (function () {
  function init(ctx) {
    document.getElementById('app-content').innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">${t('stockTaking.title')}</h1>
          <div class="page-subtitle">${t('stockTaking.subtitle')}</div>
        </div>
      </div>
      <div class="grid grid-cols-4 gap-3 mb-4" id="kpi-row"></div>
      <div id="stk-table"></div>
    `;
    StockTakingsModule.init();
  }
  return { init };
})();

window.View_inbound_list = (function () {
  function init(ctx) {
    document.getElementById('app-content').innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">${t('inbound.title')}</h1>
          <div class="page-subtitle">${t('inbound.subtitle')}</div>
        </div>
        <div class="flex gap-2">
          <button class="btn btn-primary" data-action="inbound-new">${t('inbound.new')}</button>
        </div>
      </div>
      <div class="grid grid-cols-3 gap-3 mb-4" id="kpi-row"></div>
      <div id="inbound-table"></div>
    `;
    InboundListModule.init();
    document.querySelector('[data-action="inbound-new"]').addEventListener('click', () => {
      InventoryModule.openInboundFromTop();
    });
  }
  return { init };
})();

window.View_finance_center = (function () {
  function init(ctx) {
    FinanceCenterModule.init(ctx);
  }
  return { init };
})();

window.View_sales_board = (function () {
  function init(ctx) {
    document.getElementById('app-content').innerHTML = '';
    SalesBoardModule.init(ctx);
  }
  return { init };
})();

window.View_product_list = (function () {
  function init(ctx) {
    ProductListModule.init(ctx);
  }
  return { init };
})();

window.View_inbox_view = (function () {
  function init(ctx) {
    InboxViewModule.init(ctx);
  }
  return { init };
})();

// 新模块:出库/发货 + 物流管理
window.View_outbound_list = (function () {
  function init(ctx) {
    OutboundModule.init(ctx);
  }
  return { init };
})();

window.View_logistics_list = (function () {
  function init(ctx) {
    LogisticsModule.init(ctx);
  }
  return { init };
})();

window.View_logistics_detail = (function () {
  function init(ctx) {
    LogisticsDetailModule.init(ctx);
  }
  return { init };
})();
