/**
 * Toast 消息提示
 * @module components/toast
 *
 * 用法:
 *   Toast.success('保存成功');
 *   Toast.error('保存失败');
 *   Toast.warning('注意');
 *   Toast.info('提示');
 */

const Toast = (function () {
  'use strict';

  let _container = null;

  function _ensureContainer() {
    if (!_container) {
      _container = document.createElement('div');
      _container.className = 'toast-container';
      document.body.appendChild(_container);
    }
    return _container;
  }

  function show(message, type = 'info', duration = 3000) {
    const container = _ensureContainer();
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.transition = 'opacity 0.3s ease';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  return {
    show,
    success: (msg, duration) => show(msg, 'success', duration),
    error: (msg, duration) => show(msg, 'error', duration),
    warning: (msg, duration) => show(msg, 'warning', duration),
    info: (msg, duration) => show(msg, 'info', duration),
  };
})();

window.Toast = Toast;
