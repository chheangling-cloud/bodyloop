/**
 * AttachmentViewer - 附件画廊 + lightbox
 * @module components/attachmentViewer
 *
 * 用法 1: 渲染画廊
 *   AttachmentViewer.renderGallery(mountEl, attachments)
 *
 * 用法 2: 弹大图
 *   AttachmentViewer.open(attachment)
 */

const AttachmentViewer = (function () {
  'use strict';

  function renderGallery(mountEl, attachments) {
    if (!mountEl) return;
    if (!attachments || attachments.length === 0) {
      mountEl.innerHTML = '';
      return;
    }
    const isZh = I18n.get() === 'zh-CN';
    mountEl.innerHTML = `
      <div class="att-gallery">
        ${attachments.map(a => `
          <div class="att-gallery-item" data-att-view="${a.id}" title="${a.caption || a.filename || ''}">
            <img src="${a.thumbnailUrl || a.url}" alt="">
            ${a.caption ? `<div class="att-gallery-caption">${a.caption}</div>` : ''}
          </div>
        `).join('')}
      </div>
    `;
    mountEl.querySelectorAll('[data-att-view]').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.attView;
        const att = AttachmentService.findById(id);
        if (att) open(att);
      });
    });
  }

  function open(attachment) {
    const isZh = I18n.get() === 'zh-CN';
    Modal.open({
      title: attachment.filename || (isZh?'附件':'Attachment'),
      width: 720,
      content: `
        <div style="text-align:center;">
          <img src="${attachment.url}" style="max-width:100%; max-height:60vh; border-radius:6px;" alt="">
        </div>
        ${attachment.caption ? `<div style="margin-top:10px; padding:10px; background:var(--bg-3); border-radius:4px; font-size:12px; color:var(--text-2);">${attachment.caption}</div>` : ''}
        <div style="margin-top:10px; font-size:11px; color:var(--text-3); display:flex; justify-content:space-between;">
          <span>${attachment.uploadedByName || attachment.uploadedBy}</span>
          <span>${Utils.formatDate(attachment.uploadedAt)}</span>
        </div>
      `,
      buttons: [{ label: isZh?'关闭':'Close', primary: true }],
    });
  }

  return { renderGallery, open };
})();

window.AttachmentViewer = AttachmentViewer;
