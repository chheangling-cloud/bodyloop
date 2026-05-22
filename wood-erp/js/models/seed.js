/**
 * 种子数据生成器
 * @module models/seed
 *
 * 构造演示用数据,覆盖所有典型业务场景:
 *  - 25 个客户(不同结算规则、不同风险等级)
 *  - 80+ 销售订单(状态混合)
 *  - 多组发货记录(含三车一结、跨订单合并、手动结算)
 *  - 完整的附录、变更日志、收款记录
 *
 * 设计原则:用算法批量生成,避免手写 100 条 mock。
 *           但关键场景(锁定、手动结算、跨订单合并)精确植入。
 */

const Seed = (function () {
  'use strict';

  // ===== 基础数据池(避免数据看起来千篇一律)=====
  const COMPANY_NAMES = [
    'A 公司', 'B 公司', 'C 公司', 'D 公司', 'E 公司',
  ];
  const SHORT_NAMES = ['A', 'B', 'C', 'D', 'E'];

  const CONTACTS = ['张经理', '李总', '王主任', '陈科长', '赵厂长', '刘工', '黄总', '周经理', '吴老板', '徐总'];
  const CITIES = ['东莞市', '佛山市', '广州市', '深圳市', '中山市', '惠州市', '江门市', '珠海市', '肇庆市', '清远市'];
  const STREETS = ['工业大道', '建设路', '解放南路', '人民东路', '迎宾大道', '中山北路', '兴业路', '科技园', '物流园区', '商贸城'];

  // 每个岗位层级各一名代表账号(对应 L1-L9 权限体系)
  const SALESMEN = [
    { id: 'emp_s01', name: '王志强', role: 'sales',             department: '销售部' },
  ];
  const FINANCE = [
    { id: 'emp_f01', name: '黄秀英', role: 'finance',           department: '财务部' },
  ];
  const WAREHOUSE_STAFF = [
    { id: 'emp_w01', name: '刘建华', role: 'warehouse',         department: '仓储部' },
  ];
  const MANAGERS = [
    { id: 'emp_sm01', name: '赵海峰', role: 'sales_manager',     department: '销售部' },
    { id: 'emp_wm01', name: '郑国栋', role: 'warehouse_manager', department: '仓储部' },
    { id: 'emp_fm01', name: '孙雅婷', role: 'finance_manager',   department: '财务部' },
    { id: 'emp_gm01', name: '陈志远', role: 'general_manager',   department: '管理层' },
    { id: 'emp_ceo1', name: '方明远', role: 'ceo',               department: '管理层' },
    { id: 'emp_sa01', name: '系统管理员', role: 'super_admin',   department: '信息部' },
  ];
  const ALL_EMPLOYEES = [...SALESMEN, ...FINANCE, ...WAREHOUSE_STAFF, ...MANAGERS];

  const DRIVERS = ['赵师傅', '钱师傅', '孙师傅', '李师傅', '周师傅', '吴师傅', '郑师傅', '王师傅'];

  // 物料池(木材厂典型产品)
  // ============================================================
  //  真实产品目录 (Plywood + Veneers)
  //  价格单位:分 (1 美元 = 100 分),订单金额自然落在 $20K 内
  //  category: 'plywood' (胶合板) | 'veneer' (薄板)
  // ============================================================
  const MATERIALS_POOL = [
    { code: 'P-A',  name: 'A 板',  category: 'plywood', spec: '2.44 × 1.22 × 0.012m',  unit: 'pcs', price: 2080, remark: 'A 类装饰板 — 高端' },
    { code: 'P-B',  name: 'B 板',  category: 'plywood', spec: '2.44 × 1.22 × 0.015m',  unit: 'pcs', price: 2480, remark: 'B 类装饰板 — 中高端' },
    { code: 'P-C',  name: 'C 板',  category: 'plywood', spec: '2.44 × 1.22 × 0.018m',  unit: 'pcs', price: 2880, remark: 'C 类装饰板 — 标准' },
    { code: 'P-D',  name: 'D 板',  category: 'plywood', spec: '1.830 × 0.915 × 0.015m', unit: 'pcs', price: 1850, remark: 'D 类结构板 — 经济' },
  ];

  // ===== 随机工具 =====
  const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const pick = arr => arr[rand(0, arr.length - 1)];
  const randomDate = (daysAgo) => {
    const d = new Date();
    d.setDate(d.getDate() - rand(0, daysAgo));
    return d.toISOString();
  };
  const randomDateBetween = (daysAgoStart, daysAgoEnd) => {
    const d = new Date();
    d.setDate(d.getDate() - rand(daysAgoEnd, daysAgoStart));
    return d.toISOString();
  };

  // ============================================================
  //  生成员工
  // ============================================================
  function buildEmployees() {
    return [
      ...SALESMEN.map(e => ({
        id: e.id, code: e.id.toUpperCase(), name: e.name, role: e.role,
        department: e.department || '销售部',
        phone: '139' + rand(10000000, 99999999),
        status: 'active', createdAt: '2024-01-01T08:00:00.000Z',
      })),
      ...FINANCE.map(e => ({
        id: e.id, code: e.id.toUpperCase(), name: e.name, role: e.role,
        department: e.department || '财务部',
        phone: '138' + rand(10000000, 99999999),
        status: 'active', createdAt: '2024-01-01T08:00:00.000Z',
      })),
      ...WAREHOUSE_STAFF.map(e => ({
        id: e.id, code: e.id.toUpperCase(), name: e.name, role: e.role,
        department: e.department || '仓储部',
        phone: '137' + rand(10000000, 99999999),
        status: 'active', createdAt: '2024-01-01T08:00:00.000Z',
      })),
      ...MANAGERS.map(e => ({
        id: e.id, code: e.id.toUpperCase(), name: e.name, role: e.role,
        department: e.department || '管理层',
        phone: '136' + rand(10000000, 99999999),
        status: 'active', createdAt: '2024-01-01T08:00:00.000Z',
      })),
    ];
  }

  // ============================================================
  //  生成物料
  // ============================================================
  function buildMaterials() {
    return MATERIALS_POOL.map((m, idx) => {
      // 价格策略:
      //   guidePrice = 当前 price 的 1.1 倍(指导价,默认成交价)
      //   minPrice = guidePrice × 0.92(最低价,低于触发审批)
      //   vipPrice = guidePrice × 0.95(VIP 价,预留)
      const cost = m.price;
      const guidePrice = Math.round(cost * 1.1);
      const minPrice = Math.round(guidePrice * 0.92);
      const vipPrice = Math.round(guidePrice * 0.95);
      // 描述:把 grade/color/remark 拼起来
      const descParts = [];
      if (m.grade)  descParts.push(`Grade ${m.grade}`);
      if (m.color)  descParts.push(m.color);
      if (m.remark) descParts.push(m.remark);
      return {
        id: `mat_${String(idx + 1).padStart(3, '0')}`,
        // === 标识 ===
        code: m.code,
        name: m.name,
        category: m.category,
        spec: m.spec,
        unit: m.unit,
        // === 行业属性 ===
        grade: m.grade || null,
        color: m.color || null,
        // === 兼容老字段(cost = 入库参考成本)===
        price: cost,
        // === 销售管理(产品字段)===
        status: 'active',
        guidePrice,
        minPrice,
        vipPrice,
        needApproval: true,
        // === 描述 ===
        image: '',
        description: descParts.join(' · '),
        // === 追溯 ===
        createdBy: 'emp_f01',
        createdAt: '2024-01-01T08:00:00.000Z',
        updatedBy: 'emp_f01',
        updatedAt: '2024-01-01T08:00:00.000Z',
      };
    });
  }

  // ============================================================
  //  生成客户(25 个,8 种典型场景)
  // ============================================================
  // 客户场景规划表:
  //   0-4:健康大客户(三车一结、按时收款)
  //   5-10:三车一结活跃客户(各种阶段)
  //   11-13:金额阈值触发客户
  //   14-17:部分逾期客户
  //   18-19:锁定客户(超额)
  //   20-22:手动结算客户(订单完结但不足3车)
  //   23-24:新客户(只有报价或刚下单)
  function buildCustomers() {
    const customers = [];

    // 3 种策略原型(给老客户随机分配)
    function policyTruckOnly() {
      return {
        rules: {
          truckCount:               { enabled: true,  threshold: 3 },
          daysSinceLastSettlement:  { enabled: false, threshold: 30 },
          cumulativeAmount:         { enabled: false, threshold: 5000000 },
        },
        mode: 'ANY',
      };
    }
    function policyDaysOnly() {
      return {
        rules: {
          truckCount:               { enabled: false, threshold: 3 },
          daysSinceLastSettlement:  { enabled: true,  threshold: 30 },
          cumulativeAmount:         { enabled: false, threshold: 5000000 },
        },
        mode: 'ANY',
      };
    }
    function policyMixed() {
      return {
        rules: {
          truckCount:               { enabled: true,  threshold: 3 },
          daysSinceLastSettlement:  { enabled: true,  threshold: 30 },
          cumulativeAmount:         { enabled: true,  threshold: 500000 },   // $5,000
        },
        mode: 'ANY',
      };
    }

    for (let i = 0; i < 5; i++) {
      const name = COMPANY_NAMES[i];
      const shortName = SHORT_NAMES[i];

      // 5 种场景化配置(分别对应 A/B/C/D/E 客户)
      // 单位:分,如 1500000 = $15,000
      let creditLimit, level, paymentDays, creditAction;
      if (i === 0) {        // A:健康大客户
        creditLimit = 2000000;  level = 'A'; paymentDays = 30; creditAction = 'warn_force';
      } else if (i === 1) { // B:三车一结活跃
        creditLimit = 1500000;  level = 'B'; paymentDays = 30; creditAction = 'warn_force';
      } else if (i === 2) { // C:部分逾期
        creditLimit = 1000000;  level = 'B'; paymentDays = 30; creditAction = 'warn_force';
      } else if (i === 3) { // D:锁定客户(超额)
        creditLimit = 400000;   level = 'C'; paymentDays = 30; creditAction = 'auto_lock';
      } else {              // E:新客户
        creditLimit = 800000;   level = 'C'; paymentDays = 30; creditAction = 'warn_only';
      }

      // 多样化策略分配(B 方案):约 10/8/7 拆三类
      let policy;
      const r = i % 3;
      if (r === 0)      policy = policyTruckOnly();
      else if (r === 1) policy = policyDaysOnly();
      else              policy = policyMixed();

      policy.credit = {
        limit: creditLimit,
        action: creditAction,
      };
      policy.updatedAt = Utils.now();
      policy.updatedBy = 'system';

      customers.push({
        id: `cust_${String(i + 1).padStart(3, '0')}`,
        code: `C-2025-${String(i + 1).padStart(3, '0')}`,
        name,
        shortName,
        contact: pick(CONTACTS),
        phone: '138' + rand(10000000, 99999999),
        address: `广东省${pick(CITIES)}${pick(STREETS)}${rand(1, 999)}号`,
        taxNo: '914419' + rand(100000000000, 999999999999),
        creditLimit,                 // 老字段保留(读取时优先 policy.credit.limit)
        settlementRule: { mode: 'three_truck_one_settle', truckThreshold: 3, amountThreshold: 0, triggerLogic: 'any' }, // 老字段保留兼容
        settlementPolicy: policy,    // 新字段
        paymentDays,
        shipmentLocked: false,
        lockedReason: '',
        lockedAt: null,
        totalOrderAmount: 0,
        totalDeliveredAmount: 0,
        totalSettledAmount: 0,
        totalPaidAmount: 0,
        currentDebt: 0,
        pendingDeliveryAmount: 0,
        overdueAmount: 0,
        overdueDays: 0,
        level,
        riskLevel: 'normal',
        status: 'active',
        remark: '',
        createdAt: randomDateBetween(180, 365),
        updatedAt: Utils.now(),
        createdBy: pick(SALESMEN).id,
      });
    }
    return customers;
  }

  // ============================================================
  //  生成订单 + 发货 + 结算(按场景植入)
  // ============================================================
  function buildBusinessData(customers, materials, vehicles) {
    const salesOrders = [];
    const deliveries = [];
    const settlements = [];
    const changeLogs = [];

    // 单据号计数器(同一天的递增)
    const seqCounters = {};
    function genNo(prefix, dateStr) {
      const key = `${prefix}-${dateStr}`;
      seqCounters[key] = (seqCounters[key] || 0) + 1;
      return `${prefix}-${dateStr.replace(/-/g, '')}-${String(seqCounters[key]).padStart(3, '0')}`;
    }
    function dateOf(isoStr) {
      return isoStr.slice(0, 10);
    }

    // 给每个客户生成订单数据
    customers.forEach((cust, custIdx) => {
      const orderCount = getOrderCountForCustomer(custIdx);
      const scenario = getScenarioForCustomer(custIdx);

      // (报价单功能已废弃)

      // 该客户的发货全局序号(用于三车一结)
      let customerTruckSeq = 0;
      let customerGroupNo = 0;

      // 收集该客户所有 pending 发货(用于客户级合并结算)
      const pendingDeliveriesForCustomer = [];

      for (let o = 0; o < orderCount; o++) {
        const orderScenario = pickOrderScenario(scenario, o, orderCount);
        const order = buildOneOrder(cust, materials, o, orderScenario, genNo, dateOf);

        salesOrders.push(order);

        // 根据订单场景生成发货
        const orderDeliveries = buildDeliveriesForOrder(order, orderScenario, cust, genNo, dateOf, () => {
          customerTruckSeq += 1;
          return customerTruckSeq;
        }, vehicles);

        // 给每个发货分配订单内车次号
        orderDeliveries.forEach((d, idx) => {
          d.orderTruckSequence = idx + 1;
          deliveries.push(d);
          if (d.settlementStatus === 'pending' || d.settlementStatus === 'grouped' || d.settlementStatus === 'manual_pending') {
            pendingDeliveriesForCustomer.push(d);
          }
        });

        // (附录功能已废弃,变更走 changeLog)
      }

      // === 对该客户的发货应用"三车一结"算法 ===
      // 重新扫描该客户所有发货,按时间顺序分组
      const custDeliveries = deliveries
        .filter(d => d.customerId === cust.id)
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

      // 按场景决定要不要凑组和结算
      applyThreeTruckLogic(cust, custDeliveries, salesOrders, settlements, changeLogs, scenario, genNo, dateOf);

      // 锁定/手动结算场景的特殊处理
      applyScenarioSpecifics(cust, custDeliveries, settlements, scenario, changeLogs, genNo, dateOf);
    });

    return { salesOrders, deliveries, settlements, changeLogs };
  }

  // ============================================================
  //  辅助函数
  // ============================================================
  function getScenarioForCustomer(idx) {
    // 只 5 个客户:每个不同场景以展示丰富数据
    // A=健康 / B=活跃三车一结 / C=金额触发(未付) / D=部分逾期 / E=已锁定
    if (idx === 0) return 'healthy';
    if (idx === 1) return 'active_3t';
    if (idx === 2) return 'amount_trigger';
    if (idx === 3) return 'partial_overdue';
    if (idx === 4) return 'locked';
    // 兼容旧 idx 分配(如果客户数变多)
    if (idx < 5)  return 'healthy';
    if (idx < 11) return 'active_3t';
    if (idx < 14) return 'amount_trigger';
    if (idx < 18) return 'partial_overdue';
    if (idx < 20) return 'locked';
    if (idx < 23) return 'manual_settle';
    return 'new';
  }

  function getOrderCountForCustomer(idx) {
    if (idx < 5)  return rand(5, 8);
    if (idx < 11) return rand(4, 6);
    if (idx < 14) return rand(3, 5);
    if (idx < 18) return rand(3, 5);
    if (idx < 20) return rand(2, 4);
    if (idx < 23) return rand(2, 3);
    return rand(0, 2); // 新客户
  }

  function pickOrderScenario(custScenario, orderIdx, totalOrders) {
    // 越早的订单越可能完结,越新的订单越可能在草稿/进行中
    const isOld = orderIdx < totalOrders * 0.4;
    const isMid = orderIdx >= totalOrders * 0.4 && orderIdx < totalOrders * 0.8;

    let status;
    let hasAppendix = Math.random() < 0.2;

    if (custScenario === 'new') {
      status = orderIdx === 0 ? 'confirmed' : 'draft';
    } else if (custScenario === 'locked') {
      status = isOld ? 'shipped' : 'partial_shipped';
    } else if (custScenario === 'manual_settle') {
      status = 'shipped'; // 全部发完但不足3车
    } else if (custScenario === 'partial_overdue') {
      status = isOld ? 'completed' : (isMid ? 'shipped' : 'partial_shipped');
    } else if (isOld) {
      status = Math.random() < 0.7 ? 'completed' : 'shipped';
    } else if (isMid) {
      status = pick(['shipped', 'partial_shipped', 'settling']);
    } else {
      status = pick(['draft', 'confirmed', 'preparing', 'partial_shipped']);
    }

    return { initialStatus: status, hasAppendix, custScenario };
  }

  function buildOneOrder(cust, materials, idx, scenario, genNo, dateOf) {
    const orderDate = randomDateBetween(7, 150);
    const dateStr = dateOf(orderDate);
    const no = genNo('SO', dateStr);

    const lineCount = rand(1, 3);
    const items = [];
    let subtotal = 0;
    for (let i = 0; i < lineCount; i++) {
      const mat = pick(materials);
      const qty = rand(50, 400);
      // 价格策略:30% 低于 minPrice / 30% 在 [minPrice, guidePrice) / 40% >= guidePrice
      const guide = mat.guidePrice || mat.price;
      const minP = mat.minPrice || Math.round(guide * 0.92);
      const r = Math.random();
      let unitPrice;
      if (r < 0.30) {
        // 低价(异常,会标红)— 比 minPrice 低 5%-15%
        const discount = rand(5, 15) / 100;
        unitPrice = Math.max(50, Math.round(minP * (1 - discount)));
      } else if (r < 0.60) {
        // 偏低(可接受,标黄)
        unitPrice = minP + rand(0, Math.max(1, guide - minP - 1));
      } else {
        // 标准或偏高(0-10% 溢价)
        unitPrice = Math.round(guide * (1 + rand(0, 10) / 100));
      }
      const amount = qty * unitPrice;
      items.push({
        lineId: `oi_${Utils.uuid().slice(0, 8)}`,
        materialId: mat.id,
        materialName: mat.name,
        spec: mat.spec,
        unit: mat.unit,
        qty,
        originalQty: qty,
        deliveredQty: 0,
        unitPrice,
        originalUnitPrice: unitPrice,
        amount,
        remark: '',
      });
      subtotal += amount;
    }
    // 硬上限:订单 $20,000(200 万分)
    if (subtotal > 1800000) {
      const scale = 1800000 / subtotal;
      items.forEach(it => {
        it.qty = Math.max(1, Math.round(it.qty * scale));
        it.originalQty = it.qty;
        it.amount = it.qty * it.unitPrice;
      });
      subtotal = items.reduce((s, it) => s + it.amount, 0);
    }
    const taxRate = 13;
    const taxAmount = Math.round(subtotal * taxRate / 100);
    const totalAmount = subtotal + taxAmount;

    const order = {
      id: `so_${Utils.uuid().slice(0, 8)}`,
      no,
      quotationId: null,
      customerId: cust.id,
      orderDate: dateStr,
      deliveryDate: Utils.addDays(dateStr, rand(7, 30)),
      items,
      subtotal,
      taxRate,
      taxAmount,
      totalAmount,
      originalTotalAmount: totalAmount,
      appendixIds: [],
      deliveryIds: [],
      status: scenario.initialStatus,
      shippedQty: 0,
      shippedAmount: 0,
      settledAmount: 0,
      salesmanId: pick(SALESMEN).id,
      remark: '',
      createdAt: orderDate,
      updatedAt: orderDate,
      createdBy: pick(SALESMEN).id,
    };
    return order;
  }

  function buildQuotationFromOrder(order, cust, genNo, dateOf) {
    const quotDate = Utils.addDays(order.orderDate, -rand(3, 10));
    const no = genNo('Q', quotDate);
    return {
      id: `quot_${Utils.uuid().slice(0, 8)}`,
      no,
      customerId: cust.id,
      quotationDate: quotDate,
      validUntil: Utils.addDays(quotDate, 30),
      items: Utils.deepClone(order.items).map(it => {
        const { lineId, originalQty, deliveredQty, originalUnitPrice, ...rest } = it;
        return { lineId: `qi_${Utils.uuid().slice(0, 8)}`, ...rest };
      }),
      subtotal: order.subtotal,
      taxRate: order.taxRate,
      taxAmount: order.taxAmount,
      totalAmount: order.totalAmount,
      terms: '账期30天,送货上门',
      status: 'converted',
      convertedOrderId: order.id,
      salesmanId: order.salesmanId,
      createdAt: quotDate + 'T09:00:00.000Z',
      updatedAt: order.orderDate,
      createdBy: order.createdBy,
    };
  }

  /** 生成订单的发货单(根据订单 status / 场景模拟历史发货) */
  function buildDeliveriesForOrder(order, scenario, cust, genNo, dateOf, nextCustomerTruckSeq, vehicles) {
    const deliveries = [];
    // 根据订单状态决定发货车次数和发货比例
    let truckCount = 0;
    let shipRatio = 0;
    const isManualSettleScenario = scenario.custScenario === 'manual_settle';
    switch (order.status) {
      case 'draft':
      case 'confirmed':
      case 'preparing':
      case 'in_production':
        return [];
      case 'partial_shipped':
        truckCount = rand(1, 2);
        shipRatio = 0.5;
        break;
      case 'shipped':
      case 'settling':
      case 'completed':
        // manual_settle 场景:订单刻意做 1-2 车(零碎),让总车数易出现非3倍数
        truckCount = isManualSettleScenario ? rand(1, 2) : rand(1, 3);
        shipRatio = 1.0;
        break;
      case 'cancelled':
        return [];
    }

    if (truckCount === 0) return [];

    // 总发货数量(按比例)分到各车
    const truckShares = [];
    let remaining = shipRatio;
    for (let i = 0; i < truckCount; i++) {
      const share = i === truckCount - 1 ? remaining : remaining / (truckCount - i);
      truckShares.push(share);
      remaining -= share;
    }

    for (let t = 0; t < truckCount; t++) {
      const ratio = truckShares[t];
      const items = order.items.map(it => {
        const qty = Math.max(1, Math.floor(it.qty * ratio));
        return {
          lineId: `di_${Utils.uuid().slice(0, 8)}`,
          orderLineId: it.lineId,
          materialId: it.materialId,
          materialName: it.materialName,
          qty,
          unitPrice: it.unitPrice,
          amount: qty * it.unitPrice,
        };
      });
      const totalAmount = items.reduce((s, i) => s + i.amount, 0);

      // 更新订单的 deliveredQty
      items.forEach(di => {
        const orderLine = order.items.find(oi => oi.lineId === di.orderLineId);
        if (orderLine) orderLine.deliveredQty += di.qty;
      });

      const deliveryDate = Utils.addDays(order.orderDate, rand(3, 20) + t * rand(2, 5));
      const customerTruckSequence = nextCustomerTruckSeq();
      // 随机分配一辆车
      const vehicle = vehicles && vehicles.length ? pick(vehicles.filter(v => v.status === 'active')) : null;
      // 70% 已付运费,30% 未付
      const freightPaid = Math.random() < 0.7;
      const freight = vehicle?.defaultFreight || rand(40000, 150000);
      const delivery = {
        id: `del_${Utils.uuid().slice(0, 8)}`,
        no: genNo('DN', deliveryDate),
        salesOrderId: order.id,
        customerId: cust.id,
        deliveryDate,
        // 车辆关联(新)
        vehicleId: vehicle?.id || null,
        truckNo:     vehicle?.plateNo || ('粤B-' + String(rand(10000, 99999))),
        driverName:  vehicle?.driverName || pick(DRIVERS),
        driverPhone: vehicle?.driverPhone || ('139' + rand(10000000, 99999999)),
        // 运费(新)
        freight,
        freightPaid,
        freightPaidAt: freightPaid ? (deliveryDate + 'T16:00:00.000Z') : null,
        // 车次序号
        customerTruckSequence,
        orderTruckSequence: t + 1,
        items,
        totalAmount,
        settlementGroupNo: 0,
        settlementStatus: 'pending',
        settlementId: null,
        transportStatus: 'signed',
        shippedAt: deliveryDate + 'T08:00:00.000Z',
        departAt:  deliveryDate + 'T08:00:00.000Z',
        arrivedAt: deliveryDate + 'T14:30:00.000Z',
        signedAt: deliveryDate + 'T15:00:00.000Z',
        signedBy: pick(CONTACTS),
        creditCheckResult: { passed: true, debtBefore: 0, debtAfter: 0, creditLimit: cust.creditLimit, remark: '' },
        remark: '',
        createdAt: deliveryDate + 'T08:00:00.000Z',
        updatedAt: deliveryDate + 'T15:00:00.000Z',
        createdBy: order.salesmanId,
      };
      order.deliveryIds.push(delivery.id);
      deliveries.push(delivery);
    }

    // 更新订单的发货统计
    order.shippedQty = order.items.reduce((s, i) => s + i.deliveredQty, 0);
    order.shippedAmount = deliveries.reduce((s, d) => s + d.totalAmount, 0);

    return deliveries;
  }


  function applyThreeTruckLogic(cust, custDeliveries, salesOrders, settlements, changeLogs, scenario, genNo, dateOf) {
    if (custDeliveries.length === 0) return;
    if (scenario === 'new' || scenario === 'manual_settle') return; // 这两个场景特殊处理

    const rule = cust.settlementRule;
    let groupNo = 0;
    let buffer = [];
    let bufferAmount = 0;

    for (let i = 0; i < custDeliveries.length; i++) {
      const d = custDeliveries[i];
      buffer.push(d);
      bufferAmount += d.totalAmount;

      // 检查是否触发分组
      const truckTrigger = rule.truckThreshold > 0 && buffer.length >= rule.truckThreshold;
      const amountTrigger = rule.amountThreshold > 0 && bufferAmount >= rule.amountThreshold;
      const shouldGroup = rule.triggerLogic === 'any' ? (truckTrigger || amountTrigger) : (truckTrigger && amountTrigger);

      if (shouldGroup) {
        groupNo += 1;
        // 该组的发货全部 grouped
        buffer.forEach(b => {
          b.settlementGroupNo = groupNo;
          b.settlementStatus = 'grouped';
        });

        // 根据场景决定:是否生成结算单 + 结算状态
        const groupOutcome = decideGroupOutcome(scenario, groupNo, custDeliveries.length / (rule.truckThreshold || 3));
        if (groupOutcome.makeSettlement) {
          const stl = buildSettlementForGroup(cust, buffer, groupOutcome, salesOrders, genNo, dateOf);
          settlements.push(stl);
          buffer.forEach(b => {
            b.settlementStatus = 'settled';
            b.settlementId = stl.id;
          });
          // 记录 changeLog(状态变化)
          changeLogs.push({
            id: `clog_${Utils.uuid().slice(0, 8)}`,
            recordType: 'settlement',
            recordId: stl.id,
            changeCategory: 'status_change',
            sourceId: null,
            sourceType: null,
            changes: [{ field: 'status', fieldLabel: '状态', oldValue: 'pending_confirm', newValue: stl.status }],
            operatorId: pick(FINANCE).id,
            operatorName: pick(FINANCE).name,
            operatedAt: stl.confirmedAt || stl.createdAt,
            reason: '财务确认结算',
          });
        }
        buffer = [];
        bufferAmount = 0;
      }
    }

    // 剩余 buffer = 未凑齐的 pending,保持 pending 状态
  }

  function decideGroupOutcome(scenario, groupIdx, totalGroups) {
    // 返回 { makeSettlement, settlementStatus, paidRatio }
    if (scenario === 'healthy') {
      return { makeSettlement: true, settlementStatus: 'paid', paidRatio: 1 };
    }
    if (scenario === 'active_3t') {
      // 早期组已收齐,最新组待收
      if (groupIdx === 1) return { makeSettlement: true, settlementStatus: 'paid', paidRatio: 1 };
      return { makeSettlement: true, settlementStatus: 'partial_paid', paidRatio: 0.5 };
    }
    if (scenario === 'amount_trigger') {
      return { makeSettlement: true, settlementStatus: 'confirmed', paidRatio: 0 };
    }
    if (scenario === 'partial_overdue') {
      if (groupIdx === 1) return { makeSettlement: true, settlementStatus: 'overdue', paidRatio: 0 };
      return { makeSettlement: true, settlementStatus: 'confirmed', paidRatio: 0 };
    }
    if (scenario === 'locked') {
      // 已结算但全部未付款,让欠款累积超额
      return { makeSettlement: true, settlementStatus: 'confirmed', paidRatio: 0 };
    }
    return { makeSettlement: false };
  }

  function buildSettlementForGroup(cust, groupDeliveries, outcome, salesOrders, genNo, dateOf) {
    const truckCount = groupDeliveries.length;
    const deliveredAmount = groupDeliveries.reduce((s, d) => s + d.totalAmount, 0);
    const orderIds = Utils.unique(groupDeliveries.map(d => d.salesOrderId));
    const deliveryIds = groupDeliveries.map(d => d.id);

    const lastDeliveryDate = groupDeliveries.reduce((max, d) => d.deliveryDate > max ? d.deliveryDate : max, groupDeliveries[0].deliveryDate);
    const settlementDate = Utils.addDays(lastDeliveryDate, rand(1, 3));
    const dueDate = Utils.addDays(settlementDate, cust.paymentDays);
    const isOverdue = outcome.settlementStatus === 'overdue';

    const payableAmount = deliveredAmount;
    const paidAmount = Math.round(payableAmount * (outcome.paidRatio || 0));
    const unpaidAmount = payableAmount - paidAmount;

    const payments = [];
    if (paidAmount > 0) {
      payments.push({
        paymentId: `pay_${Utils.uuid().slice(0, 8)}`,
        paymentDate: Utils.addDays(settlementDate, rand(5, 25)),
        amount: paidAmount,
        method: pick(['transfer', 'transfer', 'cash', 'acceptance_bill']),
        reference: '流水号' + rand(10000000, 99999999),
        remark: '',
        operatorId: pick(FINANCE).id,
      });
    }

    let status = outcome.settlementStatus;
    if (isOverdue && Utils.today() < dueDate) status = 'confirmed'; // 没真到期就改回 confirmed

    // 多样化 triggerType:根据客户策略选条件
    let triggerType = 'auto';
    let triggerConditions = ['truckCount'];
    let triggerReasonText = '满足客户结算规则(三车一结)';
    if (cust.settlementPolicy) {
      const rules = cust.settlementPolicy.rules;
      const enabled = [];
      if (rules.truckCount.enabled)              enabled.push('truckCount');
      if (rules.daysSinceLastSettlement.enabled) enabled.push('days');
      if (rules.cumulativeAmount.enabled)        enabled.push('amount');
      if (enabled.length > 0) {
        // 简单挑一个生效条件作主因(实际生产应记录所有 met 的)
        triggerConditions = [pick(enabled)];
        const reasonMap = {
          truckCount: `满足车次条件:${rules.truckCount.threshold} 车`,
          days:       `满足时间条件:${rules.daysSinceLastSettlement.threshold} 天`,
          amount:     `满足金额条件:${Utils.formatMoney(rules.cumulativeAmount.threshold)}`,
        };
        triggerReasonText = reasonMap[triggerConditions[0]];
      }
    }

    return {
      id: `stl_${Utils.uuid().slice(0, 8)}`,
      no: genNo('STL', settlementDate),
      customerId: cust.id,
      salesOrderIds: orderIds,
      deliveryIds,
      truckCount,
      settlementDate,
      creationType: 'auto',
      triggerType,                        // 新字段
      triggerConditions,                   // 新字段
      manualReason: '',
      triggerReason: triggerReasonText,
      deliveredAmount,
      adjustment: 0,
      adjustmentReason: '',
      payableAmount,
      paidAmount,
      unpaidAmount,
      payments,
      dueDate,
      overdueDays: status === 'overdue' ? Utils.diffDays(dueDate, new Date()) : 0,
      status,
      remark: '',
      createdAt: settlementDate + 'T09:00:00.000Z',
      updatedAt: Utils.now(),
      createdBy: pick(FINANCE).id,
      confirmedAt: settlementDate + 'T10:00:00.000Z',
      confirmedBy: pick(FINANCE).id,
    };
  }

  /**
   * 应用场景特定数据:锁定客户 / 手动结算客户
   */
  function applyScenarioSpecifics(cust, custDeliveries, settlements, scenario, changeLogs, genNo, dateOf) {
    if (scenario === 'locked') {
      // 模拟"超出额度被锁定"
      cust.shipmentLocked = true;
      cust.lockedReason = `欠款总额超出信用额度`;
      cust.lockedAt = Utils.now();
      cust.riskLevel = 'locked';
      // 注意:具体的「超额」金额会在 recalculateCustomerStats 后由实际欠款决定
      changeLogs.push({
        id: `clog_${Utils.uuid().slice(0, 8)}`,
        recordType: 'customer',
        recordId: cust.id,
        changeCategory: 'credit_lock',
        sourceId: null,
        sourceType: null,
        changes: [{ field: 'shipmentLocked', fieldLabel: '发货锁定', oldValue: false, newValue: true }],
        operatorId: 'system',
        operatorName: '系统自动',
        operatedAt: Utils.now(),
        reason: '欠款总额超出信用额度,系统自动锁定发货',
      });
    }

    if (scenario === 'manual_settle') {
      // 手动结算客户:订单已完结(或大部分完结),但车次不规则,统一手动结算
      const pending = custDeliveries.filter(d => d.settlementStatus === 'pending');
      if (pending.length === 0) return;

      // 把不足 3 车的零头标记为 manual_pending
      const remainder = pending.length % 3;
      const fullGroups = Math.floor(pending.length / 3);

      // 前面凑整 3 车的部分,按正常分组结算(模拟之前已经正常结算过)
      let groupNo = 0;
      for (let g = 0; g < fullGroups; g++) {
        groupNo += 1;
        const group = pending.slice(g * 3, g * 3 + 3);
        group.forEach(d => {
          d.settlementGroupNo = groupNo;
          d.settlementStatus = 'grouped';
        });
        const outcome = { makeSettlement: true, settlementStatus: 'paid', paidRatio: 1 };
        const stl = buildSettlementForGroup(cust, group, outcome, [], genNo, dateOf);
        settlements.push(stl);
        group.forEach(d => {
          d.settlementStatus = 'settled';
          d.settlementId = stl.id;
        });
      }

      // 剩下的零头(0~2 车):走手动结算
      if (remainder > 0) {
        const tailDeliveries = pending.slice(fullGroups * 3);
        tailDeliveries.forEach(d => { d.settlementStatus = 'manual_pending'; });

        // 60% 概率已被财务手动结算
        if (Math.random() < 0.7) {
          const deliveredAmount = tailDeliveries.reduce((s, d) => s + d.totalAmount, 0);
          const lastDate = tailDeliveries.reduce((max, d) => d.deliveryDate > max ? d.deliveryDate : max, tailDeliveries[0].deliveryDate);
          const settlementDate = Utils.addDays(lastDate, rand(2, 5));
          const stl = {
            id: `stl_${Utils.uuid().slice(0, 8)}`,
            no: genNo('STL', settlementDate),
            customerId: cust.id,
            salesOrderIds: Utils.unique(tailDeliveries.map(d => d.salesOrderId)),
            deliveryIds: tailDeliveries.map(d => d.id),
            truckCount: tailDeliveries.length,
            settlementDate,
            creationType: 'manual',
            triggerType: 'forced',                 // 财务手动 = forced
            triggerConditions: ['manual'],
            manualReason: `订单已完结,剩余 ${tailDeliveries.length} 车不足三车阈值,财务手动结算`,
            triggerReason: '财务手动结算',
            deliveredAmount,
            adjustment: 0,
            adjustmentReason: '',
            payableAmount: deliveredAmount,
            paidAmount: (() => {
              const r = Math.random();
              if (r < 0.65) return deliveredAmount;        // 65% 全付
              if (r < 0.85) return Math.floor(deliveredAmount * (0.3 + Math.random() * 0.4)); // 20% 部分付
              return 0;                                     // 15% 未付
            })(),
            unpaidAmount: 0,
            payments: [],
            dueDate: Utils.addDays(settlementDate, cust.paymentDays),
            overdueDays: 0,
            status: 'confirmed',
            remark: '',
            createdAt: settlementDate + 'T14:00:00.000Z',
            updatedAt: Utils.now(),
            createdBy: pick(FINANCE).id,
            confirmedAt: settlementDate + 'T14:30:00.000Z',
            confirmedBy: pick(FINANCE).id,
          };
          stl.unpaidAmount = stl.payableAmount - stl.paidAmount;
          if (stl.paidAmount > 0) {
            stl.status = stl.paidAmount >= stl.payableAmount ? 'paid' : 'partial_paid';
            stl.payments.push({
              paymentId: `pay_${Utils.uuid().slice(0, 8)}`,
              paymentDate: Utils.addDays(settlementDate, rand(3, 15)),
              amount: stl.paidAmount,
              method: 'transfer',
              reference: '流水号' + rand(10000000, 99999999),
              remark: '',
              operatorId: stl.createdBy,
            });
          }
          tailDeliveries.forEach(d => {
            d.settlementStatus = 'settled';
            d.settlementId = stl.id;
          });
          settlements.push(stl);

          changeLogs.push({
            id: `clog_${Utils.uuid().slice(0, 8)}`,
            recordType: 'settlement',
            recordId: stl.id,
            changeCategory: 'status_change',
            sourceId: null,
            sourceType: null,
            changes: [{ field: 'creationType', fieldLabel: '创建方式', oldValue: null, newValue: 'manual' }],
            operatorId: stl.createdBy,
            operatorName: FINANCE.find(f => f.id === stl.createdBy)?.name || '财务',
            operatedAt: stl.confirmedAt,
            reason: stl.manualReason,
          });
        }
      }
    }
  }

  // ============================================================
  //  客户派生数据重算
  // ============================================================
  function recalculateCustomerStats(customers, salesOrders, deliveries, settlements) {
    customers.forEach(cust => {
      const orders = salesOrders.filter(o => o.customerId === cust.id);
      const dels = deliveries.filter(d => d.customerId === cust.id);
      const stls = settlements.filter(s => s.customerId === cust.id);

      cust.totalOrderAmount = Utils.sum(orders, 'totalAmount');
      cust.totalDeliveredAmount = Utils.sum(dels, 'totalAmount');
      cust.totalSettledAmount = Utils.sum(stls.filter(s => s.status !== 'cancelled'), 'payableAmount');
      cust.totalPaidAmount = Utils.sum(stls.filter(s => s.status !== 'cancelled'), 'paidAmount');
      cust.currentDebt = cust.totalSettledAmount - cust.totalPaidAmount;
      cust.pendingDeliveryAmount = Utils.sum(
        dels.filter(d => d.settlementStatus !== 'settled'),
        'totalAmount'
      );

      const overdueSettlements = stls.filter(s => s.status === 'overdue');
      cust.overdueAmount = Utils.sum(overdueSettlements, 'unpaidAmount');
      cust.overdueDays = overdueSettlements.reduce((max, s) => Math.max(max, s.overdueDays || 0), 0);

      // 计算风险等级
      if (cust.shipmentLocked) {
        cust.riskLevel = 'locked';
        // 更新锁定原因为具体金额
        const totalExposure = cust.currentDebt + cust.pendingDeliveryAmount;
        const overflow = totalExposure - cust.creditLimit;
        if (overflow > 0) {
          cust.lockedReason = `欠款总额 $${(totalExposure/100).toLocaleString()} 超出信用额度 $${(cust.creditLimit/100).toLocaleString()},超额 $${(overflow/100).toLocaleString()}`;
        }
      } else {
        const totalExposure = cust.currentDebt + cust.pendingDeliveryAmount;
        const usage = cust.creditLimit > 0 ? (totalExposure / cust.creditLimit) * 100 : 0;
        if (cust.overdueDays > 30 || usage > 90) cust.riskLevel = 'high';
        else if (cust.overdueDays > 0 || usage > 70) cust.riskLevel = 'attention';
        else cust.riskLevel = 'normal';
      }
    });
  }

  // ============================================================
  //  主入口:构建并写入 DB
  // ============================================================
  // 仓储数据
  // ============================================================
  function buildWarehouses() {
    return [
      { id: 'wh_main',     code: 'WH-001', name: '主仓库',     type: 'main',          status: 'active', address: '广东省东莞市厚街镇',   manager: '王仓库',  remark: '综合仓库' },
      { id: 'wh_finished', code: 'WH-002', name: '成品仓',     type: 'finished',      status: 'active', address: '广东省东莞市厚街镇',   manager: '李成品',  remark: '成品发货专用' },
      { id: 'wh_semi',     code: 'WH-003', name: '半成品仓',   type: 'semi_finished', status: 'active', address: '广东省东莞市厚街镇',   manager: '张半成',  remark: '在制品周转' },
      { id: 'wh_raw',      code: 'WH-004', name: '原料仓',     type: 'raw',           status: 'active', address: '广东省东莞市厚街镇',   manager: '赵原料',  remark: '原木 / 板坯 / 辅料' },
    ].map(w => ({ ...w, createdAt: '2025-09-01T08:00:00.000Z', updatedAt: Utils.now() }));
  }

  // ========== 车辆主数据 ==========
  function buildFleets() {
    return [
      { id: 'fl_1', no: 'FL-001', name: '深圳顺达车队', contactName: '陈队长', contactPhone: '13800000001', settlementMode: 'monthly',  paymentDays: 30, defaultUnitPrice: 80000,  status: 'active', remark: '月结·30天账期', createdAt: '2025-09-01T08:00:00.000Z', updatedAt: Utils.now() },
      { id: 'fl_2', no: 'FL-002', name: '粤东运输',     contactName: '林队长', contactPhone: '13800000002', settlementMode: 'monthly',  paymentDays: 45, defaultUnitPrice: 150000, status: 'active', remark: '大车专项·月结45天', createdAt: '2025-09-01T08:00:00.000Z', updatedAt: Utils.now() },
      { id: 'fl_3', no: 'FL-003', name: '本厂自有车',   contactName: '内部',   contactPhone: '',           settlementMode: 'manual',   paymentDays: 0,  defaultUnitPrice: 0,      status: 'active', remark: '自有车,免运费', createdAt: '2025-09-01T08:00:00.000Z', updatedAt: Utils.now() },
      { id: 'fl_4', no: 'FL-004', name: '临时趟次车',   contactName: '调度',   contactPhone: '13800000004', settlementMode: 'per_trip', paymentDays: 3,  defaultUnitPrice: 40000,  status: 'active', remark: '按趟次结·3天付', createdAt: '2025-09-01T08:00:00.000Z', updatedAt: Utils.now() },
      { id: 'fl_5', no: 'FL-005', name: '快线日结车队', contactName: '张老板', contactPhone: '13800000005', settlementMode: 'daily',    paymentDays: 1,  defaultUnitPrice: 60000,  status: 'active', remark: '日结·次日付', createdAt: '2025-09-01T08:00:00.000Z', updatedAt: Utils.now() },
    ];
  }

  function buildVehicles() {
    const data = [
      { plateNo: '粤B-51138', driverName: '王师傅', driverPhone: '13816946598', truckType: 'medium',  ownerType: 'contracted', capacity: '5 吨',  defaultFreight: 80000,  fleetId: 'fl_1' },
      { plateNo: '粤B-66490', driverName: '钱师傅', driverPhone: '13947160342', truckType: 'medium',  ownerType: 'contracted', capacity: '5 吨',  defaultFreight: 80000,  fleetId: 'fl_1' },
      { plateNo: '粤B-88606', driverName: '李师傅', driverPhone: '13996436468', truckType: 'large',   ownerType: 'contracted', capacity: '10 吨', defaultFreight: 150000, fleetId: 'fl_2' },
      { plateNo: '粤B-76850', driverName: '赵师傅', driverPhone: '13954637517', truckType: 'medium',  ownerType: 'contracted', capacity: '5 吨',  defaultFreight: 80000,  fleetId: 'fl_1' },
      { plateNo: '粤B-96530', driverName: '郑师傅', driverPhone: '13918963616', truckType: 'large',   ownerType: 'self',       capacity: '10 吨', defaultFreight: 0,      fleetId: 'fl_3' },
      { plateNo: '粤B-50234', driverName: '周师傅', driverPhone: '13936101751', truckType: 'medium',  ownerType: 'contracted', capacity: '5 吨',  defaultFreight: 60000,  fleetId: 'fl_5' },
      { plateNo: '粤B-41738', driverName: '吴师傅', driverPhone: '13952026698', truckType: 'small',   ownerType: 'temp',       capacity: '2 吨',  defaultFreight: 40000,  fleetId: 'fl_4' },
      { plateNo: '粤B-38031', driverName: '孙师傅', driverPhone: '13968501365', truckType: 'medium',  ownerType: 'contracted', capacity: '5 吨',  defaultFreight: 80000,  fleetId: 'fl_1' },
    ];
    return data.map((d, i) => ({
      id: `vh_${i + 1}`,
      no: `V-${String(i + 1).padStart(3, '0')}`,
      plateNo: d.plateNo,
      truckType: d.truckType,
      driverName: d.driverName,
      driverPhone: d.driverPhone,
      capacity: d.capacity,
      ownerType: d.ownerType,
      defaultFreight: d.defaultFreight,
      fleetId: d.fleetId,
      status: 'active',
      remark: '',
      createdAt: '2025-09-01T08:00:00.000Z',
      updatedAt: Utils.now(),
    }));
  }

  function buildInventoryAndMovements(materials, warehouses) {
    const inventory = [];
    const movements = [];
    const today = Utils.today();
    const initDate = '2025-09-01';

    // 每个物料在「主仓库」或「成品仓」铺一个初始库存(根据物料类型)
    materials.forEach((mat, idx) => {
      // 决定主放在哪个仓
      let primaryWh;
      if (mat.category === 'plywood') primaryWh = 'wh_finished';
      else if (mat.category === 'veneer') primaryWh = 'wh_semi';
      else primaryWh = 'wh_main';

      const initQty = rand(500, 3000);
      const avgCost = mat.price ? Math.round(mat.price * (0.6 + Math.random() * 0.2)) : 5000; // 成本约售价的 60-80%
      const safetyStock = Math.round(initQty * 0.15);
      const maxStock = Math.round(initQty * 3);

      inventory.push({
        id: `inv_${mat.id}_${primaryWh}`,
        materialId: mat.id,
        warehouseId: primaryWh,
        quantity: initQty,
        lockedQuantity: 0,
        avgCost,
        safetyStock,
        maxStock,
        lastInAt: initDate + 'T08:00:00.000Z',
        lastOutAt: null,
        updatedAt: initDate + 'T08:00:00.000Z',
      });

      // 初始流水(期初余额)
      movements.push({
        id: `mv_${Utils.uuid().slice(0, 8)}`,
        no: `MV-${initDate.replace(/-/g, '')}-${String(idx + 1).padStart(3, '0')}`,
        movementType: 'adjust_in',
        materialId: mat.id,
        warehouseId: primaryWh,
        quantity: initQty,
        unitCost: avgCost,
        totalCost: initQty * avgCost,
        qtyBefore: 0,
        qtyAfter: initQty,
        costBefore: 0,
        costAfter: avgCost,
        sourceType: 'initial',
        sourceId: null,
        sourceNo: '期初',
        relatedMovementId: null,
        movementDate: initDate,
        remark: '期初库存',
        createdBy: 'emp_w01',
        createdAt: initDate + 'T08:00:00.000Z',
      });

      // 给部分物料在其他仓也铺一点(模拟跨仓库存)
      if (idx % 3 === 0) {
        const otherWh = primaryWh === 'wh_main' ? 'wh_finished' : 'wh_main';
        const smallQty = rand(50, 300);
        inventory.push({
          id: `inv_${mat.id}_${otherWh}`,
          materialId: mat.id,
          warehouseId: otherWh,
          quantity: smallQty,
          lockedQuantity: 0,
          avgCost,
          safetyStock: Math.round(smallQty * 0.15),
          maxStock: smallQty * 3,
          lastInAt: initDate + 'T08:00:00.000Z',
          lastOutAt: null,
          updatedAt: initDate + 'T08:00:00.000Z',
        });
        movements.push({
          id: `mv_${Utils.uuid().slice(0, 8)}`,
          no: `MV-${initDate.replace(/-/g, '')}-${String(materials.length + idx + 1).padStart(3, '0')}`,
          movementType: 'adjust_in',
          materialId: mat.id,
          warehouseId: otherWh,
          quantity: smallQty,
          unitCost: avgCost,
          totalCost: smallQty * avgCost,
          qtyBefore: 0,
          qtyAfter: smallQty,
          costBefore: 0,
          costAfter: avgCost,
          sourceType: 'initial',
          sourceId: null,
          sourceNo: '期初',
          relatedMovementId: null,
          movementDate: initDate,
          remark: '期初库存',
          createdBy: 'emp_w01',
          createdAt: initDate + 'T08:00:00.000Z',
        });
      }
    });

    // 模拟几次最近的入库/调拨(让流水更丰富)
    for (let i = 0; i < 25; i++) {
      const mat = pick(materials);
      const wh = pick(warehouses).id;
      const date = Utils.addDays(today, -rand(1, 60));
      const inv = inventory.find(v => v.materialId === mat.id && v.warehouseId === wh);
      if (!inv) continue;

      const isIn = Math.random() > 0.4;
      const qty = rand(50, 300);
      const movType = isIn ? pick(['purchase_in', 'production_in']) : pick(['production_use', 'scrap_out']);

      const qtyBefore = inv.quantity;
      const newQty = isIn ? qtyBefore + qty : Math.max(0, qtyBefore - qty);
      let newCost = inv.avgCost;
      // unitCost 字段含义:本次流水的「单笔成本」(入库价 / 出库时的 WAC)
      let thisUnitCost = inv.avgCost;
      if (isIn) {
        const inCost = Math.round(inv.avgCost * (0.95 + Math.random() * 0.1));
        thisUnitCost = inCost;
        // WAC 加权
        newCost = qtyBefore + qty > 0
          ? Math.round((qtyBefore * inv.avgCost + qty * inCost) / (qtyBefore + qty))
          : inCost;
      } else {
        // 出库:用当前 WAC 作为出库成本
        thisUnitCost = inv.avgCost;
      }

      movements.push({
        id: `mv_${Utils.uuid().slice(0, 8)}`,
        no: `MV-${date.replace(/-/g, '')}-${String(100 + i).padStart(3, '0')}`,
        movementType: movType,
        materialId: mat.id,
        warehouseId: wh,
        quantity: qty,
        unitCost: thisUnitCost,
        totalCost: qty * thisUnitCost,
        qtyBefore,
        qtyAfter: newQty,
        costBefore: inv.avgCost,
        costAfter: newCost,
        sourceType: 'manual',
        sourceId: null,
        sourceNo: '',
        relatedMovementId: null,
        movementDate: date,
        remark: isIn ? '采购/生产入库' : '生产领用/报废',
        createdBy: 'emp_w01',
        createdAt: date + 'T10:00:00.000Z',
      });

      inv.quantity = newQty;
      inv.avgCost = newCost;
      if (isIn) inv.lastInAt = date + 'T10:00:00.000Z';
      else inv.lastOutAt = date + 'T10:00:00.000Z';
      inv.updatedAt = date + 'T10:00:00.000Z';
    }

    // 流水按日期排序
    movements.sort((a, b) => a.movementDate.localeCompare(b.movementDate));

    return { inventory, movements };
  }

  function buildStockTakings(warehouses, materials, inventory) {
    // 生成 3 张盘点单(1 张草稿,2 张已完成)
    const takings = [];
    const today = Utils.today();

    // 1. 已完成的盘点单(主仓库,1 个月前)
    const completedDate = Utils.addDays(today, -30);
    const wh1Inventory = inventory.filter(v => v.warehouseId === 'wh_main');
    if (wh1Inventory.length > 0) {
      const items = wh1Inventory.map(inv => {
        const mat = materials.find(m => m.id === inv.materialId);
        const actualQty = inv.quantity + rand(-10, 10);  // 盘点差异
        const diffQty = actualQty - inv.quantity;
        return {
          materialId: inv.materialId,
          materialName: mat?.name,
          spec: mat?.spec,
          unit: mat?.unit,
          systemQty: inv.quantity - diffQty,  // 当时的系统数量(假装是盘点前)
          actualQty,
          diffQty,
          diffCost: diffQty * inv.avgCost,
          unitCost: inv.avgCost || 0,
          remark: '',
        };
      });
      const totalDiffIn = items.filter(i => i.diffQty > 0).reduce((s, i) => s + i.diffQty, 0);
      const totalDiffOut = items.filter(i => i.diffQty < 0).reduce((s, i) => s + Math.abs(i.diffQty), 0);
      const totalDiffCost = items.reduce((s, i) => s + i.diffCost, 0);

      takings.push({
        id: `stk_${Utils.uuid().slice(0, 8)}`,
        no: `STK-${completedDate.replace(/-/g, '')}-001`,
        warehouseId: 'wh_main',
        takingDate: completedDate,
        status: 'completed',
        items,
        totalDiffIn,
        totalDiffOut,
        totalDiffCost,
        operatorId: 'emp_w01',
        completedAt: completedDate + 'T17:00:00.000Z',
        completedBy: 'emp_w01',
        remark: '月度盘点',
        createdBy: 'emp_w01',
        createdAt: completedDate + 'T09:00:00.000Z',
      });
    }

    // 2. 草稿盘点单(成品仓,最近 3 天)
    const draftDate = Utils.addDays(today, -1);
    const wh2Inventory = inventory.filter(v => v.warehouseId === 'wh_finished');
    if (wh2Inventory.length > 0) {
      const items = wh2Inventory.map(inv => {
        const mat = materials.find(m => m.id === inv.materialId);
        return {
          materialId: inv.materialId,
          materialName: mat?.name,
          spec: mat?.spec,
          unit: mat?.unit,
          systemQty: inv.quantity,
          actualQty: null,  // 草稿状态未填
          diffQty: 0,
          diffCost: 0,
          unitCost: inv.avgCost || 0,
          remark: '',
        };
      });
      takings.push({
        id: `stk_${Utils.uuid().slice(0, 8)}`,
        no: `STK-${draftDate.replace(/-/g, '')}-001`,
        warehouseId: 'wh_finished',
        takingDate: draftDate,
        status: 'draft',
        items,
        totalDiffIn: 0,
        totalDiffOut: 0,
        totalDiffCost: 0,
        operatorId: 'emp_w01',
        completedAt: null,
        completedBy: null,
        remark: '待开始',
        createdBy: 'emp_w01',
        createdAt: draftDate + 'T09:00:00.000Z',
      });
    }

    return takings;
  }

  // ============================================================
  function buildAndSeed() {
    DB.reset();

    const employees = buildEmployees();
    const materials = buildMaterials();
    const customers = buildCustomers();
    const fleets = buildFleets();        // 新增车队
    const vehicles = buildVehicles();    // 车辆主数据(含 fleetId)
    const { salesOrders, deliveries, settlements, changeLogs } =
      buildBusinessData(customers, materials, vehicles);

    // 仓储数据
    const warehouses = buildWarehouses();
    const { inventory, movements } = buildInventoryAndMovements(materials, warehouses);
    const stockTakings = buildStockTakings(warehouses, materials, inventory);

    // 重算客户统计
    recalculateCustomerStats(customers, salesOrders, deliveries, settlements);

    // ======= Workflow 字段预埋(Phase 1)=======
    if (typeof WorkflowMapper !== 'undefined') {
      salesOrders.forEach(o  => WorkflowMapper.annotate(o,  'order'));
      settlements.forEach(s  => WorkflowMapper.annotate(s,  'settlement'));
      deliveries.forEach(d   => WorkflowMapper.annotate(d,  'delivery'));
    }

    // 写入 DB
    DB.replaceAll('employees', employees);
    DB.replaceAll('materials', materials);
    DB.replaceAll('customers', customers);
    DB.replaceAll('salesOrders', salesOrders);
    DB.replaceAll('deliveries', deliveries);
    DB.replaceAll('settlements', settlements);
    DB.replaceAll('changeLogs', changeLogs);
    DB.replaceAll('warehouses', warehouses);
    DB.replaceAll('fleets', fleets);       // 新增:车队
    DB.replaceAll('vehicles', vehicles);   // 新增
    DB.replaceAll('inventory', inventory);
    DB.replaceAll('stockMovements', movements);
    DB.replaceAll('stockTakings', stockTakings);
    DB.replaceAll('transferOrders', []);
    DB.replaceAll('inbounds', []);             // ← 新建空表(入库单)
    DB.replaceAll('inventoryLocks', []);       // ← 新建空表(库存锁定)
    DB.replaceAll('creditEvents', []);         // ← 新建空表(信用事件)

    // 把所有 settlement.payments 提取到独立 payments 表
    const allPayments = [];
    settlements.forEach(s => {
      (s.payments || []).forEach(p => {
        allPayments.push({
          id: p.id || `pay_${Utils.uuid().slice(0, 8)}`,
          no: p.no || `PAY-${(p.paymentDate||'').replace(/-/g,'')}-${String(Math.floor(Math.random()*900)+100)}`,
          settlementId: s.id,
          customerId: s.customerId,
          amount: p.amount,
          paymentDate: p.paymentDate,
          method: p.method || 'bank_transfer',
          reference: p.reference || '',
          receiptUrl: p.receiptUrl || '',
          attachments: p.attachments || [],
          status: 'confirmed',
          currentStep: 'finance_collected',
          requiredRole: null,
          confirmedBy: p.confirmedBy || 'emp_f01',
          confirmedAt: p.paymentDate + 'T11:00:00.000Z',
          rejectedReason: null,
          remark: p.remark || '',
          createdBy: p.createdBy || 'emp_f01',
          createdAt: p.paymentDate + 'T10:00:00.000Z',
          updatedAt: p.paymentDate + 'T11:00:00.000Z',
        });
      });
    });
    DB.replaceAll('payments', allPayments);
    DB.replaceAll('notifications', []);
    DB.replaceAll('approvals', []);

    // ======= 造一些样本通知 + 审批(让初始页面有内容)=======
    _seedDemoNotifications(salesOrders, settlements, inventory, customers);

    // ============ 生成订单任务(OA 流转演示数据)============
    const orderTasks = _buildOrderTasks(salesOrders, materials);
    DB.replaceAll('orderTasks', orderTasks);

    console.log('[Seed] 数据已注入:');
    console.log(`  员工: ${employees.length}`);
    console.log(`  物料: ${materials.length}`);
    console.log(`  客户: ${customers.length}`);
    console.log(`  销售订单: ${salesOrders.length}`);
    console.log(`  发货单: ${deliveries.length}`);
    console.log(`  结算单: ${settlements.length}`);
    console.log(`  变更日志: ${changeLogs.length}`);
    console.log(`  仓库: ${warehouses.length}`);
    console.log(`  库存记录: ${inventory.length}`);
    console.log(`  库存流水: ${movements.length}`);
    console.log(`  盘点单: ${stockTakings.length}`);
    console.log(`  订单任务: ${orderTasks.length}`);

    return { employees, materials, customers, salesOrders, deliveries, settlements, changeLogs, warehouses, inventory, movements, stockTakings, orderTasks };
  }

  /**
   * 生成订单任务演示数据:
   *   - 随机挑 8 个订单生成各种 pending 状态
   *   - 每个订单根据 status 配对应的 task type
   */
  function _buildOrderTasks(salesOrders, materials) {
    const tasks = [];
    let seq = 1;
    const matMap = {};
    materials.forEach(m => { matMap[m.id] = m; });

    // 取前 12 个非 cancelled 订单
    const candidates = salesOrders.filter(o => o.status !== 'cancelled').slice(0, 12);

    // 把这些订单的 status 改成 OA 7 状态
    // 0-2: pending_price (有低价的)
    // 3-5: pending_warehouse  
    // 6-8: preparing
    // 9-11: shipped
    candidates.forEach((order, idx) => {
      let newStatus, taskType, assignedRole, title, priority = 'normal';
      
      // 检查是否有低价
      const hasLowPrice = (order.items || []).some(it => {
        const m = matMap[it.materialId];
        return m && m.minPrice && it.unitPrice < m.minPrice;
      });
      
      if (idx < 3 && hasLowPrice) {
        newStatus = 'pending_price';
        taskType = 'price_approve';
        assignedRole = 'finance';
        title = `订单 ${order.no} 价格审批`;
        priority = 'high';
      } else if (idx < 6) {
        newStatus = 'pending_warehouse';
        taskType = 'warehouse_prepare';
        assignedRole = 'warehouse';
        title = `订单 ${order.no} 等待备货`;
      } else if (idx < 9) {
        newStatus = 'preparing';
        taskType = 'warehouse_ship';
        assignedRole = 'warehouse';
        title = `订单 ${order.no} 等待装车`;
      } else {
        newStatus = 'shipped';
        taskType = 'settlement_create';
        assignedRole = 'finance';
        title = `订单 ${order.no} 等待创建结算`;
      }
      
      order.status = newStatus;
      
      const taskNo = `TSK-${(order.orderDate || order.createdAt || '').slice(0,10).replace(/-/g,'')}-${String(seq).padStart(4,'0')}`;
      seq++;
      
      const description = (() => {
        const cust = DB.findById('customers', order.customerId);
        return `客户:${cust?.name || ''} · 总额 ${Utils.formatMoney(order.totalAmount || 0)}`;
      })();
      
      tasks.push({
        id: `task_${Utils.uuid().slice(0, 8)}`,
        no: taskNo,
        orderId: order.id,
        type: taskType,
        status: 'pending',
        assignedRole,
        assigneeId: null,
        priority,
        title,
        description,
        metadata: {},
        createdAt: order.updatedAt || order.createdAt,
        createdBy: order.salesmanId,
        completedAt: null,
        completedBy: null,
        completedComment: null,
        rejectedAt: null,
        rejectedBy: null,
        rejectedReason: null,
      });
    });

    return tasks;
  }

  /**
   * 造 demo 通知 + 审批数据(让初始界面有内容)
   */
  function _seedDemoNotifications(salesOrders, settlements, inventory, customers) {
    const notifications = [];
    const approvals = [];
    const now = new Date();

    // 1. 造 2-3 个"财务待审"审批 + 通知
    const recentOrders = salesOrders
      .filter(o => o.status === 'draft' || o.status === 'confirmed')
      .slice(0, 2);

    recentOrders.forEach((o, idx) => {
      const ts = new Date(now.getTime() - (idx + 1) * 3600000).toISOString();
      const aprId = `apr_seed${idx}${Utils.uuid().slice(0,4)}`;
      approvals.push({
        id: aprId,
        entityType: 'salesOrder',
        entityId: o.id,
        action: 'finance_approve',
        requiredRole: 'finance',
        status: 'pending',
        requestedBy: o.salesId || 'emp_s01',
        requestedByName: '王志强',
        requestedAt: ts,
        requestReason: `订单 ${o.no} 创建,等待财务审核`,
        approvedBy: null, approvedAt: null, approveComment: null,
        rejectedBy: null, rejectedAt: null, rejectedReason: null,
        attachments: [
          { id: `att_${Utils.uuid().slice(0,8)}`, name: '客户聊天记录.png', type: 'image', size: 432000 },
        ],
      });
      notifications.push({
        id: `notif_seed${idx}${Utils.uuid().slice(0,4)}`,
        targetRole: 'finance',
        targetUserId: null,
        type: 'approval_needed',
        title: `财务审核:${o.no}`,
        description: `订单金额 ${Utils.formatMoney(o.totalAmount)} · 等待您处理`,
        entityType: 'salesOrder',
        entityId: o.id,
        link: null,
        status: 'unread',
        createdBy: o.salesId || 'emp_s01',
        createdAt: ts,
        readAt: null,
      });
    });

    // 2. 逾期结算的提醒(给财务)
    const overdueStls = settlements.filter(s => s.status === 'overdue').slice(0, 2);
    overdueStls.forEach((s, idx) => {
      const ts = new Date(now.getTime() - (idx + 5) * 86400000).toISOString();
      notifications.push({
        id: `notif_od${idx}${Utils.uuid().slice(0,4)}`,
        targetRole: 'finance',
        targetUserId: null,
        type: 'overdue_warning',
        title: `结算 ${s.no} 已逾期`,
        description: `未收 ${Utils.formatMoney(s.unpaidAmount)}`,
        entityType: 'settlement',
        entityId: s.id,
        link: null,
        status: 'unread',
        createdBy: 'system',
        createdAt: ts,
        readAt: null,
      });
    });

    // 3. 低库存(给仓储)
    const lowInvs = inventory.filter(i => {
      const av = (i.quantity || 0) - (i.lockedQuantity || 0);
      return av < (i.safetyStock || 0);
    }).slice(0, 2);
    lowInvs.forEach((i, idx) => {
      const ts = new Date(now.getTime() - (idx + 2) * 86400000).toISOString();
      notifications.push({
        id: `notif_ls${idx}${Utils.uuid().slice(0,4)}`,
        targetRole: 'warehouse',
        targetUserId: null,
        type: 'stock_low',
        title: `物料库存不足`,
        description: `物料 ${i.materialId} · 可用量低于安全库存`,
        entityType: 'inventory',
        entityId: i.id,
        link: null,
        status: 'unread',
        createdBy: 'system',
        createdAt: ts,
        readAt: null,
      });
    });

    DB.replaceAll('notifications', notifications);
    DB.replaceAll('approvals', approvals);
    console.log(`  通知: ${notifications.length}`);
    console.log(`  审批: ${approvals.length}`);
  }

  function ensureSeeded() {
    if (!DB.isInitialized()) {
      buildAndSeed();
    }
  }

  return { buildAndSeed, ensureSeeded, recalculateCustomerStats };
})();

window.Seed = Seed;
