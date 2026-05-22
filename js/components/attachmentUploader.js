/**
 * AttachmentUploader - 附件上传组件
 * @module components/attachmentUploader
 *
 * 用法:
 *   const uploader = AttachmentUploader.create({
 *     mount: '#att-mount',
 *     entityType: 'order',
 *     entityId: 'so_xxx',
 *     taskId: 'task_xxx',   // 可选
 *     placeholder: '上传装车现场照片(可选)',
 *     maxFiles: 5,
 *   });
 *
 *   uploader.getAttachments()  → [att1, att2, ...]
 *   uploader.destroy()
 */

const AttachmentUploader = (function () {
  'use strict';

  function create(opts) {
    const root = (typeof opts.mount === 'string')
      ? document.querySelector(opts.mount)
      : opts.mount;
    if (!root) {
      console.warn('AttachmentUploader: mount 找不到', opts.mount);
      return { getAttachments: () => [], destroy: () => {} };
    }

    const isZh = I18n.get() === 'zh-CN';
    const placeholder = opts.placeholder || (isZh ? '上传附件(可选)' : 'Upload attachments (optional)');
    const maxFiles = opts.maxFiles || 5;
    const ctx = {
      entityType: opts.entityType,
      entityId: opts.entityId,
      taskId: opts.taskId || null,
    };

    // 已上传的附件列表(组件内 state)
    let attachments = [];

    // 渲染初始 UI
    root.innerHTML = `
      <div class="att-uploader">
        <div class="att-drop-zone" data-att-drop>
          <input type="file" multiple accept="image/*" style="display:none;" data-att-input>
          <div class="att-drop-hint">
            <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:.6;">
              <path d="M8 11 V3 M5 6 L8 3 L11 6"/>
              <path d="M2 11 V13 H14 V11"/>
            </svg>
            <div class="att-drop-text">${placeholder}</div>
            <div class="att-drop-sub">${isZh ? '点击选择 / 拖拽上传 · 最多 ' + maxFiles + ' 张' : 'Click or drag · Max ' + maxFiles + ' files'}</div>
          </div>
        </div>
        <div class="att-thumbs" data-att-thumbs></div>
      </div>
    `;

    const dropZone = root.querySelector('[data-att-drop]');
    const input    = root.querySelector('[data-att-input]');
    const thumbs   = root.querySelector('[data-att-thumbs]');

    function refreshThumbs() {
      thumbs.innerHTML = attachments.map((a, idx) => `
        <div class="att-thumb" data-att-idx="${idx}">
          <img src="${a.thumbnailUrl || a.url}" alt="">
          <div class="att-thumb-mask">
            <button class="att-thumb-del" data-att-del="${idx}" title="${isZh?'删除':'Delete'}">×</button>
          </div>
          <input class="att-thumb-caption" placeholder="${isZh?'备注':'Caption'}" value="${a.caption || ''}" data-att-cap="${idx}">
        </div>
      `).join('');
    }

    async function handleFiles(files) {
      if (!files || files.length === 0) return;
      if (attachments.length + files.length > maxFiles) {
        if (typeof Toast !== 'undefined') Toast.warning(isZh ? `最多 ${maxFiles} 张` : `Max ${maxFiles} files`);
        return;
      }
      // 上传中提示
      dropZone.classList.add('att-uploading');
      try {
        for (const f of files) {
          try {
            const att = await AttachmentService.upload(f, ctx);
            attachments.push(att);
          } catch (e) {
            console.warn('上传失败:', f.name, e);
            if (typeof Toast !== 'undefined') Toast.error((isZh?'上传失败: ':'Upload failed: ') + e.message);
          }
        }
        refreshThumbs();
      } finally {
        dropZone.classList.remove('att-uploading');
      }
    }

    // 点击触发文件选择
    dropZone.addEventListener('click', (e) => {
      if (e.target.closest('[data-att-del]')) return;
      if (e.target.closest('.att-thumb')) return;
      input.click();
    });

    // 文件选择
    input.addEventListener('change', (e) => {
      handleFiles(e.target.files);
      input.value = '';   // 允许选同名文件
    });

    // 拖拽
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('att-drag-over');
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('att-drag-over');
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('att-drag-over');
      const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
      handleFiles(files);
    });

    // 删除 / 改备注
    thumbs.addEventListener('click', (e) => {
      const delBtn = e.target.closest('[data-att-del]');
      if (delBtn) {
        const idx = +delBtn.dataset.attDel;
        const a = attachments[idx];
        if (a && a.id) {
          try { AttachmentService.archive(a.id); } catch(_){}
        }
        attachments.splice(idx, 1);
        refreshThumbs();
      }
    });
    thumbs.addEventListener('change', (e) => {
      const inp = e.target.closest('[data-att-cap]');
      if (inp) {
        const idx = +inp.dataset.attCap;
        if (attachments[idx]) {
          attachments[idx].caption = inp.value;
          // 也更新 DB
          if (attachments[idx].id) {
            DB.update('attachments', attachments[idx].id, { caption: inp.value });
          }
        }
      }
    });

    return {
      getAttachments: () => attachments.slice(),
      destroy: () => { root.innerHTML = ''; },
    };
  }

  return { create };
})();

window.AttachmentUploader = AttachmentUploader;
