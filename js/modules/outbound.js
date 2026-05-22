/**
 * OutboundModule - 出库/发货
 * @module modules/outbound
 *
 * 视角:订单驱动
 *   - 待发货:有 warehouse_prepare / warehouse_ship 任务的订单
 *   - 部分发货:有发货单但订单未全发
 *   - 已发完:全发货
 *
 * 操作:点订单 → 跳订单详情页执行装车/发货
 *
 * 跟「物流管理」分工:
 *   - 出库/发货:回答"哪些订单要发"
 *   - 物流管理:回答"今天发了几车,每车走到哪了"
 */

const OutboundModule = (function () {
  'use strict';

  let activeTab = 'pending';   // pending / partial / completed / all
  let warehouseFilter = '';    // 仓库筛选

  function init(ctx) {
    activeTab = (ctx?.query?.tab) || 'pending';
    warehouseFilter = (ctx?.query?.wh) || '';
    render();
    ['salesOrder.statusChanged', 'delivery.created', 'delivery.signed', 'orderTask.completed'].forEach(e =>
      EventBus.on(e, () => { if (document.getElementById('outbound-root')) render(); })
    );
  }

  function render() {
    const isZh = I18n.get() === 'zh-CN';
    document.getElementById('app-content').innerHTML = `
      <div id="outbound-root">
        <div class="page-header">
          <div>
            <h1 class="page-title">${isZh?'出库/发货':'Outbound'}</h1>
            <div class="page-subtitle">${isZh?'订单视角 · 待发货 · 装车 · 签收':'Order view · pending · loading · signing'}</div>
          </div>
        </div>
        <div class="grid grid-cols-4 gap-3 mb-4" id="ob-kpi"></div>
        <div id="ob-tabs" style="display:flex; gap:4px; margin-bottom:14px;"></div>
        <div id="ob-table"></div>
      </div>
    `;
    renderKPIs();
    renderTabs();
    renderTable();
  }

  function _getBuckets() {
    const orders = SalesOrderRepo.list().filter(o => !o.is_archived);
    const buckets = { pending: [], partial: [], completed: [] };

    // 取所有 pending 的 warehouse task 一次,避免 N²
    const allPendingTasks = OrderTaskRepo.list().filter(t =>
      t.status === 'pending' && (t.type === 'warehouse_prepare' || t.type === 'warehouse_ship')
    );
    const tasksByOrder = {};
    allPendingTasks.forEach(t => {
      if (!tasksByOrder[t.orderId]) tasksByOrder[t.orderId] = [];
      tasksByOrder[t.orderId].push(t);
    });

    orders.forEach(o => {
      // 草稿、被驳回、已取消跳过
      if (['draft', 'cancelled', 'rejected'].includes(o.status)) return;

      const tasks = tasksByOrder[o.id] || [];
      if (tasks.length > 0) {
        // 有待办仓库任务 → 待发货
        buckets.pending.push(o);
        return;
      }
      // 没仓库任务,但订单还有未发完的明细 → 部分发货
      const totalQty = (o.items || []).reduce((s, it) => s + (it.qty || 0), 0);
      const deliveredQty = (o.items || []).reduce((s, it) => s + (it.deliveredQty || 0), 0);
      const hasDelivery = (DeliveryRepo.list({ salesOrderId: o.id }) || []).length > 0;
      if (hasDelivery && totalQty > 0 && deliveredQty < totalQty) {
        buckets.partial.push(o);
      } else if (hasDelivery) {
        buckets.completed.push(o);
      }
    });
    return buckets;
  }

  function renderKPIs() {
    const isZh = I18n.get() === 'zh-CN';
    const b = _getBuckets();
    const kpis = [
      { label: isZh?'待发货':'Pending',     value: b.pending.length,   color: 'var(--amber)' },
      { label: isZh?'部分发货':'Partial',  value: b.partial.length,    color: 'var(--blue)' },
      { label: isZh?'已发完':'Completed',  value: b.completed.length,  color: 'var(--emerald)' },
      { label: isZh?'本月发货':'This Month', value: _thisMonthDeliveryCount(), color: 'var(--text-1)' },
    ];
    document.getElementById('ob-kpi').innerHTML = kpis.map(k => `
      <div class="kpi">
        <div class="kpi-label">${k.label}</div>
        <div class="kpi-value" style="color:${k.color};">${k.value}</div>
      </div>
    `).join('');
  }

  function _thisMonthDeliveryCount() {
    const m0 = new Date(); m0.setDate(1); m0.setHours(0,0,0,0);
    return DeliveryRepo.list().filter(d => new Date(d.shippedAt || d.createdAt) >= m0).length;
  }

  function renderTabs() {
    const isZh = I18n.get() === 'zh-CN';
    const b = _getBuckets();
    const tabs = [
      { key: 'pending',   label: isZh?'待发货':'Pending',   count: b.pending.length },
      { key: 'partial',   label: isZh?'部分发货':'Partial', count: b.partial.length },
      { key: 'completed', label: isZh?'已发完':'Completed', count: b.completed.length },
      { key: 'all',       label: isZh?'全部':'All',         count: b.pending.length + b.partial.length + b.completed.length },
    ];
    document.getElementById('ob-tabs').innerHTML = tabs.map(t => `
      <button data-ob-tab="${t.key}" style="padding:6px 14px; font-size:12px; border:none; border-radius:4px; cursor:pointer;
        background:${activeTab===t.key ? 'var(--bg-2)' : 'transparent'};
        color:${activeTab===t.key ? 'var(--text-1)' : 'var(--text-3)'};
        font-weight:${activeTab===t.key ? '500' : '400'};">
        ${t.label} <span style="color:var(--text-4); font-size:11px;">${t.count}</span>
      </button>
    `).join('');
    document.querySelectorAll('[data-ob-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.obTab;
        Router.replace('outbound-list', {}, { tab: activeTab });
        renderTabs(); renderTable();
      });
    });
  }

  function renderTable() {
    const isZh = I18n.get() === 'zh-CN';
    const b = _getBuckets();
    let data = activeTab === 'all'
      ? [...b.pending, ...b.partial, ...b.completed]
      : b[activeTab] || [];

    const columns = [
      { key: 'no', label: isZh?'订单号':'Order #', width: '150px', sortable: true,
        render: r => `<a href="${Router.href('order-detail', { id: r.id })}" class="font-mono text-accent" style="text-decoration:none;">${r.no}</a>`
      },
      { key: 'customerId', label: isZh?'客户':'Customer', width: '160px',
        render: r => {
          const c = CustomerRepo.find(r.customerId);
          return `<div class="text-strong">${c?.name || '-'}</div><div class="text-muted" style="font-size:11px;">${c?.code || ''}</div>`;
        }
      },
      { key: 'items', label: isZh?'明细':'Items', width: '90px', align:'right',
        render: r => `${(r.items || []).length} ${isZh?'项':'item(s)'}`
      },
      { key: '_qty', label: isZh?'进度':'Progress', width: '180px',
        render: r => {
          const totalQty = (r.items || []).reduce((s, it) => s + (it.qty || 0), 0);
          const deliveredQty = (r.items || []).reduce((s, it) => s + (it.deliveredQty || 0), 0);
          const pct = totalQty > 0 ? Math.round(deliveredQty / totalQty * 100) : 0;
          return `
            <div style="display:flex; align-items:center; gap:8px;">
              <div style="flex:1; height:5px; background:var(--bg-3); border-radius:2px; overflow:hidden;">
                <div style="width:${pct}%; height:100%; background:${pct===100?'var(--emerald)':'var(--blue)'};"></div>
              </div>
              <span class="font-mono text-muted" style="font-size:11px;">${deliveredQty}/${totalQty}</span>
            </div>
          `;
        }
      },
      { key: 'status', label: isZh?'状态':'Status', width: '110px',
        render: r => {
          const cfg = SCHEMAS.salesOrder?.statusEnum?.[r.status] || {};
          return `<span style="padding:2px 8px; background:var(--bg-3); color:var(--${cfg.color === 'slate' ? 'text-3' : cfg.color || 'text-2'}); border-radius:3px; font-size:11px;">${cfg.label || r.status}</span>`;
        }
      },
      { key: '_amount', label: isZh?'金额':'Amount', width: '110px', align:'right',
        render: r => `<span class="font-mono">${Sensitive.money(r.totalAmount)}</span>`
      },
      { key: 'updatedAt', label: isZh?'更新':'Updated', width: '120px',
        render: r => `<span class="text-muted" style="font-size:11px;">${Utils.formatDate(r.updatedAt || r.createdAt)}</span>`
      },
      { key: '_actions', label: isZh?'操作':'Actions', width: '150px', sortable: false,
        render: r => {
          const pendingTasks = (typeof OrderTaskService !== 'undefined') ? OrderTaskService.getPendingByOrder(r.id) : [];
          const wTask = pendingTasks.find(t => t.type === 'warehouse_prepare' || t.type === 'warehouse_ship');
          // 仓管/经理 才能直接操作
          const role = Session.current()?.role;
          const canAct = (role === 'warehouse' || role === 'manager');
          if (wTask && canAct) {
            if (wTask.type === 'warehouse_prepare') {
              return `<button class="btn btn-primary btn-sm" data-quick-action="prepare" data-task-id="${wTask.id}" data-order-id="${r.id}" style="font-size:11px; padding:3px 10px;">${isZh?'备货完成':'Prepared'}</button>`;
            }
            if (wTask.type === 'warehouse_ship') {
              return `<button class="btn btn-primary btn-sm" data-quick-action="ship" data-task-id="${wTask.id}" data-order-id="${r.id}" style="font-size:11px; padding:3px 10px; background:var(--emerald);">${isZh?'确认出库':'Confirm Ship'}</button>`;
            }
          }
          // 已发货 → 查看物流
          const delivs = DeliveryRepo.list({ salesOrderId: r.id });
          if (delivs.length > 0) {
            return `<a href="${Router.href('logistics-detail', { id: delivs[delivs.length-1].id })}" class="text-accent" style="text-decoration:none; font-size:11px;">${isZh?'查看物流 →':'Logistics →'}</a>`;
          }
          return `<a href="${Router.href('order-detail', { id: r.id })}" class="text-accent" style="text-decoration:none; font-size:11px;">${isZh?'详情 →':'Detail →'}</a>`;
        }
      },
    ];

    DataTable.create({
      mount: '#ob-table',
      columns, data,
      customSearch: (row, kw) => {
        const c = CustomerRepo.find(row.customerId);
        return Utils.fuzzyMatch(row.no, kw) || Utils.fuzzyMatch(c?.name, kw);
      },
      searchPlaceholder: isZh?'搜索订单号 / 客户':'Search order # / customer',
      pageSize: 20,
    });

    // 绑定快捷按钮
    setTimeout(() => {
      document.querySelectorAll('[data-quick-action]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault(); e.stopPropagation();
          _handleQuickAction(btn.dataset.quickAction, btn.dataset.taskId, btn.dataset.orderId);
        });
      });
    }, 0);
  }

  // 处理快捷出库动作
  function _handleQuickAction(action, taskId, orderId) {
    const isZh = I18n.get() === 'zh-CN';
    const labels = {
      prepare: { title: isZh?'确认备货完成':'Confirm Prepared', msg: isZh?'确认订单备货已完成?完成后将进入装车阶段。':'Confirm preparation complete? Will advance to loading.' },
      ship:    { title: isZh?'确认出库发车':'Confirm Shipment',  msg: isZh?'确认订单已装车发出?将创建发货单并扣减库存。':'Confirm loaded and shipped? Will create delivery and deduct stock.' },
    };
    const cfg = labels[action];
    Modal.confirm({
      title: cfg.title,
      message: cfg.msg,
      onConfirm: () => {
        try {
          OrderTaskService.complete(taskId, '', Session.current()?.id);
          Toast.success(isZh?'操作成功':'Success');
          render();   // 重新渲染整个列表
        } catch (err) {
          Toast.error((isZh?'操作失败:':'Failed: ') + (err.message || err));
        }
      }
    });
  }

  return { init };
})();

window.OutboundModule = OutboundModule;
