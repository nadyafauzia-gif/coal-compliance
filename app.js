/* Compliance Perizinan Tambang Batubara — logika dashboard. Data dimuat dari data/*.json melalui dash-shim.js. */
(function () {
  'use strict';
  dash.calc('reg_status', {
    inputs: ['regulasi'],
    title: 'Regulasi per status',
    description: 'Jumlah regulasi yang dipetakan menurut statusnya.',
    fn: (regulasi) => {
      const order = ['Berlaku', 'Tidak lagi acuan', 'Dicabut', 'Transisi selesai'];
      const m = new Map();
      regulasi.forEach((r) => m.set(r.status, (m.get(r.status) || 0) + 1));
      return Array.from(m, ([status, jumlah]) => ({ status, jumlah }))
        .sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
    },
  });

  /* ---------- helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const el = (tag, attrs, ...kids) => {
    const e = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'style') e.setAttribute('style', v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().forEach((c) => { if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return e;
  };
  const SVGNS = 'http://www.w3.org/2000/svg';
  const sv = (tag, attrs) => {
    const e = document.createElementNS(SVGNS, tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v);
    return e;
  };
  const D = (id) => dash.data(id);
  const rows = (id) => (D(id).status === 'ok' && Array.isArray(D(id).data) ? D(id).data : []);
  const allOk = (...ids) => ids.every((i) => D(i).status === 'ok');
  const anyBad = (...ids) => ids.some((i) => ['error', 'connect', 'declined', 'missing'].includes(D(i).status));

  // prepare a container for a draw: returns true when data is ready
  const prep = (box, ids) => {
    box.classList.remove('cx-fail');
    if (allOk(...ids)) { box.classList.remove('dash-skeleton'); return true; }
    box.replaceChildren();
    if (anyBad(...ids)) { box.classList.remove('dash-skeleton'); box.classList.add('cx-fail'); box.textContent = 'Gagal memuat'; }
    else box.classList.add('dash-skeleton');
    return false;
  };

  const faseIdx = (f) => Math.max(0, Number(String(f).slice(1)) - 1);
  const faseColor = (f) => dash.colors[faseIdx(f) % dash.colors.length];
  const tint = (c, p) => `color-mix(in srgb, ${c} ${p}%, var(--color-panel))`;
  const fmtInt = d3.format(',');
  const fmtDenda = (m) => (m == null ? '' : m < 1 ? `Rp${fmtInt(Math.round(m * 1000))} juta` : `Rp${fmtInt(m)} miliar`);

  const STATUSES = ['Belum dicek', 'Lengkap', 'Proses', 'Belum ada', 'Tidak berlaku'];
  const state = {
    page: 'ringkasan', sel: 'I28', gsel: null,
    q: '', fase: '', sifat: '', rkab: false, all: false, tlOpen: false,
    status: window.persistMap('status'), docs: window.persistMap('docs'), dur: window.persistMap('dur'),
  };
  const stOf = (r) => state.status.get(r.id) || r.status_awal || 'Belum dicek';

  /* ---------- profile ---------- */
  const isoDay = (d) => d.toISOString().slice(0, 10);
  const todayUTC = () => { const n = new Date(); return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()); };
  const setDefaults = () => { if (!dash.params().mulai) dash.setParams({ mulai: isoDay(new Date(todayUTC())) }); };
  setDefaults();

  // kondisi param: list of chosen option ids ("grup:opsi"); flags are the union of their flags
  const condChoice = () => {
    const p = dash.params() || {};
    const chosen = new Set(Array.isArray(p.kondisi) ? p.kondisi : []);
    const opts = rows('kondisi');
    const groups = d3.groups(opts.slice().sort((x, y) => x.urut_grup - y.urut_grup || x.urut - y.urut), (o) => o.grup);
    return groups.map(([g, os]) => ({ grup: g, pertanyaan: os[0].pertanyaan, opsi: os, sel: os.find((o) => chosen.has(o.id)) || os[0] }));
  };
  const prof = () => {
    const p = dash.params() || {};
    const flags = new Set();
    condChoice().forEach((c) => String(c.sel.flags || '').split(',').filter(Boolean).forEach((f) => flags.add(f)));
    return { tahap: p.tahap || 'T5', flags, mulai: p.mulai || isoDay(new Date(todayUTC())) };
  };
  const inProfile = (r, P = prof()) => {
    if (!r || r.sifat === 'Tujuan') return false;
    if (!String(r.tahap || '').split(',').includes(P.tahap)) return false;
    if (r.sifat !== 'Kondisional') return true;
    return String(r.kondisi_key || '').split(',').some((k) => P.flags.has(k));
  };
  const isDone = (r) => ['Lengkap', 'Tidak berlaku'].includes(stOf(r));
  const tahapRow = (id) => rows('tahap').find((t) => t.id === id);
  const physical = (t) => ['T4', 'T5', 'T6'].includes(t);

  const DAY = 864e5;
  const parseDay = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : todayUTC(); };
  const wk = (t) => { const d = new Date(t).getUTCDay(); return d === 0 || d === 6; };
  const nextWork = (t) => { while (wk(t)) t += DAY; return t; };
  const addDur = (t, n, unit) => {
    if (!n) return t;
    if (unit === 'hari kerja') { let x = nextWork(t), k = n; while (k > 0) { x += DAY; if (!wk(x)) k -= 1; } return x; }
    return t + n * DAY;
  };
  const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const fmtD = (t) => { const d = new Date(t); return `${d.getUTCDate()} ${BLN[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
  const durOf = (r) => (state.dur.has(r.id) ? state.dur.get(r.id) : r.durasi);

  /* schedule: items in profile with a processing duration, sequenced by prerequisites */
  const schedule = () => {
    const P = prof(); const m = getModel();
    const t0 = nextWork(parseDay(P.mulai));
    const items = m.izin.filter((r) => inProfile(r, P) && r.durasi != null);
    const inc = new Set(items.map((r) => r.id));
    const res = new Map(); const warns = [];
    const visiting = new Set();
    const calc = (id) => {
      if (res.has(id)) return res.get(id);
      if (visiting.has(id)) return null;
      visiting.add(id);
      const r = m.byId.get(id);
      const done = isDone(r);
      let start = t0, drv = null;
      if (!done) {
        m.parents.get(id).forEach((e) => {
          if (!inc.has(e.dari)) return;
          const p = calc(e.dari);
          if (p && p.end > start) { start = p.end; drv = e.dari; }
        });
      }
      start = nextWork(start);
      const o = { r, done, start, end: done ? start : addDur(start, Number(durOf(r)) || 0, r.durasi_satuan), drv, wait: null, validFrom: null };
      // RKAB window rule (Permen ESDM 17/2025 Pasal 4)
      if (!done && (id === 'I28' || id === 'I36')) {
        const iupId = id === 'I28' ? 'I04' : 'I03';
        const iup = inc.has(iupId) && !isDone(m.byId.get(iupId)) ? calc(iupId) : null;
        if (iup) {
          const deadline = iup.end + 30 * DAY;
          if (o.start > deadline) warns.push(`${r.singkat} baru siap diajukan ${fmtD(o.start)}, melewati batas 30 hari sejak ${m.byId.get(iupId).singkat} terbit (${fmtD(deadline)}). Ajukan rencana reklamasi bersamaan dengan permohonan IUP agar persetujuan dan jaminannya tidak menunda RKAB.`);
        } else {
          const y = new Date(o.start).getUTCFullYear();
          const w0 = Date.UTC(y, 9, 1), w1 = Date.UTC(y, 10, 15);
          let s2 = o.start;
          if (o.start < w0) s2 = w0; else if (o.start > w1) s2 = Date.UTC(y + 1, 9, 1);
          if (s2 !== o.start) {
            o.wait = { from: o.start, to: s2 };
            warns.push(`${r.singkat}: syarat lengkap ${fmtD(o.start)}, tetapi pengajuan RKAB tahunan hanya dibuka 1 Okt–15 Nov, sehingga baru bisa diajukan ${fmtD(s2)}.`);
            o.start = nextWork(s2);
            o.end = addDur(o.start, Number(durOf(r)) || 0, r.durasi_satuan);
          }
          o.validFrom = Date.UTC(new Date(o.start).getUTCFullYear() + 1, 0, 1);
        }
      }
      visiting.delete(id); res.set(id, o); return o;
    };
    items.forEach((r) => calc(r.id));
    let ready = t0, last = null;
    res.forEach((o) => {
      const e = o.validFrom ? Math.max(o.end, o.validFrom) : o.end;
      if (e > ready || (e === ready && !last)) { ready = e; last = o.r.id; }
    });
    const crit = new Set(); let cur = last;
    while (cur && res.has(cur) && !res.get(cur).done) { crit.add(cur); cur = res.get(cur).drv; }
    const rkab = res.get('I28') || res.get('I36');
    if (rkab && rkab.validFrom && rkab.validFrom >= ready) warns.push(`RKAB yang disetujui berlaku untuk tahun berikutnya, sehingga kegiatan fisik baru dapat dimulai ${fmtD(rkab.validFrom)}.`);
    return { P, t0, res, ready, crit, warns, last };
  };

  /* ---------- tabs & links ---------- */
  const showPage = (page, opts = {}) => {
    state.page = page;
    $$('.cx-tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.page === page)));
    $$('.cx-page').forEach((p) => {
      const on = p.id === page;
      p.hidden = !on;
      if (on) { p.classList.remove('enter'); void p.offsetWidth; p.classList.add('enter'); }
    });
    dash.setLink(page);
    drawVisible();
    if (opts.scroll) $('.cx-tabs').scrollIntoView({ block: 'start' });
  };
  $$('.cx-tab').forEach((b) => b.addEventListener('click', () => showPage(b.dataset.page)));

  const openIzin = (id) => {
    state.sel = id;
    state.q = ''; state.fase = ''; state.sifat = ''; state.rkab = false;
    const r = getModel().byId.get(id);
    state.all = r ? !inProfile(r) : state.all;
    $('#q').value = '';
    syncFilterUi();
    drawTable(); drawDetail();
    showPage('checklist', { scroll: true });
    const tr = $(`#tb-izin tr[data-key="${id}"]`);
    if (tr) tr.scrollIntoView({ block: 'nearest' });
  };
  const openGraph = (id) => { state.gsel = id; showPage('peta', { scroll: true }); };

  /* ---------- profile UI ---------- */
  const stageSel = $('#stage');
  stageSel.addEventListener('change', () => dash.setParams({ tahap: stageSel.value }));
  const drawStages = () => {
    const desc = $('#stage-desc');
    if (!allOk('tahap', 'izin', 'kondisi')) { desc.textContent = ''; return; }
    const P = prof(); const m = getModel();
    const ts = rows('tahap').slice().sort((a, b) => a.urut - b.urut);
    stageSel.replaceChildren(...ts.map((t) => {
      const n = m.izin.filter((r) => inProfile(r, { tahap: t.id, flags: P.flags })).length;
      return el('option', { value: t.id, text: `Tahap ${t.urut} · ${t.nama} (${n} izin & dokumen)` });
    }));
    stageSel.value = P.tahap;
    const t = ts.find((x) => x.id === P.tahap) || ts[0];
    desc.replaceChildren(el('span', { 'data-source': 'tahap', 'data-field': 'deskripsi', 'data-where': `id=${t.id}`, text: t.deskripsi }), ` Target: ${t.siap}.`);
  };

  const drawConds = () => {
    const box = $('#conds');
    if (!prep(box, ['kondisi'])) return;
    const cc = condChoice();
    box.replaceChildren(...cc.map((c) => {
      const id = 'cond-' + c.grup;
      const sel = el('select', { class: 'cx-select', id }, ...c.opsi.map((o) => el('option', { value: o.id, text: o.label })));
      sel.value = c.sel.id;
      sel.addEventListener('change', () => {
        const ids = condChoice().map((x) => (x.grup === c.grup ? sel.value : x.sel.id));
        dash.setParams({ kondisi: ids });
      });
      const o = c.sel;
      const help = el('div', { class: 'h' },
        o.izin_dipicu && o.izin_dipicu !== '—' ? [el('b', { text: 'Memicu: ' }), o.izin_dipicu, '. '] : (o.flags ? '' : 'Tidak memicu izin tambahan. '),
        o.dasar_hukum ? ['Dasar: ', el('span', { 'data-source': 'kondisi', 'data-field': 'dasar_hukum', 'data-where': `id=${o.id}`, text: o.dasar_hukum }), '. '] : '',
        o.catatan || '');
      return el('div', { class: `cx-q ${o.flags ? 'on' : ''}` }, el('label', { for: id, text: c.pertanyaan }), sel, help);
    }));
    const P = prof(); const w = $('#cond-warn');
    const msgs = [];
    if (P.flags.has('konservasi')) msgs.push('Hutan konservasi tidak dapat digunakan untuk pertambangan: keluarkan area tersebut dari rencana tambang, studi kelayakan, dan peta RKAB.');
    if (P.flags.has('hl')) msgs.push('Di hutan lindung hanya pola tambang bawah tanah yang dapat diberi PPKH; rencana tambang terbuka di area itu tidak dapat disetujui.');
    w.replaceChildren(...(msgs.length ? [el('div', { class: 'cx-ready bad', style: 'margin-top:var(--cds-pad-md)' }, el('ul', { class: 'cx-warnlist' }, ...msgs.map((x) => el('li', { text: x }))))] : []));
  };

  const startIn = $('#start');
  const showStart = () => { startIn.value = prof().mulai; };
  startIn.addEventListener('change', () => { if (startIn.value && startIn.validity.valid) dash.setParams({ mulai: startIn.value }); });
  startIn.addEventListener('blur', showStart);

  /* ---------- ringkasan ---------- */
  const LVL = { Kritis: 0, Tinggi: 1, Sedang: 2 };
  const shortAncaman = (s) => (Number(s.penjara_maks_tahun) > 0
    ? `pidana penjara ≤ ${s.penjara_maks_tahun} th${s.denda_maks_miliar ? ' & denda ≤ ' + fmtDenda(Number(s.denda_maks_miliar)) : ''}`
    : String(s.ancaman).split(';')[0]);
  const sanksiOf = (r) => {
    const sm = new Map(rows('sanksi').map((s) => [s.id, s]));
    return String(r.sanksi_ids || '').split(',').map((x) => sm.get(x.trim())).filter(Boolean)
      .sort((a, b) => LVL[a.tingkat] - LVL[b.tingkat] || (b.penjara_maks_tahun || 0) - (a.penjara_maks_tahun || 0));
  };
  const condLabel = (r) => {
    const keys = String(r.kondisi_key || '').split(',');
    return condChoice().map((c) => c.sel).filter((o) => String(o.flags || '').split(',').some((f) => keys.includes(f))).map((o) => o.label).join(', ');
  };

  const statusBtn = (r) => {
    const st = stOf(r);
    const s = el('select', { class: 'cx-st', 'data-st': st, 'aria-label': 'Status ' + r.singkat }, ...STATUSES.map((x) => el('option', { value: x, text: x })));
    s.value = st;
    s.addEventListener('click', (ev) => ev.stopPropagation());
    s.addEventListener('change', () => setStatus(r.id, s.value));
    return s;
  };

  const drawSummary = () => {
    const lede = $('#sum-lede'), kp = $('#kpis');
    const ids = ['izin', 'relasi', 'sanksi', 'tahap', 'kondisi'];
    if (!prep(kp, ids)) { lede.textContent = ''; return; }
    const P = prof(); const m = getModel(); const t = tahapRow(P.tahap);
    const need = m.izin.filter((r) => inProfile(r, P));
    const wajib = need.filter((r) => r.sifat === 'Wajib');
    const kond = need.filter((r) => r.sifat === 'Kondisional');
    const done = need.filter(isDone), open = need.filter((r) => !isDone(r));
    const st = (s) => need.filter((r) => stOf(r) === s).length;
    const sc = schedule();
    const pidana = new Set(); open.forEach((r) => sanksiOf(r).forEach((s) => { if (Number(s.penjara_maks_tahun) > 0) pidana.add(s.id); }));
    const months = (sc.ready - sc.t0) / (DAY * 30.44);
    lede.replaceChildren(...['Untuk tahap ', el('b', { text: t ? t.nama.toLowerCase() : P.tahap }),
      (() => { const k = condChoice().filter((c) => c.sel.flags).length; return k ? ` dengan ${k} karakteristik kegiatan yang memicu izin kondisional` : ''; })(),
      ', perusahaan perlu ', el('b', { text: fmtInt(need.length) }), ' izin & dokumen: ',
      el('b', { text: fmtInt(wajib.length) }), ' wajib untuk semua pemegang izin dan ', el('b', { text: fmtInt(kond.length) }), ' karena karakteristik kegiatan. ',
      open.length ? ['Bila pengajuan dimulai ', el('b', { text: fmtD(sc.t0) }), ', perusahaan diperkirakan ', t ? t.siap : 'siap', ' pada ', el('b', { text: fmtD(sc.ready) }), '.'] : 'Semua izin sudah bertanda lengkap.'].flat(2).filter((x) => x !== ''));
    const tile = (lbl, val, sub, cls) => el('div', { class: 'cx-kpi' }, el('span', { class: 'lbl', text: lbl }), el('span', { class: 'val', style: cls ? `color:var(--color-${cls})` : null, text: val }), el('span', { class: 'sub', text: sub }));
    kp.replaceChildren(...[
      tile('Izin & dokumen dibutuhkan', fmtInt(need.length), `${wajib.length} wajib · ${kond.length} kondisional`),
      tile('Sudah lengkap', `${fmtInt(done.length)}/${fmtInt(need.length)}`, 'menurut status yang Anda tandai', done.length === need.length && need.length ? 'ok' : null),
      tile('Belum ada / proses', fmtInt(st('Belum ada') + st('Proses')), `${st('Belum dicek')} belum dicek`, st('Belum ada') ? 'bad' : null),
      tile('Estimasi siap', open.length ? fmtD(sc.ready) : 'Siap', open.length ? `± ${d3.format('.1f')(months).replace('.', ',')} bulan dari mulai pengajuan` : 'tidak ada izin tertunda'),
      physical(P.tahap) ? (() => { const rk = rkDocStats(); return tile('Dokumen RKAB siap', `${fmtInt(rk.ready)}/${fmtInt(rk.total)}`, 'dicentang di tab Prasyarat RKAB', rk.total && rk.ready === rk.total ? 'ok' : null); })() : null,
      tile('Risiko pidana terbuka', fmtInt(pidana.size), 'jenis pelanggaran bila izin belum ada', pidana.size ? 'bad' : 'ok')].filter(Boolean));

    // need list grouped by lapis
    const box = $('#need');
    box.classList.remove('dash-skeleton', 'cx-fail');
    const groups = d3.groups(need.slice().sort((a, b) => a.fase.localeCompare(b.fase) || a.urut - b.urut), (r) => r.fase);
    box.replaceChildren(...groups.map(([f, rs]) => el('div', { class: 'cx-need-grp' },
      el('h3', null, el('span', { class: 'cx-dot', style: `background:${faseColor(f)}` }), rs[0].fase_nama, el('span', { class: 'cnt', text: `${rs.filter(isDone).length}/${rs.length} lengkap` })),
      ...rs.map((r) => {
        const nm = el('button', { class: 'cx-link', type: 'button', text: r.nama });
        nm.addEventListener('click', () => openIzin(r.id));
        const ss = sanksiOf(r);
        const rk = isDone(r)
          ? el('div', { class: 'rk ok', text: '✓ Terpenuhi' })
          : el('div', { class: 'rk' }, 'Jika tidak ada: ', ss.length ? ss.map((s) => `${s.singkat} (${shortAncaman(s)})`).join(' · ') : r.konsekuensi);
        return el('div', { class: 'cx-need-item', 'data-key': r.id },
          statusBtn(r),
          el('div', null,
            el('div', { class: 'nm' }, nm,
              r.syarat_rkab === 'Ya' ? el('span', { class: 'cx-chip rkab', text: 'Syarat RKAB' }) : null,
              r.syarat_rkab === 'Gerbang' ? el('span', { class: 'cx-chip bad', text: 'Gerbang' }) : null,
              r.sifat === 'Kondisional' ? el('span', { class: 'cx-chip kond', text: condLabel(r) }) : null),
            el('div', { class: 'dur', text: r.durasi != null ? `${r.instansi} · ± ${fmtInt(durOf(r))} ${r.durasi_satuan} (${r.durasi_jenis.toLowerCase()})` : `${r.instansi} · kewajiban berulang` })),
          rk);
      }))));

    // risks
    const rb = $('#risk'); rb.classList.remove('dash-skeleton', 'cx-fail');
    const agg = new Map();
    open.forEach((r) => sanksiOf(r).forEach((s) => { const a = agg.get(s.id) || { s, izin: [] }; a.izin.push(r); agg.set(s.id, a); }));
    const list = Array.from(agg.values()).sort((a, b) => LVL[a.s.tingkat] - LVL[b.s.tingkat] || (b.s.penjara_maks_tahun || 0) - (a.s.penjara_maks_tahun || 0));
    rb.replaceChildren(...(list.length ? list.map(({ s, izin }) => el('div', { class: 'cx-risk-item', 'data-key': s.id },
      el('span', { class: `cx-lvl ${s.tingkat}`, text: s.tingkat }),
      el('div', null,
        el('div', { class: 'h', text: s.singkat }),
        el('div', { class: 'a', text: s.ancaman }),
        el('div', { class: 'b', text: s.dasar_hukum }),
        el('div', { class: 'cx-rel', style: 'margin-top:6px' }, ...izin.map((r) => { const b = el('button', { class: 'cx-btn', type: 'button', text: r.singkat }); b.addEventListener('click', () => openIzin(r.id)); return b; })))))
      : [el('p', { class: 'cx-ready ok', text: 'Tidak ada risiko terbuka: semua izin untuk tahap ini bertanda lengkap.' })]));

    // mini ladder
    const ml = $('#miniladder');
    if (allOk('eskalasi')) {
      const es = rows('eskalasi').slice().sort((a, b) => a.urut - b.urut);
      const main = es.filter((r) => r.jalur === 'Bertingkat'), short = es.filter((r) => r.jalur === 'Pintas');
      const val = (r) => (r.durasi_hari == null ? '' : Number(r.kali) > 1 ? ` ${r.kali} × ${r.durasi_hari} hari` : ` ≤ ${r.durasi_hari} hari`);
      ml.replaceChildren(el('div', { class: 'cx-mini-ladder' },
        el('span', { class: 'cx-muted', text: 'Sanksi administratif berjalan:' }),
        ...main.map((r, i) => [i ? el('span', { class: 'cx-muted', text: '→' }) : null, el('span', { class: `s ${i === main.length - 1 ? 'l3' : ''}`, text: r.tahap + val(r) })])),
        el('p', { class: 'cx-sec-note', text: 'Jalur pintas tanpa peringatan: ' + short.map((r) => `${r.tahap.toLowerCase()} (${r.keterangan.charAt(0).toLowerCase() + r.keterangan.slice(1, -1)})`).join('; ') + '.' }));
    }

    drawGatesSummary();
  };

  const gateItems = (excludeRkab) => {
    const m = getModel();
    return m.relasi.filter((e) => e.ke === 'GO' && e.jenis === 'gerbang' && !(excludeRkab && e.dari === 'I28'))
      .map((e) => ({ e, r: m.byId.get(e.dari) }));
  };
  const gateRow = (r, text, i) => {
    const title = el('button', { class: 'cx-link', type: 'button', text: r.nama });
    title.addEventListener('click', () => openIzin(r.id));
    return el('div', { class: 'cx-gate' },
      el('span', { class: 'cx-gate-ico', style: isDone(r) ? 'background:color-mix(in srgb,var(--color-ok) 14%,transparent);color:var(--color-ok)' : null, text: isDone(r) ? '✓' : String(i + 1) }),
      el('div', null, el('h4', null, title, el('span', { style: 'margin-left:8px' }, statusBtn(r))), el('p', { text: text })));
  };
  const drawGates = (boxSel, excludeRkab) => {
    const box = $(boxSel);
    if (!prep(box, ['izin', 'relasi'])) return;
    box.replaceChildren(...gateItems(excludeRkab).map(({ e, r }, i) => gateRow(r, e.keterangan + (r.kondisi ? ' Berlaku ' + r.kondisi.charAt(0).toLowerCase() + r.kondisi.slice(1) + '.' : ''), i)));
  };
  const drawGatesSummary = () => {
    const box = $('#gates');
    if (!prep(box, ['izin', 'relasi'])) return;
    const P = prof(); const m = getModel();
    let list;
    if (physical(P.tahap)) list = gateItems(false).filter(({ r }) => inProfile(r, P)).map(({ e, r }) => [r, e.keterangan]);
    else if (['T2', 'T3'].includes(P.tahap)) list = ['I36', 'I21', 'I22'].map((id) => m.byId.get(id)).filter((r) => r && inProfile(r, P)).map((r) => [r, r.fungsi]);
    else list = [];
    box.replaceChildren(...(list.length ? list.map(([r, t], i) => gateRow(r, t, i))
      : [el('p', { class: 'cx-muted cx-small', text: 'Tahap ini tidak memiliki gerbang kegiatan fisik tersendiri.' })]));
  };

  /* ---------- checklist progress ---------- */
  const drawProgress = () => {
    const box = $('#prog');
    if (!allOk('izin', 'relasi', 'tahap')) { box.replaceChildren(); return; }
    const P = prof(); const m = getModel(); const t = tahapRow(P.tahap);
    const items = m.izin.filter((r) => inProfile(r, P));
    const cnt = (s) => items.filter((r) => stOf(r) === s).length;
    const n = items.length || 1;
    const segs = [['Lengkap', 'var(--color-ok)'], ['Proses', 'var(--color-warn)'], ['Belum ada', 'var(--color-bad)']];
    const bar = el('div', { class: 'cx-prog-bar', role: 'img', 'aria-label': 'Kemajuan kelengkapan' },
      ...segs.map(([s, c]) => el('span', { style: `width:${(cnt(s) / n) * 100}%;background:${c}` })));
    const txt = el('div', { class: 'cx-prog-txt' },
      el('span', null, el('b', { class: 'n', text: `${cnt('Lengkap') + cnt('Tidak berlaku')}/${items.length}` }), ` lengkap untuk tahap ${t ? t.nama.toLowerCase() : ''}`),
      el('span', { text: `${cnt('Proses')} proses` }), el('span', { text: `${cnt('Belum ada')} belum ada` }), el('span', { text: `${cnt('Belum dicek')} belum dicek` }));
    const blockers = items.filter((r) => ['Belum ada', 'Proses'].includes(stOf(r)));
    let ready;
    if (blockers.length) {
      ready = el('div', { class: 'cx-ready bad' }, el('b', { text: `Belum ${t ? t.siap : 'siap'}. ` }), 'Masih kurang: ',
        ...blockers.map((r, i) => [i ? ', ' : '', (() => { const b = el('button', { class: 'cx-link', type: 'button', text: r.singkat }); b.addEventListener('click', () => { state.sel = r.id; drawTable(); drawDetail(); }); return b; })()]), '.');
    } else if (!cnt('Belum dicek') && items.length) {
      ready = el('div', { class: 'cx-ready ok' }, el('b', { text: 'Semua izin untuk tahap ini bertanda lengkap. ' }), `Perusahaan ${t ? t.siap : 'siap'}.`);
    } else {
      ready = el('div', { class: 'cx-ready' }, `${cnt('Belum dicek')} izin belum dicek. Tandai statusnya untuk melihat kesiapan tahap ini.`);
    }
    box.replaceChildren(bar, txt, ready);
  };

  /* ---------- graph model ---------- */
  let modelKey = null, model = null;
  const getModel = () => {
    const izin = rows('izin'), relasi = rows('relasi');
    const key = izin.length + ':' + relasi.length;
    if (model && modelKey === key) return model;
    const byId = new Map(izin.map((r) => [r.id, r]));
    const parents = new Map(izin.map((r) => [r.id, []]));
    const children = new Map(izin.map((r) => [r.id, []]));
    const edges = relasi.filter((e) => byId.has(e.dari) && byId.has(e.ke));
    edges.forEach((e) => { parents.get(e.ke).push(e); children.get(e.dari).push(e); });
    // longest-path layering, then pull pure sources down next to their first child
    const depth = new Map(); const visiting = new Set();
    const dep = (id) => {
      if (depth.has(id)) return depth.get(id);
      if (visiting.has(id)) return 0;
      visiting.add(id);
      const ps = parents.get(id);
      const v = ps.length ? 1 + Math.max(...ps.map((e) => dep(e.dari))) : 0;
      visiting.delete(id); depth.set(id, v); return v;
    };
    izin.forEach((r) => dep(r.id));
    for (let pass = 0; pass < 3; pass++) {
      izin.forEach((r) => {
        if (!parents.get(r.id).length && children.get(r.id).length) {
          const m = Math.min(...children.get(r.id).map((e) => depth.get(e.ke)));
          depth.set(r.id, Math.max(0, m - 1));
        }
      });
    }
    const walk = (start, dir) => {
      const seen = new Set(); const stack = [start];
      while (stack.length) {
        const id = stack.pop();
        (dir === 'up' ? parents.get(id).map((e) => e.dari) : children.get(id).map((e) => e.ke)).forEach((n) => {
          if (!seen.has(n)) { seen.add(n); stack.push(n); }
        });
      }
      return seen;
    };
    model = { izin, relasi: edges, byId, parents, children, depth, walk };
    modelKey = key;
    return model;
  };

  const drawSorotan = () => {
    const box = $('#sorotan');
    if (!prep(box, ['regulasi'])) return;
    const data = rows('regulasi').filter((r) => r.sorotan).sort((a, b) => (b.urut === 20 || b.urut === 21 ? 1 : 0) - (a.urut === 20 || a.urut === 21 ? 1 : 0) || a.urut - b.urut);
    box.replaceChildren(...data.map((r) => el('div', { class: `cx-hl-item ${r.status === 'Berlaku' ? 'new' : 'old'}` },
      el('div', { class: 't' }, el('span', { class: `cx-chip ${r.status === 'Berlaku' ? 'ok' : 'warn'}`, text: r.status }), el('span', { text: r.nomor })),
      el('p', { text: r.sorotan }))));
  };

  /* ---------- checklist ---------- */
  const faseSel = $('#f-fase');
  const syncFilterUi = () => {
    faseSel.value = state.fase;
    $('#f-sifat').value = state.sifat;
    $('#f-rkab').value = state.rkab ? 'rkab' : '';
    $('#f-all').value = state.all ? 'all' : '';
  };
  $('#q').addEventListener('input', (ev) => { state.q = ev.target.value.trim().toLowerCase(); drawTable(); });
  faseSel.addEventListener('change', () => { state.fase = faseSel.value; drawTable(); });
  $('#f-sifat').addEventListener('change', (ev) => { state.sifat = ev.target.value; drawTable(); });
  $('#f-rkab').addEventListener('change', (ev) => { state.rkab = ev.target.value === 'rkab'; drawTable(); });
  $('#f-all').addEventListener('change', (ev) => { state.all = ev.target.value === 'all'; drawTable(); drawDetail(); });

  const fillFaseOptions = () => {
    const seen = new Map();
    rows('izin').filter((r) => r.sifat !== 'Tujuan').forEach((r) => seen.set(r.fase, r.fase_nama));
    const want = ['', ...Array.from(seen.keys()).sort()].join('|');
    if (faseSel.dataset.opts !== want) {
      faseSel.replaceChildren(el('option', { value: '', text: 'Semua lapis' }), ...Array.from(seen.keys()).sort().map((f) => el('option', { value: f, text: seen.get(f) })));
      faseSel.dataset.opts = want;
    }
    faseSel.value = state.fase;
  };

  const cycleStatus = (id) => {
    const r = getModel().byId.get(id); if (!r) return;
    const cur = stOf(r);
    state.status.set(id, STATUSES[(STATUSES.indexOf(cur) + 1) % STATUSES.length]);
    afterStatusChange(id);
  };
  const setStatus = (id, s) => { state.status.set(id, s); afterStatusChange(id); };
  const afterStatusChange = () => { renderAll(); };

  const drawTable = () => {
    const tb = $('#tb-izin');
    const tbl = $('#tbl-izin');
    if (!allOk('izin')) {
      tb.replaceChildren(el('tr', null, el('td', { colspan: '6', class: anyBad('izin') ? 'cx-fail' : 'dash-skeleton', text: anyBad('izin') ? 'Gagal memuat' : '—' })));
      return;
    }
    fillFaseOptions();
    const q = state.q;
    const data = rows('izin').filter((r) => r.sifat !== 'Tujuan')
      .filter((r) => !state.fase || r.fase === state.fase)
      .filter((r) => !state.sifat || r.sifat === state.sifat)
      .filter((r) => !state.rkab || rkabIzin().has(r.id))
      .filter((r) => state.all || inProfile(r))
      .filter((r) => !q || [r.nama, r.singkat, r.instansi, r.dasar_hukum, r.dokumen].join(' ').toLowerCase().includes(q))
      .sort((a, b) => a.fase.localeCompare(b.fase) || a.urut - b.urut);
    tbl.dataset.count = String(data.length);
    if (!data.length) {
      tb.replaceChildren(el('tr', null, el('td', { colspan: '6', class: 'cx-muted cx-small', text: 'Tidak ada izin yang cocok dengan filter.' })));
      return;
    }
    tb.replaceChildren(...data.map((r) => {
      const st = stOf(r);
      const stBtn = statusBtn(r);
      const tr = el('tr', { 'data-key': r.id, class: state.sel === r.id ? 'sel' : null, tabindex: '0' },
        el('td', null, el('div', { class: 'nm' }, el('span', { class: 'cx-dot', style: `background:${faseColor(r.fase)}` }), el('span', { text: r.nama }))),
        el('td', { class: 'inst col-inst', text: r.instansi }),
        el('td', null, el('span', { class: `cx-chip ${r.sifat === 'Wajib' ? 'wajib' : 'kond'}`, text: r.sifat })),
        el('td', null, el('span', { class: `cx-chip ${r.syarat_rkab === 'Ya' || r.syarat_rkab === 'Gerbang' ? 'rkab' : ''}`, text: r.syarat_rkab })),
        el('td', { class: 'masa col-masa', text: r.masa_berlaku }),
        el('td', null, stBtn));
      const pick = () => { state.sel = r.id; $$('#tb-izin tr').forEach((t) => t.classList.toggle('sel', t.dataset.key === r.id)); drawDetail(); };
      tr.addEventListener('click', pick);
      tr.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(); } });
      return tr;
    }));
  };

  const relButtons = (list, go) => (list.length
    ? el('div', { class: 'cx-rel' }, ...list.map((r) => { const b = el('button', { class: 'cx-btn', type: 'button', text: r.singkat }); b.addEventListener('click', () => go(r.id)); return b; }))
    : el('p', { class: 'cx-muted cx-small', text: 'Tidak ada.' }));

  const drawDetail = () => {
    const box = $('#detail');
    if (!prep(box, ['izin', 'relasi', 'sanksi'])) return;
    const m = getModel();
    const visible = $$('#tb-izin tr[data-key]').map((t) => t.dataset.key);
    if (!state.sel || !m.byId.has(state.sel)) state.sel = visible[0] || 'I28';
    const r = m.byId.get(state.sel);
    const w = `id=${r.id}`;
    const f = (field, tag = 'span', cls) => el(tag, { 'data-source': 'izin', 'data-field': field, 'data-where': w, class: cls || null, text: r[field] });
    const pick = (id) => { state.sel = id; $$('#tb-izin tr').forEach((t) => t.classList.toggle('sel', t.dataset.key === id)); drawDetail(); };
    const ups = m.parents.get(r.id).map((e) => m.byId.get(e.dari)).filter((x) => x.sifat !== 'Tujuan');
    const downs = m.children.get(r.id).map((e) => m.byId.get(e.ke));
    const sMap = new Map(rows('sanksi').map((s) => [s.id, s]));
    const sids = String(r.sanksi_ids || '').split(',').map((s) => s.trim()).filter((s) => sMap.has(s));

    const seg = statusBtn(r);
    const rkDocs = rows('dokumen_rkab').filter((d) => String(d.izin).split(',').includes(r.id));
    const rkBox = rkDocs.length ? el('div', { 'data-source': 'dokumen_rkab' }, el('h4', { text: `Dipakai dalam dokumen RKAB (${rkDocs.length})` }),
      el('ul', { class: 'cx-docs' }, ...rkDocs.map((d) => el('li', null, el('span', { class: 'cx-chip', text: d.matrik.split(' · ')[0] }), el('span', null, el('b', { style: 'font-weight:500', text: d.dokumen }), ' — ', d.isi)))),
      (() => { const b = el('button', { class: 'cx-btn', type: 'button', style: 'margin-top:8px', text: 'Buka kelengkapan dokumen RKAB →' }); b.addEventListener('click', () => showPage('rkab', { scroll: true })); return b; })()) : null;

    const docs = String(r.dokumen || '').split(' | ').filter(Boolean);
    const dkey = (i) => r.id + ':' + i;
    const ul = el('ul', { class: 'cx-docs', 'data-source': 'izin' }, ...docs.map((d, i) => {
      const id = 'doc-' + r.id + '-' + i;
      const cb = el('input', { type: 'checkbox', id, checked: state.docs.get(dkey(i)) ? true : null });
      cb.addEventListener('change', () => { state.docs.set(dkey(i), cb.checked); docCount.textContent = `${docs.filter((_, j) => state.docs.get(dkey(j))).length}/${docs.length} ada`; });
      return el('li', null, cb, el('label', { for: id, text: d }));
    }));
    const docCount = el('span', { class: 'cx-chip', text: `${docs.filter((_, j) => state.docs.get(dkey(j))).length}/${docs.length} ada` });

    const mapBtn = el('button', { class: 'cx-btn', type: 'button', text: 'Lihat di peta keterkaitan →' });
    mapBtn.addEventListener('click', () => openGraph(r.id));

    const sanksiBox = sids.length ? el('div', { class: 'cx-rel', 'data-source': 'sanksi' }, ...sids.map((s) => {
      const b = el('button', { class: 'cx-btn', type: 'button', text: sMap.get(s).singkat });
      b.addEventListener('click', () => { state.kat = ''; showPage('sanksi', { scroll: true }); const tr = $(`#tb-sanksi tr[data-key="${s}"]`); if (tr) { tr.classList.add('sel'); tr.scrollIntoView({ block: 'center' }); } });
      return b;
    })) : null;

    box.replaceChildren(...[
      el('div', { style: 'display:flex;flex-wrap:wrap;gap:6px;align-items:center' },
        el('span', { class: 'cx-chip' }, el('span', { class: 'cx-dot', style: `background:${faseColor(r.fase)}` }), f('fase_nama')),
        el('span', { class: `cx-chip ${r.sifat === 'Wajib' ? 'wajib' : 'kond'}` }, f('sifat')),
        r.syarat_rkab === 'Ya' ? el('span', { class: 'cx-chip rkab', text: 'Syarat RKAB' }) : null,
        r.syarat_rkab === 'Gerbang' ? el('span', { class: 'cx-chip bad', text: 'Gerbang kegiatan fisik' }) : null,
        inProfile(r) ? el('span', { class: 'cx-chip ok', text: 'Dibutuhkan di tahap ini' }) : el('span', { class: 'cx-chip', text: 'Di luar tahap/profil terpilih' })),
      f('nama', 'h3'),
      r.kondisi ? el('p', { class: 'cx-muted cx-small' }, 'Berlaku: ', f('kondisi')) : null,
      el('div', null, el('h4', { text: 'Status Anda' }), seg),
      el('dl', { class: 'cx-kv' },
        el('dt', { text: 'Penerbit' }), el('dd', null, f('instansi')),
        el('dt', { text: 'Dasar hukum' }), el('dd', null, f('dasar_hukum')),
        el('dt', { text: 'Masa berlaku' }), el('dd', null, f('masa_berlaku')),
        r.durasi != null ? el('dt', { text: 'Lama pengurusan' }) : null,
        r.durasi != null ? el('dd', null, el('span', { 'data-source': 'izin', 'data-field': 'durasi', 'data-where': w, text: fmtInt(r.durasi) }), ` ${r.durasi_satuan} · ${r.durasi_jenis} · ${r.durasi_pihak}`, el('div', { class: 'cx-muted', text: r.durasi_dasar })) : null,
        r.tenggat ? el('dt', { text: 'Tenggat' }) : null, r.tenggat ? el('dd', null, f('tenggat')) : null),
      el('div', null, el('h4', { text: 'Kenapa penting' }), f('fungsi', 'p')),
      rkBox,
      el('div', null, el('h4', { style: 'display:flex;gap:8px;align-items:center' }, 'Dokumen yang harus dimiliki', docCount), ul),
      el('div', { 'data-source': 'relasi izin' }, el('h4', { text: 'Butuh lebih dulu' }), relButtons(ups, pick)),
      el('div', { 'data-source': 'relasi izin' }, el('h4', { text: 'Membuka jalan untuk' }), relButtons(downs.filter((x) => x.sifat !== 'Tujuan'), pick),
        downs.some((x) => x.id === 'GO') ? el('p', { class: 'cx-small', style: 'margin-top:6px;color:var(--color-bad)', text: 'Gerbang langsung menuju mulai produksi.' }) : null),
      el('div', null, el('h4', { text: 'Jika tidak terpenuhi' }), el('div', { class: 'cx-warnbox' }, f('konsekuensi', 'p')), sanksiBox ? el('div', { style: 'margin-top:8px' }, sanksiBox) : null),
      el('div', null, mapBtn)].filter(Boolean));
  };

  /* ---------- timeline ---------- */
  $('#tl-open').addEventListener('change', (ev) => { state.tlOpen = ev.target.value === 'open'; drawTimeline(); });
  $('#tl-reset').addEventListener('click', () => { state.dur.clear(); renderAll(); });

  const drawTimelineSummary = (sc) => {
    const box = $('#tl-sum');
    const t = tahapRow(sc.P.tahap);
    $('#tl-title').textContent = `Timeline compliance — ${t ? t.nama : ''}`;
    const open = Array.from(sc.res.values()).filter((o) => !o.done);
    if (!sc.res.size) { box.replaceChildren(el('p', { class: 'cx-ready', text: 'Tahap ini tidak memiliki izin dengan lama pengurusan.' })); return; }
    const critList = Array.from(sc.res.values()).filter((o) => sc.crit.has(o.r.id)).sort((a, b) => a.start - b.start);
    let wd = 0; for (let x = sc.t0; x < sc.ready; x += DAY) if (!wk(x)) wd += 1;
    box.replaceChildren(...[
      open.length
        ? el('div', { class: 'cx-ready', style: 'margin-bottom:var(--cds-pad-md)' },
          'Mulai pengajuan ', el('b', { text: fmtD(sc.t0) }), ' → ', t ? t.siap : 'siap', ' pada ', el('b', { text: fmtD(sc.ready) }),
          ` (± ${d3.format('.1f')((sc.ready - sc.t0) / (DAY * 30.44)).replace('.', ',')} bulan, ${fmtInt(wd)} hari kerja). `,
          critList.length ? ['Jalur kritis: ', el('b', { style: 'font-weight:500', text: critList.map((o) => o.r.singkat).join(' → ') }), '. Mempercepat izin di jalur ini mempercepat seluruh tahap.'] : '')
        : el('div', { class: 'cx-ready ok', style: 'margin-bottom:var(--cds-pad-md)', text: 'Semua izin untuk tahap ini bertanda lengkap.' }),
      sc.warns.length ? el('div', { class: 'cx-ready bad', style: 'margin-bottom:var(--cds-pad-md)' }, el('b', { text: 'Perhatian' }), el('ul', { class: 'cx-warnlist' }, ...sc.warns.map((w) => el('li', { text: w })))) : null].filter(Boolean));
  };

  const drawTimeline = () => {
    const box = $('#gantt');
    if (box.closest('[hidden]')) return;
    if (!prep(box, ['izin', 'relasi', 'tahap'])) { $('#tl-sum').replaceChildren(); return; }
    const sc = schedule();
    drawTimelineSummary(sc);
    let items = Array.from(sc.res.values());
    if (state.tlOpen) items = items.filter((o) => !o.done);
    items.sort((a, b) => a.start - b.start || a.end - b.end || a.r.fase.localeCompare(b.r.fase));
    if (!items.length) { box.replaceChildren(el('p', { class: 'cx-muted cx-small', text: 'Tidak ada izin untuk ditampilkan.' })); return; }
    const d0 = sc.t0;
    const d1 = Math.max(sc.ready, ...items.map((o) => o.end)) + 20 * DAY;
    const pct = (t) => ((t - d0) / (d1 - d0)) * 100;
    const t = tahapRow(sc.P.tahap);

    // axis ticks
    const months = (d1 - d0) / (DAY * 30.44);
    const step = months > 30 ? 6 : months > 15 ? 3 : months > 8 ? 2 : 1;
    const ticks = [];
    let dt = new Date(d0); let tm = Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 1);
    while (tm < d1) { const d = new Date(tm); if (d.getUTCMonth() % step === 0) ticks.push(tm); tm = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); }
    const axis = el('div', { class: 'cx-g-head cx-g-axis' }, ...ticks.map((x) => {
      const d = new Date(x);
      return el('span', { style: `left:${pct(x)}%`, text: `${BLN[d.getUTCMonth()]}${d.getUTCMonth() === 0 || x === ticks[0] ? ' ' + String(d.getUTCFullYear()).slice(2) : ''}` });
    }));

    // overlay: grid, RKAB windows, today
    const ov = el('div', { class: 'cx-g-overlay' });
    ticks.forEach((x) => ov.append(el('div', { class: 'cx-g-grid', style: `left:${pct(x)}%` })));
    for (let y = new Date(d0).getUTCFullYear(); y <= new Date(d1).getUTCFullYear(); y++) {
      const a = Math.max(d0, Date.UTC(y, 9, 1)), b = Math.min(d1, Date.UTC(y, 10, 16));
      if (b > a) ov.append(el('div', { class: 'cx-g-win', style: `left:${pct(a)}%;width:${pct(b) - pct(a)}%` }));
    }
    const now = todayUTC();
    if (now >= d0 && now <= d1) ov.append(el('div', { class: 'cx-g-today', style: `left:${pct(now)}%` }));

    const tip = el('div', { class: 'cx-tip' });
    const left = el('div', null, el('div', { class: 'cx-g-head', style: 'padding-top:10px;color:var(--color-fg-muted)', text: 'Izin / dokumen' }));
    const body = el('div', { class: 'cx-g-body' }, ov);
    items.forEach((o) => {
      const r = o.r; const c = faseColor(r.fase);
      const inp = el('input', { type: 'number', min: '0', max: '999', step: '1', value: String(durOf(r)), 'aria-label': `Durasi ${r.singkat}` });
      inp.addEventListener('change', () => { const v = Math.max(0, Math.min(999, Math.round(Number(inp.value) || 0))); state.dur.set(r.id, v); renderAll(); });
      const nm = el('button', { class: 'cx-link', type: 'button', style: 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap', text: r.singkat });
      nm.addEventListener('click', () => openIzin(r.id));
      left.append(el('div', { class: 'cx-g-lbl', 'data-key': r.id },
        el('div', { class: 't' }, el('span', { class: 'cx-dot', style: `background:${c}` }), nm, sc.crit.has(r.id) ? el('span', { class: 'cx-chip bad', text: 'kritis' }) : null),
        o.done
          ? el('div', { class: 'm' }, el('span', { class: 'cx-chip ok', text: stOf(r) }), 'tidak menambah waktu')
          : el('div', { class: 'm' }, inp, r.durasi_satuan, el('span', { class: `cx-chip ${r.durasi_jenis === 'Regulasi' ? 'ok' : 'kond'}`, text: r.durasi_jenis }))));
      const row = el('div', { class: 'cx-g-row' });
      if (o.wait) row.append(el('div', { class: 'cx-g-wait', style: `left:${pct(o.wait.from)}%;width:${pct(o.wait.to) - pct(o.wait.from)}%` }));
      const bar = el('div', { class: `cx-g-bar ${r.durasi_jenis === 'Estimasi' ? 'est' : ''} ${sc.crit.has(r.id) ? 'crit' : ''} ${o.done ? 'done' : ''}`, style: `left:${pct(o.start)}%;width:${Math.max(0.4, pct(o.end) - pct(o.start))}%;background-color:${c}` });
      bar.addEventListener('mousemove', (ev) => showTip(tip, box, ev, [
        el('div', { class: 's', text: o.done ? 'Sudah dimiliki' : `${fmtD(o.start)} – ${fmtD(o.end)}` }),
        el('div', { text: r.nama }),
        el('div', { class: 's', text: o.done ? '' : `${durOf(r)} ${r.durasi_satuan} · ${r.durasi_pihak}` }),
        el('div', { class: 's', text: r.durasi_dasar })]));
      bar.addEventListener('mouseleave', () => hideTip(tip));
      row.append(bar);
      const lbl = o.done ? 'sudah ada' : `${fmtD(o.start)} – ${fmtD(o.end)}`;
      row.append(pct(o.end) < 72
        ? el('span', { class: 'cx-g-dt', style: `left:calc(${pct(o.end)}% + 6px)`, text: lbl })
        : el('span', { class: 'cx-g-dt', style: `right:calc(${100 - pct(o.start)}% + 6px)`, text: lbl }));
      body.append(row);
    });
    // milestone
    left.append(el('div', { class: 'cx-g-lbl' }, el('div', { class: 't', style: 'font-weight:600', text: t ? `Siap: ${t.siap}` : 'Siap' }), el('div', { class: 'm', text: fmtD(sc.ready) })));
    const ms = el('div', { class: 'cx-g-row' }, el('div', { class: 'cx-g-ms', style: `left:${pct(sc.ready)}%` }),
      el('span', { class: 'cx-g-dt', style: pct(sc.ready) < 72 ? `left:calc(${pct(sc.ready)}% + 12px);color:var(--color-fg);font-weight:600` : `right:calc(${100 - pct(sc.ready)}% + 12px);color:var(--color-fg);font-weight:600`, text: fmtD(sc.ready) }));
    body.append(ms);
    box.replaceChildren(el('div', { class: 'cx-gantt' }, left, el('div', null, axis, body)), tip);
  };

  const drawRecurring = () => {
    const box = $('#recurring');
    if (!prep(box, ['izin', 'kalender'])) return;
    const P = prof();
    const list = getModel().izin.filter((r) => inProfile(r, P) && r.durasi == null);
    box.replaceChildren(...(list.length ? list.map((r, i) => {
      const title = el('button', { class: 'cx-link', type: 'button', text: r.nama });
      title.addEventListener('click', () => openIzin(r.id));
      return el('div', { class: 'cx-gate' }, el('span', { class: 'cx-gate-ico', style: 'background:color-mix(in srgb,var(--color-fg) 8%,transparent);color:var(--color-fg)', text: '↻' }),
        el('div', null, el('h4', null, title), el('p', { text: r.tenggat || r.masa_berlaku }), el('p', { text: r.fungsi })));
    }) : [el('p', { class: 'cx-muted cx-small', text: 'Tidak ada kewajiban berulang khusus untuk tahap ini; lihat tab Kalender kepatuhan.' })]));
  };

  /* ---------- graph ---------- */
  const EDGE = {
    prasyarat: { label: 'Prasyarat (harus ada dulu)', color: 'var(--color-fg-muted)', dash: null, w: 1.2 },
    mengikat: { label: 'Saling mengikat (isi harus konsisten)', color: 'var(--color-warn)', dash: '5 4', w: 1.6 },
    gerbang: { label: 'Gerbang kegiatan fisik', color: 'var(--color-bad)', dash: null, w: 2.2 },
    turunan: { label: 'Kewajiban turunan', color: 'var(--cds-chart-muted)', dash: '1.5 3.5', w: 1.4 },
  };

  const drawLegend = () => {
    const box = $('#g-legend');
    if (!allOk('izin')) { box.replaceChildren(); return; }
    const seen = new Map();
    rows('izin').filter((r) => r.sifat !== 'Tujuan').forEach((r) => seen.set(r.fase, r.fase_nama));
    const sw = (k) => {
      const s = sv('svg', { width: 26, height: 10, viewBox: '0 0 26 10' });
      s.append(sv('line', { x1: 1, y1: 5, x2: 25, y2: 5, stroke: EDGE[k].color, 'stroke-width': EDGE[k].w + 0.4, 'stroke-dasharray': EDGE[k].dash, 'stroke-linecap': EDGE[k].dash ? 'round' : 'butt' }));
      return s;
    };
    box.replaceChildren(
      ...Array.from(seen.keys()).sort().map((f) => el('span', null, el('i', { class: 'cx-dot', style: `background:${faseColor(f)}` }), seen.get(f))),
      el('span', null, el('i', { class: 'cx-sw', style: 'border:1.5px dashed var(--color-fg-muted);background:transparent;height:10px' }), 'Kondisional'),
      ...Object.keys(EDGE).map((k) => el('span', null, sw(k), EDGE[k].label)));
  };

  const wrapText = (t, max) => {
    const words = String(t).split(/\s+/); const lines = []; let cur = '';
    words.forEach((w) => { if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); });
    if (cur) lines.push(cur);
    if (lines.length > 3) { lines.length = 3; lines[2] = lines[2].replace(/.{0,2}$/, '…'); }
    return lines;
  };

  const drawGraph = () => {
    const box = $('#graphbox');
    if (box.closest('[hidden]')) return;
    drawLegend();
    if (!prep(box, ['izin', 'relasi'])) { drawImpact(); return; }
    const m = getModel();
    const layers = d3.groups(m.izin, (r) => m.depth.get(r.id)).sort((a, b) => a[0] - b[0]).map(([, rs]) => rs);
    // order within layer by barycenter of parents (two sweeps)
    const pos = new Map();
    layers.forEach((L) => L.sort((a, b) => a.fase.localeCompare(b.fase) || a.urut - b.urut).forEach((r, i) => pos.set(r.id, i / Math.max(1, L.length - 1))));
    for (let s = 0; s < 2; s++) {
      layers.forEach((L, li) => {
        if (!li) return;
        const bc = (r) => { const ps = m.parents.get(r.id); return ps.length ? d3.mean(ps, (e) => pos.get(e.dari)) : pos.get(r.id); };
        L.sort((a, b) => bc(a) - bc(b));
        L.forEach((r, i) => pos.set(r.id, i / Math.max(1, L.length - 1)));
      });
    }
    const maxPer = d3.max(layers, (L) => L.length);
    const W = Math.max(720, Math.floor(box.clientWidth || 720));
    const gapX = 14, padX = 10, nodeH = 52, gapY = 42, padY = 14;
    const nodeW = Math.min(184, Math.floor((W - padX * 2 - gapX * (maxPer - 1)) / maxPer));
    const H = padY * 2 + layers.length * nodeH + (layers.length - 1) * gapY;
    const xy = new Map();
    layers.forEach((L, li) => {
      const total = L.length * nodeW + (L.length - 1) * gapX;
      const x0 = (W - total) / 2;
      L.forEach((r, i) => xy.set(r.id, { x: x0 + i * (nodeW + gapX), y: padY + li * (nodeH + gapY) }));
    });

    const svg = sv('svg', { class: 'cx-graph', width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Diagram keterkaitan izin pertambangan batubara' });
    const defs = sv('defs');
    Object.entries(EDGE).forEach(([k, v]) => {
      const mk = sv('marker', { id: 'arw-' + k, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
      mk.append(sv('path', { d: 'M0,1 L9,5 L0,9 z', style: `fill:${v.color}` }));
      defs.append(mk);
    });
    svg.append(defs);
    const gE = sv('g'); const gN = sv('g');
    svg.append(gE, gN);

    const edgeEls = m.relasi.map((e) => {
      const a = xy.get(e.dari), b = xy.get(e.ke); const st = EDGE[e.jenis] || EDGE.prasyarat;
      const sx = a.x + nodeW / 2, sy = a.y + nodeH, tx = b.x + nodeW / 2, ty = b.y - 2;
      const dy = Math.max(30, (ty - sy) / 2);
      const p = sv('path', { class: 'edge', d: `M${sx},${sy} C${sx},${sy + dy} ${tx},${ty - dy} ${tx},${ty}`, style: `stroke:${st.color};stroke-width:${st.w}`, 'stroke-dasharray': st.dash, 'stroke-linecap': st.dash ? 'round' : 'butt', 'marker-end': `url(#arw-${e.jenis})` });
      p.__e = e; gE.append(p); return p;
    });

    const maxChars = Math.max(10, Math.floor((nodeW - 14) / 6.1));
    const nodeEls = m.izin.map((r) => {
      const { x, y } = xy.get(r.id); const c = faseColor(r.fase); const go = r.id === 'GO';
      const g = sv('g', { class: 'node', transform: `translate(${x},${y})`, tabindex: '0', role: 'button', 'aria-label': r.nama });
      if (go ? !['T4', 'T5', 'T6'].includes(prof().tahap) : !inProfile(r)) g.classList.add('out');
      g.append(sv('rect', { width: nodeW, height: nodeH, rx: 8, style: go ? 'fill:var(--color-fg);stroke:var(--color-fg)' : `fill:${tint(c, 16)};stroke:${c}`, 'stroke-dasharray': r.sifat === 'Kondisional' ? '4 3' : null }));
      const lines = wrapText(r.singkat, maxChars);
      const t = sv('text', { x: nodeW / 2, y: nodeH / 2 - ((lines.length - 1) * 13) / 2 + 4, 'text-anchor': 'middle', style: go ? 'fill:var(--color-bg);font-weight:600' : null });
      lines.forEach((ln, i) => { const ts = sv('tspan', { x: nodeW / 2, dy: i ? 13 : 0 }); ts.textContent = ln; t.append(ts); });
      g.append(t);
      const act = () => { state.gsel = state.gsel === r.id ? null : r.id; applyFocus(); drawImpact(); };
      g.addEventListener('click', act);
      g.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); act(); } });
      g.__id = r.id; gN.append(g); return g;
    });

    const applyFocus = () => {
      const id = state.gsel;
      svg.classList.toggle('focus', !!id);
      if (!id) { nodeEls.forEach((n) => n.classList.remove('on', 'sel', 'down')); edgeEls.forEach((p) => p.classList.remove('on')); return; }
      const up = m.walk(id, 'up'), down = m.walk(id, 'down');
      const upS = new Set([...up, id]), downS = new Set([...down, id]);
      nodeEls.forEach((n) => {
        n.classList.toggle('on', upS.has(n.__id) || downS.has(n.__id));
        n.classList.toggle('sel', n.__id === id);
        n.classList.toggle('down', down.has(n.__id));
        const rect = n.firstChild;
        if (down.has(n.__id) && n.__id !== 'GO') rect.style.stroke = 'var(--color-bad)';
        else if (n.__id !== 'GO') rect.style.stroke = faseColor(m.byId.get(n.__id).fase);
      });
      edgeEls.forEach((p) => { const e = p.__e; p.classList.toggle('on', (upS.has(e.dari) && upS.has(e.ke)) || (downS.has(e.dari) && downS.has(e.ke))); });
    };
    box.replaceChildren(svg);
    applyFocus();
    drawImpact();
    if (state.gsel) { const n = nodeEls.find((x) => x.__id === state.gsel); if (n && box.scrollWidth > box.clientWidth) box.scrollLeft = Math.max(0, xy.get(state.gsel).x - box.clientWidth / 2); }
  };

  const drawImpact = () => {
    const box = $('#impact');
    const title = $('#imp-title'), note = $('#imp-note');
    if (!prep(box, ['izin', 'relasi'])) return;
    const m = getModel();
    const id = state.gsel;
    if (!id) {
      title.textContent = 'Simulasi dampak';
      note.textContent = 'Pilih satu izin di peta untuk melihat rantai dampaknya.';
      box.replaceChildren();
      return;
    }
    const r = m.byId.get(id);
    const byDepth = (set) => Array.from(set).map((x) => m.byId.get(x)).sort((a, b) => m.depth.get(a.id) - m.depth.get(b.id));
    const up = byDepth(m.walk(id, 'up')).filter((x) => x.sifat !== 'Tujuan');
    const down = byDepth(m.walk(id, 'down'));
    const blocksGo = down.some((x) => x.id === 'GO');
    title.textContent = r.id === 'GO' ? 'Semua yang harus beres sebelum produksi' : `Bila “${r.singkat}” belum ada`;
    note.textContent = r.id === 'GO'
      ? `${up.length} izin dan dokumen berada di hulu titik mulai produksi.`
      : blocksGo ? `${down.length - 1} tahapan di hilir ikut terhambat, termasuk mulai produksi.` : `${down.length} tahapan di hilir ikut terhambat; izin ini tidak memblokir mulai produksi secara langsung.`;
    const li = (x) => { const b = el('button', { class: 'cx-link', type: 'button', text: x.nama }); b.addEventListener('click', () => { state.gsel = x.id; drawGraph(); }); return el('li', null, b); };
    const open = el('button', { class: 'cx-btn', type: 'button', text: 'Buka di checklist →' });
    open.addEventListener('click', () => openIzin(r.id === 'GO' ? 'I28' : r.id));
    const direct = [...m.parents.get(id), ...m.children.get(id)];
    box.replaceChildren(
      el('div', null, el('h4', { class: 'cx-sec-note', style: 'text-transform:uppercase;letter-spacing:.04em', text: `Dibutuhkan lebih dulu (${up.length})` }), up.length ? el('ul', null, ...up.map(li)) : el('p', { class: 'cx-muted cx-small', text: 'Tidak ada — titik awal.' })),
      el('div', null, el('h4', { class: 'cx-sec-note', style: 'text-transform:uppercase;letter-spacing:.04em;color:var(--color-bad)', text: `Terhambat bila belum ada (${down.length})` }), down.length ? el('ul', null, ...down.map(li)) : el('p', { class: 'cx-muted cx-small', text: 'Tidak ada — titik akhir.' })),
      el('div', null, el('h4', { class: 'cx-sec-note', style: 'text-transform:uppercase;letter-spacing:.04em', text: 'Hubungan langsung' }),
        el('ul', null, ...direct.map((e) => el('li', { class: 'cx-small' }, el('b', { text: `${m.byId.get(e.dari).singkat} → ${m.byId.get(e.ke).singkat}` }), ` (${e.jenis}): ${e.keterangan}`))),
        el('div', { style: 'margin-top:8px' }, open)));
  };

  const drawBind = () => {
    const box = $('#bind');
    if (!prep(box, ['relasi', 'izin'])) return;
    const m = getModel();
    const list = m.relasi.filter((e) => e.jenis === 'mengikat');
    box.replaceChildren(...list.map((e) => {
      const a = m.byId.get(e.dari), b = m.byId.get(e.ke);
      const btn = (x) => { const k = el('button', { class: 'cx-link', type: 'button', text: x.nama }); k.addEventListener('click', () => openIzin(x.id)); return k; };
      return el('div', { class: 'cx-bind-row' }, btn(a), el('span', { class: 'mid', text: '⇄ mengikat' }), btn(b), el('span', { class: 'k', text: e.keterangan }));
    }));
  };

  /* ---------- RKAB ---------- */
  const drawSyarat = () => {
    const box = $('#syarat');
    if (!prep(box, ['syarat_rkab', 'izin'])) return;
    const m = getModel();
    box.replaceChildren(...rows('syarat_rkab').slice().sort((a, b) => a.no - b.no).map((s) => {
      const ids = String(s.izin).split(',').map((x) => x.trim()).filter((x) => m.byId.has(x));
      const chips = el('div', { class: 'cx-rel' }, ...ids.map((id) => {
        const r = m.byId.get(id); const st = stOf(r);
        const b = el('button', { class: 'cx-st', type: 'button', 'data-st': st }, r.singkat);
        b.addEventListener('click', () => openIzin(id));
        return b;
      }));
      return el('div', { class: 'cx-sy' },
        el('span', { class: 'no', 'data-source': 'syarat_rkab', 'data-field': 'no', 'data-where': `no=${s.no}`, text: String(s.no) }),
        el('span', { class: 't', 'data-source': 'syarat_rkab', 'data-field': 'syarat', 'data-where': `no=${s.no}`, text: s.syarat }),
        el('span', { class: 'p', text: s.pasal }),
        el('span', { class: 'c', text: 'Yang dicek: ' + s.cek }),
        chips);
    }));
  };

  const drawEval = () => {
    const box = $('#evalflow');
    if (!prep(box, ['kalender'])) return;
    const data = rows('kalender').filter((r) => r.kategori === 'Evaluasi RKAB').sort((a, b) => a.urut - b.urut);
    box.replaceChildren(...data.map((r) => el('div', { class: 'cx-step' },
      el('div', { class: 'v', 'data-source': 'kalender', 'data-field': 'nilai', 'data-where': `id=${r.id}`, text: r.nilai == null ? '✓' : fmtInt(r.nilai) }),
      el('div', { class: 'u', text: r.satuan }),
      el('div', { class: 'd', text: r.kegiatan }))));
  };

  /* ---------- RKAB documents (Kepmen 341.K/2025) ---------- */
  state.rkdoc = window.persistMap('rkdoc'); state.rkAspek = ''; state.rkOpen = false;
  const rkabIzin = () => {
    const s = new Set();
    rows('dokumen_rkab').forEach((d) => String(d.izin).split(',').filter(Boolean).forEach((x) => s.add(x)));
    rows('izin').filter((r) => r.syarat_rkab === 'Ya' || r.syarat_rkab === 'Gerbang').forEach((r) => s.add(r.id));
    return s;
  };
  const docRelevant = (d, P = prof()) => !d.kondisi_key || String(d.kondisi_key).split(',').some((f) => P.flags.has(f));
  const docSources = (d) => String(d.izin).split(',').filter(Boolean).map((x) => getModel().byId.get(x)).filter(Boolean);
  const rkDocStats = () => {
    const docs = rows('dokumen_rkab').filter((d) => docRelevant(d));
    const ready = docs.filter((d) => state.rkdoc.get(d.id)).length;
    const blocked = docs.filter((d) => docSources(d).some((r) => !isDone(r))).length;
    return { docs, total: docs.length, ready, blocked };
  };

  $('#rk-aspek-f').addEventListener('change', (ev) => { state.rkAspek = ev.target.value; drawRkDocs(); });
  $('#rk-open').addEventListener('change', (ev) => { state.rkOpen = ev.target.value === 'open'; drawRkDocs(); });

  const drawRkDocs = () => {
    const pb = $('#rk-prog'), ab = $('#rk-aspek'), db = $('#rk-docs');
    if (!prep(db, ['dokumen_rkab', 'aspek_rkab', 'izin', 'relasi'])) { pb.replaceChildren(); ab.replaceChildren(); return; }
    const P = prof(); const st = rkDocStats();
    const asp = rows('aspek_rkab').slice().sort((a, b) => a.urut - b.urut);
    // progress
    const n = st.total || 1;
    pb.replaceChildren(el('div', { class: 'cx-prog' },
      el('div', { class: 'cx-prog-bar', role: 'img', 'aria-label': 'Kesiapan dokumen RKAB' }, el('span', { style: `width:${(st.ready / n) * 100}%;background:var(--color-ok)` })),
      el('div', { class: 'cx-prog-txt' },
        el('span', null, el('b', { class: 'n', text: `${st.ready}/${st.total}` }), ' dokumen siap'),
        el('span', { style: st.blocked ? 'color:var(--color-bad)' : null, text: `${st.blocked} dokumen bersumber dari izin yang belum lengkap` }),
        el('span', { text: `${rows('dokumen_rkab').length - st.total} tidak berlaku untuk profil Anda` })),
      physical(P.tahap) ? null : el('div', { class: 'cx-ready', text: 'RKAB tahap operasi produksi diperlukan mulai tahap konstruksi. Untuk tahap yang Anda pilih, bagian ini menjadi persiapan.' })));
    // aspects
    ab.replaceChildren(...asp.map((a) => {
      const ds = st.docs.filter((d) => d.aspek === a.id);
      const rd = ds.filter((d) => state.rkdoc.get(d.id)).length;
      const bad = ds.some((d) => docSources(d).some((r) => stOf(r) === 'Belum ada'));
      const card = el('button', { type: 'button', class: `cx-asp ${ds.length && rd === ds.length ? 'ok' : bad ? 'bad' : ''}`, style: 'text-align:left;font:inherit;color:inherit;cursor:pointer' },
        el('div', { class: 'h' }, el('span', { 'data-source': 'aspek_rkab', 'data-field': 'aspek', 'data-where': `id=${a.id}`, text: a.aspek }), el('span', { class: 'cx-chip', text: `${rd}/${ds.length}` })),
        el('div', { class: 'c', text: a.cek }));
      card.addEventListener('click', () => { state.rkAspek = state.rkAspek === a.id ? '' : a.id; drawRkDocs(); });
      return card;
    }));
    const fs = $('#rk-aspek-f');
    fs.replaceChildren(el('option', { value: '', text: 'Semua aspek evaluasi' }), ...asp.map((a) => el('option', { value: a.id, text: a.aspek })));
    fs.value = state.rkAspek;
    $('#rk-open').value = state.rkOpen ? 'open' : '';
    // documents
    const amap = new Map(asp.map((a) => [a.id, a.aspek]));
    const docs = st.docs.filter((d) => !state.rkAspek || d.aspek === state.rkAspek).filter((d) => !state.rkOpen || !state.rkdoc.get(d.id))
      .sort((a, b) => a.urut - b.urut);
    if (!docs.length) { db.replaceChildren(el('p', { class: 'cx-muted cx-small', text: 'Tidak ada dokumen yang cocok dengan filter.' })); return; }
    db.replaceChildren(...d3.groups(docs, (d) => d.matrik).map(([mtx, ds]) => el('div', { class: 'cx-rk-grp' }, el('h4', { text: mtx }),
      ...ds.map((d) => {
        const id = 'rk-' + d.id; const on = !!state.rkdoc.get(d.id);
        const cb = el('input', { type: 'checkbox', id, checked: on ? true : null });
        cb.addEventListener('change', () => { state.rkdoc.set(d.id, cb.checked); renderAll(); });
        const srcs = docSources(d);
        const pending = srcs.filter((r) => !isDone(r));
        return el('div', { class: `cx-rk-item ${on ? 'done' : ''}`, 'data-key': d.id }, cb,
          el('div', null,
            el('label', { for: id, class: 't', text: d.dokumen }),
            el('div', { class: 'd', text: d.isi }),
            el('div', { class: 'cx-rk-src' },
              el('span', { class: 'cx-chip', text: amap.get(d.aspek) || d.aspek }),
              ...srcs.map((r) => { const nm = el('button', { class: 'cx-link', type: 'button', text: r.singkat }); nm.addEventListener('click', () => openIzin(r.id)); return el('span', { class: 'src' }, nm, statusBtn(r)); }),
              srcs.length ? null : el('span', { class: 'cx-muted', text: 'Disusun dari RIPPM perusahaan' })),
            on && pending.length ? el('div', { class: 'cx-rk-warn', text: `Dicentang siap, tetapi izin sumbernya belum lengkap: ${pending.map((r) => r.singkat).join(', ')}.` }) : null));
      }))));
  };

  const tipIn = (box) => { const t = el('div', { class: 'cx-tip' }); box.append(t); return t; };
  const showTip = (tip, box, ev, nodes) => {
    tip.replaceChildren(...nodes); tip.style.opacity = '1';
    const r = box.getBoundingClientRect();
    let x = ev.clientX - r.left + 12, y = ev.clientY - r.top + 12;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    if (x + tw > box.clientWidth) x = Math.max(0, ev.clientX - r.left - tw - 12);
    if (y + th > box.clientHeight) y = Math.max(0, ev.clientY - r.top - th - 12);
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  };
  const hideTip = (tip) => { tip.style.opacity = '0'; };

  /* ---------- kalender ---------- */
  const evColor = (r) => (/RKAB/.test(r.kegiatan) ? dash.colors[1] : /reklamasi/i.test(r.kegiatan) ? dash.colors[2] : dash.colors[0]);
  const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const drawYear = () => {
    const box = $('#year');
    if (box.closest('[hidden]')) return;
    if (!prep(box, ['kalender'])) return;
    const data = rows('kalender').filter((r) => r.kategori === 'Siklus tahunan')
      .sort((a, b) => a.bulan - b.bulan || a.tanggal - b.tanggal);
    const W = Math.max(320, Math.floor(box.clientWidth || 600));
    const today = new Date();
    const yr = today.getFullYear();
    const x = d3.scaleUtc([Date.UTC(yr, 0, 1), Date.UTC(yr, 11, 31)], [16, W - 16]);
    const stackCount = new Map();
    const pts = data.map((r, i) => {
      const t = Date.UTC(yr, r.bulan - 1, r.tanggal);
      const k = Math.round(x(t) / 22);
      const s = stackCount.get(k) || 0; stackCount.set(k, s + 1);
      return { r, i, cx: x(t), s, t };
    });
    const maxStack = d3.max(pts, (p) => p.s) || 0;
    const top = 16 + maxStack * 22, axisY = top + 18, H = axisY + 34;
    const svg = sv('svg', { width: '100%', height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Siklus tenggat tahunan' });
    svg.append(sv('line', { x1: 16, x2: W - 16, y1: axisY, y2: axisY, style: 'stroke:var(--cds-chart-axis)', 'stroke-width': 1 }));
    const step = W < 520 ? 2 : 1;
    BULAN.forEach((b, i) => {
      const xx = x(Date.UTC(yr, i, 1));
      svg.append(sv('line', { x1: xx, x2: xx, y1: axisY, y2: axisY + 5, style: 'stroke:var(--cds-chart-axis)' }));
      if (i % step === 0) { const t = sv('text', { x: xx + 2, y: axisY + 18, style: 'fill:var(--color-fg-muted);font-size:11px;font-family:var(--font-anthropic-sans)' }); t.textContent = b; svg.append(t); }
    });
    const nowT = Date.UTC(yr, today.getMonth(), today.getDate());
    const nx = x(nowT);
    svg.append(sv('line', { x1: nx, x2: nx, y1: 4, y2: axisY + 5, style: 'stroke:var(--cds-chart-reference)', 'stroke-dasharray': '3 3' }));
    const nt = sv('text', { x: Math.min(W - 40, nx + 4), y: 10, style: 'fill:var(--color-fg-muted);font-size:10.5px;font-family:var(--font-anthropic-sans)' }); nt.textContent = 'Hari ini'; svg.append(nt);
    const tip = el('div', { class: 'cx-tip' });
    pts.forEach((p) => {
      const cy = axisY - 12 - p.s * 22;
      svg.append(sv('line', { x1: p.cx, x2: p.cx, y1: cy, y2: axisY, style: `stroke:${evColor(p.r)}`, 'stroke-width': 1 }));
      const g = sv('g', { style: 'cursor:default' });
      g.append(sv('circle', { cx: p.cx, cy, r: 9, style: `fill:${evColor(p.r)}` }));
      const t = sv('text', { x: p.cx, y: cy + 3.8, 'text-anchor': 'middle', style: 'fill:var(--color-bg);font-size:10.5px;font-weight:600;font-family:var(--font-anthropic-sans)' }); t.textContent = String(p.i + 1);
      g.append(t);
      g.addEventListener('mousemove', (ev) => showTip(tip, box, ev, [el('div', { class: 's', text: `${p.r.tanggal} ${BULAN[p.r.bulan - 1]}` }), el('div', { text: p.r.kegiatan })]));
      g.addEventListener('mouseleave', () => hideTip(tip));
      svg.append(g);
    });
    const upcoming = pts.filter((p) => p.t >= nowT).sort((a, b) => a.t - b.t)[0] || pts[0];
    const daysTo = upcoming ? Math.round(((upcoming.t >= nowT ? upcoming.t : Date.UTC(yr + 1, upcoming.r.bulan - 1, upcoming.r.tanggal)) - nowT) / 864e5) : null;
    const head = upcoming ? el('p', { class: 'cx-ready', style: 'margin:0 0 var(--cds-pad-md)' },
      el('b', { text: 'Tenggat terdekat: ' }), `${upcoming.r.kegiatan} — `,
      el('span', { 'data-source': 'kalender', 'data-field': 'tanggal', 'data-where': `id=${upcoming.r.id}`, text: String(upcoming.r.tanggal) }), ` ${BULAN[upcoming.r.bulan - 1]} (${daysTo} hari lagi).`) : null;
    const list = el('ul', { class: 'cx-evlist' }, ...pts.map((p) => el('li', null,
      el('span', { class: 'cx-evno', style: `background:${evColor(p.r)}`, text: String(p.i + 1) }),
      el('div', null, el('div', { text: p.r.kegiatan }), el('div', { class: 'w', text: `${p.r.tanggal} ${BULAN[p.r.bulan - 1]} · ${p.r.dasar}` })))));
    box.replaceChildren(...[head, el('div', { style: 'position:relative' }, svg), list, tip].filter(Boolean));
  };

  const drawDeadlines = () => {
    const box = $('#dl');
    if (!prep(box, ['kalender'])) return;
    const data = rows('kalender').filter((r) => r.kategori === 'Tenggat sejak peristiwa').sort((a, b) => a.urut - b.urut);
    box.replaceChildren(...data.map((r) => el('div', { class: 'cx-dl-row' },
      el('div', { class: 'v' }, el('span', { 'data-source': 'kalender', 'data-field': 'nilai', 'data-where': `id=${r.id}`, text: fmtInt(r.nilai) }), el('span', { class: 'u', text: r.satuan })),
      el('div', null, el('div', { class: 'k', text: r.kegiatan }), el('div', { class: 'b', text: r.dasar })))));
  };

  /* ---------- regulasi ---------- */
  const stChip = (s) => (s === 'Berlaku' ? 'ok' : s === 'Dicabut' ? 'bad' : s === 'Tidak lagi acuan' ? 'warn' : '');
  const drawRegStatus = () => {
    const box = $('#regstat');
    if (!prep(box, ['reg_status'])) return;
    box.replaceChildren(...D('reg_status').data.map((r) => el('div', { class: 'cx-kpi' },
      el('span', { class: 'lbl', text: r.status }),
      el('span', { class: 'val', 'data-source': 'reg_status', 'data-field': 'jumlah', 'data-where': `status=${encodeURIComponent(r.status).replace(/%20/g, ' ')}`, text: fmtInt(r.jumlah) }))));
  };
  const drawRegTable = () => {
    const tb = $('#tb-reg');
    if (!allOk('regulasi')) { tb.replaceChildren(el('tr', null, el('td', { colspan: '5', class: anyBad('regulasi') ? 'cx-fail' : 'dash-skeleton', text: anyBad('regulasi') ? 'Gagal memuat' : '—' }))); return; }
    const data = rows('regulasi').slice().sort((a, b) => a.urut - b.urut);
    tb.replaceChildren(...data.map((r) => el('tr', { 'data-key': r.id },
      el('td', { class: 'inst col-inst', text: r.jenis }),
      el('td', null, r.url ? el('a', { href: r.url, target: '_blank', rel: 'noopener', text: r.nomor }) : r.nomor),
      el('td', { text: r.tentang }),
      el('td', null, el('span', { class: `cx-chip ${stChip(r.status)}`, text: r.status })),
      el('td', { class: 'masa col-masa', text: r.peran }))));
  };

  /* ---------- orchestration ---------- */
  const drawVisible = () => {
    if (state.page === 'peta') drawGraph();
    if (state.page === 'kalender') drawYear();
    if (state.page === 'timeline') drawTimeline();
  };

  const renderAll = () => {
    drawStages(); drawConds();
    if (startIn !== document.activeElement) showStart();
    drawSummary(); drawSorotan();
    syncFilterUi(); drawTable(); drawProgress(); drawDetail();
    drawRecurring();
    drawBind(); drawImpact();
    drawRkDocs(); drawSyarat(); drawEval(); drawGates('#after', true);
    drawDeadlines();
    drawRegStatus(); drawRegTable();
    drawVisible();
  };

  let first = true;
  dash.onData(() => {
    renderAll();
    if (first && allOk('izin', 'relasi', 'sanksi', 'regulasi', 'kalender', 'eskalasi', 'syarat_rkab', 'tahap', 'kondisi', 'dokumen_rkab', 'aspek_rkab')) {
      first = false;
      const h = location.hash.slice(1);
      if (h && $$('.cx-page').some((p) => p.id === h)) showPage(h);
    }
  });
})();
