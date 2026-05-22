/**
 * i18n 核心
 * @module core/i18n
 *
 * 用法:
 *   t('common.save')           → '保存' 或 'Save'
 *   t('common.pleaseSelectX', '客户')  → '请选择客户' / 'Please select 客户'
 *     (函数式翻译,传参)
 *   t('enum.quotation_status_draft')  → '草稿' / 'Draft'
 *
 *   I18n.set('en-US')          切换语言
 *   I18n.get()                 当前语言
 *   I18n.toggle()              中英切换
 */

const I18n = (function () {
  'use strict';

  const STORAGE_KEY = 'wood_erp_lang';
  const DEFAULT_LANG = 'zh-CN';
  const SUPPORTED = ['zh-CN', 'en-US'];

  // 字典(运行时根据 set 动态切换)
  let dict = null;

  function _ensureDict() {
    if (dict) return dict;
    const lang = get();
    if (lang === 'en-US') dict = window.I18N_EN || {};
    else dict = window.I18N_ZH || {};
    return dict;
  }

  /** 获取当前语言 */
  function get() {
    const saved = Storage.getPref(STORAGE_KEY);
    return SUPPORTED.includes(saved) ? saved : DEFAULT_LANG;
  }

  /** 设置语言 */
  function set(lang) {
    if (!SUPPORTED.includes(lang)) lang = DEFAULT_LANG;
    Storage.setPref(STORAGE_KEY, lang);
    document.documentElement.setAttribute('lang', lang);
    dict = null; // 清缓存,下次 _ensureDict 会重读
    if (window.EventBus) EventBus.emit('language.changed', lang);
  }

  /** 切换中英 */
  function toggle() {
    set(get() === 'zh-CN' ? 'en-US' : 'zh-CN');
  }

  /**
   * 翻译
   * @param {string} key  形如 'customer.title' 或 'common.pleaseSelectX'
   * @param  {...any} args 传给函数式翻译的参数
   * @returns {string}
   */
  function t(key, ...args) {
    const d = _ensureDict();
    const parts = key.split('.');
    let val = d;
    for (const p of parts) {
      if (val && typeof val === 'object' && p in val) val = val[p];
      else { val = null; break; }
    }
    if (val == null) {
      // 找不到翻译,返回 key 本身(便于发现漏译)
      return key;
    }
    if (typeof val === 'function') return val(...args);
    return val;
  }

  /** 根据 schema 翻译枚举(配合 Badge 使用) */
  function tEnum(entity, enumKey, value) {
    // enumKey 如 'statusEnum', 转成 'status'
    const shortKey = enumKey.replace(/Enum$/, '');
    const composed = `enum.${entity}_${shortKey}_${value}`;
    const translated = t(composed);
    // 如果没翻译,降级到 schema 里的 label
    if (translated === composed) {
      const schema = window.SCHEMAS?.[entity]?.[enumKey]?.[value];
      return schema?.label || value;
    }
    return translated;
  }

  /** 立即设置 lang 属性(避免闪烁) */
  function applyEarly() {
    document.documentElement.setAttribute('lang', get());
  }

  applyEarly();

  return { get, set, toggle, t, tEnum, applyEarly, SUPPORTED };
})();

// 暴露快捷函数 t / tEnum
window.I18n = I18n;
window.t = (...args) => I18n.t(...args);
window.tEnum = (...args) => I18n.tEnum(...args);
