// ====================================================
// 详情页 Views
// ====================================================

window.View_order_detail = (function () {
  function init(ctx) {
    document.getElementById('app-content').innerHTML = `
      <div class="page-header" style="margin-bottom: 12px;">
        <div>
          <div style="font-size:11px; color:var(--text-3); margin-bottom:4px;">
            <a href="${Router.href('order-center')}" style="color:var(--text-3); text-decoration:none;">${t('orderCenter.backToList')}</a>
          </div>
        </div>
        <div class="flex gap-2" id="action-buttons"></div>
      </div>
      <div id="order-head"></div>
      <div id="stages-bar"></div>
      <div id="tab-content"></div>
    `;
    OrderDetailV2Module.init(ctx);
  }
  return { init };
})();

window.View_settlement_detail = (function () {
  function init(ctx) {
    document.getElementById('app-content').innerHTML = `
      <div class="page-header">
        <div>
          <div style="font-size:11px; color:var(--text-3); margin-bottom:4px;">
            <a href="${Router.href('settlement-list')}" style="color:var(--text-3); text-decoration:none;">${t('settlement.backToList')}</a>
          </div>
          <h1 class="page-title" id="page-title">-</h1>
          <div class="page-subtitle" id="page-subtitle"></div>
        </div>
        <div class="flex gap-2" id="action-buttons"></div>
      </div>
      <div id="summary-grid"></div>
      <div id="doc-header"></div>
      <div id="main-content"></div>
      <div class="card" style="margin-top:16px;" id="history-card">
        <div class="card-header"><div class="card-title">${t('common.changeHistory')}</div></div>
        <div class="card-body"><ul id="timeline" style="list-style:none; padding:0; margin:0;"></ul></div>
      </div>
    `;
    SettlementDetailModule.init(ctx);
  }
  return { init };
})();

window.View_stock_taking_detail = (function () {
  function init(ctx) {
    // 看老 HTML 知道布局
    document.getElementById('app-content').innerHTML = `
      <div class="page-header">
        <div>
          <div style="font-size:11px; color:var(--text-3); margin-bottom:4px;">
            <a href="${Router.href('stock-taking-list')}" style="color:var(--text-3); text-decoration:none;">${t('stockTaking.backToList')}</a>
          </div>
          <h1 class="page-title" id="page-title">-</h1>
          <div class="page-subtitle" id="page-subtitle"></div>
        </div>
        <div class="flex gap-2" id="action-buttons"></div>
      </div>
      <div id="summary-grid"></div>
      <div id="doc-header"></div>
      <div class="card">
        <div class="card-header">
          <div class="card-title" id="items-title">-</div>
          <button class="btn btn-sm btn-secondary" id="btn-fill-all" style="display:none;">${t('stockTaking.fillAll')}</button>
        </div>
        <div style="overflow-x:auto;">
          <table class="items-table" id="items-table"></table>
        </div>
      </div>
    `;
    StockTakingDetailModule.init(ctx);
  }
  return { init };
})();

window.View_inbound_detail = (function () {
  function init(ctx) {
    document.getElementById('app-content').innerHTML = `
      <div class="page-header">
        <div>
          <div style="font-size:11px; color:var(--text-3); margin-bottom:4px;">
            <a href="${Router.href('inbound-list')}" style="color:var(--text-3); text-decoration:none;">${t('inbound.backToList')}</a>
          </div>
          <h1 class="page-title" id="page-title">-</h1>
          <div class="page-subtitle" id="page-subtitle"></div>
        </div>
        <div class="flex gap-2" id="action-buttons"></div>
      </div>
      <div id="main-content"></div>
    `;
    InboundDetailModule.init(ctx);
  }
  return { init };
})();

window.View_customer_hub = (function () {
  function init(ctx) {
    document.getElementById('app-content').innerHTML = `<div id="customer-hub-root"></div>`;
    CustomerHubModule.init(ctx);
  }
  return { init };
})();

window.View_order_new = (function () {
  function init(ctx) {
    document.getElementById('app-content').innerHTML = `<div id="order-new-root"></div>`;
    OrderNewModule.init(ctx);
  }
  return { init };
})();

window.View_product_detail = (function () {
  function init(ctx) {
    document.getElementById('app-content').innerHTML = '';
    ProductDetailModule.init(ctx);
  }
  return { init };
})();
