/**
 * BaseRepo - Repository 基类
 * @module repos/baseRepo
 *
 * 设计意图:
 *   把所有 DB.* 调用收敛到 repos/ 目录,
 *   未来上云时只改这一层(把 DB.find 换成 await fetch('/api/...'))
 *
 * 用法:
 *   const CustomerRepo = BaseRepo.create('customers');
 *   CustomerRepo.list({ status: 'active' })
 *   CustomerRepo.find(id)
 *   CustomerRepo.create({ name: '...' })
 *   CustomerRepo.update(id, { name: '...' })
 *   CustomerRepo.remove(id)
 *
 * 子类(如 CustomerRepo)可以扩展业务查询方法:
 *   CustomerRepo.findByCode(code)
 *   CustomerRepo.listActive()
 */

const BaseRepo = (function () {
  'use strict';

  /**
   * 创建一个 Repo 实例
   * @param {string} table 表名
   * @returns {object} Repo API
   */
  function create(table) {
    return {
      table,

      /** 查询多条记录(支持 query / options) */
      list(query = {}, options = {}) {
        return DB.find(table, query, options);
      },

      /** 按 ID 查单条 */
      find(id) {
        return DB.findById(table, id);
      },

      /** 按字段查单条 */
      findBy(field, value) {
        return DB.find(table).find(r => r[field] === value);
      },

      /** 按字段查多条 */
      filterBy(field, value) {
        return DB.find(table).filter(r => r[field] === value);
      },

      /** 创建一条 */
      create(data) {
        return DB.insert(table, data);
      },

      /** 更新一条 */
      update(id, patch) {
        return DB.update(table, id, patch);
      },

      /** 软删除(改 status='deleted') */
      remove(id) {
        return DB.update(table, id, { status: 'deleted' });
      },

      /** 全表替换(seed 用) */
      replaceAll(records) {
        return DB.replaceAll(table, records);
      },

      /** 计数(支持 query) */
      count(query = {}) {
        return DB.find(table, query).length;
      },
    };
  }

  return { create };
})();

window.BaseRepo = BaseRepo;
