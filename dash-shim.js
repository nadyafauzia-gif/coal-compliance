/*
 * dash-shim.js — runtime ringan pengganti API `dash` milik Claude Artifact,
 * supaya dashboard bisa berjalan mandiri di GitHub Pages / web server statis.
 *
 * - Memuat semua dataset dari folder data/*.json
 * - Menyediakan dash.data, dash.calc, dash.onData, dash.params, dash.setParams, dash.setLink
 * - Menyimpan pilihan profil (tahap, karakteristik, tanggal mulai) di localStorage browser
 * - Menyediakan window.persistMap: Map yang otomatis tersimpan di localStorage
 *   (dipakai untuk status izin, centang dokumen, dan durasi yang diubah)
 */
(function () {
  'use strict';

  var DATASETS = ['izin', 'relasi', 'sanksi', 'eskalasi', 'kalender', 'syarat_rkab',
    'regulasi', 'tahap', 'kondisi', 'dokumen_rkab', 'aspek_rkab'];
  var DEFAULT_PARAMS = { tahap: 'T5', kondisi: [], mulai: null };
  var LS_PREFIX = 'cx-compliance:';

  var store = {}, failed = {}, calcs = {}, callbacks = [];

  function lsGet(key, fallback) {
    try { var v = localStorage.getItem(LS_PREFIX + key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  }
  function lsSet(key, value) {
    try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(value)); } catch (e) { /* storage tidak tersedia */ }
  }

  var params = Object.assign({}, DEFAULT_PARAMS, lsGet('params', {}));

  function fire() {
    callbacks.forEach(function (fn) {
      try { fn(); } catch (e) { console.error('[dashboard]', e); }
    });
  }

  window.dash = {
    colors: ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)', 'var(--c7)', 'var(--c8)'],
    data: function (id) {
      if (store[id]) return { status: 'ok', data: store[id], meta: [] };
      if (failed[id]) return { status: 'error', data: [], message: failed[id], meta: [] };
      var c = calcs[id];
      if (c) {
        if (c.inputs.some(function (i) { return failed[i]; })) return { status: 'error', data: [], meta: [] };
        if (c.inputs.every(function (i) { return store[i]; })) {
          return { status: 'ok', data: c.fn.apply(null, c.inputs.map(function (i) { return store[i]; })), meta: [] };
        }
      }
      return { status: 'loading', data: [], meta: [] };
    },
    calc: function (id, def) { calcs[id] = def; },
    loader: function () {},
    onData: function (fn) { callbacks.push(fn); fn(); },
    params: function () { return params; },
    setParams: function (p) { params = Object.assign({}, params, p); lsSet('params', params); fire(); },
    resetParams: function () { params = Object.assign({}, DEFAULT_PARAMS); lsSet('params', params); fire(); },
    setLink: function (name) { try { history.replaceState(null, '', '#' + name); } catch (e) { /* abaikan */ } },
    refresh: function () {},
  };

  // Map yang tersimpan otomatis di localStorage
  window.persistMap = function (key) {
    var m = new Map(lsGet('map:' + key, []));
    var save = function () { lsSet('map:' + key, Array.from(m.entries())); };
    var set = m.set.bind(m), del = m.delete.bind(m), clr = m.clear.bind(m);
    m.set = function (k, v) { set(k, v); save(); return m; };
    m.delete = function (k) { var r = del(k); save(); return r; };
    m.clear = function () { clr(); save(); };
    return m;
  };

  // Hapus semua status tersimpan (dipanggil dari tombol di footer)
  window.cxResetSaved = function () {
    try {
      Object.keys(localStorage).filter(function (k) { return k.indexOf(LS_PREFIX) === 0; })
        .forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) { /* abaikan */ }
    location.reload();
  };

  Promise.all(DATASETS.map(function (id) {
    return fetch('data/' + id + '.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) { store[id] = d; })
      .catch(function (e) { failed[id] = String(e); console.error('[dashboard] gagal memuat data/' + id + '.json', e); });
  })).then(fire);

  var t;
  window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(fire, 150); });
})();
