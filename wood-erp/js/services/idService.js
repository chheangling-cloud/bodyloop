/**
 * IdService - 业务单号/UUID 生成
 * @module services/idService
 *
 * 设计意图:
 *   单机:本地生成单号(SO-20260519-001 / V-001 / UUID)
 *   云端:全部改用服务端生成(避免并发重号)
 *
 * 用法:
 *   IdService.uuid()           // 通用 UUID
 *   IdService.bizNo('SO')      // 业务单号:SO-20260519-001
 *   IdService.bizNo('SO', date) // 指定日期的单号
 *   IdService.vehicleNo()      // 车辆编号:V-001
 */

const IdService = (function () {
  'use strict';

  /** 通用 UUID (云端用 server-side UUID v4 / nanoid) */
  function uuid() {
    return Utils.uuid();
  }

  /**
   * 业务单号:PREFIX-YYYYMMDD-NNN
   * 云端时改为:await api.post('/biz-no', { prefix, date })
   */
  function bizNo(prefix, date) {
    const dateObj = date instanceof Date ? date : (date ? new Date(date) : new Date());
    return idGenerator.next(prefix, dateObj);
  }

  /** 车辆编号 V-001 */
  function vehicleNo() {
    const existing = VehicleRepo.list().filter(v => v.no?.startsWith('V-'));
    const maxN = existing.reduce((m, v) => Math.max(m, parseInt(v.no.split('-')[1]) || 0), 0);
    return `V-${String(maxN + 1).padStart(3, '0')}`;
  }

  /** 客户编号 C-2025-001 */
  function customerNo() {
    const existing = CustomerRepo.list().filter(c => c.code?.startsWith('C-'));
    const year = new Date().getFullYear();
    const sameYear = existing.filter(c => c.code.startsWith(`C-${year}-`));
    const maxN = sameYear.reduce((m, c) => Math.max(m, parseInt(c.code.split('-')[2]) || 0), 0);
    return `C-${year}-${String(maxN + 1).padStart(3, '0')}`;
  }

  return { uuid, bizNo, vehicleNo, customerNo };
})();

window.IdService = IdService;
