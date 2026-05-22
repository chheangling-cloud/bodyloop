/**
 * 模拟数据库 - localStorage 封装
 * @module core/db
 *
 * 设计目标:
 * 1. API 形态模仿后端 ORM(Prisma/TypeORM),便于未来重构成 REST API
 * 2. 每张表 = 一个 localStorage key,存 JSON 数组
 * 3. 所有写操作自动加 createdAt / updatedAt
 * 4. 软删除:status=deleted,不真正移除
 * 5. 单据号生成由 db_meta.sequences 维护
 *
 * 表名约定:全部小写驼峰 + 复数,例如 customers / salesOrders
 *
 * 未来重构时,只需将本文件替换为 fetch API 实现,业务代码无需改动。
 */

const DB = (function () {
  'use strict';

  const PREFIX = 'wood_erp_';
  const META_KEY = PREFIX + 'meta';

  // ========== 内部:读写 localStorage ==========

  function _key(table) {
    return PREFIX + table;
  }

  function _read(table) {
    return Storage.getData(_key(table)) || [];
  }

  function _write(table, records) {
    return Storage.setData(_key(table), records);
  }

  function _readMeta() {
    return Storage.getData(META_KEY) || { version: '1.0', sequences: {}, lastResetAt: null };
  }

  function _writeMeta(meta) {
    return Storage.setData(META_KEY, meta);
  }

  // ========== 公共 API ==========

  /**
   * 查询表中所有记录(默认排除 status=deleted)
   * @param {string} table
   * @param {object} query 过滤条件 { field: value } 或 { field: { $in: [...] } }
   * @param {object} options { includeDeleted, sortBy, order: 'asc'|'desc' }
   * @returns {Array}
   */
  function find(table, query = {}, options = {}) {
    let records = _read(table);

    // 默认排除软删除
    if (!options.includeDeleted) {
      records = records.filter(r => r.status !== 'deleted');
    }

    // 应用查询条件
    if (query && Object.keys(query).length > 0) {
      records = records.filter(r => _matches(r, query));
    }

    // 排序
    if (options.sortBy) {
      const order = options.order === 'desc' ? -1 : 1;
      records.sort((a, b) => {
        const va = a[options.sortBy];
        const vb = b[options.sortBy];
        if (va < vb) return -1 * order;
        if (va > vb) return 1 * order;
        return 0;
      });
    }

    return records;
  }

  /** 判断记录是否匹配查询条件 */
  function _matches(record, query) {
    for (const key in query) {
      const condition = query[key];
      const value = record[key];
      if (typeof condition === 'object' && condition !== null) {
        if (condition.$in && !condition.$in.includes(value)) return false;
        if (condition.$ne && value === condition.$ne) return false;
        if (condition.$gt && !(value > condition.$gt)) return false;
        if (condition.$lt && !(value < condition.$lt)) return false;
        if (condition.$gte && !(value >= condition.$gte)) return false;
        if (condition.$lte && !(value <= condition.$lte)) return false;
      } else {
        if (value !== condition) return false;
      }
    }
    return true;
  }

  /** 按 ID 查询 */
  function findById(table, id) {
    const records = _read(table);
    return records.find(r => r.id === id) || null;
  }

  /** 查询单条(找到第一个匹配的) */
  function findOne(table, query) {
    const results = find(table, query);
    return results[0] || null;
  }

  /** 统计数量 */
  function count(table, query = {}) {
    return find(table, query).length;
  }

  /**
   * 插入记录(自动生成 id、createdAt、updatedAt)
   * @param {string} table
   * @param {object} record
   * @returns {object} 已插入的完整记录
   */
  function insert(table, record) {
    const records = _read(table);
    const newRecord = {
      id: record.id || Utils.uuid(),
      ...record,
      createdAt: record.createdAt || Utils.now(),
      updatedAt: Utils.now(),
    };
    records.push(newRecord);
    _write(table, records);
    return newRecord;
  }

  /**
   * 批量插入
   * @param {string} table
   * @param {Array} list
   */
  function insertMany(table, list) {
    const records = _read(table);
    const now = Utils.now();
    const inserted = list.map(record => ({
      id: record.id || Utils.uuid(),
      ...record,
      createdAt: record.createdAt || now,
      updatedAt: now,
    }));
    records.push(...inserted);
    _write(table, records);
    return inserted;
  }

  /**
   * 更新记录(部分字段)
   * @param {string} table
   * @param {string} id
   * @param {object} patch 要更新的字段
   * @returns {object|null} 更新后的记录
   */
  function update(table, id, patch) {
    const records = _read(table);
    const idx = records.findIndex(r => r.id === id);
    if (idx === -1) return null;
    records[idx] = {
      ...records[idx],
      ...patch,
      id: records[idx].id, // 保护 ID
      createdAt: records[idx].createdAt, // 保护创建时间
      updatedAt: Utils.now(),
    };
    _write(table, records);
    return records[idx];
  }

  /** 软删除 */
  function remove(table, id) {
    return update(table, id, { status: 'deleted' });
  }

  /** 硬删除(谨慎使用) */
  function hardDelete(table, id) {
    const records = _read(table);
    const filtered = records.filter(r => r.id !== id);
    _write(table, filtered);
    return records.length !== filtered.length;
  }

  /** 整表覆盖(用于 seed) */
  function replaceAll(table, records) {
    _write(table, records);
  }

  /** 清空一张表 */
  function clearTable(table) {
    _write(table, []);
  }

  /** 清空所有数据 */
  function reset() {
    const keys = Storage.keysWithPrefix(PREFIX);
    keys.forEach(k => Storage.removeData(k));
    _writeMeta({ version: '1.0', sequences: {}, lastResetAt: Utils.now() });
  }

  /** 导出全部数据为 JSON */
  function exportAll() {
    const data = { meta: _readMeta(), tables: {} };
    const keys = Storage.keysWithPrefix(PREFIX);
    keys.forEach(k => {
      if (k === META_KEY) return;
      const table = k.replace(PREFIX, '');
      data.tables[table] = _read(table);
    });
    return data;
  }

  /** 导入数据 */
  function importAll(data) {
    if (!data || !data.tables) return false;
    reset();
    Object.keys(data.tables).forEach(table => {
      _write(table, data.tables[table]);
    });
    if (data.meta) _writeMeta(data.meta);
    return true;
  }

  // ========== 单据号生成 ==========

  /**
   * 生成单据号
   * @param {string} prefix 前缀,如 "SO"
   * @returns {string} 例: SO-20260516-001
   */
  function nextSequence(prefix) {
    const meta = _readMeta();
    if (!meta.sequences) meta.sequences = {};

    const dateStr = Utils.today().replace(/-/g, ''); // YYYYMMDD
    const seqKey = `${prefix}-${dateStr}`;

    meta.sequences[seqKey] = (meta.sequences[seqKey] || 0) + 1;
    _writeMeta(meta);

    const seq = String(meta.sequences[seqKey]).padStart(3, '0');
    return `${prefix}-${dateStr}-${seq}`;
  }

  /** 元数据访问 */
  function getMeta() {
    return _readMeta();
  }

  function setMeta(meta) {
    _writeMeta(meta);
  }

  /** 数据库是否已初始化(有 seed 数据) */
  function isInitialized() {
    return _read('customers').length > 0;
  }

  return {
    find,
    findById,
    findOne,
    count,
    insert,
    insertMany,
    update,
    remove,
    hardDelete,
    replaceAll,
    clearTable,
    reset,
    exportAll,
    importAll,
    nextSequence,
    getMeta,
    setMeta,
    isInitialized,
  };
})();

window.DB = DB;
