/**
 * FleetService - 车队管理
 *
 * 车队 = 一组车辆 + 一个结算策略
 *
 * 结算方式:
 *   - monthly:   月结(每月底统一对账,按当月所有车次累计运费)
 *   - daily:     日结(每日完成的车次当天/隔日结算)
 *   - per_trip:  趟次结(每趟完成立刻可结)
 *   - manual:    手动结算(不自动触发)
 *
 * 数据结构:
 * {
 *   id, no, name, contactName, contactPhone, address,
 *   settlementMode: 'monthly'|'daily'|'per_trip'|'manual',
 *   paymentDays: number,    // 月结/日结后多少天付清
 *   defaultUnitPrice: 0,    // 默认每车运费(元cents),可被车辆覆盖
 *   status: 'active'|'disabled',
 *   remark, createdAt, updatedAt, createdBy
 * }
 */

const FleetService = (function () {
  'use strict';

  function list(query = {}) {
    if (query.status) return DB.find('fleets', query);
    return DB.find('fleets');
  }
  function findById(id) { return FleetRepo.find(id); }

  function create(data, operatorId) {
    if (!data.name) throw new Error('车队名称必填');
    const dup = DB.find('fleets').find(f => f.name === data.name && f.status !== 'disabled');
    if (dup) throw new Error(`车队名称 "${data.name}" 已存在`);
    const no = `FL-${String(DB.find('fleets').length + 1).padStart(3, '0')}`;
    const inserted = FleetRepo.create({
      no,
      name: data.name,
      contactName: data.contactName || '',
      contactPhone: data.contactPhone || '',
      address: data.address || '',
      settlementMode: data.settlementMode || 'monthly',
      paymentDays: Number(data.paymentDays) || 30,
      defaultUnitPrice: Number(data.defaultUnitPrice) || 0,
      status: 'active',
      remark: data.remark || '',
      createdBy: operatorId || 'system',
    });
    EventBus.emit('fleet.created', inserted);
    return inserted;
  }

  function update(id, patch, operatorId) {
    const f = findById(id);
    if (!f) throw new Error('车队不存在');
    if (patch.name && patch.name !== f.name) {
      const dup = DB.find('fleets').find(x => x.name === patch.name && x.id !== id && x.status !== 'disabled');
      if (dup) throw new Error(`车队名称 "${patch.name}" 已存在`);
    }
    const updated = FleetRepo.update(id, patch);
    EventBus.emit('fleet.updated', updated);
    return updated;
  }

  function disable(id) {
    return FleetRepo.update(id, { status: 'disabled' });
  }
  function enable(id) {
    return FleetRepo.update(id, { status: 'active' });
  }
  function remove(id) {
    // 软删除:把车队下车辆解绑
    DB.find('vehicles', { fleetId: id }).forEach(v => {
      VehicleRepo.update(v.id, { fleetId: null });
    });
    return FleetRepo.remove(id);
  }

  /**
   * 取车队某周期内所有已签收的车次 + 总运费
   * @param {string} fleetId
   * @param {object} period { dateFrom, dateTo }
   */
  function getTripsInPeriod(fleetId, period = {}) {
    const vehicles = DB.find('vehicles', { fleetId });
    if (vehicles.length === 0) return { trips: [], totalFreight: 0 };
    const vehicleIds = new Set(vehicles.map(v => v.id));
    const dateFrom = period.dateFrom;
    const dateTo = period.dateTo;
    const allDeliveries = DB.find('deliveries');
    const trips = allDeliveries.filter(d => {
      if (!vehicleIds.has(d.vehicleId)) return false;
      if (d.transportStatus !== 'signed') return false;
      const dt = d.signedAt || d.deliveryDate;
      if (dateFrom && dt < dateFrom) return false;
      if (dateTo && dt > dateTo) return false;
      return true;
    });
    const totalFreight = trips.reduce((s, d) => s + (d.freight || 0), 0);
    return { trips, totalFreight };
  }

  /**
   * 计算该车队待结算金额(根据 settlementMode 取相应周期内未结清的车次)
   */
  function getOutstanding(fleetId) {
    const f = findById(fleetId);
    if (!f) return null;
    const vehicles = DB.find('vehicles', { fleetId });
    const vehicleIds = new Set(vehicles.map(v => v.id));
    const allDeliveries = DB.find('deliveries').filter(d =>
      vehicleIds.has(d.vehicleId) && d.transportStatus === 'signed' && !d.freightPaid
    );
    const totalUnpaid = allDeliveries.reduce((s, d) => s + (d.freight || 0), 0);
    return {
      tripCount: allDeliveries.length,
      totalUnpaid,
      settlementMode: f.settlementMode,
    };
  }

  /**
   * 标记车队某些车次的运费为已付
   */
  function markFreightPaid(fleetId, deliveryIds, operatorId) {
    const f = findById(fleetId);
    if (!f) throw new Error('车队不存在');
    let total = 0;
    deliveryIds.forEach(id => {
      const d = DeliveryRepo.find(id);
      if (d && !d.freightPaid) {
        DeliveryRepo.update(id, {
          freightPaid: true,
          freightPaidAt: Utils.now(),
          freightPaidBy: operatorId || 'system',
        });
        total += d.freight || 0;
      }
    });
    EventBus.emit('fleet.freightPaid', { fleetId, deliveryIds, total });
    return { total, count: deliveryIds.length };
  }

  return {
    list, findById, create, update, disable, enable, remove,
    getTripsInPeriod, getOutstanding, markFreightPaid,
  };
})();

window.FleetService = FleetService;
