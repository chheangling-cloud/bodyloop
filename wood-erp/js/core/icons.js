/**
 * 统一图标库 - Linear 风线条 SVG
 * @module js/core/icons
 *
 * 设计原则:
 * - 全部 16x16 viewBox
 * - 1.75 描边宽度,stroke="currentColor" (跟随父元素文字色)
 * - 几何感强,圆角端点
 * - 用法: Icon.warning() / Icon.warning(20) 大小可选
 *
 * 已注册图标列表:
 *   状态类: check, x, warning, info, bolt
 *   业务: box, clipboard, file, receipt, paperclip
 *   金钱: money, card, bank
 *   权限: lock, unlock
 *   物流: truck
 *   人员: users, user, briefcase
 *   操作: edit, plus, minus, search, settings, refresh
 *   导航: bell, inbox, chart, trending
 *   辅助: bot, hand, target, award, cart, bulb, party,
 *         arrow_right, arrow_left, chevron_down, chevron_right,
 *         eye, download, upload, trash
 */

const Icon = (function () {
  'use strict';

  const SW = 1.75; // stroke-width

  function svg(size, paths) {
    const s = size || 14;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="${SW}" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px; flex-shrink:0;">${paths}</svg>`;
  }

  const ICONS = {
    // === 状态类 ===
    check:     '<polyline points="3,8 7,12 13,4"/>',
    x:         '<line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/>',
    warning:   '<path d="M8 1.5 L14.5 13.5 H1.5 Z"/><line x1="8" y1="6.5" x2="8" y2="9.5"/><line x1="8" y1="11.5" x2="8" y2="11.6"/>',
    info:      '<circle cx="8" cy="8" r="6.5"/><line x1="8" y1="7" x2="8" y2="11"/><line x1="8" y1="5" x2="8" y2="5.1"/>',
    bolt:      '<polygon points="9,1 3,9 7.5,9 6.5,15 13,7 8.5,7"/>',

    // === 业务对象类 ===
    box:       '<path d="M2 5 L8 2 L14 5 L8 8 Z"/><path d="M2 5 V11 L8 14 V8"/><path d="M14 5 V11 L8 14"/>',
    clipboard: '<rect x="3.5" y="3" width="9" height="11" rx="1.5"/><rect x="6" y="1.5" width="4" height="3" rx="0.5"/>',
    file:      '<path d="M9 1.5 H4 a1.5 1.5 0 0 0 -1.5 1.5 V13 a1.5 1.5 0 0 0 1.5 1.5 H12 a1.5 1.5 0 0 0 1.5 -1.5 V5.5 Z"/><polyline points="9,1.5 9,5.5 13.5,5.5"/>',
    receipt:   '<path d="M3 1.5 V14.5 L5 13.5 L7 14.5 L9 13.5 L11 14.5 L13 13.5 V1.5 Z"/><line x1="5" y1="5" x2="11" y2="5"/><line x1="5" y1="8" x2="11" y2="8"/><line x1="5" y1="11" x2="9" y2="11"/>',
    paperclip: '<path d="M11 4.5 L5.5 10 a2.5 2.5 0 0 0 3.5 3.5 L14 8 a4 4 0 0 0 -5.5 -5.5 L3 8 a5 5 0 0 0 7 7 L14.5 10.5"/>',

    // === 金钱类 ===
    money:     '<rect x="1.5" y="3" width="13" height="10" rx="1.5"/><circle cx="8" cy="8" r="2.25"/><line x1="4" y1="6" x2="4" y2="6.1"/><line x1="12" y1="10" x2="12" y2="10.1"/>',
    card:      '<rect x="1.5" y="3" width="13" height="10" rx="1.5"/><line x1="1.5" y1="6.5" x2="14.5" y2="6.5"/>',
    bank:      '<polygon points="8,1.5 14.5,4.5 1.5,4.5"/><line x1="3" y1="6.5" x2="3" y2="12.5"/><line x1="6.5" y1="6.5" x2="6.5" y2="12.5"/><line x1="9.5" y1="6.5" x2="9.5" y2="12.5"/><line x1="13" y1="6.5" x2="13" y2="12.5"/><line x1="1.5" y1="14" x2="14.5" y2="14"/>',

    // === 锁/权限 ===
    lock:      '<rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5.5 7 V5 a2.5 2.5 0 0 1 5 0 V7"/>',
    unlock:    '<rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5.5 7 V5 a2.5 2.5 0 0 1 5 0"/>',

    // === 物流/对象 ===
    truck:     '<rect x="1" y="4" width="9" height="7" rx="0.5"/><path d="M10 6 H13 L15 8.5 V11 H10 Z"/><circle cx="4" cy="12.5" r="1.5"/><circle cx="12" cy="12.5" r="1.5"/>',
    location:  '<path d="M8 1.5 a5 5 0 0 1 5 5 c0 3.5 -5 8 -5 8 s -5 -4.5 -5 -8 a5 5 0 0 1 5 -5 z"/><circle cx="8" cy="6.5" r="2"/>',
    users:     '<circle cx="6" cy="6" r="2.5"/><path d="M1.5 13.5 a4.5 4.5 0 0 1 9 0"/><circle cx="11.5" cy="5.5" r="2"/><path d="M10.5 13.5 a4 4 0 0 1 4 -4"/>',
    user:      '<circle cx="8" cy="5.5" r="2.75"/><path d="M2.5 14 a5.5 5.5 0 0 1 11 0"/>',
    briefcase: '<rect x="1.5" y="4.5" width="13" height="9" rx="1"/><path d="M5.5 4.5 V3 a1 1 0 0 1 1 -1 H9.5 a1 1 0 0 1 1 1 V4.5"/>',

    // === 操作类 ===
    edit:      '<path d="M11 2 L14 5 L5 14 L1.5 14.5 L2 11 Z"/>',
    plus:      '<line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/>',
    minus:     '<line x1="3" y1="8" x2="13" y2="8"/>',
    search:    '<circle cx="7" cy="7" r="5"/><line x1="11" y1="11" x2="14" y2="14"/>',
    settings:  '<circle cx="8" cy="8" r="2.25"/><path d="M13.5 8 a5.5 5.5 0 0 0 -0.3 -1.8 L14.5 5 L13 2.5 L11.4 3 a5.5 5.5 0 0 0 -1.6 -0.9 L9.5 0.5 H6.5 L6.2 2.1 a5.5 5.5 0 0 0 -1.6 0.9 L3 2.5 L1.5 5 L2.8 6.2 A5.5 5.5 0 0 0 2.5 8"/>',
    refresh:   '<polyline points="13,3 13,7 9,7"/><path d="M13 7 A6 6 0 1 0 11.5 12"/>',

    // === 导航/UI ===
    bell:      '<path d="M4 6.5 a4 4 0 0 1 8 0 c0 4 2 5 2 5 H2 s2 -1 2 -5"/><path d="M6.5 13 a1.5 1.5 0 0 0 3 0"/>',
    clock:     '<circle cx="8" cy="8" r="6.5"/><polyline points="8,4.5 8,8 11,9.5"/>',
    inbox:     '<path d="M1.5 8 L4 3 H12 L14.5 8 V13 a1 1 0 0 1 -1 1 H2.5 a1 1 0 0 1 -1 -1 Z"/><polyline points="1.5,8 5.5,8 6.5,10 9.5,10 10.5,8 14.5,8"/>',
    chart:     '<polyline points="1.5,12 5,8 8.5,10 13.5,3"/><polyline points="9,3 13.5,3 13.5,7.5"/>',
    trending:  '<polyline points="1.5,11 6,6 9,9 14.5,3.5"/><polyline points="10,3.5 14.5,3.5 14.5,8"/>',

    // === 通用辅助 ===
    bot:       '<rect x="2.5" y="5" width="11" height="9" rx="1.5"/><circle cx="6" cy="9" r="0.5" fill="currentColor"/><circle cx="10" cy="9" r="0.5" fill="currentColor"/><line x1="8" y1="2.5" x2="8" y2="5"/><circle cx="8" cy="2" r="0.75"/>',
    hand:      '<path d="M5 8 V3.5 a1.25 1.25 0 0 1 2.5 0 V8 M7.5 7 V2.5 a1.25 1.25 0 0 1 2.5 0 V8 M10 7 V3.5 a1.25 1.25 0 0 1 2.5 0 V11 a4 4 0 0 1 -7 2 L3 9.5 a1.25 1.25 0 0 1 2 -1.5 L5.5 9"/>',
    target:    '<circle cx="8" cy="8" r="6.5"/><circle cx="8" cy="8" r="3.5"/><circle cx="8" cy="8" r="0.5" fill="currentColor"/>',
    award:     '<circle cx="8" cy="6" r="4.5"/><polyline points="5.5,10 4.5,15 8,13 11.5,15 10.5,10"/>',
    cart:      '<circle cx="6" cy="13.5" r="1.25"/><circle cx="12" cy="13.5" r="1.25"/><polyline points="1,2 3.5,2 5,11 13,11 14,5 4.5,5"/>',
    bulb:      '<path d="M5.5 9.5 A4 4 0 1 1 10.5 9.5 V11 H5.5 Z"/><line x1="6" y1="13" x2="10" y2="13"/><line x1="7" y1="15" x2="9" y2="15"/>',
    party:     '<circle cx="8" cy="8" r="6.5"/><path d="M5 9.5 q3 2 6 0"/><line x1="5.5" y1="6" x2="5.5" y2="6.1"/><line x1="10.5" y1="6" x2="10.5" y2="6.1"/>',
    arrow_right: '<polyline points="6,3 11,8 6,13"/>',
    arrow_left:  '<polyline points="10,3 5,8 10,13"/>',
    chevron_down: '<polyline points="3,6 8,11 13,6"/>',
    chevron_right: '<polyline points="6,3 11,8 6,13"/>',
    eye:       '<path d="M1 8 s2.5 -5 7 -5 s7 5 7 5 s-2.5 5 -7 5 s-7 -5 -7 -5"/><circle cx="8" cy="8" r="2.25"/>',
    download:  '<line x1="8" y1="2" x2="8" y2="11"/><polyline points="4,7 8,11 12,7"/><line x1="2" y1="14" x2="14" y2="14"/>',
    upload:    '<line x1="8" y1="14" x2="8" y2="5"/><polyline points="4,9 8,5 12,9"/><line x1="2" y1="2" x2="14" y2="2"/>',
    trash:     '<polyline points="2,4 14,4"/><path d="M3.5 4 V13 a1 1 0 0 0 1 1 H11.5 a1 1 0 0 0 1 -1 V4"/><path d="M6 4 V2.5 a1 1 0 0 1 1 -1 H9 a1 1 0 0 1 1 1 V4"/>',
  };

  /** 渲染图标。大小可选,默认 14px */
  function render(name, size) {
    const path = ICONS[name];
    if (!path) {
      console.warn('[Icon] unknown:', name);
      return '';
    }
    return svg(size, path);
  }

  // 暴露每个图标作为快捷方法
  const api = { render, list: () => Object.keys(ICONS) };
  Object.keys(ICONS).forEach(name => {
    api[name] = (size) => render(name, size);
  });

  return api;
})();

window.Icon = Icon;
