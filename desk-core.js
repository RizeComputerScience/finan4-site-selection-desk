/* The Site Selection Desk: shared core for the game and the verifier.
   Seeded card generation, judging with diagnoses, and the PNG receipt (tEXt chunk + checksum).
   No dependencies. Everything a grader needs is recomputed from the student's email, so the
   receipt does not have to be secret: a passing receipt needs correct answers for that email's numbers. */
(function (root) {
  'use strict';
  const APP = 'finan4-u5-site-selection-desk';
  const VERSION = 1;
  const SALT = 'rize-finan4-desk-v1:7f3c9a';

  // ---------- hashing and seeded random ----------
  function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function normEmail(e) { return String(e || '').trim().toLowerCase(); }
  function seedFor(email) { return fnv1a(APP + '|' + normEmail(email)); }
  function checksum(str) {
    // Two independent FNV passes give a 64-bit-ish tamper-evident code. Not security; it catches casual edits.
    const a = fnv1a(SALT + str), b = fnv1a(str + SALT + 'b');
    return (a.toString(36) + b.toString(36)).toUpperCase().padStart(12, '0').slice(0, 12);
  }

  // ---------- finance ----------
  const df = (r, t) => 1 / Math.pow(1 + r, t);
  const npv = (r, flows) => flows.reduce((s, cf, t) => s + cf * df(r, t), 0); // flows[0] is today
  const pv = (r, flows) => flows.reduce((s, cf, t) => (t === 0 ? s : s + cf * df(r, t)), 0);
  const annuityFactor = (r, n) => (1 - Math.pow(1 + r, -n)) / r;
  function irr(flows) {
    let lo = -0.9, hi = 1.0;
    for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (npv(mid, flows) > 0) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }
  function payback(flows) {
    let cum = flows[0];
    for (let t = 1; t < flows.length; t++) {
      const prev = cum; cum += flows[t];
      if (cum >= 0) return t - 1 + (-prev) / flows[t];
    }
    return null;
  }
  const round10k = (x) => Math.round(x / 10000) * 10000;
  const round1k = (x) => Math.round(x / 1000) * 1000;

  // ---------- card generation ----------
  function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
  function between(rng, lo, hi, step) { const n = Math.floor((hi - lo) / step) + 1; return lo + step * Math.floor(rng() * n); }

  function buildCards(email) {
    const rng = mulberry32(seedFor(email));
    const cards = [];
    const rates = [0.06, 0.07, 0.08, 0.09, 0.10, 0.11, 0.12];

    // 1. Warm-up: present value of one payment
    {
      const r = pick(rng, rates), n = between(rng, 3, 6, 1), x = between(rng, 200000, 600000, 50000);
      cards.push({ id: 1, kind: 'pv1', r, n, amount: x, flows: null, answer: x * df(r, n), decision: null });
    }
    // 2. First site: level stream, positive NPV
    {
      const r = pick(rng, rates), n = 5, a = between(rng, 240000, 420000, 10000);
      const pvA = a * annuityFactor(r, n);
      const cost = round10k(pvA * (0.70 + 0.12 * rng()));
      const flows = [-cost, ...Array(n).fill(a)];
      cards.push({ id: 2, kind: 'npv', r, flows, answer: npv(r, flows), decision: 'build', showFactors: true, scratch: true });
    }
    // 3. Ramp-up site: uneven flows, positive NPV
    {
      const r = pick(rng, rates), n = 6, a = between(rng, 300000, 500000, 10000);
      const f = [round1k(0.5 * a), round1k(0.8 * a), a, a, a, a];
      const p = pv(r, [0, ...f]);
      const cost = round10k(p * (0.72 + 0.12 * rng()));
      const flows = [-cost, ...f];
      cards.push({ id: 3, kind: 'npv', r, flows, answer: npv(r, flows), decision: 'build', showFactors: true, scratch: true });
    }
    // 4. The pass: negative NPV, factors hidden
    {
      const r = pick(rng, rates), n = 5, a = between(rng, 200000, 360000, 10000);
      const cost = round10k(a * annuityFactor(r, n) * (1.06 + 0.10 * rng()));
      const flows = [-cost, ...Array(n).fill(a)];
      cards.push({ id: 4, kind: 'npv', r, flows, answer: npv(r, flows), decision: 'pass', showFactors: false, scratch: false });
    }
    // 5. Rate check: positive at the old rate, negative at a rate 4 points higher
    {
      const r0 = pick(rng, [0.06, 0.07, 0.08]), r = r0 + 0.04, n = 7, a = between(rng, 220000, 380000, 10000);
      const lo = a * annuityFactor(r, n), hi = a * annuityFactor(r0, n);
      const cost = round10k(lo + (hi - lo) * (0.35 + 0.3 * rng()));
      const flows = [-cost, ...Array(n).fill(a)];
      cards.push({ id: 5, kind: 'npv', r, r0, flows, answer: npv(r, flows), decision: 'pass', showFactors: false, scratch: false,
        oldNpv: npv(r0, flows) });
    }
    // 6. Payback trap: A pays back faster, B has the higher NPV
    {
      const r = pick(rng, [0.08, 0.09, 0.10]);
      const cost = between(rng, 900000, 1400000, 50000);
      // A: front-loaded, 4 years. B: steady, 9 years.
      const aFlows = [-cost, round10k(cost * 0.50), round10k(cost * 0.45), round10k(cost * 0.30), round10k(cost * 0.10)];
      const bAnn = round10k(cost * (0.235 + 0.02 * rng()));
      const bFlows = [-cost, ...Array(9).fill(bAnn)];
      cards.push({ id: 6, kind: 'choose', r, aFlows, bFlows, answer: npv(r, bFlows), aNpv: npv(r, aFlows), decision: 'B',
        aPayback: payback(aFlows), bPayback: payback(bFlows) });
    }
    // 7. Break-even: smallest level cash flow with NPV = 0
    {
      const r = pick(rng, rates), n = between(rng, 6, 10, 1), cost = between(rng, 1000000, 2000000, 100000);
      cards.push({ id: 7, kind: 'breakeven', r, n, cost, answer: cost / annuityFactor(r, n), decision: null });
    }
    // 8. Break-even rate (IRR), multiple choice with a live rate slider
    {
      const n = 8, cost = between(rng, 1000000, 1600000, 100000);
      const target = between(rng, 11, 19, 1) / 100;
      const a = round10k(cost / annuityFactor(target, n));
      const flows = [-cost, ...Array(n).fill(a)];
      const exact = irr(flows);
      const right = Math.round(exact * 100);
      const simple = Math.round((a / cost) * 100);
      let opts = [right, right - 4, right + 4, simple].filter((v, i, s) => v > 0 && s.indexOf(v) === i);
      let k = 6; while (opts.length < 4) { if (!opts.includes(right + k)) opts.push(right + k); k += 2; }
      opts = opts.slice(0, 4).sort((x, y) => x - y);
      const r = pick(rng, [0.08, 0.09, 0.10]);
      cards.push({ id: 8, kind: 'irr', r, flows, irrExact: exact, options: opts, answer: right, simple, decision: null });
    }
    return cards;
  }

  // ---------- parsing and judging ----------
  function parseMoney(s) {
    if (s == null) return NaN;
    let t = String(s).trim().toLowerCase().replace(/[\s,$]/g, '');
    let neg = false;
    if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
    if (t.startsWith('-') || t.startsWith('−')) { neg = !neg; t = t.slice(1); }
    let mult = 1;
    if (t.endsWith('k')) { mult = 1e3; t = t.slice(0, -1); }
    else if (t.endsWith('m')) { mult = 1e6; t = t.slice(0, -1); }
    if (!/^\d*\.?\d+$/.test(t)) return NaN;
    const v = parseFloat(t) * mult;
    return neg ? -v : v;
  }
  function tolFor(card) {
    const scale = card.flows ? card.flows.reduce((s, x) => s + Math.abs(x), 0) : Math.abs(card.answer);
    return Math.max(1500, 0.004 * scale);
  }
  function near(a, b, tol) { return Math.abs(a - b) <= tol; }

  // Returns {ok, code, msg}. code names the diagnosis for the log.
  function judgeNumber(card, value) {
    if (!isFinite(value)) return { ok: false, code: 'unreadable', msg: 'Type a dollar amount, like 412,500 or -38,000.' };
    const tol = tolFor(card);
    if (near(value, card.answer, tol)) return { ok: true, code: 'ok' };
    const r = card.r;
    const diag = [];
    if (card.kind === 'pv1') {
      diag.push([card.amount * Math.pow(1 + r, card.n), 'compounded', 'That is the future value. To bring money from the future back to today, divide by (1 + r) raised to the number of years; do not multiply.']);
      diag.push([card.amount / (1 + r * card.n), 'simple', 'That treats interest as simple. Each year discounts the year before it, so use (1 + r) raised to the number of years.']);
      diag.push([card.amount, 'nodiscount', 'That is the payment itself. A dollar that arrives later is worth less today, so it needs discounting.']);
      diag.push([card.amount * df(r, card.n - 1), 'offbyone', 'Check the number of years. The payment arrives at the end of year ' + card.n + ', so the exponent is ' + card.n + '.']);
    }
    if (card.kind === 'npv' || card.kind === 'choose') {
      const flows = card.kind === 'choose' ? card.bFlows : card.flows;
      const sum = flows.reduce((s, x) => s + x, 0);
      diag.push([pv(r, flows), 'nocost', 'That is the present value of the future cash flows. NPV also subtracts what the site costs today.']);
      diag.push([sum, 'nodiscount', 'That adds the cash flows without discounting them. Each year’s cash flow has to be multiplied by its discount factor first.']);
      diag.push([flows[0] * df(r, 1) + pv(r, flows), 'discount0', 'The cost is paid today, in year 0, so it is not discounted.']);
      diag.push([flows.reduce((s, cf, t) => s + cf * (t === 0 ? 1 : df(r, t - 1)), 0), 'offbyone', 'Each cash flow is one year too close. The first cash flow arrives at the end of year 1, so its factor is 1/(1 + r).']);
      if (card.r0) diag.push([npv(card.r0, flows), 'oldrate', 'That NPV uses the old rate of ' + pct(card.r0) + '. The question asks about the new rate of ' + pct(r) + '.']);
      if (card.kind === 'choose') diag.push([card.aNpv, 'siteA', 'That is the NPV of Site A. The question asks for the NPV of the site you would pick.']);
    }
    if (card.kind === 'breakeven') {
      diag.push([card.cost / card.n, 'nodiscount', 'Dividing the cost by the number of years ignores time value. Later dollars are worth less, so the yearly cash flow has to be bigger than that.']);
      diag.push([card.cost * r, 'interestonly', 'That only covers the return on the money. The cash flow also has to pay back the cost itself.']);
    }
    for (const [v, code, msg] of diag) if (near(value, v, tol)) return { ok: false, code, msg };
    if (near(value, -card.answer, tol)) return { ok: false, code: 'sign', msg: 'The size is right but the sign is flipped. A negative NPV means the site is worth less than it costs.' };
    return { ok: false, code: 'other', msg: 'Not that one. Rebuild it row by row: each future cash flow times its discount factor, then add them and subtract the cost.' };
  }
  function pct(r) { return (Math.round(r * 1000) / 10) + '%'; }

  function judgeCard(card, entry) {
    // entry: {value, choice}
    if (card.kind === 'irr') {
      const ok = Number(entry.choice) === card.answer;
      let msg = null, code = ok ? 'ok' : 'other';
      if (!ok && Number(entry.choice) === card.simple) { code = 'simple'; msg = 'That is the yearly cash flow divided by the cost. It ignores that the cost has to be paid back too. Drag the rate until NPV reaches zero.'; }
      else if (!ok) msg = 'Drag the rate slider and watch NPV. The break-even rate is where NPV crosses zero.';
      return { ok, code, msg, numberOk: ok, choiceOk: ok };
    }
    const n = judgeNumber(card, parseMoney(entry.value));
    let choiceOk = true, cmsg = null;
    if (card.decision) {
      choiceOk = String(entry.choice || '') === card.decision;
      if (!entry.choice) { choiceOk = false; cmsg = 'Choose a decision as well.'; }
      else if (!choiceOk && card.kind === 'choose') cmsg = 'Site A pays back sooner, but Site B adds more value. When you can only pick one, pick the higher NPV.';
      else if (!choiceOk) cmsg = card.decision === 'build' ? 'An NPV above zero means the site earns more than the rate the company demands, so it gets built.' : 'An NPV below zero means the site earns less than the rate the company demands, so it gets passed over.';
    }
    const ok = n.ok && choiceOk;
    return { ok, code: n.ok ? (choiceOk ? 'ok' : 'decision') : n.code, msg: n.ok ? cmsg : n.msg, numberOk: n.ok, choiceOk };
  }

  // ---------- receipt payload ----------
  function canonical(p) {
    return JSON.stringify({ v: p.v, app: p.app, name: p.name, email: p.email, issued: p.issued, cards: p.cards });
  }
  function makePayload(name, email, log) {
    const p = { v: VERSION, app: APP, name: String(name || '').trim(), email: normEmail(email), issued: new Date().toISOString(),
      cards: log.map((c) => ({ id: c.id, solved: !!c.solved, attempts: c.attempts || 0, value: c.value == null ? null : String(c.value), choice: c.choice == null ? null : String(c.choice), at: c.at || null })) };
    p.sum = checksum(canonical(p));
    return p;
  }
  function verifyPayload(p) {
    const out = { checksumOk: false, rows: [], solved: 0, total: 8, problems: [] };
    if (!p || p.app !== APP) { out.problems.push('Not a Site Selection Desk receipt.'); return out; }
    out.checksumOk = checksum(canonical(p)) === p.sum;
    if (!out.checksumOk) out.problems.push('The checksum does not match. The receipt was edited after it was issued.');
    const cards = buildCards(p.email);
    for (const card of cards) {
      const e = (p.cards || []).find((c) => c.id === card.id) || {};
      let ok = false;
      if (e.solved) ok = judgeCard(card, { value: e.value, choice: e.choice }).ok;
      if (e.solved && !ok) out.problems.push('Card ' + card.id + ' is marked solved but its answer does not check out for this email.');
      if (ok) out.solved++;
      out.rows.push({ id: card.id, claimed: !!e.solved, verified: ok, attempts: e.attempts || 0, value: e.value, choice: e.choice, at: e.at });
    }
    return out;
  }
  function shortCode(sum) { return sum.slice(0, 4) + '-' + sum.slice(4, 8) + '-' + sum.slice(8, 12); }

  // ---------- PNG tEXt chunk ----------
  const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(bytes) { let c = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  const KEYWORD = 'rize-receipt';
  function b64encodeUtf8(s) { return btoa(unescape(encodeURIComponent(s))); }
  function b64decodeUtf8(s) { return decodeURIComponent(escape(atob(s))); }
  function addTextChunk(pngBytes, text) {
    const enc = new TextEncoder();
    const data = enc.encode(KEYWORD + '\0' + text); // latin1-safe because text is base64
    const type = enc.encode('tEXt');
    const chunk = new Uint8Array(12 + data.length);
    const dv = new DataView(chunk.buffer);
    dv.setUint32(0, data.length);
    chunk.set(type, 4); chunk.set(data, 8);
    const crcIn = new Uint8Array(4 + data.length); crcIn.set(type, 0); crcIn.set(data, 4);
    dv.setUint32(8 + data.length, crc32(crcIn));
    // insert before IEND (last 12 bytes)
    const iend = pngBytes.length - 12;
    const out = new Uint8Array(pngBytes.length + chunk.length);
    out.set(pngBytes.subarray(0, iend), 0); out.set(chunk, iend); out.set(pngBytes.subarray(iend), iend + chunk.length);
    return out;
  }
  function readTextChunk(pngBytes) {
    const dv = new DataView(pngBytes.buffer, pngBytes.byteOffset, pngBytes.byteLength);
    const sig = [137, 80, 78, 71, 13, 10, 26, 10];
    for (let i = 0; i < 8; i++) if (pngBytes[i] !== sig[i]) return null;
    let off = 8; const dec = new TextDecoder('latin1');
    while (off + 8 <= pngBytes.length) {
      const len = dv.getUint32(off); const type = dec.decode(pngBytes.subarray(off + 4, off + 8));
      if (type === 'tEXt') {
        const body = dec.decode(pngBytes.subarray(off + 8, off + 8 + len));
        const z = body.indexOf('\0');
        if (body.slice(0, z) === KEYWORD) return body.slice(z + 1);
      }
      if (type === 'IEND') break;
      off += 12 + len;
    }
    return null;
  }
  function encodeReceipt(payload) { return b64encodeUtf8(JSON.stringify(payload)); }
  function decodeReceipt(text) { try { return JSON.parse(b64decodeUtf8(text)); } catch (e) { return null; } }

  root.Desk = { APP, VERSION, seedFor, normEmail, buildCards, judgeCard, judgeNumber, parseMoney, makePayload, verifyPayload,
    shortCode, addTextChunk, readTextChunk, encodeReceipt, decodeReceipt, df, npv, pv, annuityFactor, irr, payback, pct, checksum };
})(typeof window !== 'undefined' ? window : globalThis);
