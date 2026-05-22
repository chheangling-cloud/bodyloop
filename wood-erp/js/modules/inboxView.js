/**
 * InboxView - 三角色工作台(财务/仓管/销售)
 * @module modules/inboxView
 *
 * 三视图分流:
 *   #/inbox/finance    财务工作台
 *   #/inbox/warehouse  仓管工作台
 *   #/inbox/sales      销售工作台(我的草稿/被驳回)
 *
 * 设计:
 *   顶部 KPI 横条(待办分组计数)
 *   主区域:按 task type 分组列表
 *   点 task → 跳订单详情(顶部高亮该 task)
 */

const InboxViewModule = (function () {
  'use strict';

  let role = 'finance';

  // ====== 角色 → 任务分组配置 ======
  const ROLE_CONFIG = {
    finance: {
      groups: [
        { type: 'finance_approve',   label: '订单审批',   labelEn: 'Order Approval',     icon: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><circle cx="8" cy="8" r="6.5"/><path d="M5 8 L7 10 L11 6"/></svg>', color: '#f59e0b' },
        { type: 'price_approve',     label: '价格审批 (历史)', labelEn: 'Price Approval (legacy)', icon: '', color: '#ef4444' },
        { type: 'credit_approve',    label: '信用审批',   labelEn: 'Credit Approval',    icon: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M8 1.5 L14.5 13.5 H1.5 Z"/><line x1="8" y1="6.5" x2="8" y2="9.5"/><line x1="8" y1="11.5" x2="8" y2="11.6"/></svg>',  color: '#f59e0b' },
        { type: 'settlement_create', label: '待创建结算', labelEn: 'Pending Settlement', icon: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><rect x="3.5" y="3" width="9" height="11" rx="1.5"/><rect x="6" y="1.5" width="4" height="3" rx="0.5"/></svg>', color: '#a78bfa' },
        { type: 'payment_register',  label: '待登记收款', labelEn: 'Pending Payment',    icon: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><rect x="1.5" y="3" width="13" height="10" rx="1.5"/><circle cx="8" cy="8" r="2.25"/></svg>', color: '#10b981' },
      ],
      titleZh: '财务工作台',
      titleEn: 'Finance Inbox',
      subtitleZh: '订单审批 · 信用审批 · 结算与收款',
      subtitleEn: 'Order · Credit · Settlement · Payment',
    },
    warehouse: {
      groups: [
        // ✅ 修复:加入新版 task 类型(warehouse_pick / warehouse_dispatch / delivery_sign)
        //    同时保留旧版(warehouse_prepare / warehouse_ship)兼容历史数据
        { type: 'warehouse_pick',    label: '待拣货',     labelEn: 'To Pick',     icon: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M2 5 L8 2 L14 5 L8 8 Z"/><path d="M2 5 V11 L8 14 V8"/><path d="M14 5 V11 L8 14"/></svg>', color: '#f59e0b' },
        { type: 'warehouse_dispatch',label: '待派车',     labelEn: 'To Dispatch', icon: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><rect x="1" y="4" width="9" height="7" rx="0.5"/><path d="M10 6 H13 L15 8.5 V11 H10 Z"/><circle cx="4" cy="12.5" r="1.5"/><circle cx="12" cy="12.5" r="1.5"/></svg>', color: '#3b82f6' },
        { type: 'delivery_sign',     label: '待签收',     labelEn: 'To Sign',     icon: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M11 2 L14 5 L5 14 L1.5 14.5 L2 11 Z"/></svg>', color: '#10b981' },
        // 兼容旧版
        { type: 'warehouse_prepare', label: '待备货(旧)', labelEn: 'To Prepare',  icon: '', color: '#64748b', hidden: true },
        { type: 'warehouse_ship',    label: '待发车(旧)', labelEn: 'To Ship',     icon: '', color: '#64748b', hidden: true },
      ],
      titleZh: '仓管工作台',
      titleEn: 'Warehouse Inbox',
      subtitleZh: '拣货 · 派车装车 · 签收确认',
      subtitleEn: 'Pick · Dispatch · Sign',
    },
    sales: {
      groups: [
        { type: 'order_revise', label: '被驳回(请修改)', labelEn: 'Rejected (Revise)', icon: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><polyline points="13,3 13,7 9,7"/><path d="M13 7 A6 6 0 1 0 11.5 12"/></svg>', color: '#ef4444' },
        { type: '_drafts',      label: '我的草稿',         labelEn: 'My Drafts',         icon: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M11 2 L14 5 L5 14 L1.5 14.5 L2 11 Z"/></svg>', color: '#94a3b8', isVirtual: true },
        { type: '_pending',     label: '我已提交(进行中)', labelEn: 'In Progress',       icon: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><circle cx="8" cy="8" r="6.5"/><polyline points="8,4 8,8 11,9.5"/></svg>', color: '#3b82f6', isVirtual: true },
      ],
      titleZh: '销售工作台',
      titleEn: 'Sales Inbox',
      subtitleZh: '草稿 · 被驳回 · 进行中订单',
      subtitleEn: 'Drafts · Rejected · In Progress',
    },
  };

  // 哪些 role 算"管理层"(可查看所有角色工作台)
  const MANAGER_ROLES = new Set(['manager', 'general_manager', 'ceo', 'super_admin', 'sales_manager', 'finance_manager', 'warehouse_manager']);

  function init(ctx) {
    role = ctx.params.role || 'finance';
    const cfg = ROLE_CONFIG[role];
    if (!cfg) {
      document.getElementById('app-content').innerHTML = `<div class="empty-state">Invalid role: ${role}</div>`;
      return;
    }
    render();
    // 监听 task 变化重新渲染
    EventBus.on('orderTask.created', refresh);
    EventBus.on('orderTask.completed', refresh);
    EventBus.on('orderTask.rejected', refresh);
    EventBus.on('salesOrder.submitted', refresh);
  }

  function refresh() {
    if (document.getElementById('inbox-root')) render();
  }

  function render() {
    const isZh = I18n.get() === 'zh-CN';
    const cfg = ROLE_CONFIG[role];
    const cur = Session.current();

    document.getElementById('app-content').innerHTML = `
      <div id="inbox-root">
        <div class="page-header">
          <div>
            <h1 class="page-title">${isZh?cfg.titleZh:cfg.titleEn}</h1>
            <div class="page-subtitle">${isZh?cfg.subtitleZh:cfg.subtitleEn}</div>
          </div>
          <div class="flex gap-2">
            ${role === 'sales' ? `<button class="btn btn-primary" data-action="new-order">+ ${isZh?'新建订单':'New Order'}</button>` : ''}
          </div>
        </div>
        
        <!-- 角色切换器:只显示当前用户有权访问的角色 -->
        ${(() => {
          const isZh2 = I18n.get() === 'zh-CN';
          const isManager = MANAGER_ROLES.has(cur.role);
          // 经理层看全部 / 其他角色只看自己对应的
          const roleToInbox = {
            sales: 'sales', sales_manager: 'sales',
            warehouse: 'warehouse', warehouse_manager: 'warehouse',
            finance: 'finance', finance_manager: 'finance',
          };
          const myInbox = roleToInbox[cur.role];
          const visibleRoles = isManager
            ? ['sales', 'warehouse', 'finance']
            : (myInbox ? [myInbox] : []);
          // 单一角色时不显示切换器(没意义)
          if (visibleRoles.length <= 1) return '';
          const labels = { sales: isZh2?'销售':'Sales', warehouse: isZh2?'仓管':'Warehouse', finance: isZh2?'财务':'Finance' };
          return `
            <div style="display:flex; gap:6px; margin-bottom:14px; padding:4px; background:var(--bg-3); border-radius:6px; width:fit-content;">
              ${visibleRoles.map(r => renderRoleSwitch(r, labels[r])).join('')}
            </div>
          `;
        })()}
        
        <div id="inbox-kpi" class="grid grid-cols-${cfg.groups.length} gap-3 mb-4"></div>
        <div id="inbox-content"></div>
      </div>
    `;
    renderKPIs();
    renderContent();
    bindEvents();
  }

  function renderRoleSwitch(targetRole, label) {
    const isActive = role === targetRole;
    const cur = Session.current();
    // 显示该角色待办数(全员视图,不限当前用户)
    const allTasks = OrderTaskRepo.list().filter(t => t.status === 'pending' && t.assignedRole === targetRole);
    const count = allTasks.length;
    const routeMap = { sales:'inbox-sales', warehouse:'inbox-warehouse', finance:'inbox-finance' };
    // "只读"说明:角色与目标不匹配且不是管理层
    const roleToInbox = { sales:'sales', sales_manager:'sales', warehouse:'warehouse', warehouse_manager:'warehouse', finance:'finance', finance_manager:'finance' };
    const isReadOnly = roleToInbox[cur.role] !== targetRole && !MANAGER_ROLES.has(cur.role);
    const note = isReadOnly
      ? `<span style="font-size:9px; color:var(--text-3); margin-left:4px;">${I18n.get()==='zh-CN'?'(只读)':'(view only)'}</span>`
      : '';
    return `
      <a href="${Router.href(routeMap[targetRole])}" style="text-decoration:none; padding:6px 14px; border-radius:4px; font-size:12px;
                background:${isActive?'var(--bg-1)':'transparent'}; color:${isActive?'var(--text-1)':'var(--text-3)'};
                font-weight:${isActive?'500':'400'};">
        ${label} ${count > 0 ? `<span style="margin-left:4px; padding:1px 6px; background:rgba(239,68,68,0.15); color:#f87171; border-radius:8px; font-size:10px;">${count}</span>` : ''}${note}
      </a>
    `;
  }

  function renderKPIs() {
    const isZh = I18n.get() === 'zh-CN';
    const cfg = ROLE_CONFIG[role];
    const groups = _getGroups();
    // 过滤 hidden 分组(旧版兼容类型,不在 KPI 卡片里显示)
    const visibleGroups = cfg.groups.filter(g => !g.hidden);
    const html = visibleGroups.map(g => {
      const count = (groups[g.type] || []).length;
      return `
        <div class="kpi" data-jump-group="${g.type}" style="cursor:pointer; transition: transform 0.15s;"
          onmouseover="this.style.transform='translateY(-1px)'" onmouseout="this.style.transform='translateY(0)'">
          <div class="kpi-bar" style="background:${g.color};"></div>
          <div class="kpi-label">${g.icon} ${isZh?g.label:g.labelEn}</div>
          <div class="kpi-value" style="${count > 0 ? 'color:'+g.color+';' : ''}">${count}</div>
          <div class="kpi-trend">${count === 0 ? (isZh?'无待办':'No tasks') : (isZh?'待处理':'Pending')}</div>
        </div>
      `;
    }).join('');
    document.getElementById('inbox-kpi').innerHTML = html;
    document.querySelectorAll('[data-jump-group]').forEach(el => {
      el.addEventListener('click', () => {
        const t = el.dataset.jumpGroup;
        const section = document.getElementById(`group-${t}`);
        if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  function renderContent() {
    const isZh = I18n.get() === 'zh-CN';
    const cfg = ROLE_CONFIG[role];
    const groups = _getGroups();

    let totalTasks = 0;
    cfg.groups.forEach(g => { totalTasks += (groups[g.type] || []).length; });

    if (totalTasks === 0) {
      document.getElementById('inbox-content').innerHTML = `
        <div class="coming-soon" style="padding:80px 20px; text-align:center;">
          <div style="font-size:48px; opacity:0.2; margin-bottom:14px;"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><polyline points="3,8 7,12 13,4"/></svg></div>
          <div class="text-strong" style="font-size:16px;">${isZh?'所有任务已处理完毕':'All caught up'}</div>
          <div class="text-muted" style="font-size:12px; margin-top:6px;">${isZh?'当前没有待办任务':'No pending tasks at the moment'}</div>
        </div>
      `;
      return;
    }

    // 过滤 hidden 分组(旧版兼容类型,仅在有数据时才显示以防丢失)
    const html = cfg.groups.map(g => {
      const items = groups[g.type] || [];
      if (items.length === 0) return '';
      // hidden 分组:有数据也显示,但加旧版标记
      const legacyNote = g.hidden ? `<span style="font-size:10px; color:var(--text-3); margin-left:6px;">(旧版兼容)</span>` : '';
      return `
        <div class="ov-section" id="group-${g.type}" style="margin-bottom:16px;">
          <div class="ov-section-head" style="border-left:3px solid ${g.color};">
            <span style="font-size:14px;">${g.icon} <span class="text-strong">${isZh?g.label:g.labelEn}</span>${legacyNote}</span>
            <span class="text-muted" style="font-size:11px;">${items.length} ${isZh?'项':'tasks'}</span>
          </div>
          <div class="ov-section-body">
            ${items.map(t => renderTaskRow(t, g)).join('')}
          </div>
        </div>
      `;
    }).join('');
    document.getElementById('inbox-content').innerHTML = html;

    // P1-1: 卡片任意空白处也能点(转到订单详情)
    document.querySelectorAll('.oa-card').forEach(card => {
      card.addEventListener('click', (e) => {
        // 内部按钮/链接已自带跳转,跳过
        if (e.target.closest('a, button')) return;
        const oid = card.dataset.orderId;
        if (oid) Router.go('order-detail', { id: oid });
      });
    });
  }

  function renderTaskRow(task, groupCfg) {
    const isZh = I18n.get() === 'zh-CN';
    // 虚拟分组(草稿、进行中)的渲染
    if (task._isVirtualOrder) {
      const order = task;
      const cust = CustomerRepo.find(order.customerId);
      const statusLabel = (SCHEMAS.salesOrder?.statusEnum?.[order.status]?.label) || order.status;
      const statusColor = (SCHEMAS.salesOrder?.statusEnum?.[order.status]?.color) || 'slate';
      return `
        <a href="${Router.href('order-detail', { id: order.id })}" style="text-decoration:none; color:inherit;">
          <div class="task-row" style="display:grid; grid-template-columns: 1fr auto auto auto; gap:14px; padding:12px 14px; border-bottom:1px solid var(--border-1); align-items:center; transition:background 0.15s;"
               onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
            <div>
              <div>
                <span class="font-mono text-strong text-accent">${order.no}</span>
                <span class="text-muted" style="margin-left:8px; font-size:12px;">${cust?.name || '-'}</span>
              </div>
              <div class="text-muted" style="font-size:11px; margin-top:3px;">${(order.items||[]).length} ${isZh?'项明细':'items'} · ${Sensitive.money(order.totalAmount || 0)}</div>
            </div>
            <span style="padding:2px 8px; background:rgba(255,255,255,0.05); color:var(--${statusColor === 'slate' ? 'text-3' : statusColor}); border-radius:3px; font-size:11px;">${statusLabel}</span>
            <span class="text-muted" style="font-size:11px;">${Utils.formatDate(order.updatedAt || order.createdAt)}</span>
            <span style="color:var(--text-3); font-size:12px;">→</span>
          </div>
        </a>
      `;
    }

    // 真实 task 渲染 — 大卡片设计
    const order = SalesOrderRepo.find(task.orderId);
    const cust = order ? CustomerRepo.find(order.customerId) : null;
    const requester = EmployeeRepo.find(task.createdBy);

    // 紧急程度色条
    const urgencyColor =
      task.priority === 'urgent' ? 'var(--red)' :
      task.priority === 'high'   ? 'var(--amber)' :
      'var(--blue)';
    const urgencyLabel =
      task.priority === 'urgent' ? (isZh?'紧急':'Urgent') :
      task.priority === 'high'   ? (isZh?'重要':'High') :
      (isZh?'常规':'Normal');

    // task 类型 → 可见信息组合
    const taskTypeLabel = (SCHEMAS.orderTask?.typeEnum?.[task.type]?.label) || task.type;
    const itemSum = order ? (order.items || []).length : 0;
    const cust_ = cust ? cust.name : '-';

    // 摘要行(按角色脱敏金额)
    const summaryItems = [];
    if (cust) summaryItems.push(`<span><span class="text-muted">${isZh?'客户':'Customer'}:</span> <span class="text-strong">${cust.name}</span></span>`);
    if (order && itemSum) summaryItems.push(`<span><span class="text-muted">${isZh?'产品':'Items'}:</span> <span>${itemSum} ${isZh?'项':'item(s)'}</span></span>`);
    if (order && order.totalAmount != null) {
      summaryItems.push(`<span><span class="text-muted">${isZh?'总额':'Total'}:</span> <span class="font-mono text-strong">${Sensitive.money(order.totalAmount)}</span></span>`);
    }
    if (requester && task.type !== 'order_revise') {
      summaryItems.push(`<span><span class="text-muted">${isZh?'提交人':'By'}:</span> <span>${requester.name}</span></span>`);
    }

    // 主操作:点击 → 直接跳进订单详情 task 区
    const primaryAction = (isZh?'进入处理':'Handle');

    return `
      <div class="oa-card" data-order-id="${task.orderId}" style="position:relative; padding:12px 14px 12px 18px; border:1px solid var(--border-1); border-radius:6px; background:var(--bg-2); margin-bottom:6px; cursor:pointer; transition:all 0.15s;">
        <div style="position:absolute; left:0; top:0; bottom:0; width:3px; background:${urgencyColor}; border-radius:6px 0 0 6px;"></div>
        <div style="display:flex; justify-content:space-between; align-items:center; gap:12px;">
          <div style="flex:1; min-width:0;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
              <span style="padding:1px 6px; font-size:9px; font-weight:600; letter-spacing:0.4px; text-transform:uppercase; color:${urgencyColor}; background:rgba(255,255,255,0.04); border-radius:2px;">${urgencyLabel}</span>
              <span class="text-strong" style="font-size:13px;">${taskTypeLabel}</span>
              ${order ? `<span class="font-mono text-accent" style="font-size:11px;">${order.no}</span>` : ''}
              <span class="text-muted" style="margin-left:auto; font-size:10px;">${_relativeTime(task.createdAt)}</span>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:10px; font-size:11px; color:var(--text-3); line-height:1.5;">
              ${summaryItems.join('<span style="color:var(--text-4);">·</span>')}
            </div>
            ${task.description && !task.description.includes('总额') ? `
              <div class="text-muted" style="font-size:10px; margin-top:3px; font-style:italic;">"${_sanitizeDesc(task.description)}"</div>
            ` : ''}
          </div>
          <a href="${Router.href('order-detail', { id: task.orderId })}" class="btn btn-primary btn-sm" style="text-decoration:none; padding:6px 14px; font-size:12px; white-space:nowrap;">
            ${primaryAction} →
          </a>
        </div>
      </div>
    `;
  }

  /**
   * 按当前角色脱敏 task description 中的金额(应对 seed 历史数据里的金额硬编码)
   * 仓管角色:把"总额 $xxx" / "总额 ¥xxx" 替换为"总额 ***"
   */
  function _sanitizeDesc(desc) {
    if (!desc) return '';
    if (typeof Sensitive !== 'undefined' && !Sensitive.canSeeAmount()) {
      // 替换金额模式:$1,234.56  ¥1234.56  1234.56 元 等
      return desc
        .replace(/总额\s*[\$¥]?\s*[\d,]+\.?\d*/g, '总额 ***')
        .replace(/[\$¥]\s*[\d,]+\.?\d*/g, '***')
        .replace(/Total\s*[\$]?\s*[\d,]+\.?\d*/gi, 'Total ***');
    }
    return desc;
  }

  function _relativeTime(iso) {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const isZh = I18n.get() === 'zh-CN';
    if (diff < 60_000) return isZh?'刚刚':'just now';
    if (diff < 3_600_000) return Math.floor(diff/60_000) + (isZh?' 分钟前':'m ago');
    if (diff < 86_400_000) return Math.floor(diff/3_600_000) + (isZh?' 小时前':'h ago');
    return Math.floor(diff/86_400_000) + (isZh?' 天前':'d ago');
  }

  /** 拿到该角色的所有任务,按 type 分组 */
  function _getGroups() {
    const cur = Session.current();
    const groups = OrderTaskService.getMyInbox(role, cur.id);

    // 销售工作台:虚拟分组(草稿、进行中)
    if (role === 'sales') {
      const myDrafts = SalesOrderRepo.list({ salesmanId: cur.id, status: 'draft' })
        .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
      const myPending = SalesOrderRepo.list({ salesmanId: cur.id })
        .filter(o => ['pending_price', 'pending_finance', 'pending_warehouse', 'preparing', 'shipped'].includes(o.status))
        .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
      groups._drafts  = myDrafts.map(o => ({ ...o, _isVirtualOrder: true }));
      groups._pending = myPending.map(o => ({ ...o, _isVirtualOrder: true }));
    }

    return groups;
  }

  function bindEvents() {
    const newOrderBtn = document.querySelector('[data-action="new-order"]');
    if (newOrderBtn) newOrderBtn.addEventListener('click', () => Router.go('order-new'));
  }

  return { init };
})();

window.InboxViewModule = InboxViewModule;
