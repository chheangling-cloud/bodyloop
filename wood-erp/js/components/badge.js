/**
 * 状态徽章组件
 * @module components/badge
 *
 * 从 schema.js 读取枚举定义,自动渲染标签和颜色。
 * 用法:
 *   Badge.render('salesOrder', 'statusEnum', 'confirmed')
 *   → <span class="badge blue">已确认</span>
 */

const Badge = (function () {
  'use strict';

  /**
   * 渲染一个状态徽章
   * @param {string} entityName  实体名,如 'salesOrder'
   * @param {string} enumKey     枚举字段名,如 'statusEnum'
   * @param {string} value       值,如 'confirmed'
   * @param {object} options     { noDot, customLabel }
   * @returns {string} HTML 字符串
   */
  function render(entityName, enumKey, value, options = {}) {
    const schema = SCHEMAS[entityName];
    if (!schema || !schema[enumKey]) {
      return `<span class="badge slate">${value || '-'}</span>`;
    }
    const def = schema[enumKey][value];
    if (!def) {
      return `<span class="badge slate">${value || '-'}</span>`;
    }
    // 优先用 i18n 翻译,没翻译则回退到 schema label
    const label = options.customLabel
      || (window.I18n ? I18n.tEnum(entityName, enumKey, value) : def.label);
    const dotClass = options.noDot ? ' no-dot' : '';
    return `<span class="badge ${def.color}${dotClass}">${label}</span>`;
  }

  /** 简化版:直接用颜色和文字 */
  function renderSimple(color, label, options = {}) {
    const dotClass = options.noDot ? ' no-dot' : '';
    return `<span class="badge ${color}${dotClass}">${label}</span>`;
  }

  /** 获取枚举的颜色 */
  function getColor(entityName, enumKey, value) {
    const schema = SCHEMAS[entityName];
    if (!schema || !schema[enumKey] || !schema[enumKey][value]) return 'slate';
    return schema[enumKey][value].color;
  }

  /** 获取枚举的标签 */
  function getLabel(entityName, enumKey, value) {
    const schema = SCHEMAS[entityName];
    if (!schema || !schema[enumKey] || !schema[enumKey][value]) return value || '-';
    return window.I18n ? I18n.tEnum(entityName, enumKey, value) : schema[enumKey][value].label;
  }

  return { render, renderSimple, getColor, getLabel };
})();

window.Badge = Badge;
