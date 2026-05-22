/**
 * RoleTaskCount - 统计每个角色待处理任务数(用于侧栏徽章)
 * @module services/roleTaskCount
 */

const RoleTaskCount = (function () {
  'use strict';

  /**
   * 返回各角色的待处理任务数
   * @returns {{ sales:number, warehouse:number, finance:number }}
   */
  function getCounts() {
    const tasks = OrderTaskRepo.list().filter(t => t.status === 'pending');
    const counts = { sales: 0, warehouse: 0, finance: 0 };
    tasks.forEach(t => {
      const role = t.assignedRole;
      if (counts[role] !== undefined) counts[role]++;
    });
    // 销售特殊:补 草稿数 + 被驳回数(销售的虚拟分组)
    const cur = Session.current();
    const myDrafts = SalesOrderRepo.list().filter(o =>
      o.status === 'draft' && o.createdBy === cur?.id
    ).length;
    counts.sales += myDrafts;  // 草稿也算销售自己的待办
    return counts;
  }

  /**
   * 获取单个角色的计数
   */
  function getCount(role) {
    return getCounts()[role] || 0;
  }

  return { getCounts, getCount };
})();

window.RoleTaskCount = RoleTaskCount;
