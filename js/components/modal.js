/**
 * Modal 弹窗组件
 * @module components/modal
 *
 * 用法:
 *   Modal.open({
 *     title: '编辑客户',
 *     content: '<div>...</div>',  // 或 HTMLElement
 *     width: 600,
 *     buttons: [
 *       { label: '取消', onClick: () => Modal.close() },
 *       { label: '保存', primary: true, onClick: () => { ... } },
 *     ],
 *   });
 *
 *   Modal.close();
 *   Modal.confirm({ title, message, onConfirm });
 */

const Modal = (function () {
  'use strict';

  let _root = null;

  function _ensureRoot() {
    if (!_root) {
      _root = document.createElement('div');
      _root.id = 'modal-root';
      document.body.appendChild(_root);
    }
    return _root;
  }

  function open(config) {
    const root = _ensureRoot();
    const width = config.width || 480;

    // Bug 修复:打开新弹窗前先关掉所有旧弹窗,避免 getElementById 取到旧 DOM
    close();

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal" style="width:${width}px;">
        <div class="modal-header">
          <div class="modal-title">${config.title || ''}</div>
          <span class="modal-close" data-modal-close>×</span>
        </div>
        <div class="modal-body" data-modal-body></div>
        ${(config.buttons && config.buttons.length) ? `
          <div class="modal-footer" data-modal-footer></div>
        ` : ''}
      </div>
    `;
    root.appendChild(backdrop);

    // 内容
    const bodyEl = backdrop.querySelector('[data-modal-body]');
    if (typeof config.content === 'string') {
      bodyEl.innerHTML = config.content;
    } else if (config.content instanceof HTMLElement) {
      bodyEl.appendChild(config.content);
    }

    // 按钮
    if (config.buttons) {
      const footerEl = backdrop.querySelector('[data-modal-footer]');
      config.buttons.forEach((btn, idx) => {
        const b = document.createElement('button');
        b.className = `btn ${btn.primary ? 'btn-primary' : 'btn-secondary'} ${btn.danger ? 'btn-danger' : ''}`;
        b.textContent = btn.label;
        b.addEventListener('click', () => {
          if (btn.onClick) {
            const result = btn.onClick(backdrop);
            if (result !== false) close();
          } else close();
        });
        footerEl.appendChild(b);
      });
    }

    // 关闭事件
    backdrop.querySelector('[data-modal-close]').addEventListener('click', close);
    // Bug 修复:只有 mousedown + mouseup 都在 backdrop 上才关闭
    // (避免在 input 里选中文字拖到外面时误关闭)
    let _mouseDownOnBackdrop = false;
    backdrop.addEventListener('mousedown', (e) => {
      _mouseDownOnBackdrop = (e.target === backdrop);
    });
    backdrop.addEventListener('mouseup', (e) => {
      if (e.target === backdrop && _mouseDownOnBackdrop && config.closeOnBackdrop !== false) {
        close();
      }
      _mouseDownOnBackdrop = false;
    });

    // 回调
    if (config.onOpen) config.onOpen(backdrop);

    return backdrop;
  }

  function close() {
    if (!_root) return;
    const backdrops = _root.querySelectorAll('.modal-backdrop');
    backdrops.forEach(b => b.remove());
  }

  function confirm(config) {
    open({
      title: config.title || '确认',
      width: 380,
      content: `<div style="color: var(--text-2); font-size: 13px; line-height:1.6;">${config.message || ''}</div>`,
      buttons: [
        { label: config.cancelText || '取消' },
        {
          label: config.confirmText || '确定',
          primary: !config.danger,
          danger: config.danger,
          onClick: () => {
            if (config.onConfirm) config.onConfirm();
          }
        },
      ],
    });
  }

  return { open, close, confirm };
})();

window.Modal = Modal;
