/**
 * 入库单详情
 */
const InboundDetailModule = (function () {
  let inbound = null;

  function init(ctx) {
    const id = ctx.params.id;
    inbound = InboundService.findById(id);
    if (!inbound) {
      document.getElementById('main-content').innerHTML = `<div class="empty-state">${I18n.get()==='zh-CN'?'入库单不存在':'Not found'}</div>`;
      return;
    }
    render();
  }

  function render() {
    const isZh = I18n.get() === 'zh-CN';
    const wh = WarehouseService.list().find(w => w.id === inbound.warehouseId);
    const typeBadge = renderTypeBadge(inbound.type);
    const statusBadge = renderStatusBadge(inbound.status);

    document.getElementById('page-title').innerHTML = `
      <span class="font-mono">${inbound.no}</span>
      <span style="margin-left:10px;">${typeBadge}</span>
      <span style="margin-left:6px;">${statusBadge}</span>
    `;
    document.getElementById('page-subtitle').innerHTML = `
      ${isZh?'仓库':'Warehouse'}: ${wh?.name || '-'} · ${isZh?'入库日期':'Date'}: ${Utils.formatDate(inbound.inboundDate)}
      ${inbound.supplier ? `<span style="margin-left:8px;">${isZh?'供应商':'Supplier'}: <span class="text-strong">${inbound.supplier}</span></span>` : ''}
    `;

    // 操作按钮
    let actions = '';
    if (inbound.status === 'draft') {
      actions = `
        <button class="btn btn-secondary" data-action="cancel">${t('inbound.actionCancel')}</button>
        <button class="btn btn-primary" data-action="confirm">${t('inbound.actionConfirm')}</button>
      `;
    }
    document.getElementById('action-buttons').innerHTML = actions;

    // 内容
    const materials = MaterialRepo.list();
    const matMap = Object.fromEntries(materials.map(m => [m.id, m]));

    document.getElementById('main-content').innerHTML = `
      <div class="ov-section">
        <div class="ov-section-head"><span>${isZh?'入库明细':'Items'}</span></div>
        <div style="overflow-x:auto;">
          <table style="width:100%; font-size:12px; border-collapse:collapse;">
            <thead>
              <tr style="background:var(--bg-3); color:var(--text-3); text-transform:uppercase; font-size:11px;">
                <th style="text-align:left; padding:8px 12px;">${isZh?'物料':'Material'}</th>
                <th style="text-align:right; padding:8px 12px;">${isZh?'数量':'Qty'}</th>
                <th style="text-align:right; padding:8px 12px;">${isZh?'单价':'Unit Cost'}</th>
                <th style="text-align:right; padding:8px 12px;">${isZh?'小计':'Subtotal'}</th>
              </tr>
            </thead>
            <tbody>
              ${inbound.items.map(it => {
                const mat = matMap[it.materialId];
                return `
                  <tr style="border-bottom:1px solid var(--border-1);">
                    <td style="padding:10px 12px;">
                      <div class="text-strong">${mat?.name || '-'}</div>
                      <div class="text-muted" style="font-size:11px;">${mat?.spec || ''} · ${mat?.unit || ''}</div>
                    </td>
                    <td style="padding:10px 12px; text-align:right;" class="font-mono text-strong">+${it.quantity}</td>
                    <td style="padding:10px 12px; text-align:right;" class="font-mono">${Utils.formatMoney(it.unitCost)}</td>
                    <td style="padding:10px 12px; text-align:right;" class="font-mono text-strong">${Utils.formatMoney(it.totalCost)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
            <tfoot>
              <tr style="background:var(--bg-3); font-weight:500;">
                <td style="padding:10px 12px;">${isZh?'合计':'Total'}</td>
                <td style="padding:10px 12px; text-align:right;" class="font-mono text-strong">${inbound.totalQty}</td>
                <td style="padding:10px 12px;"></td>
                <td style="padding:10px 12px; text-align:right;" class="font-mono text-strong">${Utils.formatMoney(inbound.totalCost)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      ${inbound.sourceRef || inbound.remark ? `
        <div class="ov-section">
          <div class="ov-section-head"><span>${isZh?'附加信息':'Additional Info'}</span></div>
          <div class="ov-section-body">
            ${inbound.sourceRef ? `<div style="font-size:12px; margin-bottom:8px;"><span class="text-muted">${isZh?'关联单号':'Source Ref'}:</span> <span class="font-mono">${inbound.sourceRef}</span></div>` : ''}
            ${inbound.remark ? `<div style="font-size:12px;"><span class="text-muted">${isZh?'说明':'Remark'}:</span> ${inbound.remark}</div>` : ''}
          </div>
        </div>
      ` : ''}

      ${inbound.movementIds.length > 0 ? `
        <div class="ov-section">
          <div class="ov-section-head"><span>${isZh?'生成的流水':'Generated Movements'}</span></div>
          <div class="ov-section-body">
            <div style="font-size:12px; color:var(--text-2);">
              ${isZh?'已生成':'Generated'} ${inbound.movementIds.length} ${isZh?'条入库流水':'movement(s)'}
              <a href="${Router.href('movement-list')}" class="text-accent" style="margin-left:6px; text-decoration:none;">${isZh?'查看流水 →':'View →'}</a>
            </div>
          </div>
        </div>
      ` : ''}

      <div class="ov-section">
        <div class="ov-section-head"><span>${isZh?'⌚ Timeline':'⌚ Timeline'}</span></div>
        <div class="ov-section-body">
          <div class="tl-list">
            ${renderInboundTimeline(inbound)}
          </div>
        </div>
      </div>

      <div class="ov-section">
        <div class="ov-section-head"><span>${isZh?'Workflow 状态(预埋)':'Workflow State'}</span></div>
        <div class="ov-section-body">
          <div style="display:grid; grid-template-columns: 200px 1fr; gap:14px; row-gap:10px; font-size:12px;">
            <div class="text-muted">currentStep</div>
            <div class="font-mono">${inbound.currentStep || '-'}</div>
            <div class="text-muted">requiredRole</div>
            <div>${inbound.requiredRole ? Roles.renderBadge(inbound.requiredRole) : '<span class="text-muted">-</span>'}</div>
            <div class="text-muted">${isZh?'创建人':'Created By'}</div>
            <div>${(EmployeeRepo.find(inbound.createdBy) || {}).name || inbound.createdBy}</div>
            <div class="text-muted">${isZh?'确认人':'Confirmed By'}</div>
            <div>${inbound.confirmedBy ? (EmployeeRepo.find(inbound.confirmedBy) || {}).name || inbound.confirmedBy : '<span class="text-muted">-</span>'}</div>
          </div>
        </div>
      </div>
    `;

    // 绑事件
    document.querySelector('[data-action="confirm"]')?.addEventListener('click', () => {
      Modal.confirm({
        title: t('inbound.confirmTitle'),
        content: t('inbound.confirmMsg', inbound.no),
        onConfirm: () => {
          try {
            InboundService.confirm(inbound.id, 'emp_w01');
            Toast.success(t('inbound.confirmSuccess', inbound.no));
            EventBus.emit('inventory.changed', { reason: 'inbound' });
            // 重新渲染
            inbound = InboundService.findById(inbound.id);
            render();
          } catch (e) {
            Toast.error(e.message);
          }
        }
      });
    });
    document.querySelector('[data-action="cancel"]')?.addEventListener('click', () => {
      Modal.open({
        title: t('inbound.cancelTitle'),
        width: 400,
        content: `
          <div>
            <label class="form-label">${t('inbound.cancelReason')}</label>
            <textarea class="input w-full" id="ib-cancel-reason" rows="3"></textarea>
          </div>
        `,
        buttons: [
          { label: t('common.cancel') },
          {
            label: t('common.confirm'),
            primary: true,
            onClick: () => {
              const reason = document.getElementById('ib-cancel-reason').value.trim();
              try {
                InboundService.cancel(inbound.id, reason, 'emp_w01');
                Toast.success(t('inbound.cancelSuccess'));
                inbound = InboundService.findById(inbound.id);
                render();
              } catch (e) {
                Toast.error(e.message);
                return false;
              }
            }
          }
        ]
      });
    });
  }

  function renderInboundTimeline(ib) {
    const isZh = I18n.get() === 'zh-CN';
    const events = [];
    const empCreated = EmployeeRepo.find(ib.createdBy);
    events.push({
      type: 'inbound_created',
      timestamp: ib.createdAt,
      title: isZh?`<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><line x1="8" y1="2" x2="8" y2="11"/><polyline points="4,7 8,11 12,7"/><line x1="2" y1="14" x2="14" y2="14"/></svg> 入库单创建 ${ib.no}`:`<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><line x1="8" y1="2" x2="8" y2="11"/><polyline points="4,7 8,11 12,7"/><line x1="2" y1="14" x2="14" y2="14"/></svg> Inbound Created ${ib.no}`,
      description: isZh?`${ib.items.length} 个物料 · ${ib.totalQty} 件 · 合计 ${Utils.formatMoney(ib.totalCost)}`:`${ib.items.length} items · ${ib.totalQty} units · ${Utils.formatMoney(ib.totalCost)}`,
      actor: empCreated,
      actorRole: 'warehouse',
    });
    if (ib.status === 'confirmed' && ib.confirmedAt) {
      const empConfirmed = EmployeeRepo.find(ib.confirmedBy);
      events.push({
        type: 'inbound_confirmed',
        timestamp: ib.confirmedAt,
        title: isZh?`<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><polyline points="3,8 7,12 13,4"/></svg> 确认入库 ${ib.no}`:`<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><polyline points="3,8 7,12 13,4"/></svg> Confirmed ${ib.no}`,
        description: isZh?`库存已增加 · 流水已生成`:`Stock increased · movements generated`,
        actor: empConfirmed,
        actorRole: 'warehouse',
      });
    }
    if (ib.status === 'cancelled') {
      events.push({
        type: 'inbound_cancelled',
        timestamp: ib.updatedAt,
        title: isZh?`<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg> 取消入库 ${ib.no}`:`<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg> Cancelled ${ib.no}`,
        description: ib.remark || '',
        actor: empCreated,
        actorRole: 'warehouse',
      });
    }
    events.sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));

    return events.map(e => {
      const sev = e.type === 'inbound_confirmed' ? 'success' :
                  e.type === 'inbound_cancelled' ? 'neutral' : 'info';
      const roleBadge = Roles.renderBadge(e.actorRole);
      return `
        <div class="tl-event severity-${sev}" data-actor-role="${e.actorRole}">
          <div class="tl-event-header">
            <span class="tl-event-title">${e.title}</span>
            ${roleBadge}
            <span class="tl-event-time">${Utils.formatDateTime(e.timestamp)}</span>
          </div>
          ${e.description ? `<div class="tl-event-desc">${e.description}</div>` : ''}
          ${e.actor ? `<div class="tl-event-operator">${e.actor.name} · ${e.actor.role} · ${e.actor.department || ''}</div>` : ''}
        </div>
      `;
    }).join('');
  }

  function renderTypeBadge(type) {
    const map = {
      purchase:   { c:'var(--blue)', bg:'var(--blue-bg)',  labelKey:'inbound.typePurchase' },
      production: { c:'var(--emerald)', bg:'var(--emerald-bg)',   labelKey:'inbound.typeProduction' },
      return:     { c:'#fb923c', bg:'rgba(251,146,60,0.14)',  labelKey:'inbound.typeReturn' },
      initial:    { c:'#cbd5e1', bg:'rgba(148,163,184,0.14)', labelKey:'inbound.typeInitial' },
      gain:       { c:'#facc15', bg:'rgba(250,204,21,0.14)',  labelKey:'inbound.typeGain' },
    };
    const cf = map[type] || map.initial;
    return `<span style="padding:2px 8px; background:${cf.bg}; color:${cf.c}; border-radius:3px; font-size:11px;">${t(cf.labelKey)}</span>`;
  }

  function renderStatusBadge(status) {
    const map = {
      draft:     { c:'#94a3b8', bg:'rgba(148,163,184,0.14)', labelKey:'inbound.statusDraft' },
      confirmed: { c:'var(--emerald)', bg:'var(--emerald-bg)',   labelKey:'inbound.statusConfirmed' },
      cancelled: { c:'#94a3b8', bg:'rgba(148,163,184,0.14)', labelKey:'inbound.statusCancelled' },
    };
    const cf = map[status] || map.draft;
    return `<span style="padding:2px 8px; background:${cf.bg}; color:${cf.c}; border-radius:3px; font-size:11px; font-weight:500;">${t(cf.labelKey)}</span>`;
  }

  return { init };
})();

window.InboundDetailModule = InboundDetailModule;
