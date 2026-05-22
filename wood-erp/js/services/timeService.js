/**
 * TimeService - 时间戳生成
 * @module services/timeService
 *
 * 设计意图:
 *   单机:用客户端时间(可能跟服务器差几小时)
 *   云端:状态更改时间应该用服务端时间(避免客户端时钟篡改 + 一致性)
 *
 * 用法:
 *   TimeService.now()      // ISO 字符串(2026-05-19T08:30:00.000Z)
 *   TimeService.today()    // 日期 YYYY-MM-DD
 *   TimeService.nowMinutePrecision() // 精确到分钟(秒清零),用于发车时间
 */

const TimeService = (function () {
  'use strict';

  /** 当前时间(ISO) - 上云时:用服务端返回的时间 */
  function now() {
    return Utils.now();
  }

  /** 当前日期 - 上云时:用服务端日期 */
  function today() {
    return Utils.today();
  }

  /** 精确到分钟的当前时间(秒清零) — 用于发车/签收 */
  function nowMinutePrecision() {
    const d = new Date();
    d.setSeconds(0, 0);
    return d.toISOString();
  }

  return { now, today, nowMinutePrecision };
})();

window.TimeService = TimeService;
