/* Desk engine: the reusable shell for Rize "desk" minigames (FINAN IV pattern, 2026-11-02).
   A unit supplies window.DESK (config.js); this file supplies everything else: seeded numbers, the start
   form (email twice), the worked example stepper, one-question checks, task steps with row checks and a
   help ladder, a Desmos calculator link, the note, the completion-graded PNG receipt, and verification.
   Design rules: coursedev/process/standards/interactive-assignments.md. Reference unit: FINAN IV Unit 5.
   No dependencies. Works with or without a DOM (Node can load it for tests and for the verifier).

   Opt-in fields (added 2026-11-05 after Samuel's Unit 10 review). All optional; a config without them renders exactly as before.
   Returned by taskView(t, L, h):
   - parts: [{ html, field }]  Interleaves questions and inputs, so each answer field sits right under its own question.
       field is 'value', 'choice', 'table' or omitted (text only). Parts render inside the answer form, in order; a value,
       choice or table that no part names renders in its usual place. Use the field's label or legend as the question itself.
   - autosave: true  For steps with no right answer. No Check button: the step judges itself on input (debounced) and on
       change, records value/choice/rows and marks the step done the moment judgeTask says ok, shows a quiet "Saved" and the
       praise text. An invalid edit after saving never overwrites the saved answer. Receipt, checksum and verify are unchanged.
   - example: '<p>..</p>'  A short worked example (2 to 4 lines, one per calculation step, numbers different from the task),
       rendered open, in a <details> box above the inputs.
   - sources: 'html'  Citations, rendered collapsed in <details><summary>Sources</summary> at the bottom of the step.
       C.walk.sources does the same for the walk step.
   - value.help: '' (empty string) omits the help line under the value field; leaving help out keeps the default help.
   Engine behaviour fixed at the same time: once a task step is done, a later wrong Check or a half-edited table no longer
   overwrites the answer stored for the receipt (it used to, and then verify flagged the done step as not checking out). */
