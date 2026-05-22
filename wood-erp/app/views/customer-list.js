/**
 * View: 客户中心(ERP-Lite 放货控制台)
 */
window.View_customer_list = (function () {
  function init(ctx) {
    // 全部渲染由 module 处理(ERP-Lite 风格)
    document.getElementById('app-content').innerHTML = `<div id="customer-root"></div>`;
    CustomersModule.init();
  }
  return { init };
})();
