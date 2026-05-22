/**
 * VehicleService - 车辆主数据管理
 * @module services/vehicleService
 *
 * 车辆 = 长期合作的运输工具(自有或外包司机)
 *
 * Schema:
 *   id, no(自动生成 V-001), plateNo(粤B-12345), truckType(微型/中型/大型/集装箱),
 *   driverName, driverPhone, capacity(载重 kg/件数),
 *   ownerType(self=自有 / contracted=长期合作 / temp=临时),
 *   status(active/disabled),
 *   defaultFreight(默认运费 cents),
 *   remark, createdAt, updatedAt
 */

const VehicleService = (function () {
  'use strict';
  const TABLE = 'vehicles';

  function list(query = {}) {
    return VehicleRepo.list(query).filter(v => v.status !== 'deleted');
  }

  function findById(id) {
    return VehicleRepo.find(id);
  }

  function findByPlate(plateNo) {
    return VehicleRepo.list().find(v => v.plateNo === plateNo);
  }

  function create(data, operatorId) {
    if (!data.plateNo) throw new Error('车牌号必填');
    if (findByPlate(data.plateNo)) throw new Error(`车牌 ${data.plateNo} 已存在`);

    // 自动生成编号 V-001
    const existing = VehicleRepo.list().filter(v => v.no?.startsWith('V-'));
    const maxN = existing.reduce((m, v) => Math.max(m, parseInt(v.no.split('-')[1]) || 0), 0);
    const no = `V-${String(maxN + 1).padStart(3, '0')}`;

    const v = VehicleRepo.create({
      no,
      plateNo: data.plateNo.trim(),
      truckType: data.truckType || 'medium',
      driverName: (data.driverName || '').trim(),
      driverPhone: (data.driverPhone || '').trim(),
      capacity: data.capacity || '',
      ownerType: data.ownerType || 'contracted',
      defaultFreight: data.defaultFreight || 0,
      status: 'active',
      remark: data.remark || '',
      createdBy: operatorId,
    });
    EventBus.emit('vehicle.created', { id: v.id });
    return v;
  }

  function update(id, patch, operatorId) {
    if (patch.plateNo) {
      const dup = findByPlate(patch.plateNo);
      if (dup && dup.id !== id) throw new Error(`车牌 ${patch.plateNo} 已存在`);
    }
    const v = VehicleRepo.update(id, { ...patch, updatedBy: operatorId });
    EventBus.emit('vehicle.updated', { id });
    return v;
  }

  function disable(id, operatorId) {
    return update(id, { status: 'disabled' }, operatorId);
  }

  function enable(id, operatorId) {
    return update(id, { status: 'active' }, operatorId);
  }

  function remove(id, operatorId) {
    // 检查是否被引用
    const refs = DeliveryRepo.list().filter(d => d.vehicleId === id && d.transportStatus !== 'signed');
    if (refs.length > 0) throw new Error(`该车辆在 ${refs.length} 个未完成车次中,不能删除`);
    VehicleRepo.update(id, { status: 'deleted', deletedBy: operatorId });
    EventBus.emit('vehicle.deleted', { id });
  }

  /** 该车辆历史使用次数 + 累计运费 */
  function getStats(id) {
    const deliveries = DeliveryRepo.list().filter(d => d.vehicleId === id);
    const totalTrips = deliveries.length;
    const totalFreight = deliveries.reduce((s, d) => s + (d.freight || 0), 0);
    const unpaidFreight = deliveries
      .filter(d => !d.freightPaid)
      .reduce((s, d) => s + (d.freight || 0), 0);
    return { totalTrips, totalFreight, unpaidFreight };
  }

  return { list, findById, findByPlate, create, update, disable, enable, remove, getStats };
})();

window.VehicleService = VehicleService;
