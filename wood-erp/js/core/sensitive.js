/**
 * Sensitive - 敏感字段脱敏工具
 * @module core/sensitive
 *
 * 按当前角色判断是否可见,不可见时显示 `***` + tooltip
 *
 * 用法:
 *   $money(amount)        → 金额(检查 Perm.canSeeField('amount'))
 *   $cost(cost)           → 成本(销售也看不到)
 *   $credit(amount)       → 信用相关(欠款/额度)
 *   $price(unitPrice)     → 单价(同 $money)
 *   $hide(value, fieldKey) → 通用脱敏
 */

const Sensitive = (function () {
  'use strict';

  const isZh = () => (typeof I18n !== 'undefined' && I18n.get() === 'zh-CN');
  const tooltip = () => isZh() ? '无权限查看金额' : 'No permission to view amounts';
  const tooltipCost = () => isZh() ? '无权限查看成本/利润' : 'No permission to view cost/profit';

  function _can(fieldKey) {
    if (typeof Perm === 'undefined' || !Perm.canSeeField) return true;
    return Perm.canSeeField(fieldKey);
  }

  /** 金额脱敏(默认 amount 字段) */
  function money(value, opts = {}) {
    if (_can('amount')) {
      return (typeof Utils !== 'undefined' && Utils.formatMoney)
        ? Utils.formatMoney(value)
        : ('$' + (value/100).toFixed(2));
    }
    return `<span class="text-muted" style="cursor:help;" title="${tooltip()}">***</span>`;
  }

  /** 单价脱敏 */
  function price(value, opts = {}) { return money(value, opts); }

  /** 成本/利润脱敏(销售也看不到) */
  function cost(value, opts = {}) {
    if (_can('cost')) {
      return Utils.formatMoney(value);
    }
    return `<span class="text-muted" style="cursor:help;" title="${tooltipCost()}">***</span>`;
  }

  /** 信用相关字段(欠款/额度) */
  function credit(value, opts = {}) {
    if (_can('credit')) {
      return Utils.formatMoney(value);
    }
    return `<span class="text-muted" style="cursor:help;" title="${tooltip()}">***</span>`;
  }

  /** 通用:任意字段脱敏 */
  function hide(value, fieldKey, opts = {}) {
    if (_can(fieldKey)) return value;
    const reason = opts.reason || tooltip();
    return `<span class="text-muted" style="cursor:help;" title="${reason}">***</span>`;
  }

  /** 检查是否能看 */
  function canSeeAmount() { return _can('amount'); }
  function canSeeCost() { return _can('cost'); }
  function canSeeCredit() { return _can('credit'); }

  return {
    money, price, cost, credit, hide,
    canSeeAmount, canSeeCost, canSeeCredit,
  };
})();

// 全局短别名
window.$money  = (v) => Sensitive.money(v);
window.$price  = (v) => Sensitive.price(v);
window.$cost   = (v) => Sensitive.cost(v);
window.$credit = (v) => Sensitive.credit(v);
window.Sensitive = Sensitive;
