/**
 * EnhancedSelect — 带 + 新建 / ✎ 编辑 / ✕ 删除 内联按钮的下拉
 *
 * 用法:
 *   EnhancedSelect.render({
 *     mountId: 'my-select-wrapper',   // 挂载到 #my-select-wrapper
 *     value:   currentValue,           // 当前选中值
 *     items:   [{ value, label, sub }], // 选项列表
 *     placeholder: '请选择',
 *     onAdd:    () => openEditorModal(null, (created) => { ... }),
 *     onEdit:   (val) => openEditorModal(val, () => { ... }),
 *     onDelete: (val, label) => Confirm.open({ ... }),
 *     onChange: (newVal) => { state.xxx = newVal; },
 *     canEdit:  true,    // 是否显示编辑/删除按钮,默认 true
 *     disableDelete: false, // 是否禁用删除
 *   });
 *
 * 生成 HTML:
 *   <div class="esel-row">
 *     <select class="select esel-select"> ... </select>
 *     <button class="esel-btn esel-add">+</button>
 *     <button class="esel-btn esel-edit">✎</button>   (可选)
 *     <button class="esel-btn esel-del">✕</button>    (可选)
 *   </div>
 */

const EnhancedSelect = (function () {
  'use strict';

  function render(opts) {
    const {
      mountId, mountEl,
      value, items = [], placeholder,
      onAdd, onEdit, onDelete, onChange,
      canEdit = true, disableDelete = false,
      selectStyle = '', wrapStyle = '',
      addLabel, editLabel, delLabel,
    } = opts;

    const root = mountEl || document.getElementById(mountId);
    if (!root) return;

    const isZh = typeof I18n !== 'undefined' ? I18n.get() === 'zh-CN' : true;
    const hasSelected = value && items.some(it => String(it.value) === String(value));

    root.innerHTML = `
      <div class="esel-row" style="display:flex; gap:4px; align-items:center; ${wrapStyle}">
        <select class="select esel-select" style="flex:1; ${selectStyle}">
          <option value="">${placeholder || (isZh ? '请选择' : 'Select')}</option>
          ${items.map(it => `
            <option value="${_esc(it.value)}" ${String(it.value) === String(value) ? 'selected' : ''}>
              ${_esc(it.label)}${it.sub ? ' · ' + _esc(it.sub) : ''}
            </option>
          `).join('')}
        </select>
        ${onAdd ? `<button class="esel-btn esel-add" title="${isZh?'新建':'Add'}"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/></svg></button>` : ''}
        ${(onEdit && canEdit) ? `<button class="esel-btn esel-edit" title="${isZh?'编辑':'Edit'}" ${!hasSelected?'disabled':''}><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M11 2.5 l2.5 2.5 -8.5 8.5 H2.5 V11 z"/></svg></button>` : ''}
        ${(onDelete && canEdit && !disableDelete) ? `<button class="esel-btn esel-del" title="${isZh?'删除':'Delete'}" ${!hasSelected?'disabled':''}><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><polyline points="3,4 13,4"/><path d="M5 4 V2.5 a1 1 0 0 1 1-1 H10 a1 1 0 0 1 1 1 V4"/><path d="M4 4 L4.5 13.5 a1 1 0 0 0 1 1 H10.5 a1 1 0 0 0 1-1 L12 4"/></svg></button>` : ''}
      </div>
    `;

    const sel = root.querySelector('.esel-select');
    const editBtn = root.querySelector('.esel-edit');
    const delBtn = root.querySelector('.esel-del');
    const addBtn = root.querySelector('.esel-add');

    sel.addEventListener('change', () => {
      const newVal = sel.value;
      if (editBtn) editBtn.disabled = !newVal;
      if (delBtn) delBtn.disabled = !newVal;
      if (onChange) onChange(newVal);
    });

    if (addBtn && onAdd) {
      addBtn.addEventListener('click', () => {
        onAdd((created) => {
          // 刷新下拉:调用者负责重新 render,或直接往 sel 插入
          if (created) {
            const opt = new Option(_esc(created.label || created.name), created.value || created.id, true, true);
            sel.add(opt);
            sel.value = created.value || created.id;
            if (editBtn) editBtn.disabled = false;
            if (delBtn) delBtn.disabled = false;
            if (onChange) onChange(sel.value);
          }
        });
      });
    }

    if (editBtn && onEdit) {
      editBtn.addEventListener('click', () => {
        const v = sel.value;
        if (!v) return;
        onEdit(v, () => {
          if (onChange) onChange(v); // 可能名称变了,让调用者决定
        });
      });
    }

    if (delBtn && onDelete) {
      delBtn.addEventListener('click', () => {
        const v = sel.value;
        if (!v) return;
        const label = sel.options[sel.selectedIndex]?.text || v;
        onDelete(v, label, () => {
          // 删除成功:移除该 option
          const idx = sel.selectedIndex;
          if (idx >= 0) sel.remove(idx);
          sel.value = '';
          if (editBtn) editBtn.disabled = true;
          if (delBtn) delBtn.disabled = true;
          if (onChange) onChange('');
        });
      });
    }
  }

  // 刷新已挂载的下拉(不重建,只更新 options)
  function refresh(mountId, items, keepValue) {
    const root = document.getElementById(mountId);
    if (!root) return;
    const sel = root.querySelector('.esel-select');
    if (!sel) return;
    const prev = keepValue || sel.value;
    while (sel.options.length > 1) sel.remove(1); // 保留 placeholder
    items.forEach(it => {
      const opt = new Option(it.label + (it.sub ? ' · ' + it.sub : ''), it.value, false, String(it.value) === String(prev));
    });
    sel.value = prev;
  }

  function _esc(v) {
    return String(v || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  return { render, refresh };
})();

window.EnhancedSelect = EnhancedSelect;
