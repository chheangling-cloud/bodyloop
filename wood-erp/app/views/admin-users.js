/**
 * View: 用户与权限管理(动态前端配置)
 *
 * 三个 Tab:
 *   1. 用户列表 — 增删改查员工 + 调岗位
 *   2. 角色矩阵 — 9 种角色的权限对比
 *   3. 当前会话 — 切换角色调试
 */

window.View_admin_users = (function () {
  let activeTab = 'users';

  function init(ctx) {
    const isZh = I18n.get() === 'zh-CN';
    document.getElementById('app-content').innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">${isZh ? '用户与权限' : 'Users & Permissions'}</h1>
          <div class="page-subtitle">${isZh ? '管理员工账号、岗位与权限矩阵' : 'Manage employees, roles and permissions'}</div>
        </div>
        <div class="flex gap-2">
          <button class="btn btn-secondary btn-sm" id="btn-export-users">${typeof _exportIcon !== 'undefined' ? _exportIcon() : ''} ${isZh?'导出 Excel':'Export'}</button>
          <button class="btn btn-primary btn-sm" id="btn-new-user">+ ${isZh ? '新增用户' : 'New User'}</button>
        </div>
      </div>

      <div class="order-tabs" id="adm-tabs"></div>
      <div id="adm-content"></div>
    `;

    renderTabs();
    renderContent();

    document.getElementById('btn-new-user').addEventListener('click', () => openEditor(null));
    document.getElementById('btn-export-users').addEventListener('click', exportUsers);
  }

  function renderTabs() {
    const isZh = I18n.get() === 'zh-CN';
    const tabs = [
      { key: 'users',  label: isZh?'员工列表':'Employees' },
      { key: 'matrix', label: isZh?'权限矩阵':'Permission Matrix' },
      { key: 'switch', label: isZh?'切换登录身份':'Switch Identity' },
    ];
    document.getElementById('adm-tabs').innerHTML = tabs.map(t => `
      <a class="order-tab ${activeTab===t.key?'active':''}" data-tab="${t.key}">${t.label}</a>
    `).join('');
    document.querySelectorAll('[data-tab]').forEach(el => {
      el.addEventListener('click', () => { activeTab = el.dataset.tab; renderTabs(); renderContent(); });
    });
  }

  function renderContent() {
    if (activeTab === 'users')  renderUserList();
    if (activeTab === 'matrix') renderMatrix();
    if (activeTab === 'switch') renderSwitch();
  }

  // ============== Tab 1: 员工列表 ==============
  function renderUserList() {
    const isZh = I18n.get() === 'zh-CN';
    const employees = EmployeeRepo.list().filter(e => e.status !== 'deleted');
    const roleInfo = (key) => Perm.getRoleInfo(key) || { label: key, color: 'var(--text-3)' };

    document.getElementById('adm-content').innerHTML = `
      <div style="background:var(--bg-2); border:1px solid var(--border-1); border-radius:8px; overflow:hidden;">
        <table style="width:100%; border-collapse:collapse; font-size:13px;">
          <thead>
            <tr style="background:var(--bg-3); color:var(--text-3); font-size:11px; text-transform:uppercase;">
              <th style="text-align:left; padding:10px 14px;">${isZh?'编号':'Code'}</th>
              <th style="text-align:left; padding:10px 14px;">${isZh?'姓名':'Name'}</th>
              <th style="text-align:left; padding:10px 14px;">${isZh?'岗位':'Role'}</th>
              <th style="text-align:left; padding:10px 14px;">${isZh?'部门':'Department'}</th>
              <th style="text-align:left; padding:10px 14px;">${isZh?'电话':'Phone'}</th>
              <th style="text-align:center; padding:10px 14px;">${isZh?'状态':'Status'}</th>
              <th style="text-align:right; padding:10px 14px; width:140px;">${isZh?'操作':'Actions'}</th>
            </tr>
          </thead>
          <tbody>
            ${employees.map(e => {
              const r = roleInfo(e.role);
              return `
                <tr style="border-top:1px solid var(--border-1);" data-eid="${e.id}">
                  <td style="padding:10px 14px;" class="font-mono text-muted">${e.code || e.id}</td>
                  <td style="padding:10px 14px;" class="text-strong">${e.name}</td>
                  <td style="padding:10px 14px;">
                    <span style="padding:3px 8px; border-radius:4px; font-size:11px; background:${r.color}1A; color:${r.color};">
                      ${r.label}
                    </span>
                  </td>
                  <td style="padding:10px 14px;">${e.department || '-'}</td>
                  <td style="padding:10px 14px;" class="font-mono" style="font-size:11px;">${e.phone || '-'}</td>
                  <td style="padding:10px 14px; text-align:center;">
                    ${e.status === 'active'
                      ? `<span style="padding:2px 8px; font-size:11px; border-radius:3px; background:var(--emerald-bg); color:var(--emerald);">${isZh?'在职':'Active'}</span>`
                      : `<span style="padding:2px 8px; font-size:11px; border-radius:3px; background:var(--bg-3); color:var(--text-3);">${isZh?'停用':'Inactive'}</span>`
                    }
                  </td>
                  <td style="padding:10px 14px; text-align:right;">
                    <button class="btn-icon" data-edit="${e.id}" title="${isZh?'编辑':'Edit'}" style="background:none; border:none; cursor:pointer; padding:4px;">${Icon.edit(13)}</button>
                    <button class="btn-icon" data-toggle="${e.id}" title="${e.status === 'active' ? (isZh?'停用':'Disable') : (isZh?'启用':'Enable')}" style="background:none; border:none; cursor:pointer; padding:4px; color:${e.status === 'active' ? 'var(--amber)' : 'var(--emerald)'};">${e.status === 'active' ? Icon.x(13) : '↻'}</button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    document.querySelectorAll('[data-edit]').forEach(el => el.addEventListener('click', () => openEditor(el.dataset.edit)));
    document.querySelectorAll('[data-toggle]').forEach(el => el.addEventListener('click', () => toggleEmployee(el.dataset.toggle)));
  }

  function toggleEmployee(id) {
    const e = EmployeeRepo.find(id);
    if (!e) return;
    const newStatus = e.status === 'active' ? 'inactive' : 'active';
    EmployeeRepo.update(id, { status: newStatus });
    Toast.success(newStatus === 'active' ? '已启用' : '已停用');
    renderUserList();
  }

  function openEditor(empId) {
    const isZh = I18n.get() === 'zh-CN';
    const e = empId ? EmployeeRepo.find(empId) : null;
    const roles = Perm.listRoles(false);
    Modal.open({
      title: empId ? (isZh?'编辑用户':'Edit User') : (isZh?'新增用户':'New User'),
      width: 560,
      content: `
        <div style="display:grid; gap:14px;">
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
            <div>
              <label class="form-label">${isZh?'姓名':'Name'} <span style="color:var(--red);">*</span></label>
              <input id="eu-name" class="input w-full" value="${e?.name || ''}" placeholder="${isZh?'如:王志强':'e.g. John'}">
            </div>
            <div>
              <label class="form-label">${isZh?'编号':'Code'}</label>
              <input id="eu-code" class="input w-full" value="${e?.code || ''}" ${e ? 'disabled' : ''} placeholder="${isZh?'留空自动生成':'Auto-gen'}">
            </div>
          </div>
          <div>
            <label class="form-label">${isZh?'岗位':'Role'} <span style="color:var(--red);">*</span></label>
            <select id="eu-role" class="select w-full">
              ${['sales', 'warehouse', 'finance', 'mgmt'].map(g => {
                const groupRoles = roles.filter(r => r.group === g);
                if (groupRoles.length === 0) return '';
                const groupLabel = { sales: '销售', warehouse: '仓储', finance: '财务', mgmt: '管理层' }[g];
                return `
                  <optgroup label="${groupLabel}">
                    ${groupRoles.map(r => `<option value="${r.key}" ${e?.role===r.key?'selected':''}>${r.label}</option>`).join('')}
                  </optgroup>
                `;
              }).join('')}
            </select>
            <div class="text-muted" style="font-size:11px; margin-top:4px;" id="eu-role-hint"></div>
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
            <div>
              <label class="form-label">${isZh?'部门':'Department'}</label>
              <input id="eu-dept" class="input w-full" value="${e?.department || ''}">
            </div>
            <div>
              <label class="form-label">${isZh?'电话':'Phone'}</label>
              <input id="eu-phone" class="input w-full" value="${e?.phone || ''}">
            </div>
          </div>
        </div>
      `,
      onOpen: () => {
        const sel = document.getElementById('eu-role');
        const hint = document.getElementById('eu-role-hint');
        const updateHint = () => {
          const r = Perm.getRoleInfo(sel.value);
          hint.textContent = r ? r.hint : '';
        };
        sel.addEventListener('change', updateHint);
        updateHint();
      },
      buttons: [
        { label: isZh?'取消':'Cancel' },
        { label: empId ? (isZh?'保存':'Save') : (isZh?'创建':'Create'), primary: true, onClick: () => {
          const name = document.getElementById('eu-name').value.trim();
          if (!name) { Toast.warning('请输入姓名'); return false; }
          const data = {
            name,
            role: document.getElementById('eu-role').value,
            department: document.getElementById('eu-dept').value.trim(),
            phone: document.getElementById('eu-phone').value.trim(),
          };
          if (empId) {
            EmployeeRepo.update(empId, data);
            Toast.success('已保存');
          } else {
            // 生成 code
            const code = (document.getElementById('eu-code').value.trim() || 'emp_' + Utils.uuid().slice(0, 6));
            EmployeeRepo.create({
              ...data,
              id: 'emp_' + Utils.uuid().slice(0, 8),
              code,
              status: 'active',
              createdAt: Utils.now(),
            });
            Toast.success('已创建');
          }
          renderUserList();
        }},
      ],
    });
  }

  function exportUsers() {
    const employees = EmployeeRepo.list().filter(e => e.status !== 'deleted');
    const rows = employees.map(e => {
      const r = Perm.getRoleInfo(e.role) || { label: e.role };
      return {
        code: e.code || e.id,
        name: e.name,
        role: r.label,
        department: e.department || '',
        phone: e.phone || '',
        status: e.status === 'active' ? '在职' : '停用',
      };
    });
    ExcelExporter.exportSheet('员工档案_' + Utils.today(), '员工档案', [
      { key: 'code', label: '编号', width: 14 },
      { key: 'name', label: '姓名', width: 12 },
      { key: 'role', label: '岗位', width: 14 },
      { key: 'department', label: '部门', width: 14 },
      { key: 'phone', label: '电话', width: 14 },
      { key: 'status', label: '状态', width: 8 },
    ], rows);
  }

  // ============== Tab 2: 权限矩阵(可编辑) ==============
  function renderMatrix() {
    const isZh = I18n.get() === 'zh-CN';
    const roles = Perm.listRoles(false);
    const actions = Perm.listAllActions();
    const canEdit = Perm.canEditPermissions();

    // 分组 actions
    const groups = {
      '客户管理': actions.filter(a => a.startsWith('customer') || a.startsWith('credit')),
      '订单流程': actions.filter(a => a.startsWith('order')),
      '发货物流': actions.filter(a => a.startsWith('delivery') || a.startsWith('vehicle') || a.startsWith('fleet')),
      '仓储管理': actions.filter(a => a.startsWith('inventory') || a.startsWith('warehouse') || a.startsWith('product')),
      '财务结算': actions.filter(a => a.startsWith('finance') || a.startsWith('payment') || a.startsWith('settlement')),
    };

    const actionLabel = (a) => ({
      customerView:'查看客户', customerCreate:'新增客户', customerEdit:'编辑客户',
      customerCreditEdit:'调整信用额度', customerPaymentDaysEdit:'调整账期',
      customerFreeze:'冻结客户', customerDelete:'删除客户',
      customerArchive:'归档客户', customerRestore:'恢复客户',
      orderView:'查看订单', orderCreate:'新建订单', orderEdit:'修改订单', orderEditPrice:'改价',
      orderApprove:'审批订单', orderReject:'驳回订单',
      orderForceShip:'强制发货', orderLock:'锁定订单',
      orderArchive:'归档订单', orderRestore:'恢复订单', orderViewArchived:'看归档订单',
      deliveryView:'查看发货', deliveryCreate:'创建发货',
      vehicleManage:'车辆管理', fleetManage:'车队管理',
      inventoryView:'查看库存', inventoryEdit:'编辑库存',
      inventoryInbound:'入库', inventoryOutbound:'出库', inventoryStockTake:'盘点',
      warehouseManage:'仓库管理', productPriceEdit:'改产品价',
      financeView:'查看财务', paymentRegister:'登记收款',
      settlementCreate:'创建结算', settlementConfirm:'确认结算',
      settlementView:'看结算', settlementCancel:'撤销结算',
      creditView:'看信用', creditAdjust:'调整信用',
    })[a] || a;

    const cellIcon = (allowed, isOverride) => {
      const dot = isOverride ? '<span style="position:absolute; top:2px; right:4px; width:5px; height:5px; border-radius:50%; background:var(--amber);" title="已修改"></span>' : '';
      if (allowed === true || allowed === '*') {
        return `<span style="position:relative; display:inline-block; padding:2px 8px;">${dot}<span style="color:var(--emerald); font-weight:600; font-size:14px;">●</span></span>`;
      }
      if (allowed === false || allowed === undefined) {
        return `<span style="position:relative; display:inline-block; padding:2px 8px;">${dot}<span style="color:var(--text-5); font-size:14px;">○</span></span>`;
      }
      // 条件性
      return `<span style="position:relative; display:inline-block; padding:2px 8px;">${dot}<span style="color:var(--amber); font-size:12px;" title="${allowed}">◐</span></span>`;
    };

    let html = `
      <div style="margin-bottom:14px; display:flex; gap:12px; align-items:center; flex-wrap:wrap; padding:12px 14px; background:var(--bg-2); border:1px solid var(--border-1); border-radius:6px; font-size:12px; color:var(--text-2);">
        <strong>${isZh?'图例':'Legend'}:</strong>
        <span style="color:var(--emerald);">● ${isZh?'允许':'Allowed'}</span>
        <span style="color:var(--text-5);">○ ${isZh?'禁止':'Denied'}</span>
        <span style="color:var(--amber);">◐ ${isZh?'条件性':'Conditional'}</span>
        <span style="color:var(--amber);">● ${isZh?'(右上小点 = 已自定义)':'(dot = customized)'}</span>
        <span style="flex:1;"></span>
        ${canEdit
          ? `<span style="color:var(--blue); font-size:11px;">${isZh?'💡 点击单元格切换权限':'💡 Click cell to toggle'}</span>
             <button class="btn btn-secondary btn-sm" id="btn-reset-perms">${isZh?'重置全部':'Reset All'}</button>`
          : `<span style="color:var(--text-4); font-size:11px;">${isZh?'当前角色无编辑权限,仅查看':'Read-only for your role'}</span>`
        }
      </div>
      <div style="background:var(--bg-2); border:1px solid var(--border-1); border-radius:8px; overflow:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:12px;">
          <thead>
            <tr style="background:var(--bg-3); color:var(--text-3); position:sticky; top:0; z-index:1;">
              <th style="text-align:left; padding:10px 12px; min-width:180px;">${isZh?'权限':'Action'}</th>
              ${roles.map(r => `<th style="text-align:center; padding:10px 8px; min-width:80px;">
                <div style="font-size:10px; color:${r.color}; font-weight:600;">${r.label}</div>
              </th>`).join('')}
            </tr>
          </thead>
          <tbody>
    `;

    Object.entries(groups).forEach(([groupName, groupActions]) => {
      if (groupActions.length === 0) return;
      html += `
        <tr style="background:var(--bg-3);">
          <td colspan="${roles.length + 1}" style="padding:8px 12px; font-size:11px; color:var(--text-3); font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">${groupName}</td>
        </tr>
      `;
      groupActions.forEach(a => {
        html += `
          <tr style="border-top:1px solid var(--border-1);">
            <td style="padding:8px 12px;">${actionLabel(a)}</td>
            ${roles.map(r => {
              const val = Perm.getActionPermission(r.key, a);
              const overrides = Perm.getOverrides(r.key);
              const isOverride = overrides.hasOwnProperty(a);
              const editable = canEdit;
              const clickAttrs = editable
                ? `data-toggle-perm="1" data-role="${r.key}" data-action="${a}" style="text-align:center; padding:6px; cursor:pointer;"`
                : `style="text-align:center; padding:6px;"`;
              return `<td ${clickAttrs}>${cellIcon(val, isOverride)}</td>`;
            }).join('')}
          </tr>
        `;
      });
    });

    html += `
          </tbody>
        </table>
      </div>
    `;
    document.getElementById('adm-content').innerHTML = html;

    if (canEdit) {
      // 单击 cell → 切换 / 右键 → 重置该 cell
      document.querySelectorAll('[data-toggle-perm]').forEach(td => {
        td.addEventListener('click', (e) => {
          const role = td.dataset.role;
          const action = td.dataset.action;
          const cur = Perm.getActionPermission(role, action);
          // 切换:true → false → undefined(继承默认)
          // 但如果默认就是 false / undefined,只在 true/false 切换
          const defaultVal = Perm.getDefaultActionPermission(role, action);
          let next;
          if (cur === true || cur === '*') {
            next = false;
          } else {
            next = true;
          }
          // 如果新值等于 default,清除 override
          if (next === defaultVal || (next === true && defaultVal === '*')) {
            Perm.clearActionOverride(role, action);
          } else {
            Perm.setActionPermission(role, action, next);
          }
          renderMatrix();  // 重绘
        });
        // 右键 → 重置该 cell 到默认
        td.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          const role = td.dataset.role;
          const action = td.dataset.action;
          Perm.clearActionOverride(role, action);
          renderMatrix();
        });
      });
      const resetBtn = document.getElementById('btn-reset-perms');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          if (typeof Confirm !== 'undefined') {
            Confirm.open({
              title: isZh?'重置全部权限?':'Reset all permissions?',
              message: isZh?'所有自定义修改将被清除,恢复为系统默认。此操作无法撤销。':'All customizations will be cleared.',
              type: 'danger',
              onConfirm: () => {
                Perm.clearOverrides();
                Toast.success(isZh?'已重置为默认':'Reset');
                renderMatrix();
              },
            });
          } else {
            if (confirm(isZh?'重置全部权限?所有自定义修改将被清除。':'Reset all permissions?')) {
              Perm.clearOverrides();
              Toast.success(isZh?'已重置为默认':'Reset');
              renderMatrix();
            }
          }
        });
      }
    }
  }

  // ============== Tab 3: 切换身份(调试) ==============
  function renderSwitch() {
    const isZh = I18n.get() === 'zh-CN';
    const cur = Session.current();
    const employees = EmployeeRepo.list().filter(e => e.status === 'active');

    document.getElementById('adm-content').innerHTML = `
      <div style="background:var(--bg-2); border:1px solid var(--border-1); border-radius:8px; padding:20px;">
        <h3 style="margin:0 0 8px; font-size:14px; color:var(--text-1);">${isZh?'当前登录':'Currently logged in'}</h3>
        <div style="display:flex; align-items:center; gap:12px; margin-bottom:20px;">
          <div style="width:48px; height:48px; border-radius:50%; background:var(--blue-bg); color:var(--blue); display:flex; align-items:center; justify-content:center; font-size:18px; font-weight:600;">
            ${(cur?.name || '?').charAt(0)}
          </div>
          <div>
            <div class="text-strong" style="font-size:14px;">${cur?.name || '-'}</div>
            <div class="text-muted" style="font-size:12px;">
              ${(Perm.getRoleInfo(cur?.role) || {}).label || cur?.role}
              · ${cur?.department || '-'}
            </div>
          </div>
        </div>

        <div style="border-top:1px solid var(--border-1); padding-top:18px;">
          <h4 style="margin:0 0 14px; font-size:13px; color:var(--text-2);">${isZh?'切换为其他用户(调试用)':'Switch to another user (debug)'}</h4>
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:10px;">
            ${employees.map(e => {
              const r = Perm.getRoleInfo(e.role) || { label: e.role, color: 'var(--text-3)' };
              const isCurrent = e.id === cur?.id;
              return `
                <div style="padding:12px 14px; border:1px solid ${isCurrent ? 'var(--blue-border)' : 'var(--border-1)'}; border-radius:6px; cursor:${isCurrent?'default':'pointer'}; background:${isCurrent ? 'var(--blue-bg)' : 'transparent'};" ${isCurrent ? '' : `data-switch="${e.id}"`}>
                  <div style="display:flex; align-items:center; gap:10px;">
                    <div style="width:32px; height:32px; border-radius:50%; background:${r.color}1A; color:${r.color}; display:flex; align-items:center; justify-content:center; font-weight:600;">${(e.name||'?').charAt(0)}</div>
                    <div style="flex:1; min-width:0;">
                      <div class="text-strong" style="font-size:13px;">${e.name}</div>
                      <div style="font-size:10px; color:${r.color};">${r.label}</div>
                    </div>
                    ${isCurrent ? `<span style="font-size:10px; padding:2px 6px; background:var(--blue); color:white; border-radius:3px;">${isZh?'当前':'Current'}</span>` : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;
    document.querySelectorAll('[data-switch]').forEach(el => el.addEventListener('click', () => {
      Session.switchTo(el.dataset.switch);
      Toast.success('已切换');
      setTimeout(() => location.reload(), 400);
    }));
  }

  return { init };
})();
