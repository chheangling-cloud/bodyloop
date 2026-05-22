/**
 * LogisticsModule - 物流管理
 * @module modules/logistics
 *
 * 视角:车次驱动(每个 delivery 单 = 一个车次)
 *
 * 跟「出库/发货」分工:
 *   - 出库/发货:订单视角 - "哪些订单要发"
 *   - 物流管理:车次视角 - "今天发了几车,到哪了,回单收了没,运费付了没"
 *
 * 核心字段(扩展 delivery 表):
 *   - truckNo / driver / phone        // 车牌、司机姓名、电话
 *   - departAt                         // 出发时间
 *   - etaAt                            // 预计到达
 *   - arrivedAt                        // 实际到达
 *   - signedAt                         // 签收时间
 *   - receiptUrl (via AttachmentService) // 回单
 *   - freight (cents)                  // 运费
 *   - freightPaid (bool)               // 运费已付
 *   - transportStatus: pending/in_transit/signed/exception
 *
 * 长期租车场景:不维护车辆主数据,只在每个车次现填
 */

const LogisticsModule = (function () {
  'use strict';

  let activeTab = 'all';     // today / pending / in_transit / signed / all
  let dateFilter = '';

  function init(ctx) {
    activeTab = (ctx?.query?.tab) || 'all';
    render();
    ['delivery.created', 'delivery.signed', 'delivery.updated', 'logistics.updated'].forEach(e =>
      EventBus.on(e, () => { if (document.getElementById('logistics-root')) render(); })
    );
  }

  function render() {
    const isZh = I18n.get() === 'zh-CN';
    const cur = Session.current();
    const canManageVehicles = (cur?.role === 'warehouse' || cur?.role === 'manager');
    document.getElementById('app-content').innerHTML = `
      <div id="logistics-root">
        <div class="page-header">
          <div>
            <h1 class="page-title">${isZh?'物流管理':'Logistics'}</h1>
            <div class="page-subtitle">${isZh?'车次跟踪 · 回单管理 · 运费记录':'Trip tracking · receipts · freight records'}</div>
          </div>
          <div class="flex gap-2">
            <button class="btn btn-secondary btn-sm" id="btn-export-lg">${typeof _exportIcon !== 'undefined' ? _exportIcon() : ''} ${isZh?'导出 Excel':'Export'}</button>
            ${canManageVehicles ? `<button class="btn btn-secondary btn-sm" id="btn-fleet-mgr">${Icon.users(13)} ${isZh?'车队管理':'Fleets'}</button>` : ''}
            ${canManageVehicles ? `<button class="btn btn-secondary btn-sm" id="btn-vehicle-mgr">${Icon.truck(13)} ${isZh?'车辆管理':'Vehicles'}</button>` : ''}
            ${canManageVehicles ? `<button class="btn btn-secondary btn-sm" id="btn-freight-settle">${Icon.briefcase(13)} ${isZh?'运费结算':'Freight'}</button>` : ''}
          </div>
        </div>
        <div class="grid grid-cols-4 gap-3 mb-4" id="lg-kpi"></div>
        <div id="lg-tabs" style="display:flex; gap:4px; margin-bottom:14px;"></div>
        <div id="lg-table"></div>
      </div>
    `;
    renderKPIs();
    renderTabs();
    renderTable();
    const vBtn = document.getElementById('btn-vehicle-mgr');
    if (vBtn) vBtn.addEventListener('click', openVehicleManager);
    const fBtn = document.getElementById('btn-fleet-mgr');
    if (fBtn) fBtn.addEventListener('click', openFleetManager);
    const sBtn = document.getElementById('btn-freight-settle');
    if (sBtn) sBtn.addEventListener('click', openFreightSettlement);
    const eBtn = document.getElementById('btn-export-lg');
    if (eBtn) eBtn.addEventListener('click', exportLogistics);
  }

  function exportLogistics() {
    const isZh = I18n.get() === 'zh-CN';
    const dels = DeliveryRepo.list().sort((a,b) => (b.deliveryDate||'').localeCompare(a.deliveryDate||''));
    const statusLabel = {
      pending: '待发车',
      in_transit: '运输中',
      signed: '已签收',
      partial_signed: '部分签收',
    };
    const rows = dels.map(d => {
      const vehicle = d.vehicleId ? VehicleRepo.find(d.vehicleId) : null;
      const fleet = vehicle?.fleetId ? FleetRepo.find(vehicle.fleetId) : null;
      const order = d.salesOrderId ? SalesOrderRepo.find(d.salesOrderId) : null;
      const cust = order ? CustomerRepo.find(order.customerId) : null;
      return {
        no: d.no,
        deliveryDate: d.deliveryDate,
        signedAt: (d.signedAt || '').slice(0, 10),
        plateNo: vehicle?.plateNo || d.truckNo || '',
        driver: vehicle?.driverName || d.driverName || '',
        phone: vehicle?.driverPhone || d.driverPhone || '',
        fleet: fleet?.name || '-',
        orderNo: order?.no || '',
        customer: cust?.name || '',
        truckSeq: d.orderTruckSequence || '',
        itemCount: (d.items || []).length,
        totalQty: (d.items || []).reduce((s, i) => s + (i.qty || 0), 0),
        totalAmount: d.totalAmount || 0,
        freight: d.freight || 0,
        freightPaid: d.freightPaid ? '已付' : '未付',
        status: statusLabel[d.transportStatus] || d.transportStatus,
      };
    });
    ExcelExporter.exportSheet('物流车次_' + Utils.today(), '物流车次', [
      { key: 'no', label: 'DN号', width: 18 },
      { key: 'deliveryDate', label: '发车日', width: 12, format: 'date' },
      { key: 'signedAt', label: '签收日', width: 12, format: 'date' },
      { key: 'plateNo', label: '车牌', width: 12 },
      { key: 'driver', label: '司机', width: 10 },
      { key: 'phone', label: '电话', width: 14 },
      { key: 'fleet', label: '车队', width: 14 },
      { key: 'orderNo', label: '订单号', width: 18 },
      { key: 'customer', label: '客户', width: 16 },
      { key: 'truckSeq', label: '第几车', width: 8, format: 'number' },
      { key: 'itemCount', label: '品类数', width: 8, format: 'number' },
      { key: 'totalQty', label: '装车量', width: 10, format: 'number' },
      { key: 'totalAmount', label: '货值', width: 14, format: 'currency' },
      { key: 'freight', label: '运费', width: 10, format: 'currency' },
      { key: 'freightPaid', label: '运费状态', width: 10 },
      { key: 'status', label: '运输状态', width: 10 },
    ], rows);
  }

  function _today() {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    return t;
  }
  function _isSameDay(iso) {
    if (!iso) return false;
    const d = new Date(iso); d.setHours(0, 0, 0, 0);
    return d.getTime() === _today().getTime();
  }

  function _getBuckets() {
    const all = DeliveryRepo.list().filter(d => !d.is_archived);
    return {
      today: all.filter(d => _isSameDay(d.shippedAt) || _isSameDay(d.createdAt)),
      pending: all.filter(d => (d.transportStatus || 'pending') === 'pending'),
      in_transit: all.filter(d => d.transportStatus === 'in_transit'),
      signed: all.filter(d => d.transportStatus === 'signed'),
      exception: all.filter(d => d.transportStatus === 'exception'),
      all,
    };
  }

  function renderKPIs() {
    const isZh = I18n.get() === 'zh-CN';
    const b = _getBuckets();
    const vehicleCount = VehicleService.list().length;
    const unpaidFreight = b.all.filter(d => !d.freightPaid).reduce((s, d) => s + (d.freight || 0), 0);
    const unpaidCount = b.all.filter(d => !d.freightPaid && d.freight > 0).length;
    const kpis = [
      { label: isZh?'今日车次':'Today',         value: b.today.length,      sub: `${b.in_transit.length} ${isZh?'运输中':'in transit'}`, color: 'var(--text-1)' },
      { label: isZh?'本月车次':'This Month',    value: b.all.filter(d => {
        const dt = d.shippedAt || d.createdAt;
        if (!dt) return false;
        const m = new Date(dt);
        const now = new Date();
        return m.getMonth() === now.getMonth() && m.getFullYear() === now.getFullYear();
      }).length, sub: `${isZh?'共':'Total'} ${b.all.length}`, color: 'var(--blue)' },
      { label: isZh?'未付运费':'Unpaid Freight', value: Sensitive.money(unpaidFreight), sub: `${unpaidCount} ${isZh?'笔':'item(s)'}`, color: 'var(--amber)', valueRaw: true },
      { label: isZh?'车辆库':'Vehicles',         value: vehicleCount, sub: isZh?'点右上"车辆管理"':'Manage at top-right', color: 'var(--text-1)' },
    ];
    document.getElementById('lg-kpi').innerHTML = kpis.map(k => `
      <div class="kpi">
        <div class="kpi-label">${k.label}</div>
        <div class="kpi-value" style="color:${k.color};">${k.value}</div>
        <div class="kpi-trend">${k.sub || ''}</div>
      </div>
    `).join('');
  }

  function renderTabs() {
    const isZh = I18n.get() === 'zh-CN';
    const b = _getBuckets();
    const tabs = [
      { key: 'today',      label: isZh?'今日':'Today',         count: b.today.length },
      { key: 'pending',    label: isZh?'待发车':'Pending',     count: b.pending.length },
      { key: 'in_transit', label: isZh?'运输中':'In Transit',  count: b.in_transit.length },
      { key: 'signed',     label: isZh?'已签收':'Signed',      count: b.signed.length },
      { key: 'exception',  label: isZh?'异常':'Exception',     count: b.exception.length, color: 'var(--red)' },
      { key: 'all',        label: isZh?'全部':'All',           count: b.all.length },
    ];
    document.getElementById('lg-tabs').innerHTML = tabs.map(t => `
      <button data-lg-tab="${t.key}" style="padding:6px 14px; font-size:12px; border:none; border-radius:4px; cursor:pointer;
        background:${activeTab===t.key ? 'var(--bg-2)' : 'transparent'};
        color:${activeTab===t.key ? 'var(--text-1)' : (t.color || 'var(--text-3)')};
        font-weight:${activeTab===t.key ? '500' : '400'};">
        ${t.label} <span style="color:var(--text-4); font-size:11px;">${t.count}</span>
      </button>
    `).join('');
    document.querySelectorAll('[data-lg-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.lgTab;
        Router.replace('logistics-list', {}, { tab: activeTab });
        renderTabs(); renderTable();
      });
    });
  }

  function renderTable() {
    const isZh = I18n.get() === 'zh-CN';
    const b = _getBuckets();
    const data = b[activeTab] || [];

    const columns = [
      { key: 'no', label: isZh?'DN 号':'DN #', width: '140px', sortable: true,
        render: r => `<a href="${Router.href('logistics-detail', { id: r.id })}" class="font-mono text-accent" style="text-decoration:none;">${r.no}</a>`
      },
      { key: 'truckNo', label: isZh?'车牌 / 司机':'Truck / Driver', width: '150px',
        render: r => {
          const vehicle = r.vehicleId ? VehicleRepo.find(r.vehicleId) : null;
          const plate  = vehicle?.plateNo || r.truckNo;
          const driver = vehicle?.driverName || r.driver || r.driverName;
          const phone  = vehicle?.driverPhone || r.phone || r.driverPhone;
          if (!plate && !driver) return `<span class="text-muted" style="font-style:italic;">${isZh?'未分配车辆':'No vehicle'}</span>`;
          return `<div class="font-mono">${plate || '-'}</div>
            ${driver ? `<div class="text-muted" style="font-size:11px;">${driver}${phone ? ' · '+phone : ''}</div>` : ''}`;
        }
      },
      { key: 'fleetId', label: isZh?'车队':'Fleet', width: '120px',
        render: r => {
          const vehicle = r.vehicleId ? VehicleRepo.find(r.vehicleId) : null;
          const fleetId = vehicle?.fleetId;
          if (!fleetId || typeof FleetRepo === 'undefined') return `<span class="text-muted">-</span>`;
          const f = FleetRepo.find(fleetId);
          if (!f) return `<span class="text-muted">-</span>`;
          const modeColor = { monthly: 'var(--blue)', daily: 'var(--emerald)', per_trip: 'var(--amber)', manual: 'var(--text-3)' };
          const modeLabel = { monthly: isZh?'月结':'Monthly', daily: isZh?'日结':'Daily', per_trip: isZh?'趟次':'Per-trip', manual: isZh?'手动':'Manual' };
          return `<div style="font-size:12px;">${f.name}</div>
            <span style="font-size:10px; padding:1px 5px; border-radius:3px; background:${modeColor[f.settlementMode]}1A; color:${modeColor[f.settlementMode]};">${modeLabel[f.settlementMode] || f.settlementMode}</span>`;
        }
      },
      { key: 'customerId', label: isZh?'收货客户':'Customer', width: '170px',
        render: r => {
          const o = SalesOrderRepo.find(r.salesOrderId);
          const c = o ? CustomerRepo.find(o.customerId) : null;
          if (!c) return '-';
          const orderSeq = r.orderTruckSequence ? ` · ${isZh?'第':'No.'} ${r.orderTruckSequence} ${isZh?'车':''}` : '';
          return `<div class="text-strong">${c.name}</div>
            <a href="${Router.href('order-detail', { id: o.id })}" class="text-accent" style="font-size:11px; text-decoration:none;">${o.no}${orderSeq}</a>`;
        }
      },
      { key: 'items', label: isZh?'装货明细':'Cargo', width: '160px',
        render: r => {
          const items = r.items || [];
          if (!items.length) return `<span class="text-muted">-</span>`;
          const totalQty = items.reduce((s, i) => s + (i.qty || 0), 0);
          const cats = items.slice(0, 2).map(i => i.materialName || '').filter(Boolean);
          const more = items.length > 2 ? ` +${items.length - 2}` : '';
          return `<div style="font-size:11px;">${cats.join(', ')}${more}</div>
            <div class="text-muted" style="font-size:10px;">${totalQty} ${isZh?'件 · ':'pcs · '}${items.length} ${isZh?'品类':'SKU'}</div>`;
        }
      },
      { key: 'shippedAt', label: isZh?'出发时间':'Depart', width: '120px',
        render: r => {
          const at = r.departAt || r.shippedAt;
          if (!at) return `<span class="text-muted">-</span>`;
          return `<span class="font-mono" style="font-size:11px;">${Utils.formatDateTime(at).slice(0, 16)}</span>`;
        }
      },
      { key: 'signedAt', label: isZh?'签收时间':'Signed', width: '120px',
        render: r => {
          if (r.signedAt) return `<span class="font-mono text-emerald" style="font-size:11px;">${Utils.formatDateTime(r.signedAt).slice(0, 16)}</span>`;
          if (r.etaAt) return `<span class="text-muted" style="font-size:11px;">${isZh?'预':'ETA'} ${Utils.formatDate(r.etaAt)}</span>`;
          return `<span class="text-muted">-</span>`;
        }
      },
      { key: 'transportStatus', label: isZh?'状态':'Status', width: '80px',
        render: r => {
          const st = r.transportStatus || 'pending';
          const cfg = SCHEMAS.delivery?.transportStatusEnum?.[st] || {};
          return `<span style="padding:2px 8px; background:var(--bg-3); color:var(--${cfg.color || 'text-2'}); border-radius:3px; font-size:11px;">${cfg.label || st}</span>`;
        }
      },
      { key: 'receipt', label: isZh?'回单':'Receipt', width: '60px', align:'center',
        render: r => {
          const atts = (typeof AttachmentService !== 'undefined')
            ? AttachmentService.list({ entityType: 'delivery', entityId: r.id }).filter(a => a.caption?.includes('回单') || a.caption?.toLowerCase().includes('receipt'))
            : [];
          return atts.length > 0
            ? `<span class="text-emerald" title="${atts.length} ${isZh?'张回单':'receipt(s)'}">${Icon.check(12)}</span>`
            : `<span class="text-muted">-</span>`;
        }
      },
      { key: 'freight', label: isZh?'运费':'Freight', width: '100px', align:'right',
        render: r => {
          if (!r.freight) return `<span class="text-muted">-</span>`;
          const color = r.freightPaid ? 'text-emerald' : 'text-amber';
          const label = r.freightPaid ? (isZh?'已付':'paid') : (isZh?'未付':'unpaid');
          return `<div class="font-mono ${color}" style="font-size:11px;">${Sensitive.money(r.freight)}</div><div class="text-muted" style="font-size:10px;">${label}</div>`;
        }
      },
      { key: '_actions', label: isZh?'操作':'', width: '60px', sortable: false,
        render: r => `<a href="${Router.href('logistics-detail', { id: r.id })}" class="text-accent" style="text-decoration:none; font-size:11px;">${isZh?'详情':'View'} →</a>`
      },
    ];

    DataTable.create({
      mount: '#lg-table',
      columns, data,
      customSearch: (row, kw) => {
        return Utils.fuzzyMatch(row.no, kw)
          || Utils.fuzzyMatch(row.truckNo, kw)
          || Utils.fuzzyMatch(row.driver || row.driverName, kw)
          || Utils.fuzzyMatch(row.phone || row.driverPhone, kw);
      },
      searchPlaceholder: isZh?'搜索车次 / 车牌 / 司机':'Search trip / truck / driver',
      pageSize: 20,
    });
  }

  // ============== 车辆管理弹窗 ==============

  function openVehicleManager() {
    const isZh = I18n.get() === 'zh-CN';
    const vehicles = VehicleService.list();
    Modal.open({
      title: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M1 11h11V3H1zM12 11h2.5l-1-3.5h-1.5"/><circle cx="3.5" cy="11" r="1.5"/><circle cx="13" cy="11" r="1.5"/></svg> ${isZh?'车辆管理':'Vehicle Management'}`,
      width: 920,
      content: `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
          <div class="text-muted" style="font-size:12px;">${isZh?`共 ${vehicles.length} 辆车`:`${vehicles.length} vehicle(s)`}</div>
          <button class="btn btn-primary btn-sm" id="btn-add-vehicle">+ ${isZh?'新增车辆':'New Vehicle'}</button>
        </div>
        <div id="vehicle-list"></div>
      `,
      buttons: [{ label: isZh?'关闭':'Close', primary: true }],
    });
    renderVehicleList();
    document.getElementById('btn-add-vehicle').addEventListener('click', () => openVehicleEditor(null));
  }

  function renderVehicleList() {
    const isZh = I18n.get() === 'zh-CN';
    const vehicles = VehicleService.list();
    const typeLabel = { small: isZh?'小型':'Small', medium: isZh?'中型':'Medium', large: isZh?'大型':'Large', container: isZh?'集装箱':'Container' };
    const ownerLabel = { self: isZh?'自有':'Self', contracted: isZh?'长期':'Contract', temp: isZh?'临时':'Temp' };
    const ownerColor = { self: 'var(--emerald)', contracted: 'var(--blue)', temp: 'var(--amber)' };

    if (vehicles.length === 0) {
      document.getElementById('vehicle-list').innerHTML = `
        <div style="text-align:center; padding:40px; color:var(--text-3); border:1px dashed var(--border-1); border-radius:6px;">
          ${isZh?'还没有车辆,点上方「新增车辆」添加':'No vehicles yet, click "New Vehicle"'}
        </div>`;
      return;
    }

    document.getElementById('vehicle-list').innerHTML = `
      <table style="width:100%; border-collapse:collapse; font-size:12px;">
        <thead>
          <tr style="border-bottom:1px solid var(--border-1); color:var(--text-3);">
            <th style="text-align:left; padding:8px 10px;">${isZh?'编号':'No.'}</th>
            <th style="text-align:left; padding:8px 10px;">${isZh?'车牌':'Plate'}</th>
            <th style="text-align:left; padding:8px 10px;">${isZh?'车队':'Fleet'}</th>
            <th style="text-align:left; padding:8px 10px;">${isZh?'类型':'Type'}</th>
            <th style="text-align:left; padding:8px 10px;">${isZh?'司机':'Driver'}</th>
            <th style="text-align:left; padding:8px 10px;">${isZh?'载重':'Capacity'}</th>
            <th style="text-align:left; padding:8px 10px;">${isZh?'归属':'Owner'}</th>
            <th style="text-align:right; padding:8px 10px;">${isZh?'默认运费':'Default Freight'}</th>
            <th style="text-align:center; padding:8px 10px;">${isZh?'统计':'Stats'}</th>
            <th style="text-align:right; padding:8px 10px; width:90px;">${isZh?'操作':''}</th>
          </tr>
        </thead>
        <tbody>
          ${vehicles.map(v => {
            const st = VehicleService.getStats(v.id);
            return `
            <tr style="border-bottom:1px solid var(--border-1); ${v.status === 'disabled' ? 'opacity:0.5;' : ''}" data-vid="${v.id}">
              <td style="padding:8px 10px;" class="font-mono text-muted">${v.no}</td>
              <td style="padding:8px 10px;" class="font-mono text-strong">${v.plateNo}</td>
              <td style="padding:8px 10px;">${(() => {
                if (!v.fleetId || typeof FleetRepo === 'undefined') return `<span class="text-muted">-</span>`;
                const f = FleetRepo.find(v.fleetId);
                if (!f) return `<span class="text-muted">-</span>`;
                return `<span style="font-size:11px;">${f.name}</span>`;
              })()}</td>
              <td style="padding:8px 10px;">${typeLabel[v.truckType] || v.truckType}</td>
              <td style="padding:8px 10px;">
                <div>${v.driverName || '-'}</div>
                ${v.driverPhone ? `<div class="text-muted" style="font-size:10px;">${v.driverPhone}</div>` : ''}
              </td>
              <td style="padding:8px 10px;">${v.capacity || '-'}</td>
              <td style="padding:8px 10px;">
                <span style="padding:2px 6px; font-size:10px; border-radius:3px; background:${ownerColor[v.ownerType]}1A; color:${ownerColor[v.ownerType]};">${ownerLabel[v.ownerType]}</span>
              </td>
              <td style="padding:8px 10px; text-align:right;" class="font-mono">${v.defaultFreight ? Utils.formatMoney(v.defaultFreight) : '-'}</td>
              <td style="padding:8px 10px; text-align:center;">
                <span class="text-muted" style="font-size:11px;">${st.totalTrips} ${isZh?'车次':'trips'}</span>
                ${st.unpaidFreight > 0 ? `<div class="text-amber" style="font-size:10px;">${isZh?'欠 ':'unpaid '}${Utils.formatMoney(st.unpaidFreight)}</div>` : ''}
              </td>
              <td style="padding:8px 10px; text-align:right;">
                <button class="btn-icon" data-edit="${v.id}" title="${isZh?'编辑':'Edit'}" style="background:none; border:none; cursor:pointer; padding:2px;">${Icon.edit(12)}</button>
                ${v.status === 'active' ? `<button class="btn-icon" data-disable="${v.id}" title="${isZh?'停用':'Disable'}" style="background:none; border:none; cursor:pointer; padding:2px; color:var(--text-3);">${Icon.x(12)}</button>` : `<button class="btn-icon" data-enable="${v.id}" title="${isZh?'启用':'Enable'}" style="background:none; border:none; cursor:pointer; padding:2px; color:var(--emerald); font-size:12px;">↻</button>`}
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    `;
    document.querySelectorAll('[data-edit]').forEach(el => el.addEventListener('click', () => openVehicleEditor(el.dataset.edit)));
    document.querySelectorAll('[data-disable]').forEach(el => el.addEventListener('click', () => {
      try { VehicleService.disable(el.dataset.disable, Session.current()?.id); renderVehicleList(); Toast.success(isZh?'已停用':'Disabled'); }
      catch(e) { Toast.error(e.message); }
    }));
    document.querySelectorAll('[data-enable]').forEach(el => el.addEventListener('click', () => {
      VehicleService.enable(el.dataset.enable, Session.current()?.id);
      renderVehicleList();
      Toast.success(isZh?'已启用':'Enabled');
    }));
  }

  function openVehicleEditor(vehicleId) {
    const isZh = I18n.get() === 'zh-CN';
    const v = vehicleId ? VehicleService.findById(vehicleId) : null;
    const fleets = (typeof FleetService !== 'undefined') ? FleetService.list({ status: 'active' }) : [];
    Modal.open({
      title: vehicleId ? (isZh?'编辑车辆':'Edit Vehicle') : (isZh?'新增车辆':'New Vehicle'),
      width: 540,
      content: `
        <div style="display:grid; gap:14px;">
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
            <div>
              <label class="form-label">${isZh?'车牌号':'Plate No.'} <span style="color:var(--red);">*</span></label>
              <input id="ve-plate" class="input w-full" placeholder="${isZh?'如 粤B-12345':'e.g. ABC-12345'}" value="${v?.plateNo || ''}">
            </div>
            <div>
              <label class="form-label">${isZh?'车型':'Truck Type'}</label>
              <select id="ve-type" class="select w-full">
                <option value="small"     ${v?.truckType==='small'?'selected':''}>${isZh?'小型 (2-3t)':'Small (2-3t)'}</option>
                <option value="medium"    ${v?.truckType==='medium'?'selected':''}>${isZh?'中型 (5-8t)':'Medium (5-8t)'}</option>
                <option value="large"     ${v?.truckType==='large'?'selected':''}>${isZh?'大型 (10t+)':'Large (10t+)'}</option>
                <option value="container" ${v?.truckType==='container'?'selected':''}>${isZh?'集装箱':'Container'}</option>
              </select>
            </div>
          </div>
          <div>
            <label class="form-label">
              ${isZh?'所属车队':'Fleet'}
              <span class="text-muted" style="font-size:11px; font-weight:400;">${isZh?'(决定结算方式)':'(determines settlement)'}</span>
            </label>
            <div style="display:flex; gap:6px;">
              <select id="ve-fleet" class="select" style="flex:1;">
                <option value="">${isZh?'-- 未指定 --':'-- None --'}</option>
                ${fleets.map(f => {
                  const modeLabel = { monthly: isZh?'月结':'Monthly', daily: isZh?'日结':'Daily', per_trip: isZh?'趟次':'Per-trip', manual: isZh?'手动':'Manual' }[f.settlementMode] || f.settlementMode;
                  return `<option value="${f.id}" ${v?.fleetId===f.id?'selected':''}>${f.name} · ${modeLabel}</option>`;
                }).join('')}
              </select>
              <button type="button" class="btn btn-secondary btn-sm" id="ve-fleet-new">+ ${isZh?'新建':'New'}</button>
            </div>
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
            <div>
              <label class="form-label">${isZh?'司机姓名':'Driver Name'}</label>
              <input id="ve-driver" class="input w-full" value="${v?.driverName || ''}">
            </div>
            <div>
              <label class="form-label">${isZh?'司机电话':'Driver Phone'}</label>
              <input id="ve-phone" class="input w-full" value="${v?.driverPhone || ''}">
            </div>
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
            <div>
              <label class="form-label">${isZh?'载重':'Capacity'}</label>
              <input id="ve-capacity" class="input w-full" placeholder="${isZh?'如 5吨':'e.g. 5 ton'}" value="${v?.capacity || ''}">
            </div>
            <div>
              <label class="form-label">${isZh?'归属':'Owner Type'}</label>
              <select id="ve-owner" class="select w-full">
                <option value="self"       ${v?.ownerType==='self'?'selected':''}>${isZh?'自有车辆':'Self-owned'}</option>
                <option value="contracted" ${v?.ownerType==='contracted' || !v?'selected':''}>${isZh?'长期合作':'Contracted'}</option>
                <option value="temp"       ${v?.ownerType==='temp'?'selected':''}>${isZh?'临时雇佣':'Temporary'}</option>
              </select>
            </div>
          </div>
          <div>
            <label class="form-label">${isZh?'默认运费 (每车次)':'Default Freight (per trip)'}</label>
            <div style="position:relative;">
              <span style="position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--text-3);">$</span>
              <input id="ve-freight" class="input w-full" type="number" step="0.01" min="0"
                value="${v?.defaultFreight ? (v.defaultFreight/100).toFixed(2) : '0'}" style="padding-left:24px;">
            </div>
            <div class="text-muted" style="font-size:11px; margin-top:4px;">${isZh?'每次出车默认运费,可在具体车次单独调整':'Default per trip, adjustable per delivery'}</div>
          </div>
          <div>
            <label class="form-label">${isZh?'备注':'Remark'}</label>
            <textarea id="ve-remark" class="input w-full" rows="2">${v?.remark || ''}</textarea>
          </div>
        </div>
      `,
      onOpen: () => {
        // "新建车队" 按钮:嵌入一层 Modal,提交后自动选中
        const newFleetBtn = document.getElementById('ve-fleet-new');
        if (newFleetBtn) {
          newFleetBtn.addEventListener('click', () => openFleetEditor(null, (newFleet) => {
            // 把新车队加入下拉,自动选中
            const select = document.getElementById('ve-fleet');
            const modeLabel = { monthly: isZh?'月结':'Monthly', daily: isZh?'日结':'Daily', per_trip: isZh?'趟次':'Per-trip', manual: isZh?'手动':'Manual' }[newFleet.settlementMode] || newFleet.settlementMode;
            const opt = new Option(`${newFleet.name} · ${modeLabel}`, newFleet.id, true, true);
            select.add(opt);
            select.value = newFleet.id;
          }));
        }
      },
      buttons: [
        { label: isZh?'取消':'Cancel' },
        { label: vehicleId ? (isZh?'保存':'Save') : (isZh?'创建':'Create'), primary: true, onClick: () => {
          const data = {
            plateNo: document.getElementById('ve-plate').value.trim(),
            truckType: document.getElementById('ve-type').value,
            fleetId: document.getElementById('ve-fleet').value || null,
            driverName: document.getElementById('ve-driver').value.trim(),
            driverPhone: document.getElementById('ve-phone').value.trim(),
            capacity: document.getElementById('ve-capacity').value.trim(),
            ownerType: document.getElementById('ve-owner').value,
            defaultFreight: Math.round(parseFloat(document.getElementById('ve-freight').value || '0') * 100),
            remark: document.getElementById('ve-remark').value.trim(),
          };
          try {
            if (vehicleId) VehicleService.update(vehicleId, data, Session.current()?.id);
            else            VehicleService.create(data, Session.current()?.id);
            Toast.success(isZh?'已保存':'Saved');
            renderVehicleList();
          } catch (e) {
            Toast.error(e.message);
            return false;
          }
        }},
      ],
    });
  }

  // =================== 车队管理 ===================

  function openFleetManager() {
    const isZh = I18n.get() === 'zh-CN';
    Modal.open({
      title: `${Icon.users(14)} ${isZh?'车队管理':'Fleet Management'}`,
      width: 980,
      content: `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
          <div class="text-muted" style="font-size:12px;" id="fl-count"></div>
          <button class="btn btn-primary btn-sm" id="btn-add-fleet">+ ${isZh?'新增车队':'New Fleet'}</button>
        </div>
        <div id="fleet-list"></div>
      `,
      buttons: [{ label: isZh?'关闭':'Close', primary: true }],
    });
    renderFleetList();
    document.getElementById('btn-add-fleet').addEventListener('click', () => openFleetEditor(null));
  }

  function renderFleetList() {
    const isZh = I18n.get() === 'zh-CN';
    const fleets = FleetService.list();
    const modeLabel = { monthly: isZh?'月结':'Monthly', daily: isZh?'日结':'Daily', per_trip: isZh?'趟次':'Per-trip', manual: isZh?'手动':'Manual' };
    const modeColor = { monthly: 'var(--blue)', daily: 'var(--emerald)', per_trip: 'var(--amber)', manual: 'var(--text-3)' };

    document.getElementById('fl-count').textContent = isZh ? `共 ${fleets.length} 个车队` : `${fleets.length} fleet(s)`;

    if (fleets.length === 0) {
      document.getElementById('fleet-list').innerHTML = `
        <div style="text-align:center; padding:40px; color:var(--text-3); border:1px dashed var(--border-1); border-radius:6px;">
          ${isZh?'还没有车队,点上方「新增车队」添加':'No fleets yet'}
        </div>`;
      return;
    }

    document.getElementById('fleet-list').innerHTML = `
      <table style="width:100%; border-collapse:collapse; font-size:12px;">
        <thead>
          <tr style="border-bottom:1px solid var(--border-1); color:var(--text-3);">
            <th style="text-align:left; padding:8px 10px;">${isZh?'编号':'No.'}</th>
            <th style="text-align:left; padding:8px 10px;">${isZh?'车队名':'Name'}</th>
            <th style="text-align:left; padding:8px 10px;">${isZh?'结算方式':'Mode'}</th>
            <th style="text-align:left; padding:8px 10px;">${isZh?'联系人':'Contact'}</th>
            <th style="text-align:center; padding:8px 10px;">${isZh?'车辆数':'Vehicles'}</th>
            <th style="text-align:right; padding:8px 10px;">${isZh?'待结金额':'Outstanding'}</th>
            <th style="text-align:right; padding:8px 10px; width:120px;">${isZh?'操作':''}</th>
          </tr>
        </thead>
        <tbody>
          ${fleets.map(f => {
            const vehicleCount = VehicleRepo.list({ fleetId: f.id }).length;
            const out = FleetService.getOutstanding(f.id) || { totalUnpaid: 0, tripCount: 0 };
            return `
              <tr style="border-bottom:1px solid var(--border-1); ${f.status === 'disabled' ? 'opacity:0.5;' : ''}">
                <td style="padding:8px 10px;" class="font-mono text-muted">${f.no}</td>
                <td style="padding:8px 10px;">
                  <div class="text-strong">${f.name}</div>
                  ${f.remark ? `<div class="text-muted" style="font-size:10px;">${f.remark}</div>` : ''}
                </td>
                <td style="padding:8px 10px;">
                  <span style="padding:2px 6px; font-size:10px; border-radius:3px; background:${modeColor[f.settlementMode]}1A; color:${modeColor[f.settlementMode]};">${modeLabel[f.settlementMode] || f.settlementMode}</span>
                  <div class="text-muted" style="font-size:10px; margin-top:2px;">${isZh?'账期 ':'Days '}${f.paymentDays}d</div>
                </td>
                <td style="padding:8px 10px;">
                  <div>${f.contactName || '-'}</div>
                  ${f.contactPhone ? `<div class="text-muted" style="font-size:10px;">${f.contactPhone}</div>` : ''}
                </td>
                <td style="padding:8px 10px; text-align:center;" class="font-mono">${vehicleCount}</td>
                <td style="padding:8px 10px; text-align:right;" class="font-mono">
                  ${out.totalUnpaid > 0
                    ? `<span class="text-amber text-strong">${Utils.formatMoney(out.totalUnpaid)}</span><div class="text-muted" style="font-size:10px;">${out.tripCount} ${isZh?'车次':'trips'}</div>`
                    : `<span class="text-muted">$0.00</span>`}
                </td>
                <td style="padding:8px 10px; text-align:right;">
                  <button class="btn-icon" data-edit-fleet="${f.id}" title="${isZh?'编辑':'Edit'}" style="background:none; border:none; cursor:pointer; padding:2px;">${Icon.edit(12)}</button>
                  ${out.totalUnpaid > 0
                    ? `<button class="btn-icon" data-settle-fleet="${f.id}" title="${isZh?'结算':'Settle'}" style="background:none; border:none; cursor:pointer; padding:2px; color:var(--blue);">${Icon.briefcase(12)}</button>`
                    : ''}
                  <button class="btn-icon" data-remove-fleet="${f.id}" title="${isZh?'删除':'Delete'}" style="background:none; border:none; cursor:pointer; padding:2px; color:var(--red);">${Icon.x(12)}</button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;

    document.querySelectorAll('[data-edit-fleet]').forEach(el => el.addEventListener('click', () => openFleetEditor(el.dataset.editFleet)));
    document.querySelectorAll('[data-settle-fleet]').forEach(el => el.addEventListener('click', () => {
      Modal.close();
      setTimeout(() => openFreightSettlement(el.dataset.settleFleet), 100);
    }));
    document.querySelectorAll('[data-remove-fleet]').forEach(el => el.addEventListener('click', () => {
      const id = el.dataset.removeFleet;
      const f = FleetService.findById(id);
      Confirm.open({
        title: isZh?'删除车队?':'Delete fleet?',
        message: (isZh?'将删除车队 ':'Will delete ') + `"${f.name}"` + (isZh?' ,该队下的车辆会保留但解除关联':', vehicles will be unlinked'),
        type: 'danger',
        onConfirm: () => {
          try { FleetService.remove(id); renderFleetList(); Toast.success(isZh?'已删除':'Deleted'); }
          catch(e) { Toast.error(e.message); }
        }
      });
    }));
  }

  function openFleetEditor(fleetId, onCreated) {
    const isZh = I18n.get() === 'zh-CN';
    const f = fleetId ? FleetService.findById(fleetId) : null;
    Modal.open({
      title: fleetId ? (isZh?'编辑车队':'Edit Fleet') : (isZh?'新增车队':'New Fleet'),
      width: 540,
      content: `
        <div style="display:grid; gap:14px;">
          <div>
            <label class="form-label">${isZh?'车队名称':'Name'} <span style="color:var(--red);">*</span></label>
            <input id="fe-name" class="input w-full" placeholder="${isZh?'如 深圳顺达':'e.g. Shenzhen Express'}" value="${f?.name || ''}">
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
            <div>
              <label class="form-label">${isZh?'联系人':'Contact'}</label>
              <input id="fe-contact" class="input w-full" value="${f?.contactName || ''}">
            </div>
            <div>
              <label class="form-label">${isZh?'联系电话':'Phone'}</label>
              <input id="fe-phone" class="input w-full" value="${f?.contactPhone || ''}">
            </div>
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
            <div>
              <label class="form-label">${isZh?'结算方式':'Settlement Mode'} <span style="color:var(--red);">*</span></label>
              <select id="fe-mode" class="select w-full">
                <option value="monthly"  ${f?.settlementMode==='monthly' || !f?'selected':''}>${isZh?'月结(每月统一对账)':'Monthly'}</option>
                <option value="daily"    ${f?.settlementMode==='daily'?'selected':''}>${isZh?'日结(每日完成)':'Daily'}</option>
                <option value="per_trip" ${f?.settlementMode==='per_trip'?'selected':''}>${isZh?'趟次结(每趟立结)':'Per-trip'}</option>
                <option value="manual"   ${f?.settlementMode==='manual'?'selected':''}>${isZh?'手动(免运费/自有)':'Manual'}</option>
              </select>
            </div>
            <div>
              <label class="form-label">${isZh?'付款账期 (天)':'Payment Days'}</label>
              <input id="fe-days" class="input w-full" type="number" min="0" value="${f?.paymentDays ?? 30}">
            </div>
          </div>
          <div>
            <label class="form-label">${isZh?'默认每车运费':'Default Unit Price'}</label>
            <div style="position:relative;">
              <span style="position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--text-3);">$</span>
              <input id="fe-price" class="input w-full" type="number" step="0.01" min="0"
                value="${f?.defaultUnitPrice ? (f.defaultUnitPrice/100).toFixed(2) : '0'}" style="padding-left:24px;">
            </div>
            <div class="text-muted" style="font-size:11px; margin-top:4px;">${isZh?'每辆车的默认运费可单独覆盖':'Vehicle default freight overrides this'}</div>
          </div>
          <div>
            <label class="form-label">${isZh?'备注':'Remark'}</label>
            <textarea id="fe-remark" class="input w-full" rows="2">${f?.remark || ''}</textarea>
          </div>
        </div>
      `,
      buttons: [
        { label: isZh?'取消':'Cancel' },
        { label: fleetId ? (isZh?'保存':'Save') : (isZh?'创建':'Create'), primary: true, onClick: () => {
          const data = {
            name: document.getElementById('fe-name').value.trim(),
            contactName: document.getElementById('fe-contact').value.trim(),
            contactPhone: document.getElementById('fe-phone').value.trim(),
            settlementMode: document.getElementById('fe-mode').value,
            paymentDays: Number(document.getElementById('fe-days').value) || 0,
            defaultUnitPrice: Math.round(parseFloat(document.getElementById('fe-price').value || '0') * 100),
            remark: document.getElementById('fe-remark').value.trim(),
          };
          try {
            let result;
            if (fleetId) result = FleetService.update(fleetId, data, Session.current()?.id);
            else result = FleetService.create(data, Session.current()?.id);
            Toast.success(isZh?'已保存':'Saved');
            if (typeof onCreated === 'function') onCreated(result);
            // 如果上层 Modal 还在,刷新它
            if (document.getElementById('fleet-list')) renderFleetList();
          } catch (e) {
            Toast.error(e.message);
            return false;
          }
        }},
      ],
    });
  }

  // =================== 运费结算 ===================

  function openFreightSettlement(presetFleetId) {
    const isZh = I18n.get() === 'zh-CN';
    const fleets = FleetService.list({ status: 'active' });
    if (fleets.length === 0) {
      Toast.warning(isZh?'还没有车队':'No fleets yet');
      return;
    }

    Modal.open({
      title: `${Icon.briefcase(14)} ${isZh?'运费结算':'Freight Settlement'}`,
      width: 980,
      content: `
        <div style="display:flex; gap:12px; align-items:flex-end; margin-bottom:16px; padding-bottom:12px; border-bottom:1px solid var(--border-1);">
          <div style="flex:1;">
            <label class="text-muted" style="font-size:11px;">${isZh?'选择车队':'Fleet'}</label>
            <select id="fs-fleet" class="select w-full" style="margin-top:4px;">
              ${fleets.map(f => {
                const modeLabel = { monthly: isZh?'月结':'Monthly', daily: isZh?'日结':'Daily', per_trip: isZh?'趟次':'Per-trip', manual: isZh?'手动':'Manual' }[f.settlementMode];
                return `<option value="${f.id}" ${presetFleetId===f.id?'selected':''}>${f.name} · ${modeLabel}</option>`;
              }).join('')}
            </select>
          </div>
          <div>
            <label class="text-muted" style="font-size:11px;">${isZh?'起':'From'}</label>
            <input type="date" id="fs-from" class="input" style="margin-top:4px;">
          </div>
          <div>
            <label class="text-muted" style="font-size:11px;">${isZh?'止':'To'}</label>
            <input type="date" id="fs-to" class="input" style="margin-top:4px;">
          </div>
          <button class="btn btn-secondary btn-sm" id="fs-refresh">${isZh?'刷新':'Refresh'}</button>
        </div>
        <div id="fs-summary" style="display:flex; gap:12px; margin-bottom:14px;"></div>
        <div id="fs-trips"></div>
        <div style="display:flex; justify-content:space-between; margin-top:14px; padding-top:12px; border-top:1px solid var(--border-1);">
          <div>
            <label style="display:flex; align-items:center; gap:6px; font-size:12px; cursor:pointer;">
              <input type="checkbox" id="fs-select-all"> <span>${isZh?'全选未付车次':'Select all unpaid'}</span>
            </label>
          </div>
          <button class="btn btn-primary btn-sm" id="fs-mark-paid">${Icon.check(13)} ${isZh?'标记选中车次为已付':'Mark selected as paid'}</button>
        </div>
      `,
      buttons: [{ label: isZh?'关闭':'Close', primary: true }],
    });

    renderFreightSettlement();
    document.getElementById('fs-fleet').addEventListener('change', renderFreightSettlement);
    document.getElementById('fs-refresh').addEventListener('click', renderFreightSettlement);
    document.getElementById('fs-from').addEventListener('change', renderFreightSettlement);
    document.getElementById('fs-to').addEventListener('change', renderFreightSettlement);
    document.getElementById('fs-select-all').addEventListener('change', e => {
      document.querySelectorAll('.fs-trip-cb:not(:disabled)').forEach(cb => cb.checked = e.target.checked);
    });
    document.getElementById('fs-mark-paid').addEventListener('click', () => {
      const fleetId = document.getElementById('fs-fleet').value;
      const ids = Array.from(document.querySelectorAll('.fs-trip-cb:checked')).map(cb => cb.dataset.id);
      if (ids.length === 0) { Toast.warning(isZh?'请勾选车次':'Select trips first'); return; }
      try {
        const result = FleetService.markFreightPaid(fleetId, ids, Session.current()?.id);
        Toast.success((isZh?'已标记 ':'Marked ') + result.count + (isZh?' 个车次为已付,共 ':' trips paid, total ') + Utils.formatMoney(result.total));
        renderFreightSettlement();
      } catch (e) { Toast.error(e.message); }
    });
  }

  function renderFreightSettlement() {
    const isZh = I18n.get() === 'zh-CN';
    const fleetId = document.getElementById('fs-fleet').value;
    const dateFrom = document.getElementById('fs-from').value || null;
    const dateTo = document.getElementById('fs-to').value || null;
    const f = FleetService.findById(fleetId);
    if (!f) return;

    const { trips, totalFreight } = FleetService.getTripsInPeriod(fleetId, { dateFrom, dateTo });
    const paid = trips.filter(t => t.freightPaid);
    const unpaid = trips.filter(t => !t.freightPaid);
    const paidAmount = paid.reduce((s, d) => s + (d.freight || 0), 0);
    const unpaidAmount = unpaid.reduce((s, d) => s + (d.freight || 0), 0);

    document.getElementById('fs-summary').innerHTML = `
      <div class="ov-card" style="flex:1;">
        <div class="label">${isZh?'总车次':'Total Trips'}</div>
        <div class="value">${trips.length}</div>
        <div class="sub">${isZh?'本期已签收':'Signed in period'}</div>
      </div>
      <div class="ov-card" style="flex:1;">
        <div class="label">${isZh?'总运费':'Total Freight'}</div>
        <div class="value">${Utils.formatMoney(totalFreight)}</div>
      </div>
      <div class="ov-card paid" style="flex:1;">
        <div class="label">${isZh?'已付':'Paid'}</div>
        <div class="value text-emerald">${Utils.formatMoney(paidAmount)}</div>
        <div class="sub">${paid.length} ${isZh?'笔':'trips'}</div>
      </div>
      <div class="ov-card" style="flex:1;">
        <div class="label">${isZh?'未付':'Unpaid'}</div>
        <div class="value text-amber">${Utils.formatMoney(unpaidAmount)}</div>
        <div class="sub">${unpaid.length} ${isZh?'笔':'trips'}</div>
      </div>
    `;

    if (trips.length === 0) {
      document.getElementById('fs-trips').innerHTML = `
        <div style="text-align:center; padding:40px; color:var(--text-3); border:1px dashed var(--border-1); border-radius:6px;">
          ${isZh?'该期间内无已签收车次':'No signed trips in this period'}
        </div>`;
      return;
    }

    document.getElementById('fs-trips').innerHTML = `
      <table style="width:100%; border-collapse:collapse; font-size:12px;">
        <thead>
          <tr style="border-bottom:1px solid var(--border-1); color:var(--text-3);">
            <th style="width:30px; padding:8px 4px;"></th>
            <th style="text-align:left; padding:8px 10px;">DN</th>
            <th style="text-align:left; padding:8px 10px;">${isZh?'车牌/司机':'Truck/Driver'}</th>
            <th style="text-align:left; padding:8px 10px;">${isZh?'订单/客户':'Order/Customer'}</th>
            <th style="text-align:left; padding:8px 10px;">${isZh?'签收日':'Signed'}</th>
            <th style="text-align:right; padding:8px 10px;">${isZh?'运费':'Freight'}</th>
            <th style="text-align:center; padding:8px 10px;">${isZh?'状态':'Status'}</th>
          </tr>
        </thead>
        <tbody>
          ${trips.map(d => {
            const vehicle = d.vehicleId ? VehicleRepo.find(d.vehicleId) : null;
            const order = d.salesOrderId ? SalesOrderRepo.find(d.salesOrderId) : null;
            const cust = order ? CustomerRepo.find(order.customerId) : null;
            return `
              <tr style="border-bottom:1px solid var(--border-1);">
                <td style="padding:8px 4px;">
                  ${d.freightPaid
                    ? `<input type="checkbox" disabled class="fs-trip-cb" data-id="${d.id}">`
                    : `<input type="checkbox" class="fs-trip-cb" data-id="${d.id}">`}
                </td>
                <td style="padding:8px 10px;" class="font-mono">${d.no}</td>
                <td style="padding:8px 10px;">
                  <div class="font-mono">${vehicle?.plateNo || d.truckNo || '-'}</div>
                  <div class="text-muted" style="font-size:10px;">${vehicle?.driverName || d.driverName || '-'}</div>
                </td>
                <td style="padding:8px 10px;">
                  <div class="font-mono">${order?.no || '-'}</div>
                  <div class="text-muted" style="font-size:10px;">${cust?.name || '-'}</div>
                </td>
                <td style="padding:8px 10px;" class="font-mono">${(d.signedAt || d.deliveryDate || '').slice(0, 10)}</td>
                <td style="padding:8px 10px; text-align:right;" class="font-mono">${Utils.formatMoney(d.freight || 0)}</td>
                <td style="padding:8px 10px; text-align:center;">
                  ${d.freightPaid
                    ? `<span style="padding:2px 6px; font-size:10px; border-radius:3px; background:var(--emerald-bg); color:var(--emerald);">${isZh?'已付':'Paid'}</span>`
                    : `<span style="padding:2px 6px; font-size:10px; border-radius:3px; background:var(--amber-bg); color:var(--amber);">${isZh?'未付':'Unpaid'}</span>`}
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }

  return { init, openVehicleManager, openFleetManager, openFreightSettlement };
})();

window.LogisticsModule = LogisticsModule;