(function (root) {
  'use strict';

  // ---------------- shared helpers (exposed as Desk.h) ----------------
  function fnv1a(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; }
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const normEmail = (e) => String(e || '').trim().toLowerCase();
  const df = (r, t) => 1 / Math.pow(1 + r, t);
  const npv = (r, flows) => flows.reduce((s, cf, t) => s + cf * df(r, t), 0);
  const annuityFactor = (r, n) => (1 - Math.pow(1 + r, -n)) / r;
  const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
  const between = (rng, lo, hi, step) => lo + step * Math.floor(rng() * (Math.floor((hi - lo) / step) + 1));
  const round = (x, to) => Math.round(x / to) * to;
  const pct = (r) => (Math.round(r * 1000) / 10) + '%';
  const money = (x, dp) => { const v = dp ? Math.round(x * 100) / 100 : Math.round(x); const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: dp ? 2 : 0, maximumFractionDigits: dp ? 2 : 0 }); return (v < 0 ? '−$' : '$') + s; };
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  const wordCount = (s) => (String(s || '').trim().match(/\S+/g) || []).length;
  function parseMoney(s) {
    if (s == null) return NaN;
    let t = String(s).trim().toLowerCase().replace(/[\s,$＄]/g, '').replace(/[−–]/g, '-');
    let neg = false;
    if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
    if (t.startsWith('-')) { neg = !neg; t = t.slice(1); }
    let mult = 1;
    if (t.endsWith('%')) { mult = 0.01; t = t.slice(0, -1); }
    else if (t.endsWith('k')) { mult = 1e3; t = t.slice(0, -1); }
    else if (t.endsWith('m')) { mult = 1e6; t = t.slice(0, -1); }
    if (!/^\d*\.?\d+$/.test(t)) return NaN;
    const v = parseFloat(t) * mult; return neg ? -v : v;
  }
  /* Judge a number against an exact answer and a list of known wrong answers.
     diag: [[value, code, message], ...]. Tolerance defaults to 0.1% of scale (or $2). */
  function judgeNumber(value, exact, diag, opts) {
    opts = opts || {};
    if (!isFinite(value)) return { ok: false, code: 'unreadable', msg: opts.unreadable || 'Type a number, like 12,345 or −8,000.' };
    const scale = opts.scale != null ? opts.scale : Math.abs(exact);
    const tol = opts.tol != null ? opts.tol : Math.max(opts.minTol != null ? opts.minTol : 2, 0.001 * scale);
    if (near(value, exact, tol)) return { ok: true, code: 'ok' };
    for (const [v, code, msg] of (diag || [])) if (isFinite(v) && near(value, v, tol)) return { ok: false, code, msg };
    if (near(value, -exact, tol)) return { ok: false, code: 'sign', msg: opts.signMsg || 'The size is right but the sign is flipped.' };
    if (near(value, exact, 0.01 * Math.max(scale, 1))) return { ok: false, code: 'close', msg: opts.closeMsg || 'Close. Keep four decimal places in any factor and round only at the end.' };
    return { ok: false, code: 'other', msg: opts.otherMsg || 'Not yet. Use the help button below to see the setup.' };
  }
  function calc(expr) {
    const src = String(expr || '').replace(/[×xX]/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-').replace(/[$＄\s]/g, '');
    if (!src) return { ok: false, err: 'Type an expression, like 330000*0.9259 or 330000/(1.08)^5.' };
    const toks = []; let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (/[0-9.]/.test(c)) { let j = i; while (j < src.length && /[0-9.,]/.test(src[j])) j++; const num = parseFloat(src.slice(i, j).replace(/,/g, '')); if (!isFinite(num)) return { ok: false, err: 'One of the numbers cannot be read.' }; toks.push({ t: 'n', v: num }); i = j; }
      else if ('+-*/^()%'.includes(c)) { toks.push({ t: c }); i++; }
      else return { ok: false, err: 'The calculator understands numbers and + − × ÷ ^ ( ) only.' };
    }
    let p = 0; const peek = () => toks[p], eat = () => toks[p++];
    function primary() { const k = eat(); if (!k) throw new Error('The expression ends too early.'); if (k.t === 'n') return k.v; if (k.t === '(') { const v = sum(); const c = eat(); if (!c || c.t !== ')') throw new Error('A closing parenthesis is missing.'); return v; } if (k.t === '-') return -power(); if (k.t === '+') return power(); throw new Error('Something is out of place near "' + k.t + '".'); }
    function postfix() { let v = primary(); while (peek() && peek().t === '%') { eat(); v /= 100; } return v; }
    function power() { const b = postfix(); if (peek() && peek().t === '^') { eat(); return Math.pow(b, power()); } return b; }
    function prod() { let v = power(); while (peek() && (peek().t === '*' || peek().t === '/')) { const o = eat().t; const w = power(); v = o === '*' ? v * w : v / w; } return v; }
    function sum() { let v = prod(); while (peek() && (peek().t === '+' || peek().t === '-')) { const o = eat().t; const w = prod(); v = o === '+' ? v + w : v - w; } return v; }
    try { const v = sum(); if (p !== toks.length) throw new Error('Something is out of place near the end.'); if (!isFinite(v)) throw new Error('That does not give a number (dividing by zero?).'); return { ok: true, value: v }; }
    catch (e) { return { ok: false, err: e.message }; }
  }
  // PNG tEXt chunk
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (b) => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const KEYWORD = 'rize-receipt';
  const b64e = (s) => btoa(unescape(encodeURIComponent(s)));
  const b64d = (s) => decodeURIComponent(escape(atob(s)));
  function addTextChunk(png, text) {
    const enc = new TextEncoder(); const data = enc.encode(KEYWORD + '\0' + text); const type = enc.encode('tEXt');
    const chunk = new Uint8Array(12 + data.length); const dv = new DataView(chunk.buffer);
    dv.setUint32(0, data.length); chunk.set(type, 4); chunk.set(data, 8);
    const ci = new Uint8Array(4 + data.length); ci.set(type, 0); ci.set(data, 4); dv.setUint32(8 + data.length, crc32(ci));
    const iend = png.length - 12; const out = new Uint8Array(png.length + chunk.length);
    out.set(png.subarray(0, iend), 0); out.set(chunk, iend); out.set(png.subarray(iend), iend + chunk.length); return out;
  }
  function readTextChunk(png) {
    const dv = new DataView(png.buffer, png.byteOffset, png.byteLength); const sig = [137, 80, 78, 71, 13, 10, 26, 10];
    for (let i = 0; i < 8; i++) if (png[i] !== sig[i]) return null;
    let off = 8; const dec = new TextDecoder('latin1');
    while (off + 8 <= png.length) { const len = dv.getUint32(off); const type = dec.decode(png.subarray(off + 4, off + 8)); if (type === 'tEXt') { const body = dec.decode(png.subarray(off + 8, off + 8 + len)); const z = body.indexOf('\0'); if (body.slice(0, z) === KEYWORD) return body.slice(z + 1); } if (type === 'IEND') break; off += 12 + len; }
    return null;
  }

  /* ladder (added 2026-11-11, interactive-assignments rules 26 and 29): one calculation per line, as a table whose rows are
     Line | Calculation | Result. The same call draws the worked example (opts.filled: every result shown, read-only) and the
     student's version (lines with input: true become .rowin inputs judged row by row through judgeTask's rowRes, so the
     engine's existing row marks, saved rows and verify all apply). A faded example is the student's version with most lines given.
     lines: [{ label, calc (html), value (number or text), input, fmt: 'money' | 'factor' | 'pct' | 'num' (a plain number like a P/E) | 'text' }]
     opts: { caption, filled, rows (saved inputs, indexed like lines) } */
  function ladder(lines, opts) {
    opts = opts || {};
    const show = (l) => (l.fmt === 'factor' ? Number(l.value).toFixed(4) : l.fmt === 'pct' ? pct(l.value) : l.fmt === 'text' ? String(l.value) : l.fmt === 'num' ? String(+Number(l.value).toFixed(1)) : money(l.value, l.dp));
    const esc2 = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const body = lines.map((l, i) => {
      let res;
      if (opts.filled || !l.input) res = `<b>${show(l)}</b>`;
      else res = `<label class="sr-only" for="r${i}">${esc2(l.label)}</label><input id="r${i}" class="rowin" data-row="${i}" inputmode="decimal" autocomplete="off" placeholder="${l.fmt === 'factor' ? '0.0000' : l.fmt === 'pct' ? '0.0%' : l.fmt === 'num' ? '0' : '$0'}" value="${opts.rows && opts.rows[i] != null ? esc2(opts.rows[i]) : ''}"><span class="mark" id="mk${i}"></span>`;
      return `<tr${l.input && !opts.filled ? ' class="hl"' : ''}><td class="lbl">${l.label}</td><td class="lbl">${l.calc || ''}</td><td>${res}</td></tr>`;
    }).join('');
    return `<div class="tw"><table class="cf ladder${opts.filled ? ' filled' : ''}">${opts.caption ? `<caption>${opts.caption}</caption>` : ''}<thead><tr><th scope="col">Line</th><th scope="col">Calculation</th><th scope="col">Result</th></tr></thead><tbody>${body}</tbody></table></div>`;
  }
  const h = { fnv1a, mulberry32, normEmail, df, npv, annuityFactor, pick, between, round, pct, money, near, wordCount, parseMoney, judgeNumber, calc, ladder };

  // ---------------- config-bound core ----------------
  function make(C) {
    const STEPS = C.steps, POINTS = C.points || 20;
    const seedFor = (email) => fnv1a(C.app + '|v' + C.seedVersion + '|' + normEmail(email));
    const checksum = (str) => { const a = fnv1a(C.salt + str), b = fnv1a(str + C.salt + 'b'); return (a.toString(36) + b.toString(36)).toUpperCase().padStart(12, '0').slice(0, 12); };
    const buildTasks = (email) => C.buildTasks(mulberry32(seedFor(email)), h);
    const judgeQuiz = (qi, a) => ({ ok: a != null && Number(a) === C.quiz[qi].answer });
    const judgeNote = (t) => ({ ok: wordCount(t) >= C.note.minWords, words: wordCount(t) });
    const pointsFor = (n) => n >= STEPS.length ? POINTS : n >= STEPS.length / 2 ? POINTS / 2 : 0;
    const canonical = (p) => JSON.stringify({ v: p.v, app: p.app, name: p.name, email: p.email, issued: p.issued, steps: p.steps, memo: p.memo });
    function makePayload(name, email, log, memo) {
      const p = { v: C.version, app: C.app, name: String(name || '').trim(), email: normEmail(email), issued: new Date().toISOString(),
        steps: STEPS.map((s) => { const l = log[s.id] || {}; return { id: s.id, done: !!l.done, attempts: l.attempts || 0, help: l.help || 0,
          value: l.value == null ? null : String(l.value), choice: l.choice == null ? null : String(l.choice),
          rows: Array.isArray(l.rows) ? l.rows.map((x) => (x == null ? null : String(x))) : null, at: l.at || null }; }),
        memo: String(memo || '') };
      p.sum = checksum(canonical(p)); return p;
    }
    function verifyPayload(p) {
      const out = { checksumOk: false, rows: [], done: 0, total: STEPS.length, points: 0, problems: [] };
      if (!p || p.app !== C.app) { out.problems.push('This is not a receipt from ' + C.story.title + '.'); return out; }
      if (p.v !== C.version) { out.problems.push('This receipt comes from an older version (' + p.v + '). Ask the student to download a new receipt.'); return out; }
      out.checksumOk = checksum(canonical(p)) === p.sum;
      if (!out.checksumOk) out.problems.push('The checksum does not match, so the receipt was edited after it was issued.');
      const tasks = buildTasks(p.email);
      for (const s of STEPS) {
        const e = (p.steps || []).find((x) => x.id === s.id) || {}; let ok = false;
        if (s.kind === 'walk') ok = !!e.done;
        else if (s.kind === 'check') ok = !!e.done && judgeQuiz(s.quiz, e.choice).ok;
        else if (s.kind === 'note') ok = !!e.done && judgeNote(p.memo).ok;
        else { const t = tasks.find((x) => x.id === s.id); ok = !!e.done && !!t && C.judgeTask(t, { value: e.value, choice: e.choice, rows: e.rows }, h).ok; }
        if (e.done && !ok) out.problems.push(s.label + ' is marked complete, but its answer does not check out for this email.');
        if (ok) out.done++;
        out.rows.push({ id: s.id, label: s.label, claimed: !!e.done, verified: ok, attempts: e.attempts || 0, help: e.help || 0, at: e.at });
      }
      out.points = pointsFor(out.done); return out;
    }
    const shortCode = (sum) => sum.slice(0, 4) + '-' + sum.slice(4, 8) + '-' + sum.slice(8, 12);
    return { C, h, STEPS, POINTS, seedFor, buildTasks, judgeQuiz, judgeNote, pointsFor, makePayload, verifyPayload, shortCode, checksum,
      addTextChunk, readTextChunk, encodeReceipt: (p) => b64e(JSON.stringify(p)), decodeReceipt: (t) => { try { return JSON.parse(b64d(t)); } catch (e) { return null; } } };
  }

  root.DeskEngine = { h, make };
  if (typeof document === 'undefined' || !root.DESK || root.DESK_NO_UI) return;

  // ---------------- UI ----------------
  const D = make(root.DESK), C = D.C, ST = C.story;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => [...(el || document).querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const KEY = C.storageKey;
  const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } } };
  const PERSONAL = /@(gmail|yahoo|hotmail|outlook|live|icloud|me|aol|proton|protonmail|msn|ymail)\./i;
  root.Desk = D; // tests and self-checks
  const DESMOS = 'https://www.desmos.com/scientific';
  document.title = ST.title;
  document.body.insertAdjacentHTML('afterbegin', `<a class="skip" href="#main">Skip to the desk</a>
<header class="bar"><div class="bar-in"><div class="brand"><b>${esc(ST.company)}</b> ${esc(ST.team || '')}</div>
<a class="btn-calc desmos-open" id="calcBtn" href="${DESMOS}" target="desmos" rel="noopener">Desmos calculator<span class="sr-only"> (opens in a new window)</span></a>
<button class="btn-quiet" id="themeBtn" type="button" aria-pressed="false">Dark mode</button></div>
<nav class="steps" aria-label="Steps"><ol id="stepNav"></ol></nav><p class="navnote" id="navnote" hidden>Move between steps at any time. Finished steps turn green.</p></header>
<main id="main" tabindex="-1"><div id="view"></div></main>
<footer><p>${esc(ST.kicker)}. Your progress is saved in this browser.</p></footer><div class="sr-only" aria-live="polite" id="announce"></div>`);
  const view = $('#view');

  // theme
  const themeBtn = $('#themeBtn');
  function setTheme(t) { if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark'); else document.documentElement.removeAttribute('data-theme'); themeBtn.textContent = t === 'dark' ? 'Light mode' : 'Dark mode'; themeBtn.setAttribute('aria-pressed', String(t === 'dark')); store.set(KEY + ':theme', t); }
  setTheme(store.get(KEY + ':theme') || (root.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  themeBtn.addEventListener('click', () => setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));

  // calculator: the Desmos scientific calculator, opened in its own window beside the desk (Samuel, 11/10: "use Desmos").
  // The in-page keypad was retired the same day. Embedding Desmos inside the page needs a paid Desmos licence; linking out is free.
  // A popup sized to the right edge of the screen keeps the desk visible; if the browser blocks it, the link opens a normal tab.
  function openDesmos(e) {
    const W = 440, sc = root.screen || {}, aw = sc.availWidth || 1280, ah = sc.availHeight || 800;
    const left = Math.max(0, (sc.availLeft || 0) + aw - W), top = sc.availTop || 0;
    let w = null; try { w = root.open(DESMOS, 'desmos', `popup,width=${W},height=${Math.min(ah, 760)},left=${left},top=${top}`); } catch (err) { w = null; }
    if (w) { e.preventDefault(); try { w.opener = null; w.focus(); } catch (err) { /* cross-origin */ } }
  }
  document.addEventListener('click', (e) => { const a = e.target.closest && e.target.closest('a.desmos-open'); if (a) openDesmos(e); });
  function dockCalc(slot) {
    if (!slot) return;
    slot.innerHTML = `<div class="calc-strip"><a class="btn small secondary desmos-open" href="${DESMOS}" target="desmos" rel="noopener">Open the Desmos calculator<span class="sr-only"> (opens in a new window)</span></a></div>`;
  }

  // state
  let S = { name: '', email: '', tasks: [], log: {}, memo: '', at: 'start' };
  const blankLog = () => { const l = {}; D.STEPS.forEach((s) => { l[s.id] = { done: false, attempts: 0, help: 0 }; }); return l; };
  function saveState() { if (S.practice) return; store.set(KEY + ':' + D.seedFor(S.email), { name: S.name, email: S.email, log: S.log, memo: S.memo, at: S.at }); store.set(KEY + ':last', S.email); }
  function startFor(name, email) {
    S.name = name.trim(); S.email = normEmail(email); S.tasks = D.buildTasks(S.email);
    const saved = store.get(KEY + ':' + D.seedFor(S.email));
    S.log = saved && saved.log ? saved.log : blankLog(); D.STEPS.forEach((s) => { if (!S.log[s.id]) S.log[s.id] = { done: false, attempts: 0, help: 0 }; });
    S.memo = saved && saved.memo ? saved.memo : ''; if (saved && saved.name && !name.trim()) S.name = saved.name;
    S.at = saved && saved.at ? saved.at : D.STEPS[0].id; saveState();
  }
  const doneCount = () => D.STEPS.filter((s) => S.log[s.id] && S.log[s.id].done).length;
  const stepIdx = (id) => D.STEPS.findIndex((x) => x.id === id);
  function markDone(id) { const L = S.log[id]; if (!L.done) { L.done = true; L.at = new Date().toISOString(); } saveState(); renderNav(); }
  function nextId(id) { const i = stepIdx(id); return i < D.STEPS.length - 1 ? D.STEPS[i + 1].id : 'receipt'; }
  function nextLabel(id) { const n = nextId(id); return n === 'receipt' ? 'Go to your receipt' : 'Next: ' + D.STEPS[stepIdx(n)].label; }
  const practiceBanner = () => (S.practice ? `<p class="practice-banner"><b>Practice round ${S.practice}.</b> New numbers, not graded. Your receipt is unchanged.</p>` : '');
  const kicker = (id) => `${practiceBanner()}<p class="kicker">Step ${stepIdx(id) + 1} of ${D.STEPS.length} · ${esc(D.STEPS[stepIdx(id)].label)}</p>`;
  const sourcesBox = (html) => (html ? `<details class="sources"><summary>Sources</summary><div class="sources-body">${html}</div></details>` : '');
  const exampleBox = (html) => (html ? `<details class="example" open><summary>Worked example</summary><div class="ex-body">${html}</div></details>` : '');
  // The "From <name>, <title>" line was cut 2026-11-12 (Samuel: a sender line with no story is noise); only the Done stamp remains.
  const memoHead = (done) => (done ? '<div class="memo-head"><span></span><span class="stamp">Done</span></div>' : '');
  function renderNav() {
    const ol = $('#stepNav'); ol.innerHTML = ''; $('#navnote').hidden = !S.email; if (!S.email) return;
    [...D.STEPS, { id: 'receipt', label: 'Receipt' }].forEach((s) => {
      const li = document.createElement('li'); const b = document.createElement('button'); b.type = 'button'; b.textContent = s.label;
      const done = s.id === 'receipt' ? doneCount() === D.STEPS.length : S.log[s.id].done;
      if (done) b.classList.add('done'); if (S.at === s.id) b.setAttribute('aria-current', 'step');
      b.setAttribute('aria-label', s.label + (s.id === 'receipt' ? '' : done ? ', finished' : ', not finished yet'));
      b.addEventListener('click', () => go(s.id)); li.appendChild(b); ol.appendChild(li);
    });
  }
  function renderPager(id) {
    let pg = document.getElementById('pager');
    if (!pg) { pg = document.createElement('nav'); pg.id = 'pager'; pg.className = 'pager'; pg.setAttribute('aria-label', 'Previous and next step'); view.after(pg); }
    const all = D.STEPS.map((s) => ({ id: s.id, label: s.label })).concat([{ id: 'receipt', label: 'Receipt' }]);
    const i = all.findIndex((s) => s.id === id);
    if (i < 0) { pg.hidden = true; pg.innerHTML = ''; return; }
    const prev = i > 0 ? all[i - 1] : null, next = i < all.length - 1 ? all[i + 1] : null;
    pg.hidden = false;
    pg.innerHTML = (prev ? `<button type="button" class="btn secondary" data-go="${prev.id}">← Previous: ${esc(prev.label)}</button>` : '<span></span>')
      + (next ? `<button type="button" class="btn" data-go="${next.id}">Next: ${esc(next.label)} →</button>` : '');
    pg.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
  }
  function go(id) {
    if (!S.email) return showStart();
    S.at = id; saveState(); const s = D.STEPS[stepIdx(id)];
    if (id === 'receipt') showReceipt(); else if (s.kind === 'walk') showWalk(s); else if (s.kind === 'check') showCheck(s); else if (s.kind === 'note') showNote(s); else showTask(s);
    renderNav(); renderPager(id); $('#main').focus({ preventScroll: true }); root.scrollTo(0, 0);
  }

  // start
  function showStart() {
    S.at = 'start'; if (document.getElementById('pager')) document.getElementById('pager').hidden = true;
    const last = store.get(KEY + ':last'); const lastSaved = last ? store.get(KEY + ':' + D.seedFor(last)) : null;
    const n = D.STEPS.length;
    view.innerHTML = `<p class="kicker">${esc(ST.kicker)}</p><h1>${esc(ST.title)}</h1><p class="dek">${ST.dek}</p>
      ${ST.whatBox ? `<div class="box"><p>${ST.whatBox}</p></div>` : ''}
      <div class="box"><p><b>How this works</b></p><ul>
        <li>${ST.stepsLine}</li>
        <li><b>This assignment is graded on completion.</b> Finish all ${n} steps to earn all ${D.POINTS} points (at least ${Math.ceil(n / 2)} steps earns ${D.POINTS / 2}). A wrong answer never costs points.</li>
        <li>Check your answers as often as you like. If you get stuck, the help buttons show you the setup with your own numbers.</li>
        <li>The <b>Desmos calculator</b> button at the top of the page opens a calculator in a window beside the desk. Keep it open while you work.</li>
        <li>When you finish, download your receipt and upload it to the assignment page.</li></ul></div>
      <form class="start" id="startForm" novalidate>
        <div><label for="nm">Your full name</label><input type="text" id="nm" autocomplete="name" required value="${lastSaved ? esc(lastSaved.name) : ''}"></div>
        <div><label for="em">Your school email</label><input type="email" id="em" autocomplete="email" required value="${lastSaved ? esc(lastSaved.email) : ''}" aria-describedby="emHelp"><p class="field-help" id="emHelp">Your instructor matches your receipt to this email.</p></div>
        <div><label for="em2">Type your school email again</label><input type="email" id="em2" autocomplete="off" required value="${lastSaved ? esc(lastSaved.email) : ''}"></div>
        <p class="fb bad" id="startErr" role="alert"></p>
        <div class="actions"><button class="btn" type="submit">${lastSaved ? 'Continue where you left off' : 'Start'}</button></div></form>`;
    let warned = false;
    $('#startForm').addEventListener('submit', (e) => {
      e.preventDefault(); const nm = $('#nm').value.trim(), em = $('#em').value.trim(), em2 = $('#em2').value.trim(); const err = $('#startErr'); err.className = 'fb bad';
      if (!nm) { err.textContent = 'Enter your full name.'; $('#nm').focus(); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { err.textContent = 'Enter your school email, like jdoe@college.edu.'; $('#em').focus(); return; }
      if (normEmail(em) !== normEmail(em2)) { err.textContent = 'The two emails do not match. Check both for typos.'; $('#em2').focus(); return; }
      if (PERSONAL.test(em) && !warned) { warned = true; err.className = 'fb hint'; err.textContent = 'That looks like a personal email. Your instructor looks for your school email, so use that if you have one. To keep this email anyway, select Start again.'; return; }
      startFor(nm, em); const first = D.STEPS.find((s) => !S.log[s.id].done);
      go(lastSaved && normEmail(lastSaved.email) === S.email && S.at && S.at !== 'start' ? S.at : (first ? first.id : 'receipt'));
    });
    renderNav();
  }

  // worked example
  function showWalk(s) {
    const L = S.log[s.id], W = C.walk, stage = Math.min(L.stage || 0, W.stages.length - 1);
    view.innerHTML = `${kicker(s.id)}<article class="memo" aria-labelledby="t">${memoHead(L.done)}<h2 id="t">${esc(W.title)}</h2>${W.intro}
      ${W.render(stage, h)}
      <ol style="padding-left:1.3rem">${W.stages.slice(0, stage + 1).map((x, i) => `<li class="${i === stage ? 'reveal' : ''}"><b>${x.t}.</b> ${x.p}${x.extra || ''}</li>`).join('')}</ol>
      <div class="actions">${stage < W.stages.length - 1 ? `<button class="btn" type="button" id="walkNext">Show the next step (${stage + 2} of ${W.stages.length})</button>` : `<button class="btn" type="button" id="walkDone">${L.done ? nextLabel(s.id) : 'I’ve got it. ' + nextLabel(s.id)}</button>`}
      ${stage > 0 ? '<button class="btn secondary" type="button" id="walkReset">Start the example over</button>' : ''}</div>${sourcesBox(W.sources)}</article>`;
    if ($('#walkNext')) $('#walkNext').addEventListener('click', () => { L.stage = stage + 1; saveState(); showWalk(s); ($('#walkNext') || $('#walkDone')).focus(); });
    if ($('#walkDone')) $('#walkDone').addEventListener('click', () => { markDone(s.id); go(nextId(s.id)); });
    if ($('#walkReset')) $('#walkReset').addEventListener('click', () => { L.stage = 0; saveState(); showWalk(s); });
  }

  // one-question check
  const optOrder = (q) => { const hs = (s) => { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619) >>> 0; } return x; }; return q.options.map((_, j) => j).sort((a, b) => hs(q.q + '|' + a) - hs(q.q + '|' + b)); };
  function showCheck(s) {
    const L = S.log[s.id], q = C.quiz[s.quiz]; const cur = L.choice != null ? Number(L.choice) : null;
    view.innerHTML = `${kicker(s.id)}<article class="memo" aria-labelledby="t">${memoHead(L.done)}<h2 id="t">${esc(q.title || 'Quick win')}</h2>
      <form id="qf" novalidate><fieldset><legend>${esc(q.q)}</legend><div class="choices stack">${optOrder(q).map((j) => `<label class="choice"><input type="radio" name="q" value="${j}" ${cur === j ? 'checked' : ''}><span>${esc(q.options[j])}</span></label>`).join('')}</div></fieldset>
      <div class="actions"><button class="btn" type="submit">Check</button><span class="attempts" id="att">${L.attempts ? 'Checks so far: ' + L.attempts : ''}</span></div>
      <div class="fb" id="fb" aria-live="polite"></div><div class="actions" id="nextRow" ${L.done ? '' : 'hidden'}><button class="btn" type="button" id="nextBtn">${nextLabel(s.id)}</button></div></form></article>`;
    $('#qf').addEventListener('submit', (e) => {
      e.preventDefault(); const c = $('input[name=q]:checked'); const fb = $('#fb');
      if (!c) { fb.className = 'fb bad'; fb.textContent = 'Choose an answer.'; return; }
      const pick = Number(c.value); L.attempts = (L.attempts || 0) + 1; const ok = D.judgeQuiz(s.quiz, pick).ok;
      if (ok || !L.done) L.choice = pick;   // a finished check keeps its right answer for the receipt
      fb.className = 'fb ' + (ok ? 'ok' : 'bad'); fb.textContent = q.why[pick] + (!ok && L.done ? ' Your earlier right answer is still saved.' : '');
      if (ok) { markDone(s.id); $('#nextRow').hidden = false; (document.querySelector('#pager [data-go]:not(.secondary)') || $('#nextBtn')).focus(); }
      $('#att').textContent = 'Checks so far: ' + L.attempts; saveState();
    });
    $('#nextBtn').addEventListener('click', () => go(nextId(s.id)));
  }

  // task
  function radios(name, legend, opts, current) { return `<fieldset><legend>${legend}</legend><div class="choices">${opts.map(([v, t]) => `<label class="choice"><input type="radio" name="${name}" value="${v}" ${current === v ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div></fieldset>`; }
  function showTask(s) {
    const t = S.tasks.find((x) => x.id === s.id), L = S.log[s.id], v = C.taskView(t, L, h);
    const parts = Array.isArray(v.parts) ? v.parts : null, placed = new Set(parts ? parts.map((p) => p.field).filter(Boolean) : []);
    const vHelp = v.value ? (v.value.help != null ? v.value.help : 'Round to the nearest dollar. Start a negative amount with a minus sign. Answers within about 0.1% count as correct.') : '';
    const valueHtml = () => (v.value ? `<div class="field"><label for="val">${esc(v.value.label)}</label><input class="money" id="val" inputmode="decimal" autocomplete="off" placeholder="${esc(v.value.placeholder || '$0')}" value="${L.value ? esc(L.value) : ''}"${vHelp ? ' aria-describedby="valHelp"' : ''}>${vHelp ? `<p class="field-help" id="valHelp">${vHelp}</p>` : ''}</div>` : '');
    const choiceHtml = () => (v.choice ? radios('dec', v.choice.legend, v.choice.options, L.choice) : '');
    const fieldHtml = (f) => (f === 'value' ? valueHtml() : f === 'choice' ? choiceHtml() : f === 'table' ? (v.table || '') : '');
    const calcSlot = v.noCalc ? '' : '<div id="calcSlot"></div>';
    const auto = !!v.autosave;
    view.innerHTML = `${kicker(s.id)}<article class="memo" aria-labelledby="t">${memoHead(L.done)}<h2 id="t">${esc(v.title)}</h2>${v.place ? `<p class="place">${esc(v.place)}</p>` : ''}${v.body || ''}
      ${exampleBox(v.example)}${placed.has('table') ? '' : (v.table || '')}${parts ? '' : calcSlot}
      <form class="ask" id="ask" novalidate>
      ${parts ? parts.map((p) => `<div class="part">${p.html || ''}${fieldHtml(p.field)}</div>`).join('') + calcSlot : ''}
      ${placed.has('value') ? '' : valueHtml()}
      ${placed.has('choice') ? '' : choiceHtml()}
      ${auto ? '<p class="autosave" id="saveState" aria-live="polite"></p>' : `<div class="actions"><button class="btn" type="submit">Check</button><span class="attempts" id="att">${L.attempts ? 'Checks so far: ' + L.attempts : ''}</span></div>`}
      <div class="fb" id="fb" aria-live="polite"></div><div class="actions" id="helpRow" hidden></div><div class="fb hint" id="helpBox" hidden></div>
      <div class="actions" id="nextRow" ${L.done ? '' : 'hidden'}><button class="btn" type="button" id="nextBtn">${nextLabel(s.id)}</button></div></form>${sourcesBox(v.sources)}</article>`;
    if ($('#calcSlot')) dockCalc($('#calcSlot'));
    const rowInputs = () => $$('.rowin');
    const rowsNow = () => { if (!rowInputs().length) return null; const rows = []; rowInputs().forEach((x) => { rows[Number(x.dataset.row)] = x.value; }); return rows; };
    // Once a step is done, L.rows holds the answer that verified; edits only replace it when they verify too.
    const syncRows = () => { const rows = rowsNow(); if (!rows) return; if (!L.done) { L.rows = rows; saveState(); } if (v.onRows) v.onRows(rows, $); };
    rowInputs().forEach((x) => x.addEventListener('input', syncRows)); syncRows();
    if (v.wire) v.wire($, L);
    $('#nextBtn').addEventListener('click', () => go(nextId(s.id)));
    if (auto) {
      const form = $('#ask'), status = $('#saveState'), fb = $('#fb'); let timer = null;
      const read = () => ({ value: $('#val') ? $('#val').value : null, choice: (form.querySelector('input[name=dec]:checked') || {}).value || null, rows: rowsNow() });
      const blank = (e) => !String(e.value || '').trim() && !e.choice && !(e.rows || []).some((x) => x != null && String(x).trim());
      const autoJudge = () => {
        clearTimeout(timer); const e = read(); const res = C.judgeTask(t, e, h);
        if (res.ok) {
          const first = !L.done; L.value = e.value; L.choice = e.choice; if (e.rows) L.rows = e.rows; if (first) L.attempts = Math.max(L.attempts || 0, 1);
          markDone(s.id); status.className = 'autosave ok'; status.textContent = 'Saved'; fb.className = 'fb note'; fb.innerHTML = C.praise(t, h); $('#nextRow').hidden = false;
        } else {
          status.className = 'autosave'; status.textContent = blank(e) ? '' : (res.msg || '') + (L.done ? ' Your earlier answer is still saved.' : '');
        }
        saveState();
      };
      form.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(autoJudge, 500); });
      form.addEventListener('change', autoJudge);
      form.addEventListener('submit', (e) => { e.preventDefault(); autoJudge(); });
      if (L.done) autoJudge();
      return;
    }
    const levels = v.helpLevels || 2;
    function renderHelp() {
      const row = $('#helpRow'); const fails = L.fails || 0; if (!fails || L.done) { row.hidden = true; return; }
      row.hidden = false; const avail = Math.min(levels, fails);
      row.innerHTML = (v.helpLabels || ['Show me how to start', 'Show me the whole setup']).slice(0, avail).map((lab, i) => `<button class="btn small secondary" type="button" data-l="${i + 1}">${esc(lab)}</button>`).join('');
      $$('button[data-l]', row).forEach((b) => b.addEventListener('click', () => { const lvl = Number(b.dataset.l); L.help = Math.max(L.help || 0, lvl); saveState(); const box = $('#helpBox'); box.hidden = false; box.innerHTML = C.helpText(t, lvl, h); }));
    }
    renderHelp();
    $('#ask').addEventListener('submit', (e) => {
      e.preventDefault(); const val = $('#val') ? $('#val').value : null; const ch = ($('#ask').querySelector('input[name=dec]:checked') || {}).value || null;
      const rows = rowsNow(); const res = C.judgeTask(t, { value: val, choice: ch, rows: rows || L.rows }, h);
      L.attempts = (L.attempts || 0) + 1; const fb = $('#fb');
      if (res.ok || !L.done) { L.value = val; L.choice = ch; if (rows) L.rows = rows; }
      if (res.rowRes) res.rowRes.forEach((rr, i) => { const x = $(`.rowin[data-row="${i}"]`), mk = $('#mk' + i); if (!x || rr == null) return; x.classList.toggle('good', rr.ok); x.classList.toggle('wrong', !rr.ok); if (mk) { mk.textContent = rr.ok ? '✓' : '✗'; mk.setAttribute('aria-label', rr.ok ? 'correct' : 'not yet'); } });
      if (res.ok) { markDone(s.id); fb.className = 'fb ok'; fb.innerHTML = '<b>Right.</b> ' + C.praise(t, h); $('#nextRow').hidden = false; $('#helpRow').hidden = true; (document.querySelector('#pager [data-go]:not(.secondary)') || $('#nextBtn')).focus(); }
      else { L.fails = (L.fails || 0) + 1; fb.className = 'fb bad'; fb.innerHTML = '<b>Not yet.</b> ' + esc(res.msg || 'Check your work and try again.'); renderHelp(); }
      $('#att').textContent = 'Checks so far: ' + L.attempts; saveState();
    });
  }

  // note
  function showNote(s) {
    const L = S.log[s.id], N = C.note;
    view.innerHTML = `${kicker(s.id)}<article class="memo" aria-labelledby="t">${memoHead(L.done)}<h2 id="t">${esc(N.title)}</h2><p>${N.prompt}</p>
      <form id="mf" novalidate><label for="memoText">${esc(N.label)}</label><textarea id="memoText" aria-describedby="memoHelp">${esc(S.memo)}</textarea>
      <p class="field-help" id="memoHelp">Write 3 to 5 sentences (at least ${N.minWords} words) in your own words. This step is graded on completion, and the note prints on your receipt. <span class="wc" id="wc"></span></p>
      <div class="actions"><button class="btn" type="submit">Save my note</button></div><div class="fb" id="fb" aria-live="polite"></div>
      <div class="actions" id="nextRow" ${L.done ? '' : 'hidden'}><button class="btn" type="button" id="nextBtn">Go to your receipt</button></div></form></article>`;
    const ta = $('#memoText'); const wc = () => { const n = wordCount(ta.value); $('#wc').textContent = n + (n === 1 ? ' word' : ' words') + ' so far.'; };
    ta.addEventListener('input', () => { const Ln = S.log[s.id]; if (!Ln.done || D.judgeNote(ta.value).ok) S.memo = ta.value;   // a saved note is never replaced by a too-short edit
      saveState(); wc(); if (Ln.done && !D.judgeNote(ta.value).ok) $('#wc').textContent += ` Under ${N.minWords} words: your saved note stays on your receipt.`; }); wc();
    $('#mf').addEventListener('submit', (e) => { e.preventDefault(); const r = D.judgeNote(ta.value); if (r.ok || !S.log[s.id].done) S.memo = ta.value; const fb = $('#fb');
      if (r.ok) { markDone(s.id); fb.className = 'fb ok'; fb.innerHTML = '<b>Saved.</b> Your note will print on your receipt.'; $('#nextRow').hidden = false; }
      else { fb.className = 'fb bad'; fb.textContent = `Your note has ${r.words} words. Write at least ${N.minWords}.`; } saveState(); });
    $('#nextBtn').addEventListener('click', () => go('receipt'));
  }

  // receipt
  function wrapLines(g, text, maxW, maxLines) { const words = String(text).replace(/\s+/g, ' ').trim().split(' '); const lines = []; let cur = ''; for (const w of words) { const t2 = cur ? cur + ' ' + w : w; if (g.measureText(t2).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t2; } if (cur) lines.push(cur); if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] += ' …'; } return lines; }
  async function makeReceiptBlob() {
    const payload = D.makePayload(S.name, S.email, S.log, S.memo); const done = doneCount(), pts = D.pointsFor(done), n = D.STEPS.length;
    const cols = Math.min(5, Math.ceil(n / 2)), rowsN = Math.ceil(n / cols), boxW = Math.floor((1040 - (cols - 1) * 12) / cols);
    const cv = document.createElement('canvas'); cv.width = 1200; cv.height = 1000 + rowsN * 92; const g = cv.getContext('2d'); const H = cv.height;
    g.fillStyle = '#F7F5F0'; g.fillRect(0, 0, 1200, H); g.strokeStyle = '#1C6B4A'; g.lineWidth = 6; g.strokeRect(24, 24, 1152, H - 48); g.lineWidth = 1.5; g.strokeRect(38, 38, 1124, H - 76);
    g.fillStyle = '#1C6B4A'; g.font = 'italic 24px Georgia, serif'; g.fillText(ST.company + ' ' + (ST.team || '') + '  ·  ' + ST.kicker, 80, 100);
    g.fillStyle = '#1B211D'; g.font = '58px Georgia, serif'; g.fillText(ST.title, 80, 172); g.font = '34px Georgia, serif'; g.fillText(S.name, 80, 236);
    g.fillStyle = '#5C625D'; g.font = '26px Georgia, serif'; g.fillText(S.email, 80, 276);
    g.fillStyle = done === n ? '#1C6B4A' : '#8A5A00'; g.fillRect(80, 306, 1040, 96); g.fillStyle = '#FFFFFF'; g.font = 'bold 44px Georgia, serif'; g.fillText('Points: ' + pts + ' / ' + D.POINTS, 108, 370);
    g.font = '24px Georgia, serif'; g.textAlign = 'right'; g.fillText(done + ' of ' + n + ' steps complete · graded on completion', 1092, 366); g.textAlign = 'left';
    const fit = (g, txt, max, px) => { let s = px; do { g.font = 'bold ' + s + 'px Georgia, serif'; s -= 1; } while (g.measureText(txt).width > max && s >= 12); };
    D.STEPS.forEach((s, k) => { const x = 80 + (k % cols) * (boxW + 12), y = 430 + Math.floor(k / cols) * 92, l = S.log[s.id];
      g.fillStyle = l.done ? '#E0F2E5' : '#FBE7E4'; g.fillRect(x, y, boxW, 76); g.fillStyle = l.done ? '#1C7340' : '#A8261E'; const tl = (l.done ? '✓ ' : '✗ ') + s.label; fit(g, tl, boxW - 22, 18); g.fillText(tl, x + 14, y + 34);
      g.fillStyle = '#5C625D'; g.font = '17px Georgia, serif'; g.fillText(l.done ? 'complete' : 'not finished', x + 14, y + 60); });
    const ny = 430 + rowsN * 92 + 40; g.fillStyle = '#1B211D'; g.font = 'bold 24px Georgia, serif'; g.fillText(C.note.receiptHeading, 80, ny);
    g.font = '21px Georgia, serif'; (S.memo.trim() ? wrapLines(g, S.memo, 1040, 9) : ['(no note yet)']).forEach((ln, i) => g.fillText(ln, 80, ny + 34 + i * 29));
    g.fillStyle = '#5C625D'; g.font = '20px Georgia, serif'; g.fillText('Issued ' + new Date(payload.issued).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' }), 80, H - 142);
    g.fillStyle = '#1B211D'; g.font = 'bold 26px monospace'; g.fillText('Verification code  ' + D.shortCode(payload.sum), 80, H - 104);
    g.fillStyle = '#5C625D'; g.font = '18px Georgia, serif'; g.fillText('Instructors: enter the points shown above. To spot-check, open ' + C.verifyUrl.replace('https://', ''), 80, H - 66);
    const blob = await new Promise((res) => cv.toBlob(res, 'image/png')); const bytes = new Uint8Array(await blob.arrayBuffer());
    return { blob: new Blob([D.addTextChunk(bytes, D.encodeReceipt(payload))], { type: 'image/png' }), url: cv.toDataURL('image/png'), payload, pts, done };
  }
  function startPractice() {
    const k = KEY + ':practice:' + D.seedFor(S.email); const round = (Number(store.get(k)) || 0) + 1; store.set(k, round);
    S.practice = round; S.tasks = D.buildTasks(S.email + '#practice' + round); S.log = blankLog();
    const first = (C.practiceStart && D.STEPS.find((s) => s.id === C.practiceStart)) || D.STEPS.find((s) => s.kind === 'task'); go(first ? first.id : D.STEPS[0].id);
  }
  function endPractice() { const nm = S.name, em = S.email; S.practice = 0; startFor(nm, em); go('receipt'); }
  function showPracticeEnd() {
    const tasks = D.STEPS.filter((s) => s.kind === 'task'), done = tasks.filter((s) => S.log[s.id].done).length;
    view.innerHTML = `${practiceBanner()}<p class="kicker">Practice round ${S.practice}</p><h2>You solved ${done} of ${tasks.length} problems with new numbers.</h2>
      <p>Practice rounds are never graded. Your graded receipt is exactly as you left it.</p>
      <div class="actions"><button class="btn" type="button" id="again">Practice again with new numbers</button><button class="btn secondary" type="button" id="back">Back to my graded receipt</button></div>`;
    $('#again').addEventListener('click', startPractice); $('#back').addEventListener('click', endPractice);
  }
  async function showReceipt() {
    if (S.practice) return showPracticeEnd();
    const r = await makeReceiptBlob(); const all = r.done === D.STEPS.length; const fileName = C.filePrefix + '_' + (S.name.replace(/[^A-Za-z0-9]+/g, '') || 'Student') + '.png';
    view.innerHTML = `<p class="kicker">Your receipt</p><p class="points">${r.pts} / ${D.POINTS} points</p><h2>${all ? 'Every step is complete.' : 'A few steps are still open.'}</h2>
      <p>${all ? 'Download your receipt and upload it to the assignment page. That is all there is to it.' : 'This assignment is graded on completion. Finish the open steps below for full credit, then download your receipt.'}</p>
      <ul class="check">${D.STEPS.map((s) => `<li><span class="st ${S.log[s.id].done ? 'ok' : 'no'}">${S.log[s.id].done ? '✓ done' : '✗ open'}</span><span>${esc(s.label)}</span>${S.log[s.id].done ? '' : ` <button class="btn small secondary" type="button" data-go="${s.id}">Go to ${esc(s.label)}</button>`}</li>`).join('')}</ul>
      <div class="actions"><a class="btn" id="dl" download="${fileName}" href="#">Download your receipt</a></div>
      <img class="cert-preview" alt="Receipt preview: ${esc(S.name)}, ${r.pts} of ${D.POINTS} points, ${r.done} of ${D.STEPS.length} steps complete, verification code ${D.shortCode(r.payload.sum)}." src="${r.url}">
      <p class="small">The file is named ${esc(fileName)}. Upload the downloaded file itself, not a screenshot: your instructor’s checker reads data stored inside the file. If you finish more steps later, download a new receipt.</p>
      <div class="box"><p><b>Want more practice before an exam?</b> Work the problems again with new numbers. Practice rounds are not graded and do not change this receipt.</p><div class="actions"><button class="btn secondary" type="button" id="practice">Practice with new numbers</button></div></div>
      <p class="small">Not you? <a href="#" id="switch">Start over with a different email</a>.</p>`;
    $('#practice').addEventListener('click', startPractice);
    $('#dl').href = URL.createObjectURL(r.blob); $$('button[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
    $('#switch').addEventListener('click', (e) => { e.preventDefault(); S = { name: '', email: '', tasks: [], log: {}, memo: '', at: 'start' }; store.set(KEY + ':last', null); showStart(); });
  }

  // boot
  const last = store.get(KEY + ':last'); const lastSaved = last ? store.get(KEY + ':' + D.seedFor(last)) : null;
  if (lastSaved && lastSaved.name) { startFor(lastSaved.name, lastSaved.email); go(S.at && S.at !== 'start' ? S.at : D.STEPS[0].id); } else showStart();

  // self-checks (interactive-health contract)
  const checks = [];
  const reg = (name, fn) => checks.push({ name, fn });
  root.__selfCheck = async () => { const out = []; for (const c of checks) { try { const r = await c.fn(); out.push(r === true || r === undefined ? { name: c.name, ok: true } : r === false ? { name: c.name, ok: false } : { name: c.name, ok: !!r.ok, detail: r.detail }); } catch (e) { out.push({ name: c.name, ok: false, detail: String(e) }); } } return { ok: out.every((x) => x.ok), checks: out }; };
  reg('tasks generate for a test email', () => D.buildTasks('selfcheck@example.edu').length === D.STEPS.filter((s) => s.kind === 'task').length || { ok: false, detail: 'task count mismatch' });
  reg('each task accepts its own answer and rejects a wrong one', () => { for (const t of D.buildTasks('selfcheck@example.edu')) { const good = C.selfAnswer(t, h); if (!C.judgeTask(t, good, h).ok) return { ok: false, detail: t.id + ' rejects its own answer' }; const bad = C.selfWrong(t, h); if (C.judgeTask(t, bad, h).ok) return { ok: false, detail: t.id + ' accepts a wrong answer' }; } return true; });
  reg('calculator evaluates a discount factor', () => Math.abs(calc('330000/(1.08)^5').value - 224592.455) < 0.01 || { ok: false, detail: 'calc wrong' });
  reg('a page view rendered', () => view.textContent.trim().length > 200 || { ok: false, detail: 'view is empty' });
  reg('receipt PNG round-trips its payload', async () => {
    const tasks = D.buildTasks('selfcheck@example.edu'); const log = {};
    D.STEPS.forEach((s) => { if (s.kind === 'check') log[s.id] = { done: true, choice: C.quiz[s.quiz].answer }; else if (s.kind === 'task') log[s.id] = Object.assign({ done: true }, C.selfAnswer(tasks.find((t) => t.id === s.id), h)); else log[s.id] = { done: true }; });
    const p = D.makePayload('Self Check', 'selfcheck@example.edu', log, 'word '.repeat(C.note.minWords + 5));
    const cv2 = document.createElement('canvas'); cv2.width = 20; cv2.height = 20; const blob = await new Promise((res) => cv2.toBlob(res, 'image/png'));
    const v = D.verifyPayload(D.decodeReceipt(D.readTextChunk(D.addTextChunk(new Uint8Array(await blob.arrayBuffer()), D.encodeReceipt(p)))));
    return (v.checksumOk && v.done === D.STEPS.length && v.points === D.POINTS) || { ok: false, detail: JSON.stringify(v.problems) };
  });
})(typeof window !== 'undefined' ? window : globalThis);
