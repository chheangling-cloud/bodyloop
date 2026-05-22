/**
 * Storage - 持久化存储抽象层
 * @module core/storage
 *
 * 单机:走 localStorage
 * 云端:Repo 改用 API 时,这层会被替换成"用户偏好走 cookie/server,数据走 API"
 *
 * 设计意图:让业务代码不再直接调 localStorage,集中到这一层。
 * 未来上云时只改这一个文件。
 */

const Storage = (function () {
  'use strict';

  // ====== Data Storage(数据存储,大块业务数据) ======
  // 单机:localStorage 5-10MB
  // 云端:API GET/PUT/POST
  function getData(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn('[Storage] getData failed', key, e);
      return null;
    }
  }

  function setData(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('[Storage] setData failed', key, e);
      return false;
    }
  }

  function removeData(key) {
    localStorage.removeItem(key);
  }

  // 按前缀枚举(用于 DB.reset)
  function keysWithPrefix(prefix) {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) keys.push(k);
    }
    return keys;
  }

  // ====== User Preferences(用户偏好,小块设置) ======
  // 单机:localStorage
  // 云端:服务器存,但有本地缓存
  function getPref(key, defaultValue = null) {
    const v = localStorage.getItem(key);
    if (v === null) return defaultValue;
    try { return JSON.parse(v); } catch { return v; }
  }

  function setPref(key, value) {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  }

  function removePref(key) {
    localStorage.removeItem(key);
  }

  // ====== Session(会话凭据) ======
  // 单机:localStorage
  // 云端:HTTP-only cookie + JWT
  function getSession() {
    return getPref('senda_session');
  }

  function setSession(session) {
    setPref('senda_session', session);
  }

  function clearSession() {
    removePref('senda_session');
  }

  return {
    // 数据
    getData, setData, removeData, keysWithPrefix,
    // 偏好
    getPref, setPref, removePref,
    // 会话
    getSession, setSession, clearSession,
  };
})();

window.Storage = Storage;
