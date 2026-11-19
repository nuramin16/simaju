/**
 * ============================================================
 * SI-MAJU PRO — Frontend statis (js/app.js)
 * Hosting: GitHub Pages  |  Backend: Google Apps Script (REST JSON)
 * SPA murni: URL tidak berubah. Panggilan data = fetch POST text/plain ke GAS_URL (js/config.js).
 * Token sesi HMAC dikirim lewat body (bukan URL). Cache lokal + prefetch batch agar pindah menu instan.
 * ============================================================
 */
(function () {
'use strict';

// ════════════════════════════════════════════════════════
// BAGIAN 1: KONSTANTA, STATE, UTILITAS
// ════════════════════════════════════════════════════════
const LOGO = './assets/logo.png';
const IDLE_MS = 12 * 60 * 60 * 1000;   // sama dengan masa sesi server (SESI_JAM = 12)
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const ROLE_LABEL = { Admin: 'Admin', Pengurus: 'Pengurus RT', Warga: 'Warga' };
const PAGE_SIZE = 10;

const S = { token: null, user: null, config: {}, page: null, nav: 0, cache: {}, last: Date.now(), ui: {}, store: {} };

const $ = (sel, root) => (root || document).querySelector(sel);
const setText = (sel, v) => { const el = $(sel); if (el) el.textContent = v; };
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const A = {}, F = {}, I = {}, C = {}; // penangan: klik, submit, input, change

const isStaff = () => S.user && (S.user.role === 'Admin' || S.user.role === 'Pengurus');
const isAdmin = () => S.user && S.user.role === 'Admin';

function rp(n) {
  n = Math.round(Number(n) || 0);
  return (n < 0 ? '-Rp ' : 'Rp ') + Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function parts(s) { const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(String(s || '')); return m ? { y: +m[1], m: +m[2], d: +m[3], hh: m[4], mm: m[5] } : null; }
function fmtDate(s) { const p = parts(s); return p ? p.d + ' ' + MONTHS[p.m - 1] + ' ' + p.y : '-'; }
function fmtDateTime(s) { const p = parts(s); return p ? fmtDate(s) + (p.hh ? ' • ' + p.hh + ':' + p.mm + ' WIB' : '') : '-'; }
function fmtDateLong(s) {
  const p = parts(s); if (!p) return '-';
  return DAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()] + ', ' + p.d + ' ' + MONTHS[p.m - 1] + ' ' + p.y;
}
function todayISO() { return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10); }
function hourWIB() { return new Date(Date.now() + 7 * 3600 * 1000).getUTCHours(); }
function initials(name) {
  const w = String(name || '?').replace(/^(bpk|bapak|ibu|sdr|sdri)\.?\s+/i, '').trim().split(/\s+/);
  return ((w[0] || '?')[0] + (w.length > 1 ? w[1][0] : '')).toUpperCase();
}
function debounce(fn, ms) { let t; return function () { const a = arguments; clearTimeout(t); t = setTimeout(() => fn.apply(null, a), ms); }; }
function shortId(id) { return String(id || '').replace(/^[a-z]+-/, '').slice(0, 6).toUpperCase(); }
function digits(v) { return String(v || '').replace(/\D/g, ''); }
function moneyFmt(v) { const d = digits(v).replace(/^0+(?=\d)/, ''); return d.replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
function moneyVal(v) { return Number(digits(v)) || 0; }
// Input nominal "ribuan": ketik 50 → Rp 50.000 (tiga nol otomatis). Untuk Rp 2.500 ketik 2,5
function ribuFmt(raw) {
  const s = String(raw == null ? '' : raw).replace(/[^\d,]/g, '');
  const i = s.indexOf(',');
  let a = i >= 0 ? s.slice(0, i) : s;
  const b = i >= 0 ? s.slice(i + 1).replace(/,/g, '').slice(0, 3) : null;
  a = a.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return b === null ? a : (a || '0') + ',' + b;
}
function ribuVal(v) { const n = parseFloat(String(v || '').replace(/\./g, '').replace(',', '.')); return isFinite(n) ? Math.round(n * 1000) : 0; }
function ribuFromRp(n) {
  n = Math.round(Number(n) || 0); if (!n) return '';
  if (n % 1000 === 0) return ribuFmt(String(n / 1000));
  return ribuFmt(Math.floor(n / 1000) + ',' + String(n % 1000).padStart(3, '0').replace(/0+$/, ''));
}
function ribuBox(o) {
  return '<div class="rpbox' + (o.sm ? ' sm' : '') + '"><span class="pre">Rp</span><input' + (o.id ? ' id="' + o.id + '"' : '') + (o.name ? ' name="' + o.name + '"' : '') + ' class="input" inputmode="decimal" autocomplete="off" placeholder="0" data-input="ribu" value="' + esc(ribuFromRp(o.value)) + '"' + (o.req ? ' required' : '') + (o.attrs ? ' ' + o.attrs : '') + '><span class="suf">.000</span></div>' +
    (o.prev ? '<span class="help rpprev">' + (o.value ? '= ' + rp(o.value) : 'Ketik angka ribuan: 50 = Rp 50.000') + '</span>' : '');
}
function roleBadge(role) { return '<span class="badge' + (role === 'Admin' ? ' bad' : role === 'Pengurus' ? '' : ' gray') + '">' + esc(ROLE_LABEL[role] || role) + '</span>'; }
function statusBadge(st) {
  const cls = st === 'Baru' ? 'new' : st === 'Diproses' ? 'warn' : st === 'Selesai' ? 'ok' : 'gray';
  return '<span class="badge ' + cls + '">' + esc(st) + '</span>';
}
function paginate(items, page, size) {
  const total = items.length, pages = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(1, page || 1), pages);
  return { rows: items.slice((p - 1) * size, p * size), page: p, pages: pages, total: total, from: total ? (p - 1) * size + 1 : 0, to: Math.min(total, p * size) };
}
function pagerHtml(pg, act) {
  if (pg.total <= 0) return '';
  let btns = '';
  const win = [];
  for (let i = 1; i <= pg.pages; i++) if (i === 1 || i === pg.pages || Math.abs(i - pg.page) <= 1) win.push(i);
  let prev = 0;
  win.forEach(i => { if (i - prev > 1) btns += '<span class="muted" aria-hidden="true">…</span>'; btns += '<button type="button" data-act="' + act + '" data-p="' + i + '"' + (i === pg.page ? ' aria-current="true"' : '') + ' aria-label="Halaman ' + i + '">' + i + '</button>'; prev = i; });
  return '<div class="pager"><span class="small muted">Menampilkan ' + pg.from + '–' + pg.to + ' dari ' + pg.total + '</span><div class="pages">' +
    '<button type="button" data-act="' + act + '" data-p="' + (pg.page - 1) + '"' + (pg.page <= 1 ? ' disabled' : '') + ' aria-label="Sebelumnya"><i class="bi bi-chevron-left"></i></button>' + btns +
    '<button type="button" data-act="' + act + '" data-p="' + (pg.page + 1) + '"' + (pg.page >= pg.pages ? ' disabled' : '') + ' aria-label="Berikutnya"><i class="bi bi-chevron-right"></i></button></div></div>';
}
function emptyHtml(icon, title, text) { return '<div class="empty"><i class="bi ' + icon + '"></i><b>' + esc(title) + '</b>' + (text ? '<span>' + esc(text) + '</span>' : '') + '</div>'; }
function skeleton() { return '<div class="page" aria-busy="true"><div class="skeleton sk-card"></div><div class="grid kpi"><div class="skeleton" style="height:96px"></div><div class="skeleton" style="height:96px"></div><div class="skeleton" style="height:96px"></div><div class="skeleton" style="height:96px"></div></div><div class="skeleton sk-card mt-2" style="height:200px"></div></div>'; }
function pageHead(o) {
  return '<div class="page-head"><div>' + (o.eyebrow ? '<div class="eyebrow">' + esc(o.eyebrow) + '</div>' : '') + '<h1>' + esc(o.title) + '</h1>' + (o.sub ? '<p>' + esc(o.sub) + '</p>' : '') + '</div>' + (o.actions ? '<div class="page-actions">' + o.actions + '</div>' : '') + '</div>';
}
function setBusy(btn, on, label) {
  if (!btn) return;
  if (on) { btn.dataset.html = btn.innerHTML; btn.classList.add('is-loading'); btn.setAttribute('aria-busy', 'true'); btn.innerHTML = '<span class="spin"></span> ' + (label || 'Memproses…'); }
  else { btn.classList.remove('is-loading'); btn.removeAttribute('aria-busy'); if (btn.dataset.html != null) btn.innerHTML = btn.dataset.html; }
}
function copyText(t) {
  const fallback = () => { const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { /* abaikan */ } ta.remove(); return ok; };
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).then(() => true, () => fallback());
  return Promise.resolve(fallback());
}

// ── Toast ──
function toast(msg, type, ms) {
  const root = $('#toastRoot');
  const icon = { ok: 'bi-check-circle-fill', bad: 'bi-x-octagon-fill', warn: 'bi-exclamation-triangle-fill', info: 'bi-info-circle-fill' }[type || 'info'];
  const el = document.createElement('div');
  el.className = 'toast ' + (type || 'info');
  el.innerHTML = '<i class="bi ' + icon + '"></i><span>' + esc(msg) + '</span>';
  root.appendChild(el);
  while (root.children.length > 3) root.removeChild(root.firstChild);
  setTimeout(() => el.remove(), ms || (type === 'bad' ? 6000 : 3800));
}
function fail(e) { if (e && e.code === 'AUTH') return; toast((e && e.message) || 'Terjadi kesalahan.', 'bad'); }

// ── Modal ──
const modals = [];
function openModal(o) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-root';
  const opener = document.activeElement;
  const tid = 'mt' + Date.now() + Math.floor(Math.random() * 1000);
  wrap.innerHTML = '<div class="modal' + (o.wide ? ' wide' : '') + '" role="dialog" aria-modal="true" aria-labelledby="' + tid + '" tabindex="-1">' +
    '<div class="modal-head"><h3 id="' + tid + '">' + esc(o.title) + '</h3><button class="btn outline icon" type="button" data-act="modal-close" aria-label="Tutup"><i class="bi bi-x-lg"></i></button></div>' +
    '<div class="modal-body">' + (o.body || '') + '</div>' + (o.footer ? '<div class="modal-foot">' + o.footer + '</div>' : '') + '</div>';
  $('#modalRoot').appendChild(wrap);
  document.body.style.overflow = 'hidden';
  const m = { el: wrap, body: $('.modal-body', wrap), close: function () {
    if (!wrap.parentNode) return;
    wrap.remove(); const i = modals.indexOf(m); if (i >= 0) modals.splice(i, 1);
    if (!modals.length) document.body.style.overflow = '';
    if (opener && opener.focus && document.contains(opener)) opener.focus();
    if (o.onClose) o.onClose();
  } };
  modals.push(m);
  wrap.addEventListener('mousedown', e => { if (e.target === wrap) m.close(); });
  setTimeout(() => { const f = $('input:not([type=hidden]):not([type=file]), select, textarea', wrap); (f || $('.modal', wrap)).focus(); }, 40);
  if (o.onOpen) o.onOpen(wrap, m);
  return m;
}
function closeTopModal() { const m = modals[modals.length - 1]; if (m) m.close(); }
A['modal-close'] = el => { const root = el.closest('.modal-root'); const m = modals.find(x => x.el === root); if (m) m.close(); };
document.addEventListener('keydown', e => {
  if (!modals.length) return;
  if (e.key === 'Escape') { closeTopModal(); return; }
  if (e.key === 'Tab') {
    const root = modals[modals.length - 1].el;
    const f = $$('button:not([disabled]), input:not([disabled]):not([type=hidden]), select, textarea, a[href]', root).filter(x => x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});
function confirmDialog(o) {
  return new Promise(resolve => {
    let done = false;
    const m = openModal({
      title: o.title || 'Konfirmasi', body: '<p>' + esc(o.message || '') + '</p>',
      footer: '<button type="button" class="btn outline" data-act="modal-close" id="cfNo">Batal</button><button type="button" class="btn' + (o.danger ? ' danger' : '') + '" id="cfYes">' + esc(o.okText || 'Ya, lanjutkan') + '</button>',
      onClose: () => { if (!done) { done = true; resolve(false); } },
      onOpen: w => { $('#cfYes', w).addEventListener('click', () => { done = true; resolve(true); m.close(); }); }
    });
  });
}

// ── Berkas: kompres foto di HP, unduh, pratinjau ──
function compressImage(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error('Pilih berkas gambar (JPG atau PNG).'));
    if (file.size > 15 * 1024 * 1024) return reject(new Error('Ukuran foto terlalu besar (maksimal 15 MB).'));
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
      let q = 0.74, data = c.toDataURL('image/jpeg', q);
      while (data.length > 1.9e6 && q > 0.35) { q -= 0.1; data = c.toDataURL('image/jpeg', q); }
      resolve({ dataUrl: data, base64: data.split(',')[1], mime: 'image/jpeg' });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Foto tidak dapat dibaca. Coba foto lain (JPG/PNG).')); };
    img.src = url;
  });
}
function readPdf(file) {
  return new Promise((resolve, reject) => {
    if (!file || file.type !== 'application/pdf') return reject(new Error('Lampiran harus berformat PDF.'));
    if (file.size > 2.8 * 1024 * 1024) return reject(new Error('Ukuran PDF maksimal sekitar 2,8 MB.'));
    const r = new FileReader();
    r.onload = () => resolve({ base64: String(r.result).split(',')[1], mime: 'application/pdf', name: file.name });
    r.onerror = () => reject(new Error('PDF tidak dapat dibaca.'));
    r.readAsDataURL(file);
  });
}
function saveFile(f) {
  const bin = atob(f.base64), arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([arr], { type: f.mime }));
  const a = document.createElement('a'); a.href = url; a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
async function downloadFile(source, id, btn) {
  try { setBusy(btn, true, 'Mengunduh…'); const f = await call('file.data', { source: source, id: id }); saveFile(f); }
  catch (e) { fail(e); } finally { setBusy(btn, false); }
}
function previewFile(source, id, title) {
  const m = openModal({
    title: title || 'Pratinjau berkas', wide: true,
    body: '<div class="center muted" style="padding:32px"><span class="spin"></span><p class="mt-1">Memuat berkas…</p></div>',
    footer: '<button type="button" class="btn outline" data-act="modal-close">Tutup</button><button type="button" class="btn" id="pvDl" disabled><i class="bi bi-download"></i> Unduh</button>'
  });
  call('file.data', { source: source, id: id }).then(f => {
    if (!m.el.parentNode) return;
    if (/^image\//.test(f.mime)) m.body.innerHTML = '<img class="preview-img" alt="Pratinjau" src="data:' + esc(f.mime) + ';base64,' + f.base64 + '">';
    else m.body.innerHTML = '<div class="empty"><i class="bi bi-file-earmark-pdf"></i><b>' + esc(f.name) + '</b><span>Pratinjau PDF tidak tersedia di dalam aplikasi. Tekan Unduh untuk membukanya.</span></div>';
    const b = $('#pvDl', m.el); b.disabled = false; b.onclick = () => saveFile(f);
  }).catch(e => { m.close(); fail(e); });
}

// ════════════════════════════════════════════════════════
// BAGIAN 2: PANGGILAN SERVER (fetch → GAS REST) + CACHE BERLAPIS
//  - POST text/plain (tanpa preflight CORS), token di body (bukan URL)
//  - Cache memori (segar 15 dtk) + cache lokal (tampil instan saat aplikasi dibuka)
//  - Pembacaan yang sama dibagi satu permintaan (dedupe), bacaan gagal dicoba ulang 1x
//  - Prefetch semua menu sekali jalan (batch) agar pindah menu terasa instan
// ════════════════════════════════════════════════════════
const CFG = window.SIMAJU_CONFIG || {};
const GAS_URL = String(CFG.GAS_URL || '').trim();
const READ_RE = /^(beranda|pg\.list|lap\.list|kas\.list|arisan\.(overview|detail|tracking|setoranForm)|iuran\.overview|pengurus\.list|kk\.list|akun\.list|log\.list|config\.get|crm\.(list|riwayat)|blast\.list|notif\.status|rahasia\.status|file\.data|warga\.cari|kel\.get|susulan\.(list|form)|impor\.info)$/;
const FRESH_MS = 15000;
const SESS_KEY = 'simaju-sess', CACHE_PFX = 'simaju-c:';
const LS = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* abaikan */ } },
  keys(pfx) { const o = []; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf(pfx) === 0) o.push(k); } } catch (e) { /* abaikan */ } return o; }
};
const netErr = m => { const e = new Error(m || 'Koneksi bermasalah. Periksa jaringan Anda lalu coba lagi.'); e.code = 'NET'; return e; };

function post(body, timeoutMs) {
  if (!GAS_URL || /XXXX/.test(GAS_URL)) return Promise.reject(netErr('Alamat server belum diisi. Edit js/config.js lalu isi GAS_URL.'));
  const ctl = 'AbortController' in window ? new AbortController() : null;
  const to = ctl && setTimeout(() => ctl.abort(), timeoutMs || 30000);
  return fetch(GAS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined, redirect: 'follow' })
    .then(r => r.json().catch(() => { throw netErr('Server mengirim balasan yang tidak dikenal. Pastikan Web App di-deploy untuk "Anyone".'); }))
    .then(j => { netBar(false); return j; }, e => { if (e && e.code === 'NET') throw e; netBar(true); throw netErr(); })
    .finally(() => { if (to) clearTimeout(to); });
}
function getPublic(action) {
  if (!GAS_URL || /XXXX/.test(GAS_URL)) return Promise.reject(netErr('Alamat server belum diisi. Edit js/config.js lalu isi GAS_URL.'));
  return fetch(GAS_URL + '?action=' + encodeURIComponent(action), { redirect: 'follow' })
    .then(r => r.json()).then(j => { netBar(false); return j; }, () => { netBar(true); throw netErr(); });
}
function netBar(off) { const b = document.getElementById('netBar'); if (b) b.hidden = !off; }
window.addEventListener('online', () => netBar(false));
window.addEventListener('offline', () => netBar(true));

// ── Cache lokal per pengguna ──
function pcKey(k) { return CACHE_PFX + (S.user ? S.user.id_user : 'pub') + ':' + k; }
function pcGet(k) { const v = LS.get(pcKey(k)); if (!v) return null; try { return JSON.parse(v); } catch (e) { return null; } }
function pcSet(k, data) { const s = JSON.stringify({ t: Date.now(), data: data }); if (s.length < 700000) LS.set(pcKey(k), s); }
function pcClear() { LS.keys(CACHE_PFX).forEach(k => LS.del(k)); }

// ── Sesi tersimpan (token HMAC bergulir 12 jam; dihapus saat keluar) ──
function persistSession() {
  if (!(S.token && S.user)) return;
  const v = JSON.stringify({ token: S.token, user: S.user, config: S.config, last: S.last, ingat: !!S.ingat });
  if (S.ingat) { LS.set(SESS_KEY, v); try { sessionStorage.removeItem(SESS_KEY); } catch (e) { /* abaikan */ } }
  else { let ok = false; try { sessionStorage.setItem(SESS_KEY, v); ok = true; } catch (e) { /* abaikan */ } if (ok) LS.del(SESS_KEY); else LS.set(SESS_KEY, v); }
}
let _lastSaved = 0;
function touch() { S.last = Date.now(); if (S.token && S.last - _lastSaved > 30000) { _lastSaved = S.last; persistSession(); } }
function restoreSession() {
  let raw = LS.get(SESS_KEY); if (!raw) { try { raw = sessionStorage.getItem(SESS_KEY); } catch (e) { raw = null; } }
  if (!raw) return false;
  try {
    const o = JSON.parse(raw);
    if (!o || !o.token || !o.user || Date.now() - (o.last || 0) > (o.ingat ? INGAT_MS : IDLE_MS)) { clearPersisted(); return false; }
    S.token = o.token; S.user = o.user; S.ingat = !!o.ingat; S.last = Date.now(); applyConfig(o.config); return true;
  } catch (e) { clearPersisted(); return false; }
}
function clearPersisted() { LS.del(SESS_KEY); try { sessionStorage.removeItem(SESS_KEY); } catch (e) { /* abaikan */ } pcClear(); }

// ── Panggilan ──
const inflight = {};
let epoch = 0;
function handleRes(res) {
  if (res && res.newToken && S.token) { S.token = res.newToken; persistSession(); }
  if (res && res.success) return res.data;
  const err = new Error((res && res.message) || 'Terjadi kesalahan.');
  err.code = res && res.code;
  if (err.code === 'AUTH') sessionEnded(err.message);
  throw err;
}
function attempt(body, tries, timeoutMs) {
  return post(body, timeoutMs).catch(e => {
    if (e.code === 'NET' && tries > 1 && navigator.onLine !== false) return new Promise(r => setTimeout(r, 900)).then(() => attempt(body, tries - 1));
    throw e;
  });
}
function call(action, payload, timeoutMs) {
  touch();
  const read = READ_RE.test(action);
  const key = read ? action + '|' + JSON.stringify(payload || {}) + '|' + epoch : null;
  if (key && inflight[key]) return inflight[key];
  if (!read) epoch++;
  const p = attempt({ action: action, token: S.token, payload: payload || {} }, read ? 2 : 1, timeoutMs).then(handleRes);
  if (key) { inflight[key] = p; const done = () => { delete inflight[key]; }; p.then(done, done); }
  return p;
}
/** Tampilkan data tersimpan lebih dulu (instan), lalu segarkan dari server bila sudah tidak segar. */
function load(action, payload, key, nav, render, container) {
  const k = key || action;
  let c = S.cache[k], fromDisk = false;
  if (!c) { const p = pcGet(k); if (p) { c = { data: p.data, t: 0 }; fromDisk = true; } }
  if (c) render(c.data, true);
  if (c && !fromDisk && Date.now() - c.t < FRESH_MS) return Promise.resolve();
  return call(action, payload).then(d => {
    S.cache[k] = { data: d, t: Date.now() }; pcSet(k, d);
    if (S.nav === nav) render(d, false);
  }).catch(e => {
    if (e.code === 'AUTH' || S.nav !== nav) return;
    if (!c) { $('#app-container').innerHTML = '<div class="page card">' + emptyHtml('bi-wifi-off', 'Gagal memuat data', e.message) + '<div class="center"><button class="btn" data-act="reload">Coba lagi</button></div></div>'; }
    else if (e.code !== 'NET') fail(e); else toast('Offline — menampilkan data tersimpan.', 'warn');
  });
}
function invalidate() { S.cache = {}; LS.keys(CACHE_PFX + (S.user ? S.user.id_user : 'pub') + ':').forEach(k => LS.del(k)); schedulePrefetch(2500); }
A.reload = () => navigate(S.page, true);

// ── Prefetch: isi cache semua menu dengan 1–2 permintaan batch ──
let _pf = 0;
function prefetchPlan() {
  if (!S.user) return [];
  const umum = [{ action: 'warga.cari', key: 'warga.cari' }, { action: 'susulan.list', key: 'susulan.list' }, { action: 'susulan.form', key: 'susulan.form' }];
  if (!isStaff()) return [{ action: 'lap.list', key: 'lap.list' }, { action: 'kas.list', key: 'kas.list' }, { action: 'arisan.tracking', key: 'trw:' }].concat(umum).map(x => Object.assign({ payload: {} }, x));
  const l = [
    { action: 'pg.list', key: 'pg.list' }, { action: 'lap.list', key: 'lap.list' }, { action: 'kas.list', key: 'kas.list' },
    { action: 'arisan.overview', key: 'arisan:aktif' }, { action: 'iuran.overview', key: 'iuran:now' }, { action: 'pengurus.list', key: 'pengurus.list' },
    { action: 'kk.list', key: 'kk.list' }, { action: 'crm.list', key: 'crm.list' }
  ];
  l.push.apply(l, umum);
  if (isAdmin()) l.push({ action: 'akun.list', key: 'akun.list' }, { action: 'config.get', key: 'config.get' });
  return l.map(x => Object.assign({ payload: {} }, x));
}
function schedulePrefetch(ms) {
  clearTimeout(_pf);
  if (!S.token || (navigator.connection && navigator.connection.saveData)) return;
  _pf = setTimeout(runPrefetch, ms || 1200);
}
async function runPrefetch() {
  const plan = prefetchPlan().filter(x => !(S.cache[x.key] && Date.now() - S.cache[x.key].t < 60000));
  const tok = S.token, ep = epoch;
  for (let i = 0; i < plan.length; i += 8) {
    if (S.token !== tok) return;
    const grp = plan.slice(i, i + 8);
    try {
      const res = await post({ action: 'batch', token: S.token, payload: { calls: grp.map(x => ({ action: x.action, key: x.key, payload: x.payload })) } });
      if (res && res.newToken && S.token) { S.token = res.newToken; persistSession(); }
      if (epoch !== ep) return;   // ada penulisan saat prefetch berjalan: buang hasil lama
      if (!res || !res.success) { if (res && res.code === 'AUTH') sessionEnded(res.message); return; }
      res.data.results.forEach(r => { if (r.success && r.key) { S.cache[r.key] = { data: r.data, t: Date.now() }; pcSet(r.key, r.data); } });
    } catch (e) { return; }
  }
}

// ════════════════════════════════════════════════════════
// BAGIAN 3: TEMA, KONFIGURASI, SESI
// ════════════════════════════════════════════════════════
function applyTheme(t, noSave) {
  document.documentElement.setAttribute('data-theme', t);
  if (!noSave) { try { localStorage.setItem('simaju-theme', t); } catch (e) { /* mode privat: abaikan */ } }
  try { applyAccent(); } catch (e) { /* warna kustom belum siap: abaikan */ }
  const i = $('#themeBtn i'); if (i) i.className = t === 'dark' ? 'bi bi-sun' : 'bi bi-moon-stars';
  const sw = $('#darkSwitch'); if (sw) sw.checked = t === 'dark';
}
function initTheme() {
  let t = null;
  try { t = localStorage.getItem('simaju-theme'); } catch (e) { /* abaikan */ }
  const eksplisit = t === 'dark' || t === 'light';
  if (!eksplisit) t = (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  applyTheme(t, !eksplisit);
}
function toggleTheme() { applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); }

function applyConfig(cfg) {
  S.config = Object.assign(S.config, cfg || {});
  const c = S.config;
  const rt = [c.nama_rt, (c.nama_desa || '').replace(/^Desa\s+/i, '')].filter(String).join(' ') || 'RT 05 / RW 07 Tengguli';
  $$('.js-rt').forEach(e => { e.textContent = rt; });
  setText('#authSub', rt);
  const src = c.logo_url && /^https:\/\//i.test(c.logo_url) ? c.logo_url : LOGO;
  $$('img.js-logo').forEach(i => { i.src = src; i.onerror = () => { i.onerror = null; i.src = LOGO; }; });
}

function showAuth(which) {
  $('#boot').hidden = true; $('#app').hidden = true; $('#authScreen').hidden = false;
  const info = $('#loginInfo'); if (info && which !== 'login') info.hidden = true;
  const back = $('#loginBack'); if (back) back.hidden = which !== 'login';
  $('#loginForm').hidden = which !== 'login'; $('#pwForm').hidden = which !== 'pw'; $('#lupaForm').hidden = which !== 'lupa';
  if (which === 'login') prefillUser();
  const f = which === 'login' ? $('#loginUser') : which === 'lupa' ? $('#lupaUser') : $('#pwOld'); setTimeout(() => f && f.focus(), 50);
}
function resetSession() {
  clearPersisted(); clearTimeout(_pf);
  S.token = null; S.user = null; S.cache = {}; S.ui = {}; S.store = {};
  while (modals.length) modals[0].close();
  $('#app-container').innerHTML = '';
}
function sessionEnded(msg) {
  if (!S.token) return;
  resetSession();
  showAuth('login');
  const e = $('#loginErr'); e.textContent = msg || 'Sesi berakhir. Silakan masuk kembali.'; e.hidden = false;
}
function doLogout() {
  const t = S.token;
  if (t) post({ action: 'logout', token: t }, 8000).catch(() => {});
  resetSession(); $('#loginForm').reset(); $('#loginErr').hidden = true; S.after = null; enterGuest();
}
A.logout = () => { confirmDialog({ title: 'Keluar dari SI-MAJU?', message: 'Anda perlu masuk lagi untuk membuka aplikasi.', okText: 'Keluar' }).then(ok => { if (ok) doLogout(); }); };

function bindAuth() {
  $$('.js-togglepw').forEach(b => b.addEventListener('click', () => {
    const inp = document.getElementById(b.dataset.target); const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password'; b.firstElementChild.className = show ? 'bi bi-eye-slash' : 'bi bi-eye'; b.setAttribute('aria-label', show ? 'Sembunyikan password' : 'Tampilkan password');
  }));
  $('#loginForm').addEventListener('submit', e => {
    e.preventDefault();
    const u = $('#loginUser').value.trim(), p = $('#loginPass').value, err = $('#loginErr'), btn = $('#loginBtn');
    err.hidden = true;
    if (!u || !p) { err.textContent = 'Isi username dan password.'; err.hidden = false; return; }
    setBusy(btn, true, 'Memeriksa…');
    const ing = !!($('#loginIngat') && $('#loginIngat').checked);
    post({ action: 'login', payload: { username: u, password: p, ingat: ing } }).then(res => {
      setBusy(btn, false);
      if (!res || !res.success) { err.textContent = (res && res.message) || 'Gagal masuk.'; err.hidden = false; $('#loginPass').value = ''; $('#loginPass').focus(); return; }
      S.token = res.data.token; S.user = res.data.user; S.ingat = ing; S.last = Date.now(); applyConfig(res.data.config);
      if (ing) LS.set(USER_KEY, u); else LS.del(USER_KEY);
      $('#loginForm').reset();
      if (res.data.mustChange) { showAuth('pw'); } else enterApp();
    }).catch(er => { setBusy(btn, false); err.textContent = er.message || 'Koneksi bermasalah. Coba lagi.'; err.hidden = false; });
  });
  $('#pwForm').addEventListener('submit', e => {
    e.preventDefault();
    const o = $('#pwOld').value, n = $('#pwNew').value, n2 = $('#pwNew2').value, err = $('#pwErr'), btn = $('#pwBtn');
    err.hidden = true;
    const bad = m => { err.textContent = m; err.hidden = false; };
    if (n.length < 8) return bad('Password baru minimal 8 karakter.');
    if (n !== n2) return bad('Ulangi password baru dengan sama persis.');
    if (n === o) return bad('Password baru harus berbeda dari password lama.');
    setBusy(btn, true, 'Menyimpan…');
    call('pwd.change', { oldPassword: o, newPassword: n }).then(() => { toast('Password berhasil diubah.', 'ok'); $('#pwForm').reset(); enterApp(); })
      .catch(er => { if (er.code !== 'AUTH') bad(er.message); }).finally(() => setBusy(btn, false));
  });
  $('#pwCancel').addEventListener('click', doLogout);
  $('#themeBtn').addEventListener('click', toggleTheme);
  $('#userChip').addEventListener('click', () => navigate('menu'));
  $('#avatarBtn').addEventListener('click', () => navigate('menu'));
}

// ════════════════════════════════════════════════════════
// BAGIAN 4: NAVIGASI SPA (tanpa reload, tanpa ubah URL)
// ════════════════════════════════════════════════════════
const ROUTES = {
  beranda: { title: 'Beranda', icon: 'bi-house-door', render: n => pageBeranda(n) },
  pengumuman: { title: 'Pengumuman', icon: 'bi-megaphone', roles: ['Admin', 'Pengurus'], render: n => pagePengumuman(n) },
  lapor: { title: 'Laporan Fasilitas', icon: 'bi-exclamation-triangle', render: n => pageLapor(n) },
  kas: { title: 'Kas RT', icon: 'bi-wallet2', render: n => pageKas(n) },
  arisan: { title: 'Arisan Warga', icon: 'bi-people', render: n => pageArisan(n) },
  iuran: { title: 'Iuran Kas', icon: 'bi-cash-coin', roles: ['Admin', 'Pengurus'], render: n => { S.ui.iu = null; pageIuran(n); } },
  pengurus: { title: 'Pengurus RT', icon: 'bi-person-badge', roles: ['Admin', 'Pengurus'], render: n => pagePengurus(n) },
  cari: { title: 'Cari Warga', icon: 'bi-search', render: n => pageCari(n) },
  susulan: { title: 'Bayar Susulan', icon: 'bi-cash-stack', render: n => pageSusulan(n) },
  kk: { title: 'Data Warga (KK)', icon: 'bi-person-vcard', roles: ['Admin', 'Pengurus'], render: n => pageKK(n) },
  crm: { title: 'Kontak & WhatsApp', icon: 'bi-chat-dots', roles: ['Admin', 'Pengurus'], render: n => pageCrm(n) },
  akun: { title: 'Kelola Akun', icon: 'bi-person-gear', roles: ['Admin'], render: n => pageAkun(n) },
  log: { title: 'Log Aktivitas', icon: 'bi-clock-history', roles: ['Admin'], render: n => pageLog(n) },
  pengaturan: { title: 'Pengaturan', icon: 'bi-gear', roles: ['Admin'], render: n => pagePengaturan(n) },
  menu: { title: 'Akun & Menu', icon: 'bi-person-circle', render: n => pageMenu(n) }
};
const SIDE_ORDER = ['beranda', 'pengumuman', 'lapor', 'kas', 'iuran', 'arisan', 'susulan', 'cari', 'pengurus', 'kk', 'crm', 'akun', 'log', 'pengaturan'];
function routeAllowed(id) { const r = ROUTES[id]; if (!r) return false; if (!S.user) return !r.roles; return !r.roles || r.roles.indexOf(S.user.role) >= 0; }
function routeTitle(id) { return id === 'lapor' && isStaff() ? 'Kelola Laporan' : id === 'arisan' && !isStaff() ? 'Tracking & Catatan' : ROUTES[id].title; }

function buildNav() {
  const guest = !S.user;
  $('#sideNav').innerHTML = SIDE_ORDER.filter(routeAllowed).map(id =>
    '<button type="button" data-act="nav" data-to="' + id + '"><i class="bi ' + ROUTES[id].icon + '"></i><span>' + esc(routeTitle(id)) + '</span>' + (guest && id !== 'beranda' ? '<i class="bi bi-lock-fill nav-lock" aria-label="Perlu login"></i>' : '') + '</button>').join('') +
    (guest ? '<button type="button" class="nav-login" data-act="go-login"><i class="bi bi-box-arrow-in-right"></i><span>Masuk</span></button>' : '');
  const dock = (isStaff() ? [['beranda', 'Beranda', 'bi-house-door'], ['kas', 'Kas RT', 'bi-wallet2'], ['lapor', 'Laporan', 'bi-megaphone-fill', 'fab'], ['arisan', 'Arisan', 'bi-people']]
    : [['beranda', 'Beranda', 'bi-house-door'], ['arisan', 'Tracking', 'bi-arrow-left-right'], ['lapor', 'Lapor', 'bi-megaphone-fill', 'fab'], ['cari', 'Cari', 'bi-search']]).concat([guest ? ['login', 'Masuk', 'bi-box-arrow-in-right'] : ['menu', 'Menu', 'bi-grid']]);
  $('#dock').innerHTML = dock.map(d => d[0] === 'login'
    ? '<button type="button" data-act="go-login" aria-label="Masuk"><i class="bi ' + d[2] + '"></i><span>' + d[1] + '</span></button>'
    : '<button type="button" class="' + (d[3] || '') + '" data-act="nav" data-to="' + d[0] + '" aria-label="' + esc(d[1]) + (guest && d[0] === 'cari' ? ' (perlu login)' : '') + '"><i class="bi ' + d[2] + '"></i><span>' + d[1] + '</span>' + (guest && d[0] === 'cari' ? '<i class="bi bi-lock-fill dock-lock" aria-hidden="true"></i>' : '') + '</button>').join('');
  if (guest) return;
  const nm = S.user.nama;
  setText('#chipName', nm); setText('#chipRole', ROLE_LABEL[S.user.role]); setText('#chipAvatar', initials(nm)); setText('#avatarBtn', initials(nm));
}
function markNav(id) {
  const cur = ['menu'].indexOf(id) >= 0 ? 'menu' : id;
  $$('[data-act="nav"]').forEach(b => { if (b.dataset.to === cur) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  // di HP, halaman yang tidak ada di dock dianggap bagian "Menu"
  if (!$('#dock [data-to="' + id + '"]')) { const mb = $('#dock [data-to="menu"]'); if (mb) mb.setAttribute('aria-current', 'page'); }
  setText('#topTitle', id === 'menu' ? 'Akun Saya' : routeTitle(id));
}
function navigate(id, force) {
  if (!S.user && id !== 'beranda') return needLogin(id);   // gerbang: selain Beranda wajib login
  if (!routeAllowed(id)) id = 'beranda';
  if (force) delete S.cache[id];
  S.page = id; S.nav++;
  const nav = S.nav;
  markNav(id);
  const box = $('#app-container');
  box.innerHTML = skeleton();
  window.scrollTo(0, 0);
  try { ROUTES[id].render(nav); } catch (e) { box.innerHTML = '<div class="page card">' + emptyHtml('bi-bug', 'Halaman gagal ditampilkan', 'Muat ulang aplikasi lalu coba lagi.') + '</div>'; if (window.console) console.error(e); }
}
A.nav = el => { navigate(el.dataset.to); };
function paint(html) { const box = $('#app-container'); box.innerHTML = '<div class="page">' + html + '</div>'; }

function enterApp() {
  $('#boot').hidden = true; $('#authScreen').hidden = true; $('#app').hidden = false;
  $('#app').removeAttribute('data-guest'); S.cache = {}; S.last = Date.now(); persistSession(); schedulePrefetch(1500); refreshInstallUi();
  buildNav(); applyTheme(document.documentElement.getAttribute('data-theme'), true);
  const to = S.after && routeAllowed(S.after) ? S.after : 'beranda'; S.after = null;
  navigate(to);
}
// ── Mode tamu: hanya Beranda publik; menu lain wajib login ──
function enterGuest() {
  S.token = null; S.user = null;
  $('#boot').hidden = true; $('#authScreen').hidden = true; $('#app').hidden = false;
  $('#app').setAttribute('data-guest', '1');
  buildNav(); applyTheme(document.documentElement.getAttribute('data-theme'), true);
  navigate('beranda');
}
function needLogin(id) {
  S.after = ROUTES[id] ? id : null;
  showAuth('login');
  const info = $('#loginInfo');
  if (info) { info.textContent = ROUTES[id] ? 'Masuk dengan username dan password untuk membuka menu ' + ROUTES[id].title + '.' : ''; info.hidden = !ROUTES[id]; }
  const e = $('#loginErr'); if (e) e.hidden = true;
}
A['go-login'] = () => { S.after = null; showAuth('login'); const i = $('#loginInfo'); if (i) i.hidden = true; };
A['back-public'] = () => { S.after = null; enterGuest(); };
// Sesi habis bila lama tidak aktif (sejalan dengan masa token di server)
setInterval(() => { if (S.token && Date.now() - S.last > (S.ingat ? INGAT_MS : IDLE_MS)) sessionEnded('Sesi berakhir karena tidak ada aktivitas. Silakan masuk kembali.'); }, 60000);

// ── Hitung mundur (kumpulan RT) ──
function countdownHtml(jadwal, jam) {
  if (!jadwal) return '';
  return '<div class="countdown" data-countdown="' + esc(jadwal + 'T' + (jam || '19:30') + ':00+07:00') + '"></div>';
}
function tickCountdowns() {
  $$('[data-countdown]').forEach(el => {
    const t = Date.parse(el.dataset.countdown); if (isNaN(t)) return;
    let d = t - Date.now();
    if (d <= 0) { el.innerHTML = '<div style="flex:1;text-align:center;padding:10px"><b style="font-size:16px">Kumpulan sedang/telah berlangsung</b></div>'; return; }
    const days = Math.floor(d / 864e5); d -= days * 864e5; const hrs = Math.floor(d / 36e5); d -= hrs * 36e5; const min = Math.floor(d / 6e4);
    const box = (v, l) => '<div><b>' + String(v).padStart(2, '0') + '</b><small>' + l + '</small></div>';
    el.innerHTML = box(days, 'Hari') + box(hrs, 'Jam') + box(min, 'Menit');
  });
}
setInterval(tickCountdowns, 20000);

// ── Pendengar peristiwa (delegasi) ──
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = A[el.dataset.act];
  if (fn) { if (el.tagName === 'A' && !el.dataset.native) e.preventDefault(); fn(el, e); }
});
document.addEventListener('submit', e => { const f = e.target.closest('form[data-submit]'); if (!f) return; e.preventDefault(); const fn = F[f.dataset.submit]; if (fn) fn(f); });
document.addEventListener('input', e => { const el = e.target.closest('[data-input]'); if (!el) return; const fn = I[el.dataset.input]; if (fn) fn(el, e); });
document.addEventListener('change', e => { const el = e.target.closest('[data-change]'); if (!el) return; const fn = C[el.dataset.change]; if (fn) fn(el, e); });

// ════════════════════════════════════════════════════════
// BAGIAN 5: BERANDA
// ════════════════════════════════════════════════════════
function pageBeranda(nav) {
  if (S.user) return load('beranda', {}, 'beranda', nav, d => paintBeranda(d));
  // Tamu: data publik tanpa login — tampil instan dari cache lokal, lalu disegarkan
  let c = S.cache.pub, disk = false;
  if (!c) { const p = pcGet('beranda'); if (p) { c = { data: p.data, t: 0 }; disk = true; } }
  if (c) paintBeranda(c.data);
  if (c && !disk && Date.now() - c.t < FRESH_MS) return;
  getPublic('getPublicBeranda').then(res => {
    if (S.user || S.nav !== nav) return;
    if (res && res.success) { S.cache.pub = { data: res.data, t: Date.now() }; pcSet('beranda', res.data); paintBeranda(res.data); }
    else if (!c) $('#app-container').innerHTML = '<div class="page card">' + emptyHtml('bi-exclamation-circle', 'Beranda belum dapat dimuat', (res && res.message) || 'Coba lagi nanti.') + '</div>';
  }).catch(e => { if (!c && !S.user && S.nav === nav) $('#app-container').innerHTML = '<div class="page card">' + emptyHtml('bi-wifi-off', 'Gagal memuat data', e.message) + '<div class="center"><button class="btn" data-act="reload">Coba lagi</button></div></div>'; });
}

function excerpt(t, n) { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n).trim() + '…' : t; }

function pgCard(p, opts) {
  opts = opts || {};
  return '<article class="item"><div class="row wrap" style="gap:8px"><span class="badge' + (p.kategori === 'Berita' ? ' ok' : '') + '">' + esc(p.kategori) + '</span>' +
    (p.status && p.status !== 'Terbit' ? '<span class="badge ' + (p.status === 'Draft' ? 'warn' : 'gray') + '">' + esc(p.status) + '</span>' : '') +
    '<span class="small muted">' + esc(fmtDate(p.tanggal)) + ' • ' + esc(p.penulis) + '</span>' + (p.hasLampiran ? '<span class="badge gray"><i class="bi bi-paperclip"></i> PDF</span>' : '') + '</div>' +
    '<h3 class="mt-1">' + esc(p.judul) + '</h3><p class="muted mt-1">' + esc(excerpt(p.isi, opts.long ? 260 : 150)) + '</p>' +
    '<div class="row wrap mt-1" style="gap:8px"><button type="button" class="btn soft sm" data-act="pg-open" data-id="' + esc(p.id) + '"><i class="bi bi-book"></i> Baca selengkapnya</button>' +
    (opts.manage ? '<button type="button" class="btn outline sm" data-act="pg-edit" data-id="' + esc(p.id) + '"><i class="bi bi-pencil"></i> Ubah</button>' +
      (p.status !== 'Arsip' ? '<button type="button" class="btn outline sm" data-act="pg-archive" data-id="' + esc(p.id) + '"><i class="bi bi-archive"></i> Arsipkan</button>' : '') +
      '<button type="button" class="btn danger sm" data-act="pg-del" data-id="' + esc(p.id) + '"><i class="bi bi-trash"></i> Hapus</button>' : '') +
    '</div></article>';
}

function paintBeranda(d) {
  const a = d.arisan, k = d.kas, l = d.laporan, hr = hourWIB();
  const salam = hr < 11 ? 'Selamat pagi' : hr < 15 ? 'Selamat siang' : hr < 18 ? 'Selamat sore' : 'Selamat malam';
  S.store.pg = {}; d.pengumuman.forEach(p => { S.store.pg[p.id] = p; });
  const aktif = l.baru + l.diproses;
  const guest = !S.user;
  if (guest) S.config.kontak_darurat = d.kontakDarurat || '';
  const canReport = guest || S.user.role !== 'Pengurus';
  l.terbaru = l.terbaru || [];
  const rtName = $('.js-rt') ? $('.js-rt').textContent : '';

  const hero = '<section class="hero"><span class="eyebrow"><i class="bi bi-geo-alt-fill"></i> ' + esc(rtName) + '</span>' +
    '<h1>' + esc(salam) + (guest ? ', Warga' : ', ' + esc(S.user.nama)) + '</h1><p class="sub">Sistem Informasi dan Manajemen Warga RT liMa RW tuJuh</p>' +
    (guest ? '<div class="mt-2"><button type="button" class="btn light sm" data-act="go-login"><i class="bi bi-box-arrow-in-right"></i> Masuk untuk akses penuh</button></div>' : '') +
    '<div class="hero-split"><div><small>Kumpulan berikutnya</small><b>' + (a.jadwal ? esc(fmtDateLong(a.jadwal)) + ' • ' + esc(a.jam) + ' WIB' : 'Belum diumumkan') + '</b></div>' +
    '<div><small>Lokasi</small><b>' + esc(a.lokasi || 'Belum diumumkan') + '</b></div></div></section>';

  const staffUi = isStaff();
  const quick = '<div class="quick" role="group" aria-label="Pintasan"' + ' style="grid-template-columns:repeat(3,1fr)"' + '>' +
    '<button type="button" data-act="' + (canReport && !guest ? 'lapor-new' : 'nav') + '" data-to="lapor"><span class="item-ico bad"><i class="bi bi-wrench-adjustable"></i></span>' + (canReport ? 'Lapor' : 'Laporan') + '</button>' +
    '<button type="button" data-act="nav" data-to="arisan"><span class="item-ico warn"><i class="bi bi-' + (staffUi ? 'dice-5' : 'arrow-left-right') + '"></i></span>' + (staffUi ? 'Arisan' : 'Tracking') + '</button>' +
    '<button type="button" data-act="nav" data-to="susulan"><span class="item-ico warn"><i class="bi bi-cash-stack"></i></span>Bayar Susulan</button>' +
    '<button type="button" data-act="nav" data-to="cari"><span class="item-ico"><i class="bi bi-search"></i></span>Cari Warga</button>' +
    '<button type="button" data-act="nav" data-to="kas"><span class="item-ico ok"><i class="bi bi-wallet2"></i></span>Kas RT</button>' +
    '<button type="button" data-act="darurat"><span class="item-ico ok"><i class="bi bi-telephone"></i></span>Kontak Darurat</button></div>';

  const kpi = '<div class="grid kpi">' +
    '<div class="kpi-tile"><div class="row between"><span class="lbl">Saldo kas RT</span><span class="kpi-ico ok"><i class="bi bi-wallet2"></i></span></div><div class="val">' + rp(k.saldo) + '</div><div class="hint">Bulan ini: <span class="text-ok">+' + rp(k.masukBulanIni).replace('Rp ', 'Rp ') + '</span> • <span class="text-bad">-' + rp(k.keluarBulanIni) + '</span></div></div>' +
    '<div class="kpi-tile"><div class="row between"><span class="lbl">' + (l.scope === 'saya' ? 'Laporan saya' : 'Laporan fasilitas') + '</span><span class="kpi-ico bad"><i class="bi bi-exclamation-triangle"></i></span></div><div class="val">' + aktif + ' aktif</div><div class="hint">' + l.baru + ' baru • ' + l.diproses + ' diproses • ' + l.selesai + ' selesai</div></div>' +
    '<div class="kpi-tile"><div class="row between"><span class="lbl">Arisan warga</span><span class="kpi-ico"><i class="bi bi-dice-5"></i></span></div><div class="val">Putaran ' + a.putaranKe + (a.totalPutaran ? '/' + a.totalPutaran : '') + '</div><div class="hint">' + (guest ? esc(a.periodeNama || 'Arisan warga') : 'Terkumpul ' + rp(a.totalSetoranIni)) + '</div></div>' +
    '<div class="kpi-tile"><div class="row between"><span class="lbl">Agenda terdekat</span><span class="kpi-ico warn"><i class="bi bi-calendar-event"></i></span></div><div class="val" style="font-size:17px">' + (a.jadwal ? esc(fmtDate(a.jadwal)) : '—') + '</div><div class="hint truncate">' + esc(a.lokasi || 'Kumpulan & arisan warga') + '</div></div></div>';

  const pg = '<section class="card"><div class="card-head"><h3><i class="bi bi-megaphone"></i> Pengumuman &amp; Berita RT</h3>' + (staffUi ? '<button class="link-btn" type="button" data-act="nav" data-to="pengumuman">Lihat semua</button>' : '') + '</div>' +
    (d.pengumuman.length ? '<div class="list">' + d.pengumuman.map(p => pgCard(p)).join('') + '</div>' : emptyHtml('bi-megaphone', 'Belum ada pengumuman', 'Pengumuman dari pengurus akan tampil di sini.')) + '</section>';

  const lapList = l.terbaru.length ? '<section class="card"><div class="card-head"><h3><i class="bi bi-exclamation-triangle"></i> ' + (l.scope === 'semua' ? 'Laporan terbaru' : 'Laporan saya') + '</h3><button class="link-btn" type="button" data-act="nav" data-to="lapor">Lihat semua</button></div><div class="list">' +
    l.terbaru.map(r => '<div class="row" style="align-items:flex-start"><span class="item-ico ' + (r.status === 'Selesai' ? 'ok' : r.status === 'Diproses' ? 'warn' : '') + '"><i class="bi bi-wrench-adjustable"></i></span><div class="grow"><b class="truncate" style="display:block">' + esc(r.jenis) + ' — ' + esc(r.lokasi) + '</b><span class="small muted">' + esc(fmtDateTime(r.tanggal)) + '</span></div>' + statusBadge(r.status) + '</div>').join('') + '</div></section>' : '';

  const arisanCard = '<section class="hero"><span class="eyebrow"><i class="bi bi-dice-5-fill"></i> Undian berikutnya</span><h2>Putaran ke-' + a.putaranKe + '</h2>' +
    '<p class="sub">' + (a.jadwal ? esc(fmtDateLong(a.jadwal)) + ' • ' + esc(a.jam) + ' WIB' : 'Jadwal belum diumumkan') + '</p>' + countdownHtml(a.jadwal, a.jam) +
    '<div class="hero-split">' + (guest ? '<div><small>Sudah menerima</small><b>' + a.sudah + ' warga</b></div>' : '<div><small>Terkumpul</small><b>' + rp(a.totalSetoranIni) + '</b></div>') + '<div><small>Belum menerima</small><b>' + a.belum + ' warga</b></div></div>' +
    (a.pemenangTerakhir ? '<p class="small mt-2" style="opacity:.9">Pemenang putaran ' + a.pemenangTerakhir.putaran + ': <b>' + esc(a.pemenangTerakhir.nama) + '</b> (' + esc(fmtDate(a.pemenangTerakhir.tanggal)) + ')</p>' : '') +
    '<div class="mt-2"><button type="button" class="btn light sm" data-act="nav" data-to="arisan">' + (staffUi ? 'Lihat arisan' : (guest ? '<i class="bi bi-lock-fill"></i> ' : '') + 'Tracking &amp; catatan') + '</button></div></section>';

  const insight = '<section class="insight"><b><i class="bi bi-stars"></i> Ringkasan otomatis</b><ul>' + d.insights.map(t => '<li>' + esc(t) + '</li>').join('') + '</ul></section>';
  const cta = guest ? '<section class="card"><h3>Warga RT 05 / RW 07?</h3><p class="muted mt-1">Masuk dengan username dan password dari pengurus untuk melapor, melihat rincian kas, iuran, dan arisan.</p><button type="button" class="btn block mt-2" data-act="go-login"><i class="bi bi-box-arrow-in-right"></i> Masuk</button></section>'
    : canReport ? '<section class="card"><h3>Ada kerusakan atau aspirasi?</h3><p class="muted mt-1">Laporkan langsung lewat SI-MAJU. Pengurus RT akan menindaklanjuti.</p><button type="button" class="btn block mt-2" data-act="lapor-new"><i class="bi bi-plus-circle"></i> Buat laporan cepat</button></section>' : '';

  paint(hero + installBannerHtml() + '<div class="mt-2">' + quick + '</div><div class="mt-2">' + kpi + '</div>' +
    '<div class="grid side mt-2"><div class="stack">' + pg + lapList + '</div><div class="stack">' + arisanCard + insight + cta + '</div></div>');
  tickCountdowns();
}
A.darurat = () => {
  const t = String(S.config.kontak_darurat || '').trim();
  const tel = digits(t);
  openModal({
    title: 'Kontak Darurat',
    body: t ? '<p style="white-space:pre-wrap">' + esc(t) + '</p>' + (tel.length >= 6 ? '<a class="btn block mt-2" data-native="1" href="tel:' + esc(tel) + '"><i class="bi bi-telephone"></i> Hubungi</a>' : '') : emptyHtml('bi-telephone', 'Belum diatur', 'Pengurus dapat mengisi kontak darurat di menu Pengaturan.'),
    footer: '<button type="button" class="btn outline" data-act="modal-close">Tutup</button>'
  });
};

// ════════════════════════════════════════════════════════
// BAGIAN 6: PENGUMUMAN & BERITA
// ════════════════════════════════════════════════════════
function pagePengumuman(nav) {
  load('pg.list', {}, 'pg.list', nav, d => {
    S.store.pgAll = d.rows; S.store.pg = {}; d.rows.forEach(p => { S.store.pg[p.id] = p; });
    S.ui.pg = S.ui.pg || { q: '', kat: '', st: '', page: 1 };
    if (!$('#pgList')) {
      const u = S.ui.pg;
      paint(pageHead({ eyebrow: 'Informasi RT', title: 'Pengumuman & Berita', sub: 'Informasi resmi pengurus untuk seluruh warga.', actions: isStaff() ? '<button class="btn" type="button" data-act="pg-new"><i class="bi bi-plus-lg"></i> Tulis pengumuman</button>' : '' }) +
        '<div class="card flat"><div class="search"><i class="bi bi-search"></i><input id="pgQ" class="input" type="search" placeholder="Cari judul atau isi…" data-input="pg-q" value="' + esc(u.q) + '" aria-label="Cari pengumuman"></div>' +
        '<div class="chips mt-1" id="pgChips"></div></div><div id="pgList" class="list mt-2"></div><div id="pgPager"></div>');
    }
    paintPgList();
  });
}
function paintPgList() {
  const u = S.ui.pg, all = S.store.pgAll || [];
  const kats = [['', 'Semua'], ['Pengumuman', 'Pengumuman'], ['Berita', 'Berita']];
  let chips = kats.map(c => '<button type="button" class="chip" data-act="pg-kat" data-v="' + c[0] + '" aria-pressed="' + (u.kat === c[0]) + '">' + c[1] + '</button>').join('');
  if (isStaff()) chips += [['', 'Semua status'], ['Terbit', 'Terbit'], ['Draft', 'Draft'], ['Arsip', 'Arsip']].map(c => '<button type="button" class="chip" data-act="pg-st" data-v="' + c[0] + '" aria-pressed="' + (u.st === c[0]) + '">' + c[1] + '</button>').join('');
  $('#pgChips').innerHTML = chips;
  const q = u.q.toLowerCase();
  const rows = all.filter(p => (!u.kat || p.kategori === u.kat) && (!u.st || p.status === u.st) && (!q || (p.judul + ' ' + p.isi).toLowerCase().indexOf(q) >= 0));
  const pg = paginate(rows, u.page, 6); u.page = pg.page;
  $('#pgList').innerHTML = pg.rows.length ? pg.rows.map(p => pgCard(p, { long: true, manage: isStaff() })).join('') : '<div class="card">' + emptyHtml('bi-megaphone', 'Tidak ada pengumuman', q || u.kat || u.st ? 'Coba ubah kata kunci atau filter.' : 'Belum ada pengumuman.') + '</div>';
  $('#pgPager').innerHTML = pagerHtml(pg, 'pg-page');
}
I['pg-q'] = debounce(el => { S.ui.pg.q = el.value.trim(); S.ui.pg.page = 1; paintPgList(); }, 200);
A['pg-kat'] = el => { S.ui.pg.kat = el.dataset.v; S.ui.pg.page = 1; paintPgList(); };
A['pg-st'] = el => { S.ui.pg.st = el.dataset.v; S.ui.pg.page = 1; paintPgList(); };
A['pg-page'] = el => { S.ui.pg.page = +el.dataset.p; paintPgList(); window.scrollTo(0, 0); };
A['pg-open'] = el => {
  const p = (S.store.pg || {})[el.dataset.id]; if (!p) return;
  openModal({
    title: p.kategori, wide: true,
    body: '<div class="row wrap" style="gap:8px"><span class="small muted">' + esc(fmtDateLong(p.tanggal)) + ' • ' + esc(p.penulis) + '</span></div><h2 class="mt-1">' + esc(p.judul) + '</h2><div class="mt-2" style="white-space:pre-wrap;word-break:break-word;font-size:15px;line-height:24px">' + esc(p.isi) + '</div>',
    footer: '<button type="button" class="btn outline" data-act="modal-close">Tutup</button>' + (p.hasLampiran ? '<button type="button" class="btn" data-act="pg-dl" data-id="' + esc(p.id) + '"><i class="bi bi-download"></i> Unduh lampiran PDF</button>' : '')
  });
};
A['pg-dl'] = el => downloadFile('pengumuman', el.dataset.id, el);

function pgForm(p) {
  p = p || {};
  return '<form id="pgForm" class="form-grid two" data-submit="pg-save" novalidate><input type="hidden" name="id" value="' + esc(p.id || '') + '">' +
    '<div class="field span2"><label for="pgJudul">Judul <span class="req">*</span></label><input id="pgJudul" name="judul" class="input" maxlength="150" required value="' + esc(p.judul || '') + '"></div>' +
    '<div class="field"><label for="pgKat">Kategori</label><select id="pgKat" name="kategori" class="select"><option' + (p.kategori !== 'Berita' ? ' selected' : '') + '>Pengumuman</option><option' + (p.kategori === 'Berita' ? ' selected' : '') + '>Berita</option></select></div>' +
    '<div class="field"><label for="pgStatus">Status</label><select id="pgStatus" name="status" class="select">' + ['Terbit', 'Draft', 'Arsip'].map(s => '<option' + ((p.status || 'Terbit') === s ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></div>' +
    '<div class="field"><label for="pgTgl">Tanggal terbit</label><input id="pgTgl" name="tanggal" type="date" class="input" required value="' + esc(p.tanggal || todayISO()) + '"></div>' +
    '<div class="field"><label for="pgPdf">Lampiran PDF (opsional)</label><input id="pgPdf" name="pdf" type="file" accept="application/pdf" class="input"><span class="help">Maksimal ±2,8 MB.</span>' +
    (p.hasLampiran ? '<label class="check"><input type="checkbox" name="hapusLampiran"> Hapus lampiran yang ada</label>' : '') + '</div>' +
    '<div class="field span2"><label for="pgIsi">Isi <span class="req">*</span></label><textarea id="pgIsi" name="isi" class="textarea" style="min-height:160px" maxlength="5000" required>' + esc(p.isi || '') + '</textarea></div></form>';
}
function openPgForm(p) {
  openModal({ title: p ? 'Ubah pengumuman' : 'Tulis pengumuman', wide: true, body: pgForm(p),
    footer: '<button type="button" class="btn outline" data-act="modal-close">Batal</button><button type="submit" form="pgForm" class="btn" id="pgSave"><i class="bi bi-check2"></i> Simpan</button>' });
}
A['pg-new'] = () => openPgForm(null);
A['pg-edit'] = el => openPgForm(S.store.pg[el.dataset.id]);
F['pg-save'] = async form => {
  if (!form.reportValidity()) return;
  const btn = $('#pgSave'), fd = new FormData(form);
  const payload = { id: fd.get('id') || undefined, judul: fd.get('judul'), isi: fd.get('isi'), kategori: fd.get('kategori'), status: fd.get('status'), tanggal: fd.get('tanggal'), hapusLampiran: fd.get('hapusLampiran') === 'on' };
  try {
    setBusy(btn, true, 'Menyimpan…');
    const f = form.pdf.files[0];
    if (f) { const r = await readPdf(f); payload.lampiranBase64 = r.base64; payload.lampiranMime = r.mime; }
    await call('pg.save', payload);
    invalidate(); closeTopModal(); toast('Pengumuman disimpan.', 'ok'); navigate('pengumuman');
  } catch (e) { fail(e); } finally { setBusy(btn, false); }
};
A['pg-archive'] = async el => {
  const p = S.store.pg[el.dataset.id]; if (!p) return;
  if (!(await confirmDialog({ title: 'Arsipkan pengumuman?', message: '“' + p.judul + '” tidak akan tampil lagi bagi warga.', okText: 'Arsipkan' }))) return;
  try { await call('pg.save', { id: p.id, judul: p.judul, isi: p.isi, kategori: p.kategori, status: 'Arsip', tanggal: p.tanggal }); invalidate(); toast('Pengumuman diarsipkan.', 'ok'); navigate('pengumuman'); } catch (e) { fail(e); }
};
A['pg-del'] = async el => {
  const p = S.store.pg[el.dataset.id]; if (!p) return;
  if (!(await confirmDialog({ title: 'Hapus pengumuman?', message: '“' + p.judul + '” akan dihapus permanen. Gunakan Arsipkan bila ingin menyimpan riwayat.', okText: 'Hapus', danger: true }))) return;
  try { await call('pg.remove', { id: p.id }); invalidate(); toast('Pengumuman dihapus.', 'ok'); navigate('pengumuman'); } catch (e) { fail(e); }
};

// ════════════════════════════════════════════════════════
// BAGIAN 7: LAPORAN FASILITAS UMUM
// ════════════════════════════════════════════════════════
function pageLapor(nav) {
  load('lap.list', {}, 'lap.list', nav, d => {
    S.store.lap = d; S.ui.lap = S.ui.lap || { q: '', st: '', page: 1 };
    if (!$('#lapList')) {
      const staff = isStaff(), canReport = S.user.role !== 'Pengurus';
      paint(pageHead({ eyebrow: 'Layanan warga', title: staff ? 'Kelola Laporan Fasilitas' : 'Pantau & Lapor Fasilitas', sub: staff ? 'Tinjau laporan warga, ubah status, dan beri tanggapan.' : 'Laporkan kerusakan fasilitas umum dan pantau tindak lanjutnya.',
        actions: canReport ? '<button class="btn" type="button" data-act="lapor-new"><i class="bi bi-camera"></i> Buat laporan baru</button>' : '' }) +
        '<div id="lapKpi" class="grid kpi"></div><div class="card flat mt-2"><div class="search"><i class="bi bi-search"></i><input class="input" type="search" placeholder="Cari deskripsi atau lokasi…" data-input="lap-q" value="' + esc(S.ui.lap.q) + '" aria-label="Cari laporan"></div><div class="chips mt-1" id="lapChips"></div></div>' +
        '<div id="lapList" class="list mt-2"></div><div id="lapPager"></div>');
    }
    paintLapList();
  });
}
function paintLapList() {
  const d = S.store.lap, u = S.ui.lap, c = d.counts;
  $('#lapKpi').innerHTML = [['Total laporan', d.total, 'bi-bar-chart', ''], ['Baru', c.Baru, 'bi-envelope', ''], ['Diproses', c.Diproses, 'bi-tools', 'warn'], ['Selesai', c.Selesai, 'bi-check2-circle', 'ok']].map(x =>
    '<div class="kpi-tile"><div class="row between"><span class="lbl">' + x[0] + '</span><span class="kpi-ico ' + x[3] + '"><i class="bi ' + x[2] + '"></i></span></div><div class="val">' + x[1] + '</div></div>').join('');
  $('#lapChips').innerHTML = [['', 'Semua (' + d.total + ')'], ['Baru', 'Baru (' + c.Baru + ')'], ['Diproses', 'Diproses (' + c.Diproses + ')'], ['Selesai', 'Selesai (' + c.Selesai + ')']].map(x => '<button type="button" class="chip" data-act="lap-st" data-v="' + x[0] + '" aria-pressed="' + (u.st === x[0]) + '">' + x[1] + '</button>').join('');
  const q = u.q.toLowerCase();
  const rows = d.rows.filter(r => (!u.st || r.status === u.st) && (!q || (r.deskripsi + ' ' + r.lokasi + ' ' + r.jenis + ' ' + r.nama_pelapor).toLowerCase().indexOf(q) >= 0));
  const pg = paginate(rows, u.page, 6); u.page = pg.page;
  const staff = isStaff();
  $('#lapList').innerHTML = pg.rows.length ? pg.rows.map(r => {
    const tang = r.tanggapan
      ? '<div class="timeline-note' + (r.status === 'Selesai' ? ' ok' : '') + ' mt-1"><b>Tanggapan' + (r.diupdate_oleh ? ' ' + esc(r.diupdate_oleh) : ' pengurus') + '</b> <span class="small muted">• ' + esc(fmtDateTime(r.tanggal_update)) + '</span><br>' + esc(r.tanggapan) + '</div>'
      : (r.status === 'Baru' ? '<div class="timeline-note mt-1"><i class="bi bi-hourglass-split"></i> Menunggu verifikasi pengurus (target respon ≤ 24 jam).</div>' : '');
    return '<article class="item"><div class="row wrap" style="gap:8px"><span class="badge gray"><i class="bi bi-tag"></i> ' + esc(r.jenis) + '</span>' + statusBadge(r.status) + '<span class="small muted">#' + esc(shortId(r.id)) + ' • ' + esc(fmtDateTime(r.tanggal)) + '</span></div>' +
      '<h3 class="mt-1">' + esc(r.lokasi) + '</h3><p class="mt-1" style="word-break:break-word">' + esc(r.deskripsi) + '</p>' +
      '<div class="row wrap small muted mt-1" style="gap:12px">' + (staff ? '<span><i class="bi bi-person"></i> ' + esc(r.nama_pelapor) + '</span>' : '') +
      (r.maps_url ? '<a href="' + esc(r.maps_url) + '" target="_blank" rel="noopener noreferrer" data-native="1"><i class="bi bi-geo-alt"></i> Buka di Maps</a>' : '') + '</div>' + tang +
      '<div class="row wrap mt-1" style="gap:8px">' + (r.hasFoto ? '<button type="button" class="btn soft sm" data-act="lap-foto" data-id="' + esc(r.id) + '"><i class="bi bi-image"></i> Lihat foto</button>' : '') +
      (staff ? '<button type="button" class="btn outline sm" data-act="lap-upd" data-id="' + esc(r.id) + '"><i class="bi bi-pencil-square"></i> Perbarui status</button>' : '') +
      (isAdmin() ? '<button type="button" class="btn danger sm" data-act="lap-del" data-id="' + esc(r.id) + '"><i class="bi bi-trash"></i> Hapus</button>' : '') + '</div></article>';
  }).join('') : '<div class="card">' + emptyHtml('bi-clipboard-check', staff ? 'Belum ada laporan' : 'Belum ada laporan dari Anda', staff ? 'Laporan warga akan muncul di sini.' : 'Tekan “Buat laporan baru” bila menemukan kerusakan fasilitas.') + '</div>';
  $('#lapPager').innerHTML = pagerHtml(pg, 'lap-page');
}
I['lap-q'] = debounce(el => { S.ui.lap.q = el.value.trim(); S.ui.lap.page = 1; paintLapList(); }, 200);
A['lap-st'] = el => { S.ui.lap.st = el.dataset.v; S.ui.lap.page = 1; paintLapList(); };
A['lap-page'] = el => { S.ui.lap.page = +el.dataset.p; paintLapList(); window.scrollTo(0, 0); };
A['lap-foto'] = el => previewFile('laporan', el.dataset.id, 'Foto laporan');

A['lapor-new'] = () => {
  if (S.user.role === 'Pengurus') return;
  S.store.foto = null;
  const jenis = String(S.config.jenis_fasilitas || '').split(',').map(s => s.trim()).filter(String);
  openModal({
    title: 'Buat laporan fasilitas', wide: true,
    body: '<form id="lapForm" class="form-grid" data-submit="lap-save" novalidate><input type="hidden" name="lat"><input type="hidden" name="lng">' +
      '<div class="field"><label for="lapJenis">Jenis fasilitas <span class="req">*</span></label><select id="lapJenis" name="jenis" class="select" required><option value="">Pilih kategori fasilitas…</option>' + jenis.map(j => '<option>' + esc(j) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label for="lapDesk">Deskripsi kerusakan <span class="req">*</span></label><textarea id="lapDesk" name="deskripsi" class="textarea" maxlength="1000" required placeholder="Contoh: lampu mati total, kaca pecah, atau jalan berlubang diameter 1 meter"></textarea></div>' +
      '<div class="field"><div class="row between"><label for="lapLok">Lokasi kerusakan <span class="req">*</span></label><button type="button" class="link-btn" data-act="lap-gps" style="padding:0"><i class="bi bi-crosshair"></i> Gunakan lokasi saya</button></div><input id="lapLok" name="lokasi" class="input" maxlength="200" required placeholder="Contoh: depan Mushola Al-Ikhlas"><span id="gpsInfo" class="help"></span></div>' +
      '<div class="field"><label>Foto bukti (opsional)</label><label class="dropzone" for="lapFoto" id="fotoZone"><i class="bi bi-cloud-arrow-up"></i><b>Ambil foto atau pilih berkas</b><span class="small">Foto dikecilkan otomatis di HP Anda sebelum dikirim.</span></label><input id="lapFoto" type="file" accept="image/*" class="sr-only" data-change="lap-foto-pick"></div></form>',
    footer: '<button type="button" class="btn outline" data-act="modal-close">Batal</button><button type="submit" form="lapForm" class="btn" id="lapSave"><i class="bi bi-send"></i> Kirim laporan</button>'
  });
};
C['lap-foto-pick'] = async el => {
  const f = el.files[0]; if (!f) return;
  const zone = $('#fotoZone');
  try {
    zone.innerHTML = '<span class="spin"></span><span class="small">Memproses foto…</span>';
    S.store.foto = await compressImage(f);
    zone.innerHTML = '<img alt="Pratinjau foto" src="' + S.store.foto.dataUrl + '"><span class="small">Ketuk untuk mengganti foto</span>';
  } catch (e) { S.store.foto = null; zone.innerHTML = '<i class="bi bi-cloud-arrow-up"></i><b>Ambil foto atau pilih berkas</b>'; el.value = ''; fail(e); }
};
A['lap-gps'] = el => {
  const info = $('#gpsInfo'), form = $('#lapForm');
  if (!navigator.geolocation) { info.textContent = 'Perangkat ini tidak mendukung lokasi otomatis. Isi lokasi secara manual.'; return; }
  info.textContent = 'Mencari lokasi…';
  navigator.geolocation.getCurrentPosition(pos => {
    form.lat.value = pos.coords.latitude.toFixed(6); form.lng.value = pos.coords.longitude.toFixed(6);
    info.innerHTML = '<span class="text-ok"><i class="bi bi-check-circle"></i> Titik lokasi tersimpan (±' + Math.round(pos.coords.accuracy) + ' m).</span>';
  }, () => { info.textContent = 'Lokasi tidak dapat diambil (izin ditolak atau diblokir). Isi lokasi secara manual.'; }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
};
F['lap-save'] = async form => {
  if (!form.reportValidity()) return;
  const btn = $('#lapSave'); setBusy(btn, true, 'Mengirim…');
  const p = { jenis: form.jenis.value, deskripsi: form.deskripsi.value, lokasi: form.lokasi.value, lat: form.lat.value, lng: form.lng.value };
  if (S.store.foto) { p.fotoBase64 = S.store.foto.base64; p.fotoMime = S.store.foto.mime; }
  try { await call('lap.create', p); invalidate(); closeTopModal(); toast('Laporan terkirim. Terima kasih!', 'ok'); navigate('lapor'); }
  catch (e) { fail(e); } finally { setBusy(btn, false); }
};
A['lap-upd'] = el => {
  const r = (S.store.lap.rows || []).find(x => x.id === el.dataset.id); if (!r) return;
  openModal({
    title: 'Perbarui laporan', body: '<p class="small muted">' + esc(r.jenis) + ' — ' + esc(r.lokasi) + '</p><form id="lapUpdForm" class="form-grid mt-1" data-submit="lap-upd-save" novalidate><input type="hidden" name="id" value="' + esc(r.id) + '">' +
      '<div class="field"><label for="uSt">Status</label><select id="uSt" name="status" class="select">' + ['Baru', 'Diproses', 'Selesai'].map(s => '<option' + (r.status === s ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></div>' +
      '<div class="field"><label for="uTg">Tanggapan untuk warga</label><textarea id="uTg" name="tanggapan" class="textarea" maxlength="1000" placeholder="Contoh: Sudah disurvei, perbaikan dijadwalkan Sabtu kerja bakti.">' + esc(r.tanggapan) + '</textarea></div></form>',
    footer: '<button type="button" class="btn outline" data-act="modal-close">Batal</button><button type="submit" form="lapUpdForm" class="btn" id="lapUpdBtn"><i class="bi bi-check2"></i> Simpan</button>'
  });
};
F['lap-upd-save'] = async form => {
  const btn = $('#lapUpdBtn'); setBusy(btn, true, 'Menyimpan…');
  try { await call('lap.update', { id: form.id.value, status: form.status.value, tanggapan: form.tanggapan.value }); invalidate(); closeTopModal(); toast('Laporan diperbarui.', 'ok'); navigate('lapor'); }
  catch (e) { fail(e); } finally { setBusy(btn, false); }
};
A['lap-del'] = async el => {
  if (!(await confirmDialog({ title: 'Hapus laporan?', message: 'Laporan akan dihapus permanen.', okText: 'Hapus', danger: true }))) return;
  try { await call('lap.remove', { id: el.dataset.id }); invalidate(); toast('Laporan dihapus.', 'ok'); navigate('lapor'); } catch (e) { fail(e); }
};

// ════════════════════════════════════════════════════════
// BAGIAN 8: KAS RT
// ════════════════════════════════════════════════════════
function pageKas(nav) {
  load('kas.list', {}, 'kas.list', nav, d => {
    S.store.kas = d; S.ui.kas = S.ui.kas || { q: '', jenis: '', kat: '', from: '', to: '', page: 1 };
    if (!$('#kasList')) {
      const u = S.ui.kas;
      paint(pageHead({ eyebrow: 'Transparansi keuangan', title: 'Kas RT', sub: S.user && !isStaff() ? 'Rincian kas masuk, kas keluar, dan total kas RT. Tampilan baca saja.' : 'Mutasi kas terbuka untuk seluruh warga. Saldo dihitung otomatis.',
        actions: '<button class="btn outline" type="button" data-act="kas-pdf"><i class="bi bi-file-earmark-pdf"></i> Unduh PDF</button>' + (d.canEdit ? '<button class="btn outline" type="button" data-act="imp-kas"><i class="bi bi-file-earmark-spreadsheet"></i> Impor Excel/CSV</button>' : '') + (d.canEdit ? '<button class="btn" type="button" data-act="kas-new"><i class="bi bi-plus-lg"></i> Catat transaksi</button>' : '') }) +
        '<div id="kasHero"></div>' +
        '<div class="card flat mt-2"><div class="form-grid two"><div class="field span2"><div class="search"><i class="bi bi-search"></i><input class="input" type="search" placeholder="Cari uraian, kategori, atau pencatat…" data-input="kas-q" value="' + esc(u.q) + '" aria-label="Cari transaksi"></div></div>' +
        '<div class="field"><label for="kasKat">Kategori</label><select id="kasKat" class="select" data-change="kas-kat"></select></div>' +
        '<div class="field"><label>Rentang tanggal</label><div class="row"><input type="date" class="input" aria-label="Dari tanggal" data-change="kas-from" value="' + esc(u.from) + '"><span class="muted">s/d</span><input type="date" class="input" aria-label="Sampai tanggal" data-change="kas-to" value="' + esc(u.to) + '"></div></div></div>' +
        '<div class="chips mt-1" id="kasChips"></div></div>' +
        '<div class="row between wrap mt-2" id="kasSum"></div><div class="mt-1"><table class="rtable" id="kasTable"></table></div><div id="kasPager"></div>');
    }
    paintKas();
  });
}
function paintKas() {
  const d = S.store.kas, u = S.ui.kas;
  $('#kasHero').innerHTML = '<section class="hero"><span class="eyebrow"><i class="bi bi-shield-check"></i> Audit terbuka</span><div class="sub mt-1">Total kas RT</div><div class="big">' + rp(d.saldo) + '</div>' +
    '<div class="hero-split"><div><small>Pemasukan bulan ini</small><b>+' + rp(d.masukBulanIni) + '</b></div><div><small>Pengeluaran bulan ini</small><b>-' + rp(d.keluarBulanIni) + '</b></div></div>' +
    (d.rekening ? '<div class="hero-split" style="grid-template-columns:1fr auto;align-items:center"><div><small>Rekening resmi kas RT</small><b>' + esc(d.rekening) + '</b></div><button type="button" class="btn light sm" data-act="copy" data-v="' + esc(d.rekening) + '"><i class="bi bi-clipboard"></i> Salin</button></div>' : '') + '</section>';
  const sel = $('#kasKat'); const cur = u.kat;
  sel.innerHTML = '<option value="">Semua kategori</option>' + d.kategori.map(k => '<option' + (k === cur ? ' selected' : '') + '>' + esc(k) + '</option>').join('');
  $('#kasChips').innerHTML = [['', 'Semua'], ['Pemasukan', 'Pemasukan'], ['Pengeluaran', 'Pengeluaran']].map(c => '<button type="button" class="chip" data-act="kas-jenis" data-v="' + c[0] + '" aria-pressed="' + (u.jenis === c[0]) + '">' + c[1] + '</button>').join('');
  const q = u.q.toLowerCase();
  const rows = d.rows.filter(r => (!u.jenis || r.jenis === u.jenis) && (!u.kat || r.kategori === u.kat) && (!u.from || r.tanggal >= u.from) && (!u.to || r.tanggal <= u.to) &&
    (!q || (r.uraian + ' ' + r.kategori + ' ' + r.dicatat_oleh).toLowerCase().indexOf(q) >= 0));
  let tm = 0, tk = 0; rows.forEach(r => { if (r.jenis === 'Pemasukan') tm += r.nominal; else tk += r.nominal; });
  $('#kasSum').innerHTML = '<span class="small muted">' + rows.length + ' transaksi</span><span class="row wrap" style="gap:8px"><span class="badge ok">Masuk ' + rp(tm) + '</span><span class="badge bad">Keluar ' + rp(tk) + '</span></span>';
  const pg = paginate(rows, u.page, PAGE_SIZE); u.page = pg.page;
  const edit = d.canEdit;
  $('#kasTable').innerHTML = '<thead><tr><th>Tanggal</th><th>Uraian</th><th>Jenis</th><th class="right">Nominal</th><th class="right">Saldo</th>' + (edit ? '<th>Nota</th>' : '') + '<th>Dicatat oleh</th>' + (edit ? '<th class="right">Aksi</th>' : '') + '</tr></thead><tbody>' +
    (pg.rows.length ? pg.rows.map(r => '<tr><td data-label="Tanggal">' + esc(fmtDate(r.tanggal)) + '</td>' +
      '<td class="full"><b>' + esc(r.uraian) + '</b><br><span class="badge gray">' + esc(r.kategori) + '</span></td>' +
      '<td data-label="Jenis"><span class="badge ' + (r.jenis === 'Pemasukan' ? 'ok' : 'bad') + '">' + (r.jenis === 'Pemasukan' ? '<i class="bi bi-arrow-down-left"></i> Masuk' : '<i class="bi bi-arrow-up-right"></i> Keluar') + '</span></td>' +
      '<td data-label="Nominal" class="right"><span class="amount ' + (r.jenis === 'Pemasukan' ? 'in' : 'out') + '">' + (r.jenis === 'Pemasukan' ? '+' : '-') + rp(r.nominal) + '</span></td>' +
      '<td data-label="Saldo" class="right"><span class="amount tabular">' + rp(r.saldo) + '</span></td>' +
      (edit ? '<td data-label="Nota">' + (r.hasNota ? '<button type="button" class="btn soft sm" data-act="kas-nota" data-id="' + esc(r.id) + '"><i class="bi bi-receipt"></i> Lihat</button>' : '<span class="muted">—</span>') + '</td>' : '') +
      '<td data-label="Dicatat oleh">' + esc(r.dicatat_oleh) + '</td>' +
      (edit ? '<td class="actions"><button type="button" class="btn outline sm" data-act="kas-edit" data-id="' + esc(r.id) + '" aria-label="Ubah transaksi"><i class="bi bi-pencil"></i></button> <button type="button" class="btn danger sm" data-act="kas-del" data-id="' + esc(r.id) + '" aria-label="Hapus transaksi"><i class="bi bi-trash"></i></button></td>' : '') + '</tr>').join('')
      : '<tr><td colspan="8" class="full">' + emptyHtml('bi-receipt', 'Tidak ada transaksi', 'Coba ubah kata kunci atau filter.') + '</td></tr>') + '</tbody>';
  $('#kasPager').innerHTML = pagerHtml(pg, 'kas-page');
}
I['kas-q'] = debounce(el => { S.ui.kas.q = el.value.trim(); S.ui.kas.page = 1; paintKas(); }, 200);
C['kas-kat'] = el => { S.ui.kas.kat = el.value; S.ui.kas.page = 1; paintKas(); };
C['kas-from'] = el => { S.ui.kas.from = el.value; S.ui.kas.page = 1; paintKas(); };
C['kas-to'] = el => { S.ui.kas.to = el.value; S.ui.kas.page = 1; paintKas(); };
A['kas-jenis'] = el => { S.ui.kas.jenis = el.dataset.v; S.ui.kas.page = 1; paintKas(); };
A['kas-page'] = el => { S.ui.kas.page = +el.dataset.p; paintKas(); window.scrollTo(0, 0); };
A['kas-nota'] = el => previewFile('kas', el.dataset.id, 'Bukti nota');
A.copy = el => { copyText(el.dataset.v).then(ok => toast(ok ? 'Berhasil disalin.' : 'Tidak dapat menyalin. Salin secara manual.', ok ? 'ok' : 'warn')); };
I.money = el => { el.value = moneyFmt(el.value); };
I.ribu = el => {
  el.value = ribuFmt(el.value);
  const fld = el.closest('.field'), pv = fld && fld.querySelector('.rpprev');
  if (pv) { const v = ribuVal(el.value); pv.textContent = v ? '= ' + rp(v) : 'Ketik angka ribuan: 50 = Rp 50.000'; }
};

A['kas-pdf'] = () => {
  const t = todayISO();
  const m = openModal({
    title: 'Unduh laporan keuangan (PDF)',
    body: '<form id="pdfForm" class="form-grid two" data-submit="kas-pdf-go" novalidate><div class="field"><label for="pdfFrom">Dari tanggal</label><input id="pdfFrom" name="from" type="date" class="input" required value="' + t.slice(0, 8) + '01"></div>' +
      '<div class="field"><label for="pdfTo">Sampai tanggal</label><input id="pdfTo" name="to" type="date" class="input" required value="' + t + '"></div></form><div id="pdfOut" class="mt-2"></div>',
    footer: '<button type="button" class="btn outline" data-act="modal-close">Tutup</button><button type="submit" form="pdfForm" class="btn" id="pdfBtn"><i class="bi bi-file-earmark-pdf"></i> Buat PDF</button>'
  });
  return m;
};
F['kas-pdf-go'] = async form => {
  if (!form.reportValidity()) return;
  if (form.from.value > form.to.value) { toast('Tanggal awal tidak boleh setelah tanggal akhir.', 'warn'); return; }
  const btn = $('#pdfBtn'), out = $('#pdfOut'); setBusy(btn, true, 'Membuat PDF…');
  try {
    const f = await call('kas.pdf', { from: form.from.value, to: form.to.value });
    out.innerHTML = '<div class="banner"><i class="bi bi-check-circle"></i><span>Laporan siap: <b>' + esc(f.name) + '</b></span></div><button type="button" class="btn block mt-1" id="pdfDl"><i class="bi bi-download"></i> Unduh PDF</button>';
    $('#pdfDl').onclick = () => saveFile(f);
  } catch (e) { fail(e); } finally { setBusy(btn, false); }
};

function kasForm(r) {
  r = r || {}; const kat = S.store.kas.kategori;
  return '<form id="kasForm" class="form-grid two" data-submit="kas-save" novalidate><input type="hidden" name="id" value="' + esc(r.id || '') + '">' +
    '<div class="field"><label for="kfTgl">Tanggal <span class="req">*</span></label><input id="kfTgl" name="tanggal" type="date" class="input" required value="' + esc(r.tanggal || todayISO()) + '"></div>' +
    '<div class="field"><label for="kfJenis">Jenis <span class="req">*</span></label><select id="kfJenis" name="jenis" class="select"><option' + (r.jenis !== 'Pengeluaran' ? ' selected' : '') + '>Pemasukan</option><option' + (r.jenis === 'Pengeluaran' ? ' selected' : '') + '>Pengeluaran</option></select></div>' +
    '<div class="field"><label for="kfKat">Kategori <span class="req">*</span></label><select id="kfKat" name="kategori" class="select" required>' + kat.map(k => '<option' + (r.kategori === k ? ' selected' : '') + '>' + esc(k) + '</option>').join('') + '</select></div>' +
    '<div class="field"><label for="kfNom">Nominal (Rp) <span class="req">*</span></label>' + ribuBox({ id: 'kfNom', name: 'nominal', value: r.nominal, req: true, prev: true }) + '</div>' +
    '<div class="field span2"><label for="kfUr">Uraian <span class="req">*</span></label><input id="kfUr" name="uraian" class="input" maxlength="300" required value="' + esc(r.uraian || '') + '" placeholder="Contoh: Penyetoran iuran Blok Mawar"></div>' +
    '<div class="field span2"><label>Foto nota (opsional)</label><label class="dropzone" for="kfNota" id="notaZone"><i class="bi bi-camera"></i><b>' + (r.hasNota ? 'Ganti foto nota' : 'Ambil foto atau pilih nota') + '</b><span class="small">Dikecilkan otomatis sebelum dikirim.</span></label><input id="kfNota" type="file" accept="image/*" class="sr-only" data-change="nota-pick"></div></form>';
}
function openKasForm(r) {
  S.store.nota = null;
  openModal({ title: r ? 'Ubah transaksi' : 'Catat transaksi', wide: true, body: kasForm(r),
    footer: '<button type="button" class="btn outline" data-act="modal-close">Batal</button><button type="submit" form="kasForm" class="btn" id="kasSave"><i class="bi bi-check2"></i> Simpan</button>' });
}
A['kas-new'] = () => openKasForm(null);
A['kas-edit'] = el => openKasForm(S.store.kas.rows.find(x => x.id === el.dataset.id));
C['nota-pick'] = async el => {
  const f = el.files[0]; if (!f) return; const z = $('#notaZone');
  try { z.innerHTML = '<span class="spin"></span><span class="small">Memproses foto…</span>'; S.store.nota = await compressImage(f); z.innerHTML = '<img alt="Pratinjau nota" src="' + S.store.nota.dataUrl + '"><span class="small">Ketuk untuk mengganti</span>'; }
  catch (e) { S.store.nota = null; z.innerHTML = '<i class="bi bi-camera"></i><b>Ambil foto atau pilih nota</b>'; el.value = ''; fail(e); }
};
F['kas-save'] = async form => {
  if (!form.reportValidity()) return;
  const nominal = ribuVal(form.nominal.value);
  if (nominal < 1) { toast('Nominal harus lebih dari 0.', 'warn'); form.nominal.focus(); return; }
  const btn = $('#kasSave'); setBusy(btn, true, 'Menyimpan…');
  const p = { id: form.id.value || undefined, tanggal: form.tanggal.value, jenis: form.jenis.value, kategori: form.kategori.value, uraian: form.uraian.value, nominal: nominal };
  if (S.store.nota) { p.notaBase64 = S.store.nota.base64; p.notaMime = S.store.nota.mime; }
  try { await call('kas.save', p); invalidate(); closeTopModal(); toast('Transaksi disimpan.', 'ok'); navigate('kas'); }
  catch (e) { fail(e); } finally { setBusy(btn, false); }
};
A['kas-del'] = async el => {
  const r = S.store.kas.rows.find(x => x.id === el.dataset.id); if (!r) return;
  if (!(await confirmDialog({ title: 'Hapus transaksi?', message: r.uraian + ' (' + rp(r.nominal) + '). Saldo akan dihitung ulang dan perubahan tercatat di log.', okText: 'Hapus', danger: true }))) return;
  try { await call('kas.remove', { id: r.id }); invalidate(); toast('Transaksi dihapus.', 'ok'); navigate('kas'); } catch (e) { fail(e); }
};

// ════════════════════════════════════════════════════════
// BAGIAN 9: ARISAN (periode, peserta, setoran, kocokan, tracking)
// Istilah: "Periode" = program arisan beberapa tahun; "Putaran" = satu kali kumpulan/undian.
// ════════════════════════════════════════════════════════
const loadingCard = () => '<div class="card"><div class="center muted" style="padding:24px"><span class="spin"></span><p class="mt-1 small">Memuat…</p></div></div>';
function arKey() { const u = S.ui.ar; return 'arisan:' + ((u && u.idp) || 'aktif'); }

function pageTrackingWarga(nav) {
  S.ui.ar = S.ui.ar || { tab: 'tracking', q: '', f: '', page: 1, rq: '', rpage: 1, sq: '', idp: '', tid: '', sp: 0, stok: 0, ttok: 0 };
  const u = S.ui.ar; u.tab = 'tracking';
  load('arisan.tracking', { id_peserta: u.tid || undefined }, 'trw:' + (u.tid || ''), nav, tr => {
    S.store.ar = { canEdit: false, periode: { id: tr.periode.id } }; S.store.arTr = tr;
    if (!u.tid && tr.detail) u.tid = tr.detail.id;
    if (!$('#arBody')) { paint(pageHead({ eyebrow: 'Arisan warga', title: 'Tracking & Catatan', sub: 'Pantau pembayaran arisan dan catatan khusus untuk KK Anda.', actions: '<button type="button" class="btn" data-act="su-form"><i class="bi bi-cash-stack"></i> Info pembayaran susulan</button>' }) + '<div id="arBody" class="mt-1"></div><div id="suWrap" class="mt-2"></div>'); suWargaPaint(nav); }
    if (!tr.daftar.length) { $('#arBody').innerHTML = '<div class="card">' + emptyHtml('bi-people', 'KK Anda belum terdaftar sebagai peserta arisan', 'Hubungi pengurus RT bila Anda ikut arisan namun datanya belum muncul.') + '</div>'; return; }
    renderArTracking($('#arBody'), tr);
  });
}
function pageArisan(nav) {
  if (!isStaff()) return pageTrackingWarga(nav);
  S.ui.ar = S.ui.ar || { tab: 'peserta', q: '', f: '', page: 1, rq: '', rpage: 1, sq: '', idp: '', tid: '', sp: 0, stok: 0, ttok: 0 };
  const u = S.ui.ar;
  load('arisan.overview', { id_periode: u.idp || undefined }, arKey(), nav, d => {
    S.store.ar = d;
    if (!$('#arBody')) {
      paint(pageHead({ eyebrow: 'Transparansi arisan', title: 'Arisan Warga', sub: 'Periode arisan, riwayat kocokan, setoran, dan pelacakan kewajiban peserta.',
        actions: (d.canEdit ? '<button class="btn" type="button" data-act="ar-kocokan"><i class="bi bi-dice-5"></i> Catat kocokan</button>' : '') + (d.canEdit ? '<button class="btn outline" type="button" data-act="imp-arisan"><i class="bi bi-file-earmark-spreadsheet"></i> Impor Excel/CSV</button>' : '') + (d.canManage ? '<button class="btn outline" type="button" data-act="ar-more"><i class="bi bi-three-dots"></i> Lainnya</button>' : '') }) +
        '<div id="arHero"></div><div class="chips mt-2" id="arTabs" role="tablist"></div><div id="arBody" class="mt-1"></div>');
    }
    paintArisan();
  });
}
function arTabsFor(d) {
  const t = [['peserta', 'Peserta (' + d.peserta.length + ')'], ['riwayat', 'Riwayat kocokan (' + d.riwayat.length + ')']];
  if (d.canManage) t.push(['tracking', 'Tracking & catatan']);
  if (d.canEdit) t.push(['setoran', 'Catat setoran']);
  if (d.canManage) t.push(['susulan', 'Bayar Susulan' + (d.susulanMenunggu ? ' (' + d.susulanMenunggu + ')' : '')]);
  return t;
}
function paintArisan() {
  const d = S.store.ar, u = S.ui.ar, pr = d.periode;
  const tot = d.totalPeserta, pct = tot ? Math.round(d.sudah / tot * 1000) / 10 : 0;
  const tiles = (d.isAktif ? '<div><small>Terkumpul putaran ini</small><b>' + rp(d.totalSetoranIni) + '</b><span class="small" style="display:block;opacity:.85">' + d.setoranIniCount + ' penyetor</span></div>' : '<div><small>Status periode</small><b>Selesai</b></div>') +
    '<div><small>Putaran terlaksana</small><b>' + d.putaranSelesai + ' kali</b></div><div><small>Sudah menerima</small><b>' + d.sudah + ' warga</b></div><div><small>Belum menerima</small><b>' + d.belum + ' warga</b></div>';
  const picker = d.periodeList.length > 1 ? '<div class="field mt-2"><label class="sr-only" for="arPer">Lihat periode arisan</label><select id="arPer" class="select" data-change="ar-periode">' +
    d.periodeList.map(p => '<option value="' + (p.status === 'Aktif' ? '' : esc(p.id)) + '"' + (p.id === pr.id ? ' selected' : '') + '>' + esc(p.nama) + ' (' + p.mulai + '–' + p.selesai + ')' + (p.status === 'Aktif' ? ' • aktif' : ' • selesai') + '</option>').join('') + '</select></div>' : '';
  $('#arHero').innerHTML = '<section class="hero"><span class="eyebrow"><i class="bi bi-calendar-range"></i> ' + esc(pr.nama) + ' • ' + pr.mulai + '–' + pr.selesai + '</span>' +
    (d.isAktif ? '<h2>Putaran ke-' + d.putaran + '</h2><p class="sub">' + (d.jadwal ? esc(fmtDateLong(d.jadwal)) + ' • ' + esc(d.jam) + ' WIB' : 'Jadwal belum diumumkan') + (d.lokasi ? ' • ' + esc(d.lokasi) : '') + '</p>' + countdownHtml(d.jadwal, d.jam)
      : '<h2>Periode sudah selesai</h2><p class="sub">Data periode ini hanya dapat dilihat (tidak bisa diubah).</p>') +
    '<div class="mt-2"><div class="row between small"><span>Peserta yang sudah menerima</span><b>' + pct + '%</b></div><div class="progress mt-1" style="background:rgba(255,255,255,.22)"><i style="width:' + pct + '%;background:#fff"></i></div></div>' +
    '<div class="hero-split">' + tiles + '</div></section>' + picker;
  const tabs = arTabsFor(d);
  if (!tabs.some(t => t[0] === u.tab)) u.tab = 'peserta';
  $('#arTabs').innerHTML = tabs.map(t => '<button type="button" class="chip" role="tab" data-act="ar-tab" data-v="' + t[0] + '" aria-pressed="' + (u.tab === t[0]) + '">' + t[1] + '</button>').join('');
  if (u.tab === 'setoran' && $('#arSetForm')) { tickCountdowns(); return; } // jangan timpa isian yang sedang diketik
  paintArTab();
  tickCountdowns();
}
A['ar-tab'] = el => { S.ui.ar.tab = el.dataset.v; paintArisan(); };
C['ar-periode'] = el => { S.ui.ar.idp = el.value; S.ui.ar.tab = 'peserta'; S.ui.ar.tid = ''; S.ui.ar.page = 1; S.ui.ar.rpage = 1; navigate('arisan'); };

function paintArTab() {
  const u = S.ui.ar, box = $('#arBody');
  if (u.tab === 'riwayat') return paintArRiwayat(box);
  if (u.tab === 'setoran') return paintArSetoran(box);
  if (u.tab === 'tracking') return paintArTracking(box);
  if (u.tab === 'susulan') return paintArSusulan(box);
  paintArPeserta(box);
}

function paintArPeserta(box) {
  const d = S.store.ar, u = S.ui.ar;
  if (!$('#arList')) {
    box.innerHTML = '<div class="card flat"><div class="search"><i class="bi bi-search"></i><input class="input" type="search" placeholder="Cari nama peserta…" data-input="ar-q" value="' + esc(u.q) + '" aria-label="Cari peserta"></div><div class="chips mt-1" id="arChips"></div></div>' +
      '<div class="mt-2"><table class="rtable" id="arList"></table></div><div id="arPager"></div>' + (d.canEdit ? '<div class="mt-1"><button type="button" class="btn soft sm" data-act="ar-peserta-new"><i class="bi bi-person-plus"></i> Tambah peserta dari Data Warga</button></div>' : '');
  }
  const n = { '': d.peserta.length, Belum: d.belum, Sudah: d.sudah };
  $('#arChips').innerHTML = [['', 'Semua (' + n[''] + ')'], ['Belum', 'Belum dapat (' + n.Belum + ')'], ['Sudah', 'Sudah dapat (' + n.Sudah + ')']].map(c => '<button type="button" class="chip" data-act="ar-f" data-v="' + c[0] + '" aria-pressed="' + (u.f === c[0]) + '">' + c[1] + '</button>').join('');
  const q = u.q.toLowerCase();
  const rows = d.peserta.filter(p => (!u.f || p.status_menang === u.f) && (!q || p.nama.toLowerCase().indexOf(q) >= 0 || (p.blok || '').toLowerCase().indexOf(q) >= 0));
  const pg = paginate(rows, u.page, PAGE_SIZE); u.page = pg.page;
  $('#arList').innerHTML = '<thead><tr><th>No</th><th>Nama peserta</th><th>Status</th><th>Putaran menang</th><th class="right">Total setoran</th><th class="right">Aksi</th></tr></thead><tbody>' +
    (pg.rows.length ? pg.rows.map((p, i) => '<tr><td data-label="No">' + (p.no || (pg.from + i)) + '</td><td class="full"><div class="row"><span class="avatar sm">' + esc(initials(p.nama)) + '</span><div><b>' + esc(p.nama) + '</b>' + (p.blok ? '<br><span class="small muted">' + esc(p.blok) + '</span>' : '') + '</div></div></td>' +
      '<td data-label="Status">' + (p.status_menang === 'Sudah' ? '<span class="badge ok"><i class="bi bi-check2"></i> Sudah dapat</span>' : '<span class="badge gray"><i class="bi bi-hourglass-split"></i> Belum dapat</span>') + '</td>' +
      '<td data-label="Putaran menang">' + (p.periode_menang ? 'Putaran ' + p.periode_menang + (p.tanggal_menang ? ' • ' + esc(fmtDate(p.tanggal_menang)) : '') : '—') + '</td>' +
      '<td data-label="Total setoran" class="right"><span class="amount">' + rp(p.total_setor) + '</span><br><span class="small muted">' + p.jumlah_setor + 'x setor</span></td>' +
      '<td class="actions"><button type="button" class="btn soft sm" data-act="ar-detail" data-id="' + esc(p.id) + '">Rincian</button>' + (d.canEdit ? ' <button type="button" class="btn outline sm" data-act="ar-peserta-edit" data-id="' + esc(p.id) + '" aria-label="Ubah peserta"><i class="bi bi-pencil"></i></button>' : '') + '</td></tr>').join('')
      : '<tr><td colspan="6" class="full">' + emptyHtml('bi-people', 'Peserta tidak ditemukan', d.peserta.length ? 'Coba kata kunci lain.' : (d.canEdit ? 'Gunakan menu Lainnya → Sinkron dari Data Warga (KK), atau tambahkan peserta satu per satu.' : 'Belum ada peserta arisan.')) + '</td></tr>') + '</tbody>';
  $('#arPager').innerHTML = pagerHtml(pg, 'ar-page');
}
I['ar-q'] = debounce(el => { S.ui.ar.q = el.value.trim(); S.ui.ar.page = 1; paintArPeserta($('#arBody')); }, 200);
A['ar-f'] = el => { S.ui.ar.f = el.dataset.v; S.ui.ar.page = 1; paintArPeserta($('#arBody')); };
A['ar-page'] = el => { S.ui.ar.page = +el.dataset.p; paintArPeserta($('#arBody')); };

function paintArRiwayat(box) {
  const d = S.store.ar, u = S.ui.ar;
  if (!$('#arRiw')) box.innerHTML = '<div class="card flat"><div class="search"><i class="bi bi-search"></i><input class="input" type="search" placeholder="Cari nama penerima atau nomor putaran…" data-input="ar-rq" value="' + esc(u.rq) + '" aria-label="Cari penerima arisan"></div><p class="help mt-1">Pilih penerima untuk melihat rincian nominal yang disetor pada putaran kemenangannya.</p></div><div id="arRiw" class="list mt-2"></div><div id="arRPager"></div>';
  const q = u.rq.toLowerCase().replace(/^(p|putaran)-?\s*/, '');
  const rows = d.riwayat.filter(k => !u.rq || k.nama.toLowerCase().indexOf(u.rq.toLowerCase()) >= 0 || String(k.putaran) === q);
  const pg = paginate(rows, u.rpage, 8); u.rpage = pg.page;
  $('#arRiw').innerHTML = pg.rows.length ? pg.rows.map((k, i) => '<article class="item"><div class="row" style="align-items:flex-start"><span class="item-ico ok"><i class="bi bi-trophy"></i></span><div class="grow"><div class="row wrap" style="gap:8px"><span class="num-badge">Putaran ' + k.putaran + '</span><span class="small muted">' + esc(fmtDate(k.tanggal)) + '</span></div><h3 class="mt-1">' + esc(k.nama) + '</h3>' + (k.keterangan ? '<p class="small muted">' + esc(k.keterangan) + '</p>' : '') + '</div><div style="text-align:right"><span class="amount in">' + rp(k.diterima) + '</span><br><span class="small muted">diterima pemenang</span></div></div>' + potHtml(k.total, k.potongan, k.diterima) + (k.manual ? '<p class="small muted mt-1">Total setoran diisi manual oleh pengurus.</p>' : '') +
    '<div class="row wrap mt-1" style="gap:8px"><button type="button" class="btn soft sm" data-act="ar-detail" data-id="' + esc(k.id_peserta) + '"><i class="bi bi-list-check"></i> Rincian setoran</button>' +
    (d.canManage ? '<button type="button" class="btn outline sm" data-act="ar-pdf-put" data-p="' + k.putaran + '"><i class="bi bi-file-earmark-pdf"></i> PDF putaran</button>' : '') +
    (d.canEdit ? '<button type="button" class="btn outline sm" data-act="ar-kocokan-edit" data-id="' + esc(k.id) + '"><i class="bi bi-pencil"></i> Edit putaran</button>' : '') +
    (d.canEdit && u.rpage === 1 && i === 0 && !u.rq ? '<button type="button" class="btn danger sm" data-act="ar-kocokan-del" data-id="' + esc(k.id) + '"><i class="bi bi-arrow-counterclockwise"></i> Batalkan kocokan ini</button>' : '') + '</div></article>').join('')
    : '<div class="card">' + emptyHtml('bi-trophy', 'Belum ada kocokan', u.rq ? 'Tidak ada hasil untuk pencarian ini.' : 'Hasil kocokan akan tampil di sini.') + '</div>';
  $('#arRPager').innerHTML = pagerHtml(pg, 'ar-rpage');
}
I['ar-rq'] = debounce(el => { S.ui.ar.rq = el.value.trim(); S.ui.ar.rpage = 1; paintArRiwayat($('#arBody')); }, 200);
A['ar-rpage'] = el => { S.ui.ar.rpage = +el.dataset.p; paintArRiwayat($('#arBody')); };

A['ar-detail'] = async el => {
  const id = el.dataset.id;
  const m = openModal({ title: 'Rincian arisan', wide: true, body: '<div class="center muted" style="padding:28px"><span class="spin"></span></div>', footer: '<button type="button" class="btn outline" data-act="modal-close">Tutup</button>' });
  try {
    const d = await call('arisan.detail', { id: id, id_periode: S.store.ar.periode.id });
    const p = S.store.ar.peserta.find(x => x.id === id);
    let h = '<div class="row"><span class="avatar">' + esc(initials(d.nama)) + '</span><div><h3>' + esc(d.nama) + '</h3>' + (d.status_menang === 'Sudah' ? '<span class="badge ok">Sudah menerima</span>' : '<span class="badge gray">Belum menerima</span>') + '</div></div>';
    if (p) h += '<div class="banner mt-2"><i class="bi bi-cash-coin"></i><span>Total setoran tercatat: <b>' + rp(p.total_setor) + '</b> (' + p.jumlah_setor + 'x setor)</span></div>';
    if (!d.kocokan.length) h += '<div class="empty"><i class="bi bi-hourglass-split"></i><b>Belum menerima arisan</b><span>Peserta masuk undian selama belum menang pada periode ini.</span></div>';
    d.kocokan.forEach(k => {
      const staff = k.setoran.some(s => s.catatan !== undefined);
      h += '<div class="card flat mt-2"><div class="row between wrap"><div><span class="num-badge">Putaran ' + k.putaran + '</span> <span class="small muted">' + esc(fmtDateLong(k.tanggal)) + '</span></div><span class="amount in">' + rp(k.total_diterima) + '</span></div>' + (k.keterangan ? '<p class="small muted mt-1">' + esc(k.keterangan) + '</p>' : '') + potHtml(k.total_setoran_putaran, k.potongan, k.total_diterima) +
        '<h4 class="mt-2" style="font-size:13px">Rincian setoran putaran ini (' + k.setoran.length + ' penyetor)</h4>' +
        (k.setoran.length ? '<div style="max-height:260px;overflow:auto" class="mt-1"><table class="rtable"><thead><tr><th>Penyetor</th><th>Tanggal</th><th class="right">Nominal</th>' + (staff ? '<th>Catatan</th>' : '') + '</tr></thead><tbody>' + k.setoran.map(s => '<tr><td data-label="Penyetor">' + esc(s.nama) + '</td><td data-label="Tanggal">' + esc(fmtDate(s.tanggal)) + '</td><td data-label="Nominal" class="right"><span class="amount">' + rp(s.nominal) + '</span></td>' + (staff ? '<td data-label="Catatan">' + (esc(s.catatan) || '—') + '</td>' : '') + '</tr>').join('') + '</tbody></table></div><div class="row between mt-1"><b>Total setoran tercatat</b><b class="amount">' + rp(k.total_setoran) + '</b></div>' : '<p class="small muted mt-1">Belum ada setoran tercatat untuk putaran ini.</p>') + '</div>';
    });
    m.body.innerHTML = h;
  } catch (e) { m.close(); fail(e); }
};

// ── Pengurus: catat setoran (nominal bebas, catatan khusus, centang iuran kas) ──
async function paintArSetoran(box) {
  const u = S.ui.ar;
  box.innerHTML = loadingCard();
  const t = ++u.stok;
  try {
    const f = await call('arisan.setoranForm', u.sp ? { putaran: u.sp } : {});
    if (u.stok !== t || u.tab !== 'setoran' || !$('#arBody')) return;
    S.store.arSet = f; u.sp = f.putaran;
    renderArSetoran(box, f);
  } catch (e) { box.innerHTML = '<div class="card">' + emptyHtml('bi-wifi-off', 'Form setoran gagal dimuat', e.message) + '</div>'; }
}
function renderArSetoran(box, f) {
  const opts = [];
  for (let i = f.putaranMax; i >= 1; i--) opts.push('<option value="' + i + '"' + (i === f.putaran ? ' selected' : '') + '>Putaran ' + i + (i === f.putaranMax ? ' (berjalan)' : '') + '</option>');
  const anyH = f.rows.some(r => r.harapan > 0);
  const rows = f.rows.map(r => {
    const win = r.penerima;
    return '<div class="item srow' + (win ? ' is-win' : '') + '" data-n="' + esc((r.nama + ' ' + r.blok).toLowerCase()) + '" data-id="' + esc(r.id) + '">' +
      '<div class="srow-top"><span class="kkno-chip" style="display:inline-flex">' + (r.no || '—') + '</span><div class="grow" style="min-width:0"><b>' + esc(r.nama) + '</b>' + (r.blok ? '<div class="small muted">' + esc(r.blok) + '</div>' : '') + '</div>' +
      (win ? '<span class="badge ok"><i class="bi bi-trophy"></i> Penerima</span>' : (r.harapan ? '<span class="need">Seharusnya ' + rp(r.harapan) + '</span>' : '')) + '</div>' +
      '<div class="srow-in">' + (win ? '<div class="small muted">Penerima tidak menyetor pada putaran ini.</div>' : ribuBox({ id: 'st-' + r.id, value: r.nominal, sm: true, attrs: 'data-set="' + esc(r.id) + '" data-orig="' + (r.nominal || 0) + '" data-harap="' + r.harapan + '" aria-label="Nominal setoran ' + esc(r.nama) + '"' })) +
      '<label class="check"><input type="checkbox" data-iu="' + esc(r.id) + '" data-orig="' + (r.iuran ? 1 : 0) + '"' + (r.iuran ? ' checked' : '') + (r.iuranKunci || !r.id_kk ? ' disabled' : '') + '> Iuran kas ' + (r.iuranKunci ? '<i class="bi bi-lock-fill" title="Sudah dicatat ke Kas RT"></i>' : '') + '</label></div>' +
      '<input class="input sm" maxlength="300" data-cat="' + esc(r.id) + '" data-orig="' + esc(r.catatan) + '" value="' + esc(r.catatan) + '" placeholder="Catatan khusus (opsional), mis. menyusul pekan depan" aria-label="Catatan ' + esc(r.nama) + '"></div>';
  }).join('');
  box.innerHTML = '<form id="arSetForm" data-submit="ar-setoran-save" novalidate><div class="card flat">' +
    '<div class="form-grid two"><div class="field"><label for="stPut">Putaran</label><select id="stPut" class="select" data-change="ar-sp">' + opts.join('') + '</select></div>' +
    '<div class="field"><label for="stTgl">Tanggal setoran</label><input id="stTgl" name="tanggal" type="date" class="input" value="' + f.today + '" required></div></div>' +
    '<p class="help mt-1">Nominal <b>tidak dipatok</b>: isi sesuai kemampuan tiap KK (ketik <b>50</b> = Rp 50.000). Kosongkan bila belum bayar, dan beri catatan bila akan menyusul. Untuk pembayaran susulan, pilih putaran yang lama.</p>' +
    (f.pemenang ? '<div class="banner mt-1"><i class="bi bi-trophy"></i><span>Penerima putaran ini: <b>' + esc(f.pemenang.nama) + '</b>.' + (anyH ? ' Peserta yang dulu sudah menerima membayar sebesar yang dibayarkan penerima ini saat itu (tertera “Seharusnya”).' : '') + '</span></div>' : '') +
    suPanelHtml(f) + '<div class="search mt-1"><i class="bi bi-search"></i><input class="input" type="search" placeholder="Cari nama peserta…" data-input="ar-sq" aria-label="Cari peserta untuk setoran" value="' + esc(S.ui.ar.sq) + '"></div>' +
    '<div class="row wrap mt-1" style="gap:8px">' + (anyH ? '<button type="button" class="btn soft sm" data-act="ar-fill"><i class="bi bi-magic"></i> Isi sesuai kewajiban</button>' : '') + '<button type="submit" class="btn sm js-setbtn"><i class="bi bi-check2"></i> Simpan setoran</button></div></div>' +
    '<div class="list mt-2" id="arSetList">' + (rows || '<div class="card">' + emptyHtml('bi-people', 'Belum ada peserta', 'Tambahkan peserta dari Data Warga (KK) terlebih dahulu.') + '</div>') + '</div>' +
    '<div class="mt-2"><button type="submit" class="btn block js-setbtn"><i class="bi bi-check2"></i> Simpan setoran</button></div></form>';
  if (S.ui.ar.sq) I['ar-sq']($('[data-input="ar-sq"]'));
}
I['ar-sq'] = el => { const q = el.value.trim().toLowerCase(); S.ui.ar.sq = q; $$('#arSetList .srow').forEach(r => { r.hidden = !!q && r.dataset.n.indexOf(q) < 0; }); };
function collectSetoran() {
  const f = S.store.arSet, items = [], byId = {};
  f.rows.forEach(r => { byId[r.id] = r; });
  $$('#arSetList .srow').forEach(row => {
    const id = row.dataset.id, ni = $('[data-set]', row), cb = $('[data-iu]', row), ct = $('[data-cat]', row);
    const nom = ni ? ribuVal(ni.value) : (byId[id].nominal || 0), orig = ni ? Number(ni.dataset.orig) : (byId[id].nominal || 0);
    const cat = ct.value.trim(), catOrig = ct.dataset.orig;
    const iuChg = cb && !cb.disabled && (cb.checked !== (cb.dataset.orig === '1'));
    if (nom === orig && cat === catOrig && !iuChg) return;
    const it = { id_peserta: id, nominal: nom, catatan: cat };
    if (iuChg) it.iuran = cb.checked;
    items.push(it);
  });
  return items;
}
C['ar-sp'] = async el => {
  const u = S.ui.ar;
  if (collectSetoran().length && !(await confirmDialog({ title: 'Ganti putaran?', message: 'Isian yang belum disimpan akan hilang.', okText: 'Ganti putaran' }))) { el.value = String(u.sp); return; }
  u.sp = +el.value; paintArSetoran($('#arBody'));
};
A['ar-fill'] = () => {
  $$('#arSetList .srow').forEach(row => {
    const i = $('[data-set]', row); if (!i || row.hidden) return;
    const h = Number(i.dataset.harap) || 0;
    if (h > 0 && !ribuVal(i.value)) i.value = ribuFromRp(h);
  });
  toast('Nominal terisi sesuai kewajiban. Ubah bila perlu.', 'info');
};
F['ar-setoran-save'] = async form => {
  if (!form.reportValidity()) return;
  const items = collectSetoran();
  if (!items.length) { toast('Belum ada perubahan untuk disimpan.', 'info'); return; }
  if (items.some(it => it.nominal >= 1000000) && !(await confirmDialog({ title: 'Nominal besar, sudah benar?', message: 'Ada setoran ≥ Rp 1.000.000. Kolom nominal diisi dalam ribuan (ketik 50 untuk Rp 50.000). Lanjutkan menyimpan?', okText: 'Ya, simpan' }))) return;
  const btns = $$('.js-setbtn'); btns.forEach(b => setBusy(b, true, 'Menyimpan…'));
  try {
    const r = await call('arisan.saveSetoran', { periode_ke: S.store.arSet.putaran, tanggal: form.tanggal.value, items: items });
    invalidate(); toast('Tersimpan: ' + (r.dicatat + r.diubah) + ' setoran' + (r.iuranTambah || r.iuranBatal ? ', iuran kas +' + r.iuranTambah + ' / -' + r.iuranBatal : '') + (r.iuranTerkunci ? ' (' + r.iuranTerkunci + ' iuran terkunci karena sudah masuk Kas RT)' : '') + '.', 'ok');
    navigate('arisan');
  } catch (e) { fail(e); } finally { btns.forEach(b => setBusy(b, false)); }
};

// ── Tracking kewajiban & catatan ──
async function paintArTracking(box) {
  const u = S.ui.ar, d = S.store.ar;
  box.innerHTML = loadingCard();
  const t = ++u.ttok;
  try {
    const tr = await call('arisan.tracking', { id_periode: d.periode.id, id_peserta: u.tid || undefined });
    if (u.ttok !== t || u.tab !== 'tracking' || !$('#arBody')) return;
    S.store.arTr = tr; renderArTracking(box, tr);
  } catch (e) { box.innerHTML = '<div class="card">' + emptyHtml('bi-wifi-off', 'Tracking gagal dimuat', e.message) + '</div>'; }
}
function kwTable(rows, src, canPay, withX) {
  return '<table class="rtable"><thead><tr>' + (withX ? '<th>Yang membayar</th>' : '') + '<th>Kepada pemenang</th><th class="right">Seharusnya</th><th class="right">Dibayar</th><th class="right">Kurang</th><th>Status</th><th class="right">Aksi</th></tr></thead><tbody>' +
    rows.map((t, i) => '<tr>' + (withX ? '<td class="full"><b>' + esc(t.x_nama) + '</b><br><span class="small muted">menerima putaran ' + t.putaran_x + '</span></td>' : '') +
      '<td class="full"><span class="small muted">Kepada </span><b>' + esc(t.y_nama) + '</b><br><span class="small muted">putaran ' + t.putaran_y + ' • ' + esc(fmtDate(t.tanggal_y)) + '</span></td>' +
      '<td data-label="Seharusnya" class="right"><span class="amount">' + rp(t.expected) + '</span></td><td data-label="Dibayar" class="right"><span class="amount">' + rp(t.paid) + '</span></td>' +
      '<td data-label="Kurang" class="right"><span class="amount' + (t.kurang ? ' text-bad' : '') + '">' + rp(t.kurang) + '</span></td>' +
      '<td data-label="Status"><span class="badge ' + (t.status === 'Lunas' ? 'ok' : t.status === 'Kurang' ? 'warn' : 'bad') + '">' + t.status + '</span>' + (t.catatan ? '<br><span class="small muted">' + esc(t.catatan) + '</span>' : '') + '</td>' +
      '<td class="actions">' + (canPay && t.kurang > 0 ? '<button type="button" class="btn soft sm" data-act="tr-susul" data-src="' + src + '" data-i="' + i + '">Bayar susulan</button>' : '') + '</td></tr>').join('') + '</tbody></table>';
}
function renderArTracking(box, tr) {
  const d = S.store.ar, u = S.ui.ar;
  let h = '<div class="banner"><i class="bi bi-info-circle"></i><span>Peserta yang sudah menerima arisan membayar kepada pemenang berikutnya <b>sebesar yang dulu dibayarkan pemenang itu kepadanya</b>. Di sini terlihat siapa yang masih kurang.</span></div>';
  h += '<section class="card mt-2"><div class="card-head"><h3><i class="bi bi-exclamation-circle"></i> Kewajiban belum lunas</h3>' + (tr.totalKurang ? '<span class="badge bad">' + rp(tr.totalKurang) + '</span>' : '') + '</div>' +
    (tr.kewajiban.length ? kwTable(tr.kewajiban, 'kw', d.canEdit, true) : emptyHtml('bi-check-circle', 'Tidak ada kewajiban tertunggak', 'Semua pembayaran balik sudah lunas atau belum ada pemenang kedua.')) + '</section>';
  h += '<section class="card mt-2"><h3><i class="bi bi-person-lines-fill"></i> Cek per peserta</h3><p class="help mt-1">Pilih peserta untuk melihat apa yang ia bayarkan di tiap putaran, siapa yang membayar ketika ia menang, dan kewajibannya kepada pemenang berikutnya.</p>' +
    '<div class="field mt-1"><label class="sr-only" for="trSel">Pilih peserta</label><select id="trSel" class="select" data-change="tr-pick"><option value="">— pilih peserta —</option>' + tr.daftar.map(p => '<option value="' + esc(p.id) + '"' + (p.id === u.tid ? ' selected' : '') + '>' + esc(p.nama) + (p.menang ? ' • menang putaran ' + p.menang : '') + '</option>').join('') + '</select></div></section>';
  const dt = tr.detail;
  if (dt) {
    h += '<section class="card mt-2"><div class="row"><span class="avatar">' + esc(initials(dt.nama)) + '</span><div><h3>' + esc(dt.nama) + '</h3>' + (dt.menang ? '<span class="badge ok">Menerima di putaran ' + dt.menang + '</span>' : '<span class="badge gray">Belum menerima</span>') + '</div></div></section>';
    if (dt.diterima) {
      h += '<section class="card mt-2"><div class="card-head"><h3><i class="bi bi-trophy"></i> Saat menang (putaran ' + dt.diterima.putaran + ')</h3><span class="amount in">' + rp(dt.diterima.total_diterima) + '</span></div><p class="help">Rincian siapa yang membayar kepada ' + esc(dt.nama) + ' dan berapa.</p>' + potHtml(dt.diterima.total_setoran_putaran, dt.diterima.potongan, dt.diterima.total_diterima) +
        (dt.diterima.rows.length ? '<table class="rtable mt-1"><thead><tr><th>Penyetor</th><th class="right">Nominal</th><th>Catatan</th></tr></thead><tbody>' + dt.diterima.rows.map(r => '<tr><td data-label="Penyetor">' + esc(r.nama) + '</td><td data-label="Nominal" class="right"><span class="amount' + (r.nominal ? '' : ' text-bad') + '">' + (r.nominal ? rp(r.nominal) : 'belum bayar') + '</span></td><td data-label="Catatan">' + (esc(r.catatan) || '—') + '</td></tr>').join('') + '</tbody></table>' : '<p class="small muted mt-1">Belum ada setoran tercatat.</p>') + '</section>';
    }
    h += '<section class="card mt-2"><h3><i class="bi bi-arrow-left-right"></i> Kewajiban ' + esc(dt.nama) + ' kepada pemenang berikutnya</h3>' +
      (dt.kewajiban.length ? kwTable(dt.kewajiban, 'kd', d.canEdit, false) : '<p class="small muted mt-1">' + (dt.menang ? 'Belum ada pemenang setelah putaran ' + dt.menang + ', atau pemenang berikutnya tidak membayar pada putaran ' + dt.menang + '.' : 'Kewajiban balik baru muncul setelah peserta ini menerima arisan.') + '</p>') + '</section>';
    h += '<section class="card mt-2"><h3><i class="bi bi-clock-history"></i> Riwayat setoran ' + esc(dt.nama) + '</h3><table class="rtable mt-1"><thead><tr><th>Putaran</th><th>Pemenang</th><th class="right">Setoran</th><th>Catatan</th></tr></thead><tbody>' +
      dt.riwayat.map(r => '<tr><td data-label="Putaran">' + r.putaran + (r.tanggal ? '<br><span class="small muted">' + esc(fmtDate(r.tanggal)) + '</span>' : '') + '</td><td data-label="Pemenang">' + esc(r.pemenang) + '</td><td data-label="Setoran" class="right">' + (r.self ? '<span class="badge ok">Penerima</span>' : '<span class="amount' + (r.nominal ? '' : ' text-bad') + '">' + (r.nominal ? rp(r.nominal) : 'belum bayar') + '</span>') + '</td><td data-label="Catatan">' + (esc(r.catatan) || '—') + '</td></tr>').join('') + '</tbody></table></section>';
  }
  box.innerHTML = h;
}
C['tr-pick'] = el => { S.ui.ar.tid = el.value; paintArTracking($('#arBody')); };
A['tr-susul'] = el => {
  const tr = S.store.arTr, row = (el.dataset.src === 'kd' ? tr.detail.kewajiban : tr.kewajiban)[+el.dataset.i];
  if (!row) return;
  S.store.susul = row;
  openModal({
    title: 'Catat pembayaran susulan',
    body: '<form id="susForm" class="form-grid" data-submit="tr-susul-save" novalidate><div class="banner"><i class="bi bi-info-circle"></i><span><b>' + esc(row.x_nama) + '</b> membayar kepada <b>' + esc(row.y_nama) + '</b> (putaran ' + row.putaran_y + '). Seharusnya ' + rp(row.expected) + ', sudah dibayar ' + rp(row.paid) + ', kurang <b>' + rp(row.kurang) + '</b>.</span></div>' +
      '<div class="field"><label for="susN">Nominal yang dibayar sekarang <span class="req">*</span></label>' + ribuBox({ id: 'susN', name: 'nom', value: row.kurang, req: true, prev: true }) + '</div>' +
      '<div class="field"><label for="susT">Tanggal bayar</label><input id="susT" name="tgl" type="date" class="input" required value="' + todayISO() + '"></div>' +
      '<div class="field"><label for="susC">Catatan</label><input id="susC" name="cat" class="input" maxlength="120" value="Dibayar susulan"></div></form>',
    footer: '<button type="button" class="btn outline" data-act="modal-close">Batal</button><button type="submit" form="susForm" class="btn" id="susBtn"><i class="bi bi-check2"></i> Simpan</button>'
  });
};
F['tr-susul-save'] = async form => {
  if (!form.reportValidity()) return;
  const row = S.store.susul, add = ribuVal(form.nom.value);
  if (add < 1) { toast('Nominal harus lebih dari 0.', 'warn'); return; }
  if (add >= 1000000 && !(await confirmDialog({ title: 'Nominal besar, sudah benar?', message: 'Anda mengisi ' + rp(add) + '. Ketik dalam ribuan (50 = Rp 50.000).', okText: 'Ya, simpan' }))) return;
  const cat = ((row.catatan ? row.catatan + ' | ' : '') + form.cat.value.trim() + ' ' + rp(add) + ' (' + fmtDate(form.tgl.value) + ')').slice(0, 300);
  const btn = $('#susBtn'); setBusy(btn, true, 'Menyimpan…');
  try {
    await call('arisan.saveSetoran', { periode_ke: row.putaran_y, tanggal: form.tgl.value, items: [{ id_peserta: row.x_id, nominal: row.paid + add, catatan: cat }] });
    invalidate(); closeTopModal(); toast('Pembayaran susulan dicatat.', 'ok'); navigate('arisan');
  } catch (e) { fail(e); } finally { setBusy(btn, false); }
};

// ── Pengurus: kocokan, peserta, periode, PDF ──
A['ar-kocokan'] = () => {
  const d = S.store.ar, cand = d.peserta.filter(p => p.status_menang !== 'Sudah');
  if (!cand.length) { toast('Semua peserta sudah menang. Buat periode arisan baru lewat menu Lainnya.', 'warn'); return; }
  openModal({
    title: 'Catat hasil kocokan',
    body: '<form id="kocForm" class="form-grid" data-submit="ar-kocokan-save" novalidate><div class="banner' + (d.totalSetoranIni ? '' : ' warn') + '"><i class="bi bi-info-circle"></i><span>Putaran ke-<b>' + d.putaran + '</b>. Kandidat: <b>' + cand.length + '</b> peserta yang belum menang. ' + (d.totalSetoranIni ? 'Setoran terkumpul: <b>' + rp(d.totalSetoranIni) + '</b> dari ' + d.setoranIniCount + ' penyetor.' : '<b>Belum ada setoran tercatat</b> — catat setoran dahulu atau isi total setoran secara manual.') + '<br>Dipotong <b>' + rp(d.potonganDefault) + '</b> untuk Kas RT; sisanya diterima pemenang.</span></div>' +
      '<div class="field"><div class="row between"><label for="kcP">Penerima <span class="req">*</span></label><button type="button" class="link-btn" data-act="ar-acak" style="padding:0"><i class="bi bi-shuffle"></i> Acak otomatis</button></div><select id="kcP" name="id_peserta" class="select" required><option value="">Pilih penerima…</option>' + cand.map(p => '<option value="' + esc(p.id) + '">' + esc(p.nama) + (p.blok ? ' — ' + esc(p.blok) : '') + '</option>').join('') + '</select></div>' +
      '<div class="field"><label for="kcT">Tanggal kocokan</label><input id="kcT" name="tanggal" type="date" class="input" required value="' + todayISO() + '"></div>' +
      '<div class="field"><label for="kcN">Total seluruh setoran (opsional)</label>' + ribuBox({ id: 'kcN', name: 'total', value: '', prev: true }) + '<span class="help">Kosongkan agar dihitung otomatis dari seluruh setoran putaran ini.</span></div>' +
      '<div class="field"><label for="kcK">Keterangan</label><input id="kcK" name="ket" class="input" maxlength="300" placeholder="Contoh: dikocok di rumah Bpk. Syafei"></div></form>',
    footer: '<button type="button" class="btn outline" data-act="modal-close">Batal</button><button type="submit" form="kocForm" class="btn" id="kcBtn"><i class="bi bi-check2"></i> Simpan hasil</button>'
  });
};
A['ar-acak'] = async el => {
  try { setBusy(el, true, 'Mengacak…'); const r = await call('arisan.acak', {}); $('#kcP').value = r.id; toast('Terpilih: ' + r.nama + ' (dari ' + r.kandidat + ' kandidat)', 'ok'); }
  catch (e) { fail(e); } finally { setBusy(el, false); }
};
F['ar-kocokan-save'] = async form => {
  if (!form.reportValidity()) return;
  const nama = form.id_peserta.options[form.id_peserta.selectedIndex].text;
  if (!(await confirmDialog({ title: 'Simpan hasil kocokan?', message: 'Penerima putaran ' + S.store.ar.putaran + ': ' + nama + '. Peserta ini tidak akan masuk undian lagi pada periode ini.', okText: 'Simpan hasil' }))) return;
  const btn = $('#kcBtn'); setBusy(btn, true, 'Menyimpan…');
  try {
    const r = await call('arisan.saveKocokan', { id_peserta: form.id_peserta.value, tanggal: form.tanggal.value, total_diterima: ribuVal(form.total.value) || '', keterangan: form.ket.value });
    invalidate(); closeTopModal(); toast('Kocokan tersimpan: ' + r.nama + ' menerima ' + rp(r.diterima) + ' (setoran ' + rp(r.total) + ' − kas ' + rp(r.potongan) + ')', 'ok'); S.ui.ar.tab = 'riwayat'; S.ui.ar.sp = 0; navigate('arisan');
  } catch (e) { fail(e); } finally { setBusy(btn, false); }
};
function potHtml(total, pot, net) {
  return '<div class="potbox"><div class="row between"><span>Total seluruh setoran</span><b class="amount">' + rp(total) + '</b></div>' +
    '<div class="row between"><span>Potongan untuk Kas RT</span><b class="amount text-bad">− ' + rp(pot) + '</b></div>' +
    '<div class="row between potnet"><span>Diterima pemenang</span><b class="amount in">' + rp(net) + '</b></div></div>';
}
A['ar-kocokan-edit'] = el => {
  const d = S.store.ar, k = d.riwayat.find(x => x.id === el.dataset.id); if (!k) return;
  const cand = d.peserta.filter(p => p.status_menang !== 'Sudah' || p.id === k.id_peserta);
  openModal({
    title: 'Edit putaran ' + k.putaran, wide: true,
    body: '<form id="kcEdForm" class="form-grid" data-submit="ar-kocokan-update" novalidate><input type="hidden" name="id" value="' + esc(k.id) + '">' +
      '<div class="banner"><i class="bi bi-info-circle"></i><span>Total penerima otomatis mengikuti <b>seluruh setoran</b> putaran ini. Untuk menambah atau mengubah nominal setoran dan iuran kas, tekan <b>Ubah setoran</b> (info pembayaran susulan dari warga juga muncul di sana).</span></div>' +
      '<div class="field"><label for="keP">Penerima</label><select id="keP" name="id_peserta" class="select">' + cand.map(p => '<option value="' + esc(p.id) + '"' + (p.id === k.id_peserta ? ' selected' : '') + '>' + esc((p.no ? p.no + '. ' : '') + p.nama) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label for="keT">Tanggal kocokan</label><input id="keT" name="tanggal" type="date" class="input" required value="' + esc(k.tanggal) + '"></div>' +
      '<div class="field"><label for="keN">Total seluruh setoran (opsional)</label>' + ribuBox({ id: 'keN', name: 'total', value: k.manual ? k.total : '', prev: true }) + '<span class="help">Kosongkan agar dihitung otomatis dari setoran (saat ini ' + rp(k.total) + '). Isi hanya bila ingin menetapkan angka tertentu.</span></div>' +
      '<div class="field"><label for="keC">Potongan untuk Kas RT (opsional)</label>' + ribuBox({ id: 'keC', name: 'pot', value: k.potongan > 0 && k.potongan !== d.potonganDefault ? k.potongan : '', prev: true }) + '<span class="help">Kosongkan untuk potongan standar ' + rp(d.potonganDefault) + '. Saat ini: ' + rp(k.potongan) + '.</span><label class="check mt-1"><input type="checkbox" name="nopot"' + (k.potongan === 0 && d.potonganDefault > 0 ? ' checked' : '') + '> Putaran ini tanpa potongan kas (Rp 0)</label></div>' +
      '<div class="field"><label for="keK">Keterangan</label><input id="keK" name="ket" class="input" maxlength="300" value="' + esc(k.keterangan || '') + '"></div></form>',
    footer: '<button type="button" class="btn outline" data-act="modal-close">Batal</button><button type="button" class="btn soft" data-act="ar-edit-setoran" data-p="' + k.putaran + '"><i class="bi bi-cash-stack"></i> Ubah setoran</button><button type="submit" form="kcEdForm" class="btn" id="keBtn"><i class="bi bi-check2"></i> Simpan</button>'
  });
};
A['ar-edit-setoran'] = el => { const u = S.ui.ar; closeTopModal(); u.tab = 'setoran'; u.sp = +el.dataset.p; paintArisan(); window.scrollTo(0, 0); };
F['ar-kocokan-update'] = async form => {
  if (!form.reportValidity()) return;
  const btn = $('#keBtn'); setBusy(btn, true, 'Menyimpan…');
  try {
    const r = await call('arisan.updateKocokan', { id: form.id.value, id_peserta: form.id_peserta.value, tanggal: form.tanggal.value, total_diterima: ribuVal(form.total.value) || '', potongan_kas: form.nopot.checked ? 0 : (form.pot.value.trim() === '' ? '' : ribuVal(form.pot.value)), keterangan: form.ket.value });
    invalidate(); closeTopModal(); toast('Putaran ' + r.putaran + ' diperbarui: ' + r.nama + ' menerima ' + rp(r.diterima) + ' (setoran ' + rp(r.total) + ' − kas ' + rp(r.potongan) + ')', 'ok'); navigate('arisan');
  } catch (e) { fail(e); } finally { setBusy(btn, false); }
};
A['ar-kocokan-del'] = async el => {
  if (!(await confirmDialog({ title: 'Batalkan kocokan terakhir?', message: 'Status penerima akan dikembalikan menjadi “belum dapat”. Gunakan hanya untuk koreksi salah catat.', okText: 'Batalkan kocokan', danger: true }))) return;
  try { await call('arisan.hapusKocokan', { id: el.dataset.id }); invalidate(); toast('Kocokan dibatalkan.', 'ok'); navigate('arisan'); } catch (e) { fail(e); }
};
A['ar-more'] = () => {
  const d = S.store.ar;
  openModal({ title: 'Pengelolaan arisan', body: '<div class="menu-list">' +
    '<button type="button" class="menu-item" data-act="ar-pdf"><span class="item-ico"><i class="bi bi-file-earmark-pdf"></i></span><span>Unduh rincian (PDF)<small>Rekap periode atau rincian satu putaran</small></span></button>' +
    (d.isAktif ? '<button type="button" class="menu-item" data-act="ar-sync"><span class="item-ico"><i class="bi bi-person-lines-fill"></i></span><span>Sinkron dari Data Warga (KK)<small>Tambahkan semua KK aktif yang belum menjadi peserta</small></span></button>' +
      '<button type="button" class="menu-item" data-act="ar-periode-edit"><span class="item-ico"><i class="bi bi-pencil-square"></i></span><span>Ubah nama &amp; tahun periode<small>' + esc(d.periode.nama) + ' (' + d.periode.mulai + '–' + d.periode.selesai + ')</small></span></button>' +
      '<button type="button" class="menu-item" data-act="ar-periode-new"><span class="item-ico warn"><i class="bi bi-calendar-plus"></i></span><span>Buat periode arisan baru<small>Tutup periode ini; semua peserta kembali masuk undian, putaran mulai dari 1</small></span></button>' : '') + '</div>',
    footer: '<button type="button" class="btn outline" data-act="modal-close">Tutup</button>' });
};
A['ar-sync'] = async () => {
  closeTopModal();
  if (!(await confirmDialog({ title: 'Sinkron dari Data Warga?', message: 'Semua KK aktif yang belum menjadi peserta akan ditambahkan sebagai peserta arisan.', okText: 'Sinkronkan' }))) return;
  try { const r = await call('arisan.syncKK', {}); invalidate(); toast(r.ditambahkan + ' peserta ditambahkan.', 'ok'); navigate('arisan'); } catch (e) { fail(e); }
};

// Periode arisan
function periodeForm(o) {
  return '<form id="prForm" class="form-grid" data-submit="' + o.submit + '" novalidate><input type="hidden" name="id" value="' + esc(o.id || '') + '">' +
    '<div class="field"><label for="prN">Nama periode <span class="req">*</span></label><input id="prN" name="nama" class="input" maxlength="80" required value="' + esc(o.nama) + '" data-input="pr-nama" data-auto="' + (o.auto ? 1 : 0) + '"></div>' +
    '<div class="form-grid two"><div class="field"><label for="prM">Tahun mulai <span class="req">*</span></label><input id="prM" name="mulai" type="number" inputmode="numeric" min="2000" max="2200" class="input" required value="' + o.mulai + '" data-input="pr-years"></div>' +
    '<div class="field"><label for="prS">Tahun selesai <span class="req">*</span></label><input id="prS" name="selesai" type="number" inputmode="numeric" min="2000" max="2200" class="input" required value="' + o.selesai + '" data-input="pr-years"></div></div></form>';
}
I['pr-nama'] = el => { el.dataset.auto = '0'; };
I['pr-years'] = el => { const f = el.form, n = f.nama; if (n.dataset.auto === '1' && f.mulai.value && f.selesai.value) n.value = 'Arisan ' + f.mulai.value + '–' + f.selesai.value; };
A['ar-periode-edit'] = () => {
  closeTopModal();
  const p = S.store.ar.periode;
  openModal({ title: 'Ubah periode arisan', body: periodeForm({ submit: 'ar-periode-save', id: p.id, nama: p.nama, mulai: p.mulai, selesai: p.selesai, auto: false }),
    footer: '<button type="button" class="btn outline" data-act="modal-close">Batal</button><button type="submit" form="prForm" class="btn" id="prBtn">Simpan</button>' });
};
A['ar-periode-new'] = () => {
  closeTopModal();
  const p = S.store.ar.periode, m = Math.max(p.selesai, new Date().getFullYear()), s = m + 5;
  openModal({ title: 'Buat periode arisan baru',
    body: '<div class="banner warn" style="margin-bottom:12px"><i class="bi bi-exclamation-triangle"></i><span>Periode <b>' + esc(p.nama) + '</b> akan ditutup dan tetap tersimpan (bisa dilihat kapan saja). Semua peserta kembali masuk undian dan putaran dimulai dari 1.</span></div>' +
      periodeForm({ submit: 'ar-periode-baru', nama: 'Arisan ' + m + '–' + s, mulai: m, selesai: s, auto: true }),
    footer: '<button type="button" class="btn outline" data-act="modal-close">Batal</button><button type="submit" form="prForm" class="btn danger" id="prBtn">Tutup periode lama &amp; mulai baru</button>' });
};
function periodePayload(form) { return { id: form.id.value || undefined, nama: form.nama.value, tahun_mulai: form.mulai.value, tahun_selesai: form.selesai.value }; }
F['ar-periode-save'] = async form => {
  if (!form.reportValidity()) return;
  const btn = $('#prBtn'); setBusy(btn, true, 'Menyimpan…');
  try { await call('arisan.periodeSave', periodePayload(form)); invalidate(); closeTopModal(); toast('Periode diperbarui.', 'ok'); navigate('arisan'); } catch (e) { fail(e); } finally { setBusy(btn, false); }
};
F['ar-periode-baru'] = async form => {
  if (!form.reportValidity()) return;
  if (!(await confirmDialog({ title: 'Mulai periode arisan baru?', message: 'Periode saat ini ditutup dan tidak dapat diubah lagi. Lanjutkan?', okText: 'Ya, mulai periode baru', danger: true }))) return;
  const btn = $('#prBtn'); setBusy(btn, true, 'Memproses…');
  try { await call('arisan.periodeBaru', periodePayload(form)); invalidate(); S.ui.ar = null; S.ui.iu = null; closeTopModal(); toast('Periode arisan baru dimulai.', 'ok'); navigate('arisan'); } catch (e) { fail(e); } finally { setBusy(btn, false); }
};

// PDF rincian arisan
function openArPdf(jenis, putaran) {
  const d = S.store.ar, max = d.isAktif ? d.putaran : Math.max(1, d.putaranSelesai);
  const opts = []; for (let i = max; i >= 1; i--) opts.push('<option value="' + i + '"' + (i === (putaran || max) ? ' selected' : '') + '>Putaran ' + i + '</option>');
  openModal({
    title: 'Unduh rincian arisan (PDF)',
    body: '<form id="apForm" class="form-grid" data-submit="ar-pdf-go" novalidate><div class="field"><label for="apJ">Isi PDF</label><select id="apJ" name="jenis" class="select" data-change="ar-pdf-jenis"><option value="ringkasan"' + (jenis === 'ringkasan' ? ' selected' : '') + '>Rekap periode (peserta, riwayat kocokan, kewajiban)</option><option value="putaran"' + (jenis === 'putaran' ? ' selected' : '') + '>Rincian satu putaran (setoran &amp; catatan)</option></select></div>' +
      '<div class="field" id="apPutWrap"' + (jenis === 'putaran' ? '' : ' hidden') + '><label for="apP">Putaran</label><select id="apP" name="putaran" class="select">' + opts.join('') + '</select></div></form><div id="apOut" class="mt-2"></div>',
    footer: '<button type="button" class="btn outline" data-act="modal-close">Tutup</button><button type="submit" form="apForm" class="btn" id="apBtn"><i class="bi bi-file-earmark-pdf"></i> Buat PDF</button>'
  });
}
A['ar-pdf'] = () => { closeTopModal(); openArPdf('ringkasan'); };
A['ar-pdf-put'] = el => openArPdf('putaran', +el.dataset.p);
C['ar-pdf-jenis'] = el => { $('#apPutWrap').hidden = el.value !== 'putaran'; };
F['ar-pdf-go'] = async form => {
  const btn = $('#apBtn'), out = $('#apOut'); setBusy(btn, true, 'Membuat PDF…');
  try {
    const f = await call('arisan.pdf', { jenis: form.jenis.value, putaran: form.putaran.value, id_periode: S.store.ar.periode.id });
    out.innerHTML = '<div class="banner"><i class="bi bi-check-circle"></i><span>PDF siap: <b>' + esc(f.name) + '</b></span></div><button type="button" class="btn block mt-1" id="apDl"><i class="bi bi-download"></i> Unduh PDF</button>';
    $('#apDl').onclick = () => saveFile(f);
  } catch (e) { fail(e); } finally { setBusy(btn, false); }
};

// Peserta (selalu dari Data Warga / KK)
async function kkChoices(exclude, selected) {
  const d = S.cache['kk.list'] ? S.cache['kk.list'].data : await call('kk.list', {});
  S.cache['kk.list'] = S.cache['kk.list'] || { data: d, t: Date.now() };
  return d.rows.filter(r => r.aktif && (!exclude || !exclude[r.id] || r.id === selected));
}
A['ar-peserta-new'] = async () => {
  try {
    const ada = {}; S.store.ar.peserta.forEach(p => { if (p.id_kk) ada[p.id_kk] = true; });
    const rows = await kkChoices(ada);
    if (!rows.length) { toast('Semua KK aktif sudah menjadi peserta. Tambahkan KK baru di menu Data Warga.', 'warn'); return; }
    openModal({ title: 'Tambah peserta dari Data Warga',
      body: '<form id="psForm" class="form-grid" data-submit="ar-peserta-save" novalidate><input type="hidden" name="id" value=""><div class="field"><label for="psK">Warga (KK) <span class="req">*</span></label><select id="psK" name="id_kk" class="select" required><option value="">Pilih dari Data Warga…</option>' + rows.map(r => '<option value="' + esc(r.id) + '">' + esc(r.nama) + ' — ' + esc(r.blok) + '</option>').join('') + '</select><span class="help">Nama peserta mengikuti Data Warga (KK).</span></div>' +
        '<div class="field"><label for="psU">Nomor urut (opsional)</label><input id="psU" name="urut" type="number" min="1" class="input"></div></form>',
      footer: '<button type="button" class="btn outline" data-act="modal-close">Batal</button><button type="submit" form="psForm" class="btn" id="psBtn">Simpan</button>' });
  } catch (e) { fail(e); }
};
A['ar-peserta-edit'] = el => {
  const p = S.store.ar.peserta.find(x => x.id === el.dataset.id); if (!p) return;
  openModal({ title: 'Ubah peserta',
    body: '<form id="psForm" class="form-grid" data-submit="ar-peserta-save" novalidate><input type="hidden" name="id" value="' + esc(p.id) + '"><div class="field"><label>Nama (dari Data Warga)</label><input class="input" disabled value="' + esc(p.nama) + '"><span class="help">Untuk mengubah nama, ubah di menu Data Warga (KK).</span></div>' +
      '<div class="field"><label for="psU">Nomor urut (opsional)</label><input id="psU" name="urut" type="number" min="1" class="input" value="' + esc(p.nomor_urut || '') + '"></div>' +
      '<label class="check"><input type="checkbox" name="nonaktif"> Nonaktifkan peserta (tidak ikut undian dan hitungan setoran)</label></form>',
    footer: '<button type="button" class="btn outline" data-act="modal-close">Batal</button><button type="submit" form="psForm" class="btn" id="psBtn">Simpan</button>' });
};
F['ar-peserta-save'] = async form => {
  if (!form.reportValidity()) return;
  const btn = $('#psBtn'); setBusy(btn, true, 'Menyimpan…');
  const p = { id: form.id.value || undefined, id_kk: form.id_kk ? form.id_kk.value : undefined, nomor_urut: form.urut.value };
  if (form.nonaktif && form.nonaktif.checked) p.aktif = false;
  try { await call('arisan.savePeserta', p); invalidate(); closeTopModal(); toast('Peserta disimpan.', 'ok'); navigate('arisan'); } catch (e) { fail(e); } finally { setBusy(btn, false); }
};

// ════════════════════════════════════════════════════════
// BAGIAN 9B: IURAN KAS PER KK
// ════════════════════════════════════════════════════════
function pageIuran(nav) {
  const u = S.ui.iu = S.ui.iu || { q: '', f: '', page: 1, put: 0 };
  load('iuran.overview', u.put ? { putaran: u.put } : {}, 'iuran:' + (u.put || 'now'), nav, d => {
    S.store.iu = d;
    if (!isStaff()) return paintIuranWarga(d);
    if (!$('#iuBody')) {
      paint(pageHead({ eyebrow: 'Kas warga', title: 'Iuran Kas KK', sub: 'Iuran kas ' + rp(d.nominal) + ' per KK pada setiap kumpulan arisan. Boleh dibayar kapan saja; centang bila sudah membayar.', actions: '<span id="iuAct"></span>' }) +
        '<div id="iuStats"></div><div id="iuBody" class="mt-2"></div>');
    }
    paintIuran();
  });
}
function paintIuranStats() {
  const d = S.store.iu, s = d.stats;
  $('#iuStats').innerHTML = '<div class="grid kpi"><div class="kpi-tile"><span class="lbl">Terkumpul (periode)</span><div class="val">' + rp(s.terkumpul) + '</div><div class="hint">' + esc(d.periode.nama) + '</div></div>' +
    '<div class="kpi-tile"><span class="lbl">Belum dicatat ke Kas</span><div class="val">' + rp(s.belumPosting) + '</div><div class="hint">Catat ke Kas RT bila siap</div></div>' +
    '<div class="kpi-tile"><span class="lbl">Putaran ' + d.putaran + '</span><div class="val">' + s.lunasIni + '/' + s.jumlahKK + ' KK</div><div class="hint">sudah membayar</div></div>' +
    '<div class="kpi-tile"><span class="lbl">Iuran per KK</span><div class="val">' + rp(d.nominal) + '</div><div class="hint">Atur di menu Pengaturan</div></div></div>';
  $('#iuAct').innerHTML = d.canEdit && s.belumPosting > 0 ? '<button type="button" class="btn" data-act="iu-post"><i class="bi bi-wallet2"></i> Catat ' + rp(s.belumPosting) + ' ke Kas RT</button>' : '';
}
function paintIuran() {
  const d = S.store.iu, u = S.ui.iu;
  paintIuranStats();
  if (!$('#iuList')) {
    const opts = []; for (let i = d.putaranMax; i >= 1; i--) opts.push('<option value="' + i + '"' + (i === d.putaran ? ' selected' : '') + '>Putaran ' + i + (i === d.putaranMax && d.isAktif ? ' (berjalan)' : '') + '</option>');
    $('#iuBody').innerHTML = '<div class="card flat"><div class="form-grid two"><div class="field"><label for="iuPut">Putaran</label><select id="iuPut" class="select" data-change="iu-put">' + opts.join('') + '</select></div>' +
      '<div class="field"><label for="iuQ">Cari warga</label><div class="search"><i class="bi bi-search"></i><input id="iuQ" class="input" type="search" placeholder="Nama atau blok…" data-input="iu-q" value="' + esc(u.q) + '"></div></div></div><div class="chips mt-1" id="iuChips"></div></div>' +
      '<div class="mt-2"><table class="rtable" id="iuList"></table></div><div id="iuPager"></div>';
  }
  const rows = d.rows, c = { '': rows.length, ya: rows.filter(r => r.bayar).length, belum: rows.filter(r => !r.bayar).length, tunggak: rows.filter(r => r.tunggak > 0).length };
  $('#iuChips').innerHTML = [['', 'Semua (' + c[''] + ')'], ['ya', 'Sudah bayar (' + c.ya + ')'], ['belum', 'Belum bayar (' + c.belum + ')'], ['tunggak', 'Menunggak (' + c.tunggak + ')']].map(x => '<button type="button" class="chip" data-act="iu-f" data-v="' + x[0] + '" aria-pressed="' + (u.f === x[0]) + '">' + x[1] + '</button>').join('');
  const q = u.q.toLowerCase();
  const list = rows.filter(r => (!u.f || (u.f === 'ya' ? r.bayar : u.f === 'belum' ? !r.bayar : r.tunggak > 0)) && (!q || r.nama.toLowerCase().indexOf(q) >= 0 || (r.blok || '').toLowerCase().indexOf(q) >= 0));
  const pg = paginate(list, u.page, 20); u.page = pg.page;
  $('#iuList').innerHTML = '<thead><tr><th>No</th><th>Warga (KK)</th><th>Putaran ' + d.putaran + '</th><th class="right">Terbayar</th><th class="right">Tunggakan</th><th class="right">Aksi</th></tr></thead><tbody>' +
    (pg.rows.length ? pg.rows.map((r, i) => '<tr><td data-label="No">' + (r.no || (pg.from + i)) + '</td><td class="full"><div class="row"><span class="avatar sm">' + esc(initials(r.nama)) + '</span><div><b>' + esc(r.nama) + '</b>' + (r.blok ? '<br><span class="small muted">' + esc(r.blok) + '</span>' : '') + '</div></div></td>' +
      '<td data-label="Putaran ' + d.putaran + '"><input type="checkbox" class="tick" data-change="iu-toggle" data-id="' + esc(r.id_kk) + '"' + (r.bayar ? ' checked' : '') + (!d.canEdit || r.kunci ? ' disabled' : '') + ' aria-label="Iuran ' + esc(r.nama) + ' putaran ' + d.putaran + '"> ' + (r.kunci ? '<i class="bi bi-lock-fill muted" title="Sudah dicatat ke Kas RT"></i>' : '') + '</td>' +
      '<td data-label="Terbayar" class="right"><span class="amount">' + rp(r.total) + '</span><br><span class="small muted">' + r.sudah + ' dari ' + d.putaranMax + ' putaran</span></td>' +
      '<td data-label="Tunggakan" class="right">' + (r.tunggak ? '<span class="badge warn">' + r.tunggak + ' putaran = ' + rp(r.tunggak * d.nominal) + '</span>' : '<span class="badge ok">Lunas</span>') + '</td>' +
      '<td class="actions"><button type="button" class="btn soft sm" data-act="iu-detail" data-id="' + esc(r.id_kk) + '">Rincian</button></td></tr>').join('')
      : '<tr><td colspan="6" class="full">' + emptyHtml('bi-people', 'Tidak ada data', 'Tambahkan KK di menu Data Warga atau ubah filter.') + '</td></tr>') + '</tbody>';
  $('#iuPager').innerHTML = pagerHtml(pg, 'iu-page');
}
I['iu-q'] = debounce(el => { S.ui.iu.q = el.value.trim(); S.ui.iu.page = 1; paintIuran(); }, 200);
A['iu-f'] = el => { S.ui.iu.f = el.dataset.v; S.ui.iu.page = 1; paintIuran(); };
A['iu-page'] = el => { S.ui.iu.page = +el.dataset.p; paintIuran(); window.scrollTo(0, 0); };
C['iu-put'] = el => { const u = S.ui.iu; u.put = +el.value; u.page = 1; S.nav++; $('#iuBody').innerHTML = loadingCard(); pageIuran(S.nav); };
function iuApply(id, putaran, bayar) {
  const d = S.store.iu, r = d.rows.find(x => x.id_kk === id); if (!r) return;
  if (putaran === d.putaran) { r.bayar = bayar; if (d.stats) d.stats.lunasIni += bayar ? 1 : -1; }
  r.sudah += bayar ? 1 : -1; r.total += bayar ? d.nominal : -d.nominal; r.tunggak = Math.max(0, d.putaranMax - r.sudah);
  if (d.stats) { d.stats.terkumpul += bayar ? d.nominal : -d.nominal; d.stats.belumPosting += bayar ? d.nominal : -d.nominal; }
}
C['iu-toggle'] = async el => {
  const d = S.store.iu, id = el.dataset.id, want = el.checked;
  el.disabled = true;
  try { await call('iuran.set', { id_kk: id, putaran: d.putaran, bayar: want }); invalidate(); iuApply(id, d.putaran, want); paintIuran(); }
  catch (e) { el.checked = !want; el.disabled = false; fail(e); }
};
A['iu-post'] = async () => {
  const s = S.store.iu.stats;
  if (!(await confirmDialog({ title: 'Catat ke Kas RT?', message: rp(s.belumPosting) + ' akan dicatat sebagai pemasukan Kas RT (kategori Iuran Warga). Iuran yang sudah dicatat dikunci dan tidak bisa dibatalkan dari sini.', okText: 'Catat ke Kas' }))) return;
  try { const r = await call('iuran.posting', {}); invalidate(); toast(rp(r.total) + ' dicatat ke Kas RT (' + r.jumlah + ' pembayaran).', 'ok'); navigate('iuran'); } catch (e) { fail(e); }
};
function iuChips(k, canEdit) {
  return '<div class="pchips">' + k.items.map(it => '<button type="button" class="pchip" ' + (canEdit && !it.kunci ? 'data-act="iu-chip" data-id="' + esc(k.id_kk) + '" data-p="' + it.putaran + '"' : 'disabled') + ' aria-pressed="' + it.bayar + '" aria-label="Putaran ' + it.putaran + (it.bayar ? ' sudah bayar' : ' belum bayar') + '">' + (it.bayar ? '<i class="bi bi-check-lg"></i>' : '') + 'P-' + it.putaran + (it.kunci ? ' <i class="bi bi-lock-fill"></i>' : '') + '</button>').join('') + '</div>';
}
function iuSummary(k) {
  return '<div class="banner"><i class="bi bi-cash-coin"></i><span>Terbayar <b>' + k.sudah + '</b> dari ' + k.items.length + ' putaran (<b>' + rp(k.total) + '</b>). ' + (k.tunggak ? 'Tunggakan <b class="text-bad">' + k.tunggak + ' putaran = ' + rp(k.tunggak * k.nominal) + '</b>.' : '<b class="text-ok">Lunas.</b>') + '</span></div>';
}
A['iu-detail'] = async el => {
  const m = openModal({ title: 'Rincian iuran kas', wide: true, body: loadingCard(), footer: '<button type="button" class="btn outline" data-act="modal-close">Tutup</button>', onClose: () => { if (S.page === 'iuran' && $('#iuList')) { S.nav++; pageIuran(S.nav); } } });
  try {
    const k = await call('iuran.kk', { id_kk: el.dataset.id, id_periode: S.store.iu.periode.id });
    S.store.iuk = k;
    const draw = () => { m.body.innerHTML = '<div class="row"><span class="avatar">' + esc(initials(k.nama)) + '</span><div><h3>' + esc(k.nama) + '</h3><span class="small muted">Iuran ' + rp(k.nominal) + ' per putaran • ' + esc(S.store.iu.periode.nama) + '</span></div></div><div class="mt-2">' + iuSummary(k) + '</div>' +
      '<h4 class="mt-2" style="font-size:13px">Ketuk putaran untuk mencentang / membatalkan</h4><div class="mt-1" id="iuChipBox">' + iuChips(k, k.canEdit) + '</div>'; };
    S.store.iuDraw = draw; draw();
  } catch (e) { m.close(); fail(e); }
};
A['iu-chip'] = async el => {
  const k = S.store.iuk, p = +el.dataset.p, it = k.items[p - 1];
  el.disabled = true;
  try {
    await call('iuran.set', { id_kk: k.id_kk, putaran: p, bayar: !it.bayar });
    invalidate(); it.bayar = !it.bayar; k.sudah += it.bayar ? 1 : -1; k.total += it.bayar ? k.nominal : -k.nominal; k.tunggak = k.items.length - k.sudah;
    S.store.iuDraw();
  } catch (e) { el.disabled = false; fail(e); }
};
async function paintIuranWarga(d) {
  const head = pageHead({ eyebrow: 'Kas warga', title: 'Iuran Kas Saya', sub: 'Iuran kas ' + rp(d.nominal) + ' per KK pada setiap kumpulan arisan. Boleh dibayar kapan saja.' });
  if (!d.rows.length) { paint(head + '<section class="card">' + emptyHtml('bi-person-vcard', 'Akun belum ditautkan ke data KK', 'Hubungi pengurus RT agar akun Anda dikaitkan dengan data KK.') + '</section>'); return; }
  paint(head + '<section class="card" id="iuWarga">' + '<div class="center muted" style="padding:24px"><span class="spin"></span></div></section><p class="small muted mt-2">Pembayaran dicatat oleh pengurus. Bila ada yang tidak sesuai, hubungi bendahara.</p>');
  try {
    const k = await call('iuran.kk', { id_kk: d.rows[0].id_kk });
    if (S.page !== 'iuran' || !$('#iuWarga')) return;
    $('#iuWarga').innerHTML = '<div class="row"><span class="avatar">' + esc(initials(k.nama)) + '</span><div><h3>' + esc(k.nama) + '</h3><span class="small muted">' + esc(d.periode.nama) + '</span></div></div><div class="mt-2">' + iuSummary(k) + '</div><div class="mt-2">' + iuChips(k, false) + '</div>';
  } catch (e) { fail(e); }
}

// ════════════════════════════════════════════════════════
// BAGIAN 9C: PENGURUS RT (nama terhubung ke Data Warga)
// ════════════════════════════════════════════════════════
const JABATAN_INTI = ['Ketua RT', 'Wakil Ketua RT', 'Sekretaris', 'Wakil Sekretaris', 'Bendahara', 'Wakil Bendahara'];
const JABATAN_SARAN = JABATAN_INTI.concat(['Seksi Keamanan', 'Seksi Kebersihan', 'Seksi Sosial', 'Seksi Pembangunan', 'Seksi Humas', 'Seksi Keagamaan', 'Seksi Pemuda']);
function pengurusCard(r, canEdit) {
  return '<article class="card pcard"><span class="avatar" style="width:48px;height:48px">' + esc(initials(r.nama)) + '</span><div class="grow"><span class="badge">' + esc(r.jabatan) + '</span><h3 class="mt-1">' + esc(r.nama) + '</h3>' +
    (r.blok ? '<p class="small muted">' + esc(r.blok) + '</p>' : '') +
    '<div class="row wrap mt-1" style="gap:8px">' + (r.no_hp && digits(r.no_hp).length >= 6 ? '<a class="btn soft sm" data-native="1" href="tel:' + esc(digits(r.no_hp)) + '"><i class="bi bi-telephone"></i> Hubungi</a>' : '') +
    (canEdit ? '<button type="button" class="btn outline sm" data-act="pj-edit" data-id="' + esc(r.id) + '" aria-label="Ubah"><i class="bi bi-pencil"></i></button><button type="button" class="btn danger sm" data-act="pj-del" data-id="' + esc(r.id) + '" aria-label="Hapus"><i class="bi bi-trash"></i></button>' : '') + '</div></div></article>';
}
function pagePengurus(nav) {
  load('pengurus.list', {}, 'pengurus', nav, d => {
    S.store.pj = d;
    const inti = d.rows.filter(r => JABATAN_INTI.indexOf(r.jabatan) >= 0), lain = d.rows.filter(r => JABATAN_INTI.indexOf(r.jabatan) < 0);
    paint(pageHead({ eyebrow: 'Organisasi lingkungan', title: 'Pengurus RT', sub: 'Susunan pengurus RT. Nama terhubung ke Data Warga (KK).', actions: d.canEdit ? '<button class="btn" type="button" data-act="pj-new"><i class="bi bi-plus-lg"></i> Tambah pengurus</button>' : '' }) +
      (d.rows.length ? (inti.length ? '<div class="sect-title">Pengurus inti</div><div class="grid cols-2">' + inti.map(r => pengurusCard(r, d.canEdit)).join('') + '</div>' : '') +
        (lain.length ? '<div class="sect-title">Seksi-seksi &amp; lainnya</div><div class="grid cols-2">' + lain.map(r => pengurusCard(r, d.canEdit)).join('') + '</div>' : '')
        : '<section class="card">' + emptyHtml('bi-person-badge', 'Belum ada data pengurus', d.canEdit ? 'Tambahkan Ketua RT, Sekretaris, Bendahara, dan seksi-seksi dari Data Warga.' : 'Susunan pengurus akan tampil di sini.') + '</section>'));
  });
}
async function pengurusForm(r) {
  r = r || {};
  const rows = await kkChoices(null, r.id_kk);
  return '<form id="pjForm" class="form-grid" data-submit="pj-save" novalidate><input type="hidden" name="id" value="' + esc(r.id || '') + '">' +
    '<div class="field"><label for="pjJ">Jabatan <span class="req">*</span></label><input id="pjJ" name="jabatan" class="input" list="pjList" maxlength="60" required autocomplete="off" value="' + esc(r.jabatan || '') + '" placeholder="Pilih atau ketik, mis. Seksi Keamanan"><datalist id="pjList">' + JABATAN_SARAN.map(j => '<option value="' + esc(j) + '">').join('') + '</datalist></div>' +
    '<div class="field"><label for="pjK">Nama (dari Data Warga) <span class="req">*</span></label><select id="pjK" name="id_kk" class="select" required><option value="">Pilih warga…</option>' + rows.map(k => '<option value="' + esc(k.id) + '"' + (k.id === r.id_kk ? ' selected' : '') + '>' + esc(k.nama) + ' — ' + esc(k.blok) + '</option>').join('') + '</select><span class="help">Nama otomatis mengikuti Data Warga (KK).</span></div></form>';
}
const pjFoot = '<button type="button" class="btn outline" data-act="modal-close">Batal</button><button type="submit" form="pjForm" class="btn" id="pjBtn">Simpan</button>';
A['pj-new'] = async () => { try { openModal({ title: 'Tambah pengurus', body: await pengurusForm(null), footer: pjFoot }); } catch (e) { fail(e); } };
A['pj-edit'] = async el => { try { openModal({ title: 'Ubah pengurus', body: await pengurusForm(S.store.pj.rows.find(x => x.id === el.dataset.id)), footer: pjFoot }); } catch (e) { fail(e); } };
F['pj-save'] = async form => {
  if (!form.reportValidity()) return;
  const btn = $('#pjBtn'); setBusy(btn, true, 'Menyimpan…');
  try { await call('pengurus.save', { id: form.id.value || undefined, jabatan: form.jabatan.value, id_kk: form.id_kk.value }); invalidate(); closeTopModal(); toast('Data pengurus disimpan.', 'ok'); navigate('pengurus'); } catch (e) { fail(e); } finally { setBusy(btn, false); }
};
A['pj-del'] = async el => {
  const r = S.store.pj.rows.find(x => x.id === el.dataset.id); if (!r) return;
  if (!(await confirmDialog({ title: 'Hapus dari pengurus?', message: r.nama + ' (' + r.jabatan + ') akan dihapus dari susunan pengurus. Data warganya tidak ikut terhapus.', okText: 'Hapus', danger: true }))) return;
  try { await call('pengurus.remove', { id: r.id }); invalidate(); toast('Pengurus dihapus.', 'ok'); navigate('pengurus'); } catch (e) { fail(e); }
};

// ════════════════════════════════════════════════════════
// BAGIAN 10: DATA WARGA PER KK (Pengurus & Admin)
// ════════════════════════════════════════════════════════
function pageKK(nav) {
  load('kk.list', {}, 'kk.list', nav, d => {
    S.store.kk = d; S.ui.kk = S.ui.kk || { q: '', f: '', page: 1 };
    if (!$('#kkList')) {
      paint(pageHead({ eyebrow: 'Data induk', title: 'Data Warga per KK', sub: 'Hanya dapat dilihat Pengurus dan Admin. Urutan di sini dipakai di seluruh aplikasi (arisan, setoran, iuran).', actions: '<button class="btn outline" type="button" data-act="kk-order"><i class="bi bi-list-ol"></i> Atur urutan</button><button class="btn" type="button" data-act="kk-new"><i class="bi bi-person-plus"></i> Tambah KK</button>' }) +
        '<div class="card flat"><div class="search"><i class="bi bi-search"></i><input class="input" type="search" placeholder="Cari nama, blok, atau nomor KK…" data-input="kk-q" value="' + esc(S.ui.kk.q) + '" aria-label="Cari KK"></div><div class="chips mt-1" id="kkChips"></div></div>' +
        '<div class="mt-2"><table class="rtable" id="kkList"></table></div><div id="kkPager"></div>');
    }
    paintKK();
  });
}
function paintKK() {
  const d = S.store.kk, u = S.ui.kk, q = u.q.toLowerCase();
  const nA = d.rows.filter(r => r.aktif).length;
  $('#kkChips').innerHTML = [['', 'Semua (' + d.rows.length + ')'], ['aktif', 'Aktif (' + nA + ')'], ['nonaktif', 'Nonaktif (' + (d.rows.length - nA) + ')']].map(c => '<button type="button" class="chip" data-act="kk-f" data-v="' + c[0] + '" aria-pressed="' + (u.f === c[0]) + '">' + c[1] + '</button>').join('');
  const rows = d.rows.filter(r => (!u.f || (u.f === 'aktif') === r.aktif) && (!q || (r.nama + ' ' + r.blok + ' ' + r.no_kk).toLowerCase().indexOf(q) >= 0));
  const pg = paginate(rows, u.page, PAGE_SIZE); u.page = pg.page;
  const movable = !u.f && !q;   // tombol naik/turun hanya saat daftar lengkap tampil
  $('#kkList').innerHTML = '<thead><tr><th class="kkno-col">No.</th><th>Kepala keluarga</th><th>Alamat / blok</th><th>No. KK</th><th>Anggota</th><th>No. HP</th><th>Status</th><th class="right">Aksi</th></tr></thead><tbody>' +
    (pg.rows.length ? pg.rows.map(r => '<tr><td class="kkno-col tabular"><b>' + (r.no_urut || '—') + '</b></td><td class="full"><span class="kkno-chip">' + (r.no_urut || '—') + '</span><b>' + esc(r.nama) + '</b></td><td data-label="Alamat / blok">' + esc(r.blok) + '</td><td data-label="No. KK" class="tabular">' + esc(r.no_kk || '—') + '</td><td data-label="Anggota">' + (r.anggota || '—') + '</td><td data-label="No. HP">' + esc(r.no_hp || '—') + '</td>' +
      '<td data-label="Status">' + (r.aktif ? '<span class="badge ok">Aktif</span>' : '<span class="badge gray">Nonaktif</span>') + '</td>' +
      '<td class="actions">' + (movable ? '<span class="kk-mv"><button type="button" class="btn outline sm icon" data-act="kk-mv" data-d="-1" data-id="' + esc(r.id) + '" aria-label="Naikkan ' + esc(r.nama) + '"' + (r.no_urut === 1 || d.rows[0] === r ? ' disabled' : '') + '><i class="bi bi-arrow-up"></i></button><button type="button" class="btn outline sm icon" data-act="kk-mv" data-d="1" data-id="' + esc(r.id) + '" aria-label="Turunkan ' + esc(r.nama) + '"' + (d.rows[d.rows.length - 1] === r ? ' disabled' : '') + '><i class="bi bi-arrow-down"></i></button></span> ' : '') + '<button type="button" class="btn outline sm" data-act="kk-edit" data-id="' + esc(r.id) + '" aria-label="Ubah ' + esc(r.nama) + '"><i class="bi bi-pencil"></i> Ubah</button>' + (d.canDelete && r.aktif ? ' <button type="button" class="btn danger sm" data-act="kk-off" data-id="' + esc(r.id) + '" aria-label="Nonaktifkan ' + esc(r.nama) + '"><i class="bi bi-person-dash"></i></button>' : '') + '</td></tr>').join('')
      : '<tr><td colspan="8" class="full">' + emptyHtml('bi-person-vcard', 'Data KK tidak ditemukan', d.rows.length ? 'Coba kata kunci lain.' : 'Tekan “Tambah KK” untuk mulai mengisi data warga.') + '</td></tr>') + '</tbody>';
  $('#kkPager').innerHTML = pagerHtml(pg, 'kk-page');
}
I['kk-q'] = debounce(el => { S.ui.kk.q = el.value.trim(); S.ui.kk.page = 1; paintKK(); }, 200);
A['kk-f'] = el => { S.ui.kk.f = el.dataset.v; S.ui.kk.page = 1; paintKK(); };
A['kk-page'] = el => { S.ui.kk.page = +el.dataset.p; paintKK(); window.scrollTo(0, 0); };
function kkForm(r) {
  r = r || {};
  return '<form id="kkForm" class="form-grid two" data-submit="kk-save" novalidate><input type="hidden" name="id" value="' + esc(r.id || '') + '">' +
    '<div class="field span2"><label for="kkN">Nama kepala keluarga <span class="req">*</span></label><input id="kkN" name="nama" class="input" maxlength="100" required value="' + esc(r.nama || '') + '"></div>' +
    '<div class="field span2"><label for="kkB">Alamat / blok <span class="req">*</span></label><input id="kkB" name="blok" class="input" maxlength="120" required placeholder="Contoh: Blok Mawar No. 12" value="' + esc(r.blok || '') + '"></div>' +
    '<div class="field"><label for="kkK">No. KK</label><input id="kkK" name="no_kk" class="input" inputmode="numeric" maxlength="16" pattern="\\d{16}" title="16 digit angka" value="' + esc(r.no_kk || '') + '"><span class="help">16 digit, boleh dikosongkan.</span></div>' +
    '<div class="field"><label for="kkA">Jumlah anggota</label><input id="kkA" name="anggota" type="number" min="1" max="50" class="input" value="' + esc(r.anggota || '') + '"></div>' +
    '<div class="field"><label for="kkH">No. HP (opsional)</label><input id="kkH" name="no_hp" type="tel" class="input" maxlength="20" value="' + esc(r.no_hp || '') + '"></div>' +
    '<div class="field"><label for="kkU">No. urut</label><input id="kkU" name="no_urut" type="number" min="1" max="9999" class="input" inputmode="numeric" placeholder="Otomatis di urutan akhir" value="' + esc(r.no_urut || '') + '"><span class="help">Warga lain otomatis bergeser. Sesuai nomor di daftar warga.</span></div>' +
    '<div class="field"><label for="kkT">Keterangan</label><input id="kkT" name="ket" class="input" maxlength="300" value="' + esc(r.keterangan || '') + '"></div>' +
    (r.id ? '<label class="check span2"><input type="checkbox" name="aktif"' + (r.aktif ? ' checked' : '') + '> KK aktif</label>' : '') + '</form>';
}
const kkFoot = '<button type="button" class="btn outline" data-act="modal-close">Batal</button><button type="submit" form="kkForm" class="btn" id="kkBtn"><i class="bi bi-check2"></i> Simpan</button>';
A['kk-new'] = () => openModal({ title: 'Tambah KK', wide: true, body: kkForm(null), footer: kkFoot });
A['kk-edit'] = el => openModal({ title: 'Ubah data KK', wide: true, body: kkForm(S.store.kk.rows.find(x => x.id === el.dataset.id)), footer: kkFoot });
F['kk-save'] = async form => {
  if (!form.reportValidity()) return;
  const btn = $('#kkBtn'); setBusy(btn, true, 'Menyimpan…');
  const p = { id: form.id.value || undefined, nama: form.nama.value, blok: form.blok.value, no_kk: form.no_kk.value, anggota: form.anggota.value, no_hp: form.no_hp.value, keterangan: form.ket.value, no_urut: form.no_urut.value };
  if (form.aktif) p.aktif = form.aktif.checked;
  try { await call('kk.save', p); invalidate(); closeTopModal(); toast('Data KK disimpan.', 'ok'); navigate('kk'); } catch (e) { fail(e); } finally { setBusy(btn, false); }
};
// ── Urutan data warga ──
let kkQ = Promise.resolve();
A['kk-mv'] = el => {
  const rows = S.store.kk.rows, i = rows.findIndex(x => x.id === el.dataset.id), j = i + (+el.dataset.d);
  if (i < 0 || j < 0 || j >= rows.length) return;
  const id = el.dataset.id, dir = el.dataset.d;
  const t = rows[i]; rows[i] = rows[j]; rows[j] = t;
  rows.forEach((r, k) => { r.no_urut = k + 1; });
  S.ui.kk.page = Math.floor(j / PAGE_SIZE) + 1;   // baris tetap terlihat walau pindah halaman
  paintKK();
  const again = $('[data-act="kk-mv"][data-id="' + id + '"][data-d="' + dir + '"]'); if (again && !again.disabled) again.focus();
  const ids = rows.map(r => r.id);
  kkQ = kkQ.then(() => call('kk.reorder', { ids })).then(() => { const keep = S.cache['kk.list']; invalidate(); if (keep) S.cache['kk.list'] = keep; })
    .catch(e => { fail(e); invalidate(); navigate('kk', true); });
};
A['kk-order'] = () => {
  S.store.kkOrd = null;
  openModal({
    title: 'Atur urutan data warga', wide: true,
    body: '<form id="kkOrdForm" class="form-grid" data-submit="kk-ord-apply" novalidate>' +
      '<div class="banner"><i class="bi bi-info-circle"></i><span>Tempel daftar nama <b>sesuai urutan di file daftar warga</b> (satu nama per baris; nomor di depan boleh ikut). Nama dicocokkan dengan data yang sudah ada, tanpa memperhatikan awalan seperti P., Bpk., Bu, atau Ibu.</span></div>' +
      '<div class="field"><label for="kkOrdT">Daftar nama berurutan</label><textarea id="kkOrdT" name="names" class="textarea" rows="9" placeholder="P. NASIKUN&#10;P. SORGI&#10;P. SUYANTO A&#10;P. ZUBET&#10;…" data-input="kk-ord-dirty"></textarea></div>' +
      '<label class="check"><input type="checkbox" name="buat" data-change="kk-ord-dirty"> Tambahkan nama yang belum ada sebagai KK baru (alamat diisi “-”, bisa dilengkapi nanti)</label>' +
      '<div id="kkOrdOut"></div>' +
      '<div class="row wrap" style="gap:8px"><button type="button" class="btn outline sm" data-act="kk-az"><i class="bi bi-sort-alpha-down"></i> Urutkan abjad A–Z</button></div></form>',
    footer: '<button type="button" class="btn outline" data-act="modal-close">Batal</button><button type="button" class="btn soft" id="kkOrdPrev" data-act="kk-ord-prev"><i class="bi bi-eye"></i> Pratinjau</button><button type="submit" form="kkOrdForm" class="btn" id="kkOrdBtn" disabled><i class="bi bi-check2"></i> Terapkan urutan</button>'
  });
};
const kkOrdDirty = () => { const b = $('#kkOrdBtn'); if (b) b.disabled = true; const o = $('#kkOrdOut'); if (o && o.innerHTML) o.innerHTML = ''; };
I['kk-ord-dirty'] = kkOrdDirty; C['kk-ord-dirty'] = kkOrdDirty;
A['kk-ord-prev'] = async () => {
  const f = $('#kkOrdForm'); if (!f) return;
  const names = f.names.value.split(/\r?\n/);
  if (!names.some(x => /[A-Za-z]/.test(x))) { toast('Tempel daftar nama terlebih dahulu.', 'warn'); return; }
  const btn = $('#kkOrdPrev'); setBusy(btn, true, 'Memeriksa…');
  try {
    const r = await call('kk.urutkan', { names, dry: true });
    const sm = r.ringkas, buat = f.buat.checked;
    const chip = st => st === 'cocok' ? '<span class="badge ok">Cocok</span>' : st === 'baru' ? '<span class="badge warn">' + (buat ? 'KK baru' : 'Belum ada') + '</span>' : '<span class="badge gray">Ganda</span>';
    $('#kkOrdOut').innerHTML = '<div class="banner ' + (sm.cocok ? '' : 'warn') + '"><i class="bi bi-list-check"></i><span><b>' + sm.cocok + '</b> nama cocok dengan data warga' + (sm.baru ? ', <b>' + sm.baru + '</b> belum ada' + (buat ? ' (akan dibuat)' : ' (dilewati — centang opsi di atas untuk menambahkan)') : '') + (sm.duplikat ? ', <b>' + sm.duplikat + '</b> ganda dilewati' : '') + '.</span></div>' +
      '<div class="kk-prev">' + r.items.map((o, i) => '<div class="kk-prev-row"><span class="kkno-chip" style="display:inline-block">' + (i + 1) + '</span><span class="grow truncate">' + esc(o.status === 'duplikat' ? o.teks : o.nama) + '</span>' + chip(o.status) + '</div>').join('') + '</div>';
    const ok = sm.cocok + (buat ? sm.baru : 0) > 0; $('#kkOrdBtn').disabled = !ok;
  } catch (e) { fail(e); } finally { setBusy(btn, false); }
};
F['kk-ord-apply'] = async form => {
  const btn = $('#kkOrdBtn'); setBusy(btn, true, 'Menyimpan…');
  try {
    const r = await call('kk.urutkan', { names: form.names.value.split(/\r?\n/), buat: form.buat.checked });
    invalidate(); closeTopModal(); toast('Urutan disimpan: ' + r.diurutkan + ' warga' + (r.dibuat ? ', ' + r.dibuat + ' KK baru ditambahkan' : '') + '.', 'ok'); S.ui.kk.page = 1; navigate('kk');
  } catch (e) { fail(e); setBusy(btn, false); }
};
A['kk-az'] = async () => {
  if (!(await confirmDialog({ title: 'Urutkan abjad A–Z?', message: 'Nomor urut semua warga akan disusun ulang menurut abjad nama. Urutan manual saat ini akan hilang.', okText: 'Urutkan' }))) return;
  const ids = S.store.kk.rows.slice().sort((a, b) => a.nama.localeCompare(b.nama)).map(r => r.id);
  try { await call('kk.reorder', { ids }); invalidate(); closeTopModal(); toast('Diurutkan menurut abjad.', 'ok'); S.ui.kk.page = 1; navigate('kk'); } catch (e) { fail(e); }
};
A['kk-off'] = async el => {
  const r = S.store.kk.rows.find(x => x.id === el.dataset.id); if (!r) return;
  if (!(await confirmDialog({ title: 'Nonaktifkan KK?', message: r.nama + ' tidak akan dihitung sebagai KK aktif. Data tetap tersimpan.', okText: 'Nonaktifkan', danger: true }))) return;
  try { await call('kk.nonaktif', { id: r.id }); invalidate(); toast('KK dinonaktifkan.', 'ok'); navigate('kk'); } catch (e) { fail(e); }
};

// ════════════════════════════════════════════════════════
// BAGIAN 11: KELOLA AKUN (Admin)
// ════════════════════════════════════════════════════════
function pageAkun(nav) {
  load('akun.list', {}, 'akun.list', nav, d => {
    S.store.akun = d; S.ui.akun = S.ui.akun || { q: '', page: 1 };
    if (!$('#akunList')) {
      paint(pageHead({ eyebrow: 'Administrasi', title: 'Kelola Akun', sub: 'Akun hanya dibuat Admin. Password sementara wajib diganti pada login pertama.', actions: '<button class="btn" type="button" data-act="akun-new"><i class="bi bi-person-plus"></i> Buat akun</button>' }) +
        '<div id="akunReq"></div><div class="card flat"><div class="search"><i class="bi bi-search"></i><input class="input" type="search" placeholder="Cari nama atau username…" data-input="akun-q" value="' + esc(S.ui.akun.q) + '" aria-label="Cari akun"></div></div><div class="mt-2"><table class="rtable" id="akunList"></table></div><div id="akunPager"></div>');
    }
    paintAkun();
  });
}
function paintAkun() {
  paintReq();
  const u = S.ui.akun, q = u.q.toLowerCase();
  const rows = S.store.akun.rows.filter(r => !q || (r.nama + ' ' + r.username).toLowerCase().indexOf(q) >= 0);
  const pg = paginate(rows, u.page, PAGE_SIZE); u.page = pg.page;
  $('#akunList').innerHTML = '<thead><tr><th>Pengguna</th><th>Peran</th><th>KK tertaut</th><th>Status</th><th class="right">Aksi</th></tr></thead><tbody>' +
    (pg.rows.length ? pg.rows.map(r => '<tr><td class="full"><div class="row"><span class="avatar sm">' + esc(initials(r.nama)) + '</span><div><b>' + esc(r.nama) + '</b><br><span class="small muted">@' + esc(r.username) + '</span></div></div></td><td data-label="Peran">' + roleBadge(r.role) + '</td><td data-label="KK tertaut">' + esc(r.kk_nama || '—') + '</td>' +
      '<td data-label="Status">' + (r.aktif ? '<span class="badge ok">Aktif</span>' : '<span class="badge gray">Nonaktif</span>') + (r.wajibGanti ? ' <span class="badge warn">Belum ganti password</span>' : '') + '</td>' +
      '<td class="actions"><button type="button" class="btn outline sm" data-act="akun-edit" data-id="' + esc(r.id) + '"><i class="bi bi-pencil"></i> Ubah</button> <button type="button" class="btn soft sm" data-act="akun-reset" data-id="' + esc(r.id) + '"><i class="bi bi-key"></i> Reset</button></td></tr>').join('')
      : '<tr><td colspan="5" class="full">' + emptyHtml('bi-people', 'Akun tidak ditemukan') + '</td></tr>') + '</tbody>';
  $('#akunPager').innerHTML = pagerHtml(pg, 'akun-page');
}
I['akun-q'] = debounce(el => { S.ui.akun.q = el.value.trim(); S.ui.akun.page = 1; paintAkun(); }, 200);
A['akun-page'] = el => { S.ui.akun.page = +el.dataset.p; paintAkun(); };
async function kkOptions(sel) {
  try {
    const d = S.cache['kk.list'] ? S.cache['kk.list'].data : await call('kk.list', {});
    S.cache['kk.list'] = S.cache['kk.list'] || { data: d, t: Date.now() };
    return '<option value="">— tidak ditautkan —</option>' + d.rows.filter(r => r.aktif || r.id === sel).map(r => '<option value="' + esc(r.id) + '"' + (r.id === sel ? ' selected' : '') + '>' + esc(r.nama) + ' — ' + esc(r.blok) + '</option>').join('');
  } catch (e) { return '<option value="">— tidak ditautkan —</option>'; }
}
async function akunForm(r) {
  r = r || {}; const opts = await kkOptions(r.id_kk || '');
  const roles = ['Warga', 'Pengurus', 'Admin'];
  return '<form id="akunForm" class="form-grid" data-submit="akun-save" novalidate><input type="hidden" name="id" value="' + esc(r.id || '') + '">' +
    '<div class="field"><label for="akU">Username <span class="req">*</span></label><input id="akU" name="username" class="input" maxlength="30" autocapitalize="none" autocomplete="off" pattern="[a-z0-9._\\-]{3,30}" required ' + (r.id ? 'readonly' : '') + ' value="' + esc(r.username || '') + '"><span class="help">3–30 karakter: huruf kecil, angka, titik, strip, garis bawah.</span></div>' +
    '<div class="field"><label for="akN">Nama lengkap <span class="req">*</span></label><input id="akN" name="nama" class="input" maxlength="100" required value="' + esc(r.nama || '') + '"></div>' +
    '<div class="field"><label for="akR">Peran</label><select id="akR" name="role" class="select">' + roles.map(x => '<option value="' + x + '"' + ((r.role || 'Warga') === x ? ' selected' : '') + '>' + esc(ROLE_LABEL[x]) + '</option>').join('') + '</select></div>' +
    '<div class="field"><label for="akK">KK tertaut</label><select id="akK" name="id_kk" class="select">' + opts + '</select></div>' +
    (r.id ? '<label class="check"><input type="checkbox" name="aktif"' + (r.aktif ? ' checked' : '') + '> Akun aktif</label>' : '') + '</form>';
}
const akunFoot = '<button type="button" class="btn outline" data-act="modal-close">Batal</button><button type="submit" form="akunForm" class="btn" id="akunBtn"><i class="bi bi-check2"></i> Simpan</button>';
A['akun-new'] = async () => { const b = await akunForm(null); openModal({ title: 'Buat akun', body: b, footer: akunFoot }); };
A['akun-edit'] = async el => { const r = S.store.akun.rows.find(x => x.id === el.dataset.id); if (!r) return; const b = await akunForm(r); openModal({ title: 'Ubah akun', body: b, footer: akunFoot }); };
function showTempPassword(title, username, pw) {
  openModal({ title: title, body: '<div class="banner warn"><i class="bi bi-exclamation-triangle"></i><span>Catat dan berikan password ini kepada pengguna. <b>Password hanya ditampilkan sekali</b>; pengguna wajib menggantinya saat login pertama.</span></div>' +
    '<dl class="kv mt-2"><dt>Username</dt><dd>' + esc(username) + '</dd><dt>Password sementara</dt><dd style="font-size:20px;letter-spacing:.04em;font-family:ui-monospace,monospace">' + esc(pw) + '</dd></dl>',
    footer: '<button type="button" class="btn outline" data-act="copy" data-v="Username: ' + esc(username) + '  Password sementara: ' + esc(pw) + '"><i class="bi bi-clipboard"></i> Salin</button><button type="button" class="btn" data-act="modal-close">Selesai</button>' });
}
F['akun-save'] = async form => {
  if (!form.reportValidity()) return;
  const btn = $('#akunBtn'); setBusy(btn, true, 'Menyimpan…');
  const isNew = !form.id.value;
  const p = { id: form.id.value || undefined, username: form.username.value.trim().toLowerCase(), nama: form.nama.value, role: form.role.value, id_kk: form.id_kk.value };
  if (form.aktif) p.aktif = form.aktif.checked;
  try {
    const r = await call(isNew ? 'akun.create' : 'akun.update', p); invalidate(); closeTopModal();
    if (isNew) showTempPassword('Akun berhasil dibuat', r.username, r.passwordSementara); else toast('Akun diperbarui.', 'ok');
    navigate('akun');
  } catch (e) { fail(e); } finally { setBusy(btn, false); }
};
A['akun-reset'] = async el => {
  const r = S.store.akun.rows.find(x => x.id === el.dataset.id); if (!r) return;
  if (!(await confirmDialog({ title: 'Reset password?', message: 'Password ' + r.nama + ' akan diganti dengan password sementara dan sesi aktifnya dihentikan.', okText: 'Reset password' }))) return;
  try { const x = await call('akun.reset', { id: r.id }); showTempPassword('Password direset', x.username, x.passwordSementara); S.store.akun.permintaan = (S.store.akun.permintaan || []).filter(q => q.id_user !== r.id); paintReq(); } catch (e) { fail(e); }
};

// ════════════════════════════════════════════════════════
// BAGIAN 12: LOG AKTIVITAS (Admin)
// ════════════════════════════════════════════════════════
function pageLog(nav) {
  load('log.list', {}, 'log.list', nav, d => {
    S.store.log = d.rows; S.ui.log = S.ui.log || { q: '', page: 1 };
    if (!$('#logList')) {
      paint(pageHead({ eyebrow: 'Administrasi', title: 'Log Aktivitas', sub: '300 aktivitas terbaru: masuk, perubahan data, dan reset password.' }) +
        '<div class="card flat"><div class="search"><i class="bi bi-search"></i><input class="input" type="search" placeholder="Cari pengguna, aksi, modul, atau detail…" data-input="log-q" value="' + esc(S.ui.log.q) + '" aria-label="Cari log"></div></div><div class="mt-2"><table class="rtable" id="logList"></table></div><div id="logPager"></div>');
    }
    paintLog();
  });
}
function paintLog() {
  const u = S.ui.log, q = u.q.toLowerCase();
  const rows = S.store.log.filter(r => !q || (r.pengguna + ' ' + r.aksi + ' ' + r.modul + ' ' + r.detail).toLowerCase().indexOf(q) >= 0);
  const pg = paginate(rows, u.page, 15); u.page = pg.page;
  $('#logList').innerHTML = '<thead><tr><th>Waktu</th><th>Pengguna</th><th>Aksi</th><th>Modul</th><th>Detail</th></tr></thead><tbody>' +
    (pg.rows.length ? pg.rows.map(r => '<tr><td data-label="Waktu" class="tabular">' + esc(fmtDateTime(r.waktu)) + '</td><td data-label="Pengguna">' + esc(r.pengguna) + '</td><td data-label="Aksi"><span class="badge' + (/GAGAL|DITOLAK|HAPUS|BATAL/.test(r.aksi) ? ' bad' : '') + '">' + esc(r.aksi) + '</span></td><td data-label="Modul">' + esc(r.modul) + '</td><td class="full small muted" style="word-break:break-word">' + esc(r.detail) + '</td></tr>').join('')
      : '<tr><td colspan="5" class="full">' + emptyHtml('bi-clock-history', 'Log kosong') + '</td></tr>') + '</tbody>';
  $('#logPager').innerHTML = pagerHtml(pg, 'log-page');
}
I['log-q'] = debounce(el => { S.ui.log.q = el.value.trim(); S.ui.log.page = 1; paintLog(); }, 200);
A['log-page'] = el => { S.ui.log.page = +el.dataset.p; paintLog(); window.scrollTo(0, 0); };

// ════════════════════════════════════════════════════════
// BAGIAN 13: PENGATURAN (Admin)
// ════════════════════════════════════════════════════════
function pagePengaturan(nav) {
  load('config.get', {}, 'config.get', nav, c => {
    const f = (id, label, val, o) => { o = o || {}; return '<div class="field' + (o.span ? ' span2' : '') + '"><label for="' + id + '">' + label + '</label>' + (o.ribu ? ribuBox({ id: id, name: id, value: val, prev: true }) : o.area ? '<textarea id="' + id + '" name="' + id + '" class="textarea" style="min-height:72px">' + esc(val) + '</textarea>' : '<input id="' + id + '" name="' + id + '" class="input" type="' + (o.type || 'text') + '"' + (o.mode ? ' inputmode="' + o.mode + '"' : '') + (o.money ? ' data-input="money"' : '') + ' value="' + esc(o.money ? moneyFmt(val) : val) + '">') + (o.help ? '<span class="help">' + o.help + '</span>' : '') + '</div>'; };
    paint(pageHead({ eyebrow: 'Administrasi', title: 'Pengaturan', sub: 'Identitas aplikasi, jadwal kumpulan, arisan, dan daftar pilihan.' }) +
      '<form id="cfgForm" data-submit="cfg-save" novalidate><div class="grid cols-2"><section class="card"><h3>Identitas</h3><div class="form-grid mt-2">' +
      f('nama_aplikasi', 'Nama aplikasi', c.nama_aplikasi) + f('nama_rt', 'Nama RT/RW', c.nama_rt) + f('nama_desa', 'Desa', c.nama_desa) + f('nama_kecamatan', 'Kecamatan', c.nama_kecamatan) + f('nama_kabupaten', 'Kabupaten', c.nama_kabupaten) +
      f('logo_url', 'URL logo (opsional, https)', c.logo_url, { help: 'Kosongkan untuk memakai logo bawaan.' }) + '</div></section>' +
      '<section class="card"><h3>Kumpulan &amp; arisan</h3><div class="form-grid mt-2">' +
      f('jadwal_kumpulan_berikutnya', 'Tanggal kumpulan berikutnya', c.jadwal_kumpulan_berikutnya, { type: 'date' }) + f('jam_kumpulan', 'Jam kumpulan (WIB)', c.jam_kumpulan, { type: 'time' }) + f('lokasi_kumpulan_berikutnya', 'Lokasi kumpulan', c.lokasi_kumpulan_berikutnya) +
      f('periode_kumpulan', 'Keterangan periode kumpulan', c.periode_kumpulan) + f('potongan_kas_arisan', 'Potongan kas dari arisan tiap putaran (Rp)', c.potongan_kas_arisan, { ribu: true, help: 'Dipotong otomatis dari total setoran; sisanya diterima pemenang. Biasanya Rp 50.000 (ketik 50).' }) + f('iuran_kas_per_kk', 'Iuran kas per KK tiap kumpulan (Rp)', c.iuran_kas_per_kk, { ribu: true, help: 'Biasanya Rp 2.000 (ketik 2). Nominal setoran arisan <b>tidak dipatok</b>: diisi sesuai kemampuan tiap KK saat mencatat setoran.' }) + '</div></section>' +
      '<section class="card"><h3>Keuangan &amp; kontak</h3><div class="form-grid mt-2">' +
      f('saldo_awal_kas', 'Saldo awal kas (Rp)', c.saldo_awal_kas, { ribu: true, help: 'Saldo sebelum transaksi pertama di aplikasi.' }) + f('rekening_kas', 'Rekening resmi kas RT', c.rekening_kas, { help: 'Contoh: Bank Jateng 0000-0000 a.n. Kas RT 05.' }) + f('kontak_darurat', 'Kontak darurat', c.kontak_darurat, { area: true }) + '</div></section>' +
      '<section class="card"><h3>Daftar pilihan</h3><div class="form-grid mt-2">' +
      f('kategori_kas', 'Kategori kas (pisahkan dengan koma)', c.kategori_kas, { area: true }) + f('jenis_fasilitas', 'Jenis fasilitas (pisahkan dengan koma)', c.jenis_fasilitas, { area: true }) + '</div></section></div>' +
      '<div class="mt-2"><button type="submit" class="btn" id="cfgBtn"><i class="bi bi-check2"></i> Simpan pengaturan</button></div></form>');
  });
}
F['cfg-save'] = async form => {
  const btn = $('#cfgBtn'); setBusy(btn, true, 'Menyimpan…');
  const v = {}; ['nama_aplikasi', 'nama_rt', 'nama_desa', 'nama_kecamatan', 'nama_kabupaten', 'logo_url', 'jadwal_kumpulan_berikutnya', 'jam_kumpulan', 'lokasi_kumpulan_berikutnya', 'periode_kumpulan', 'rekening_kas', 'kontak_darurat', 'kategori_kas', 'jenis_fasilitas'].forEach(k => { v[k] = form[k].value.trim(); });
  v.iuran_kas_per_kk = String(ribuVal(form.iuran_kas_per_kk.value)); v.potongan_kas_arisan = String(ribuVal(form.potongan_kas_arisan.value)); v.saldo_awal_kas = String(ribuVal(form.saldo_awal_kas.value));
  try { const c = await call('config.save', { values: v }); applyConfig(c); invalidate(); toast('Pengaturan disimpan.', 'ok'); } catch (e) { fail(e); } finally { setBusy(btn, false); }
};

// ════════════════════════════════════════════════════════
// BAGIAN 14: AKUN SAYA & MENU
// ════════════════════════════════════════════════════════
function pageMenu() {
  const items = [['susulan', 'bi-cash-stack', 'Bayar susulan', 'Infokan pembayaran arisan susulan'], ['cari', 'bi-search', 'Cari warga', 'Cari nama Kepala Keluarga'], ['kas', 'bi-wallet2', 'Kas RT', 'Rincian kas masuk, keluar, dan saldo'], ['pengumuman', 'bi-megaphone', 'Pengumuman & berita', 'Informasi resmi pengurus'], ['iuran', 'bi-cash-coin', 'Iuran kas', 'Iuran kas per KK setiap kumpulan'], ['pengurus', 'bi-person-badge', 'Pengurus RT', 'Susunan pengurus lingkungan'], ['kk', 'bi-person-vcard', 'Data warga (KK)', 'Kelola data induk warga'], ['crm', 'bi-chat-dots', 'Kontak & WhatsApp', 'CRM warga, blast, notifikasi'], ['akun', 'bi-person-gear', 'Kelola akun', 'Buat dan atur akun pengguna'], ['log', 'bi-clock-history', 'Log aktivitas', 'Riwayat aksi penting'], ['pengaturan', 'bi-gear', 'Pengaturan', 'Identitas, jadwal, dan daftar pilihan']].filter(x => routeAllowed(x[0]));
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  paint('<section class="card"><div class="row"><span class="avatar" style="width:56px;height:56px;font-size:18px">' + esc(initials(S.user.nama)) + '</span><div class="grow"><h2>' + esc(S.user.nama) + '</h2><div class="row wrap" style="gap:8px">' + roleBadge(S.user.role) + '<span class="small muted">@' + esc(S.user.username) + '</span></div></div></div></section>' +
    '<section class="card mt-2"><div class="menu-list">' + items.map(x => '<button type="button" class="menu-item" data-act="nav" data-to="' + x[0] + '"><span class="item-ico"><i class="bi ' + x[1] + '"></i></span><span>' + x[2] + '<small>' + x[3] + '</small></span><i class="bi bi-chevron-right chev"></i></button>').join('') +
    installMenuHtml() + tampilMenuHtml() + '<button type="button" class="menu-item" data-act="pw-open"><span class="item-ico warn"><i class="bi bi-key"></i></span><span>Ganti password<small>Ubah password akun Anda</small></span><i class="bi bi-chevron-right chev"></i></button>' +
    '<div class="menu-item"><span class="item-ico"><i class="bi bi-moon-stars"></i></span><span class="grow">Mode gelap<small>Nyaman dipakai di malam hari</small></span><label class="switch"><input id="darkSwitch" type="checkbox" role="switch" aria-label="Mode gelap" data-change="dark"' + (dark ? ' checked' : '') + '><span></span></label></div>' +
    '<button type="button" class="menu-item" data-act="logout"><span class="item-ico bad"><i class="bi bi-box-arrow-right"></i></span><span>Keluar<small>Akhiri sesi di perangkat ini</small></span></button></div></section>' +
    '<p class="small muted center mt-3">SI-MAJU • Sistem Informasi &amp; Manajemen Warga Lima Tujuh<br>' + esc(($('.js-rt') || {}).textContent || '') + ', Bangsri, Jepara</p>');
}
C.dark = el => applyTheme(el.checked ? 'dark' : 'light');
A['pw-open'] = () => openModal({
  title: 'Ganti password',
  body: '<form id="pwForm2" class="form-grid" data-submit="pw-save" novalidate><div class="field"><label for="p2o">Password saat ini</label><input id="p2o" name="o" type="password" class="input" autocomplete="current-password" required></div>' +
    '<div class="field"><label for="p2n">Password baru</label><input id="p2n" name="n" type="password" class="input" autocomplete="new-password" minlength="8" maxlength="100" required><span class="help">Minimal 8 karakter.</span></div>' +
    '<div class="field"><label for="p2r">Ulangi password baru</label><input id="p2r" name="r" type="password" class="input" autocomplete="new-password" required></div></form>',
  footer: '<button type="button" class="btn outline" data-act="modal-close">Batal</button><button type="submit" form="pwForm2" class="btn" id="p2b">Simpan</button>'
});
F['pw-save'] = async form => {
  if (!form.reportValidity()) return;
  if (form.n.value !== form.r.value) { toast('Ulangi password baru dengan sama persis.', 'warn'); return; }
  if (form.n.value === form.o.value) { toast('Password baru harus berbeda dari yang lama.', 'warn'); return; }
  const btn = $('#p2b'); setBusy(btn, true, 'Menyimpan…');
  try { await call('pwd.change', { oldPassword: form.o.value, newPassword: form.n.value }); closeTopModal(); toast('Password berhasil diubah.', 'ok'); } catch (e) { fail(e); } finally { setBusy(btn, false); }
};

// ════════════════════════════════════════════════════════
// BAGIAN 15A: CARI WARGA (semua peran) + INFO PEMBAYARAN ARISAN SUSULAN (semua peran)
// ════════════════════════════════════════════════════════

// ── Cari nama Kepala Keluarga ──
function pageCari(nav) {
  const u = S.ui.cari = S.ui.cari || { q: '', page: 1 };
  paint(pageHead({ eyebrow: 'Direktori warga', title: 'Cari Warga', sub: 'Cari nama Kepala Keluarga (KK) RT 05 RW 07. Hanya nama dan alamat/blok yang ditampilkan.' }) +
    '<div class="card flat"><div class="search"><i class="bi bi-search"></i><input id="cariQ" class="input" type="search" placeholder="Ketik nama Kepala Keluarga…" data-input="cari-q" value="' + esc(u.q) + '" aria-label="Cari nama Kepala Keluarga" autocomplete="off"></div>' +
    '<p class="small muted mt-1" id="cariInfo" aria-live="polite"></p><div class="list mt-1" id="cariList"></div><div id="cariPager"></div></div>');
  load('warga.cari', {}, 'warga.cari', nav, d => { S.store.cari = d; paintCari(); });
}
function paintCari() {
  const d = S.store.cari, u = S.ui.cari;
  if (!d || !$('#cariList')) return;
  const q = u.q.toLowerCase();
  const rows = q ? d.rows.filter(r => (r.nama + ' ' + (r.blok || '')).toLowerCase().indexOf(q) >= 0) : d.rows;
  const pg = paginate(rows, u.page, 15); u.page = pg.page;
  $('#cariInfo').textContent = q ? rows.length + ' hasil dari ' + d.total + ' KK' : d.total + ' Kepala Keluarga terdaftar';
  $('#cariList').innerHTML = pg.rows.length ? pg.rows.map(r => '<button type="button" class="item item-btn" data-act="kel-open" data-id="' + esc(r.id) + '" data-nama="' + esc(r.nama) + '"><div class="row"><span class="avatar sm">' + esc(initials(r.nama)) + '</span><div class="grow" style="min-width:0"><b>' + (r.no ? '<span class="kkno-chip">' + r.no + '</span>' : '') + esc(r.nama) + '</b>' +
    (r.blok ? '<div class="small muted">' + esc(r.blok) + '</div>' : '') + '<div class="small muted"><i class="bi bi-people"></i> Lihat susunan keluarga</div></div><i class="bi bi-chevron-right chev"></i></div></button>').join('')
    : emptyHtml('bi-search', 'Nama tidak ditemukan', d.rows.length ? 'Coba kata kunci lain atau ejaan yang berbeda.' : 'Data warga belum tersedia.');
  $('#cariPager').innerHTML = pagerHtml(pg, 'cari-page');
}
I['cari-q'] = debounce(el => { S.ui.cari.q = el.value.trim(); S.ui.cari.page = 1; paintCari(); }, 120);
A['cari-page'] = el => { S.ui.cari.page = +el.dataset.p; paintCari(); };

// ── Info pembayaran susulan: form (Warga, Pengurus, Admin) ──
const suCache = () => { const c = S.cache['susulan.form']; return c && Date.now() - c.t < 60000 ? c.data : null; };
const rpTgl = s => (s ? fmtDate(String(s).slice(0, 10)) : '-');
const suBadge = st => '<span class="badge ' + (st === 'Dimasukkan' ? 'ok' : st === 'Ditolak' ? 'bad' : 'warn') + '">' + esc(st) + '</span>';

A['su-form'] = async el => {
  setBusy(el, true, 'Memuat…');
  try {
    const f = suCache() || await call('susulan.form', {});
    S.cache['susulan.form'] = { data: f, t: Date.now() };
    suOpenForm(f);
  } catch (e) { fail(e); } finally { setBusy(el, false); }
};
function suOpenForm(f) {
  if (!f.isAktif) return toast('Periode arisan sudah selesai.', 'bad');
  if (!f.penyetor.length) return openModal({ title: 'Info pembayaran susulan', body: '<div class="banner"><i class="bi bi-info-circle"></i><span>Akun Anda belum terhubung ke KK peserta arisan. Hubungi pengurus RT agar akun dikaitkan dengan Data Warga (KK).</span></div>', footer: '<button type="button" class="btn" data-act="modal-close">Mengerti</button>' });
  if (!f.pemenang.length) return openModal({ title: 'Info pembayaran susulan', body: '<div class="banner"><i class="bi bi-info-circle"></i><span>Belum ada putaran kocokan yang tercatat, jadi belum ada pembayaran susulan yang bisa diinfokan.</span></div>', footer: '<button type="button" class="btn" data-act="modal-close">Mengerti</button>' });
  const one = f.penyetor.length === 1;
  const kk = x => ({ id: x.id, label: (x.no ? x.no + '. ' : '') + x.nama, sub: x.blok || '' });
  openModal({
    title: 'Info pembayaran arisan susulan', wide: true,
    body: '<form id="suForm" class="form-grid" data-submit="su-kirim" novalidate>' +
      '<div class="banner"><i class="bi bi-info-circle"></i><span>Isi bila Anda membayar arisan <b>menyusul</b> (setelah putaran berlalu). Pengurus akan memeriksa lalu memasukkannya ke setoran putaran terkait. Semua isian bertanda <b>*</b> wajib diisi.</span></div>' +
      pickerHtml({ id: 'suK', name: 'id_peserta', label: 'Nama KK', placeholder: 'Cari & pilih nama KK…', items: f.penyetor.map(kk), fixed: one }) +
      '<div class="field"><label for="suN">Jumlah pembayaran <span class="req">*</span></label>' + ribuBox({ id: 'suN', name: 'nominal', prev: true }) + '</div>' +
      pickerHtml({ id: 'suP', name: 'id_pemenang', label: 'Untuk membayar siapa (penerima undian)', placeholder: 'Cari & pilih penerima undian…', items: f.pemenang.map(x => ({ id: x.id, label: x.nama + ' — putaran ' + x.putaran })) }) +
      pickerHtml({ id: 'suL', name: 'id_lokasi', label: 'Dibayarkan saat RT di rumah siapa', placeholder: 'Cari & pilih rumah tempat RT…', items: f.lokasi.map(kk) }) +
      '<div class="field"><label for="suT">Tanggal pembayaran <span class="req">*</span></label><input id="suT" name="tanggal_bayar" type="date" class="input" required value="' + esc(f.today) + '" max="' + esc(f.today) + '"></div>' +
      '<div class="field"><label for="suC">Catatan (opsional)</label><input id="suC" name="catatan" class="input" maxlength="300" placeholder="Mis. dititipkan ke Bu Bendahara"></div></form>',
    footer: '<button type="button" class="btn outline" data-act="modal-close">Batal</button><button type="submit" form="suForm" class="btn" id="suBtn"><i class="bi bi-send"></i> Kirim info</button>'
  });
  if (one) pkSet('suK', f.penyetor[0].id);
}
F['su-kirim'] = async form => {
  const okPick = pkValidate(form);
  const nom = ribuVal(form.nominal.value);
  if (!(nom > 0)) { toast('Jumlah pembayaran wajib diisi.', 'bad'); if (okPick) form.nominal.focus(); return; }
  if (!okPick || !form.tanggal_bayar.value) { if (okPick) { toast('Tanggal pembayaran wajib diisi.', 'bad'); form.tanggal_bayar.focus(); } return; }
  const btn = $('#suBtn'); setBusy(btn, true, 'Mengirim…');
  try {
    const r = await call('susulan.kirim', { id_peserta: form.id_peserta.value, nominal: nom, id_pemenang: form.id_pemenang.value, id_lokasi: form.id_lokasi.value, tanggal_bayar: form.tanggal_bayar.value, catatan: form.catatan.value });
    invalidate(); closeTopModal();
    toast('Info terkirim untuk putaran ' + r.putaran + ' (' + r.nama_pemenang + '). Menunggu diperiksa pengurus.', 'ok');
    if (S.page === 'arisan' || S.page === 'susulan') navigate(S.page, true);
  } catch (e) { fail(e); } finally { setBusy(btn, false); }
};

// ── Pemilih dengan pencarian (pengganti dropdown) ──
const PK = {};
function pickerHtml(o) {
  PK[o.id] = { items: o.items, fixed: !!o.fixed };
  return '<div class="field picker" id="pk-' + o.id + '"><label for="' + o.id + 'Q">' + esc(o.label) + ' <span class="req">*</span></label>' +
    '<input type="hidden" name="' + o.name + '" value="">' +
    '<div class="pk-sel" hidden><span class="pk-val"></span>' + (o.fixed ? '' : '<button type="button" class="btn light sm" data-act="pk-clear" data-pk="' + o.id + '">Ubah</button>') + '</div>' +
    '<div class="pk-box"><div class="search"><i class="bi bi-search"></i><input id="' + o.id + 'Q" class="input" type="search" autocomplete="off" placeholder="' + esc(o.placeholder) + '" data-input="pk-q" data-pk="' + o.id + '"></div><div class="pk-list" role="listbox" hidden></div></div>' +
    '<div class="pk-err small" role="alert" hidden></div></div>';
}
function pkFilter(id) {
  const root = document.getElementById('pk-' + id), P = PK[id]; if (!root || !P) return;
  const q = root.querySelector('.pk-box input').value.trim().toLowerCase();
  const rows = q ? P.items.filter(x => (x.label + ' ' + (x.sub || '')).toLowerCase().indexOf(q) >= 0) : P.items;
  const list = root.querySelector('.pk-list'); list.hidden = false;
  list.innerHTML = rows.length ? rows.slice(0, 40).map(x => '<button type="button" class="pk-opt" role="option" data-act="pk-pick" data-pk="' + id + '" data-v="' + esc(x.id) + '">' + esc(x.label) + (x.sub ? '<small>' + esc(x.sub) + '</small>' : '') + '</button>').join('') +
    (rows.length > 40 ? '<div class="pk-none">Ketik lebih banyak huruf untuk mempersempit…</div>' : '')
    : '<div class="pk-none">Tidak ditemukan. Coba ejaan lain.</div>';
}
function pkSet(id, v) {
  const root = document.getElementById('pk-' + id), P = PK[id]; if (!root || !P) return;
  const it = P.items.find(x => x.id === v); if (!it) return;
  root.querySelector('input[type=hidden]').value = v;
  root.querySelector('.pk-val').textContent = it.label;
  root.querySelector('.pk-sel').hidden = false; root.querySelector('.pk-box').hidden = true;
  root.querySelector('.pk-err').hidden = true;
}
function pkValidate(form) {
  let ok = true;
  form.querySelectorAll('.picker').forEach(root => {
    const has = !!root.querySelector('input[type=hidden]').value;
    const err = root.querySelector('.pk-err');
    err.hidden = has;
    if (!has) { err.textContent = 'Pilih salah satu dari daftar pencarian.'; if (ok) root.querySelector('.pk-box input').focus(); ok = false; }
  });
  if (!ok) toast('Lengkapi isian yang wajib dipilih.', 'bad');
  return ok;
}
I['pk-q'] = el => pkFilter(el.dataset.pk);
A['pk-pick'] = el => pkSet(el.dataset.pk, el.dataset.v);
A['pk-clear'] = el => {
  const root = document.getElementById('pk-' + el.dataset.pk); if (!root) return;
  root.querySelector('input[type=hidden]').value = ''; root.querySelector('.pk-sel').hidden = true;
  const box = root.querySelector('.pk-box'); box.hidden = false;
  const inp = box.querySelector('input'); inp.value = ''; inp.focus(); pkFilter(el.dataset.pk);
};
document.addEventListener('focusin', e => { const el = e.target; if (el && el.matches && el.matches('[data-input="pk-q"]')) pkFilter(el.dataset.pk); });
document.addEventListener('keydown', e => {
  const el = e.target;
  if (e.key === 'Enter' && el && el.matches && el.matches('[data-input="pk-q"]')) {
    e.preventDefault(); const first = document.querySelector('#pk-' + el.dataset.pk + ' .pk-opt'); if (first) first.click();
  }
});

// ── Daftar info susulan (kartu) ──
function suCard(r, staff, opt) {
  opt = opt || {};
  return '<div class="item su-item" data-id="' + esc(r.id) + '">' +
    '<div class="row between wrap" style="gap:8px"><div class="grow" style="min-width:0"><b>' + esc(r.nama_kk) + '</b><div class="small muted">Dikirim ' + esc(rpTgl(r.dikirim_pada)) + (staff && r.dikirim_oleh ? ' oleh ' + esc(r.dikirim_oleh) : '') + '</div></div>' +
    '<div class="right"><span class="amount">' + rp(r.nominal) + '</span><br>' + suBadge(r.status) + '</div></div>' +
    '<div class="small mt-1"><i class="bi bi-trophy"></i> Untuk membayar <b>' + esc(r.nama_pemenang) + '</b> (putaran ' + r.putaran + ')<br><i class="bi bi-house-door"></i> Saat RT di rumah <b>' + esc(r.nama_lokasi) + '</b><br><i class="bi bi-calendar-event"></i> Dibayar ' + esc(rpTgl(r.tanggal_bayar)) + '</div>' +
    (r.catatan ? '<div class="small muted mt-1">Catatan: ' + esc(r.catatan) + '</div>' : '') +
    (r.status !== 'Menunggu' ? '<div class="small muted mt-1">Diproses ' + esc(rpTgl(r.diproses_pada)) + (r.diproses_oleh ? ' oleh ' + esc(r.diproses_oleh) : '') + (r.catatan_proses ? ' — ' + esc(r.catatan_proses) : '') + '</div>' : '') +
    (staff && r.status === 'Menunggu' ? '<div class="row wrap mt-1" style="gap:8px"><button type="button" class="btn sm" data-act="su-masuk" data-id="' + esc(r.id) + '"><i class="bi bi-check-lg"></i> Diterima</button>' +
      '<button type="button" class="btn danger sm" data-act="su-tolak" data-id="' + esc(r.id) + '"><i class="bi bi-x-lg"></i> Ditolak</button></div>' : '') + '</div>';
}

// ── Sisi warga: di halaman Tracking & Catatan ──
function suWargaPaint(nav) {
  if (!$('#suWrap')) return;
  load('susulan.list', {}, 'susulan.list', nav, d => {
    if (!$('#suWrap')) return;
    S.store.su = d;
    $('#suWrap').innerHTML = '<div class="card flat"><div class="row between wrap" style="gap:8px"><h3>Info pembayaran susulan saya</h3><button type="button" class="btn sm" data-act="su-form"><i class="bi bi-plus-lg"></i> Infokan pembayaran</button></div>' +
      '<p class="help mt-1">Sudah membayar arisan menyusul? Infokan di sini agar pengurus bisa memasukkannya ke setoran.</p>' +
      '<div class="list mt-1">' + (d.rows.length ? d.rows.map(r => suCard(r, false)).join('') : emptyHtml('bi-cash-stack', 'Belum ada info yang Anda kirim', 'Tekan “Infokan pembayaran” bila Anda membayar susulan.')) + '</div></div>';
  });
}

// ── Daftar info susulan: dipakai halaman "Bayar Susulan" (semua peran) dan tab di Arisan Warga ──
function pageSusulan(nav) {
  const staff = isStaff();
  paint(pageHead({ eyebrow: 'Arisan warga', title: 'Bayar Susulan', sub: staff ? 'Periksa info pembayaran arisan susulan dari warga, lalu Diterima atau Ditolak.' : 'Infokan pembayaran arisan susulan Anda agar dimasukkan pengurus ke setoran putaran terkait.',
    actions: '<button type="button" class="btn" data-act="su-form"><i class="bi bi-plus-lg"></i> ' + (staff ? 'Tambah info' : 'Infokan pembayaran') + '</button>' }) + '<div id="suPage" class="mt-1"></div>');
  suListInto($('#suPage'), nav, false);
}
function paintArSusulan(box) { suListInto(box, S.nav, true); }
function suListInto(box, nav, withAdd) {
  const u = S.ui.su = S.ui.su || { sf: isStaff() ? 'Menunggu' : '', page: 1 };
  box.innerHTML = '<div class="card flat"><div class="row between wrap" style="gap:8px"><div class="chips" id="suChips"></div>' + (withAdd ? '<button type="button" class="btn sm" data-act="su-form"><i class="bi bi-plus-lg"></i> Tambah info</button>' : '') + '</div>' +
    '<div class="list mt-1" id="suList">' + loadingCard() + '</div><div id="suPager"></div></div>';
  load('susulan.list', {}, 'susulan.list', nav, d => { S.store.su = d; paintSuList(); });
}
function paintSuList() {
  const d = S.store.su, u = S.ui.su; if (!d || !$('#suList')) return;
  const staff = isStaff();
  const n = { Menunggu: 0, Dimasukkan: 0, Ditolak: 0 }; d.rows.forEach(r => { n[r.status] = (n[r.status] || 0) + 1; });
  $('#suChips').innerHTML = [['Menunggu', 'Menunggu (' + n.Menunggu + ')'], ['Dimasukkan', 'Dimasukkan (' + n.Dimasukkan + ')'], ['Ditolak', 'Ditolak (' + n.Ditolak + ')'], ['', 'Semua (' + d.rows.length + ')']]
    .map(c => '<button type="button" class="chip" data-act="su-f" data-v="' + c[0] + '" aria-pressed="' + (u.sf === c[0]) + '">' + c[1] + '</button>').join('');
  const rows = d.rows.filter(r => !u.sf || r.status === u.sf);
  const pg = paginate(rows, u.page || 1, PAGE_SIZE); u.page = pg.page;
  $('#suList').innerHTML = pg.rows.length ? pg.rows.map(r => suCard(r, staff)).join('')
    : emptyHtml('bi-cash-stack', u.sf === 'Menunggu' ? 'Tidak ada info yang menunggu' : 'Belum ada data', staff ? 'Info pembayaran susulan dari warga akan muncul di sini.' : 'Tekan “Infokan pembayaran” bila Anda membayar arisan menyusul.');
  $('#suPager').innerHTML = pagerHtml(pg, 'su-page');
}
A['su-f'] = el => { S.ui.su.sf = el.dataset.v; S.ui.su.page = 1; paintSuList(); };
A['su-page'] = el => { S.ui.su.page = +el.dataset.p; paintSuList(); };

// ── Proses: masukkan ke setoran / tolak ──
function suFind(id) {
  const a = S.store.su && S.store.su.rows.find(x => x.id === id);
  if (a) return a;
  const f = S.store.arSet && S.store.arSet.susulan;
  return f ? f.find(x => x.id === id) : null;
}
A['su-masuk'] = async el => {
  const r = suFind(el.dataset.id); if (!r) return;
  if ($('#arSetForm') && typeof collectSetoran === 'function' && collectSetoran().length) return toast('Simpan dulu isian setoran yang sedang diubah, lalu masukkan info susulan.', 'bad');
  if (!(await confirmDialog({ title: 'Terima pembayaran susulan?', message: rp(r.nominal) + ' dari ' + r.nama_kk + ' akan otomatis masuk ke setoran putaran ' + r.putaran + ' (penerima: ' + r.nama_pemenang + '), dengan catatan khusus “Dibayarkan saat RT di rumah ' + r.nama_lokasi + '”.', okText: 'Diterima' }))) return;
  setBusy(el, true, 'Memproses…');
  try {
    const x = await call('susulan.proses', { id: r.id, aksi: 'masuk' });
    invalidate(); toast('Diterima: dimasukkan ke setoran putaran ' + x.putaran + '. Setoran ' + r.nama_kk + ' kini ' + rp(x.total_setoran_kk) + '.', 'ok');
    suRefresh();
  } catch (e) { fail(e); setBusy(el, false); }
};
A['su-tolak'] = el => {
  const r = suFind(el.dataset.id); if (!r) return;
  openModal({
    title: 'Tolak info pembayaran', body: '<form id="suTolakForm" class="form-grid" data-submit="su-tolak-kirim" novalidate><input type="hidden" name="id" value="' + esc(r.id) + '">' +
      '<p>' + rp(r.nominal) + ' dari <b>' + esc(r.nama_kk) + '</b> untuk ' + esc(r.nama_pemenang) + ' (putaran ' + r.putaran + ').</p>' +
      '<div class="field"><label for="suAl">Alasan (opsional, terlihat oleh pengirim)</label><input id="suAl" name="catatan" class="input" maxlength="300" placeholder="Mis. bukti pembayaran belum jelas"></div></form>',
    footer: '<button type="button" class="btn outline" data-act="modal-close">Batal</button><button type="submit" form="suTolakForm" class="btn danger" id="suTBtn">Tolak info</button>'
  });
};
F['su-tolak-kirim'] = async form => {
  const btn = $('#suTBtn'); setBusy(btn, true, 'Memproses…');
  try { await call('susulan.proses', { id: form.id.value, aksi: 'tolak', catatan: form.catatan.value }); invalidate(); closeTopModal(); toast('Info ditolak.', 'ok'); suRefresh(); }
  catch (e) { fail(e); } finally { setBusy(btn, false); }
};
function suRefresh() { if (S.page === 'arisan' || S.page === 'susulan') navigate(S.page, true); }

// ── Panel info susulan di halaman "Ubah setoran" (per putaran) ──
function suPanelHtml(f) {
  const l = f.susulan || [];
  if (!l.length) return '';
  return '<div class="card mt-1 su-panel" id="suPanel" style="border-color:var(--primary)"><div class="row between wrap" style="gap:8px"><b><i class="bi bi-cash-stack"></i> Info pembayaran susulan (' + l.length + ') untuk putaran ' + f.putaran + '</b></div>' +
    '<p class="help mt-1">Dikirim warga. Tekan <b>Masukkan ke setoran</b> agar nominalnya otomatis ditambahkan ke setoran KK tersebut.</p><div class="list mt-1">' + l.map(r => suCard(r, true)).join('') + '</div></div>';
}

// ════════════════════════════════════════════════════════
// BAGIAN 15C: IMPOR KAS & ARISAN DARI EXCEL (.xlsx) / CSV — berkas dibaca di browser, tanpa pustaka luar
// ════════════════════════════════════════════════════════
const IMP_KOLOM = {
  kas: { tanggal: ['tanggal', 'tgl', 'date'], jenis: ['jenis', 'tipe', 'type'], kategori: ['kategori', 'category'], uraian: ['uraian', 'keterangan', 'deskripsi', 'uraiantransaksi'], nominal: ['nominal', 'jumlah', 'nilai', 'rp'] },
  arisan: { putaran: ['putaran', 'putaranke', 'ke'], tanggal: ['tanggal', 'tgl', 'date'], nama_kk: ['namakk', 'nama', 'kk', 'kepalakeluarga', 'namakepalakeluarga', 'namapeserta', 'peserta'], nominal: ['nominal', 'jumlah', 'setoran'], iuran_kas: ['iurankas', 'iuran'], pemenang: ['pemenang', 'menang', 'penerima'], catatan: ['catatan', 'catatankhusus', 'keterangan'] }
};
const IMP_WAJIB = { kas: ['tanggal', 'jenis', 'kategori', 'uraian', 'nominal'], arisan: ['putaran', 'nama_kk'] };
const IMP_BLN = { jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7, agu: 8, agt: 8, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, nop: 11, des: 12, dec: 12 };
const impKey = s => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
const imp2 = n => (n < 10 ? '0' : '') + n;

function impYmd(y, m, d) { y = +y; m = +m; d = +d; return (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y > 1900) ? y + '-' + imp2(m) + '-' + imp2(d) : null; }
function impTgl(v) {
  if (typeof v === 'number') {
    if (v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 86400000)); return d.getUTCFullYear() + '-' + imp2(d.getUTCMonth() + 1) + '-' + imp2(d.getUTCDate()); }
    return String(v);
  }
  const s = String(v == null ? '' : v).trim(); if (!s) return '';
  let m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/); if (m) return impYmd(m[1], m[2], m[3]) || s;
  m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/); if (m) return impYmd(m[3].length === 2 ? '20' + m[3] : m[3], m[2], m[1]) || s;
  m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})/); if (m && IMP_BLN[m[2].toLowerCase().slice(0, 3)]) return impYmd(m[3], IMP_BLN[m[2].toLowerCase().slice(0, 3)], m[1]) || s;
  return s;
}
function impNum(v) {
  if (typeof v === 'number') return isFinite(v) ? Math.round(v) : '';
  let s = String(v == null ? '' : v).trim(); if (!s) return '';
  s = s.replace(/rp\.?/ig, '').replace(/\s/g, '').replace(/[,.]\d{1,2}$/, '');
  const neg = s.charAt(0) === '-';
  const dg = s.replace(/[^\d]/g, '');
  return dg ? (neg ? -1 : 1) * Number(dg) : String(v).trim();
}

// ── CSV ──
function impCsv(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/).find(l => l.trim()) || '';
  const cnt = ch => first.split(ch).length - 1;
  const delim = cnt(';') > cnt(',') && cnt(';') >= cnt('\t') ? ';' : (cnt('\t') > cnt(',') ? '\t' : ',');
  const out = []; let row = [], cur = '', q = false, n = 1, rowStart = 1;
  const push = () => { row.push(cur); cur = ''; };
  const endRow = () => { push(); if (row.some(c => String(c).trim() !== '')) out.push({ n: rowStart, c: row }); row = []; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else { if (ch === '\n') n++; cur += ch; } }
    else if (ch === '"') q = true;
    else if (ch === delim) push();
    else if (ch === '\r') { /* abaikan */ }
    else if (ch === '\n') { endRow(); n++; rowStart = n; }
    else cur += ch;
  }
  if (cur !== '' || row.length) endRow();
  return out;
}

// ── ZIP / XLSX minimal (baca & tulis) ──
const impTE = new TextEncoder(), impTD = new TextDecoder();
let _crcT = null;
function impCrc(u8) {
  if (!_crcT) { _crcT = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; _crcT[n] = c >>> 0; } }
  let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = _crcT[(c ^ u8[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function impZip(files) {   // files: [{name, data: Uint8Array}] — tanpa kompresi
  const parts = [], cen = []; let off = 0;
  const u16 = v => [v & 255, (v >>> 8) & 255], u32 = v => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  files.forEach(f => {
    const nm = impTE.encode(f.name), crc = impCrc(f.data), sz = f.data.length;
    const lh = new Uint8Array([0x50, 0x4b, 3, 4, 20, 0, 0, 8, 0, 0, 0, 0, 0x21, 0, ...u32(crc), ...u32(sz), ...u32(sz), ...u16(nm.length), 0, 0]);
    parts.push(lh, nm, f.data);
    cen.push(new Uint8Array([0x50, 0x4b, 1, 2, 20, 0, 20, 0, 0, 8, 0, 0, 0, 0, 0x21, 0, ...u32(crc), ...u32(sz), ...u32(sz), ...u16(nm.length), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...u32(off)]), nm);
    off += lh.length + nm.length + sz;
  });
  let cs = 0; cen.forEach(c => { cs += c.length; });
  const end = new Uint8Array([0x50, 0x4b, 5, 6, 0, 0, 0, 0, ...u16(files.length), ...u16(files.length), ...u32(cs), ...u32(off), 0, 0]);
  return new Blob(parts.concat(cen, [end]), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
async function impInflate(u8) {
  if (typeof DecompressionStream === 'undefined') throw new Error('Browser Anda belum mendukung membaca .xlsx. Simpan berkas sebagai CSV lalu impor CSV-nya.');
  const ds = new DecompressionStream('deflate-raw');
  return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(ds)).arrayBuffer());
}
async function impUnzip(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(buf);
  let e = u8.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('Berkas bukan Excel .xlsx yang valid.');
  const total = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
  const files = {};
  for (let i = 0; i < total; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csz = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const name = impTD.decode(u8.subarray(p + 46, p + 46 + nl));
    const ds = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
    const raw = u8.subarray(ds, ds + csz);
    files[name] = { method: method, raw: raw };
    p += 46 + nl + el + cl;
  }
  return files;
}
async function impEntry(files, name) {
  const f = files[name]; if (!f) return null;
  return f.method === 0 ? f.raw : (f.method === 8 ? impInflate(f.raw) : Promise.reject(new Error('Kompresi berkas Excel tidak didukung.')));
}
const impXml = u8 => new DOMParser().parseFromString(impTD.decode(u8), 'application/xml');
const impTags = (n, t) => Array.prototype.slice.call(n.getElementsByTagNameNS('*', t));
async function impXlsx(buf) {
  const files = await impUnzip(buf);
  const wbx = await impEntry(files, 'xl/workbook.xml'); if (!wbx) throw new Error('Berkas bukan Excel .xlsx yang valid.');
  const wb = impXml(wbx), rels = impXml(await impEntry(files, 'xl/_rels/workbook.xml.rels'));
  const target = {}; impTags(rels, 'Relationship').forEach(r => { target[r.getAttribute('Id')] = r.getAttribute('Target'); });
  const sheets = impTags(wb, 'sheet').map(s => ({ name: s.getAttribute('name'), id: s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') }));
  if (!sheets.length) throw new Error('Berkas Excel tidak berisi lembar kerja.');
  const pilih = sheets.find(s => /^(kas|arisan)$/i.test(s.name)) || sheets[0];
  let path = target[pilih.id] || ''; path = path.replace(/^\//, ''); if (path.indexOf('xl/') !== 0) path = 'xl/' + path;
  const ss = [];
  const sse = await impEntry(files, 'xl/sharedStrings.xml');
  if (sse) impTags(impXml(sse), 'si').forEach(si => { ss.push(impTags(si, 't').map(t => t.textContent).join('')); });
  const sh = impXml(await impEntry(files, path));
  const out = [];
  impTags(sh, 'row').forEach(r => {
    const c = [];
    impTags(r, 'c').forEach(cell => {
      const ref = cell.getAttribute('r') || '', m = /^([A-Z]+)/.exec(ref); if (!m) return;
      let idx = 0; for (const ch of m[1]) idx = idx * 26 + ch.charCodeAt(0) - 64; idx--;
      const t = cell.getAttribute('t'), ve = impTags(cell, 'v')[0], v = ve ? ve.textContent : '';
      let val;
      if (t === 's') val = ss[+v] == null ? '' : ss[+v];
      else if (t === 'inlineStr') val = impTags(cell, 't').map(x => x.textContent).join('');
      else if (t === 'str') val = v;
      else if (t === 'b') val = v === '1' ? 'Ya' : 'Tidak';
      else if (t === 'e') val = '';
      else val = v === '' ? '' : Number(v);
      c[idx] = val;
    });
    for (let i = 0; i < c.length; i++) if (c[i] === undefined) c[i] = '';
    if (c.some(x => String(x).trim() !== '')) out.push({ n: +r.getAttribute('r') || out.length + 1, c: c });
  });
  return out;
}
const impEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const impCol = i => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
function impBuildXlsx(sheets) {   // sheets: [{name, rows:[[...]], widths:[], valid:[{sqref, formula}]}]
  const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n', NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main', RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const files = [];
  const add = (name, str) => files.push({ name: name, data: impTE.encode(str) });
  add('[Content_Types].xml', X + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    sheets.map((s, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') + '</Types>');
  add('_rels/.rels', X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="' + RNS + '/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  add('xl/workbook.xml', X + '<workbook xmlns="' + NS + '" xmlns:r="' + RNS + '"><sheets>' + sheets.map((s, i) => '<sheet name="' + impEsc(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets></workbook>');
  add('xl/_rels/workbook.xml.rels', X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheets.map((s, i) => '<Relationship Id="rId' + (i + 1) + '" Type="' + RNS + '/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') + '<Relationship Id="rId' + (sheets.length + 1) + '" Type="' + RNS + '/styles" Target="styles.xml"/></Relationships>');
  add('xl/styles.xml', X + '<styleSheet xmlns="' + NS + '"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF5B5CEB"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>');
  sheets.forEach((s, i) => {
    const rows = s.rows.map((r, ri) => '<row r="' + (ri + 1) + '">' + r.map((v, ci) => {
      if (v === '' || v == null) return '';
      const ref = impCol(ci) + (ri + 1), st = ri === 0 && s.header !== false ? ' s="1"' : (s.wrap ? ' s="2"' : '');
      return typeof v === 'number' ? '<c r="' + ref + '"' + st + '><v>' + v + '</v></c>' : '<c r="' + ref + '"' + st + ' t="inlineStr"><is><t xml:space="preserve">' + impEsc(v) + '</t></is></c>';
    }).join('') + '</row>').join('');
    const cols = s.widths ? '<cols>' + s.widths.map((w, k) => '<col min="' + (k + 1) + '" max="' + (k + 1) + '" width="' + w + '" customWidth="1"/>').join('') + '</cols>' : '';
    const dv = s.valid && s.valid.length ? '<dataValidations count="' + s.valid.length + '">' + s.valid.map(v => '<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="' + v.sqref + '"><formula1>' + impEsc(v.formula) + '</formula1></dataValidation>').join('') + '</dataValidations>' : '';
    add('xl/worksheets/sheet' + (i + 1) + '.xml', X + '<worksheet xmlns="' + NS + '">' + cols + '<sheetData>' + rows + '</sheetData>' + dv + '</worksheet>');
  });
  return impZip(files);
}

// ── Baca berkas -> baris objek ──
async function impBaca(file) {
  const nama = (file.name || '').toLowerCase();
  if (/\.xls$/.test(nama)) throw new Error('Format .xls lama belum didukung. Buka di Excel lalu "Simpan sebagai" .xlsx atau CSV.');
  if (/\.(csv|txt|tsv)$/.test(nama)) return impCsv(await file.text());
  if (/\.xlsx$/.test(nama)) return impXlsx(await file.arrayBuffer());
  throw new Error('Pilih berkas .xlsx (Excel) atau .csv.');
}
function impKeBaris(jenis, table) {
  const spec = IMP_KOLOM[jenis]; let head = -1, map = {};
  for (let i = 0; i < table.length && i < 15; i++) {
    const m = {}; table[i].c.forEach((v, ci) => { const k = impKey(v); if (!k) return; Object.keys(spec).forEach(f => { if (m[f] === undefined && spec[f].indexOf(k) >= 0) m[f] = ci; }); });
    if (Object.keys(m).length >= 2) { head = i; map = m; break; }
  }
  if (head < 0) throw new Error('Baris judul kolom tidak ditemukan. Pakai templat dari tombol "Unduh templat".');
  const hilang = IMP_WAJIB[jenis].filter(f => map[f] === undefined);
  if (hilang.length) throw new Error('Kolom wajib tidak ditemukan: ' + hilang.join(', ') + '. Pakai templat dari tombol "Unduh templat".');
  const rows = [];
  for (let i = head + 1; i < table.length; i++) {
    const c = table[i].c, first = c.find(v => String(v == null ? '' : v).trim() !== '');
    if (first === undefined || String(first).trim().charAt(0) === '#') continue;
    const o = { _baris: table[i].n };
    Object.keys(map).forEach(f => { o[f] = c[map[f]] == null ? '' : c[map[f]]; });
    if ('tanggal' in o) o.tanggal = impTgl(o.tanggal);
    if ('nominal' in o) o.nominal = impNum(o.nominal);
    if ('putaran' in o) o.putaran = impNum(o.putaran);
    ['nama_kk', 'jenis', 'kategori', 'uraian', 'catatan', 'iuran_kas', 'pemenang'].forEach(f => { if (f in o) o[f] = String(o[f]).trim(); });
    rows.push(o);
  }
  if (!rows.length) throw new Error('Tidak ada baris data pada berkas (baris yang diawali # dianggap contoh dan dilewati).');
  return rows;
}

// ── Templat ──
function impUnduh(nama, blob) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nama; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
const impCsvStr = rows => '﻿' + rows.map(r => r.map(v => { v = v == null ? '' : String(v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(';')).join('\r\n') + '\r\n';
async function impTemplat(jenis, fmt) {
  const info = await call('impor.info', {});
  const kat = info.kategoriKas || [];
  let head, contoh, petunjuk, extra = [], valid = [], widths;
  if (jenis === 'kas') {
    head = ['tanggal', 'jenis', 'kategori', 'uraian', 'nominal'];
    contoh = [['#2026-10-01', 'Pemasukan', kat[0] || 'Iuran Warga', 'Iuran warga bulan Oktober', 150000], ['#2026-10-05', 'Pengeluaran', kat[1] || kat[0] || 'Operasional', 'Beli lampu jalan', 45000]];
    petunjuk = ['PETUNJUK IMPOR KAS RT', '', 'Isi data mulai baris 2 pada lembar "Kas". Baris yang diawali tanda # dilewati (hanya contoh).',
      'tanggal  : tahun-bulan-tanggal (2026-10-01) atau 01/10/2026.', 'jenis    : Pemasukan atau Pengeluaran.', 'kategori : harus sama dengan daftar di lembar "Pilihan" (dan Pengaturan aplikasi).',
      'uraian   : keterangan transaksi (maks. 300 huruf).', 'nominal  : angka rupiah tanpa Rp (boleh 150.000 atau 150000).', '',
      'Aman diimpor berulang: transaksi yang sama persis (tanggal, jenis, nominal, uraian) dilewati.', 'Baris yang salah dilewati dan dilaporkan; baris yang benar tetap masuk.', 'Maksimal ' + (info.maks || 2000) + ' baris sekali impor.'];
    extra = [{ name: 'Pilihan', rows: [['kategori', 'jenis']].concat(Array.from({ length: Math.max(kat.length, 2) }, (_, i) => [kat[i] || '', ['Pemasukan', 'Pengeluaran'][i] || ''])), widths: [28, 16] }];
    valid = [{ sqref: 'B2:B2000', formula: '"Pemasukan,Pengeluaran"' }, { sqref: 'C2:C2000', formula: 'Pilihan!$A$2:$A$' + (kat.length + 1) }];
    widths = [14, 14, 22, 40, 14];
  } else {
    head = ['putaran', 'tanggal', 'nama_kk', 'nominal', 'iuran_kas', 'pemenang', 'catatan'];
    const n1 = (info.kk[0] && info.kk[0].nama) || 'Bpk. Contoh A', n2 = (info.kk[1] && info.kk[1].nama) || 'Ibu Contoh B';
    contoh = [['#1', '2026-10-02', n2, 50000, 'Ya', '', ''], ['#1', '2026-10-02', n1, '', '', 'Ya', 'Kocokan di rumah Pak A']];
    petunjuk = ['PETUNJUK IMPOR ARISAN WARGA', '', 'Satu baris = satu pembayaran satu KK pada satu putaran. Isi mulai baris 2 pada lembar "Arisan". Baris diawali # dilewati (contoh).',
      'putaran   : nomor putaran (1, 2, 3 ...). Urut dari yang paling lama; putaran baru hanya bisa jika putaran sebelumnya sudah ada pemenang.', 'tanggal   : tanggal kumpulan (tahun-bulan-tanggal atau 02/10/2026).',
      'nama_kk   : sama dengan nama di lembar "Daftar KK" (huruf besar/kecil bebas).', 'nominal   : setoran KK itu. Kosongkan untuk pemenang yang tidak menyetor.',
      'iuran_kas : isi Ya bila KK itu membayar iuran kas pada putaran tsb. Kosongkan bila iuran sudah dicatat di tempat lain (mis. impor Kas), agar tidak ganda.',
      'pemenang  : isi Ya pada baris KK yang memenangkan kocokan putaran itu (maks. 1 per putaran). Total diterima dihitung otomatis dari semua setoran putaran tsb.',
      'catatan   : catatan khusus setoran. Pada baris pemenang menjadi keterangan kocokan.', '',
      'Putaran terakhir yang belum ada pemenangnya: cukup isi setoran, tanpa Ya.', 'Aman diimpor berulang: nominal yang sama tidak ditambah dua kali (nilai di berkas menggantikan nilai lama).',
      'Impor riwayat TIDAK mengirim WhatsApp ke warga.', 'Maksimal ' + (info.maks || 2000) + ' baris sekali impor.'];
    extra = [{ name: 'Daftar KK', rows: [['no', 'nama_kk']].concat(info.kk.map(k => [k.no || '', k.nama])), widths: [8, 36] }];
    valid = [{ sqref: 'E2:E2000', formula: '"Ya,Tidak"' }, { sqref: 'F2:F2000', formula: '"Ya"' }];
    widths = [10, 14, 30, 14, 12, 12, 36];
  }
  const nama = 'Templat_Impor_' + (jenis === 'kas' ? 'Kas' : 'Arisan');
  if (fmt === 'csv') { impUnduh(nama + '.csv', new Blob([impCsvStr([head].concat(contoh))], { type: 'text/csv;charset=utf-8' })); return; }
  impUnduh(nama + '.xlsx', impBuildXlsx([{ name: jenis === 'kas' ? 'Kas' : 'Arisan', rows: [head].concat(contoh), widths: widths, valid: valid }, { name: 'Petunjuk', rows: petunjuk.map(x => [x]), header: false, widths: [130] }].concat(extra)));
}
A['imp-templat'] = async el => {
  setBusy(el, true, 'Menyiapkan…');
  try { await impTemplat(el.dataset.j, el.dataset.f); } catch (e) { fail(e); } finally { setBusy(el, false); }
};

// ── Dialog impor ──
const IMP_ST = { jenis: '', rows: null, hasil: null };
function openImpor(jenis) {
  IMP_ST.jenis = jenis; IMP_ST.rows = null; IMP_ST.hasil = null;
  const kas = jenis === 'kas';
  openModal({
    title: 'Impor ' + (kas ? 'Kas RT' : 'Arisan Warga') + ' dari Excel / CSV', wide: true,
    body: '<div class="banner"><i class="bi bi-info-circle"></i><span>' + (kas ? 'Satu baris = satu transaksi kas.' : 'Satu baris = satu pembayaran KK pada satu putaran; tandai <b>pemenang</b> dengan Ya.') + ' Unduh templat, isi, lalu pilih berkasnya. Anda akan melihat <b>pratinjau</b> dulu sebelum data ditulis.</span></div>' +
      '<div class="row wrap mt-1" style="gap:8px"><button type="button" class="btn light sm" data-act="imp-templat" data-j="' + jenis + '" data-f="xlsx"><i class="bi bi-file-earmark-spreadsheet"></i> Unduh templat Excel</button>' +
      '<button type="button" class="btn light sm" data-act="imp-templat" data-j="' + jenis + '" data-f="csv"><i class="bi bi-filetype-csv"></i> Unduh templat CSV</button></div>' +
      '<div class="field mt-2"><label class="dropzone" for="impFile"><i class="bi bi-cloud-arrow-up"></i><b>Pilih berkas Excel (.xlsx) atau CSV</b><span class="small" id="impNama">Belum ada berkas dipilih.</span></label><input id="impFile" type="file" class="sr-only" accept=".xlsx,.csv,.txt,.tsv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" data-change="imp-file"></div>' +
      '<div id="impBox" class="mt-2" aria-live="polite"></div>',
    footer: '<button type="button" class="btn outline" data-act="modal-close">Tutup</button><button type="button" class="btn" id="impGo" data-act="imp-go" disabled><i class="bi bi-download"></i> Impor</button>'
  });
}
A['imp-kas'] = () => openImpor('kas');
A['imp-arisan'] = () => openImpor('arisan');
const impRp = n => rp(n);
C['imp-file'] = async el => {
  const f = el.files && el.files[0]; if (!f) return;
  const box = $('#impBox'), go = $('#impGo'); go.disabled = true; IMP_ST.rows = null;
  $('#impNama').textContent = f.name + ' (' + Math.max(1, Math.round(f.size / 1024)) + ' KB)';
  box.innerHTML = '<div class="center muted"><span class="spin"></span> Membaca berkas…</div>';
  try {
    const rows = impKeBaris(IMP_ST.jenis, await impBaca(f));
    IMP_ST.rows = rows;
    const h = await call(IMP_ST.jenis === 'kas' ? 'kas.import' : 'arisan.import', { rows: rows, cek: true }, 90000);
    IMP_ST.hasil = h; impPratinjau(h, rows.length);
  } catch (e) { box.innerHTML = '<div class="banner err"><i class="bi bi-exclamation-octagon"></i><span>' + esc(e.message || 'Berkas tidak dapat dibaca.') + '</span></div>'; }
};
function impTile(lbl, val, cls) { return '<div class="kpi-tile"><div class="lbl">' + lbl + '</div><div class="val' + (cls ? ' ' + cls : '') + '">' + val + '</div></div>'; }
function impPratinjau(h, n) {
  const kas = IMP_ST.jenis === 'kas', go = $('#impGo');
  let t = '<div class="grid kpi">' + impTile('Baris terbaca', n) + impTile('Siap diimpor', h.siap, h.siap ? 'text-ok' : '') + impTile(kas ? 'Sudah ada (dilewati)' : 'Sama dengan data (dilewati)', kas ? h.duplikat : h.sama) + impTile('Perlu diperbaiki', h.errorTotal, h.errorTotal ? 'text-bad' : '') + '</div>';
  if (kas && h.siap) t += '<p class="small muted mt-1">Pemasukan ' + h.masuk + ' transaksi (' + impRp(h.totalMasuk) + ') • Pengeluaran ' + h.keluar + ' transaksi (' + impRp(h.totalKeluar) + ')</p>';
  if (!kas && h.ringkas && h.ringkas.length) {
    t += '<div class="mt-1" style="overflow:auto"><table class="rtable"><thead><tr><th>Putaran</th><th class="right">Baru</th><th class="right">Diubah</th><th class="right">Sama</th><th class="right">Total setoran</th><th>Pemenang</th></tr></thead><tbody>' +
      h.ringkas.map(r => '<tr><td data-label="Putaran">' + r.putaran + '</td><td class="right" data-label="Baru">' + r.baru + '</td><td class="right" data-label="Diubah">' + r.ubah + '</td><td class="right" data-label="Sama">' + r.sama + '</td><td class="right" data-label="Total">' + impRp(r.total) + '</td><td data-label="Pemenang">' + (r.pemenang ? esc(r.pemenang) + ' <span class="badge ' + (r.kocokan === 'baru' ? 'ok' : 'gray') + '">' + (r.kocokan === 'baru' ? 'dicatat' : 'sudah ada') + '</span>' : '<span class="muted">—</span>') + '</td></tr>').join('') + '</tbody></table></div>';
  }
  if (h.errorTotal) {
    t += '<div class="mt-2"><b class="text-bad"><i class="bi bi-exclamation-triangle"></i> ' + h.errorTotal + ' baris dilewati</b><ul class="imp-err">' +
      h.error.slice(0, 12).map(x => '<li>' + (x.baris ? '<b>Baris ' + x.baris + ':</b> ' : '') + esc(x.pesan) + '</li>').join('') + '</ul>' +
      (h.errorTotal > 12 ? '<p class="small muted">…dan ' + (h.errorTotal - 12) + ' lainnya. Perbaiki berkas lalu pilih ulang untuk memeriksa lagi.</p>' : '') + '<p class="small muted">Baris yang benar tetap dapat diimpor; baris yang salah tidak ditulis.</p></div>';
  }
  $('#impBox').innerHTML = t;
  go.disabled = !(h.siap > 0); go.innerHTML = '<i class="bi bi-download"></i> ' + (h.siap > 0 ? 'Impor ' + h.siap + (kas ? ' transaksi' : ' perubahan') : 'Tidak ada yang diimpor');
}
A['imp-go'] = async el => {
  if (!IMP_ST.rows) return;
  setBusy(el, true, 'Mengimpor… (jangan tutup)');
  try {
    const h = await call(IMP_ST.jenis === 'kas' ? 'kas.import' : 'arisan.import', { rows: IMP_ST.rows, cek: false }, 170000);
    invalidate(); closeTopModal();
    toast('Impor selesai: ' + h.siap + (IMP_ST.jenis === 'kas' ? ' transaksi ditambahkan.' : ' perubahan disimpan.') + (h.errorTotal ? ' ' + h.errorTotal + ' baris dilewati.' : ''), 'ok', 6000);
    if (S.page === 'kas' || S.page === 'arisan') navigate(S.page, true);
  } catch (e) { fail(e); setBusy(el, false); }
};

// ════════════════════════════════════════════════════════
// BAGIAN 16: KONTAK & WHATSAPP (CRM warga, blast, notifikasi) — Pengurus & Admin
// ════════════════════════════════════════════════════════
const CRM_TABS = [['kontak', 'Kontak', 'bi-person-lines-fill'], ['kirim', 'Kirim pesan', 'bi-send'], ['riwayat', 'Riwayat', 'bi-clock-history'], ['atur', 'Pengaturan', 'bi-sliders']];
const WA_TEMPLATES = [
  ['Pengingat kumpulan RT', 'Assalamu\'alaikum {nama},\nMengingatkan, kumpulan warga RT 05 RW 07 akan dilaksanakan hari ini. Mohon kehadirannya. Terima kasih.'],
  ['Pengingat iuran/arisan', 'Assalamu\'alaikum {nama},\nMengingatkan iuran kas dan setoran arisan untuk kumpulan berikutnya. Terima kasih atas kerja samanya.'],
  ['Kerja bakti', 'Assalamu\'alaikum {nama},\nAkan diadakan kerja bakti lingkungan RT 05 RW 07. Mohon partisipasinya. Terima kasih.']
];
function pageCrm(nav) {
  const u = S.ui.crm = S.ui.crm || { tab: 'kontak', q: '', f: '', page: 1 };
  paint(pageHead({ eyebrow: 'CRM warga', title: 'Kontak & WhatsApp', sub: 'Kelola kontak warga, kirim pesan lewat WhatsApp, dan atur notifikasi otomatis.' }) +
    '<div class="chips" id="crmTabs" role="tablist"></div><div id="crmBody" class="mt-1"></div>');
  paintCrmTabs();
  crmTab(nav);
}
function paintCrmTabs() {
  const u = S.ui.crm;
  $('#crmTabs').innerHTML = CRM_TABS.map(t => '<button type="button" class="chip" role="tab" data-act="crm-tab" data-v="' + t[0] + '" aria-pressed="' + (u.tab === t[0]) + '"><i class="bi ' + t[2] + '"></i> ' + t[1] + '</button>').join('');
}
A['crm-tab'] = el => { S.ui.crm.tab = el.dataset.v; paintCrmTabs(); crmTab(S.nav); };
function crmTab(nav) {
  const t = S.ui.crm.tab;
  if (!$('#crmBody')) return;
  if (t === 'kontak') load('crm.list', {}, 'crm.list', nav, d => { if (S.ui.crm.tab !== 'kontak') return; S.store.crm = d; paintCrmKontak(); });
  else if (t === 'kirim') {
    if (!$('#blastForm')) crmKirimShell();
    load('crm.list', {}, 'crm.list', nav, d => { S.store.crm = d; crmKirimTags(); });
    load('notif.status', {}, 'notif.status', nav, d => { S.store.notif = d; crmKirimBanner(); });
  }
  else if (t === 'riwayat') load('blast.list', {}, 'blast.list', nav, d => { if (S.ui.crm.tab !== 'riwayat') return; S.store.blast = d; paintCrmRiwayat(); });
  else load('notif.status', {}, 'notif.status', nav, d => { if (S.ui.crm.tab !== 'atur') return; S.store.notif = d; paintCrmAtur(); });
}
const waBadge = r => r.opt_out ? '<span class="badge bad">Opt-out</span>' : r.status_wa === 'Terdaftar' ? '<span class="badge ok"><i class="bi bi-whatsapp"></i> Terdaftar</span>' : r.status_wa === 'Tidak Terdaftar' ? '<span class="badge warn">Tidak terdaftar</span>' : '<span class="badge gray">Belum dicek</span>';
const statTile = x => '<div class="kpi-tile"><span class="kpi-ico ' + x[3] + '"><i class="bi ' + x[2] + '"></i></span><span class="lbl">' + x[0] + '</span><span class="val">' + x[1] + '</span></div>';

// ── Tab Kontak ──
function paintCrmKontak() {
  const d = S.store.crm, u = S.ui.crm, h = d.ringkas;
  if (!$('#crmList')) {
    $('#crmBody').innerHTML = '<div id="crmStat" class="grid kpi"></div><div id="crmWarn"></div>' +
      '<div class="card flat mt-2"><div class="row wrap between"><div class="search grow" style="min-width:200px"><i class="bi bi-search"></i><input class="input" type="search" placeholder="Cari nama, nomor, atau tag…" data-input="crm-q" value="' + esc(u.q) + '" aria-label="Cari kontak"></div>' +
      '<div class="page-actions"><button type="button" class="btn outline sm" data-act="crm-sync"><i class="bi bi-arrow-repeat"></i> Sinkron dari Data Warga</button><button type="button" class="btn soft sm" data-act="crm-cek" id="crmCekBtn"><i class="bi bi-patch-check"></i> Cek nomor WA</button></div></div><div class="chips mt-1" id="crmChips"></div></div>' +
      '<div class="mt-2"><table class="rtable" id="crmList"></table></div><div id="crmPager"></div>';
  }
  $('#crmStat').innerHTML = [['Kontak', h.total, 'bi-people', ''], ['Terdaftar WA', h.terdaftar, 'bi-whatsapp', 'ok'], ['Belum dicek', h.belumCek, 'bi-question-circle', 'warn'], ['Opt-out', h.optout, 'bi-slash-circle', 'bad']].map(statTile).join('');
  $('#crmWarn').innerHTML = d.tanpaHp ? '<div class="banner warn mt-2"><i class="bi bi-telephone-x"></i><span><b>' + d.tanpaHp + ' KK belum punya nomor HP.</b> Lengkapi di menu Data Warga (KK) lalu tekan “Sinkron dari Data Warga”.</span></div>' : '';
  const cb = $('#crmCekBtn'); if (cb) cb.disabled = !d.tokenAda;
  $('#crmChips').innerHTML = [['', 'Semua'], ['ok', 'Terdaftar'], ['belum', 'Belum dicek'], ['tidak', 'Tidak terdaftar'], ['optout', 'Opt-out']].map(c => '<button type="button" class="chip" data-act="crm-f" data-v="' + c[0] + '" aria-pressed="' + (u.f === c[0]) + '">' + c[1] + '</button>').join('');
  const q = u.q.toLowerCase();
  const rows = d.rows.filter(r => {
    if (u.f === 'ok' && (r.status_wa !== 'Terdaftar' || r.opt_out)) return false;
    if (u.f === 'belum' && r.status_wa) return false;
    if (u.f === 'tidak' && r.status_wa !== 'Tidak Terdaftar') return false;
    if (u.f === 'optout' && !r.opt_out) return false;
    return !q || (r.nama + ' ' + r.no_wa + ' ' + r.tag).toLowerCase().indexOf(q) >= 0;
  });
  const pg = paginate(rows, u.page, PAGE_SIZE); u.page = pg.page;
  $('#crmList').innerHTML = '<thead><tr><th>No.</th><th>Nama</th><th>No. WA</th><th>Segmen / tag</th><th>Status</th><th class="right">Pesan</th><th class="right">Aksi</th></tr></thead><tbody>' +
    (pg.rows.length ? pg.rows.map(r => '<tr><td data-label="No." class="tabular">' + (r.no || '—') + '</td><td class="full"><b>' + esc(r.nama) + '</b></td><td data-label="No. WA" class="tabular">' + esc(r.no_wa) + '</td>' +
      '<td data-label="Segmen"><span class="badge' + (r.segmen === 'Pengurus' ? '' : ' gray') + '">' + esc(r.segmen) + '</span>' + (r.tag ? ' <span class="small muted">' + esc(r.tag) + '</span>' : '') + '</td>' +
      '<td data-label="Status">' + waBadge(r) + '</td><td data-label="Pesan" class="right tabular">' + r.jumlah_pesan + '</td>' +
      '<td class="actions"><button type="button" class="btn outline sm" data-act="crm-edit" data-id="' + esc(r.id) + '"><i class="bi bi-pencil"></i> Ubah</button> <button type="button" class="btn soft sm" data-act="crm-riwayat" data-id="' + esc(r.id) + '"><i class="bi bi-chat-text"></i> Catatan</button></td></tr>').join('')
      : '<tr><td colspan="7" class="full">' + emptyHtml('bi-person-lines-fill', 'Belum ada kontak', 'Isi nomor HP di Data Warga (KK), lalu tekan “Sinkron dari Data Warga”.') + '</td></tr>') + '</tbody>';
  $('#crmPager').innerHTML = pagerHtml(pg, 'crm-page');
}
I['crm-q'] = debounce(el => { S.ui.crm.q = el.value.trim(); S.ui.crm.page = 1; paintCrmKontak(); }, 200);
A['crm-f'] = el => { S.ui.crm.f = el.dataset.v; S.ui.crm.page = 1; paintCrmKontak(); };
A['crm-page'] = el => { S.ui.crm.page = +el.dataset.p; paintCrmKontak(); window.scrollTo(0, 0); };
A['crm-sync'] = async el => {
  setBusy(el, true, 'Menyinkronkan…');
  try { const r = await call('crm.sync'); invalidate(); toast('Sinkron selesai: ' + r.baru + ' kontak baru, ' + r.diperbarui + ' diperbarui.', 'ok'); crmTab(S.nav); } catch (e) { fail(e); } finally { setBusy(el, false); }
};
A['crm-cek'] = async el => {
  setBusy(el, true, 'Memeriksa…');
  try {
    const r = await call('crm.cekWA', {}); invalidate();
    toast(r.diperiksa ? r.diperiksa + ' nomor diperiksa: ' + r.terdaftar + ' terdaftar, ' + r.tidak + ' tidak.' + (r.sisa ? ' Tekan lagi untuk ' + r.sisa + ' sisanya.' : '') : 'Semua nomor sudah dicek.', r.tidak ? 'warn' : 'ok');
    crmTab(S.nav);
  } catch (e) { fail(e); } finally { setBusy(el, false); }
};
A['crm-edit'] = el => {
  const r = S.store.crm.rows.find(x => x.id === el.dataset.id); if (!r) return;
  openModal({ title: 'Ubah kontak', body: '<form id="crmForm" class="form-grid" data-submit="crm-save" novalidate><input type="hidden" name="id" value="' + esc(r.id) + '">' +
    '<div class="banner"><i class="bi bi-info-circle"></i><span><b>' + esc(r.nama) + '</b> • ' + esc(r.no_wa) + '<br>Nama dan nomor mengikuti Data Warga (KK).</span></div>' +
    '<div class="field"><label for="crT">Tag</label><input id="crT" name="tag" class="input" maxlength="120" placeholder="Contoh: ronda, arisan" value="' + esc(r.tag) + '"><span class="help">Pisahkan dengan koma. Dipakai untuk memilih sasaran pesan.</span></div>' +
    '<div class="field"><label for="crC">Catatan</label><textarea id="crC" name="catatan" class="textarea" maxlength="300" style="min-height:72px">' + esc(r.catatan) + '</textarea></div>' +
    '<label class="check"><input type="checkbox" name="opt_out"' + (r.opt_out ? ' checked' : '') + '> Jangan kirim pesan WhatsApp ke kontak ini (opt-out)</label></form>',
    footer: '<button type="button" class="btn outline" data-act="modal-close">Batal</button><button type="submit" form="crmForm" class="btn" id="crmBtn"><i class="bi bi-check2"></i> Simpan</button>' });
};
F['crm-save'] = async form => {
  const btn = $('#crmBtn'); setBusy(btn, true, 'Menyimpan…');
  try { await call('crm.save', { id: form.id.value, tag: form.tag.value, catatan: form.catatan.value, opt_out: form.opt_out.checked }); invalidate(); closeTopModal(); toast('Kontak disimpan.', 'ok'); crmTab(S.nav); } catch (e) { fail(e); } finally { setBusy(btn, false); }
};
A['crm-riwayat'] = el => {
  const r = S.store.crm.rows.find(x => x.id === el.dataset.id); if (!r) return;
  const m = openModal({ title: 'Catatan & riwayat — ' + r.nama, body: '<div class="center muted" style="padding:24px"><span class="spin"></span></div>' });
  m.redraw = async () => {
    try {
      const d = await call('crm.riwayat', { id: r.id });
      if (!m.el.parentNode) return;
      m.body.innerHTML = '<form id="crmNote" class="form-grid" data-submit="crm-note" novalidate><input type="hidden" name="id" value="' + esc(r.id) + '"><div class="row"><select name="kanal" class="select" style="max-width:130px" aria-label="Kanal"><option>Telepon</option><option>Kunjungan</option><option>WA</option><option>Lainnya</option></select><input name="ringkasan" class="input" maxlength="300" placeholder="Catat interaksi…" required aria-label="Catatan"><button class="btn" type="submit" id="crmNoteBtn" aria-label="Simpan catatan"><i class="bi bi-plus-lg"></i></button></div></form>' +
        '<div class="list mt-2">' + (d.rows.length ? d.rows.map(x => '<div class="item"><div class="row between"><span class="badge' + (x.kanal === 'WA' ? ' ok' : '') + '">' + esc(x.kanal) + '</span><span class="small muted">' + fmtDateTime(x.tanggal) + '</span></div><p class="mt-1">' + esc(x.ringkasan) + '</p><span class="small muted">oleh ' + esc(x.oleh) + '</span></div>').join('') : emptyHtml('bi-chat-text', 'Belum ada riwayat', 'Pesan WhatsApp dan catatan akan muncul di sini.')) + '</div>';
    } catch (e) { m.close(); fail(e); }
  };
  S.crmModal = m; m.redraw();
};
F['crm-note'] = async form => {
  if (!form.reportValidity()) return;
  const btn = $('#crmNoteBtn'); setBusy(btn, true, '…');
  try { await call('crm.catat', { id: form.id.value, kanal: form.kanal.value, ringkasan: form.ringkasan.value }); toast('Catatan disimpan.', 'ok'); if (S.crmModal && S.crmModal.redraw) S.crmModal.redraw(); } catch (e) { fail(e); } finally { setBusy(btn, false); }
};

// ── Tab Kirim pesan ──
function crmKirimShell() {
  const u = S.ui.crm; u.draft = u.draft || { judul: '', pesan: '', sasaran: 'semua', tag: '' };
  const dr = u.draft, st = S.store.notif;
  $('#crmBody').innerHTML = '<div id="crmBanner"></div><form id="blastForm" class="card form-grid" data-submit="blast-preview" novalidate>' +
    '<div class="field"><label for="blJ">Judul (untuk arsip)</label><input id="blJ" name="judul" class="input" maxlength="80" required placeholder="Contoh: Pengingat kumpulan bulan ini" value="' + esc(dr.judul) + '"></div>' +
    '<div class="field"><div class="row between"><label for="blP">Isi pesan</label><span class="small muted" id="blCnt">0/900</span></div><textarea id="blP" name="pesan" class="textarea" maxlength="900" required data-input="bl-pesan" placeholder="Tulis pesan. Gunakan {nama} agar otomatis diganti nama warga.">' + esc(dr.pesan) + '</textarea>' +
    '<div class="chips"><button type="button" class="chip" data-act="bl-nama">+ {nama}</button>' + WA_TEMPLATES.map((t, i) => '<button type="button" class="chip" data-act="bl-tpl" data-i="' + i + '">' + esc(t[0]) + '</button>').join('') + '</div></div>' +
    '<div class="form-grid two"><div class="field"><label for="blS">Kirim ke</label><select id="blS" name="sasaran" class="select" data-change="bl-sasaran"><option value="semua">Semua kontak</option><option value="warga">Warga saja</option><option value="pengurus">Pengurus saja</option><option value="tag">Berdasarkan tag…</option></select></div>' +
    '<div class="field" id="blTagBox" hidden><label for="blT">Tag</label><select id="blT" name="tag" class="select"></select></div></div>' +
    '<div class="form-grid two"><div class="field"><label for="blB">Pesan per putaran</label><select id="blB" name="batch" class="select"><option>10</option><option selected>20</option><option>50</option></select><span class="help">Dikirim bertahap tiap menit agar nomor aman dari blokir.</span></div>' +
    '<div class="field"><label for="blD">Jeda antar pesan (detik)</label><input id="blD" name="jeda" type="number" min="2" max="30" class="input" value="' + (st ? st.jeda : 5) + '"></div></div>' +
    '<div class="banner"><i class="bi bi-shield-check"></i><span>Kontak yang opt-out atau nomornya tidak terdaftar WhatsApp otomatis dilewati.</span></div>' +
    '<button type="submit" class="btn block" id="blBtn"><i class="bi bi-eye"></i> Pratinjau penerima</button></form>';
  $('#blS').value = dr.sasaran; $('#blTagBox').hidden = dr.sasaran !== 'tag';
  $('#blCnt').textContent = dr.pesan.length + '/900';
  crmKirimTags(); crmKirimBanner();
}
function crmKirimBanner() {
  const st = S.store.notif, b = $('#crmBanner'); if (!b) return;
  b.innerHTML = st && !st.siap ? '<div class="banner warn" style="margin-bottom:12px"><i class="bi bi-exclamation-triangle"></i><span><b>WhatsApp belum aktif.</b> ' + (isAdmin() ? 'Buka tab Pengaturan untuk mengisi token Fonnte lalu aktifkan.' : 'Minta Admin mengisi token Fonnte dan mengaktifkannya di tab Pengaturan.') + ' Anda tetap bisa melihat pratinjau penerima.</span></div>' : '';
}
function crmKirimTags() {
  const d = S.store.crm, sel = $('#blT'); if (!sel || !d) return;
  const cur = S.ui.crm.draft ? S.ui.crm.draft.tag : '';
  sel.innerHTML = d.tags.length ? d.tags.map(t => '<option' + (t === cur ? ' selected' : '') + '>' + esc(t) + '</option>').join('') : '<option value="">(belum ada tag)</option>';
}
I['bl-pesan'] = el => { S.ui.crm.draft.pesan = el.value; $('#blCnt').textContent = el.value.length + '/900'; };
C['bl-sasaran'] = el => { S.ui.crm.draft.sasaran = el.value; $('#blTagBox').hidden = el.value !== 'tag'; };
A['bl-nama'] = () => { const t = $('#blP'); const i = t.selectionStart || t.value.length; t.value = t.value.slice(0, i) + '{nama}' + t.value.slice(i); t.dispatchEvent(new Event('input', { bubbles: true })); t.focus(); };
A['bl-tpl'] = el => { const t = $('#blP'); t.value = WA_TEMPLATES[+el.dataset.i][1]; if (!$('#blJ').value) $('#blJ').value = WA_TEMPLATES[+el.dataset.i][0]; t.dispatchEvent(new Event('input', { bubbles: true })); };
function blastPayload(form) { return { judul: form.judul.value, pesan: form.pesan.value, sasaran: form.sasaran.value, tag: form.tag ? form.tag.value : '', batch: +form.batch.value, jeda: +form.jeda.value }; }
F['blast-preview'] = async form => {
  if (!form.reportValidity()) return;
  const p = blastPayload(form); S.ui.crm.draft = { judul: p.judul, pesan: p.pesan, sasaran: p.sasaran, tag: p.tag };
  const btn = $('#blBtn'); setBusy(btn, true, 'Menghitung…');
  try {
    const r = await call('blast.create', Object.assign({ dry: true }, p));
    const siap = S.store.notif && S.store.notif.siap;
    openModal({ title: 'Konfirmasi pengiriman', body: '<div class="stack"><div class="kpi-tile"><span class="lbl">Penerima</span><span class="val">' + r.jumlah + ' kontak</span><span class="hint">Perkiraan selesai ± ' + r.menit + ' menit' + (r.terpotong ? ' • dibatasi 500 penerima' : '') + '</span></div>' +
      (r.lewat.optout || r.lewat.tidakWA ? '<div class="banner"><i class="bi bi-skip-forward"></i><span>Dilewati: ' + r.lewat.optout + ' opt-out, ' + r.lewat.tidakWA + ' nomor tidak terdaftar WA.</span></div>' : '') +
      '<div><div class="label">Contoh pesan</div><div class="potbox" style="white-space:pre-wrap">' + esc(r.contoh) + '</div></div>' + (siap ? '' : '<div class="banner warn"><i class="bi bi-exclamation-triangle"></i><span>WhatsApp belum aktif — pesan belum bisa dikirim.</span></div>') + '</div>',
      footer: '<button type="button" class="btn outline" data-act="modal-close">Kembali</button><button type="button" class="btn" id="blSend"' + (siap ? '' : ' disabled') + '><i class="bi bi-send"></i> Kirim sekarang</button>',
      onOpen: w => { $('#blSend', w).addEventListener('click', async ev => {
        const b2 = ev.currentTarget; setBusy(b2, true, 'Mengantrekan…');
        try { const x = await call('blast.create', p); invalidate(); closeTopModal(); S.ui.crm.draft = null; toast('Pesan masuk antrean: ' + x.jumlah + ' penerima (± ' + x.menit + ' menit).', 'ok'); S.ui.crm.tab = 'riwayat'; paintCrmTabs(); crmTab(S.nav); }
        catch (e) { fail(e); setBusy(b2, false); }
      }); } });
  } catch (e) { fail(e); } finally { setBusy(btn, false); }
};

// ── Tab Riwayat ──
function paintCrmRiwayat() {
  const d = S.store.blast, a = d.antrian;
  $('#crmBody').innerHTML = '<div class="grid kpi">' + [['Antri', a.Antri, 'bi-hourglass-split', 'warn'], ['Terkirim', a.Terkirim, 'bi-check2-all', 'ok'], ['Gagal', a.Gagal, 'bi-x-octagon', 'bad'], ['Batal', a.Batal, 'bi-slash-circle', '']].map(statTile).join('') + '</div>' +
    '<div class="row wrap mt-2"><button type="button" class="btn soft sm" data-act="antrian-proses"' + (a.Antri ? '' : ' disabled') + '><i class="bi bi-lightning-charge"></i> Kirim antrean sekarang</button><span class="small muted">Antrean juga dikirim otomatis tiap menit.</span></div>' +
    '<div class="sect-title">Blast WhatsApp</div><div class="list">' + (d.blasts.length ? d.blasts.map(b => {
      const pct = b.total ? Math.round((b.terkirim + b.gagal) * 100 / b.total) : 0;
      return '<article class="item"><div class="row between"><b>' + esc(b.judul) + '</b><span class="badge ' + (b.status === 'Berjalan' ? 'warn' : b.status === 'Selesai' ? 'ok' : 'gray') + '">' + esc(b.status) + '</span></div>' +
        '<p class="small muted">' + fmtDateTime(b.tanggal) + ' • ' + esc(b.oleh) + ' • sasaran: ' + esc(b.sasaran) + '</p><div class="progress mt-1' + (pct >= 100 ? ' ok' : '') + '"><i style="width:' + pct + '%"></i></div>' +
        '<div class="row between mt-1"><span class="small">' + b.terkirim + ' terkirim • ' + b.gagal + ' gagal • ' + b.total + ' total</span>' + (b.status === 'Berjalan' ? '<button type="button" class="btn danger sm" data-act="blast-stop" data-id="' + esc(b.id) + '">Hentikan</button>' : '') + '</div></article>';
    }).join('') : '<div class="card">' + emptyHtml('bi-send', 'Belum ada blast', 'Buka tab “Kirim pesan” untuk mengirim pesan massal.') + '</div>') + '</div>' +
    '<div class="sect-title">Pesan terakhir</div><div class="list">' + (d.recent.length ? d.recent.map(r => '<div class="item row between"><div class="grow"><b>' + esc(r.nama || '-') + '</b><div class="small muted">' + esc(r.event) + ' • ' + fmtDateTime(r.waktu) + (r.status !== 'Terkirim' && r.respon ? ' • ' + esc(r.respon) : '') + '</div></div><span class="badge ' + (r.status === 'Terkirim' ? 'ok' : r.status === 'Antri' ? 'warn' : r.status === 'Gagal' ? 'bad' : 'gray') + '">' + esc(r.status) + '</span></div>').join('') : '<div class="card">' + emptyHtml('bi-chat-dots', 'Belum ada pesan', '') + '</div>') + '</div>';
}
A['antrian-proses'] = async el => {
  setBusy(el, true, 'Mengirim…');
  try { const r = await call('antrian.proses'); invalidate(); toast(r.sisa === -1 ? 'Pengirim sedang berjalan. Coba lagi sebentar.' : r.diproses ? r.diproses + ' pesan diserahkan ke WhatsApp.' + (r.ok === false ? ' (gagal: ' + r.alasan + ')' : '') : 'Tidak ada pesan yang dikirim.', r.ok === false ? 'bad' : 'ok'); crmTab(S.nav); }
  catch (e) { fail(e); } finally { setBusy(el, false); }
};
A['blast-stop'] = async el => {
  if (!await confirmDialog({ title: 'Hentikan blast?', message: 'Pesan yang belum terkirim akan dibatalkan.', okText: 'Ya, hentikan', danger: true })) return;
  try { const r = await call('blast.stop', { id: el.dataset.id }); invalidate(); toast(r.dibatalkan + ' pesan dibatalkan.', 'ok'); crmTab(S.nav); } catch (e) { fail(e); }
};

// ── Tab Pengaturan ──
function paintCrmAtur() {
  const st = S.store.notif, adm = isAdmin();
  $('#crmBody').innerHTML = '<div class="stack"><section class="card"><div class="card-head"><h3><i class="bi bi-key"></i> Token Fonnte</h3><span class="badge ' + (st.tokenAda ? 'ok' : 'warn') + '">' + (st.tokenAda ? 'Tersimpan' : 'Belum diisi') + '</span></div>' +
    (adm ? '<form id="tokForm" class="form-grid" data-submit="tok-save" novalidate><div class="field"><label for="tkV">Token</label><input id="tkV" name="token" class="input" type="password" autocomplete="off" maxlength="200" placeholder="' + (st.tokenAda ? esc(st.tokenTersamar) + ' (kosongkan = tidak diubah)' : 'Tempel token dari fonnte.com') + '"><span class="help">Disimpan aman di server (Script Properties). Tidak pernah ditampilkan utuh dan tidak ada di kode aplikasi.</span></div>' +
      '<div class="row wrap"><button class="btn" type="submit" id="tkBtn"><i class="bi bi-check2"></i> Simpan token</button>' + (st.tokenAda ? '<button class="btn danger" type="button" data-act="tok-del">Hapus token</button>' : '') + '</div></form>'
      : '<p class="muted">Token hanya dapat diubah oleh Admin.</p>') + '</section>' +
    '<section class="card"><form id="notifForm" class="form-grid" data-submit="notif-save" novalidate><div class="card-head"><h3><i class="bi bi-bell"></i> Notifikasi otomatis</h3></div>' +
    '<label class="check"><input type="checkbox" name="aktif"' + (st.aktif ? ' checked' : '') + (adm ? '' : ' disabled') + '> <span><b>Aktifkan WhatsApp</b><br><span class="small muted">Saklar utama. Bila mati, tidak ada pesan yang dikirim.</span></span></label>' +
    '<div class="sect-title" style="margin:6px 0">Kejadian yang dikirim otomatis</div>' + st.events.map(ev => '<label class="check"><input type="checkbox" name="ev_' + esc(ev.key) + '"' + (ev.aktif ? ' checked' : '') + (adm ? '' : ' disabled') + '> ' + esc(ev.label) + '</label>').join('') +
    '<div class="form-grid two"><div class="field"><label for="ntB">Pesan per putaran</label><select id="ntB" name="batch" class="select"' + (adm ? '' : ' disabled') + '>' + [10, 20, 50].map(n => '<option' + (n === st.batch ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></div>' +
    '<div class="field"><label for="ntJ">Jeda (detik)</label><input id="ntJ" name="jeda" type="number" min="2" max="30" class="input" value="' + st.jeda + '"' + (adm ? '' : ' disabled') + '></div></div>' +
    (adm ? '<button class="btn" type="submit" id="ntBtn"><i class="bi bi-check2"></i> Simpan pengaturan</button>' : '') + '</form></section>' +
    '<section class="card"><div class="card-head"><h3><i class="bi bi-hdd-network"></i> Cache server</h3></div><p class="muted small">Bila Anda mengubah data langsung di Google Sheets dan tampilan belum berubah, bersihkan cache.</p>' + (adm ? '<button type="button" class="btn outline mt-1" data-act="cache-clear"><i class="bi bi-arrow-clockwise"></i> Bersihkan cache</button>' : '') + '</section></div>';
}
F['tok-save'] = async form => {
  const v = form.token.value.trim(); if (!v) return toast('Tempel token terlebih dahulu.', 'warn');
  const btn = $('#tkBtn'); setBusy(btn, true, 'Menyimpan…');
  try { await call('rahasia.save', { values: { FONNTE_TOKEN: v } }); form.reset(); invalidate(); toast('Token tersimpan.', 'ok'); crmTab(S.nav); } catch (e) { fail(e); } finally { setBusy(btn, false); }
};
A['tok-del'] = async () => {
  if (!await confirmDialog({ title: 'Hapus token?', message: 'WhatsApp akan berhenti bekerja sampai token baru diisi.', okText: 'Hapus', danger: true })) return;
  try { await call('notif.save', { aktif: false }); await call('rahasia.save', { values: { FONNTE_TOKEN: '__HAPUS__' } }); invalidate(); toast('Token dihapus.', 'ok'); crmTab(S.nav); } catch (e) { fail(e); }
};
F['notif-save'] = async form => {
  const events = {}; $$('input[name^="ev_"]', form).forEach(i => { events[i.name.slice(3)] = i.checked; });
  const btn = $('#ntBtn'); setBusy(btn, true, 'Menyimpan…');
  try { await call('notif.save', { aktif: form.aktif.checked, batch: +form.batch.value, jeda: +form.jeda.value, events: events }); invalidate(); toast('Pengaturan notifikasi disimpan.', 'ok'); crmTab(S.nav); } catch (e) { fail(e); } finally { setBusy(btn, false); }
};
A['cache-clear'] = async el => { setBusy(el, true, 'Membersihkan…'); try { await call('cache.bersihkan'); invalidate(); toast('Cache server dibersihkan.', 'ok'); } catch (e) { fail(e); } finally { setBusy(el, false); } };

// ════════════════════════════════════════════════════════
// BAGIAN 18: Susunan keluarga (klik nama di Cari Warga)
// ════════════════════════════════════════════════════════
const KEL = { id: '', nama: '', d: null };
const KEL_ICO = { Istri: 'bi-gender-female', Suami: 'bi-gender-male' };
function kelUmur(lahir, today) {
  const a = parts(lahir), b = parts(today); if (!a || !b) return '';
  let th = b.y - a.y, bl = b.m - a.m; if (b.d < a.d) bl--; if (bl < 0) { th--; bl += 12; }
  if (th < 0) return '';
  return th >= 1 ? th + ' th' : (bl > 0 ? bl + ' bln' : 'baru lahir');
}
function kelRowHtml(r, d, kepala) {
  const mati = r.status === 'Meninggal';
  const info = [];
  if (d.lengkap && r.tgl_lahir) info.push('Lahir ' + fmtDate(r.tgl_lahir) + (mati ? '' : ' • ' + kelUmur(r.tgl_lahir, d.today)));
  if (d.lengkap && mati && r.tgl_wafat) info.push('Wafat ' + fmtDate(r.tgl_wafat));
  if (d.lengkap && r.catatan) info.push(r.catatan);
  const aksi = (!kepala && d.canEdit)
    ? '<div class="kel-act"><button type="button" class="btn outline sm" data-act="kel-edit" data-id="' + esc(r.id) + '" aria-label="Ubah ' + esc(r.nama) + '"><i class="bi bi-pencil"></i></button>' +
      (mati ? '' : '<button type="button" class="btn outline sm" data-act="kel-wafat" data-id="' + esc(r.id) + '" aria-label="Catat wafat ' + esc(r.nama) + '" title="Catat wafat"><i class="bi bi-heartbreak"></i></button>') +
      '<button type="button" class="btn danger sm" data-act="kel-del" data-id="' + esc(r.id) + '" aria-label="Hapus ' + esc(r.nama) + '"><i class="bi bi-trash"></i></button></div>' : '';
  return '<div class="kel-row' + (mati ? ' mati' : '') + '"><span class="avatar sm">' + esc(initials(r.nama)) + '</span><div class="grow" style="min-width:0"><b>' + esc(r.nama) + '</b>' +
    '<div class="row wrap" style="gap:6px;margin-top:4px"><span class="badge ' + (kepala ? 'ok' : 'gray') + '">' + esc(r.hubungan) + '</span>' + (mati ? '<span class="badge bad">Meninggal</span>' : '') + '</div>' +
    (info.length ? '<div class="small muted" style="margin-top:4px">' + info.map(esc).join(' • ') + '</div>' : '') + '</div>' + aksi + '</div>';
}
function kelPaint() {
  const d = KEL.d, box = $('#kelBox'); if (!d || !box) return;
  box.innerHTML = '<div class="row between wrap" style="gap:8px"><div class="small muted">' + esc(d.kk.blok || '') + '</div><div class="row wrap" style="gap:6px"><span class="badge ok">' + d.hidup + ' hidup</span>' + (d.meninggal ? '<span class="badge gray">' + d.meninggal + ' meninggal</span>' : '') + '</div></div>' +
    '<div class="kel-list mt-1">' + kelRowHtml(d.kepala, d, true) + d.rows.map(r => kelRowHtml(r, d, false)).join('') + '</div>' +
    (d.rows.length ? '' : '<p class="small muted mt-1">Belum ada anggota lain yang dicatat.</p>') +
    (d.canEdit
      ? '<div class="row wrap mt-2" style="gap:8px"><button type="button" class="btn sm" data-act="kel-add"><i class="bi bi-person-plus"></i> Tambah anggota</button><button type="button" class="btn soft sm" data-act="kel-lahir"><i class="bi bi-balloon-heart"></i> Catat kelahiran</button></div>' +
        '<p class="small muted mt-1">Kepala Keluarga diubah oleh pengurus lewat menu Data Warga (KK).</p>'
      : '<p class="small muted mt-2"><i class="bi bi-lock"></i> Hanya pemilik KK ini dan pengurus yang dapat mengubah susunan keluarga.' + (d.lengkap ? '' : ' Tanggal lahir dan catatan hanya terlihat oleh pemilik KK dan pengurus.') + '</p>');
}
async function kelLoad() {
  try { KEL.d = await call('kel.get', { id_kk: KEL.id }); kelPaint(); }
  catch (e) { const box = $('#kelBox'); if (box) box.innerHTML = '<div class="banner err"><i class="bi bi-exclamation-circle"></i><span>' + esc(e.message || 'Gagal memuat susunan keluarga.') + '</span></div><div class="center mt-1"><button type="button" class="btn sm" data-act="kel-retry">Coba lagi</button></div>'; }
}
A['kel-retry'] = () => { const box = $('#kelBox'); if (box) box.innerHTML = '<div class="center muted small" style="padding:24px">Memuat…</div>'; kelLoad(); };
A['kel-open'] = el => {
  KEL.id = el.dataset.id; KEL.nama = el.dataset.nama || ''; KEL.d = null;
  openModal({ title: 'Susunan keluarga — ' + KEL.nama, wide: true, body: '<div id="kelBox"><div class="center muted small" style="padding:24px">Memuat…</div></div>', footer: '<button type="button" class="btn outline" data-act="modal-close">Tutup</button>' });
  kelLoad();
};
function kelFind(id) { return KEL.d && KEL.d.rows.find(x => x.id === id); }
function kelForm(r, pre) {
  const d = KEL.d; r = r || {};
  const mati = (pre && pre.status === 'Meninggal') || r.status === 'Meninggal';
  const v = (k, def) => esc(r[k] != null && r[k] !== '' ? r[k] : (pre && pre[k] != null ? pre[k] : (def || '')));
  const hub = r.hubungan || (pre && pre.hubungan) || 'Anak';
  openModal({
    title: r.id ? 'Ubah anggota keluarga' : (pre && pre.lahir ? 'Catat kelahiran' : 'Tambah anggota keluarga'),
    body: '<form id="kelForm" class="form-grid" data-submit="kel-simpan" novalidate><input type="hidden" name="id" value="' + esc(r.id || '') + '">' +
      '<div class="field"><label for="kelN">Nama <span class="req">*</span></label><input id="kelN" name="nama" class="input" maxlength="100" required autocomplete="off" value="' + v('nama') + '"></div>' +
      '<div class="form-grid two"><div class="field"><label for="kelH">Hubungan dalam keluarga <span class="req">*</span></label><select id="kelH" name="hubungan" class="select">' + d.hubungan.map(h => '<option' + (h === hub ? ' selected' : '') + '>' + esc(h) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label for="kelJ">Jenis kelamin</label><select id="kelJ" name="jk" class="select"><option value="">—</option><option value="L"' + (r.jk === 'L' ? ' selected' : '') + '>Laki-laki</option><option value="P"' + (r.jk === 'P' ? ' selected' : '') + '>Perempuan</option></select></div></div>' +
      '<div class="form-grid two"><div class="field"><label for="kelL">Tanggal lahir</label><input id="kelL" name="tgl_lahir" type="date" class="input" max="' + esc(d.today) + '" value="' + v('tgl_lahir') + '"></div>' +
      '<div class="field"><label for="kelS">Status</label><select id="kelS" name="status" class="select" data-change="kel-status">' + d.status.map(s => '<option' + ((mati ? 'Meninggal' : 'Hidup') === s ? ' selected' : '') + '>' + esc(s) + '</option>').join('') + '</select></div></div>' +
      '<div class="field" id="kelWf"' + (mati ? '' : ' hidden') + '><label for="kelW">Tanggal wafat</label><input id="kelW" name="tgl_wafat" type="date" class="input" max="' + esc(d.today) + '" value="' + v('tgl_wafat') + '"></div>' +
      '<div class="field"><label for="kelC">Catatan (opsional)</label><input id="kelC" name="catatan" class="input" maxlength="200" value="' + v('catatan') + '"></div></form>',
    footer: '<button type="button" class="btn outline" data-act="modal-close">Batal</button><button type="submit" form="kelForm" class="btn" id="kelBtn"><i class="bi bi-check-lg"></i> Simpan</button>',
    onOpen: w => { setTimeout(() => { const f = pre && pre.focus ? $(pre.focus, w) : $('#kelN', w); if (f) f.focus(); }, 60); }
  });
}
C['kel-status'] = el => { const f = $('#kelWf'); if (f) f.hidden = el.value !== 'Meninggal'; };
A['kel-add'] = () => kelForm(null, null);
A['kel-lahir'] = () => kelForm(null, { lahir: true, hubungan: 'Anak', tgl_lahir: KEL.d.today });
A['kel-edit'] = el => { const r = kelFind(el.dataset.id); if (r) kelForm(r, null); };
A['kel-wafat'] = el => { const r = kelFind(el.dataset.id); if (r) kelForm(r, { status: 'Meninggal', tgl_wafat: KEL.d.today, focus: '#kelW' }); };
F['kel-simpan'] = async form => {
  if (!form.nama.value.trim()) { toast('Nama wajib diisi.', 'bad'); form.nama.focus(); return; }
  const mati = form.status.value === 'Meninggal';
  if (mati && !(await confirmDialog({ title: 'Catat sebagai meninggal?', message: form.nama.value.trim() + ' akan ditandai Meninggal dalam susunan keluarga.', okText: 'Ya, catat', danger: true }))) return;
  const btn = $('#kelBtn'); setBusy(btn, true, 'Menyimpan…');
  try {
    const r = await call('kel.save', { id: form.id.value, id_kk: KEL.id, nama: form.nama.value, hubungan: form.hubungan.value, jk: form.jk.value, tgl_lahir: form.tgl_lahir.value, status: form.status.value, tgl_wafat: mati ? form.tgl_wafat.value : '', catatan: form.catatan.value });
    closeTopModal(); toast(r.aksi === 'KELAHIRAN' ? 'Kelahiran dicatat.' : r.aksi === 'KEMATIAN' ? 'Kematian dicatat.' : 'Susunan keluarga disimpan.', 'ok');
    kelLoad();
  } catch (e) { fail(e); } finally { setBusy(btn, false); }
};
A['kel-del'] = async el => {
  const r = kelFind(el.dataset.id); if (!r) return;
  if (!(await confirmDialog({ title: 'Hapus anggota keluarga?', message: r.nama + ' (' + r.hubungan + ') dihapus dari susunan keluarga. Gunakan ini hanya bila salah input; untuk kematian pakai tombol Wafat.', okText: 'Hapus', danger: true }))) return;
  try { await call('kel.remove', { id: r.id }); toast('Anggota dihapus.', 'ok'); kelLoad(); } catch (e) { fail(e); }
};

// ════════════════════════════════════════════════════════
// BAGIAN 19: Lupa password + "Ingat saya" + Atur Warna & Tampilan
// ════════════════════════════════════════════════════════
const INGAT_MS = 30 * 24 * 60 * 60 * 1000;   // sama dengan SESI_INGAT_HARI di server

// ── Lupa password ──────────────────────────────────────
const LUPA = { user: '', tunggu: 0, timer: 0 };
function lupaStep(n) {
  ['lupaS1', 'lupaS2', 'lupaS3'].forEach((id, i) => { const el = $('#' + id); if (el) el.hidden = i + 1 !== n; });
  const e = $('#lupaErr'); if (e) e.hidden = true;
}
function lupaErr(m) { const e = $('#lupaErr'); if (!e) return; e.textContent = m; e.hidden = false; }
function lupaUser() {
  const u = ($('#lupaUser').value || '').trim().toLowerCase();
  if (!u) { lupaErr('Isi username Anda terlebih dahulu.'); $('#lupaUser').focus(); return ''; }
  return u;
}
A['lupa-open'] = () => {
  showAuth('lupa'); lupaStep(1);
  const u = $('#loginUser').value.trim(); if (u) $('#lupaUser').value = u;
  ['lupaKode', 'lupaNew', 'lupaNew2'].forEach(id => { const el = $('#' + id); if (el) el.value = ''; });
  setTimeout(() => $('#lupaUser').focus(), 50);
};
A['lupa-batal'] = () => { clearInterval(LUPA.timer); showAuth('login'); };
A['lupa-ulang'] = () => { clearInterval(LUPA.timer); lupaStep(1); setTimeout(() => $('#lupaUser').focus(), 50); };
function lupaHitung() {
  const b = $('#lupaUlangBtn'); if (!b) return;
  clearInterval(LUPA.timer); LUPA.tunggu = 60;
  const tick = () => { b.disabled = LUPA.tunggu > 0; b.textContent = LUPA.tunggu > 0 ? 'Kirim ulang kode (' + LUPA.tunggu + ' dtk)' : 'Kirim ulang kode'; if (LUPA.tunggu-- <= 0) clearInterval(LUPA.timer); };
  tick(); LUPA.timer = setInterval(tick, 1000);
}
async function lupaKirimKode(btn) {
  const u = lupaUser(); if (!u) return;
  setBusy(btn, true, 'Mengirim…');
  try {
    const res = await post({ action: 'lupa.kirim', payload: { username: u } });
    if (!res || !res.success) { lupaErr((res && res.message) || 'Gagal mengirim kode.'); return; }
    LUPA.user = u; $('#lupaInfo2').textContent = res.data.pesan; lupaStep(2); lupaHitung(); setTimeout(() => $('#lupaKode').focus(), 60);
  } catch (e) { lupaErr(e.message || 'Koneksi bermasalah. Coba lagi.'); } finally { setBusy(btn, false); }
}
A['lupa-kirim'] = el => lupaKirimKode(el);
A['lupa-ulang-kirim'] = el => { if (!LUPA.tunggu || LUPA.tunggu <= 0) { $('#lupaUser').value = LUPA.user; lupaKirimKode(el); } };
A['lupa-minta'] = async el => {
  const u = lupaUser(); if (!u) return;
  setBusy(el, true, 'Mengirim…');
  try {
    const res = await post({ action: 'lupa.minta', payload: { username: u } });
    if (!res || !res.success) { lupaErr((res && res.message) || 'Gagal mengirim permintaan.'); return; }
    $('#lupaInfo3').textContent = res.data.pesan; lupaStep(3);
  } catch (e) { lupaErr(e.message || 'Koneksi bermasalah. Coba lagi.'); } finally { setBusy(el, false); }
};
(function bindLupa() {
  const f = $('#lupaForm'); if (!f) return;
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const kode = ($('#lupaKode').value || '').replace(/\D/g, ''), n = $('#lupaNew').value, n2 = $('#lupaNew2').value, btn = $('#lupaSimpanBtn');
    if (kode.length !== 6) return lupaErr('Kode terdiri dari 6 angka.');
    if (n.length < 8) return lupaErr('Password baru minimal 8 karakter.');
    if (n !== n2) return lupaErr('Ulangi password baru dengan sama persis.');
    setBusy(btn, true, 'Menyimpan…');
    try {
      const res = await post({ action: 'lupa.kode', payload: { username: LUPA.user, kode: kode, passwordBaru: n } });
      if (!res || !res.success) { lupaErr((res && res.message) || 'Gagal menyimpan password.'); return; }
      clearInterval(LUPA.timer);
      showAuth('login'); $('#loginUser').value = LUPA.user; $('#loginPass').value = n;
      const info = $('#loginInfo'); if (info) { info.textContent = 'Password berhasil diganti. Memasukkan Anda…'; info.hidden = false; }
      $('#loginForm').requestSubmit();
    } catch (er) { lupaErr(er.message || 'Koneksi bermasalah. Coba lagi.'); } finally { setBusy(btn, false); }
  });
})();

// ── Ingat saya: nama pengguna terakhir ─────────────────
const USER_KEY = 'simaju-user';
function prefillUser() { const u = LS.get(USER_KEY), el = $('#loginUser'); if (u && el && !el.value) el.value = u; }
prefillUser();

// ── Warna & tampilan ───────────────────────────────────
const TAMPIL_KEY = 'simaju-tampilan';
const WARNA = [
  { id: 'indigo', nama: 'Indigo (bawaan)', hex: '#5B5CEB' }, { id: 'laut', nama: 'Biru Laut', hex: '#1F6FEB' },
  { id: 'teal', nama: 'Teal', hex: '#0D9488' }, { id: 'hijau', nama: 'Hijau Zamrud', hex: '#16A34A' },
  { id: 'oranye', nama: 'Oranye Hangat', hex: '#EA580C' }, { id: 'ruby', nama: 'Merah Ruby', hex: '#DC2646' },
  { id: 'pink', nama: 'Pink Fuchsia', hex: '#C026D3' }, { id: 'ungu', nama: 'Ungu Violet', hex: '#7C3AED' },
  { id: 'emas', nama: 'Emas Senja', hex: '#D97706' }, { id: 'grafit', nama: 'Grafit', hex: '#475569' }
];
const cl = (x, a, b) => Math.min(b, Math.max(a, x));
function hexRgb(h) { const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '').trim()); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function rgbHex(c) { return '#' + c.map(v => ('0' + Math.round(cl(v, 0, 255)).toString(16)).slice(-2)).join('').toUpperCase(); }
function rgbHsl(c) {
  const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0;
  if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
  return [h, s, l];
}
function hslRgb(h, s, l) {
  h = ((h % 360) + 360) % 360; const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2; let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
function lum(c) { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); }
function kontras(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
// Geser kecerahan (arah -1 = gelapkan, +1 = terangkan) sampai kontras terhadap semua latar >= min.
function pastikan(h, s, l, latar, min, arah) {
  let L = l;
  for (let i = 0; i < 80; i++) { const c = hslRgb(h, s, L); if (latar.every(b => kontras(c, b) >= min)) return { c: c, l: L }; L = cl(L + arah * .012, .04, .96); }
  return { c: hslRgb(h, s, L), l: L };
}
const rgba = (c, a) => 'rgba(' + c.map(Math.round).join(', ') + ', ' + a + ')';
const TOKEN_AKSEN = ['--primary', '--primary-hover', '--primary-strong', '--on-primary', '--primary-soft', '--primary-soft-text', '--new', '--new-bg', '--hero-from', '--hero-to', '--shadow-1', '--shadow-2', '--shadow-btn', '--skeleton-a', '--skeleton-b'];

/** Turunkan seluruh token warna dari satu warna dasar, untuk mode terang/gelap; teks selalu memenuhi kontras >= 4,5:1. */
function hitungAksen(hex, gelap) {
  const base = hexRgb(hex); if (!base) return null;
  const hsl0 = rgbHsl(base), h = hsl0[0], s = cl(hsl0[1], 0, 1), l0 = hsl0[2], T = {};
  if (!gelap) {
    const putih = [255, 255, 255], abu = [244, 245, 251];
    const soft0 = hslRgb(h, Math.min(s, .75), .95);
    const P = pastikan(h, s, l0, [putih, abu, soft0], 4.6, -1);
    const strong = hslRgb(h, s, cl(P.l - .12, .08, .9)), hover = hslRgb(h, s, cl(P.l - .06, .08, .9));
    const st = pastikan(h, s, Math.min(P.l, .32), [soft0], 7, -1);
    T['--primary'] = rgbHex(P.c); T['--primary-hover'] = rgbHex(hover); T['--primary-strong'] = rgbHex(strong); T['--on-primary'] = '#FFFFFF';
    T['--primary-soft'] = rgbHex(soft0); T['--primary-soft-text'] = rgbHex(st.c); T['--new'] = rgbHex(st.c); T['--new-bg'] = rgbHex(soft0);
    T['--hero-from'] = rgbHex(P.c); T['--hero-to'] = rgbHex(strong);
    T['--shadow-1'] = '0 4px 20px -2px ' + rgba(P.c, .06) + ', 0 2px 6px -1px rgba(0, 0, 0, 0.03)';
    T['--shadow-2'] = '0 12px 28px -4px ' + rgba(P.c, .12) + ', 0 4px 12px -2px rgba(0, 0, 0, 0.04)';
    T['--shadow-btn'] = '0 6px 16px -2px ' + rgba(P.c, .3);
    T['--skeleton-a'] = rgbHex(soft0); T['--skeleton-b'] = rgbHex(hslRgb(h, Math.min(s, .6), .9));
    T._utama = P.c; T._teks = [255, 255, 255];
  } else {
    const bg = [14, 17, 32], card = [24, 29, 48];
    const soft = hslRgb(h, Math.min(s * .55, .5), .2);
    const P = pastikan(h, s, cl(l0 + .12, .56, .86), [bg, card, soft], 4.6, 1);
    const hover = hslRgb(h, s, cl(P.l + .06, .1, .94)), strong = hslRgb(h, s, cl(P.l + .12, .1, .96));
    const ink = [14, 17, 32], on = kontras(P.c, ink) >= kontras(P.c, [255, 255, 255]) ? ink : [255, 255, 255];
    const st = pastikan(h, s, .82, [soft], 7, 1);
    const hf = pastikan(h, s * .8, .4, [[255, 255, 255]], 4.6, -1), ht = hslRgb(h, s * .85, Math.max(.12, hf.l - .12));
    T['--primary'] = rgbHex(P.c); T['--primary-hover'] = rgbHex(hover); T['--primary-strong'] = rgbHex(strong); T['--on-primary'] = rgbHex(on);
    T['--primary-soft'] = rgbHex(soft); T['--primary-soft-text'] = rgbHex(st.c); T['--new'] = rgbHex(st.c); T['--new-bg'] = rgba(P.c, .2);
    T['--hero-from'] = rgbHex(hf.c); T['--hero-to'] = rgbHex(ht);
    T['--shadow-btn'] = '0 6px 16px -2px ' + rgba(P.c, .28);
    T['--skeleton-a'] = rgbHex(soft); T['--skeleton-b'] = rgbHex(hslRgb(h, Math.min(s * .55, .5), .26));
    T._utama = P.c; T._teks = on;
  }
  T._disesuaikan = kontras(base, gelap ? [14, 17, 32] : [255, 255, 255]) < 4.5;
  T._rasio = kontras(T._utama, T._teks);
  return T;
}
function tampilGet() {
  try { const o = JSON.parse(LS.get(TAMPIL_KEY) || 'null'); if (o && o.warna && (o.warna !== 'custom' || hexRgb(o.hex))) return o; } catch (e) { /* abaikan */ }
  return { warna: 'indigo', hex: '#5B5CEB' };
}
function tampilHex(o) { if (o.warna === 'custom') return o.hex; const w = WARNA.find(x => x.id === o.warna); return w ? w.hex : '#5B5CEB'; }
function modeGet() { const t = LS.get('simaju-theme'); return t === 'dark' || t === 'light' ? t : 'auto'; }
function sistemGelap() { return !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches); }
let _aksen = null;
function applyAccent() {
  const root = document.documentElement, o = tampilGet(), gelap = root.getAttribute('data-theme') === 'dark';
  TOKEN_AKSEN.forEach(k => root.style.removeProperty(k));
  _aksen = null;
  const meta = document.querySelector('meta[name="theme-color"][media*="light"]');
  if (o.warna === 'indigo') { if (meta) meta.setAttribute('content', '#5B5CEB'); return; }
  const T = hitungAksen(tampilHex(o), gelap); if (!T) return;
  TOKEN_AKSEN.forEach(k => { if (T[k]) root.style.setProperty(k, T[k]); });
  _aksen = T;
  if (meta && !gelap) meta.setAttribute('content', T['--primary']);
}
function tampilSimpan(o) { LS.set(TAMPIL_KEY, JSON.stringify(o)); applyAccent(); tampilSegarkan(); }
if (window.matchMedia) {
  const mq = matchMedia('(prefers-color-scheme: dark)'), on = () => { if (modeGet() === 'auto') applyTheme(sistemGelap() ? 'dark' : 'light', true); };
  if (mq.addEventListener) mq.addEventListener('change', on); else if (mq.addListener) mq.addListener(on);
}
function swatchWarna(hex) { const T = hitungAksen(hex, document.documentElement.getAttribute('data-theme') === 'dark'); return T ? T['--primary'] : hex; }
function tampilHtml() {
  const o = tampilGet(), m = modeGet();
  const seg = [['light', 'bi-sun', 'Terang'], ['dark', 'bi-moon-stars', 'Gelap'], ['auto', 'bi-circle-half', 'Otomatis']];
  return '<div class="tampil">' +
    '<h3 class="tampil-h">Mode tampilan</h3>' +
    '<div class="seg" role="radiogroup" aria-label="Mode tampilan">' + seg.map(x => '<button type="button" role="radio" aria-checked="' + (m === x[0]) + '" class="seg-btn' + (m === x[0] ? ' on' : '') + '" data-act="tampil-mode" data-m="' + x[0] + '"><i class="bi ' + x[1] + '"></i> ' + x[2] + '</button>').join('') + '</div>' +
    '<p class="small muted" id="tampilModeInfo"></p>' +
    '<h3 class="tampil-h">Warna siap pakai</h3>' +
    '<div class="swatches" role="radiogroup" aria-label="Warna siap pakai">' + WARNA.map(w => '<button type="button" role="radio" aria-checked="' + (o.warna === w.id) + '" class="swatch' + (o.warna === w.id ? ' on' : '') + '" data-act="tampil-warna" data-id="' + w.id + '" title="' + esc(w.nama) + '"><span class="swatch-dot" style="background:' + swatchWarna(w.hex) + '"></span><span class="swatch-nama">' + esc(w.nama) + '</span></button>').join('') + '</div>' +
    '<h3 class="tampil-h">Warna bebas</h3>' +
    '<div class="row" style="gap:10px;align-items:center"><input type="color" id="tampilPicker" class="tampil-picker" value="' + esc(tampilHex(o)) + '" aria-label="Pilih warna bebas"><input id="tampilHex" class="input" maxlength="7" placeholder="#RRGGBB" value="' + esc(o.warna === 'custom' ? o.hex : '') + '" aria-label="Kode warna heksadesimal" data-change="tampil-hex" style="max-width:130px"><button type="button" class="btn soft sm" data-act="tampil-terapkan-hex">Pakai</button></div>' +
    '<p class="small muted" id="tampilInfo" aria-live="polite"></p>' +
    '<h3 class="tampil-h">Pratinjau</h3>' +
    '<div class="tampil-prev"><div class="tampil-hero"><b>SI-MAJU</b><span>RT 05 RW 07 Tengguli</span></div><div class="row wrap" style="gap:8px;margin-top:10px"><button type="button" class="btn sm" tabindex="-1">Tombol utama</button><button type="button" class="btn soft sm" tabindex="-1">Tombol lembut</button><span class="badge new">Baru</span><span class="tampil-link">Tautan</span></div></div>' +
    '<p class="small muted mt-1"><i class="bi bi-phone"></i> Pengaturan tersimpan di perangkat ini saja, tidak mengubah tampilan warga lain.</p></div>';
}
function tampilSegarkan() {
  const w = $('#tampilInfo'); if (!w) return;
  const o = tampilGet(), m = modeGet(), gelap = document.documentElement.getAttribute('data-theme') === 'dark';
  $$('.seg-btn').forEach(b => { const on = b.dataset.m === m; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  $$('.swatch').forEach(b => { const on = b.dataset.id === o.warna; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  const pk = $('#tampilPicker'); if (pk) pk.value = tampilHex(o).toLowerCase();
  const T = o.warna === 'indigo' ? hitungAksen('#5B5CEB', gelap) : _aksen;
  const rasio = T ? T._rasio : 0;
  w.innerHTML = '<i class="bi bi-eye"></i> Teks pada tombol: kontras <b>' + (rasio ? rasio.toFixed(1) : '-') + ':1</b> ' + (rasio >= 7 ? '(sangat jelas)' : rasio >= 4.5 ? '(jelas terbaca)' : '') +
    (T && T._disesuaikan && o.warna !== 'indigo' ? '<br>Warna disesuaikan otomatis di mode ' + (gelap ? 'gelap' : 'terang') + ' agar teks tetap terbaca.' : '');
  const mi = $('#tampilModeInfo'); if (mi) mi.textContent = m === 'auto' ? 'Mengikuti pengaturan HP/komputer Anda (saat ini ' + (sistemGelap() ? 'gelap' : 'terang') + ').' : (m === 'dark' ? 'Selalu gelap di perangkat ini.' : 'Selalu terang di perangkat ini.');
}
A['tampil-open'] = () => {
  openModal({ title: 'Atur Warna & Tampilan', body: tampilHtml(), footer: '<button type="button" class="btn outline" data-act="tampil-reset"><i class="bi bi-arrow-counterclockwise"></i> Kembalikan ke bawaan</button><button type="button" class="btn" data-act="modal-close">Selesai</button>' });
  tampilSegarkan();
  const pk = $('#tampilPicker'); if (pk) pk.addEventListener('input', () => { const h = pk.value.toUpperCase(); const hx = $('#tampilHex'); if (hx) hx.value = h; tampilSimpan({ warna: 'custom', hex: h }); });
};
A['tampil-mode'] = el => {
  const m = el.dataset.m;
  if (m === 'auto') { LS.del('simaju-theme'); applyTheme(sistemGelap() ? 'dark' : 'light', true); } else applyTheme(m);
  tampilSegarkan();
};
A['tampil-warna'] = el => { const w = WARNA.find(x => x.id === el.dataset.id); if (!w) return; const hx = $('#tampilHex'); if (hx) hx.value = ''; tampilSimpan({ warna: w.id, hex: w.hex }); };
A['tampil-terapkan-hex'] = () => {
  let v = ($('#tampilHex').value || '').trim(); if (v && v[0] !== '#') v = '#' + v;
  if (!hexRgb(v)) { toast('Kode warna belum benar. Contoh: #1F6FEB', 'warn'); return; }
  tampilSimpan({ warna: 'custom', hex: v.toUpperCase() });
};
C['tampil-hex'] = () => A['tampil-terapkan-hex']();
A['tampil-reset'] = () => { LS.del(TAMPIL_KEY); LS.del('simaju-theme'); applyTheme(sistemGelap() ? 'dark' : 'light', true); applyAccent(); const hx = $('#tampilHex'); if (hx) hx.value = ''; tampilSegarkan(); toast('Tampilan dikembalikan ke bawaan.', 'ok'); };
function tampilMenuHtml() {
  return '<button type="button" class="menu-item" data-act="tampil-open"><span class="item-ico"><i class="bi bi-palette"></i></span><span>Atur warna &amp; tampilan<small>Terang/gelap, warna aplikasi</small></span><i class="bi bi-chevron-right chev"></i></button>';
}
A.noop = () => { };

// ── Permintaan reset password (Admin, di Kelola Akun) ──
function paintReq() {
  const el = $('#akunReq'); if (!el) return;
  const L = (S.store.akun && S.store.akun.permintaan) || [];
  el.innerHTML = !L.length ? '' : '<section class="card mt-2" aria-label="Permintaan reset password"><div class="row between wrap" style="gap:8px"><h3 style="margin:0"><i class="bi bi-key"></i> Permintaan reset password</h3><span class="badge warn">' + L.length + ' menunggu</span></div>' +
    '<p class="small muted mt-1">Warga yang lupa password dan tidak dapat memakai kode WhatsApp. Tekan Reset, lalu berikan password sementara kepada yang bersangkutan.</p><div class="list mt-1">' +
    L.map(q => '<div class="item"><div class="row wrap" style="gap:8px"><span class="avatar sm">' + esc(initials(q.nama)) + '</span><div class="grow" style="min-width:0"><b>' + esc(q.nama) + '</b><div class="small muted">@' + esc(q.username) + ' • ' + esc(q.dibuat_pada || '') + '</div></div>' +
      '<button type="button" class="btn sm" data-act="akun-reset" data-id="' + esc(q.id_user) + '"><i class="bi bi-key"></i> Reset</button><button type="button" class="btn outline sm" data-act="reset-abaikan" data-id="' + esc(q.id) + '">Abaikan</button></div></div>').join('') + '</div></section>';
}
A['reset-abaikan'] = async el => {
  try { await call('reset.abaikan', { id: el.dataset.id }); S.store.akun.permintaan = (S.store.akun.permintaan || []).filter(q => q.id !== el.dataset.id); paintReq(); toast('Permintaan diabaikan.', 'ok'); } catch (e) { fail(e); }
};
window.__tema = { WARNA: WARNA, hitungAksen: hitungAksen };   // dipakai pengujian otomatis

// ════════════════════════════════════════════════════════
// BAGIAN 17: PWA — pasang di HP, service worker, info pembaruan
// ════════════════════════════════════════════════════════
let deferredInstall = window.__bip || null;
const isStandalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
const UA = () => navigator.userAgent || '';
const isIOS = () => (/iphone|ipad|ipod/i.test(UA()) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) && !window.MSStream;
const isAndroid = () => /android/i.test(UA());
const isInApp = () => /FBAN|FBAV|Instagram|Line\/|TikTok|Snapchat|MicroMessenger|; wv\)|\bGSA\b/i.test(UA());
const isSamsung = () => /SamsungBrowser/i.test(UA());
// Tombol Pasang tampil di semua perangkat selama aplikasi belum terpasang (di HP tanpa prompt otomatis, tombol menampilkan petunjuk).
function canInstall() { return !isStandalone(); }
const PWA_TUNDA = 'simaju-pasang-tunda';
function installTunda() { try { return Date.now() < Number(localStorage.getItem(PWA_TUNDA) || 0); } catch (e) { return false; } }
function refreshInstallUi() {
  const ok = canInstall();
  const b = $('#installBtn'); if (b) b.hidden = !ok;
  if (!ok) { const n = $('#installBanner'); if (n) n.remove(); }
}
function installBannerHtml() {
  if (!canInstall() || installTunda()) return '';
  return '<section class="install-banner" id="installBanner" aria-label="Pasang aplikasi"><span class="item-ico ok"><i class="bi bi-phone"></i></span>' +
    '<div class="grow"><b>Pasang SI-MAJU di layar HP</b><div class="small muted">Buka lebih cepat seperti aplikasi, tanpa mengetik alamat lagi.</div></div>' +
    '<div class="install-act"><button type="button" class="btn sm" data-act="pwa-install">Pasang</button><button type="button" class="btn outline sm" data-act="pwa-tunda" aria-label="Sembunyikan">Nanti</button></div></section>';
}
A['pwa-tunda'] = () => { try { localStorage.setItem(PWA_TUNDA, String(Date.now() + 7 * 864e5)); } catch (e) { /* abaikan */ } const n = $('#installBanner'); if (n) n.remove(); };
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; window.__bip = e; refreshInstallUi(); });
window.addEventListener('appinstalled', () => { deferredInstall = null; window.__bip = null; refreshInstallUi(); toast('SI-MAJU terpasang di layar utama HP Anda.', 'ok'); });
function installSteps() {
  const url = location.href.split('#')[0];
  if (isInApp()) return { judul: 'Buka dulu di browser', steps: ['Anda sedang membuka SI-MAJU di dalam aplikasi lain (WhatsApp, Facebook, dsb.), sehingga tidak bisa dipasang.', 'Ketuk menu <b>⋮</b> atau tombol <b>Bagikan</b>, lalu pilih <b>Buka di Chrome</b> (atau <b>Buka di browser</b>).', 'Setelah terbuka di Chrome, ketuk tombol <b>Pasang</b> lagi.'], salin: url };
  if (isIOS()) return { judul: 'Pasang di iPhone / iPad', steps: ['Buka SI-MAJU di <b>Safari</b>.', 'Ketuk tombol <b>Bagikan</b> <i class="bi bi-box-arrow-up"></i> di bagian bawah layar.', 'Gulir lalu pilih <b>Tambah ke Layar Utama</b>, kemudian ketuk <b>Tambah</b>.'] };
  if (isSamsung()) return { judul: 'Pasang di Samsung Internet', steps: ['Ketuk menu <b>☰</b> di pojok kanan bawah.', 'Pilih <b>Tambah halaman ke</b> lalu <b>Layar Beranda</b>.', 'Ketuk <b>Tambah</b>.'] };
  if (isAndroid()) return { judul: 'Pasang di HP Android', steps: ['Buka SI-MAJU di <b>Chrome</b>.', 'Ketuk menu <b>⋮</b> di pojok kanan atas.', 'Pilih <b>Instal aplikasi</b> (atau <b>Tambahkan ke layar utama</b>), lalu ketuk <b>Instal</b>.'] };
  return { judul: 'Pasang aplikasi', steps: ['Di Chrome/Edge komputer: klik ikon <b>Instal</b> di ujung kanan kolom alamat, atau menu <b>⋮</b> → <b>Transmisikan, simpan, dan bagikan</b> → <b>Instal halaman sebagai aplikasi</b>.', 'Di HP: buka alamat ini lewat Chrome (Android) atau Safari (iPhone), lalu pilih <b>Tambahkan ke layar utama</b>.'] };
}
A['pwa-install'] = async () => {
  if (deferredInstall) {
    deferredInstall.prompt();
    try { await deferredInstall.userChoice; } catch (e) { /* abaikan */ }
    deferredInstall = null; window.__bip = null; refreshInstallUi(); return;
  }
  const s = installSteps();
  openModal({
    title: s.judul,
    body: '<ol class="small" style="padding-left:18px;margin:0">' + s.steps.map(x => '<li style="margin-bottom:8px">' + x + '</li>').join('') + '</ol>' +
      (s.salin ? '<button type="button" class="btn soft sm mt-1" data-act="copy" data-v="' + esc(s.salin) + '"><i class="bi bi-clipboard"></i> Salin tautan</button>' : '') +
      '<p class="small muted mt-2">Setelah terpasang, SI-MAJU terbuka seperti aplikasi biasa: layar penuh dan lebih cepat. Ikonnya ada di layar utama HP.</p>',
    footer: '<button type="button" class="btn" data-act="modal-close">Mengerti</button>'
  });
};
function installMenuHtml() {
  return canInstall() ? '<button type="button" class="menu-item" data-act="pwa-install"><span class="item-ico ok"><i class="bi bi-phone"></i></span><span>Pasang aplikasi di HP<small>Ikon SI-MAJU di layar utama</small></span><i class="bi bi-chevron-right chev"></i></button>' : '';
}
function registerSW() {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  window.addEventListener('load', () => {
    const had = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('./sw.js').catch(() => { /* abaikan */ });
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) toast('Versi baru SI-MAJU siap. Muat ulang halaman untuk memakainya.', 'info', 7000); });
  });
}

// ════════════════════════════════════════════════════════
// BAGIAN 15: MULAI APLIKASI
// ════════════════════════════════════════════════════════
if (!document.getElementById('authScreen') || !document.getElementById('app-container')) {
  document.body.insertAdjacentHTML('afterbegin', '<p style="font:16px sans-serif;padding:24px">Struktur halaman tidak lengkap. Pastikan index.html asli dari paket SI-MAJU PRO dipakai.</p>');
  return;
}
initTheme();
let cfg0 = {}; try { cfg0 = JSON.parse(LS.get('simaju-info') || '{}'); } catch (e) { cfg0 = {}; }
applyConfig(cfg0);
bindAuth();
registerSW();
refreshInstallUi();
if (restoreSession()) enterApp(); else enterGuest();      // tanpa menunggu jaringan: tampil seketika
getPublic('getPublicInfo').then(res => { if (res && res.success) { LS.set('simaju-info', JSON.stringify(res.data)); applyConfig(res.data); } }).catch(() => { /* offline: pakai data tersimpan */ });

})();
