/* The Site Selection Desk, version 2: shared core for the game and the verifier.
   Seeded site generation, row-by-row judging with diagnoses, completion scoring, and the PNG receipt
   (tEXt chunk + checksum). No dependencies. Everything a grader needs is recomputed from the student's
   email, so the receipt does not have to be secret: a passing receipt needs correct answers for that
   email's numbers. */
(function (root) {
  'use strict';
  const APP = 'finan4-u5-site-selection-desk';
  const VERSION = 2;
  const SALT = 'rize-finan4-desk-v2:c41e07';
  const POINTS = 20;

  // ---------- story constants (one place to rename) ----------
  const STORY = {
    company: 'Pallino Kitchen',
    team: 'Real Estate Team',
    vp: 'Teodora Valcourt',
    vpTitle: 'VP of Real Estate',
    restaurants: 140,
    openingsPerYear: 20,
  };

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
  function seedFor(email) { return fnv1a(APP + '|v2|' + normEmail(email)); }
  function checksum(str) {
    const a = fnv1a(SALT + str), b = fnv1a(str + SALT + 'b');
    return (a.toString(36) + b.toString(36)).toUpperCase().padStart(12, '0').slice(0, 12);
  }

  // ---------- finance ----------
  const df = (r, t) => 1 / Math.pow(1 + r, t);
  const npv = (r, flows) => flows.reduce((s, cf, t) => s + cf * df(r, t), 0); // flows[0] is today
  const pvIn = (r, flows) => flows.reduce((s, cf, t) => (t === 0 ? s : s + cf * df(r, t)), 0);
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
  function pct(r) { return (Math.round(r * 1000) / 10) + '%'; }

  // ---------- places ----------
  const CITIES = ['Boise, Idaho', 'Lansing, Michigan', 'Waco, Texas', 'Dayton, Ohio', 'Fresno, California', 'Tacoma, Washington',
    'Durham, North Carolina', 'Omaha, Nebraska', 'Knoxville, Tennessee', 'Spokane, Washington', 'Tulsa, Oklahoma', 'Madison, Wisconsin',
    'Chattanooga, Tennessee', 'Reno, Nevada', 'Savannah, Georgia', 'Des Moines, Iowa', 'Fort Collins, Colorado', 'Wichita, Kansas',
    'Greenville, South Carolina', 'Albuquerque, New Mexico', 'Rochester, New York', 'Lexington, Kentucky', 'Provo, Utah', 'Mobile, Alabama'];

  // ---------- the walkthrough (same for everyone) ----------
  const WALK = { r: 0.10, flows: [-500000, 220000, 220000, 220000] };

  // ---------- quick check (same for everyone) ----------
  const QUIZ = [
    { q: 'A site’s cash flows are listed from year 0 to year 5. What is year 0?',
      options: ['Today, when the company pays to build the restaurant', 'The end of the first full year of sales', 'The year before construction starts', 'A year with no cash coming in or going out'],
      answer: 0,
      why: ['Right. Year 0 is today. The cost is paid now, before the restaurant sells anything.',
        'Year 1 is the end of the first full year of sales. Year 0 comes before that: it is today, when the company pays to build.',
        'Year 0 is not a planning year. It is today, the moment the company pays the building cost.',
        'Year 0 does have cash: the building cost, paid today.'] },
    { q: 'What is the discount factor for cash in year 0?',
      options: ['0', '1', '1 ÷ (1 + r)', 'It depends on the discount rate'],
      answer: 1,
      why: ['A factor of 0 would make today’s cash worth nothing. Cash today is worth exactly its face value, so the factor is 1.',
        'Right. 1 ÷ (1 + r)⁰ = 1, so today’s cash is counted at full value.',
        '1 ÷ (1 + r) is the factor for year 1, one year from now. For year 0 the exponent is 0, so the factor is 1.',
        'Any number raised to the power 0 is 1, so the year 0 factor is 1 at every rate.'] },
    { q: 'At a 9% required return, a site has an NPV of +$40,000. What does that tell you?',
      options: ['The site earns more than 9% a year, and adds about $40,000 of value beyond that', 'The site will make $40,000 of profit in total', 'The site earns exactly 9% a year', 'The site pays back its cost within a year'],
      answer: 0,
      why: ['Right. A positive NPV means the site beats the 9% the company requires, and the NPV is the extra value in today’s dollars.',
        'NPV is not total profit. It is the value the site adds, in today’s dollars, after earning the required 9%.',
        'A site that earns exactly 9% has an NPV of zero. A positive NPV means it earns more than 9%.',
        'NPV does not measure how fast a site pays back. That is a different measure, called payback.'] },
  ];

  // ---------- site generation ----------
  function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
  function between(rng, lo, hi, step) { const n = Math.floor((hi - lo) / step) + 1; return lo + step * Math.floor(rng() * n); }

  function buildSites(email) {
    const rng = mulberry32(seedFor(email));
    const rates = [0.07, 0.08, 0.09, 0.10, 0.11];
    const cities = CITIES.slice();
    for (let i = cities.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cities[i], cities[j]] = [cities[j], cities[i]]; }
    const sites = [];
    // Site 1: level stream, guided table, positive NPV
    {
      const r = pick(rng, rates), n = 5, a = between(rng, 240000, 400000, 10000);
      const cost = round10k(a * annuityFactor(r, n) * (0.74 + 0.10 * rng()));
      const flows = [-cost, ...Array(n).fill(a)];
      sites.push({ id: 's1', kind: 'guided', city: cities[0], r, flows, answer: npv(r, flows), decision: 'build' });
    }
    // Site 2: ramp-up, factors shown, positive NPV
    {
      const r = pick(rng, rates), a = between(rng, 300000, 480000, 10000);
      const f = [round1k(0.5 * a), round1k(0.8 * a), a, a, a, a];
      const cost = round10k(pvIn(r, [0, ...f]) * (0.74 + 0.10 * rng()));
      const flows = [-cost, ...f];
      sites.push({ id: 's2', kind: 'npv', city: cities[1], r, flows, answer: npv(r, flows), decision: 'build', showFactors: true });
    }
    // Site 3: positive at the old rate, negative at a rate 4 points higher; factors hidden
    {
      const r0 = pick(rng, [0.06, 0.07, 0.08]), r = r0 + 0.04, n = 6, a = between(rng, 220000, 360000, 10000);
      const lo = a * annuityFactor(r, n), hi = a * annuityFactor(r0, n);
      const cost = round10k(lo + (hi - lo) * (0.35 + 0.3 * rng()));
      const flows = [-cost, ...Array(n).fill(a)];
      sites.push({ id: 's3', kind: 'npv', city: cities[2], r, r0, flows, answer: npv(r, flows), decision: 'pass', showFactors: false, oldNpv: npv(r0, flows) });
    }
    // Site 4: A pays back faster, B has the higher NPV
    {
      const r = pick(rng, [0.08, 0.09, 0.10]);
      const cost = between(rng, 900000, 1300000, 50000);
      const aFlows = [-cost, round10k(cost * 0.50), round10k(cost * 0.45), round10k(cost * 0.30), round10k(cost * 0.10)];
      const bAnn = round10k(cost * (0.27 + 0.03 * rng()));
      const bFlows = [-cost, ...Array(6).fill(bAnn)];
      sites.push({ id: 's4', kind: 'choose', city: cities[3], r, aFlows, bFlows, answer: npv(r, bFlows), aNpv: npv(r, aFlows), decision: 'B',
        aPayback: payback(aFlows), bPayback: payback(bFlows) });
    }
    // Site 5: break-even rate (IRR), multiple choice with a live rate slider
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
      sites.push({ id: 's5', kind: 'irr', city: cities[4], r, flows, irrExact: exact, options: opts, answer: right, simple, decision: null });
    }
    return sites;
  }

  const STEPS = [
    { id: 'walk', label: 'Worked example' },
    { id: 'quiz', label: 'Quick check' },
    { id: 's1', label: 'Site 1' },
    { id: 's2', label: 'Site 2' },
    { id: 's3', label: 'Site 3' },
    { id: 's4', label: 'Site 4' },
    { id: 's5', label: 'Site 5' },
    { id: 'memo', label: 'Your note' },
  ];
  const MEMO_MIN_WORDS = 30;
  const wordCount = (s) => (String(s || '').trim().match(/\S+/g) || []).length;

  // ---------- parsing ----------
  function parseMoney(s) {
    if (s == null) return NaN;
    let t = String(s).trim().toLowerCase().replace(/[\s,$＄]/g, '').replace(/[−–]/g, '-');
    let neg = false;
    if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
    if (t.startsWith('-')) { neg = !neg; t = t.slice(1); }
    let mult = 1;
    if (t.endsWith('k')) { mult = 1e3; t = t.slice(0, -1); }
    else if (t.endsWith('m')) { mult = 1e6; t = t.slice(0, -1); }
    if (!/^\d*\.?\d+$/.test(t)) return NaN;
    const v = parseFloat(t) * mult;
    return neg ? -v : v;
  }
  const money = (x) => { const v = Math.round(x); return (v < 0 ? '−$' : '$') + Math.abs(v).toLocaleString('en-US'); };
  const near = (a, b, tol) => Math.abs(a - b) <= tol;

  // ---------- judging one present value row ----------
  // Tolerance: within 0.1% of the cash flow, so discount factors rounded to 4 places always pass.
  function judgeRow(cf, r, t, value) {
    if (!isFinite(value)) return { ok: false, code: 'unreadable', msg: 'Type a dollar amount, like 282,921.' };
    const f = df(r, t), exact = cf * f, tol = Math.max(2, 0.001 * Math.abs(cf));
    if (near(value, exact, tol)) return { ok: true, code: 'ok' };
    const how = `Present value = cash flow × discount factor = ${money(cf)} × ${f.toFixed(4)}.`;
    if (near(value, cf, tol)) return { ok: false, code: 'nodiscount', msg: `That is the cash flow itself. ${how}` };
    if (near(value, cf * Math.pow(1 + r, t), tol)) return { ok: false, code: 'compounded', msg: `That grows the cash instead of shrinking it. Future cash is worth less today, so multiply by the factor (or divide by (1 + r)^${t}). ${how}` };
    if (t > 1 && near(value, cf * df(r, t - 1), tol)) return { ok: false, code: 'rowabove', msg: `That uses the factor from year ${t - 1}. ${how}` };
    if (near(value, cf * df(r, t + 1), tol)) return { ok: false, code: 'rowbelow', msg: `That uses the factor from year ${t + 1}. ${how}` };
    if (near(value, -exact, tol)) return { ok: false, code: 'sign', msg: 'The size is right but the sign is flipped. Cash coming in is positive.' };
    if (near(value, exact, 0.01 * Math.abs(cf))) return { ok: false, code: 'close', msg: `Close. Keep four decimal places in the factor (${f.toFixed(4)}) and round only at the end.` };
    return { ok: false, code: 'other', msg: how };
  }

  // ---------- judging an NPV ----------
  function npvTol(flows) { return Math.max(50, 0.001 * flows.reduce((s, x) => s + Math.abs(x), 0)); }
  function judgeNpv(flows, r, value, opts) {
    opts = opts || {};
    if (!isFinite(value)) return { ok: false, code: 'unreadable', msg: 'Type a dollar amount, like 247,594 or −38,000.' };
    const exact = npv(r, flows), tol = npvTol(flows), cost = -flows[0], inflow = pvIn(r, flows);
    if (near(value, exact, tol)) return { ok: true, code: 'ok' };
    const diag = [
      [inflow, 'nocost', `That is the value today of the cash coming in (${money(inflow)}). NPV also subtracts the cost paid today: ${money(inflow)} − ${money(cost)}.`],
      [inflow + cost, 'addcost', `It looks like the cost was added instead of subtracted. The cost is cash going out today, so NPV = ${money(inflow)} − ${money(cost)}.`],
      [flows.reduce((s, x) => s + x, 0), 'nodiscount', 'That adds the cash flows without discounting them. Multiply each year’s cash flow by its discount factor first.'],
      [flows[0] * df(r, 1) + inflow, 'discount0', 'The cost is paid today, in year 0, so it is not discounted. Its factor is 1.'],
      [flows.reduce((s, cf, t) => s + cf * (t === 0 ? 1 : df(r, t - 1)), 0), 'offbyone', 'Each cash flow is one year too close. Year 1 cash arrives one year from now, so its factor is 1 ÷ (1 + r).'],
      [flows.reduce((s, cf, t) => s + cf * df(r, t + 1), 0), 'offbyone2', 'Each cash flow is discounted one year too many. Year 0 is today (factor 1) and year 1 uses 1 ÷ (1 + r).'],
    ];
    if (opts.r0) diag.push([npv(opts.r0, flows), 'oldrate', `That NPV uses the old rate of ${pct(opts.r0)}. Recompute every discount factor at the new rate, ${pct(r)}.`]);
    if (opts.other != null) diag.push([opts.other, 'otherSite', opts.otherMsg || 'That is the NPV of the other site.']);
    for (const [v, code, msg] of diag) if (near(value, v, tol)) return { ok: false, code, msg };
    if (near(value, -exact, tol)) return { ok: false, code: 'sign', msg: 'The size is right but the sign is flipped. If the cash coming in is worth more than the cost, NPV is positive.' };
    if (near(value, exact, 0.01 * cost)) return { ok: false, code: 'close', msg: 'Close. Keep four decimal places in each discount factor and round only at the end.' };
    return { ok: false, code: 'other', msg: `Work it row by row: multiply each year’s cash flow by its discount factor, add those up (${flows.length - 1} rows), then subtract the cost of ${money(cost)}. The help buttons below can show you the first row.` };
  }
  function decisionMsg(site, choice) {
    if (!choice) return 'Choose a decision as well.';
    if (site.kind === 'choose') return 'Site A pays back sooner, but Site B adds more value. When you can take only one, take the higher NPV.';
    return site.decision === 'build'
      ? 'This NPV is above zero, so the site earns more than the rate we require. That means build it.'
      : 'This NPV is below zero, so the site earns less than the rate we require. That means pass on it.';
  }

  // entry: {value, choice, rows}
  function judgeSite(site, entry) {
    entry = entry || {};
    if (site.kind === 'irr') {
      const ok = Number(entry.choice) === site.answer;
      let msg = null, code = ok ? 'ok' : 'other';
      if (!ok && Number(entry.choice) === site.simple) { code = 'simple'; msg = 'That is the yearly cash divided by the cost. It ignores that the cost itself has to be earned back. Drag the rate until the NPV reaches zero.'; }
      else if (!ok) msg = 'Drag the rate slider and watch the NPV. The break-even rate is where the NPV crosses zero.';
      return { ok, code, msg, numberOk: ok, choiceOk: ok };
    }
    if (site.kind === 'guided') {
      const rows = entry.rows || [];
      const rowRes = site.flows.map((cf, t) => (t === 0 ? { ok: true } : judgeRow(cf, site.r, t, parseMoney(rows[t]))));
      const rowsOk = rowRes.every((x) => x.ok);
      const choiceOk = String(entry.choice || '') === site.decision;
      const firstBad = rowRes.findIndex((x) => !x.ok);
      let msg = null, code = 'ok';
      if (!rowsOk) { code = 'row' + firstBad + ':' + rowRes[firstBad].code; msg = `Year ${firstBad}: ${rowRes[firstBad].msg}`; }
      else if (!choiceOk) { code = 'decision'; msg = decisionMsg(site, entry.choice); }
      return { ok: rowsOk && choiceOk, code, msg, rowRes, numberOk: rowsOk, choiceOk };
    }
    const flows = site.kind === 'choose' ? site.bFlows : site.flows;
    const n = judgeNpv(flows, site.r, parseMoney(entry.value), site.kind === 'choose'
      ? { other: site.aNpv, otherMsg: 'That is the NPV of Site A, which the memo already gives you. The question asks for the NPV of Site B.' }
      : { r0: site.r0 });
    const choiceOk = String(entry.choice || '') === site.decision;
    const ok = n.ok && choiceOk;
    return { ok, code: n.ok ? (choiceOk ? 'ok' : 'decision') : n.code, msg: n.ok ? (choiceOk ? null : decisionMsg(site, entry.choice)) : n.msg, numberOk: n.ok, choiceOk };
  }
  function judgeQuiz(answers) {
    const res = QUIZ.map((q, i) => ({ ok: Number(answers && answers[i]) === q.answer }));
    return { ok: res.every((x) => x.ok), res };
  }
  function judgeMemo(text) {
    const w = wordCount(text);
    return { ok: w >= MEMO_MIN_WORDS, words: w };
  }

  // ---------- receipt payload ----------
  function canonical(p) {
    return JSON.stringify({ v: p.v, app: p.app, name: p.name, email: p.email, issued: p.issued, steps: p.steps, memo: p.memo });
  }
  function makePayload(name, email, log, memo) {
    const p = { v: VERSION, app: APP, name: String(name || '').trim(), email: normEmail(email), issued: new Date().toISOString(),
      steps: STEPS.map((s) => {
        const l = log[s.id] || {};
        return { id: s.id, done: !!l.done, attempts: l.attempts || 0, help: l.help || 0,
          value: l.value == null ? null : String(l.value), choice: l.choice == null ? null : String(l.choice),
          rows: Array.isArray(l.rows) ? l.rows.map((x) => (x == null ? null : String(x))) : null,
          answers: Array.isArray(l.answers) ? l.answers.map((x) => (x == null ? null : Number(x))) : null, at: l.at || null };
      }),
      memo: String(memo || '') };
    p.sum = checksum(canonical(p));
    return p;
  }
  function pointsFor(doneCount) { return Math.round((POINTS * doneCount / STEPS.length) * 2) / 2; }
  function verifyPayload(p) {
    const out = { checksumOk: false, rows: [], done: 0, total: STEPS.length, points: 0, problems: [] };
    if (!p || p.app !== APP) { out.problems.push('This is not a Site Selection Desk receipt.'); return out; }
    if (p.v !== VERSION) { out.problems.push('This receipt comes from an older version of the desk (version ' + p.v + '). Ask the student to download a new receipt.'); return out; }
    out.checksumOk = checksum(canonical(p)) === p.sum;
    if (!out.checksumOk) out.problems.push('The checksum does not match, so the receipt was edited after it was issued.');
    const sites = buildSites(p.email);
    for (const s of STEPS) {
      const e = (p.steps || []).find((x) => x.id === s.id) || {};
      let ok = false;
      if (s.id === 'walk') ok = !!e.done;
      else if (s.id === 'quiz') ok = !!e.done && judgeQuiz(e.answers || []).ok;
      else if (s.id === 'memo') ok = !!e.done && judgeMemo(p.memo).ok;
      else { const site = sites.find((x) => x.id === s.id); ok = !!e.done && judgeSite(site, { value: e.value, choice: e.choice, rows: e.rows }).ok; }
      if (e.done && !ok) out.problems.push(s.label + ' is marked complete, but its answer does not check out for this email.');
      if (ok) out.done++;
      out.rows.push({ id: s.id, label: s.label, claimed: !!e.done, verified: ok, attempts: e.attempts || 0, help: e.help || 0, at: e.at });
    }
    out.points = pointsFor(out.done);
    return out;
  }
  function shortCode(sum) { return sum.slice(0, 4) + '-' + sum.slice(4, 8) + '-' + sum.slice(8, 12); }

  // ---------- safe calculator ----------
  // Accepts numbers (commas allowed), + - * / ^ ( ), × ÷ −, and % as "divide by 100". No eval.
  function calc(expr) {
    const src = String(expr || '').replace(/[×xX]/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-').replace(/[$＄\s]/g, '');
    if (!src) return { ok: false, err: 'Type an expression, like 330000*0.9259 or 330000/(1.08)^5.' };
    const toks = []; let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (/[0-9.]/.test(c)) {
        let j = i; while (j < src.length && /[0-9.,]/.test(src[j])) j++;
        const num = parseFloat(src.slice(i, j).replace(/,/g, ''));
        if (!isFinite(num)) return { ok: false, err: 'One of the numbers cannot be read.' };
        toks.push({ t: 'n', v: num }); i = j;
      } else if ('+-*/^()%'.includes(c)) { toks.push({ t: c }); i++; }
      else return { ok: false, err: 'The calculator understands numbers and + − × ÷ ^ ( ) only.' };
    }
    let p = 0;
    const peek = () => toks[p], eat = () => toks[p++];
    function primary() {
      const k = eat();
      if (!k) throw new Error('The expression ends too early.');
      if (k.t === 'n') return k.v;
      if (k.t === '(') { const v = sum(); const c = eat(); if (!c || c.t !== ')') throw new Error('A closing parenthesis is missing.'); return v; }
      if (k.t === '-') return -power();
      if (k.t === '+') return power();
      throw new Error('Something is out of place near "' + k.t + '".');
    }
    function postfix() { let v = primary(); while (peek() && peek().t === '%') { eat(); v /= 100; } return v; }
    function power() { const b = postfix(); if (peek() && peek().t === '^') { eat(); return Math.pow(b, power()); } return b; }
    function prod() { let v = power(); while (peek() && (peek().t === '*' || peek().t === '/')) { const o = eat().t; const w = power(); v = o === '*' ? v * w : v / w; } return v; }
    function sum() { let v = prod(); while (peek() && (peek().t === '+' || peek().t === '-')) { const o = eat().t; const w = prod(); v = o === '+' ? v + w : v - w; } return v; }
    try {
      const v = sum();
      if (p !== toks.length) throw new Error('Something is out of place near the end.');
      if (!isFinite(v)) throw new Error('That does not give a number (dividing by zero?).');
      return { ok: true, value: v };
    } catch (e) { return { ok: false, err: e.message }; }
  }

  // ---------- PNG tEXt chunk ----------
  const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(bytes) { let c = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  const KEYWORD = 'rize-receipt';
  function b64encodeUtf8(s) { return btoa(unescape(encodeURIComponent(s))); }
  function b64decodeUtf8(s) { return decodeURIComponent(escape(atob(s))); }
  function addTextChunk(pngBytes, text) {
    const enc = new TextEncoder();
    const data = enc.encode(KEYWORD + '\0' + text);
    const type = enc.encode('tEXt');
    const chunk = new Uint8Array(12 + data.length);
    const dv = new DataView(chunk.buffer);
    dv.setUint32(0, data.length);
    chunk.set(type, 4); chunk.set(data, 8);
    const crcIn = new Uint8Array(4 + data.length); crcIn.set(type, 0); crcIn.set(data, 4);
    dv.setUint32(8 + data.length, crc32(crcIn));
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

  root.Desk = { APP, VERSION, POINTS, STORY, STEPS, QUIZ, WALK, MEMO_MIN_WORDS, seedFor, normEmail, buildSites, judgeSite, judgeRow, judgeNpv,
    judgeQuiz, judgeMemo, wordCount, parseMoney, money, makePayload, verifyPayload, pointsFor, shortCode, addTextChunk, readTextChunk,
    encodeReceipt, decodeReceipt, df, npv, pvIn, annuityFactor, irr, payback, pct, checksum, calc };
})(typeof window !== 'undefined' ? window : globalThis);
