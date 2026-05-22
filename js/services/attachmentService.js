/**
 * AttachmentService - 附件管理服务(端口适配器模式)
 * @module services/attachmentService
 *
 * 上云就绪设计:
 *   UI 永远调 AttachmentService.upload(file, ctx)
 *   底层 StorageAdapter 可热切换
 *     - 现在: LocalStorageAdapter (base64 写 localStorage)
 *     - 将来: S3Adapter / CloudinaryAdapter (POST 到云存储)
 *
 * 上云迁移只需改 StorageAdapter 一个文件,业务代码零改动。
 *
 * Attachment 数据结构:
 * {
 *   id, entityType, entityId, taskId,
 *   filename, mimeType, size,
 *   url,                  // 缩略图/原图 URL (本地是 data:image/...)
 *   thumbnailUrl,         // 缩略图 (LocalStorageAdapter 中 = url)
 *   caption, uploadedBy, uploadedByName, uploadedAt,
 *   is_archived
 * }
 */

const AttachmentService = (function () {
  'use strict';

  const TABLE = 'attachments';

  // ============== Storage Adapters ==============

  /**
   * LocalStorageAdapter
   * 把文件压缩成 base64 存 DB.attachments 表
   * 上云时换 S3Adapter 实现 putObject + getSignedUrl 即可
   */
  const LocalStorageAdapter = {
    name: 'local',

    /**
     * @param {File} file
     * @returns {Promise<{url, thumbnailUrl, size, mimeType}>}
     */
    async upload(file) {
      // 压缩图片到 800px + 70% 质量,base64 通常控制在 200KB 以内
      if (file.type.startsWith('image/')) {
        const dataUrl = await _compressImage(file, 800, 0.7);
        return {
          url: dataUrl,
          thumbnailUrl: dataUrl,
          size: Math.round(dataUrl.length * 0.75),  // base64 估算
          mimeType: file.type,
        };
      }
      // 非图片直接 base64(简单实现,实际项目应拦截)
      const dataUrl = await _fileToDataUrl(file);
      return { url: dataUrl, thumbnailUrl: null, size: file.size, mimeType: file.type };
    },

    async delete(/*url*/) {
      // localStorage 里没有"删 url",数据在 DB 里
      return true;
    },
  };

  /**
   * S3Adapter (示意未实现,上云时换上)
   *
   * async upload(file) {
   *   const formData = new FormData();
   *   formData.append('file', file);
   *   const r = await fetch('/api/upload', { method: 'POST', body: formData });
   *   const { url, thumbnailUrl } = await r.json();
   *   return { url, thumbnailUrl, size: file.size, mimeType: file.type };
   * }
   */

  let _adapter = LocalStorageAdapter;
  function useAdapter(adapter) { _adapter = adapter; }

  // ============== 图片压缩工具 ==============

  function _compressImage(file, maxWidth, quality) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let w = img.width, h = img.height;
          if (w > maxWidth) {
            h = h * (maxWidth / w);
            w = maxWidth;
          }
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function _fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = e => resolve(e.target.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  // ============== 公共 API ==============

  /**
   * 上传附件
   * @param {File} file
   * @param {{ entityType, entityId, taskId?, caption? }} ctx
   * @returns {Promise<attachment>}
   */
  async function upload(file, ctx) {
    if (!file) throw new Error('file 必填');
    if (!ctx || !ctx.entityType || !ctx.entityId) throw new Error('ctx.entityType + entityId 必填');

    const uploaded = await _adapter.upload(file);
    const cur = (typeof Session !== 'undefined') ? Session.snapshot() : { operatorId: 'system', operatorName: 'System' };

    const attachment = {
      id: 'att_' + Utils.uuid().slice(0, 8),
      entityType: ctx.entityType,        // 'order' | 'task' | 'delivery' | 'settlement' | 'payment' | 'customer'
      entityId: ctx.entityId,
      taskId: ctx.taskId || null,
      filename: file.name,
      mimeType: uploaded.mimeType,
      size: uploaded.size,
      url: uploaded.url,
      thumbnailUrl: uploaded.thumbnailUrl || uploaded.url,
      caption: ctx.caption || '',
      uploadedBy: cur.operatorId,
      uploadedByName: cur.operatorName,
      uploadedAt: Utils.now(),
      is_archived: false,
    };

    AttachmentRepo.create(attachment);

    if (typeof EventBus !== 'undefined') {
      EventBus.emit('attachment.uploaded', attachment);
    }
    return attachment;
  }

  /**
   * 批量上传(多文件)
   */
  async function uploadMany(files, ctx) {
    const out = [];
    for (const f of Array.from(files)) {
      try {
        const a = await upload(f, ctx);
        out.push(a);
      } catch (e) {
        console.warn('上传失败:', f.name, e);
      }
    }
    return out;
  }

  /**
   * 查附件
   */
  function list({ entityType, entityId, taskId, includeArchived } = {}) {
    let results = AttachmentRepo.list();
    if (entityType) results = results.filter(a => a.entityType === entityType);
    if (entityId)   results = results.filter(a => a.entityId === entityId);
    if (taskId)     results = results.filter(a => a.taskId === taskId);
    if (!includeArchived) results = results.filter(a => !a.is_archived);
    return results.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  }

  function findById(id) { return AttachmentRepo.find(id); }

  /**
   * 删除附件(软删除)
   */
  function archive(id) {
    const a = AttachmentRepo.find(id);
    if (!a) throw new Error('附件不存在');
    const cur = Session.snapshot();
    AttachmentRepo.update(id, {
      is_archived: true,
      archived_at: Utils.now(),
      archived_by: cur.operatorId,
    });
    EventBus.emit('attachment.archived', { id });
    return true;
  }

  /**
   * 配额检查(避免超出 localStorage 限制)
   * 本地 5MB 上限,每张图压缩后约 100-200KB,大概 25 张
   */
  function getQuotaUsage() {
    const all = AttachmentRepo.list().filter(a => !a.is_archived);
    const totalSize = all.reduce((s, a) => s + (a.size || 0), 0);
    return {
      count: all.length,
      totalSize,
      humanSize: _humanSize(totalSize),
      approxLimit: '5MB',
      isNearLimit: totalSize > 4 * 1024 * 1024,
    };
  }

  function _humanSize(bytes) {
    if (bytes < 1024) return bytes + 'B';
    if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + 'KB';
    return (bytes/1024/1024).toFixed(2) + 'MB';
  }

  return {
    upload, uploadMany,
    list, findById, archive,
    getQuotaUsage,
    useAdapter,
    LocalStorageAdapter,
  };
})();

window.AttachmentService = AttachmentService;
