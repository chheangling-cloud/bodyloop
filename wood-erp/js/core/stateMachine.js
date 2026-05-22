/**
 * 状态机引擎
 * @module core/stateMachine
 *
 * 用于校验单据状态转换的合法性。
 * 所有业务单据(订单/发货/结算等)都通过此引擎管理状态。
 *
 * 用法:
 *   const sm = StateMachine.create(SCHEMAS.salesOrder.stateMachine);
 *   sm.canTransition('draft', 'confirmed');  // true
 *   sm.transition('draft', 'confirmed');     // 'confirmed'
 *
 * 状态机定义格式见 models/schema.js
 */

const StateMachine = (function () {
  'use strict';

  /**
   * 创建一个状态机实例
   * @param {object} definition 状态机定义
   *   {
   *     initial: 'draft',
   *     states: {
   *       draft:     { transitions: { confirm: 'confirmed', cancel: 'cancelled' } },
   *       confirmed: { transitions: { ... } },
   *       ...
   *     }
   *   }
   */
  function create(definition) {
    if (!definition || !definition.states) {
      throw new Error('StateMachine: 缺少 states 定义');
    }

    /**
     * 当前状态是否可转到目标状态
     * @param {string} fromState
     * @param {string} toState
     */
    function canTransition(fromState, toState) {
      const stateConfig = definition.states[fromState];
      if (!stateConfig) return false;
      const transitions = stateConfig.transitions || {};
      return Object.values(transitions).includes(toState);
    }

    /**
     * 当前状态可触发的所有动作
     * @param {string} fromState
     * @returns {Array<{ action, to }>}
     */
    function availableActions(fromState) {
      const stateConfig = definition.states[fromState];
      if (!stateConfig) return [];
      const transitions = stateConfig.transitions || {};
      return Object.entries(transitions).map(([action, to]) => ({ action, to }));
    }

    /**
     * 执行状态转换
     * @param {string} fromState
     * @param {string} action 动作名(如 "confirm")
     * @returns {string} 新状态
     */
    function transition(fromState, action) {
      const stateConfig = definition.states[fromState];
      if (!stateConfig) throw new Error(`未知状态: ${fromState}`);
      const transitions = stateConfig.transitions || {};
      const toState = transitions[action];
      if (!toState) throw new Error(`状态 ${fromState} 不允许动作 ${action}`);
      return toState;
    }

    /** 获取所有状态列表 */
    function allStates() {
      return Object.keys(definition.states);
    }

    /** 状态是否为终态(无后续转换) */
    function isFinal(state) {
      const stateConfig = definition.states[state];
      if (!stateConfig) return false;
      return Object.keys(stateConfig.transitions || {}).length === 0;
    }

    return {
      definition,
      canTransition,
      transition,
      availableActions,
      allStates,
      isFinal,
      initial: definition.initial,
    };
  }

  return { create };
})();

window.StateMachine = StateMachine;
