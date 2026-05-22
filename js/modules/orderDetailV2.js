/**
 * 订单详情 V2(以订单为核心容器)
 * @module modules/orderDetailV2
 *
 * 侧边 Tab 结构:
 *   主菜单:概览 / Timeline / 发货 / 结算 / 收款
 *   "更多" 折叠:附件 / 修改记录 / 风险 / 日志
 *
 * MVP 阶段:
 *   ✅ 概览 - 完整(KPI + 客户信息 + 明细 + 最近活动)
 *   ✅ Timeline - 完整
 *   ⏳ 其他 7 个 Tab - 占位"敬请期待"
 */

const OrderDetailV2Module = (function () {
  'use strict';

  let order = null;
  let customer = null;
  let activeTab = 'overview';

  /** task 完成时附件应该挂到哪个实体上 */
  function _getRelatedEntityType(taskType) {
    if (['finance_approve','price_approve','order_revise'].includes(taskType)) return 'order';
    if (['warehouse_prepare','warehouse_ship'].includes(taskType)) return 'delivery';
    if (['settlement_create'].includes(taskType)) return 'settlement';
    if (['payment_register'].includes(taskType)) return 'settlement';
    return 'order';
  }
  function _getRelatedEntityId(taskType, orderId) {
    // 简化:绝大多数挂到 order 上(timeline 也从 order 视角聚合)
    return orderId;
  }

  let timelineCache = null;

  // 主侧栏 Tab 和"更多"折叠下的 Tab
  const MAIN_TABS = [
    { key: 'overview',    labelKey: 'orderCenter.tabOverview',    iconName: 'clipboard' },
    { key: 'timeline',    labelKey: 'orderCenter.tabTimeline',    iconName: 'trending' },
    { key: 'deliveries',  labelKey: 'orderCenter.tabDeliveries',  iconName: 'truck' },
    { key: 'settlements', labelKey: 'orderCenter.tabSettlements', iconName: 'briefcase' },
    { key: 'payments',    labelKey: 'orderCenter.tabPayments',    iconName: 'money' },
  ];
  const MORE_TABS = [
    { key: 'attachments', labelKey: 'orderCenter.tabAttachments', iconName: 'paperclip' },
    { key: 'appendix',    labelKey: 'orderCenter.tabAppendix',    iconName: 'edit' },
    { key: 'risk',        labelKey: 'orderCenter.tabRiskInfo',    iconName: 'warning' },
    { key: 'logs',        labelKey: 'orderCenter.tabLogs',        iconName: 'receipt' },
  ];

  function init(ctx) {
    const params = { get: function(k) { return (ctx && ctx.params && ctx.params[k]) || (ctx && ctx.query && ctx.query[k]); } };
    const id = params.get('id');
    if (!id) {
      document.getElementById('tab-content').innerHTML = `<div class="empty-state">${t('common.noData')}</div>`;
      return;
    }
    order = SalesOrderRepo.find(id);
    if (!order) {
      document.getElementById('tab-content').innerHTML = `<div class="empty-state">${t('common.noData')}</div>`;
      return;
    }
    customer = CustomerRepo.find(order.customerId);

    // Tab 重置:每次进入订单详情默认是"概览",除非 URL 显式带 ?tab=
    // 这样从一个订单的 timeline 跳到另一个订单时不会残留
    activeTab = 'overview';
    const urlTab = params.get('tab');
    if (urlTab) activeTab = urlTab;

    renderHead();
    renderStagesBar();
    renderActionButtons();
    switchTab(activeTab);
  }

  // ========== 头部 ==========
  function renderHead() {
    const stage = mapStatusToStage(order.status);
    const stageLabel = {
      draft: 'orderCenter.stageDraft',
      pending_finance: 'orderCenter.stagePendingFinance',
      pending_warehouse: 'orderCenter.stagePendingWarehouse',
      confirmed: 'orderCenter.stageConfirmed',
      producing: 'orderCenter.stageInProduction',
      preparing: 'orderCenter.stagePreparing',
      shipping: 'orderCenter.stagePartialShipped',
      settling: 'orderCenter.stageSettling',
      completed: 'orderCenter.stageCompleted',
      cancelled: 'orderCenter.stageCancelled',
    }[stage] || 'common.unknown';

    const risk = computeRisk();
    const riskBadge = renderRiskBadge(risk);

    document.title = `${order.no} · ${t('brand.companyCn')}`;
    const isZh = I18n.get() === 'zh-CN';
    const isArchived = order.is_archived === true;
    const canArchive = ['completed', 'cancelled'].includes(order.status) && !isArchived;
    const archivedBadge = isArchived ? `<span class="badge slate" style="margin-left:8px;">${isZh?'已归档':'Archived'}</span>` : '';
    const archiveBtn = canArchive
      ? Perm.button(`<button class="btn btn-sm btn-ghost" data-action="archive-order" style="margin-left:auto;">${Icon.box(13)} ${isZh?'归档':'Archive'}</button>`, 'orderArchive')
      : '';
    const restoreBtn = isArchived
      ? Perm.button(`<button class="btn btn-sm btn-ghost text-emerald" data-action="restore-order" style="margin-left:auto;">${isZh?'恢复':'Restore'}</button>`, 'orderRestore')
      : '';

    document.getElementById('order-head').innerHTML = `
      <div class="order-head order-head-v3">
        <div class="order-head-main">
          <div class="order-head-row">
            <span class="order-no">${order.no}</span>
            <span class="stage-badge stage-${stage}"><span class="dot"></span>${t(stageLabel)}</span>
            ${riskBadge}
            ${archivedBadge}
            ${archiveBtn}${restoreBtn}
          </div>
          <div class="order-meta">
            <span class="text-strong">${customer?.name || '-'}</span>
            <span class="separator">·</span>
            <span class="font-mono text-accent">${Sensitive.money(order.totalAmount)}</span>
            <span class="separator">·</span>
            <span>${isZh?'创建于':'Created'} ${Utils.formatDate(order.createdAt)}</span>
            <span class="separator">·</span>
            <span>${isZh?'交期':'Delivery'} ${Utils.formatDate(order.deliveryDate || order.expectedDeliveryDate)}</span>
          </div>
        </div>
        <div class="order-head-meta-cards">
          <div class="meta-card">
            <div class="meta-card-icon">${Icon.clipboard ? Icon.clipboard(14) : ''}</div>
            <div class="meta-card-text">
              <div class="meta-card-label">${isZh?'订单类型':'Type'}</div>
              <div class="meta-card-value">${isZh?'正常订单':'Standard'}</div>
            </div>
          </div>
          <div class="meta-card">
            <div class="meta-card-icon">${Icon.user ? Icon.user(14) : ''}</div>
            <div class="meta-card-text">
              <div class="meta-card-label">${isZh?'创建人':'Created By'}</div>
              <div class="meta-card-value">${_getCreatorName()}</div>
            </div>
          </div>
          <div class="meta-card">
            <div class="meta-card-icon">${Icon.clock ? Icon.clock(14) : ''}</div>
            <div class="meta-card-text">
              <div class="meta-card-label">${isZh?'更新时间':'Updated'}</div>
              <div class="meta-card-value">${Utils.formatDateTime(order.updatedAt || order.createdAt)}</div>
            </div>
          </div>
        </div>
      </div>
    `;

    // 绑定归档/恢复按钮
    const arcBtn = document.querySelector('[data-action="archive-order"]');
    if (arcBtn) arcBtn.addEventListener('click', () => openArchiveOrderModal());
    const resBtn = document.querySelector('[data-action="restore-order"]');
    if (resBtn) resBtn.addEventListener('click', () => openRestoreOrderModal());
  }

  /** 获取订单创建人显示名 */
  function _getCreatorName() {
    if (!order.createdBy) return '-';
    const emp = (typeof EmployeeRepo !== 'undefined') ? EmployeeRepo.find(order.createdBy) : null;
    return emp?.name || order.createdBy;
  }

  function openArchiveOrderModal() {
    const isZh = I18n.get() === 'zh-CN';
    Modal.open({
      title: isZh?`归档订单 - ${order.no}`:`Archive Order - ${order.no}`,
      width: 460,
      content: `
        <div>
          <div class="text-muted" style="font-size:12px; margin-bottom:14px; line-height:1.6;">
            ${isZh
              ? '归档后该订单将默认隐藏,但所有数据保留(发货、结算、收款记录)。可在订单中心「查看归档订单」中恢复。'
              : 'Order will be hidden from default list. All data preserved. Restore later from "View Archived".'}
          </div>
          <label class="form-label">${isZh?'归档原因(可选)':'Reason (optional)'}</label>
          <input class="input w-full" id="arc-order-reason" placeholder="${isZh?'如:历史订单整理':'e.g. Historical cleanup'}">
        </div>
      `,
      buttons: [
        { label: isZh?'取消':'Cancel' },
        { label: isZh?'确认归档':'Archive', primary: true, onClick: () => {
          const reason = document.getElementById('arc-order-reason').value.trim();
          try {
            ArchiveService.archiveOrder(order.id, reason);
            Toast.success(isZh?'已归档':'Archived');
            // 刷新页面
            const ctx = Router.current();
            if (ctx) window.View_order_detail.init(ctx);
          } catch (e) {
            Toast.error(e.message);
            return false;
          }
        }},
      ],
    });
  }

  function openRestoreOrderModal() {
    const isZh = I18n.get() === 'zh-CN';
    Modal.confirm({
      title: isZh?'恢复订单':'Restore Order',
      message: isZh
        ? `确定恢复订单 <strong>${order.no}</strong>?恢复后将重新显示在订单列表。`
        : `Restore order <strong>${order.no}</strong>? It will appear in the active list again.`,
      confirmText: isZh?'确认恢复':'Restore',
      onConfirm: () => {
        try {
          ArchiveService.restoreOrder(order.id, '');
          Toast.success(isZh?'已恢复':'Restored');
          const ctx = Router.current();
          if (ctx) window.View_order_detail.init(ctx);
        } catch (e) {
          Toast.error(e.message);
        }
      },
    });
  }

  function mapStatusToStage(s) {
    if (s === 'draft') return 'draft';
    if (s === 'pending_price' || s === 'pending_finance') return 'pending_finance';
    if (s === 'pending_warehouse') return 'pending_warehouse';
    if (s === 'confirmed') return 'confirmed';
    if (s === 'preparing') return 'producing';
    if (s === 'shipped') return 'shipping';
    if (s === 'partial_shipped') return 'shipping';
    if (s === 'settling') return 'settling';
    if (s === 'settled') return 'settling';
    if (s === 'paid') return 'completed';
    if (s === 'completed') return 'completed';
    if (s === 'cancelled') return 'cancelled';
    return s;
  }

  function computeRisk() {
    const deliveries = DeliveryRepo.list({ salesOrderId: order.id });
    const settlements = SettlementRepo.list().filter(s =>
      (s.salesOrderIds || []).includes(order.id)
    );
    const hasForcedDelivery = deliveries.some(d => d.creditCheckResult?.forced);
    const hasTransportException = deliveries.some(d => d.transportStatus === 'exception');
    const hasOverdue = settlements.some(s => s.status === 'overdue');
    if (hasForcedDelivery || hasTransportException || hasOverdue) return 'exception';
    if (customer?.shipmentLocked) return 'locked';
    if (customer?.riskLevel === 'high') return 'high';
    if (customer?.riskLevel === 'attention') return 'note';
    return 'none';
  }

  function renderRiskBadge(risk) {
    if (risk === 'none') return '';
    const config = {
      note:      { label: 'orderCenter.riskNote',      bg: 'var(--amber-bg)',  color: 'var(--amber)' },
      high:      { label: 'orderCenter.riskHigh',      bg: 'var(--orange-bg)', color: 'var(--orange)' },
      locked:    { label: 'orderCenter.riskLocked',    bg: 'var(--red-bg)',    color: 'var(--red)' },
      exception: { label: 'orderCenter.riskException', bg: 'var(--red-bg)',    color: 'var(--red)' },
    }[risk];
    if (!config) return '';
    return `<span style="display:inline-block; padding:3px 10px; background:${config.bg}; color:${config.color}; border-radius:3px; font-size:11px; font-weight:500;">${Icon.warning(13)} ${t(config.label)}</span>`;
  }

  // ========== 7 步流程条 ==========
  /**
   * 计算订单 7 个阶段的状态
   * @returns Array<{key, label, state}> state ∈ 'done'|'active'|'pending'
   *
   * 设计原则:
   *   - 允许多步骤同时 active(部分发货 + 运输中 + 部分签收 可能并存)
   *   - 单调推进:一旦后期阶段 active,前期阶段必然 done
   *   - cancelled 订单单独处理(只点亮 1.SO创建)
   */
  function calcStages() {
    const isZh = I18n.get() === 'zh-CN';
    const STAGES = [
      { key: 'created',   label: isZh?'SO创建':'Created',     icon: 'check' },
      { key: 'picking',   label: isZh?'仓库拣货':'Picking',   icon: 'box' },
      { key: 'shipping',  label: isZh?'出库装车':'Loading',   icon: 'truck' },
      { key: 'transit',   label: isZh?'运输中':'In Transit',  icon: 'truck' },
      { key: 'received',  label: isZh?'回单签收':'Signed',    icon: 'check' },
      { key: 'settle',    label: isZh?'收款结算':'Settle',    icon: 'briefcase' },
      { key: 'completed', label: isZh?'完成':'Completed',     icon: 'check' },
    ];

    // 收集数据
    const deliveries = DeliveryRepo.list({ salesOrderId: order.id });
    const settlements = SettlementRepo.list().filter(s =>
      (s.salesOrderIds || []).includes(order.id)
    );
    const totalQty  = (order.items || []).reduce((s, it) => s + (it.qty || 0), 0);
    const shippedQty = (order.items || []).reduce((s, it) => s + (it.deliveredQty || 0), 0);
    const fullyShipped = totalQty > 0 && shippedQty >= totalQty;

    // ✨ 关键修复:用"计划车次 vs 实际派车 / 签收"做严格判断
    const plannedTrucks = Math.max(1, Number(order.plannedTruckCount) || 1);
    const dispatchedCount = deliveries.length;            // 已创建的 delivery 数(= 已派车数)
    const signedCount = deliveries.filter(d => d.transportStatus === 'signed').length;
    const inTransitCount = deliveries.filter(d => d.transportStatus === 'in_transit' || d.transportStatus === 'pending').length;

    const hasDelivery = deliveries.length > 0;
    const hasInTransit = inTransitCount > 0;
    const hasSigned = signedCount > 0;
    // ✨ "全签收" = 已派车数达到计划 + 所有派出的车都签收了 + 数量也完整
    const allDispatched = dispatchedCount >= plannedTrucks;
    const allSigned = allDispatched && deliveries.length > 0 && deliveries.every(d => d.transportStatus === 'signed');
    const hasUnpaid = settlements.some(s => s.status !== 'paid' && s.status !== 'cancelled');
    const allPaid = settlements.length > 0 && settlements.every(s => s.status === 'paid');

    const states = STAGES.map(() => 'pending');

    // 取消订单:只有第 1 步 done,其他全 pending
    if (order.status === 'cancelled') {
      states[0] = 'done';
      return STAGES.map((s, i) => ({ ...s, state: states[i] }));
    }

    // 1. 创建:订单存在即 done
    states[0] = 'done';

    // 2. 仓库拣货
    if (['draft', 'pending_finance', 'pending_price'].includes(order.status)) {
      states[1] = 'pending';
    } else if (['pending_picking', 'pending_warehouse'].includes(order.status)) {
      states[1] = 'active';
    } else if (['picking', 'preparing'].includes(order.status)) {
      states[1] = 'active';
    } else {
      states[1] = 'done';
    }

    // 3. 出库装车 — 关键:只要"还有车没派",就是 active(不能 done)
    if (['draft','pending_finance','pending_price','pending_picking','pending_warehouse','picking','preparing'].includes(order.status)) {
      states[2] = (states[1] === 'done') ? 'active' : 'pending';
    } else if (!allDispatched) {
      // 还有车没派 → 装车在进行中
      states[2] = 'active';
    } else {
      states[2] = 'done';
    }

    // 4. 运输中 — 严格规则:
    //   - 必须所有车都派完了
    //   - 至少有一车签收(否则就一直是 active)
    //   - 不能在装车步骤未完成时显示为 done
    if (states[2] !== 'done') {
      // 装车都没全完,运输中怎么可能 done?
      states[3] = hasInTransit ? 'active' : 'pending';
    } else if (allSigned) {
      states[3] = 'done';
    } else if (hasInTransit || hasSigned) {
      states[3] = 'active';
    } else {
      states[3] = 'pending';
    }

    // 5. 回单签收
    //   - 全部派完 + 全签收 + 货发完 → done
    //   - 至少有一车签收 → active(不管装车是否完成)
    //   - 否则 pending
    if (allSigned && fullyShipped) {
      states[4] = 'done';
    } else if (hasSigned) {
      states[4] = 'active';
    } else {
      states[4] = 'pending';
    }

    // 6. 收款结算
    const isPaidStatus = ['paid', 'completed'].includes(order.status);
    if (settlements.length === 0) {
      states[5] = (states[4] === 'done' || states[4] === 'active') ? 'active' : 'pending';
    } else if (hasUnpaid && !isPaidStatus) {
      states[5] = 'active';
    } else {
      states[5] = 'done';
    }

    // 7. 完成 — 只要订单状态是 paid/completed 就 done
    if (isPaidStatus) {
      states[6] = 'done';
      // 完成意味着所有前面阶段都应该 done
      for (let i = 0; i < 6; i++) {
        if (states[i] !== 'done') states[i] = 'done';
      }
    } else if (allPaid && fullyShipped) {
      states[6] = 'done';
    } else {
      states[6] = 'pending';
    }

    return STAGES.map((s, i) => ({ ...s, state: states[i] }));
  }

  /** 渲染 7 步流程条 */
  function renderStagesBar() {
    const stages = calcStages();
    const isZh = I18n.get() === 'zh-CN';
    const stateLabel = {
      done:    isZh?'已完成':'Done',
      active:  isZh?'进行中':'Active',
      pending: isZh?'未开始':'Pending',
    };

    const html = `
      <div class="stages-bar">
        ${stages.map((s, i) => `
          <div class="stage-step stage-${s.state}">
            <div class="stage-circle">
              ${s.state === 'done'
                ? '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3,8 7,12 13,4"/></svg>'
                : (s.state === 'active'
                  ? (Icon[s.icon] ? Icon[s.icon](13) : `<span>${i+1}</span>`)
                  : `<span>${i+1}</span>`)}
            </div>
            <div class="stage-meta">
              <div class="stage-label">${i+1}. ${s.label}</div>
              <div class="stage-state">${stateLabel[s.state]}</div>
            </div>
            ${i < stages.length - 1 ? `<div class="stage-line stage-line-${s.state}"></div>` : ''}
          </div>
        `).join('')}
      </div>
    `;
    document.getElementById('stages-bar').innerHTML = html;
  }

  // ========== 旧 renderSideTabs(已废弃,空实现以防其他地方还在调) ==========
  function renderSideTabs() { /* deprecated: stages bar replaces side tabs */ }

  function renderTabItem(tab, counts) {
    const count = counts[tab.key];
    const isActive = activeTab === tab.key;
    return `
      <a class="side-tab ${isActive ? 'active' : ''}" data-tab="${tab.key}">
        <span class="tab-icon">${Icon[tab.iconName] ? Icon[tab.iconName](14) : ''}</span>
        <span>${t(tab.labelKey)}</span>
        ${count > 0 ? `<span class="tab-badge">${count}</span>` : ''}
      </a>
    `;
  }

  function computeTabCounts() {
    const deliveries = DeliveryRepo.list({ salesOrderId: order.id });
    const settlements = SettlementRepo.list().filter(s =>
      (s.salesOrderIds || []).includes(order.id)
    );
    const changeLogCount = ChangeLogRepo.list().filter(l =>
      (l.recordType === 'salesOrder' || l.entityType === 'salesOrder') &&
      (l.recordId === order.id || l.entityId === order.id)
    ).length;
    const payments = settlements.reduce((acc, s) => acc.concat(s.payments || []), []);
    const timeline = getTimeline();
    const attachments = timeline.reduce((s, e) => s + (e.attachments?.length || 0), 0);

    return {
      overview: 0,
      timeline: timeline.length,
      deliveries: deliveries.length,
      settlements: settlements.length,
      payments: payments.length,
      attachments,
      appendix: changeLogCount,
      risk: 0,
      logs: 0,
    };
  }

  function getTimeline() {
    if (!timelineCache) {
      timelineCache = OrderTimelineService.buildTimeline(order.id);
    }
    return timelineCache;
  }

  // ========== Tab 切换 ==========
  function switchTab(key) {
    activeTab = key;
    // URL 同步:overview 是默认,不写参数;其他 tab 写入
    const url = new URL(location.href);
    if (key === 'overview') {
      url.searchParams.delete('tab');
    } else {
      url.searchParams.set('tab', key);
    }
    history.replaceState(null, '', url);

    renderActionButtons();   // 更新"更多操作"里的 active 标记
    renderTabContent();
  }

  function renderTabContent() {
    const container = document.getElementById('tab-content');
    if (activeTab === 'overview')    return renderOverview();
    if (activeTab === 'timeline')    return renderTimeline();
    if (activeTab === 'deliveries')  return renderDeliveriesTab();
    if (activeTab === 'settlements') return renderSettlementsTab();
    if (activeTab === 'payments')    return renderPaymentsTab();
    if (activeTab === 'attachments') return renderAttachmentsTab();
    if (activeTab === 'appendix')    return renderAppendixTab();
    if (activeTab === 'risk')        return renderRiskTab();
    if (activeTab === 'logs')        return renderLogsTab();
    return renderComingSoon();
  }

  // ========== Tab: 概览 ==========
  function renderOverview() {
    const isZh = I18n.get() === 'zh-CN';
    const totalAmount = order.totalAmount || 0;

    // --- 发货数据(按"车数")---
    const deliveries = DeliveryRepo.list({ salesOrderId: order.id });
    const signedDeliveries = deliveries.filter(d => d.transportStatus === 'signed');
    const truckTotal = (order.items || []).reduce((s, it) => s + (it.qty || 0), 0);
    const truckShipped = (order.items || []).reduce((s, it) => s + (it.deliveredQty || 0), 0);
    const truckPct = truckTotal > 0 ? Math.round(truckShipped / truckTotal * 100) : 0;

    // --- 结算数据 ---
    const settlements = SettlementRepo.list().filter(s =>
      (s.salesOrderIds || []).includes(order.id)
    );
    const receivableAmount = settlements
      .filter(s => s.status !== 'cancelled')
      .reduce((s, x) => s + ((x.unpaidAmount != null) ? x.unpaidAmount : ((x.totalAmount || 0) - (x.paidAmount || 0))), 0);
    const receivablePct = totalAmount > 0 ? Math.round((receivableAmount / totalAmount) * 100) : 0;

    // --- 结算策略评估 ---
    let policyText = isZh?'未到结算周期':'Not yet due';
    let policyDetail = '';
    if (signedDeliveries.length > 0 && typeof SettlementPolicyEngine !== 'undefined') {
      try {
        const ev = SettlementPolicyEngine.evaluate(customer?.id);
        if (ev && ev.conditions && ev.conditions.length > 0) {
          if (ev.triggered) {
            policyText = isZh?'达到结算条件':'Ready to Settle';
          }
          // 显示第一条主条件
          const primary = ev.conditions[0];
          policyDetail = primary.label;
        }
      } catch (e) { /* ignore */ }
    }
    if (settlements.length > 0 && settlements.some(s => s.status === 'paid')) {
      policyText = isZh?'已完成结算':'Settled';
    }

    // --- 订单状态文案 + 是否可继续发货 ---
    const stageInfo = mapStatusToStage(order.status);
    // status 可能是新(paid/preparing/shipped/...)或老(completed/partial_shipped/settling)
    // 做统一映射
    const orderStatusLabel = ({
      draft:             isZh?'草稿':'Draft',
      pending_finance:   isZh?'待财务审批':'Pending Finance',
      pending_price:     isZh?'待财务审批':'Pending Finance',
      pending_warehouse: isZh?'待仓库接单':'Pending Warehouse',
      confirmed:         isZh?'已确认':'Confirmed',
      preparing:         isZh?'备货中':'Preparing',
      shipped:           isZh?'已发货':'Shipped',
      partial_shipped:   isZh?'部分发货':'Partial Shipped',
      settling:          isZh?'结算中':'Settling',
      settled:           isZh?'已结算':'Settled',
      paid:              isZh?'已收款':'Paid',
      completed:         isZh?'已完成':'Completed',
      cancelled:         isZh?'已取消':'Cancelled',
    })[order.status] || order.status;
    const canShip = ['preparing', 'shipped', 'partial_shipped', 'confirmed'].includes(order.status) && truckShipped < truckTotal;
    const isDone = ['paid', 'completed'].includes(order.status);
    const orderStatusSub = order.status === 'cancelled'
      ? (isZh?'订单已取消':'Cancelled')
      : (isDone ? (isZh?'订单已完成':'Order completed')
        : (canShip ? (isZh?'可继续发货':'Can continue shipping')
          : (truckShipped >= truckTotal ? (isZh?'已全部发货':'Fully shipped')
            : (isZh?'等待推进':'Waiting'))));
    const orderStatusColor = order.status === 'cancelled' ? 'slate'
      : (isDone ? 'emerald'
        : (canShip ? 'blue'
          : 'amber'));

    // --- 客户信用 ---
    // 真实占用 = 客户名下所有"已发货但未收款"金额
    // 用 settlements.unpaidAmount 之和(更准:已开结算单的未收部分)
    // 加上"已发货但未开结算单"的金额(理论上也是欠款)
    let custReceivable = 0;
    if (customer) {
      // 1. 未收款的结算单
      const _custSetts = SettlementRepo.list().filter(s =>
        s.customerId === customer.id && s.status !== 'cancelled' && s.status !== 'paid'
      );
      _custSetts.forEach(s => {
        custReceivable += (s.unpaidAmount != null)
          ? s.unpaidAmount
          : ((s.totalAmount || 0) - (s.paidAmount || 0));
      });
      // 2. 未开结算单的已签收发货
      const _custDels = DeliveryRepo.list({ customerId: customer.id })
        .filter(d => d.transportStatus === 'signed' && d.settlementStatus !== 'settled');
      custReceivable += _custDels.reduce((s, d) => s + (d.totalAmount || 0), 0);
    }
    // 逾期金额(单独算)
    let custOverdue = 0;
    if (customer) {
      const _now = Date.now();
      const _overdueSetts = SettlementRepo.list().filter(s =>
        s.customerId === customer.id && s.status !== 'cancelled' && s.status !== 'paid'
      );
      _overdueSetts.forEach(s => {
        const due = s.dueDate ? new Date(s.dueDate).getTime() : null;
        if (due && due < _now) {
          custOverdue += (s.unpaidAmount != null)
            ? s.unpaidAmount
            : ((s.totalAmount || 0) - (s.paidAmount || 0));
        }
      });
    }
    const creditUsage = customer?.creditLimit > 0
      ? Math.round(custReceivable / customer.creditLimit * 100)
      : 0;

    // --- Mini Timeline ---
    const miniTimelineHTML = renderMiniTimelineV3();

    document.getElementById('tab-content').innerHTML = `
      <div class="tab-pane active">
        ${renderPriceApprovalPanel()}

        <!-- KPI: 4 张业务化卡片 -->
        <div class="ov-grid-v3">
          <!-- 1. 发货进度 -->
          <div class="ov-card-v3">
            <div class="label">${isZh?'发货进度':'Shipping Progress'}</div>
            <div class="value-row">
              <span class="value-big">${truckShipped}</span>
              <span class="value-divider">/</span>
              <span class="value-total">${truckTotal}</span>
              <span class="value-unit">${isZh?'件':'pcs'}</span>
            </div>
            <div class="progress"><div class="progress-fill" style="width:${truckPct}%; background:var(--blue);"></div></div>
            <div class="sub-row">
              <span class="text-muted">${truckPct}%</span>
              <span class="text-accent" data-jump-tab="deliveries" style="cursor:pointer; font-size:11px;">${isZh?'查看发货明细':'View Deliveries'} ›</span>
            </div>
          </div>

          <!-- 2. 应收金额 -->
          <div class="ov-card-v3">
            <div class="label">${isZh?'应收金额':'Receivable'}</div>
            <div class="value-row">
              <span class="value-big">${Sensitive.money(receivableAmount)}</span>
            </div>
            <div class="sub-row">
              <span class="text-muted">${isZh?`占订单总额 ${receivablePct}%`:`${receivablePct}% of total`}</span>
            </div>
          </div>

          <!-- 3. 结算进度 -->
          <div class="ov-card-v3">
            <div class="label">${isZh?'结算进度':'Settlement'}</div>
            <div class="value-row">
              <span class="value-mid">${policyText}</span>
            </div>
            ${policyDetail ? `<div class="sub-row"><span class="text-muted">${policyDetail}</span></div>` : '<div class="sub-row"><span class="text-muted">&nbsp;</span></div>'}
          </div>

          <!-- 4. 订单状态 -->
          <div class="ov-card-v3">
            <div class="label">${isZh?'订单状态':'Order Status'}</div>
            <div class="value-row">
              <span class="status-pill status-${orderStatusColor}">${orderStatusLabel}</span>
            </div>
            <div class="sub-row"><span class="text-muted">${orderStatusSub}</span></div>
          </div>
        </div>

        <!-- 2 列:客户信息 + 订单时间线 -->
        <div class="ov-two-col-v3">
          <!-- 客户信息 -->
          <div class="ov-section">
            <div class="ov-section-head">
              <span>${isZh?'客户信息':'Customer'}</span>
              <a href="${Router.href('customer-detail', {id: customer?.id})}" class="text-accent" style="font-size:11px; text-decoration:none;">${isZh?'查看详情':'View'} ›</a>
            </div>
            <div class="ov-section-body">
              <div style="display:flex; gap:8px; align-items:center; margin-bottom:4px;">
                <span class="text-strong" style="font-size:15px;">${customer?.name || '-'}</span>
                <span class="status-pill status-${(customer?.riskLevel === 'normal' || !customer?.riskLevel) ? 'emerald' : (customer?.riskLevel === 'high' || customer?.riskLevel === 'locked' ? 'red' : 'amber')}" style="font-size:10px;">${_getRiskLabel(customer?.riskLevel)}</span>
              </div>
              <div class="text-muted" style="font-size:11px; margin-bottom:14px;">${customer?.code || ''}</div>
              <div class="kv-row">
                <span class="text-muted">${isZh?'信用额度':'Credit Limit'}</span>
                <span class="font-mono">${Sensitive.credit(customer?.creditLimit)}</span>
              </div>
              <div class="kv-row">
                <span class="text-muted">${isZh?'当前信用占用':'Current Usage'}</span>
                <span class="font-mono ${creditUsage > 90 ? 'text-red' : ''}">${Sensitive.credit(custReceivable)} (${creditUsage}%)</span>
              </div>
              <div style="margin-top:6px; height:5px; background:var(--bg-3); border-radius:2px; overflow:hidden;">
                <div style="height:100%; background:${creditUsage > 90 ? 'var(--red)' : (creditUsage > 70 ? 'var(--amber)' : 'var(--emerald)')}; width:${Math.min(creditUsage, 100)}%;"></div>
              </div>
              <div class="kv-row" style="margin-top:14px;">
                <span class="text-muted">${isZh?'逾期金额':'Overdue'}</span>
                <span class="font-mono ${custOverdue > 0 ? 'text-red' : 'text-emerald'}">${custOverdue > 0 ? Sensitive.credit(custOverdue) : '$0.00'}</span>
              </div>
            </div>
          </div>

          <!-- 订单时间线 -->
          <div class="ov-section">
            <div class="ov-section-head">
              <span>${isZh?'订单时间线':'Order Timeline'}</span>
              <a class="text-accent" data-jump-tab="timeline" style="font-size:11px; text-decoration:none; cursor:pointer;">${isZh?'展开全部记录':'Expand All'} ›</a>
            </div>
            <div class="ov-section-body" style="padding:0;">
              ${miniTimelineHTML}
            </div>
          </div>
        </div>

        <!-- 订单明细(可折叠) -->
        <div class="ov-section" id="items-section">
          <div class="ov-section-head" style="cursor:pointer;" id="items-toggle">
            <span>${isZh?'订单明细':'Items'} (${(order.items || []).length})</span>
            <span class="text-accent" style="font-size:11px;">
              <span id="items-toggle-label">${isZh?'查看明细':'View Details'}</span>
              <svg id="items-toggle-arrow" width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-1px; margin-left:2px; transition:transform .2s;"><polyline points="4,6 8,10 12,6"/></svg>
            </span>
          </div>
          <div id="items-body" style="display:none;">
            <div style="overflow-x:auto;">
              <table style="width:100%; font-size:12px; border-collapse:collapse;">
                <thead>
                  <tr style="background: var(--bg-3); color: var(--text-3); text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em;">
                    <th style="text-align:left; padding:8px 12px;">${isZh?'产品':'Product'}</th>
                    <th style="text-align:left; padding:8px 12px;">${isZh?'规格':'Spec'}</th>
                    <th style="text-align:right; padding:8px 12px;">${isZh?'数量':'Qty'}</th>
                    <th style="text-align:right; padding:8px 12px;">${isZh?'已发货':'Shipped'}</th>
                    <th style="text-align:right; padding:8px 12px;">${isZh?'单位':'Unit'}</th>
                    <th style="text-align:right; padding:8px 12px;">${isZh?'单价':'Price'}</th>
                    <th style="text-align:right; padding:8px 12px;">${isZh?'金额':'Amount'}</th>
                    <th style="text-align:right; padding:8px 12px;">${isZh?'状态':'Status'}</th>
                  </tr>
                </thead>
                <tbody>
                  ${(order.items || []).map(it => {
                    const mat = MaterialRepo.find(it.materialId);
                    const subtotal = (it.qty || 0) * (it.unitPrice || 0);
                    const deliveredPct = it.qty > 0 ? Math.round((it.deliveredQty || 0) / it.qty * 100) : 0;
                    const itemDone = deliveredPct >= 100;
                    return `
                      <tr style="border-bottom:1px solid var(--border-1);">
                        <td style="padding:10px 12px;">
                          <div class="text-strong">${mat?.name || '-'}</div>
                        </td>
                        <td style="padding:10px 12px;" class="text-muted">${mat?.spec || ''}</td>
                        <td style="text-align:right; padding:10px 12px;" class="font-mono">${it.qty || 0}</td>
                        <td style="text-align:right; padding:10px 12px;" class="font-mono">
                          ${it.deliveredQty || 0} <span class="text-muted" style="font-size:11px;">(${deliveredPct}%)</span>
                        </td>
                        <td style="text-align:right; padding:10px 12px;" class="text-muted">${mat?.unit || ''}</td>
                        <td style="text-align:right; padding:10px 12px;" class="font-mono text-muted">${Sensitive.price(it.unitPrice)}</td>
                        <td style="text-align:right; padding:10px 12px;" class="font-mono text-strong">${Sensitive.money(subtotal)}</td>
                        <td style="text-align:right; padding:10px 12px;">
                          <span class="status-pill status-${itemDone ? 'emerald' : 'blue'}" style="font-size:10px;">${itemDone ? (isZh?'已发完':'Done') : (isZh?'未完成':'Active')}</span>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;

    // 绑定明细折叠
    const togBtn = document.getElementById('items-toggle');
    const togBody = document.getElementById('items-body');
    const togLabel = document.getElementById('items-toggle-label');
    const togArrow = document.getElementById('items-toggle-arrow');
    if (togBtn) {
      togBtn.addEventListener('click', () => {
        const isOpen = togBody.style.display === 'block';
        togBody.style.display = isOpen ? 'none' : 'block';
        togLabel.textContent = isOpen ? (isZh?'查看明细':'View Details') : (isZh?'收起':'Collapse');
        togArrow.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
      });
    }

    // 绑定 Tab 跳转
    document.querySelectorAll('[data-jump-tab]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        switchTab(el.dataset.jumpTab);
      });
    });

    // OA 任务操作(批准/驳回/完成/提交)
    document.querySelectorAll('[data-task-action]').forEach(btn => {
      btn.addEventListener('click', () => handleTaskAction(btn.dataset.taskAction, btn.dataset.taskId));
    });
    const submitBtn = document.querySelector('[data-action="submit-order"]');
    if (submitBtn) submitBtn.addEventListener('click', handleSubmitOrder);
  }

  /** 客户风险标签 */
  function _getRiskLabel(level) {
    const isZh = I18n.get() === 'zh-CN';
    const map = {
      normal:    isZh?'正常':'Normal',
      attention: isZh?'注意':'Watch',
      high:      isZh?'高风险':'High Risk',
      locked:    isZh?'锁定':'Locked',
    };
    return map[level] || (isZh?'正常':'Normal');
  }

  /** Mini Timeline V3 — 类似设计图风格,左边小圆点 + 右边事件标题/操作人/时间 */
  /**
   * 事件 → 状态映射(用于 Timeline 卡片着色)
   * done    = 已完成的事件(签收/收款/完成)→ 亮绿
   * active  = 进行中的事件(创建/在途/已开未确认)→ 亮蓝
   * warning = 警告事件(凑齐/附录/强制) → 黄
   * danger  = 异常事件(逾期/异常/风险)→ 红
   * pending = 默认 → 灰
   */
  function _eventState(e) {
    // severity 已经是良好的来源
    if (e.severity === 'success') return 'done';
    if (e.severity === 'info')    return 'active';
    if (e.severity === 'warning') return 'warning';
    if (e.severity === 'danger')  return 'danger';
    return 'pending';
  }

  /**
   * 事件 → 图标(语义化)
   */
  function _eventIcon(e) {
    const t = e.type || '';
    if (t === 'order_created' || t === 'order_confirmed' || t === 'quotation_accepted') return Icon.clipboard ? Icon.clipboard(14) : '';
    if (t === 'delivery' || t === 'delivery_signed' || t === 'delivery_grouped' || t === 'delivery_exception') return Icon.truck ? Icon.truck(14) : '';
    if (t.startsWith('settlement') || t === 'settlement_confirmed' || t === 'settlement_overdue') return Icon.briefcase ? Icon.briefcase(14) : '';
    if (t === 'payment') return Icon.briefcase ? Icon.briefcase(14) : '';
    if (t === 'risk' || t === 'exception') return Icon.warning ? Icon.warning(14) : '';
    if (t === 'appendix' || t === 'modify') return Icon.edit ? Icon.edit(14) : '';
    if (t === 'file') return Icon.paperclip ? Icon.paperclip(14) : '';
    if (t.startsWith('inbound') || t.startsWith('stock')) return Icon.box ? Icon.box(14) : '';
    if (t === 'status_change' || t === 'completed') return Icon.check ? Icon.check(14) : '';
    return Icon.receipt ? Icon.receipt(14) : '';
  }

  /** Mini Timeline V4 — 卡片式,左色条 + glow + 事件级状态 */
  function renderMiniTimelineV3() {
    const events = getTimeline();
    if (events.length === 0) {
      return `<div class="text-muted" style="font-size:12px; padding:14px 18px;">${t('orderCenter.tlNoEvents')}</div>`;
    }
    const isZh = I18n.get() === 'zh-CN';
    // 倒序取最近 4 条
    const recent = events.slice().reverse().slice(0, 4);
    return `
      <div class="mini-tl-v3">
        ${recent.map((e, idx) => {
          const isCurrent = idx === 0;
          const state = _eventState(e);
          const icon = _eventIcon(e);
          return `
            <div class="mini-tl-row state-${state} ${isCurrent ? 'current' : ''}">
              <div class="mini-tl-icon">${icon}</div>
              <div class="mini-tl-content">
                <div class="mini-tl-title">${e.title}</div>
                <div class="mini-tl-meta">
                  <span>${e.operator?.name || (isZh?'系统':'System')}</span>
                  <span class="separator">·</span>
                  <span class="num">${Utils.formatDateTime(e.timestamp)}</span>
                </div>
              </div>
              ${isCurrent ? `<span class="mini-tl-now-badge">${isZh?'当前':'Now'}</span>` : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function handleSubmitOrder() {
    const isZh = I18n.get() === 'zh-CN';
    if (order.status !== 'draft') return;
    const cur = Session.current();
    Modal.open({
      title: isZh?'提交订单到流程':'Submit Order',
      width: 460,
      content: `
        <div style="font-size:13px; color:var(--text-2); margin-bottom:8px;">
          ${isZh?'订单将根据是否含低价进入下一手:':'Order will route based on whether it has low-price items:'}
        </div>
        <ul style="font-size:12px; color:var(--text-2); padding-left:20px; line-height:1.8;">
          <li>${isZh?'有低价 → 财务审批':'Has low-price → Finance approval'}</li>
          <li>${isZh?'无低价 → 直接到仓库备货':'No low-price → Direct to warehouse'}</li>
        </ul>
      `,
      buttons: [
        { label: isZh?'取消':'Cancel' },
        { label: isZh?'确认提交':'Submit', primary: true, onClick: () => {
          try {
            OrderTaskService.submitOrder(order.id, cur.id);
            Toast.success(isZh?'已提交流程':'Submitted');
            order = SalesOrderRepo.find(order.id);
            renderTabContent();
          } catch (e) { Toast.error(e.message); return false; }
        }},
      ],
    });
  }

  function handleTaskAction(action, taskId) {
    const isZh = I18n.get() === 'zh-CN';
    const task = OrderTaskService.findById(taskId);
    if (!task) return;
    const cur = Session.current();

    if (action === 'complete') {
      // 附件提示文案(按 task 类型)
      const attHints = {
        finance_approve: isZh?'审批附件(可选,如审批意见单)':'Approval attachments (optional)',
        price_approve:   isZh?'审批附件(可选)':'Approval attachments (optional)',
        warehouse_prepare: isZh?'备货现场照片(可选)':'Preparation photo (optional)',
        warehouse_ship:    isZh?'装车现场照片(建议上传)':'Loading photo (recommended)',
        settlement_create: isZh?'结算确认单(可选)':'Settlement confirmation (optional)',
        payment_register:  isZh?'收款凭证(建议上传)':'Payment receipt (recommended)',
      };
      const attHint = attHints[task.type] || (isZh?'相关附件(可选)':'Attachments (optional)');

      Modal.open({
        title: isZh?`完成任务: ${SCHEMAS.orderTask?.typeEnum?.[task.type]?.label || task.type}`:`Complete: ${task.type}`,
        width: 540,
        content: `
          <div style="margin-bottom:10px; font-size:12px; color:var(--text-2);">
            ${(task.type === 'finance_approve' || task.type === 'price_approve') ? (isZh?'确认审批通过本订单?通过后将转交仓库备货。':'Approve this order? Warehouse will be notified to prepare.') :
              task.type === 'warehouse_prepare' ? (isZh?'确认备货完成?':'Confirm prepared?') :
              task.type === 'warehouse_ship' ? (isZh?'确认装车发车?':'Confirm shipped?') :
              task.type === 'settlement_create' ? (isZh?'确认创建结算单?':'Create settlement?') :
              task.type === 'payment_register' ? (isZh?'确认登记收款?':'Register payment?') :
              (isZh?'确认完成?':'Confirm complete?')
            }
          </div>
          <label class="form-label">${isZh?'备注(可选)':'Comment (optional)'}</label>
          <textarea class="input" id="task-comment" rows="2" style="width:100%;"
            placeholder="${isZh?'添加备注':'Add a note'}"></textarea>
          <div style="margin-top:14px;">
            <label class="form-label">${attHint}</label>
            <div id="task-att-mount"></div>
          </div>
        `,
        onOpen: () => {
          // 挂载附件上传
          window.__taskUploader = AttachmentUploader.create({
            mount: '#task-att-mount',
            entityType: 'task',
            entityId: task.id,
            taskId: task.id,
            placeholder: attHint,
            maxFiles: 5,
          });
        },
        buttons: [
          { label: isZh?'取消':'Cancel' },
          { label: isZh?'确认':'Confirm', primary: true, onClick: () => {
            const comment = document.getElementById('task-comment').value.trim();
            // 关联附件到对应业务实体(task 完成时,把 task 的附件复制一份关联到 order)
            const atts = window.__taskUploader ? window.__taskUploader.getAttachments() : [];
            // 把 task 附件也复制一份到 order 实体,这样 timeline 能查到
            atts.forEach(att => {
              const orderAtt = {
                ...att,
                id: 'att_' + Utils.uuid().slice(0, 8),
                entityType: _getRelatedEntityType(task.type),
                entityId: _getRelatedEntityId(task.type, order.id),
                taskId: task.id,
              };
              AttachmentRepo.create(orderAtt);
            });
            try {
              OrderTaskService.complete(taskId, comment, cur.id);
              Toast.success(isZh?'任务已完成,下一手已通知':'Task completed, next role notified');
              order = SalesOrderRepo.find(order.id);
              renderTabContent();
            } catch (e) { Toast.error(e.message); return false; }
          }},
        ],
      });
    } else if (action === 'dispatch') {
      openDispatchModal(task, cur);
    } else if (action === 'sign') {
      openSignModal(task, cur);
    } else if (action === 'reject') {
      Modal.open({
        title: isZh?'驳回任务':'Reject Task',
        width: 460,
        content: `
          <div style="margin-bottom:10px; font-size:12px; color:var(--red);">
            ${Icon.warning(13)} ${isZh?'驳回后订单将回到草稿状态,销售员需修改后重新提交':'Order will return to draft, sales must revise and resubmit'}
          </div>
          <label class="form-label">${isZh?'驳回理由':'Reason'} <span class="text-red">*</span></label>
          <textarea class="input" id="reject-reason" rows="3" style="width:100%;"
            placeholder="${isZh?'例如:让利过多,影响利润':'e.g. Discount too high'}"></textarea>
        `,
        buttons: [
          { label: isZh?'取消':'Cancel' },
          { label: isZh?'驳回':'Reject', primary: true, onClick: () => {
            const reason = document.getElementById('reject-reason').value.trim();
            if (!reason) { Toast.warning(isZh?'请填写理由':'Reason required'); return false; }
            try {
              OrderTaskService.reject(taskId, reason, cur.id);
              Toast.success(isZh?'已驳回,销售员已收到通知':'Rejected, sales notified');
              order = SalesOrderRepo.find(order.id);
              renderTabContent();
            } catch (e) { Toast.error(e.message); return false; }
          }},
        ],
      });
    }
  }

  /** 派车装车 Modal */
  function openDispatchModal(task, cur) {
    const isZh = I18n.get() === 'zh-CN';
    const meta = task.metadata || {};
    const vehicles = (typeof VehicleRepo !== 'undefined')
      ? VehicleRepo.list({ status: 'active' })
      : [];

    // 默认明细:按车次平均分剩余量
    const plannedTrucks = Math.max(1, Number(order.plannedTruckCount) || 1);
    const truckIndex = meta.truckIndex || 1;
    const isLastTruck = truckIndex >= plannedTrucks;
    const defaultItems = (order.items || []).map(oi => {
      const remaining = (oi.qty || 0) - (oi.deliveredQty || 0);
      if (remaining <= 0) return null;
      const truckQty = isLastTruck
        ? remaining
        : Math.floor(remaining / (plannedTrucks - truckIndex + 1));
      return { lineId: oi.lineId, materialName: oi.materialName, unit: oi.unit, qty: truckQty, max: remaining };
    }).filter(Boolean);

    Modal.open({
      title: `${isZh?'派车装车':'Dispatch Truck'} - ${isZh?'第':'#'} ${truckIndex}/${plannedTrucks} ${isZh?'车':''}`,
      width: 680,
      content: `
        <div style="display:flex; flex-direction:column; gap:12px;">
          <div>
            <label class="text-muted" style="font-size:11px;">${isZh?'选择车辆':'Vehicle'} <span class="text-red">*</span></label>
            <div style="display:flex; gap:4px; margin-top:4px;">
              <select id="dp-vehicle" class="input" style="flex:1;">
                <option value="">${isZh?'-- 请选择 --':'-- Select --'}</option>
                ${vehicles.map(v => `<option value="${v.id}" data-driver="${v.defaultDriverName||v.driverName||''}" data-phone="${v.defaultDriverPhone||v.driverPhone||''}">${v.plateNumber || v.plateNo} ${(v.defaultDriverName||v.driverName) ? '· ' + (v.defaultDriverName||v.driverName) : ''}</option>`).join('')}
              </select>
              <button type="button" class="esel-btn esel-add" id="dp-add-vehicle" title="${isZh?'新建车辆':'Add Vehicle'}"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/></svg></button>
              <button type="button" class="esel-btn esel-edit" id="dp-edit-vehicle" title="${isZh?'编辑车辆':'Edit Vehicle'}" disabled><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M11 2.5 l2.5 2.5 -8.5 8.5 H2.5 V11 z"/></svg></button>
            </div>
            ${vehicles.length === 0 ? `<div style="font-size:11px; color:var(--amber); margin-top:4px;">${isZh?'车辆库为空,点 + 快速添加':'No vehicles yet, click + to add'}</div>` : ''}
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div>
              <label class="text-muted" style="font-size:11px;">${isZh?'司机':'Driver'}</label>
              <input type="text" id="dp-driver" class="input" style="width:100%; margin-top:4px;">
            </div>
            <div>
              <label class="text-muted" style="font-size:11px;">${isZh?'司机电话':'Phone'}</label>
              <input type="text" id="dp-phone" class="input" style="width:100%; margin-top:4px;">
            </div>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div>
              <label class="text-muted" style="font-size:11px;">${isZh?'发车日期':'Depart Date'}</label>
              <input type="date" id="dp-date" class="input" style="width:100%; margin-top:4px;" value="${Utils.today()}">
            </div>
            <div>
              <label class="text-muted" style="font-size:11px;">${isZh?'运费($)':'Freight($)'}</label>
              <input type="number" id="dp-freight" class="input" style="width:100%; margin-top:4px;" value="0" min="0">
            </div>
          </div>
          <div>
            <label class="text-muted" style="font-size:11px;">${isZh?'装车明细':'Loading Items'}</label>
            <div style="margin-top:6px; max-height:180px; overflow-y:auto;">
              ${defaultItems.map((it, idx) => `
                <div style="display:grid; grid-template-columns:1fr auto auto; gap:10px; padding:6px 10px; background:var(--bg-3); border-radius:4px; font-size:12px; margin-bottom:4px;">
                  <span>${it.materialName}</span>
                  <input type="number" class="input dp-qty" data-line="${it.lineId}" value="${it.qty}" min="0" max="${it.max}" style="width:80px; text-align:right;">
                  <span class="text-muted" style="font-size:11px;">${it.unit||''} · ${isZh?'剩':'left'} ${it.max}</span>
                </div>
              `).join('')}
            </div>
          </div>
          <div>
            <label class="text-muted" style="font-size:11px;">${isZh?'备注':'Remark'}</label>
            <input type="text" id="dp-remark" class="input" style="width:100%; margin-top:4px;">
          </div>
        </div>
      `,
      onOpen: () => {
        const dpVehicle = document.getElementById('dp-vehicle');
        const dpEditBtn = document.getElementById('dp-edit-vehicle');

        // 车辆切换自动填充司机
        dpVehicle.addEventListener('change', e => {
          const opt = e.target.options[e.target.selectedIndex];
          document.getElementById('dp-driver').value = opt.dataset.driver || '';
          document.getElementById('dp-phone').value = opt.dataset.phone || '';
          if (dpEditBtn) dpEditBtn.disabled = !e.target.value;
        });

        // + 新建车辆
        document.getElementById('dp-add-vehicle').addEventListener('click', () => {
          if (typeof LogisticsModule !== 'undefined' && LogisticsModule.openVehicleEditorInline) {
            LogisticsModule.openVehicleEditorInline(null, (created) => {
              const opt = new Option(`${created.plateNo} · ${created.driverName||''}`, created.id, true, true);
              opt.dataset.driver = created.driverName || '';
              opt.dataset.phone = created.driverPhone || '';
              dpVehicle.add(opt);
              dpVehicle.value = created.id;
              document.getElementById('dp-driver').value = created.driverName || '';
              document.getElementById('dp-phone').value = created.driverPhone || '';
              if (dpEditBtn) dpEditBtn.disabled = false;
            });
          } else {
            // fallback: 直接弹简化 Modal
            _quickVehicleModal(null, (created) => {
              const opt = new Option(`${created.plateNo} · ${created.driverName||''}`, created.id, true, true);
              opt.dataset.driver = created.driverName || '';
              opt.dataset.phone = created.driverPhone || '';
              dpVehicle.add(opt);
              dpVehicle.value = created.id;
              document.getElementById('dp-driver').value = created.driverName || '';
              document.getElementById('dp-phone').value = created.driverPhone || '';
              if (dpEditBtn) dpEditBtn.disabled = false;
            });
          }
        });

        // ✎ 编辑车辆
        if (dpEditBtn) {
          dpEditBtn.addEventListener('click', () => {
            const v = dpVehicle.value;
            if (!v) return;
            _quickVehicleModal(v, () => {
              const updated = VehicleRepo.find(v);
              if (updated) {
                const opt = dpVehicle.options[dpVehicle.selectedIndex];
                opt.text = `${updated.plateNo} · ${updated.driverName||''}`;
                opt.dataset.driver = updated.driverName || '';
                opt.dataset.phone = updated.driverPhone || '';
                document.getElementById('dp-driver').value = updated.driverName || '';
                document.getElementById('dp-phone').value = updated.driverPhone || '';
              }
            });
          });
        }
      },
      buttons: [
        { label: isZh?'取消':'Cancel' },
        { label: isZh?'派车':'Dispatch', primary: true, onClick: () => {
          const vehicleId = document.getElementById('dp-vehicle').value;
          if (!vehicleId) { Toast.warning(isZh?'请选择车辆':'Select vehicle'); return false; }
          const items = Array.from(document.querySelectorAll('.dp-qty')).map(el => ({
            lineId: el.dataset.line,
            qty: Number(el.value) || 0,
          })).filter(it => it.qty > 0);
          if (items.length === 0) { Toast.warning(isZh?'装车数量必须大于 0':'Qty must be > 0'); return false; }
          try {
            OrderTaskService.dispatchTruck(task.id, {
              vehicleId,
              driverName: document.getElementById('dp-driver').value.trim(),
              driverPhone: document.getElementById('dp-phone').value.trim(),
              departAt: document.getElementById('dp-date').value,
              freight: Math.round(Number(document.getElementById('dp-freight').value || 0) * 100),
              items,
              remark: document.getElementById('dp-remark').value.trim(),
            }, cur.id);
            Toast.success(isZh?'已派车,正在运输':'Dispatched, in transit');
            order = SalesOrderRepo.find(order.id);
            renderTabContent();
          } catch (e) { Toast.error(e.message); return false; }
        }},
      ],
    });
  }

  /** 签收回单 Modal */
  function openSignModal(task, cur) {
    const isZh = I18n.get() === 'zh-CN';
    const meta = task.metadata || {};
    const del = meta.deliveryId ? DeliveryRepo.find(meta.deliveryId) : null;

    Modal.open({
      title: `${isZh?'确认签收':'Confirm Sign'} - ${del?.no || ''}`,
      width: 540,
      content: `
        <div style="display:flex; flex-direction:column; gap:12px;">
          <div style="padding:10px 12px; background:var(--bg-3); border-radius:4px; font-size:12px;">
            <div>${isZh?'发货单':'Delivery'}: <span class="font-mono text-strong">${del?.no || '-'}</span></div>
            <div>${isZh?'车牌':'Plate'}: <span class="font-mono">${del?.truckNo || '-'}</span></div>
            <div>${isZh?'司机':'Driver'}: ${del?.driverName || '-'}</div>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div>
              <label class="text-muted" style="font-size:11px;">${isZh?'签收人':'Signed By'} <span class="text-red">*</span></label>
              <input type="text" id="sg-by" class="input" style="width:100%; margin-top:4px;" placeholder="${isZh?'如:赵厂长':'e.g. Manager'}" value="客户签收">
            </div>
            <div>
              <label class="text-muted" style="font-size:11px;">${isZh?'签收日期':'Signed Date'}</label>
              <input type="date" id="sg-date" class="input" style="width:100%; margin-top:4px;" value="${Utils.today()}">
            </div>
          </div>
          <div>
            <label class="text-muted" style="font-size:11px;">${isZh?'回单照片(建议上传)':'Receipt Photo (recommended)'}</label>
            <div id="sg-att-mount" style="margin-top:4px;"></div>
          </div>
          <div>
            <label class="text-muted" style="font-size:11px;">${isZh?'备注':'Remark'}</label>
            <input type="text" id="sg-remark" class="input" style="width:100%; margin-top:4px;">
          </div>
        </div>
      `,
      onOpen: () => {
        if (typeof AttachmentUploader !== 'undefined') {
          window.__signUploader = AttachmentUploader.create({
            mount: '#sg-att-mount',
            entityType: 'delivery',
            entityId: meta.deliveryId,
            taskId: task.id,
            placeholder: isZh?'回单照片':'Receipt photo',
            maxFiles: 5,
          });
        }
      },
      buttons: [
        { label: isZh?'取消':'Cancel' },
        { label: isZh?'确认签收':'Confirm', primary: true, onClick: () => {
          const signedBy = document.getElementById('sg-by').value.trim();
          if (!signedBy) { Toast.warning(isZh?'请填写签收人':'Signer required'); return false; }
          const atts = window.__signUploader ? window.__signUploader.getAttachments() : [];
          try {
            OrderTaskService.signDelivery(task.id, {
              signedBy,
              signedAt: document.getElementById('sg-date').value,
              attachments: atts,
              remark: document.getElementById('sg-remark').value.trim(),
            }, cur.id);
            Toast.success(isZh?'已签收':'Signed');
            order = SalesOrderRepo.find(order.id);
            renderTabContent();
          } catch (e) { Toast.error(e.message); return false; }
        }},
      ],
    });
  }


  /** 价格审批面板:订单有 pending 的 low_price_approve 时显示 */
  /** OA 任务面板:展示订单当前 pending 的所有任务 + 当前用户可执行的操作 */
  function renderPriceApprovalPanel() {
    if (typeof OrderTaskService === 'undefined') return '';
    const isZh = I18n.get() === 'zh-CN';
    const cur = Session.current();
    const pendings = OrderTaskService.getPendingByOrder(order.id);

    // 没有 pending 任务时,显示状态摘要
    if (pendings.length === 0) {
      // 草稿:销售员看到"提交订单"按钮
      if (order.status === 'draft' && cur.role === 'sales') {
        return `
          <div style="background:rgba(148,163,184,0.08); border:1px solid rgba(148,163,184,0.3); border-radius:8px; padding:16px; margin-bottom:16px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div>
                <div class="text-strong" style="font-size:14px;">${Icon.file(13)} ${isZh?'草稿订单':'Draft Order'}</div>
                <div class="text-muted" style="font-size:11px; margin-top:3px;">${order.rejectedReason ? `${isZh?'被驳回':'Rejected'}: ${order.rejectedReason}` : (isZh?'订单尚未提交流程':'Order not yet submitted')}</div>
              </div>
              <button class="btn btn-primary btn-sm" data-action="submit-order">${isZh?'<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><polyline points="3,8 7,12 13,4"/></svg> 提交流程':'<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><polyline points="3,8 7,12 13,4"/></svg> Submit'}</button>
            </div>
          </div>
        `;
      }
      // 已完成 / 已取消:不显示
      return '';
    }

    // 有 pending 任务:逐个渲染
    return pendings.map(task => renderTaskCard(task, cur)).join('');
  }

  function renderTaskCard(task, cur) {
    const isZh = I18n.get() === 'zh-CN';
    const cfg = SCHEMAS.orderTask?.typeEnum?.[task.type] || {};
    const typeLabel = cfg.label || task.type;
    const color = ({
      red: 'var(--red)', amber: 'var(--amber)', blue: 'var(--blue)',
      violet: 'var(--violet)', emerald: 'var(--emerald)', slate: 'var(--text-2)',
    })[cfg.color] || 'var(--text-2)';
    const bgColor = ({
      red: 'var(--red-bg)', amber: 'var(--amber-bg)',
      blue: 'var(--blue-bg)', violet: 'var(--violet-bg)',
      emerald: 'var(--emerald-bg)', slate: 'var(--bg-3)',
    })[cfg.color] || 'var(--bg-3)';
    const borderColor = 'var(--border-2)';

    const _managerRoles = new Set(['manager', 'general_manager', 'ceo', 'super_admin']);
    const _roleToAssigned = {
      sales: 'sales', sales_manager: 'sales',
      warehouse: 'warehouse', warehouse_manager: 'warehouse',
      finance: 'finance', finance_manager: 'finance',
    };
    const canHandle = _managerRoles.has(cur.role) ||
      task.assignedRole === _roleToAssigned[cur.role];
    const requester = EmployeeRepo.find(task.createdBy);

    // 不同类型 task 显示不同详情和操作
    let detailsHTML = '';
    let actionButtons = '';

    if (task.type === 'finance_approve' || task.type === 'price_approve') {
      // ✅ 财务审批:显示订单概要 + 低价明细(若有)
      const meta = task.metadata || {};
      const hasLowPrice = meta.hasLowPrice || task.type === 'price_approve';

      const cust = CustomerRepo.find(order.customerId);
      const itemSum = (order.items || []).length;

      // 仓管不该看到价格异常明细(包含成本/价格信息)
      const canSeeAmount = (typeof Sensitive !== 'undefined') ? Sensitive.canSeeAmount() : true;

      detailsHTML += `
        <div style="margin-bottom:10px; padding:10px; background:rgba(0,0,0,0.18); border-radius:4px;">
          <div style="display:grid; grid-template-columns: auto 1fr; gap:6px 14px; font-size:12px;">
            <span class="text-muted">${isZh?'客户':'Customer'}:</span>
            <span class="text-strong">${cust?.name || '-'} <span class="text-muted">${cust?.code || ''}</span></span>
            <span class="text-muted">${isZh?'订单总额':'Total'}:</span>
            <span class="font-mono text-strong">${Sensitive.money(order.totalAmount)}</span>
            <span class="text-muted">${isZh?'产品数':'Items'}:</span>
            <span>${itemSum} ${isZh?'项':'item(s)'}</span>
          </div>
        </div>
      `;

      if (hasLowPrice && canSeeAmount) {
        // 列低价明细
        const lowItems = [];
        (order.items || []).forEach(it => {
          const p = ProductService.findById(it.materialId);
          if (!p) return;
          if (ProductService.priceLevel(it.unitPrice, p) === 'below_min') {
            lowItems.push({ it, p, diff: p.minPrice - it.unitPrice });
          }
        });
        if (lowItems.length > 0) {
          detailsHTML += `
            <div style="margin-bottom:10px;">
              <div style="font-size:11px; color:var(--red); text-transform:uppercase; margin-bottom:6px;">${Icon.warning(11)} ${isZh?'价格异常明细':'Price Alert'}</div>
              ${lowItems.map(x => `
                <div style="display:flex; gap:10px; padding:6px 10px; background:rgba(248,113,113,0.06); border-left:2px solid var(--red); border-radius:4px; font-size:11px; margin-bottom:4px;">
                  <span class="text-strong" style="min-width:160px;">${x.p.name}</span>
                  <span class="font-mono">${Utils.formatMoney(x.it.unitPrice)}/${x.p.unit}</span>
                  <span class="text-muted">×${x.it.qty}</span>
                  <span class="text-muted">${isZh?'最低':'Min'} ${Utils.formatMoney(x.p.minPrice)}</span>
                  <span class="text-red font-mono" style="margin-left:auto;">- ${Utils.formatMoney(x.diff * x.it.qty)}</span>
                </div>
              `).join('')}
            </div>
          `;
        }
      }

      if (order.approveReason) {
        detailsHTML += `
          <div style="margin-bottom:10px;">
            <div style="font-size:11px; color:var(--text-3); text-transform:uppercase; margin-bottom:6px;">${isZh?'销售申请理由':'Sales Reason'}</div>
            <div style="padding:8px 10px; background:rgba(0,0,0,0.18); border-radius:4px; font-size:12px; font-style:italic;">"${order.approveReason}"</div>
          </div>
        `;
      }
      if (canHandle) {
        actionButtons = `
          <button class="btn btn-secondary btn-sm" data-task-action="reject" data-task-id="${task.id}">${isZh?'驳回':'Reject'}</button>
          <button class="btn btn-primary btn-sm" data-task-action="complete" data-task-id="${task.id}">${Icon.check(13)} ${isZh?'审批通过':'Approve'}</button>
        `;
      }
    } else if (task.type === 'warehouse_prepare' || task.type === 'warehouse_pick') {
      // 拣货:显示订单明细 + 库存检查
      const itemRows = (order.items || []).map(it => {
        const needQty = (it.qty || 0) - (it.deliveredQty || 0);
        let stockInfo = '';
        if (typeof InventoryService !== 'undefined' && InventoryService.getInventory) {
          const inv = InventoryService.getInventory(it.materialId, 'wh_finished');
          const available = (inv?.quantity || 0) - (inv?.lockedQty || 0);
          const insufficient = available < needQty;
          stockInfo = `<span style="font-size:11px; color:${insufficient?'var(--red)':'var(--emerald)'};">${isZh?'可用':'Avail'} ${available}</span>`;
        }
        return `
          <div style="display:grid; grid-template-columns:1fr auto auto; gap:10px; padding:6px 10px; background:var(--bg-3); border-radius:4px; font-size:12px; margin-bottom:4px;">
            <span class="text-strong">${it.materialName || '-'}</span>
            <span class="font-mono">${needQty} ${it.unit || ''}</span>
            ${stockInfo}
          </div>
        `;
      }).join('');
      detailsHTML += `
        <div style="margin-bottom:10px;">
          <div style="font-size:11px; color:var(--text-3); text-transform:uppercase; margin-bottom:6px;">${isZh?'拣货清单':'Pick List'}</div>
          ${itemRows}
        </div>
        <div class="text-muted" style="font-size:12px;">
          ${isZh?'确认拣货完成后,系统将自动扣减库存并生成 ':'After picking, system will deduct stock and create '}
          <span class="text-strong" style="color:var(--text-1);">${order.plannedTruckCount || 1}</span>
          ${isZh?' 个派车任务':' dispatch tasks'}
        </div>
      `;
      if (canHandle) {
        actionButtons = `<button class="btn btn-primary btn-sm" data-task-action="complete" data-task-id="${task.id}">${Icon.check(13)} ${isZh?'拣货完成':'Picked'}</button>`;
      }
    } else if (task.type === 'warehouse_dispatch') {
      // 派车装车:显示车次信息 + 选车按钮
      const meta = task.metadata || {};
      detailsHTML += `
        <div style="margin-bottom:10px; padding:10px; background:var(--bg-3); border-radius:4px;">
          <div style="display:grid; grid-template-columns:auto 1fr; gap:6px 14px; font-size:12px;">
            <span class="text-muted">${isZh?'车次':'Truck'}:</span>
            <span class="text-strong">${isZh?'第':'#'} ${meta.truckIndex || 1} / ${meta.totalTrucks || 1} ${isZh?'车':''}</span>
            <span class="text-muted">${isZh?'状态':'Status'}:</span>
            <span style="color:var(--amber);">${isZh?'待选车 / 待装车':'Choose vehicle'}</span>
          </div>
        </div>
        <div class="text-muted" style="font-size:12px;">
          ${isZh?'请选择车辆并登记装车信息,提交后该车将进入运输中状态':'Select vehicle and confirm loading; truck will enter in-transit'}
        </div>
      `;
      if (canHandle) {
        actionButtons = `<button class="btn btn-primary btn-sm" data-task-action="dispatch" data-task-id="${task.id}">${Icon.truck(13)} ${isZh?'派车装车':'Dispatch'}</button>`;
      }
    } else if (task.type === 'delivery_sign') {
      // 签收回单
      const meta = task.metadata || {};
      const del = meta.deliveryId ? DeliveryRepo.find(meta.deliveryId) : null;
      const vehicle = del?.vehicleId && typeof VehicleRepo !== 'undefined' ? VehicleRepo.find(del.vehicleId) : null;
      detailsHTML += `
        <div style="margin-bottom:10px; padding:10px; background:var(--bg-3); border-radius:4px;">
          <div style="display:grid; grid-template-columns:auto 1fr; gap:6px 14px; font-size:12px;">
            <span class="text-muted">${isZh?'发货单':'Delivery'}:</span>
            <span class="font-mono text-strong">${del?.no || '-'}</span>
            <span class="text-muted">${isZh?'车牌':'Plate'}:</span>
            <span class="font-mono">${del?.truckNo || vehicle?.plateNumber || '-'}</span>
            <span class="text-muted">${isZh?'司机':'Driver'}:</span>
            <span>${del?.driverName || '-'} ${del?.driverPhone ? '· ' + del.driverPhone : ''}</span>
            <span class="text-muted">${isZh?'发车时间':'Depart'}:</span>
            <span class="font-mono">${del?.deliveryDate || '-'}</span>
          </div>
        </div>
        <div class="text-muted" style="font-size:12px;">
          ${isZh?'客户签收后,请登记签收人和回单照片':'After customer signs, register signer and upload receipt'}
        </div>
      `;
      if (canHandle) {
        actionButtons = `<button class="btn btn-primary btn-sm" data-task-action="sign" data-task-id="${task.id}">${Icon.check(13)} ${isZh?'确认签收':'Confirm Sign'}</button>`;
      }
    } else if (task.type === 'warehouse_ship') {
      detailsHTML += `
        <div class="text-muted" style="font-size:12px;">${isZh?'货已备齐,等待装车发出':'Goods ready, waiting to ship'}</div>
      `;
      if (canHandle) {
        actionButtons = `<button class="btn btn-primary btn-sm" data-task-action="complete" data-task-id="${task.id}">${Icon.truck(13)} ${isZh?'确认发车':'Confirm Shipped'}</button>`;
      }
    } else if (task.type === 'settlement_create') {
      detailsHTML += `
        <div class="text-muted" style="font-size:12px;">${isZh?'订单已发货,等待创建结算单':'Order shipped, waiting for settlement'}</div>
      `;
      if (canHandle) {
        actionButtons = `<button class="btn btn-primary btn-sm" data-task-action="complete" data-task-id="${task.id}">${Icon.clipboard(13)} ${isZh?'创建结算':'Create Settlement'}</button>`;
      }
    } else if (task.type === 'payment_register') {
      detailsHTML += `
        <div class="text-muted" style="font-size:12px;">${isZh?'结算单已开,等待登记收款':'Settlement created, register payment when received'}</div>
      `;
      if (canHandle) {
        actionButtons = `<button class="btn btn-primary btn-sm" data-task-action="complete" data-task-id="${task.id}">${Icon.money(13)} ${isZh?'登记收款':'Register Payment'}</button>`;
      }
    } else if (task.type === 'order_revise') {
      detailsHTML += `
        ${task.description ? `<div style="padding:8px 10px; background:rgba(0,0,0,0.18); border-radius:4px; font-size:12px; font-style:italic; margin-bottom:8px;">${task.description}</div>` : ''}
        <div class="text-muted" style="font-size:12px;">${isZh?'修改订单后,在 Step 4 重新提交即可':'Edit order, then resubmit at Step 4'}</div>
      `;
    }

    const priorityIcon = task.priority === 'urgent' ? `<span style="color:var(--red);">${Icon.warning(12)}</span> ` : task.priority === 'high' ? `<span style="color:var(--amber);">${Icon.bolt(12)}</span> ` : '';

    return `
      <div style="background:${bgColor}; border:1px solid ${borderColor}; border-radius:8px; padding:16px; margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:12px;">
          <div>
            <div class="text-strong" style="color:${color}; font-size:14px;">${priorityIcon}${typeLabel} - ${task.assignedRole === 'finance' ? (isZh?'待财务处理':'Pending Finance') : task.assignedRole === 'warehouse' ? (isZh?'待仓库处理':'Pending Warehouse') : task.assignedRole === 'sales' ? (isZh?'待销售处理':'Pending Sales') : task.assignedRole}</div>
            <div class="text-muted" style="font-size:11px; margin-top:3px;">${task.title || ''}${requester ? ` · ${isZh?'创建人':'Created by'}: ${requester.name}` : ''} · ${Utils.formatDateTime(task.createdAt)}</div>
          </div>
          ${canHandle ? `<div style="display:flex; gap:8px;">${actionButtons}</div>` : `<div class="text-muted" style="font-size:11px; font-style:italic;">${isZh?`仅 ${task.assignedRole === 'finance' ? '财务' : task.assignedRole === 'warehouse' ? '仓库' : '销售'} 可处理`:`${task.assignedRole} role only`}</div>`}
        </div>
        ${detailsHTML}
      </div>
    `;
  }

  function generateSmartHints(deliveries, settlements) {
    const hints = [];
    // 1. 有强制发货
    const forced = deliveries.filter(d => d.creditCheckResult?.forced);
    if (forced.length > 0) {
      hints.push({
        icon: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M8 1.5 L14.5 13.5 H1.5 Z"/><line x1="8" y1="6.5" x2="8" y2="9.5"/><line x1="8" y1="11.5" x2="8" y2="11.6"/></svg>',
        severity: 'danger',
        text: I18n.get()==='zh-CN'
          ? `本订单有 ${forced.length} 次强制发货,客户信用紧张,建议优先催收`
          : `${forced.length} forced deliveries, credit tight - prioritize collection`
      });
    }
    // 2. 有逾期
    const overdue = settlements.filter(s => s.status === 'overdue');
    if (overdue.length > 0) {
      const totalOverdue = overdue.reduce((s, x) => s + (x.unpaidAmount || 0), 0);
      hints.push({
        icon: '⏰',
        severity: 'danger',
        text: I18n.get()==='zh-CN'
          ? `${overdue.length} 张结算单已逾期,共 ${Utils.formatMoney(totalOverdue)} 未收`
          : `${overdue.length} settlements overdue, ${Utils.formatMoney(totalOverdue)} unpaid`
      });
    }
    // 3. 有未结算的发货(可能凑齐三车)
    const ungrouped = deliveries.filter(d =>
      d.transportStatus === 'signed' && d.settlementStatus === 'pending'
    ).length;
    if (ungrouped > 0 && ungrouped < 3) {
      hints.push({
        icon: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M2 5 L8 2 L14 5 L8 8 Z"/><path d="M2 5 V11 L8 14 V8"/><path d="M14 5 V11 L8 14"/></svg>',
        severity: 'info',
        text: I18n.get()==='zh-CN'
          ? `还有 ${ungrouped} 车未凑满三车,再发 ${3 - ungrouped} 车可自动结算`
          : `${ungrouped} unsettled trucks, ${3 - ungrouped} more to auto-settle`
      });
    }
    // 4. 待确认的订单
    if (order.status === 'draft') {
      hints.push({
        icon: '○',
        severity: 'warning',
        text: I18n.get()==='zh-CN'
          ? '订单尚未确认,请确认后才能发货'
          : 'Order not yet confirmed'
      });
    }
    // 5. 信用使用率超 90%
    const _custOrdersForHint = customer ? SalesOrderRepo.list({ customerId: customer.id })
      .filter(o => !['completed','cancelled'].includes(o.status)) : [];
    const _exposure = _custOrdersForHint.reduce((s, o) => s + (o.totalAmount || 0), 0);
    const creditUsage = customer?.creditLimit > 0
      ? _exposure / customer.creditLimit * 100
      : 0;
    if (creditUsage > 90) {
      hints.push({
        icon: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M8 1.5 L14.5 13.5 H1.5 Z"/><line x1="8" y1="6.5" x2="8" y2="9.5"/><line x1="8" y1="11.5" x2="8" y2="11.6"/></svg>',
        severity: 'warning',
        text: I18n.get()==='zh-CN'
          ? `客户信用使用 ${Math.round(creditUsage)}%,接近上限`
          : `Customer credit at ${Math.round(creditUsage)}%, near limit`
      });
    }
    return hints;
  }

  function renderMiniTimeline() {
    const events = getTimeline();
    if (events.length === 0) {
      return `<div class="text-muted" style="font-size:12px;">${t('orderCenter.tlNoEvents')}</div>`;
    }
    // 取最近 5 条
    const recent = events.slice(-5).reverse();
    return `
      <div style="display:flex; flex-direction:column; gap:8px;">
        ${recent.map(e => `
          <div style="display:flex; gap:10px; align-items:center; padding:6px 0; font-size:12px;">
            <span style="width:8px; height:8px; border-radius:50%; background:${severityColor(e.severity)};"></span>
            <span class="text-strong" style="min-width:120px;">${e.title}</span>
            <span class="text-muted" style="font-size:11px;">${e.operator?.name || ''}</span>
            <span class="font-mono text-muted" style="font-size:11px; margin-left:auto;">${Utils.formatDateTime(e.timestamp)}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  function severityColor(s) {
    return {
      success: 'var(--emerald)',
      info:    'var(--blue)',
      warning: 'var(--amber)',
      danger:  'var(--red)',
      neutral: 'var(--text-3)',
    }[s] || 'var(--text-3)';
  }

  // ========== Tab: Timeline ==========
  let _timelineRoleFilter = 'all';  // Phase 5: actorRole 筛选

  function renderTimeline() {
    const allEvents = getTimeline();
    if (allEvents.length === 0) {
      document.getElementById('tab-content').innerHTML = `
        <div class="tab-pane active">
          <div class="coming-soon">
            <div class="coming-soon-icon">⌚</div>
            <div class="coming-soon-title">${t('orderCenter.tlNoEvents')}</div>
          </div>
        </div>
      `;
      return;
    }

    // 统计每个 role 的事件数
    const roleCounts = {};
    allEvents.forEach(e => {
      const r = e.actorRole || 'system';
      roleCounts[r] = (roleCounts[r] || 0) + 1;
    });
    const ROLE_TABS = ['all', 'sales', 'warehouse', 'finance', 'system'];
    const isZh = I18n.get() === 'zh-CN';
    const roleLabels = {
      all:       isZh?'全部':'All',
      sales:     isZh?'销售':'Sales',
      warehouse: isZh?'仓储':'Warehouse',
      finance:   isZh?'财务':'Finance',
      system:    isZh?'系统':'System',
    };
    const roleColors = {
      all:       'transparent',
      sales:     'var(--blue)',
      warehouse: 'var(--orange)',
      finance:   'var(--amber)',
      system:    'var(--text-3)',
    };

    const filteredEvents = _timelineRoleFilter === 'all'
      ? allEvents
      : allEvents.filter(e => (e.actorRole || 'system') === _timelineRoleFilter);

    const filterBar = `
      <div class="tl-filter-bar">
        <span class="text-muted" style="font-size:11px;">${isZh?'按角色筛选':'Filter by role'}:</span>
        ${ROLE_TABS.map(r => {
          const count = r === 'all' ? allEvents.length : (roleCounts[r] || 0);
          const isActive = _timelineRoleFilter === r;
          return `
            <button class="tl-role-filter-btn ${isActive ? 'active' : ''}" data-role="${r}">
              ${r === 'all' ? '' : `<span class="role-dot" style="background:${roleColors[r]};"></span>`}
              ${roleLabels[r]} ${count > 0 ? `<span class="role-count">(${count})</span>` : ''}
            </button>
          `;
        }).join('')}
        <span style="flex:1;"></span>
        <span class="text-muted" style="font-size:11px;">${isZh?'共':'Total'} ${filteredEvents.length} ${isZh?'条':'events'}</span>
      </div>
    `;

    // 左右交替事件
    const eventsHtml = filteredEvents.map((e, idx) => {
      const side = idx % 2 === 0 ? 'left' : 'right';
      const prev = idx > 0 ? filteredEvents[idx - 1] : null;
      return renderTimelineEventAlt(e, side, idx === filteredEvents.length - 1, prev);
    }).join('');

    document.getElementById('tab-content').innerHTML = `
      <div class="tab-pane active">
        ${filterBar}
        ${filteredEvents.length === 0 ? `
          <div class="coming-soon" style="padding:30px;">
            <div class="coming-soon-icon" style="font-size:24px; opacity:0.4;">○</div>
            <div class="text-muted" style="font-size:12px;">${isZh?'该角色暂无事件':'No events for this role'}</div>
          </div>
        ` : `<div class="tl-alt">${eventsHtml}</div>`}
      </div>
    `;

    // 筛选按钮
    document.querySelectorAll('.tl-role-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _timelineRoleFilter = btn.dataset.role;
        renderTimeline();
      });
    });

    // 附件点击 → 预览
    document.querySelectorAll('[data-attachment-id]').forEach(el => {
      el.addEventListener('click', () => {
        const eventId = el.dataset.eventId;
        const attId = el.dataset.attachmentId;
        const event = allEvents.find(e => e.id === eventId);
        const att = event?.attachments?.find(a => a.id === attId);
        if (att) openAttachmentPreview(att, event);
      });
    });

    // 图片缩略图 → AttachmentViewer
    document.querySelectorAll('[data-tl-att]').forEach(el => {
      el.addEventListener('click', () => {
        const attId = el.dataset.tlAtt;
        const att = AttachmentService.findById(attId);
        if (att) AttachmentViewer.open(att);
      });
    });
  }

  /**
   * 左右交替样式的 Timeline 事件
   * @param {object} e   事件对象
   * @param {string} side 'left' | 'right'  事件卡片在中央竖线的哪一侧
   * @param {boolean} isLast 是否最后一条(不画下半段竖线)
   */
  /**
   * 事件简短描述(节点描述,根据 type 给中文友好语)
   */
  function _eventShortDesc(e) {
    const isZh = I18n.get() === 'zh-CN';
    const map = {
      order_created:       isZh ? '订单已创建' : 'Order created',
      order_confirmed:     isZh ? '订单已确认' : 'Order confirmed',
      quotation_accepted:  isZh ? '报价已接受' : 'Quotation accepted',
      delivery:            isZh ? '发货单已开' : 'Delivery dispatched',
      delivery_signed:     isZh ? '客户已签收' : 'Customer signed',
      delivery_grouped:    isZh ? '凑齐结算组' : 'Group filled',
      delivery_exception:  isZh ? '运输异常'   : 'Delivery exception',
      settlement_created:  isZh ? '结算单已创建' : 'Settlement created',
      settlement_confirmed:isZh ? '财务已确认结算' : 'Settlement confirmed',
      settlement_overdue:  isZh ? '结算已逾期'  : 'Settlement overdue',
      payment:             isZh ? '已收款'      : 'Payment received',
      risk:                isZh ? '风险预警'   : 'Risk alert',
      exception:           isZh ? '异常事件'   : 'Exception',
      appendix:            isZh ? '订单修改'   : 'Order modified',
      stock_consumed:      isZh ? '库存已扣减' : 'Stock consumed',
      stock_locked:        isZh ? '库存已锁定' : 'Stock locked',
      stock_released:      isZh ? '库存已释放' : 'Stock released',
      inbound_created:     isZh ? '入库单已建' : 'Inbound created',
      inbound_confirmed:   isZh ? '入库已确认' : 'Inbound confirmed',
      completed:           isZh ? '订单完结'   : 'Order completed',
      status_change: ''  // status_change 不重复给描述
    };
    // 状态变化推导友好描述
    if (e.type === 'status_change' && e.metadata) {
      const sa = e.metadata.statusAfter;
      const statusDesc = {
        pending_finance:   isZh ? '提交财务审批' : 'Submitted to finance',
        pending_picking:   isZh ? '财务已通过,转仓库拣货' : 'Approved, to warehouse',
        pending_warehouse: isZh ? '财务已通过,转仓库拣货' : 'Approved, to warehouse',
        picking:           isZh ? '仓库开始拣货' : 'Picking started',
        preparing:         isZh ? '仓库开始拣货' : 'Picking started',
        ready_to_ship:     isZh ? '拣货完成,待装车' : 'Picked, ready to ship',
        in_transit:        isZh ? '货物已发车,运输中' : 'In transit',
        partial_shipped:   isZh ? '部分车次已签收' : 'Partial shipped',
        signed:            isZh ? '所有车次已签收' : 'All signed',
        shipped:           isZh ? '所有车次已签收' : 'All shipped',
        settled:           isZh ? '已开结算单' : 'Settled',
        paid:              isZh ? '客户已付款,订单完成' : 'Paid, order complete',
        completed:         isZh ? '订单完结' : 'Order completed',
        cancelled:         isZh ? '订单已取消' : 'Cancelled',
      };
      return statusDesc[sa] || '';
    }
    return map[e.type] || '';
  }

  function renderTimelineEventAlt(e, side, isLast, prevEvent) {
    const isZh = I18n.get() === 'zh-CN';
    const icon = _eventIcon(e);
    const state = _eventState(e);
    const dateStr = Utils.formatDate(e.timestamp);
    const timeStr = new Date(e.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const shortDesc = _eventShortDesc(e);

    // 距上一节点耗时(从 prevEvent 算,不依赖 timeSinceLast)
    let duration = '';
    if (prevEvent) {
      const ms = new Date(e.timestamp) - new Date(prevEvent.timestamp);
      const days = Math.floor(ms / 86400000);
      const hours = Math.floor((ms % 86400000) / 3600000);
      const mins  = Math.floor((ms % 3600000) / 60000);
      if (days > 0)        duration = isZh ? `${days} 天` : `${days}d`;
      else if (hours > 0)  duration = isZh ? `${hours} 时` : `${hours}h`;
      else if (mins > 1)   duration = isZh ? `${mins} 分` : `${mins}m`;
      else                 duration = isZh ? '即时' : 'instant';
    } else {
      duration = isZh ? '起点' : 'start';
    }

    // changes 展开(附录)
    let changesHtml = '';
    if (e.type === 'appendix' && e.metadata?.changes?.length > 0) {
      changesHtml = `
        <div class="tl-event-changes">
          ${e.metadata.changes.map(c => renderChangeLine(c)).join('')}
        </div>
      `;
    }

    // 附件 — 完整保留
    let attachmentsHtml = '';
    if (e.attachments && e.attachments.length > 0) {
      const imgAtts = e.attachments.filter(a => a.type === 'image' || (a.url && a.url.startsWith('data:image/')));
      const fileAtts = e.attachments.filter(a => !(a.type === 'image' || (a.url && a.url.startsWith('data:image/'))));
      let html = '<div class="tl-event-attachments">';
      if (imgAtts.length > 0) {
        html += '<div class="att-gallery" style="margin-top:6px;">';
        imgAtts.forEach(a => {
          html += `<div class="att-gallery-item" data-tl-att="${a.id}" title="${a.caption || a.name || ''}">
            <img src="${a.previewUrl || a.url}" alt="">
          </div>`;
        });
        html += '</div>';
      }
      fileAtts.forEach(a => {
        html += `<div class="tl-attachment" data-event-id="${e.id}" data-attachment-id="${a.id}">
          <span>${a.icon || '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M9 1.5 H4 a1.5 1.5 0 0 0 -1.5 1.5 V13 a1.5 1.5 0 0 0 1.5 1.5 H12 a1.5 1.5 0 0 0 1.5 -1.5 V5.5 Z"/><polyline points="9,1.5 9,5.5 13.5,5.5"/></svg>'}</span>
          <span class="name">${a.name}</span>
          <span class="size">${formatSize(a.size)}</span>
        </div>`;
      });
      html += '</div>';
      attachmentsHtml = html;
    }

    // 操作员
    let operatorHtml = '';
    if (e.operator) {
      const parts = [e.operator.name];
      if (e.operator.role) parts.push(e.operator.role);
      if (e.operator.department) parts.push(e.operator.department);
      operatorHtml = `<div class="tl-alt-meta">${parts.join(' · ')}</div>`;
    }

    const roleKey = e.actorRole || e.operator?.role || 'system';
    const roleBadge = (typeof Roles !== 'undefined') ? Roles.renderBadge(roleKey) : '';

    const orderBadge = (e.orderNo && e.type !== 'order_created' && e.type !== 'order_confirmed')
      ? `<span class="font-mono" style="padding:1px 6px; background:var(--blue-bg); color:var(--blue); border-radius:3px; font-size:10px;" title="${isZh?'所属订单':'Belongs to order'}">${e.orderNo}</span>`
      : '';

    // 描述(原 description) — 优先用原 description,没有的话用 shortDesc
    const desc = e.description || shortDesc;
    const descHtml = desc ? `<div class="tl-alt-desc">${desc}</div>` : '';

    // 节点描述(独立一行,在标题下)
    const shortDescHtml = (shortDesc && shortDesc !== desc)
      ? `<div class="tl-alt-shortdesc">${shortDesc}</div>` : '';

    const cardHtml = `
      <div class="tl-alt-card">
        <div class="tl-alt-card-header">
          <span class="tl-alt-title">${e.title}</span>
          <span class="tl-alt-badges">${roleBadge}${orderBadge}</span>
        </div>
        ${shortDescHtml}
        ${descHtml}
        ${changesHtml}
        ${attachmentsHtml}
        ${operatorHtml}
      </div>
    `;

    return `
      <div class="tl-alt-row tl-alt-${side} state-${state}" data-event-id="${e.id}" data-actor-role="${roleKey}">
        <div class="tl-alt-card-wrap tl-alt-card-left">
          ${side === 'left' ? cardHtml : ''}
        </div>

        <div class="tl-alt-center">
          <div class="tl-alt-date">${dateStr}</div>
          <div class="tl-alt-time-mini">${timeStr}</div>
          <div class="tl-alt-circle state-${state}">
            <span class="tl-alt-icon">${icon}</span>
          </div>
          <div class="tl-alt-duration">${duration}</div>
          ${!isLast ? '<div class="tl-alt-line"></div>' : ''}
        </div>

        <div class="tl-alt-card-wrap tl-alt-card-right">
          ${side === 'right' ? cardHtml : ''}
        </div>
      </div>
    `;
  }

  function renderTimelineEvent(e) {
    const icon = eventIcon(e.type);
    const time = Utils.formatDateTime(e.timestamp);
    const timeSince = e.timeSinceLast ? `<span class="time-since">· ${e.timeSinceLast}</span>` : '';

    // changes 展开(附录)
    let changesHtml = '';
    if (e.type === 'appendix' && e.metadata?.changes?.length > 0) {
      changesHtml = `
        <div class="tl-event-changes">
          ${e.metadata.changes.map(c => renderChangeLine(c)).join('')}
        </div>
      `;
    }

    // 附件
    let attachmentsHtml = '';
    if (e.attachments && e.attachments.length > 0) {
      const imgAtts = e.attachments.filter(a => a.type === 'image' || (a.url && a.url.startsWith('data:image/')));
      const fileAtts = e.attachments.filter(a => !(a.type === 'image' || (a.url && a.url.startsWith('data:image/'))));
      let html = '<div class="tl-event-attachments">';
      // 图片:缩略图画廊
      if (imgAtts.length > 0) {
        html += '<div class="att-gallery" style="margin-top:6px;">';
        imgAtts.forEach(a => {
          html += `<div class="att-gallery-item" data-tl-att="${a.id}" title="${a.caption || a.name || ''}">
            <img src="${a.previewUrl || a.url}" alt="">
          </div>`;
        });
        html += '</div>';
      }
      // 文件:列表
      fileAtts.forEach(a => {
        html += `<div class="tl-attachment" data-event-id="${e.id}" data-attachment-id="${a.id}">
          <span>${a.icon || '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M9 1.5 H4 a1.5 1.5 0 0 0 -1.5 1.5 V13 a1.5 1.5 0 0 0 1.5 1.5 H12 a1.5 1.5 0 0 0 1.5 -1.5 V5.5 Z"/><polyline points="9,1.5 9,5.5 13.5,5.5"/></svg>'}</span>
          <span class="name">${a.name}</span>
          <span class="size">${formatSize(a.size)}</span>
        </div>`;
      });
      html += '</div>';
      attachmentsHtml = html;
    }

    // 操作员
    let operatorHtml = '';
    if (e.operator) {
      operatorHtml = `
        <div class="tl-event-meta">
          ${e.operator.name}${e.operator.role ? ' · ' + e.operator.role : ''}${e.operator.department ? ' · ' + e.operator.department : ''}
        </div>
      `;
    }

    // Role 徽章(从 actorRole 或 operator.role 取)
    const roleKey = e.actorRole || e.operator?.role || 'system';
    const roleBadge = (typeof Roles !== 'undefined') ? Roles.renderBadge(roleKey) : '';

    // 订单号关联徽章(如果此事件不直接是订单创建,且 orderNo 存在,显示关联)
    const orderBadge = (e.orderNo && e.type !== 'order_created' && e.type !== 'order_confirmed')
      ? `<span class="font-mono" style="padding:1px 6px; background:var(--blue-bg); color:var(--blue); border-radius:3px; font-size:10px; margin-left:4px;" title="${I18n.get()==='zh-CN'?'所属订单':'Belongs to order'}">${e.orderNo}</span>`
      : '';

    return `
      <div class="tl-event severity-${e.severity}" data-event-id="${e.id}" data-actor-role="${roleKey}">
        <div class="tl-event-header">
          <span class="tl-event-icon">${icon}</span>
          <span class="tl-event-title">${e.title}</span>
          ${roleBadge}${orderBadge}
          <span class="tl-event-time">${time}${timeSince}</span>
        </div>
        ${e.description ? `<div class="tl-event-desc">${e.description}</div>` : ''}
        ${changesHtml}
        ${attachmentsHtml}
        ${operatorHtml}
      </div>
    `;
  }

  function renderChangeLine(c) {
    const isZh = I18n.get() === 'zh-CN';
    if (c.type === 'modify') {
      const fieldLabel = {
        qty: isZh ? '数量' : 'Qty',
        unitPrice: isZh ? '单价' : 'Unit Price',
        deliveryDate: isZh ? '交期' : 'Delivery Date',
        paymentTerm: isZh ? '付款条件' : 'Payment Term',
      }[c.field] || c.field;
      const oldVal = c.field === 'unitPrice' ? Utils.formatMoney(c.oldValue) : c.oldValue;
      const newVal = c.field === 'unitPrice' ? Utils.formatMoney(c.newValue) : c.newValue;
      return `
        <div class="change-line">
          <span>${c.materialName ? c.materialName + ' · ' : ''}${fieldLabel}:</span>
          <span class="text-muted">${oldVal}</span>
          <span>→</span>
          <span class="text-strong text-amber">${newVal}</span>
        </div>
      `;
    }
    if (c.type === 'add') {
      return `<div class="change-line text-emerald">+ ${c.materialName} × ${c.qty} @ ${Utils.formatMoney(c.unitPrice)}</div>`;
    }
    if (c.type === 'remove') {
      return `<div class="change-line text-red">- ${c.materialName}</div>`;
    }
    return '';
  }

  function eventIcon(type) {
    return {
      quotation_accepted: '🤝',
      order_created: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><rect x="3.5" y="3" width="9" height="11" rx="1.5"/><rect x="6" y="1.5" width="4" height="3" rx="0.5"/></svg>',
      order_confirmed: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><polyline points="3,8 7,12 13,4"/></svg>',
      status_change: '→',
      appendix: '✎',
      delivery: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><rect x="1" y="4" width="9" height="7" rx="0.5"/><path d="M10 6 H13 L15 8.5 V11 H10 Z"/><circle cx="4" cy="12.5" r="1.5"/><circle cx="12" cy="12.5" r="1.5"/></svg>',
      delivery_signed: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><polyline points="3,8 7,12 13,4"/></svg>',
      delivery_grouped: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M2 5 L8 2 L14 5 L8 8 Z"/><path d="M2 5 V11 L8 14 V8"/><path d="M14 5 V11 L8 14"/></svg>',
      delivery_exception: '✕',
      settlement_created: '💼',
      settlement_confirmed: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><polyline points="3,8 7,12 13,4"/></svg>',
      payment: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><rect x="1.5" y="3" width="13" height="10" rx="1.5"/><circle cx="8" cy="8" r="2.25"/></svg>',
      risk: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M8 1.5 L14.5 13.5 H1.5 Z"/><line x1="8" y1="6.5" x2="8" y2="9.5"/><line x1="8" y1="11.5" x2="8" y2="11.6"/></svg>',
      exception: '✕',
      file: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M11 4.5 L5.5 10 a2.5 2.5 0 0 0 3.5 3.5 L14 8 a4 4 0 0 0 -5.5 -5.5 L3 8 a5 5 0 0 0 7 7 L14.5 10.5"/></svg>',
      completed: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><circle cx="8" cy="6" r="4.5"/><polyline points="5.5,10 4.5,15 8,13 11.5,15 10.5,10"/></svg>',
    }[type] || '•';
  }

  function formatSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  // ========== 附件预览 ==========
  function openAttachmentPreview(att, event) {
    const isZh = I18n.get() === 'zh-CN';
    let bodyHtml = '';

    if (att.type === 'pdf') {
      // PDF mock - 显示模拟纸质文档
      bodyHtml = `
        <div class="preview-pdf-page">
          <div style="text-align:center; margin-bottom:30px; padding-bottom:20px; border-bottom:1px solid #ddd;">
            <h2 style="margin:0 0 5px 0; font-size:18px;">森达木业 SENDAR WOOD CO., LTD.</h2>
            <div style="color:#888; font-size:12px;">广东省东莞市厚街镇 · Tel: 0769-88888888</div>
          </div>
          <h3 style="text-align:center; margin:20px 0;">${att.name.replace('.pdf','').replace(/_/g,' ')}</h3>
          <table style="width:100%; font-size:13px; line-height:1.8; border-collapse:collapse;">
            <tr style="border-bottom:1px solid #eee;">
              <td style="padding:8px; color:#666; width:30%;">${isZh?'订单号':'Order No.'}</td>
              <td style="padding:8px; font-family: var(--font-mono);">${order.no}</td>
            </tr>
            <tr style="border-bottom:1px solid #eee;">
              <td style="padding:8px; color:#666;">${isZh?'客户':'Customer'}</td>
              <td style="padding:8px;">${customer?.name || '-'}</td>
            </tr>
            <tr style="border-bottom:1px solid #eee;">
              <td style="padding:8px; color:#666;">${isZh?'金额':'Amount'}</td>
              <td style="padding:8px; font-family: var(--font-mono); font-weight:bold;">${Utils.formatMoney(order.totalAmount)}</td>
            </tr>
            <tr style="border-bottom:1px solid #eee;">
              <td style="padding:8px; color:#666;">${isZh?'日期':'Date'}</td>
              <td style="padding:8px; font-family: var(--font-mono);">${Utils.formatDate(event.timestamp)}</td>
            </tr>
            <tr style="border-bottom:1px solid #eee;">
              <td style="padding:8px; color:#666;">${isZh?'操作人':'Operator'}</td>
              <td style="padding:8px;">${event.operator?.name || '-'}</td>
            </tr>
          </table>
          <div style="margin-top:50px; display:flex; justify-content:space-between; font-size:12px; color:#666;">
            <div>
              <div style="margin-bottom:30px;">${isZh?'签发方':'Issued by'}:</div>
              <div style="border-top:1px solid #888; padding-top:5px; width:150px;">${isZh?'森达木业':'Sendar Wood'}</div>
            </div>
            <div>
              <div style="margin-bottom:30px;">${isZh?'签收方':'Received by'}:</div>
              <div style="border-top:1px solid #888; padding-top:5px; width:150px;">${customer?.name || ''}</div>
            </div>
          </div>
          <div style="margin-top:40px; text-align:center; color:#bbb; font-size:11px;">
            — ${isZh?'第 1 页 / 共 1 页':'Page 1 / 1'} —
          </div>
        </div>
      `;
    } else if (att.type === 'image' && att.previewUrl) {
      bodyHtml = `
        <div class="preview-img-wrap">
          <img src="${att.previewUrl}" alt="${att.name}">
          <div style="margin-top:12px; font-size:11px; color:var(--text-3);">${att.name} · ${formatSize(att.size)}</div>
        </div>
      `;
    } else {
      bodyHtml = `
        <div class="coming-soon">
          <div class="coming-soon-icon">${att.icon || '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M11 4.5 L5.5 10 a2.5 2.5 0 0 0 3.5 3.5 L14 8 a4 4 0 0 0 -5.5 -5.5 L3 8 a5 5 0 0 0 7 7 L14.5 10.5"/></svg>'}</div>
          <div class="coming-soon-title">${att.name}</div>
          <div class="coming-soon-desc">${formatSize(att.size)} · ${isZh?'预览不可用':'Preview unavailable'}</div>
        </div>
      `;
    }

    Modal.open({
      title: att.name,
      width: 700,
      content: bodyHtml,
      buttons: [
        { label: t('orderCenter.tlPreviewClose') }
      ]
    });
  }

  // ========== Tab: 发货 ==========
  function renderDeliveriesTab() {
    const isZh = I18n.get() === 'zh-CN';
    const deliveries = DeliveryRepo.list({ salesOrderId: order.id })
      .sort((a, b) => new Date(b.deliveryDate) - new Date(a.deliveryDate));

    if (deliveries.length === 0) {
      document.getElementById('tab-content').innerHTML = `
        <div class="coming-soon">
          <div class="coming-soon-icon"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><rect x="1" y="4" width="9" height="7" rx="0.5"/><path d="M10 6 H13 L15 8.5 V11 H10 Z"/><circle cx="4" cy="12.5" r="1.5"/><circle cx="12" cy="12.5" r="1.5"/></svg></div>
          <div class="coming-soon-title">${isZh ? '该订单尚无发货记录' : 'No deliveries yet'}</div>
        </div>`;
      return;
    }

    const totalAmount = deliveries.reduce((s, d) => s + (d.totalAmount || 0), 0);
    const signedCount = deliveries.filter(d => d.transportStatus === 'signed').length;

    const html = `
      <div class="tab-pane active">
        <div class="ov-grid" style="grid-template-columns: repeat(3, 1fr);">
          <div class="ov-card">
            <div class="label">${isZh ? '发货车次' : 'Total Trucks'}</div>
            <div class="value">${deliveries.length}</div>
            <div class="sub">${isZh ? '已签收' : 'Signed'} ${signedCount}</div>
          </div>
          <div class="ov-card shipped">
            <div class="label">${isZh ? '发货总额' : 'Total Amount'}</div>
            <div class="value">${Utils.formatMoney(totalAmount)}</div>
          </div>
          <div class="ov-card">
            <div class="label">${isZh ? '最近发货' : 'Last Delivery'}</div>
            <div class="value" style="font-size:14px;">${Utils.formatDate(deliveries[0].deliveryDate)}</div>
          </div>
        </div>

        <div class="ov-section">
          <div class="ov-section-head"><span>${isZh ? '发货明细' : 'Delivery Records'}</span></div>
          <div style="overflow-x:auto;">
            <table style="width:100%; font-size:12px; border-collapse:collapse;">
              <thead>
                <tr style="background: var(--bg-3); color: var(--text-3); text-transform: uppercase; font-size: 11px;">
                  <th style="text-align:left; padding:8px 12px;">${isZh?'发货号':'Delivery No.'}</th>
                  <th style="text-align:left; padding:8px 12px;">${isZh?'车次':'#'}</th>
                  <th style="text-align:left; padding:8px 12px;">${isZh?'日期':'Date'}</th>
                  <th style="text-align:left; padding:8px 12px;">${isZh?'车牌 / 司机':'Truck / Driver'}</th>
                  <th style="text-align:right; padding:8px 12px;">${isZh?'金额':'Amount'}</th>
                  <th style="text-align:left; padding:8px 12px;">${isZh?'运输状态':'Transport'}</th>
                  <th style="text-align:left; padding:8px 12px;">${isZh?'结算状态':'Settlement'}</th>
                </tr>
              </thead>
              <tbody>
                ${deliveries.map(d => `
                  <tr style="border-bottom:1px solid var(--border-1); cursor:pointer;" data-go-delivery="${d.id}">
                    <td style="padding:10px 12px;" class="font-mono text-strong text-accent">${d.no}</td>
                    <td style="padding:10px 12px;" class="font-mono">#${d.customerTruckSequence || '-'}</td>
                    <td style="padding:10px 12px;" class="font-mono">${Utils.formatDate(d.deliveryDate)}</td>
                    <td style="padding:10px 12px;">
                      <div class="font-mono text-strong">${d.truckPlate || '-'}</div>
                      <div class="text-muted" style="font-size:11px;">${d.driver || '-'}</div>
                    </td>
                    <td style="padding:10px 12px; text-align:right;" class="font-mono text-strong">${Utils.formatMoney(d.totalAmount)}</td>
                    <td style="padding:10px 12px;">${renderTransportBadge(d.transportStatus)}</td>
                    <td style="padding:10px 12px;">${renderSettlementStatusBadge(d.settlementStatus)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    document.getElementById('tab-content').innerHTML = html;
    document.querySelectorAll('[data-go-delivery]').forEach(el => {
      el.addEventListener('click', () => Router.go('logistics-detail', { id: el.dataset.goDelivery }));
    });
  }

  function renderTransportBadge(status) {
    const map = {
      pending:    { color: '#94a3b8', bg: 'rgba(148,163,184,0.14)', labelZh: '待发', labelEn: 'Pending' },
      preparing:  { color: '#fb923c', bg: 'rgba(251,146,60,0.14)',  labelZh: '备货', labelEn: 'Preparing' },
      in_transit: { color: '#60a5fa', bg: 'rgba(96,165,250,0.14)',  labelZh: '运输', labelEn: 'Transit' },
      signed:     { color: 'var(--emerald)', bg: 'var(--emerald-bg)',   labelZh: '已签收', labelEn: 'Signed' },
      exception:  { color: '#f87171', bg: 'rgba(248,113,113,0.16)', labelZh: '异常', labelEn: 'Exception' },
    };
    const c = map[status] || { color: '#94a3b8', bg: 'rgba(148,163,184,0.14)', labelZh: status, labelEn: status };
    const label = I18n.get() === 'zh-CN' ? c.labelZh : c.labelEn;
    return `<span style="padding:2px 8px; background:${c.bg}; color:${c.color}; border-radius:3px; font-size:11px;">${label}</span>`;
  }

  function renderSettlementStatusBadge(status) {
    const map = {
      pending:        { color: '#94a3b8', bg: 'rgba(148,163,184,0.14)', labelZh: '待结算', labelEn: 'Pending' },
      grouped:        { color: '#facc15', bg: 'rgba(250,204,21,0.14)',  labelZh: '已分组', labelEn: 'Grouped' },
      manual_pending: { color: '#facc15', bg: 'rgba(250,204,21,0.14)',  labelZh: '待手动结算', labelEn: 'Manual' },
      settled:        { color: 'var(--emerald)', bg: 'var(--emerald-bg)',   labelZh: '已结算', labelEn: 'Settled' },
    };
    const c = map[status] || { color: '#94a3b8', bg: 'rgba(148,163,184,0.14)', labelZh: status, labelEn: status };
    const label = I18n.get() === 'zh-CN' ? c.labelZh : c.labelEn;
    return `<span style="padding:2px 8px; background:${c.bg}; color:${c.color}; border-radius:3px; font-size:11px;">${label}</span>`;
  }

  // ========== Tab: 结算 ==========
  function renderSettlementsTab() {
    const isZh = I18n.get() === 'zh-CN';
    const settlements = SettlementRepo.list().filter(s =>
      (s.salesOrderIds || []).includes(order.id)
    ).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (settlements.length === 0) {
      document.getElementById('tab-content').innerHTML = `
        <div class="coming-soon">
          <div class="coming-soon-icon">💼</div>
          <div class="coming-soon-title">${isZh ? '该订单尚无结算记录' : 'No settlements yet'}</div>
        </div>`;
      return;
    }

    const totalPayable = settlements.reduce((s, x) => s + (x.payableAmount || 0), 0);
    const totalPaid = settlements.reduce((s, x) => s + (x.paidAmount || 0), 0);

    let html = `
      <div class="tab-pane active">
        <div class="ov-grid" style="grid-template-columns: repeat(3, 1fr);">
          <div class="ov-card">
            <div class="label">${isZh ? '结算单数' : 'Settlements'}</div>
            <div class="value">${settlements.length}</div>
          </div>
          <div class="ov-card settled">
            <div class="label">${isZh ? '应收总额' : 'Total Payable'}</div>
            <div class="value">${Utils.formatMoney(totalPayable)}</div>
          </div>
          <div class="ov-card paid">
            <div class="label">${isZh ? '已收' : 'Collected'}</div>
            <div class="value">${Utils.formatMoney(totalPaid)}</div>
            <div class="sub">${totalPayable > 0 ? Math.round(totalPaid / totalPayable * 100) : 0}%</div>
          </div>
        </div>
    `;

    settlements.forEach(s => {
      const triggerBadge = renderTriggerBadge(s.triggerType);
      const statusBadge = renderSettlementBadge(s.status);
      const paidPct = s.payableAmount > 0 ? Math.round((s.paidAmount || 0) / s.payableAmount * 100) : 0;
      html += `
        <div class="ov-section">
          <div class="ov-section-head">
            <div style="display:flex; align-items:center; gap:10px;">
              <a class="font-mono text-strong text-accent" href="${Router.href('settlement-detail', { id: s.id })}" style="text-decoration:none;">${s.no}</a>
              ${triggerBadge}
              ${statusBadge}
            </div>
            <div class="text-muted" style="font-size:11px;">${Utils.formatDate(s.settlementDate)}</div>
          </div>
          <div class="ov-section-body">
            ${s.triggerReason ? `
              <div style="padding:6px 10px; background:var(--bg-3); border-radius:4px; margin-bottom:12px; font-size:11px;">
                <span class="text-muted">${isZh ? '触发原因' : 'Trigger'}:</span>
                <span class="text-strong">${s.triggerReason}</span>
              </div>` : ''}
            <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:14px;">
              <div>
                <div class="text-muted" style="font-size:11px;">${isZh ? '应收' : 'Payable'}</div>
                <div class="font-mono text-strong">${Utils.formatMoney(s.payableAmount)}</div>
              </div>
              <div>
                <div class="text-muted" style="font-size:11px;">${isZh ? '已收' : 'Paid'}</div>
                <div class="font-mono text-emerald">${Utils.formatMoney(s.paidAmount)}</div>
              </div>
              <div>
                <div class="text-muted" style="font-size:11px;">${isZh ? '未收' : 'Unpaid'}</div>
                <div class="font-mono ${(s.unpaidAmount || 0) > 0 ? 'text-red' : 'text-muted'}">${Utils.formatMoney(s.unpaidAmount)}</div>
              </div>
              <div>
                <div class="text-muted" style="font-size:11px;">${isZh ? '到期日' : 'Due'}</div>
                <div class="font-mono">${Utils.formatDate(s.dueDate)}</div>
              </div>
            </div>
            <div style="margin-top:10px;">
              <div style="height:6px; background:var(--bg-3); border-radius:3px; overflow:hidden;">
                <div style="height:100%; width:${paidPct}%; background:${paidPct >= 100 ? 'var(--emerald)' : 'var(--accent)'};"></div>
              </div>
              <div class="text-muted" style="font-size:11px; margin-top:4px;">${paidPct}% ${isZh ? '已收' : 'collected'}</div>
            </div>
          </div>
        </div>
      `;
    });
    html += `</div>`;
    document.getElementById('tab-content').innerHTML = html;
  }

  function renderTriggerBadge(trigger) {
    const isZh = I18n.get() === 'zh-CN';
    if (!trigger || trigger === 'manual') return '';
    const map = {
      auto:   { color: 'var(--blue)', bg: 'var(--blue-bg)',  labelZh: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><rect x="2.5" y="5" width="11" height="9" rx="1.5"/><circle cx="6" cy="9" r="0.5" fill="currentColor"/><circle cx="10" cy="9" r="0.5" fill="currentColor"/></svg> 自动', labelEn: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><rect x="2.5" y="5" width="11" height="9" rx="1.5"/><circle cx="6" cy="9" r="0.5" fill="currentColor"/><circle cx="10" cy="9" r="0.5" fill="currentColor"/></svg> Auto' },
      forced: { color: '#fb923c', bg: 'rgba(251,146,60,0.14)',  labelZh: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M5 8 V3.5 a1.25 1.25 0 0 1 2.5 0 V8 M7.5 7 V2.5 a1.25 1.25 0 0 1 2.5 0 V8 M10 7 V3.5 a1.25 1.25 0 0 1 2.5 0 V11 a4 4 0 0 1 -7 2"/></svg> 强制', labelEn: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M5 8 V3.5 a1.25 1.25 0 0 1 2.5 0 V8 M7.5 7 V2.5 a1.25 1.25 0 0 1 2.5 0 V8 M10 7 V3.5 a1.25 1.25 0 0 1 2.5 0 V11 a4 4 0 0 1 -7 2"/></svg> Forced' },
    };
    const c = map[trigger]; if (!c) return '';
    return `<span style="padding:2px 7px; background:${c.bg}; color:${c.color}; border-radius:3px; font-size:10px;">${isZh?c.labelZh:c.labelEn}</span>`;
  }

  function renderSettlementBadge(status) {
    const map = {
      pending_confirm: { color: '#facc15', bg: 'rgba(250,204,21,0.14)',  labelZh: '待确认', labelEn: 'Pending' },
      confirmed:       { color: 'var(--blue)', bg: 'var(--blue-bg)',  labelZh: '待收款', labelEn: 'To Collect' },
      partial_paid:    { color: '#facc15', bg: 'rgba(250,204,21,0.14)',  labelZh: '部分收款', labelEn: 'Partial' },
      paid:            { color: 'var(--emerald)', bg: 'var(--emerald-bg)',   labelZh: '已收齐', labelEn: 'Paid' },
      overdue:         { color: '#f87171', bg: 'rgba(248,113,113,0.16)', labelZh: '已逾期', labelEn: 'Overdue' },
      cancelled:       { color: '#94a3b8', bg: 'rgba(148,163,184,0.14)', labelZh: '已取消', labelEn: 'Cancelled' },
    };
    const c = map[status] || { color: '#94a3b8', bg: 'rgba(148,163,184,0.14)', labelZh: status, labelEn: status };
    const label = I18n.get() === 'zh-CN' ? c.labelZh : c.labelEn;
    return `<span style="padding:2px 8px; background:${c.bg}; color:${c.color}; border-radius:3px; font-size:11px; font-weight:500;">${label}</span>`;
  }

  // ========== Tab: 收款 ==========
  function renderPaymentsTab() {
    const isZh = I18n.get() === 'zh-CN';
    const settlements = SettlementRepo.list().filter(s =>
      (s.salesOrderIds || []).includes(order.id)
    );
    const payments = [];
    settlements.forEach(s => {
      (s.payments || []).forEach(p => {
        payments.push({ ...p, settlementNo: s.no, settlementId: s.id });
      });
    });
    payments.sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate));

    if (payments.length === 0) {
      document.getElementById('tab-content').innerHTML = `
        <div class="coming-soon">
          <div class="coming-soon-icon"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><rect x="1.5" y="3" width="13" height="10" rx="1.5"/><circle cx="8" cy="8" r="2.25"/></svg></div>
          <div class="coming-soon-title">${isZh ? '该订单尚无收款记录' : 'No payments yet'}</div>
        </div>`;
      return;
    }

    const total = payments.reduce((s, p) => s + (p.amount || 0), 0);
    const orderTotal = order.totalAmount || 0;

    let html = `
      <div class="tab-pane active">
        <div class="ov-grid" style="grid-template-columns: repeat(3, 1fr);">
          <div class="ov-card paid">
            <div class="label">${isZh ? '已收总额' : 'Total Collected'}</div>
            <div class="value">${Utils.formatMoney(total)}</div>
            <div class="sub">${orderTotal > 0 ? Math.round(total / orderTotal * 100) : 0}% ${isZh?'订单':'of order'}</div>
          </div>
          <div class="ov-card">
            <div class="label">${isZh ? '收款笔数' : 'Payments'}</div>
            <div class="value">${payments.length}</div>
          </div>
          <div class="ov-card">
            <div class="label">${isZh ? '最近收款' : 'Latest'}</div>
            <div class="value" style="font-size:14px;">${Utils.formatDate(payments[0].paymentDate)}</div>
          </div>
        </div>

        <div class="ov-section">
          <div class="ov-section-head"><span>${isZh ? '收款流水' : 'Payment Records'}</span></div>
          <div style="overflow-x:auto;">
            <table style="width:100%; font-size:12px; border-collapse:collapse;">
              <thead>
                <tr style="background: var(--bg-3); color: var(--text-3); text-transform: uppercase; font-size: 11px;">
                  <th style="text-align:left; padding:8px 12px;">${isZh?'日期':'Date'}</th>
                  <th style="text-align:right; padding:8px 12px;">${isZh?'金额':'Amount'}</th>
                  <th style="text-align:left; padding:8px 12px;">${isZh?'方式':'Method'}</th>
                  <th style="text-align:left; padding:8px 12px;">${isZh?'流水号':'Reference'}</th>
                  <th style="text-align:left; padding:8px 12px;">${isZh?'结算单':'Settlement'}</th>
                  <th style="text-align:left; padding:8px 12px;">${isZh?'水单':'Receipt'}</th>
                </tr>
              </thead>
              <tbody>
                ${payments.map(p => `
                  <tr style="border-bottom:1px solid var(--border-1);">
                    <td style="padding:10px 12px;" class="font-mono">${Utils.formatDate(p.paymentDate)}</td>
                    <td style="padding:10px 12px; text-align:right;" class="font-mono text-emerald text-strong">${Utils.formatMoney(p.amount)}</td>
                    <td style="padding:10px 12px;">${methodLabel(p.method)}</td>
                    <td style="padding:10px 12px;" class="font-mono text-muted">${p.reference || '-'}</td>
                    <td style="padding:10px 12px;">
                      <a class="font-mono text-accent" href="${Router.href('settlement-detail', { id: p.settlementId })}" style="text-decoration:none;">${p.settlementNo}</a>
                    </td>
                    <td style="padding:10px 12px;">
                      <button class="tl-attachment" data-mock-receipt="${p.amount}" data-pay-date="${p.paymentDate}" style="cursor:pointer; border:1px solid var(--border-1);">
                        <span>🧾</span>
                        <span class="name">${isZh?'银行回单':'Receipt'}.jpg</span>
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    document.getElementById('tab-content').innerHTML = html;

    document.querySelectorAll('[data-mock-receipt]').forEach(btn => {
      btn.addEventListener('click', () => {
        Modal.open({
          title: isZh ? '银行回单(模拟)' : 'Bank Receipt (Mock)',
          width: 480,
          content: `
            <div style="background: white; padding: 40px; color: #1a1a1a; font-family: serif; border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
              <div style="text-align:center; border-bottom:1px solid #aaa; padding-bottom:12px; margin-bottom:16px;">
                <div style="font-size:14px; color:#666;">中国工商银行 ICBC</div>
                <div style="font-size:18px; font-weight:bold; margin-top:8px;">${isZh ? '电汇凭证' : 'WIRE TRANSFER RECEIPT'}</div>
              </div>
              <table style="width:100%; font-size:13px; line-height: 2;">
                <tr><td style="color:#666; width:30%;">${isZh?'日期':'Date'}</td><td style="font-family: var(--font-mono);">${btn.dataset.payDate}</td></tr>
                <tr><td style="color:#666;">${isZh?'金额':'Amount'}</td><td style="font-family: var(--font-mono); font-weight:bold; font-size:16px;">$${(parseInt(btn.dataset.mockReceipt) / 100).toLocaleString()}</td></tr>
                <tr><td style="color:#666;">${isZh?'付款方':'From'}</td><td>${customer?.name || ''}</td></tr>
                <tr><td style="color:#666;">${isZh?'收款方':'To'}</td><td>森达木业有限公司</td></tr>
                <tr><td style="color:#666;">${isZh?'用途':'Purpose'}</td><td>${order.no} ${isZh?'货款':'Settlement'}</td></tr>
              </table>
              <div style="margin-top:30px; text-align:right; color:#888; font-size:12px;">
                ${isZh?'银行盖章':'BANK STAMP'} ⊙
              </div>
            </div>
          `,
          buttons: [{ label: isZh?'关闭':'Close' }]
        });
      });
    });
  }

  function methodLabel(m) {
    const map = {
      bank_transfer: { zh: '银行转账', en: 'Bank Transfer' },
      cash: { zh: '现金', en: 'Cash' },
      check: { zh: '支票', en: 'Check' },
      other: { zh: '其他', en: 'Other' },
    };
    return I18n.get() === 'zh-CN' ? (map[m]?.zh || m) : (map[m]?.en || m);
  }

  // ========== Tab: 附件 ==========
  function renderAttachmentsTab() {
    const isZh = I18n.get() === 'zh-CN';
    const events = getTimeline();
    const allAtts = [];
    events.forEach(e => {
      (e.attachments || []).forEach(a => {
        allAtts.push({ ...a, eventId: e.id, eventType: e.type, eventTime: e.timestamp, eventTitle: e.title });
      });
    });

    if (allAtts.length === 0) {
      document.getElementById('tab-content').innerHTML = `
        <div class="coming-soon">
          <div class="coming-soon-icon"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M11 4.5 L5.5 10 a2.5 2.5 0 0 0 3.5 3.5 L14 8 a4 4 0 0 0 -5.5 -5.5 L3 8 a5 5 0 0 0 7 7 L14.5 10.5"/></svg></div>
          <div class="coming-soon-title">${isZh ? '该订单尚无附件' : 'No attachments'}</div>
        </div>`;
      return;
    }

    // 按类型分组
    const byType = {
      pdf:   allAtts.filter(a => a.type === 'pdf'),
      image: allAtts.filter(a => a.type === 'image'),
      other: allAtts.filter(a => !['pdf', 'image'].includes(a.type)),
    };

    let html = `
      <div class="tab-pane active">
        <div class="ov-grid" style="grid-template-columns: repeat(3, 1fr);">
          <div class="ov-card"><div class="label">${isZh?'PDF 文档':'PDFs'}</div><div class="value">${byType.pdf.length}</div></div>
          <div class="ov-card"><div class="label">${isZh?'图片':'Images'}</div><div class="value">${byType.image.length}</div></div>
          <div class="ov-card"><div class="label">${isZh?'总数':'Total'}</div><div class="value">${allAtts.length}</div></div>
        </div>

        ${byType.image.length > 0 ? `
        <div class="ov-section">
          <div class="ov-section-head"><span>${isZh ? '图片' : 'Images'}</span></div>
          <div class="ov-section-body">
            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(140px, 1fr)); gap:10px;">
              ${byType.image.map(a => `
                <div class="att-gallery-item" data-tl-att="${a.id}" style="width:auto;" title="${a.caption || a.name || ''}">
                  <img src="${a.previewUrl || a.url}" alt="" style="width:100%; height:110px; object-fit:cover; border-radius:4px; border:1px solid var(--border-1); cursor:pointer;">
                  <div class="text-muted" style="font-size:10px; margin-top:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${a.name || ''}</div>
                  <div class="text-muted" style="font-size:10px; opacity:0.7;">${Utils.formatDate(a.eventTime)}</div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>` : ''}

        ${byType.pdf.length + byType.other.length > 0 ? `
        <div class="ov-section">
          <div class="ov-section-head"><span>${isZh ? '文件' : 'Files'}</span></div>
          <div class="ov-section-body">
            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:10px;">
              ${[...byType.pdf, ...byType.other].map(a => `
                <div class="tl-attachment" data-event-id="${a.eventId}" data-attachment-id="${a.id}" style="padding:10px 12px; flex-direction:column; align-items:flex-start; gap:6px;">
                  <div style="display:flex; align-items:center; gap:8px; width:100%;">
                    <span style="font-size:20px;">${a.icon || '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M9 1.5 H4 a1.5 1.5 0 0 0 -1.5 1.5 V13 a1.5 1.5 0 0 0 1.5 1.5 H12 a1.5 1.5 0 0 0 1.5 -1.5 V5.5 Z"/><polyline points="9,1.5 9,5.5 13.5,5.5"/></svg>'}</span>
                    <div style="flex:1; min-width:0;">
                      <div class="name" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${a.name}</div>
                      <div class="size">${formatSize(a.size)}</div>
                    </div>
                  </div>
                  <div class="text-muted" style="font-size:10px; width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                    ${Utils.formatDate(a.eventTime)} · ${a.eventTitle}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>` : ''}
      </div>
    `;
    document.getElementById('tab-content').innerHTML = html;

    document.querySelectorAll('[data-attachment-id]').forEach(el => {
      el.addEventListener('click', () => {
        const eid = el.dataset.eventId, aid = el.dataset.attachmentId;
        const evt = events.find(e => e.id === eid);
        const att = evt?.attachments?.find(a => a.id === aid);
        if (att) openAttachmentPreview(att, evt);
      });
    });
    // 图片缩略图 → AttachmentViewer
    document.querySelectorAll('[data-tl-att]').forEach(el => {
      el.addEventListener('click', () => {
        const att = AttachmentService.findById(el.dataset.tlAtt);
        if (att) AttachmentViewer.open(att);
      });
    });
  }

  // ========== Tab: 修改记录(从 changeLog 反推)==========
  function renderAppendixTab() {
    const isZh = I18n.get() === 'zh-CN';
    // 从 changeLog 取该订单的所有变更
    const logs = (typeof AuditService !== 'undefined')
      ? AuditService.listForEntity('salesOrder', order.id)
      : ChangeLogRepo.list().filter(l =>
          (l.recordType === 'salesOrder' || l.entityType === 'salesOrder') &&
          (l.recordId === order.id || l.entityId === order.id)
        ).sort((a, b) => new Date(b.operatedAt || b.createdAt) - new Date(a.operatedAt || a.createdAt));

    if (logs.length === 0) {
      document.getElementById('tab-content').innerHTML = `
        <div class="coming-soon">
          <div class="coming-soon-icon">✎</div>
          <div class="coming-soon-title">${isZh ? '该订单尚无修改记录' : 'No changes yet'}</div>
        </div>`;
      return;
    }

    let html = `
      <div class="tab-pane active">
        <div class="ov-section">
          <div class="ov-section-head">
            <span>${isZh ? '订单变更历史' : 'Order Change History'} (${logs.length})</span>
            <span class="text-muted" style="font-size:11px;">${isZh?'操作可追溯':'Audit trail'}</span>
          </div>
          <div class="ov-section-body">
            ${logs.map(l => {
              const opName = l.operatorName || (EmployeeRepo.find(l.operatorId) || {}).name || l.operatorId || '-';
              const role = l.operatorRole || (typeof Roles !== 'undefined' ? Roles.inferFromEmployeeId(l.operatorId) : 'system');
              const action = l.action || l.changeCategory || 'update';
              return `
                <div style="padding:12px 14px; background:var(--bg-3); border-radius:6px; margin-bottom:10px; border-left:3px solid ${typeof Roles !== 'undefined' ? Roles.color(role) : '#94a3b8'};">
                  <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:6px;">
                    <div>
                      <span class="text-strong" style="font-size:13px;">${_actionLabel(action)}</span>
                      ${typeof Roles !== 'undefined' ? Roles.renderBadge(role) : ''}
                    </div>
                    <span class="text-muted font-mono" style="font-size:11px;">${Utils.formatDateTime(l.operatedAt || l.createdAt)}</span>
                  </div>
                  <div class="text-muted" style="font-size:11px; margin-bottom:6px;">
                    ${opName} ${l.operatorDepartment ? '· ' + l.operatorDepartment : ''}
                  </div>
                  ${(l.changes || []).length > 0 ? `
                    <div style="font-size:12px;">
                      ${l.changes.map(c => `
                        <div style="margin-bottom:3px;">
                          <span class="text-muted">${c.fieldLabel || c.field}:</span>
                          ${c.oldValue !== undefined && c.oldValue !== null ? `<span class="text-muted font-mono">${c.oldValue}</span>` : ''}
                          <span class="text-muted" style="margin:0 4px;">→</span>
                          <span class="text-accent font-mono">${c.newValue !== undefined ? c.newValue : '-'}</span>
                        </div>
                      `).join('')}
                    </div>
                  ` : ''}
                  ${l.reason ? `<div style="font-size:11px; color:var(--text-3); margin-top:6px; font-style:italic;">"${l.reason}"</div>` : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;
    document.getElementById('tab-content').innerHTML = html;
  }

  function _actionLabel(action) {
    const isZh = I18n.get() === 'zh-CN';
    const map = {
      create:        isZh?'创建':'Created',
      update:        isZh?'修改':'Updated',
      delete:        isZh?'删除':'Deleted',
      status_change: isZh?'状态变更':'Status Change',
      approve:       isZh?'批准':'Approved',
      approved:      isZh?'已批准':'Approved',
      reject:        isZh?'驳回':'Rejected',
      rejected:      isZh?'已驳回':'Rejected',
      approval_requested: isZh?'提交审批':'Approval Requested',
      lock:          isZh?'锁定':'Locked',
      unlock:        isZh?'解锁':'Unlocked',
    };
    return map[action] || action;
  }

  function renderAppendixStatusBadge(status) {
    const isZh = I18n.get() === 'zh-CN';
    const map = {
      draft:     { c:'#94a3b8', bg:'rgba(148,163,184,0.14)', zh:'草稿', en:'Draft' },
      confirmed: { c:'var(--emerald)', bg:'var(--emerald-bg)',   zh:'已确认', en:'Confirmed' },
      cancelled: { c:'#94a3b8', bg:'rgba(148,163,184,0.14)', zh:'已取消', en:'Cancelled' },
    };
    const cf = map[status] || { c:'#94a3b8', bg:'rgba(148,163,184,0.14)', zh:status, en:status };
    return `<span style="padding:2px 8px; background:${cf.bg}; color:${cf.c}; border-radius:3px; font-size:11px;">${isZh?cf.zh:cf.en}</span>`;
  }

  // ========== Tab: 风险 ==========
  function renderRiskTab() {
    const isZh = I18n.get() === 'zh-CN';
    const cust = customer;
    const deliveries = DeliveryRepo.list({ salesOrderId: order.id });
    const settlements = SettlementRepo.list().filter(s => (s.salesOrderIds||[]).includes(order.id));
    const forcedDeliveries = deliveries.filter(d => d.creditCheckResult?.forced);

    // 计算应收 / 逾期(用 dueDate 判定,跟客户中心一致)
    const allCustSettlements = SettlementRepo.list().filter(s => s.customerId === cust?.id && s.status !== 'paid');
    const now = Date.now();
    let receivables = 0, overdue = 0, overdueCount = 0;
    const overdueSettlements = [];
    allCustSettlements.forEach(s => {
      const unpaid = (s.unpaidAmount != null) ? s.unpaidAmount : (s.totalAmount || 0) - (s.paidAmount || 0);
      receivables += unpaid;
      const due = s.dueDate ? new Date(s.dueDate).getTime() : null;
      if (due && due < now) { overdue += unpaid; overdueCount++; overdueSettlements.push(s); }
    });
    // 当前占用 = 客户所有未完成订单总额
    const exposure = SalesOrderRepo.list({ customerId: cust?.id })
      .filter(o => !['completed','cancelled'].includes(o.status))
      .reduce((s, o) => s + (o.totalAmount || 0), 0);

    const creditLimit = cust?.settlementPolicy?.credit?.limit || cust?.creditLimit || 0;
    const used = exposure;
    const creditUsage = creditLimit > 0 ? Math.round(used / creditLimit * 100) : 0;
    const usageColor = creditUsage > 90 ? 'var(--red)' : creditUsage > 70 ? 'var(--amber)' : 'var(--emerald)';

    document.getElementById('tab-content').innerHTML = `
      <div class="tab-pane active">
        <div class="ov-grid" style="grid-template-columns: repeat(3, 1fr);">
          <div class="ov-card">
            <div class="label">${isZh?'信用使用率':'Credit Usage'}</div>
            <div class="value" style="color:${usageColor};">${creditUsage}%</div>
            <div class="sub">${Utils.formatMoney(used)} / ${Utils.formatMoney(creditLimit)}</div>
            <div class="progress"><div class="progress-fill" style="width:${Math.min(creditUsage,100)}%; background:${usageColor};"></div></div>
          </div>
          <div class="ov-card">
            <div class="label">${isZh?'强制发货':'Forced Deliveries'}</div>
            <div class="value">${forcedDeliveries.length}</div>
            <div class="sub">${forcedDeliveries.length > 0 ? (isZh?'<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M8 1.5 L14.5 13.5 H1.5 Z"/><line x1="8" y1="6.5" x2="8" y2="9.5"/><line x1="8" y1="11.5" x2="8" y2="11.6"/></svg> 需关注':'<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M8 1.5 L14.5 13.5 H1.5 Z"/><line x1="8" y1="6.5" x2="8" y2="9.5"/><line x1="8" y1="11.5" x2="8" y2="11.6"/></svg> Attention') : (isZh?'正常':'OK')}</div>
          </div>
          <div class="ov-card">
            <div class="label">${isZh?'逾期金额':'Overdue'}</div>
            <div class="value" style="color:${overdue > 0 ? 'var(--red)' : 'var(--text-1)'};">${Utils.formatMoney(overdue)}</div>
            <div class="sub">${overdueCount > 0 ? (isZh ? `${overdueCount} 张未收` : `${overdueCount} unpaid`) : (isZh?'无逾期':'No overdue')}</div>
          </div>
        </div>

        <div class="ov-section">
          <div class="ov-section-head"><span>${isZh?'客户信用状态':'Customer Credit Status'}</span></div>
          <div class="ov-section-body">
            <div style="display:grid; grid-template-columns: 200px 1fr; gap:14px; row-gap:10px; font-size:12px;">
              <div class="text-muted">${isZh?'信用额度':'Credit Limit'}</div>
              <div class="font-mono text-strong">${Utils.formatMoney(creditLimit)}</div>
              <div class="text-muted">${isZh?'当前占用':'Exposure'}</div>
              <div class="font-mono ${used>0?'text-strong':''}">${Utils.formatMoney(used)}</div>
              <div class="text-muted">${isZh?'应收款项':'Receivables'}</div>
              <div class="font-mono">${Utils.formatMoney(receivables)}</div>
              <div class="text-muted">${isZh?'逾期金额':'Overdue'}</div>
              <div class="font-mono ${overdue>0?'text-red':''}">${Utils.formatMoney(overdue)}</div>
              <div class="text-muted">${isZh?'发货锁定':'Shipment Lock'}</div>
              <div>${cust?.shipmentLocked ? `<span class="text-red">${isZh?'已锁定':'Locked'}</span>` : `<span class="text-emerald">${isZh?'未锁定':'Unlocked'}</span>`}</div>
            </div>
          </div>
        </div>

        ${forcedDeliveries.length > 0 ? `
          <div class="ov-section">
            <div class="ov-section-head"><span>${isZh?'强制发货记录':'Forced Deliveries'}</span></div>
            <div class="ov-section-body">
              ${forcedDeliveries.map(d => `
                <div style="padding:10px 12px; background:var(--bg-3); border-radius:4px; margin-bottom:8px; font-size:12px;">
                  <a class="font-mono text-strong text-accent" href="${Router.href('logistics-detail',{id:d.id})}" style="text-decoration:none;">${d.no}</a>
                  <span class="text-muted" style="margin-left:8px;">${Utils.formatDate(d.deliveryDate)}</span>
                  <div class="text-muted" style="font-size:11px; margin-top:4px;">${isZh?'<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M8 1.5 L14.5 13.5 H1.5 Z"/><line x1="8" y1="6.5" x2="8" y2="9.5"/><line x1="8" y1="11.5" x2="8" y2="11.6"/></svg> 此次发货为信用超额强制放行':'<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M8 1.5 L14.5 13.5 H1.5 Z"/><line x1="8" y1="6.5" x2="8" y2="9.5"/><line x1="8" y1="11.5" x2="8" y2="11.6"/></svg> Forced despite credit exceeded'}</div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        ${overdueSettlements.length > 0 ? `
          <div class="ov-section">
            <div class="ov-section-head"><span>${isZh?'逾期结算':'Overdue Settlements'}</span></div>
            <div class="ov-section-body">
              ${overdueSettlements.map(s => {
                const days = Math.floor((Date.now() - new Date(s.dueDate).getTime()) / 86400000);
                return `
                  <div style="padding:10px 12px; background:rgba(248,113,113,0.06); border-left:3px solid var(--red); border-radius:4px; margin-bottom:8px; font-size:12px;">
                    <a class="font-mono text-strong text-accent" href="${Router.href('settlement-detail',{id:s.id})}" style="text-decoration:none;">${s.no}</a>
                    <span class="text-red" style="margin-left:8px;">${isZh?`逾期 ${days} 天`:`${days} days overdue`}</span>
                    <span class="text-muted" style="margin-left:8px;">${isZh?'未收':'Unpaid'} ${Utils.formatMoney(s.unpaidAmount)}</span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        ` : ''}

        ${(order.stockShortage && order.stockShortage.length > 0) ? `
          <div class="ov-section">
            <div class="ov-section-head"><span>${isZh?'<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M2 5 L8 2 L14 5 L8 8 Z"/><path d="M2 5 V11 L8 14 V8"/><path d="M14 5 V11 L8 14"/></svg> 库存短缺':'<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M2 5 L8 2 L14 5 L8 8 Z"/><path d="M2 5 V11 L8 14 V8"/><path d="M14 5 V11 L8 14"/></svg> Stock Shortage'}</span></div>
            <div class="ov-section-body">
              <div class="text-muted" style="font-size:11px; margin-bottom:10px;">
                ${isZh?'订单确认时,以下物料库存不足,已部分锁定':'These materials had insufficient stock at order confirmation'}
              </div>
              ${order.stockShortage.map(s => `
                <div style="padding:10px 12px; background:rgba(251,146,60,0.06); border-left:3px solid var(--amber); border-radius:4px; margin-bottom:8px; font-size:12px;">
                  <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span class="text-strong">${s.materialName}</span>
                    <span class="text-amber font-mono">${isZh?'缺':'Short'} ${s.short} / ${isZh?'需':'need'} ${s.needed}</span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }
  function renderLogsTab() {
    const isZh = I18n.get() === 'zh-CN';
    const logs = ChangeLogRepo.list().filter(l =>
      l.recordType === 'salesOrder' && l.recordId === order.id
    ).sort((a, b) => new Date(b.operatedAt || b.createdAt) - new Date(a.operatedAt || a.createdAt));

    let html = `
      <div class="tab-pane active">
        <div class="ov-section">
          <div class="ov-section-head">
            <span>${isZh?'状态变更日志':'Status Change Logs'} (${logs.length})</span>
            <span class="text-muted" style="font-size:11px;">${isZh?'供运维 / 审计':'Audit / DevOps'}</span>
          </div>
          ${logs.length === 0 ? `
            <div class="empty-state" style="padding: 30px;">
              <div style="font-size:24px; opacity:0.3; margin-bottom:8px;">☰</div>
              <div class="text-muted" style="font-size:12px;">${isZh?'暂无变更日志':'No change logs'}</div>
            </div>
          ` : `
          <div style="overflow-x:auto;">
            <table style="width:100%; font-size:12px; border-collapse:collapse;">
              <thead>
                <tr style="background: var(--bg-3); color: var(--text-3); text-transform: uppercase; font-size: 11px;">
                  <th style="text-align:left; padding:8px 12px;">${isZh?'时间':'Time'}</th>
                  <th style="text-align:left; padding:8px 12px;">${isZh?'类别':'Category'}</th>
                  <th style="text-align:left; padding:8px 12px;">${isZh?'变更':'Changes'}</th>
                  <th style="text-align:left; padding:8px 12px;">${isZh?'操作人':'Operator'}</th>
                  <th style="text-align:left; padding:8px 12px;">${isZh?'原因':'Reason'}</th>
                </tr>
              </thead>
              <tbody>
                ${logs.map(l => {
                  const emp = EmployeeRepo.find(l.operatorId);
                  const role = emp?.role || (Roles ? Roles.inferFromEmployeeId(l.operatorId) : 'system');
                  return `
                    <tr style="border-bottom:1px solid var(--border-1);">
                      <td style="padding:10px 12px;" class="font-mono text-muted">${Utils.formatDateTime(l.operatedAt || l.createdAt)}</td>
                      <td style="padding:10px 12px;">
                        <span style="padding:2px 7px; background:var(--bg-3); border-radius:3px; font-size:11px;">${l.changeCategory || '-'}</span>
                      </td>
                      <td style="padding:10px 12px;">
                        ${(l.changes || []).map(c => `
                          <div style="margin-bottom:3px;">
                            <span class="text-muted">${c.fieldLabel || c.field}:</span>
                            ${c.oldValue ? `<span class="text-muted font-mono">${c.oldValue}</span>` : ''}
                            <span class="text-muted" style="margin:0 4px;">→</span>
                            <span class="text-strong text-accent font-mono">${c.newValue || '-'}</span>
                          </div>
                        `).join('')}
                      </td>
                      <td style="padding:10px 12px;">
                        ${l.operatorName || emp?.name || l.operatorId || '-'}
                        ${typeof Roles !== 'undefined' ? Roles.renderBadge(role) : ''}
                      </td>
                      <td style="padding:10px 12px; color:var(--text-3); font-size:11px;">${l.reason || '-'}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
          `}
        </div>

        <div class="ov-section">
          <div class="ov-section-head">
            <span>${isZh?'Workflow 状态(预埋)':'Workflow State (Reserved)'}</span>
            <span class="text-muted" style="font-size:11px;">${isZh?'未来 Workflow Engine 会消费这些字段':'Reserved for future Workflow Engine'}</span>
          </div>
          <div class="ov-section-body">
            <div style="display:grid; grid-template-columns: 200px 1fr; gap:14px; row-gap:10px; font-size:12px;">
              <div class="text-muted">currentStep</div>
              <div class="font-mono text-strong text-accent">${order.currentStep || '-'}</div>
              <div class="text-muted">requiredRole</div>
              <div>${order.requiredRole ? Roles.renderBadge(order.requiredRole) : '<span class="text-muted">-</span>'}</div>
              <div class="text-muted">blockedReason</div>
              <div class="font-mono">${order.blockedReason || '<span class="text-muted">-</span>'}</div>
              <div class="text-muted">workflowKey</div>
              <div class="font-mono">${order.workflowKey || '-'}</div>
              <div class="text-muted">status (legacy)</div>
              <div class="font-mono">${order.status}</div>
            </div>
          </div>
        </div>
      </div>
    `;
    document.getElementById('tab-content').innerHTML = html;
  }

  // ========== 占位 Tab ==========
  function renderComingSoon() {
    const tab = [...MAIN_TABS, ...MORE_TABS].find(t => t.key === activeTab);
    document.getElementById('tab-content').innerHTML = `
      <div class="tab-pane active">
        <div class="coming-soon">
          <div class="coming-soon-icon">${tab?.icon || '○'}</div>
          <div class="coming-soon-title">${tab ? t(tab.labelKey) : ''} · ${t('orderCenter.comingSoon')}</div>
          <div class="coming-soon-desc">${t('orderCenter.comingSoonDesc')}</div>
        </div>
      </div>
    `;
  }

  // ========== 顶部操作按钮 ==========
  function renderActionButtons() {
    const isZh = I18n.get() === 'zh-CN';
    const counts = computeTabCounts();
    const ALL_TABS = [...MAIN_TABS, ...MORE_TABS];

    // Timeline 独立按钮(不在更多操作里)
    const tlCount = counts['timeline'] || 0;
    const isTimelineActive = activeTab === 'timeline';
    const timelineBtn = `
      <button class="btn btn-secondary btn-sm ${isTimelineActive?'btn-active':''}" id="timeline-btn" data-jump-tab="timeline" title="${isZh?'订单时间线':'Order Timeline'}">
        ${Icon.clock ? Icon.clock(13) : ''}
        <span style="margin-left:4px;">Timeline</span>
        ${tlCount > 0 ? `<span class="btn-count-badge">${tlCount}</span>` : ''}
      </button>
    `;

    // "更多操作" 菜单(排除 timeline 和 overview)
    const items = ALL_TABS.filter(tab => tab.key !== 'overview' && tab.key !== 'timeline').map(tab => {
      const count = counts[tab.key];
      const countBadge = count > 0 ? `<span class="more-menu-badge">${count}</span>` : '';
      return `
        <a class="more-menu-item ${activeTab === tab.key ? 'active' : ''}" data-jump-tab="${tab.key}">
          <span class="more-menu-icon">${Icon[tab.iconName] ? Icon[tab.iconName](13) : ''}</span>
          <span>${t(tab.labelKey)}</span>
          ${countBadge}
        </a>
      `;
    }).join('');

    // 返回概览按钮:只在非 overview 时显示
    const backToOverview = activeTab !== 'overview'
      ? `<button class="btn btn-secondary btn-sm" id="back-to-overview-btn" title="${isZh?'返回订单概览':'Back to Overview'}">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><polyline points="10,3 5,8 10,13"/></svg>
          <span style="margin-left:4px;">${isZh?'返回概览':'Back'}</span>
        </button>`
      : '';

    document.getElementById('action-buttons').innerHTML = `
      <div style="display:flex; gap:8px; align-items:center;">
        ${backToOverview}
        ${timelineBtn}
        <div class="more-actions-wrap">
          <button class="btn btn-secondary btn-sm" id="more-actions-btn">
            <span>${isZh?'更多操作':'More Actions'}</span>
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" style="margin-left:4px; vertical-align:-1px;"><polyline points="4,6 8,10 12,6"/></svg>
          </button>
          <div class="more-actions-menu" id="more-actions-menu">
            <div class="more-menu-section-title">${isZh?'查看详细':'View Details'}</div>
            ${items}
          </div>
        </div>
      </div>
    `;

    // 切换显示
    const btn = document.getElementById('more-actions-btn');
    const menu = document.getElementById('more-actions-menu');
    const toggleMenu = (e) => {
      if (e) e.stopPropagation();
      menu.classList.toggle('open');
    };
    btn.addEventListener('click', toggleMenu);
    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target) && e.target !== btn) {
        menu.classList.remove('open');
      }
    });

    // 返回按钮
    const backBtn = document.getElementById('back-to-overview-btn');
    if (backBtn) {
      backBtn.addEventListener('click', () => switchTab('overview'));
    }

    // 跳 Tab(包括独立 timeline 按钮)
    document.querySelectorAll('[data-jump-tab]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        menu.classList.remove('open');
        switchTab(el.dataset.jumpTab);
      });
    });
  }

  /** 简化车辆 Modal(在 orderDetail 内直接用,避免依赖 LogisticsModule) */
  function _quickVehicleModal(vehicleId, onDone) {
    const isZh = I18n.get() === 'zh-CN';
    const v = vehicleId ? VehicleRepo.find(vehicleId) : null;
    const fleets = (typeof FleetRepo !== 'undefined') ? FleetRepo.list({ status: 'active' }) : [];
    Modal.open({
      title: vehicleId ? (isZh?'编辑车辆':'Edit Vehicle') : (isZh?'新增车辆':'New Vehicle'),
      width: 480,
      content: `
        <div style="display:grid; gap:12px;">
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div>
              <label class="form-label">${isZh?'车牌号':'Plate No.'} <span style="color:var(--red);">*</span></label>
              <input id="qv-plate" class="input w-full" value="${v?.plateNo||''}" placeholder="${isZh?'如 粤B-12345':'ABC-123'}">
            </div>
            <div>
              <label class="form-label">${isZh?'车型':'Type'}</label>
              <select id="qv-type" class="select w-full">
                <option value="medium" ${(v?.truckType||'medium')==='medium'?'selected':''}>${isZh?'中型 (5-8t)':'Medium (5-8t)'}</option>
                <option value="small" ${v?.truckType==='small'?'selected':''}>${isZh?'小型 (2-3t)':'Small (2-3t)'}</option>
                <option value="large" ${v?.truckType==='large'?'selected':''}>${isZh?'大型 (10t+)':'Large (10t+)'}</option>
                <option value="container" ${v?.truckType==='container'?'selected':''}>${isZh?'集装箱':'Container'}</option>
              </select>
            </div>
          </div>
          <div>
            <label class="form-label">${isZh?'所属车队':'Fleet'}</label>
            <div style="display:flex; gap:6px;">
              <select id="qv-fleet" class="select" style="flex:1;">
                <option value="">${isZh?'-- 未指定 --':'-- None --'}</option>
                ${fleets.map(f => `<option value="${f.id}" ${v?.fleetId===f.id?'selected':''}>${f.name}</option>`).join('')}
              </select>
            </div>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div>
              <label class="form-label">${isZh?'司机姓名':'Driver'}</label>
              <input id="qv-driver" class="input w-full" value="${v?.driverName||''}">
            </div>
            <div>
              <label class="form-label">${isZh?'司机电话':'Phone'}</label>
              <input id="qv-phone" class="input w-full" value="${v?.driverPhone||''}">
            </div>
          </div>
        </div>
      `,
      buttons: [
        { label: isZh?'取消':'Cancel' },
        { label: vehicleId?(isZh?'保存':'Save'):(isZh?'创建':'Create'), primary: true, onClick: () => {
          const plateNo = document.getElementById('qv-plate').value.trim();
          if (!plateNo) { Toast.warning(isZh?'请输入车牌号':'Plate required'); return false; }
          const data = {
            plateNo,
            truckType: document.getElementById('qv-type').value,
            fleetId: document.getElementById('qv-fleet').value || null,
            driverName: document.getElementById('qv-driver').value.trim(),
            driverPhone: document.getElementById('qv-phone').value.trim(),
          };
          try {
            let result;
            if (vehicleId) result = VehicleService.update(vehicleId, data, Session.current()?.id);
            else result = VehicleService.create(data, Session.current()?.id);
            Toast.success(isZh?'已保存':'Saved');
            if (onDone) onDone(result);
          } catch (e) { Toast.error(e.message); return false; }
        }},
      ],
    });
  }

  return { init };
})();

window.OrderDetailV2Module = OrderDetailV2Module;
