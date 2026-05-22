/**
 * 通用工具函数
 * @module core/utils
 * 
 * 用于所有模块共享的纯函数工具,不依赖业务逻辑。
 * 设计原则:函数纯净、无副作用、易测试。
 */

const Utils = (function () {
  'use strict';

  // ========== 金额工具 ==========
  // 系统内部金额一律以"分"(整数)存储,显示时除以 100 转为美元
  // 公司采用美金计价,符号 $

  const CURRENCY_SYMBOL = '$';

  /**
   * 分 → 美元(显示用,带千分位)
   * @param {number} cents 分(整数存储)
   * @param {boolean} withSymbol 是否带 $ 符号
   * @returns {string}
   */
  function formatMoney(cents, withSymbol = true) {
    if (cents === null || cents === undefined || isNaN(cents)) return '-';
    const dollars = (cents / 100).toFixed(2);
    const parts = dollars.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const result = parts.join('.');
    return withSymbol ? `${CURRENCY_SYMBOL}${result}` : result;
  }

  /** 美元 → 分 */
  function dollarsToCents(dollars) {
    if (dollars === null || dollars === undefined || isNaN(dollars)) return 0;
    return Math.round(parseFloat(dollars) * 100);
  }

  // ========== 日期工具 ==========

  /** Date → "YYYY-MM-DD" */
  function formatDate(date) {
    if (!date) return '-';
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '-';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /** Date → "YYYY-MM-DD HH:mm" */
  function formatDateTime(date) {
    if (!date) return '-';
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '-';
    const base = formatDate(d);
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${base} ${h}:${min}`;
  }

  /** 当前 ISO 时间字符串 */
  function now() {
    return new Date().toISOString();
  }

  /** 当前日期 YYYY-MM-DD */
  function today() {
    return formatDate(new Date());
  }

  /** 在指定日期上加 N 天,返回 "YYYY-MM-DD" */
  function addDays(date, days) {
    const d = typeof date === 'string' ? new Date(date) : new Date(date);
    d.setDate(d.getDate() + days);
    return formatDate(d);
  }

  /** 两个日期相差天数(date2 - date1) */
  function diffDays(date1, date2) {
    const d1 = typeof date1 === 'string' ? new Date(date1) : date1;
    const d2 = typeof date2 === 'string' ? new Date(date2) : date2;
    const ms = d2.getTime() - d1.getTime();
    return Math.floor(ms / (1000 * 60 * 60 * 24));
  }

  // ========== 对象工具 ==========

  /** 深拷贝(纯 JSON 数据,不含函数/循环引用) */
  function deepClone(obj) {
    if (obj === null || obj === undefined) return obj;
    return JSON.parse(JSON.stringify(obj));
  }

  /** 数组求和 */
  function sum(arr, fieldName) {
    if (!Array.isArray(arr)) return 0;
    if (!fieldName) return arr.reduce((s, v) => s + (Number(v) || 0), 0);
    return arr.reduce((s, item) => s + (Number(item[fieldName]) || 0), 0);
  }

  /** 数组去重 */
  function unique(arr) {
    return [...new Set(arr)];
  }

  /** 数组按字段分组 */
  function groupBy(arr, fieldName) {
    const result = {};
    arr.forEach(item => {
      const key = item[fieldName];
      if (!result[key]) result[key] = [];
      result[key].push(item);
    });
    return result;
  }

  // ========== 字符串工具 ==========

  /** 生成 UUID(简版,够 Demo 用) */
  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /** 模糊匹配(忽略大小写,用于搜索) */
  function fuzzyMatch(text, keyword) {
    if (!keyword) return true;
    if (!text) return false;
    return String(text).toLowerCase().includes(String(keyword).toLowerCase());
  }

  // ========== 数字工具 ==========

  /** 安全的百分比计算 */
  function percent(numerator, denominator, decimals = 1) {
    if (!denominator || denominator === 0) return 0;
    return Number(((numerator / denominator) * 100).toFixed(decimals));
  }

  /** 数字千分位格式化 */
  function formatNumber(num) {
    if (num === null || num === undefined || isNaN(num)) return '-';
    return String(num).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  // ========== 防抖(用于搜索框) ==========

  function debounce(fn, delay = 300) {
    let timer = null;
    return function (...args) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  // 暴露 API
  return {
    // 金额
    formatMoney,
    yuanToCents: dollarsToCents,   // 兼容旧调用(后续可移除)
    dollarsToCents,
    // 日期
    formatDate,
    formatDateTime,
    now,
    today,
    addDays,
    diffDays,
    // 对象/数组
    deepClone,
    sum,
    unique,
    groupBy,
    // 字符串
    uuid,
    fuzzyMatch,
    // 数字
    percent,
    formatNumber,
    // 函数
    debounce,
  };
})();

// 暴露到全局(Demo 阶段无模块系统)
window.Utils = Utils;
