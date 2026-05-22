/**
 * 事件总线
 * @module core/eventBus
 *
 * 用于模块间解耦通信。
 * 例如:发货模块发出 delivery.created 事件,
 *       结算模块、库存模块、Dashboard 各自订阅。
 *
 * 未来重构时,这部分可以替换为:
 * - 后端的消息队列(RabbitMQ / Kafka)
 * - 前端的状态管理库(Pinia / Redux)
 */

const EventBus = (function () {
  'use strict';

  const listeners = {}; // { eventName: [handler1, handler2] }

  /**
   * 订阅事件
   * @param {string} eventName
   * @param {Function} handler
   * @returns {Function} 取消订阅的函数
   */
  function on(eventName, handler) {
    if (!listeners[eventName]) listeners[eventName] = [];
    listeners[eventName].push(handler);
    return () => off(eventName, handler);
  }

  /** 取消订阅 */
  function off(eventName, handler) {
    if (!listeners[eventName]) return;
    listeners[eventName] = listeners[eventName].filter(h => h !== handler);
  }

  /**
   * 发布事件(同步)
   * @param {string} eventName
   * @param {*} payload
   */
  function emit(eventName, payload) {
    if (!listeners[eventName]) return;
    listeners[eventName].forEach(handler => {
      try {
        handler(payload);
      } catch (e) {
        console.error(`[EventBus] 事件 ${eventName} 处理器异常:`, e);
      }
    });
    // 调试日志(生产可关闭)
    if (window.__ERP_DEBUG__) {
      console.log(`[EventBus] ${eventName}`, payload);
    }
  }

  /** 一次性订阅 */
  function once(eventName, handler) {
    const wrapper = (payload) => {
      off(eventName, wrapper);
      handler(payload);
    };
    on(eventName, wrapper);
  }

  /** 清除所有监听 */
  function clear() {
    Object.keys(listeners).forEach(k => delete listeners[k]);
  }

  /** 查看当前注册情况(调试用) */
  function inspect() {
    const result = {};
    Object.keys(listeners).forEach(k => {
      result[k] = listeners[k].length;
    });
    return result;
  }

  return { on, off, emit, once, clear, inspect };
})();

window.EventBus = EventBus;

/**
 * 系统事件清单(供文档参考,不强制执行)
 *
 * 销售模块:
 *   customer.created / customer.updated / customer.locked / customer.unlocked
 *   quotation.created / quotation.sent / quotation.converted
 *   salesOrder.created / salesOrder.confirmed / salesOrder.cancelled / salesOrder.completed
 *   appendix.confirmed
 *   delivery.created / delivery.grouped / delivery.signed
 *   settlement.created / settlement.confirmed / settlement.paid / settlement.partial_paid
 *
 * 其他模块(预留):
 *   inventory.changed / inventory.low_stock
 *   production.completed
 *   transport.signed
 */
