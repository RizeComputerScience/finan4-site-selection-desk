/* The Site Selection Desk: FINAN IV Unit 5 (NPV). Config for lib/coursedev/desk-engine.
   Characters kept from versions 1 to 4 (unique in the course): Pallino Kitchen, Teodora Valcourt (VP of Real Estate).
   Version 5 (2026-11-12) moves this desk from its standalone desk-core.js onto the shared engine, on the Unit 9 pattern
   (process/standards/interactive-assignments.md rules 25 to 39; u05/TEACHING-MAP.md; design/scope-2026-11-11.md):
   - The reading teaches; the desk has no walkthrough of its own (rule 32).
   - Every task states the problem first, then shows a worked example drawn as the SAME table the student fills, read-only, with a
     different company and numbers (h.ladder, rule 29). A faded step gives most lines; the next step leaves every line blank.
   - Kept: NPV year by year, the decision rule, NPV of equal yearly cash with Unit 4's annuity factor, payback as a whole year,
     IRR as the rate where NPV is zero.
   - Cut from the desk: the walkthrough, the IRR rate slider (the NPV profile idea), fractional payback, the rate-rise site.
   The standalone version 4 is in v2-archive/. seedVersion 3 and version 5: progress and receipts from version 4 do not carry over. */
(function (root) {
  'use strict';
  const QUIZ = [
    { title: 'Quick check: payback or NPV?',
      q: 'Teodora can lease only one of two sites. Site A pays back in year 2 and has an NPV of $60,000. Site B pays back in year 4 and has an NPV of $140,000. Which should Pallino build?',
      options: ['Site B, because it adds more value today', 'Site A, because it pays back sooner', 'Both, by splitting the lease', 'Neither, because both take years to pay back'],
      answer: 0,
      why: ['Right. When only one site can go ahead, build the one with the higher NPV. Payback ignores the time value of money and the cash after payback.',
        'Payback is faster at Site A, but it ignores the cash that comes after payback. Site B adds $80,000 more value today, so NPV says Site B.',
        'Pallino can lease only one of the two sites. Pick the one that adds more value today.',
        'Both NPVs are above zero, so both sites earn more than Pallino requires. The question is which one adds more.'] },
    { title: 'Exam-style question',
      q: 'A project costs $60,000 today and brings in $20,000 at the end of each of the next 4 years. At an 8% required return, what is its NPV?',
      options: ['$6,243', '$20,000', '$66,243', '−$8,458'],
      answer: 0,
      why: ['Right. The annuity factor is (1 − 1.08⁻⁴) ÷ 0.08 = 3.3121. Value today = $20,000 × 3.3121 = $66,243, and NPV = $66,243 − $60,000 = $6,243. Exam questions look like this one.',
        '$20,000 adds the four payments with no discounting. Multiply $20,000 by the annuity factor, 3.3121, then subtract the $60,000 cost.',
        '$66,243 is the value today of the cash coming in. Subtract the $60,000 cost to get the NPV.',
        '−$8,458 uses the annuity factor for 3 years. The cash arrives for 4 years: (1 − 1.08⁻⁴) ÷ 0.08 = 3.3121.'] },
  ];

  const STEPS = [
    { id: 'yr1', label: 'Year by year', kind: 'task' },
    { id: 'yr2', label: 'Build or pass?', kind: 'task' },
    { id: 'af1', label: 'Equal cash', kind: 'task' },
    { id: 'af2', label: 'Airport lease', kind: 'task' },
    { id: 'pb', label: 'Payback', kind: 'task' },
    { id: 'q1', label: 'Quick check', kind: 'check', quiz: 0 },
    { id: 'irr1', label: 'NPV at the IRR', kind: 'task' },
    { id: 'irr2', label: 'Predict, then check', kind: 'task' },
    { id: 'q2', label: 'Exam-style question', kind: 'check', quiz: 1 },
    { id: 'note', label: 'Your note', kind: 'note' },
  ];

  const CITIES = ['Boise, Idaho', 'Lansing, Michigan', 'Waco, Texas', 'Dayton, Ohio', 'Fresno, California', 'Tacoma, Washington',
    'Durham, North Carolina', 'Omaha, Nebraska', 'Knoxville, Tennessee', 'Spokane, Washington', 'Tulsa, Oklahoma', 'Madison, Wisconsin',
    'Chattanooga, Tennessee', 'Reno, Nevada', 'Savannah, Georgia', 'Des Moines, Iowa', 'Fort Collins, Colorado', 'Wichita, Kansas'];
  // Every site's rate. 10% is left out: the reading and every worked example use it.
  const RATES = [0.07, 0.08, 0.09, 0.11, 0.12];
  const r4 = (x) => Math.round(x * 10000) / 10000;
  const af = (r, n) => (1 - Math.pow(1 + r, -n)) / r;

  function buildTasks(rng, h) {
    const T = [], k10 = (x) => h.round(x, 10000);
    const cities = CITIES.slice();
    for (let i = cities.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cities[i], cities[j]] = [cities[j], cities[i]]; }
    // yr1, yr2: three years of rising cash on a three-year lease. NPV at least 3% of the cost away from zero.
    function yr(id, city, sign) {
      for (;;) {
        const r = h.pick(rng, RATES), f1 = h.between(rng, 100000, 180000, 10000), f2 = f1 + h.between(rng, 10000, 40000, 10000), f3 = f2 + h.between(rng, 10000, 40000, 10000);
        const flows = [f1, f2, f3], v = flows.map((f, i) => f / Math.pow(1 + r, i + 1)), sum = v[0] + v[1] + v[2];
        const pos = sign == null ? rng() < 0.5 : sign > 0;
        const cost = k10(sum * (pos ? 0.84 + 0.1 * rng() : 1.05 + 0.1 * rng())), npv = sum - cost;
        if (Math.abs(npv) < 0.03 * cost) continue;
        return { id, city, r, cost, flows, v, sum, answer: npv, decision: id.endsWith('2') ? (npv > 0 ? 'build' : 'pass') : null };
      }
    }
    T.push(yr('yr1', cities[0], 1));
    T.push(yr('yr2', cities[1], null));
    // af1, af2: the same cash every year for n years. Value today = yearly cash × the annuity factor, rounded to 4 places as students do.
    function lev(id, city, sign) {
      for (;;) {
        const r = h.pick(rng, RATES), n = h.between(rng, 5, 8, 1), a = h.between(rng, 120000, 260000, 10000), f = r4(af(r, n)), val = a * f;
        const pos = sign == null ? rng() < 0.5 : sign > 0;
        const cost = k10(val * (pos ? 0.84 + 0.1 * rng() : 1.05 + 0.1 * rng())), npv = val - cost;
        if (Math.abs(npv) < 0.03 * cost) continue;
        return { id, city, r, n, a, f, top: 1 - Math.pow(1 + r, -n), val, cost, answer: npv, decision: id.endsWith('2') ? (npv > 0 ? 'build' : 'pass') : null };
      }
    }
    T.push(lev('af1', cities[2], 1));
    T.push(lev('af2', cities[3], null));
    // pb: four years of rising cash; the running total first turns positive in year 3 or 4 and never lands exactly on zero.
    for (;;) {
      const cost = h.between(rng, 400000, 700000, 50000), base = h.between(rng, 80000, 140000, 10000);
      const flows = [base, base + h.between(rng, 20000, 60000, 10000)]; flows.push(flows[1] + h.between(rng, 10000, 50000, 10000)); flows.push(flows[2] + h.between(rng, 0, 40000, 10000));
      const run = []; flows.reduce((s, f) => { run.push(s + f); return s + f; }, -cost);
      const yr = run.findIndex((x) => x > 0) + 1;
      if ((yr === 3 || yr === 4) && !run.includes(0)) { T.push({ id: 'pb', city: cities[4], cost, flows, run, answer: yr }); break; }
    }
    // irr1, irr2: two years of cash built so that the NPV at a whole-percent IRR is exactly $0.
    function two(cost, w, i) { const f1 = Math.round(w * cost * (1 + i)), f2 = Math.round((1 - w) * cost * (1 + i) * (1 + i)); return [f1, f2]; }
    { const cost = h.pick(rng, [200000, 300000, 400000, 500000]), w = h.pick(rng, [0.4, 0.5, 0.6]), i = h.between(rng, 11, 16, 1) / 100;
      const flows = two(cost, w, i), v = flows.map((f, k) => f / Math.pow(1 + i, k + 1));
      T.push({ id: 'irr1', city: cities[5], cost, flows, irr: i, rate: i, v, answer: v[0] + v[1] - cost }); }
    for (;;) {
      const cost = h.pick(rng, [200000, 300000, 400000, 500000]), w = h.pick(rng, [0.4, 0.5, 0.6]), i = h.between(rng, 6, 16, 1) / 100, r = h.pick(rng, RATES);
      if (Math.abs(i - r) < 0.03) continue;
      const flows = two(cost, w, i), v = flows.map((f, k) => f / Math.pow(1 + r, k + 1)), npv = v[0] + v[1] - cost;
      T.push({ id: 'irr2', city: cities[6], cost, flows, irr: i, rate: r, v, answer: npv, decision: npv > 0 ? 'pos' : 'neg' }); break;
    }
    return T;
  }

  const m = (x) => root.DeskEngine.h.money(x);
  const p = (r) => root.DeskEngine.h.pct(r);
  const f4 = (x) => x.toFixed(4);
  const g = (r) => (1 + r).toFixed(2);           // 1.08, 1.10
  const sup = (n) => ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'][n];
  const neg = (x) => `−${m(x)}`;

  /* Lines for each task. mode 'ex' is the worked example (every calculation shows its numbers), 'faded' gives the lines marked as
     given, 'own' leaves every line blank and names the lines a calculation uses. The worked example calls the same function on other
     numbers, so the example and the student's table always have the same rows. */
  const LINES = {
    yr: (cost, flows, r, mode) => {
      const v = flows.map((f, i) => f / Math.pow(1 + r, i + 1)), sum = v[0] + v[1] + v[2], given = mode === 'faded' ? [0, 1, 3] : mode === 'ex' ? [0, 1, 2, 3, 4] : [];
      return flows.map((f, i) => ({ label: `Year ${i + 1}, value today`, calc: `${m(f)} ÷ ${g(r)}${sup(i + 1)}`, value: v[i], input: !given.includes(i) }))
        .concat([{ label: 'Value today, all three years', calc: mode === 'own' ? 'Year 1 + year 2 + year 3' : `${m(v[0])} + ${m(v[1])} + ${mode === 'ex' ? m(v[2]) : 'year 3'}`, value: sum, input: !given.includes(3) },
          { label: 'NPV', calc: mode === 'own' ? `All three years − ${m(cost)}` : `${m(sum)} − ${m(cost)}`, value: sum - cost, input: !given.includes(4) }]);
    },
    af: (cost, a, n, r, mode) => {
      const f = r4(af(r, n)), val = a * f;
      return [
        { label: '1 − (1 + r)<sup>−n</sup>', calc: `In Desmos: <code>1-${g(r)}^-${n}</code>`, value: 1 - Math.pow(1 + r, -n), fmt: 'factor', input: mode === 'own' },
        { label: 'Annuity factor', calc: `Next line: <code>ans/${r}</code>`, value: f, fmt: 'factor', input: mode === 'own' },
        { label: 'Value today of the cash', calc: `${m(a)} × ${mode === 'own' ? 'the annuity factor' : f4(f)}`, value: val, input: mode !== 'ex' },
        { label: 'NPV', calc: mode === 'ex' ? `${m(val)} − ${m(cost)}` : `Value today − ${m(cost)}`, value: val - cost, input: mode !== 'ex' }];
    },
    pb: (cost, flows, mode) => {
      const run = []; flows.reduce((s, f) => { run.push(s + f); return s + f; }, -cost);
      const yr = run.findIndex((x) => x > 0) + 1;
      return flows.map((f, i) => ({ label: `Total after year ${i + 1}`,
        calc: i === 0 ? `${neg(cost)} + ${m(f)}` : mode === 'own' ? `After year ${i} + ${m(f)}` : `${m(run[i - 1])} + ${m(f)}`, value: run[i], input: mode !== 'ex' }))
        .concat([{ label: 'Payback year', calc: 'First year the running total is above $0', value: yr, fmt: 'num', input: mode !== 'ex' }]);
    },
    irr: (cost, flows, rate, mode) => {
      const v = flows.map((f, k) => f / Math.pow(1 + rate, k + 1));
      return [
        { label: `Year 1 at ${p(rate)}`, calc: `${m(flows[0])} ÷ ${g(rate)}¹`, value: v[0], input: mode === 'own' },
        { label: `Year 2 at ${p(rate)}`, calc: `${m(flows[1])} ÷ ${g(rate)}²`, value: v[1], input: mode !== 'ex' },
        { label: `NPV at ${p(rate)}`, calc: mode === 'ex' ? `${m(v[0])} + ${m(v[1])} − ${m(cost)}` : `Year 1 + year 2 − ${m(cost)}`, value: v[0] + v[1] - cost, input: mode !== 'ex' }];
    },
  };
  // Built on first use: config.js loads before the engine, so money() is not available at load time. Every example is at 10%, a rate no student gets.
  const EXAMPLES = () => ({
    yr1: { cap: 'A taco chain’s site costs $250,000 and brings in $100,000, $110,000 and $120,000 in years 1 to 3, at 10%', lines: LINES.yr(250000, [100000, 110000, 120000], 0.10, 'ex'),
      after: 'The NPV is above zero, so the taco chain builds.' },
    yr2: { cap: 'A burger chain’s site costs $300,000 and brings in $90,000, $110,000 and $130,000 in years 1 to 3, at 10%', lines: LINES.yr(300000, [90000, 110000, 130000], 0.10, 'ex'),
      after: 'The NPV is below zero, so the burger chain passes.' },
    af1: { cap: 'A taco chain’s site costs $500,000 and brings in $120,000 a year for 6 years, at 10%', lines: LINES.af(500000, 120000, 6, 0.10, 'ex') },
    af2: { cap: 'A burger chain’s site costs $400,000 and brings in $90,000 a year for 5 years, at 10%', lines: LINES.af(400000, 90000, 5, 0.10, 'ex'),
      after: 'The NPV is below zero, so the burger chain passes.' },
    pb: { cap: 'A bakery chain’s kiosk costs $200,000 and brings in $120,000, $100,000, $60,000 and $40,000 in years 1 to 4', lines: LINES.pb(200000, [120000, 100000, 60000, 40000], 'ex'),
      after: 'The running total first goes above $0 after year 2, so the kiosk pays back in year 2.' },
    irr1: { cap: 'A bakery chain’s kiosk costs $100,000 and brings in $55,000 and $60,500 in years 1 and 2. Its IRR is 10%.', lines: LINES.irr(100000, [55000, 60500], 0.10, 'ex'),
      after: 'At the IRR, the value today of the cash coming in equals the cost, so the NPV is $0.' },
    irr2: { cap: 'The same kiosk, IRR 10%, for an owner who requires 8%', lines: LINES.irr(100000, [55000, 60500], 0.08, 'ex'),
      after: 'The owner requires less than the IRR, so the NPV is above zero, as predicted.' },
  });

  function linesFor(t) {
    if (t.id === 'yr1') return LINES.yr(t.cost, t.flows, t.r, 'faded');
    if (t.id === 'yr2') return LINES.yr(t.cost, t.flows, t.r, 'own');
    if (t.id === 'af1') return LINES.af(t.cost, t.a, t.n, t.r, 'faded');
    if (t.id === 'af2') return LINES.af(t.cost, t.a, t.n, t.r, 'own');
    if (t.id === 'pb') return LINES.pb(t.cost, t.flows, 'own');
    if (t.id === 'irr1') return LINES.irr(t.cost, t.flows, t.rate, 'faded');
    if (t.id === 'irr2') return LINES.irr(t.cost, t.flows, t.rate, 'own');
  }

  const BUILD = (t, which) => ({ legend: `Should Pallino build ${which}?`, options: [['build', 'Build it: the NPV is above zero'], ['pass', 'Pass: the NPV is below zero']] });
  const PROBLEM = {
    yr1: (t) => ({ title: 'A former bank branch', place: `${t.city}. A bank branch on a busy corner, with its drive-thru lane still in place.`,
      body: `<p>The landlord offers a three-year lease. The site costs <b>${m(t.cost)}</b> today and brings in <b>${m(t.flows[0])}</b>, <b>${m(t.flows[1])}</b> and <b>${m(t.flows[2])}</b> in years 1 to 3. Pallino requires <b>${p(t.r)}</b>. What is the NPV? Most lines are done for you.</p>` }),
    yr2: (t) => ({ title: 'Build or pass?', place: `${t.city}. A new shopping center still signing tenants, so sales start slow.`,
      body: `<p>On a three-year lease, the site costs <b>${m(t.cost)}</b> today and brings in <b>${m(t.flows[0])}</b>, <b>${m(t.flows[1])}</b> and <b>${m(t.flows[2])}</b> in years 1 to 3. Pallino requires <b>${p(t.r)}</b>. Should Pallino build it?</p>`,
      choice: BUILD(t, 'this site') }),
    af1: (t) => ({ title: 'The same cash every year', place: `${t.city}. A space across from a twelve-screen movie theater, on a ${t.n}-year lease.`,
      body: `<p>The site costs <b>${m(t.cost)}</b> today and brings in <b>${m(t.a)}</b> a year for <b>${t.n} years</b>. Pallino requires <b>${p(t.r)}</b>. What is the NPV? The annuity factor is done for you.</p>` }),
    af2: (t) => ({ title: 'An airport lease', place: `${t.city}. A concourse space at the regional airport, on a ${t.n}-year lease.`,
      body: `<p>The site costs <b>${m(t.cost)}</b> today and brings in <b>${m(t.a)}</b> a year for <b>${t.n} years</b>. Pallino requires <b>${p(t.r)}</b>. Should Pallino build it?</p>`,
      choice: BUILD(t, 'the airport site') }),
    pb: (t) => ({ title: 'When does it pay back?', place: `${t.city}. A storefront by a college campus. Teodora’s boss asks how soon it pays back.`,
      body: `<p>The site costs <b>${m(t.cost)}</b> today and brings in <b>${m(t.flows[0])}</b>, <b>${m(t.flows[1])}</b>, <b>${m(t.flows[2])}</b> and <b>${m(t.flows[3])}</b> in years 1 to 4. In which year does it pay back its cost?</p>` }),
    irr1: (t) => ({ title: 'The NPV at the IRR', place: `${t.city}. A drive-thru pad in a grocery store’s parking lot.`,
      body: `<p>The pad costs <b>${m(t.cost)}</b> and brings in <b>${m(t.flows[0])}</b> in year 1 and <b>${m(t.flows[1])}</b> in year 2. The finance team puts its IRR at <b>${p(t.irr)}</b>. Check them: what is the NPV at ${p(t.irr)}? Year 1 is done for you.</p>` }),
    irr2: (t) => ({ title: 'Predict, then check', place: `${t.city}. A stall in a new food hall.`,
      body: `<p>The stall costs <b>${m(t.cost)}</b> and brings in <b>${m(t.flows[0])}</b> in year 1 and <b>${m(t.flows[1])}</b> in year 2. Its IRR is <b>${p(t.irr)}</b>, and Pallino requires <b>${p(t.rate)}</b>. Predict whether the NPV is above zero, then check with the table.</p>`,
      choice: { legend: `Before you calculate: will the NPV at ${p(t.rate)} be above or below zero?`, options: [['pos', 'Above zero'], ['neg', 'Below zero']] } }),
  };

  function taskView(t, L, h) {
    const P = PROBLEM[t.id](t), E = EXAMPLES()[t.id];
    const example = h.ladder(E.lines, { filled: true, caption: E.cap }) + (E.after ? `<p>${E.after}</p>` : '');
    const table = h.ladder(linesFor(t), { rows: L.rows, caption: 'Your turn' })
      + (t.id === 'pb' ? '<p class="small">Type the payback year as a whole number, like 2.</p>' : '');
    // irr2 asks for the prediction first, then the table that checks it.
    const parts = t.id === 'irr2' ? [{ html: '', field: 'choice' }, { html: '', field: 'table' }] : [{ html: '', field: 'table' }].concat(P.choice ? [{ html: '', field: 'choice' }] : []);
    return { title: P.title, place: P.place, body: P.body, example, table, parts, choice: P.choice,
      helpLabels: ['Show me the first blank', 'Show me every line'] };
  }

  // Common slips, per line, phrased with the student's own numbers.
  function diagFor(t, line, i) {
    const D = [], lab = line.label;
    const rate = t.rate != null ? t.rate : t.r;
    let mY = /^Year (\d)(, value today| at )/.exec(lab);
    if (mY) {
      const y = +mY[1], f = t.flows[y - 1], G = g(rate);
      D.push([f, 'raw', `That is the cash itself. Bring it back to today: ${m(f)} ÷ ${G}${sup(y)}.`],
        [f * Math.pow(1 + rate, y), 'grow', `That multiplies, which grows the cash. Divide instead: ${m(f)} ÷ ${G}${sup(y)}.`],
        [f / Math.pow(1 + rate, y + 1), 'late', `That divides by ${G} ${y + 1} times. Year ${y} cash waits ${y} year${y > 1 ? 's' : ''}: ${m(f)} ÷ ${G}${sup(y)}.`]);
      if (y > 1) D.push([f / Math.pow(1 + rate, y - 1), 'early', `That divides by ${G} only ${y - 1 === 1 ? 'once' : (y - 1) + ' times'}. Year ${y} cash waits ${y} years: ${m(f)} ÷ ${G}${sup(y)}.`]);
    }
    if (lab === 'Value today, all three years') {
      t.v.forEach((x, k) => D.push([t.sum - x, 'miss' + k, `That leaves out year ${k + 1}. Add all three years’ values today.`]));
      D.push([t.flows[0] + t.flows[1] + t.flows[2], 'nodisc', 'That adds the cash with no discounting. Add the three values today instead.']);
    }
    if (lab === '1 − (1 + r)<sup>−n</sup>') D.push([Math.pow(1 + t.r, -t.n), 'no1', `That is ${g(t.r)}^−${t.n} alone. Subtract it from 1. In Desmos: 1-${g(t.r)}^-${t.n}`],
      [1 - Math.pow(1 + t.r, -(t.n - 1)), 'n1', `Use ${t.n} years, the length of the lease. In Desmos: 1-${g(t.r)}^-${t.n}`]);
    if (lab === 'Annuity factor') { const top = 1 - Math.pow(1 + t.r, -t.n);
      D.push([top * t.r, 'times', `That multiplies by ${t.r}. Divide instead. In Desmos: ans/${t.r}`], [top, 'nodiv', `Now divide by r. In Desmos: ans/${t.r}`],
        [t.n, 'years', 'That counts the years with no discounting. Use (1 − (1 + r)^−n) ÷ r.'], [top / (t.r * 100), 'whole', `Divide by ${t.r}, not by ${Math.round(t.r * 100)}.`]); }
    if (lab === 'Value today of the cash') D.push([t.a * t.n, 'nodisc', `That is ${t.n} years of cash with no discounting. Multiply ${m(t.a)} by the annuity factor, ${f4(t.f)}.`],
      [t.a / t.f, 'div', `Multiply the yearly cash by the annuity factor: ${m(t.a)} × ${f4(t.f)}.`], [t.a, 'one', 'That is one year of cash. Multiply it by the annuity factor to value every year.']);
    if (/^NPV/.test(lab)) {
      const val = line.value + t.cost, cash = t.flows ? t.flows.reduce((s, x) => s + x, 0) : t.a * t.n;
      D.push([val, 'nocost', `That is the value today of the cash coming in. Subtract the cost, ${m(t.cost)}.`],
        [val + t.cost, 'addcost', `Subtract the cost, ${m(t.cost)}, don’t add it.`],
        [val - t.cost / (1 + rate), 'disccost', `The cost is paid today, in year 0, so it is not discounted. Subtract the full ${m(t.cost)}.`],
        [cash - t.cost, 'nodisc', `That uses the cash with no discounting. Use the values today: ${m(val)} − ${m(t.cost)}.`]);
    }
    if (/^Total after year/.test(lab)) {
      const y = i + 1, add = t.flows.slice(0, y).reduce((s, x) => s + x, 0);
      D.push([add, 'nocost', y === 1 ? `Start from minus the cost: ${neg(t.cost)} + ${m(t.flows[0])}.` : `That leaves out the cost. The running total starts at ${neg(t.cost)}.`],
        [line.value - t.flows[y - 1], 'prev', y === 1 ? `That is minus the cost. Add year 1’s ${m(t.flows[0])}.` : `That is the total after year ${y - 1}. Add year ${y}’s ${m(t.flows[y - 1])}.`]);
      if (y > 1) D.push([t.run[y - 2] - t.flows[y - 1], 'minus', `Add year ${y}’s cash, ${m(t.flows[y - 1])}, don’t subtract it.`]);
    }
    if (lab === 'Payback year') D.push([t.answer - 1, 'early', `After year ${t.answer - 1} the running total is still below $0. Find the first year it goes above $0.`],
      [t.answer + 1, 'late', `The running total is already above $0 after year ${t.answer}.`]);
    return D;
  }

  const plain = (s) => String(s).replace(/<sup>/g, '^').replace(/<[^>]+>/g, '');
  function judgeTask(t, e, h) {
    const lines = linesFor(t), rows = e.rows || [], rowRes = [];
    lines.forEach((l, i) => {
      if (!l.input) return;
      const v = h.parseMoney(rows[i]);
      if (l.label === 'Payback year' && isFinite(v) && Math.abs(v - Math.round(v)) > 0.001 && v > 0 && v < 5) {
        rowRes[i] = { ok: false, code: 'fraction', msg: `Type a whole year. The running total first goes above $0 in one of the years 1 to 4.` }; return; }
      const opts = l.fmt === 'factor' ? { tol: 0.0006, scale: Math.abs(l.value), unreadable: 'Type the factor as a decimal, like 4.6229.', closeMsg: 'Close. Keep four decimal places in the factor.', otherMsg: plain(l.calc) }
        : l.fmt === 'num' ? { tol: 0.01, scale: 1, unreadable: 'Type the year as a whole number, like 3.', otherMsg: 'Find the first running total above $0. Its year is the payback year.' }
          : /^Total after year/.test(l.label) ? { tol: 1, scale: t.cost, otherMsg: `${plain(l.calc)}.` }
            : { tol: /^irr/.test(t.id) ? 30 : Math.max(2, 0.001 * t.cost), scale: t.cost, otherMsg: `${plain(l.calc)}.` };
      rowRes[i] = h.judgeNumber(v, l.value, diagFor(t, l, i), opts);
    });
    const bad = rowRes.findIndex((x) => x && !x.ok);
    if (bad >= 0) return { ok: false, rowRes, msg: `${plain(lines[bad].label)}: ${rowRes[bad].msg}` };
    if (t.decision && e.choice !== t.decision) {
      if (t.id === 'irr2') {
        if (!e.choice) return { ok: false, rowRes, msg: 'Now answer the question above the table: above or below zero?' };
        return { ok: false, rowRes, msg: `Your table gives an NPV of ${m(t.answer)} at ${p(t.rate)}. Pallino requires ${t.rate < t.irr ? 'less' : 'more'} than the IRR, ${p(t.irr)}, so the NPV is ${t.answer > 0 ? 'above' : 'below'} zero.` };
      }
      if (!e.choice) return { ok: false, rowRes, msg: 'Now answer the question under the table.' };
      return { ok: false, rowRes, msg: `Your NPV is ${m(t.answer)}. ${t.answer > 0 ? 'Above zero means the site earns more than Pallino requires.' : 'Below zero means the money would earn more elsewhere.'}` };
    }
    return { ok: true, rowRes };
  }

  const showVal = (l) => (l.fmt === 'factor' ? f4(l.value) : l.fmt === 'num' ? 'year ' + l.value : m(l.value));
  function helpText(t, lvl) {
    const lines = linesFor(t), blanks = lines.filter((l) => l.input);
    const say = (l) => `${l.label}: ${l.calc} = ${showVal(l)}`;
    return lvl === 1 ? say(blanks[0]) : lines.map(say).join('<br>');
  }
  function praise(t) {
    if (t.id === 'yr1') return `The cash coming in is worth more today than the ${m(t.cost)} it costs, so the bank branch adds ${m(t.answer)} of value.`;
    if (t.id === 'yr2') return `The NPV is ${m(t.answer)}, so Pallino should ${t.decision === 'build' ? 'build' : 'pass on'} the shopping center site.`;
    if (t.id === 'af1') return `One multiplication by the annuity factor values all ${t.n} years at once. The NPV is ${m(t.answer)}.`;
    if (t.id === 'af2') return `The NPV is ${m(t.answer)}, so Pallino should ${t.decision === 'build' ? 'build' : 'pass on'} the airport site.`;
    if (t.id === 'pb') return `The storefront pays back in year ${t.answer}. Payback says nothing about the time value of money, so NPV still makes the call.`;
    if (t.id === 'irr1') return `The NPV at ${p(t.irr)} is $0, so ${p(t.irr)} is the IRR. Any required return below it gives an NPV above zero.`;
    if (t.id === 'irr2') return `Pallino requires ${t.rate < t.irr ? 'less' : 'more'} than the IRR, so the NPV at ${p(t.rate)} is ${t.answer > 0 ? 'above' : 'below'} zero: ${m(t.answer)}. ${t.answer > 0 ? 'Build it.' : 'Pass.'}`;
  }
  const ansStr = (l, k) => (l.fmt === 'factor' ? (l.value * k).toFixed(4) : l.fmt === 'num' ? String(l.value * k) : String(Math.round(l.value * k)));
  function selfAnswer(t) {
    const rows = []; linesFor(t).forEach((l, i) => { if (l.input) rows[i] = ansStr(l, 1); });
    return { rows, choice: t.decision || null };
  }
  function selfWrong(t) {
    const rows = []; linesFor(t).forEach((l, i) => { if (l.input) rows[i] = ansStr(l, 1.3); });
    return { rows, choice: t.decision || null };
  }

  root.DESK = {
    app: 'finan4-u5-site-selection-desk', version: 5, seedVersion: 3, salt: 'rize-finan4-u5-sites:7d2a95', points: 20,
    storageKey: 'rize-finan4-u5-sites-v3', filePrefix: 'SiteSelectionDesk',
    verifyUrl: 'https://rizecomputerscience.github.io/finan4-site-selection-desk/verify.html',
    calcPlaceholder: '150000/1.08^2',
    story: { title: 'The Site Selection Desk', kicker: 'Corporate Finance, Unit 5', company: 'Pallino Kitchen', team: 'Real Estate Team',
      from: 'Teodora Valcourt', fromTitle: 'VP of Real Estate, Pallino Kitchen',
      dek: 'Pallino Kitchen, a fast-casual chain with 140 restaurants, opens about 20 more a year. Each starts as a site: one specific place where a restaurant could open, like a storefront or a space in a shopping center. A site costs money to build today and brings in cash for years. Teodora Valcourt, the VP of Real Estate, needs a call on each site on her desk: build or pass.',
      whatBox: '',
      stepsLine: 'Ten short steps. Each shows a worked example in the same table you fill in, then you do the same calculation with your own numbers.' },
    steps: STEPS, quiz: QUIZ, walk: null, buildTasks, taskView, judgeTask, helpText, praise, selfAnswer, selfWrong,
    note: { title: 'A note for the CFO', label: 'Your note to Teodora', minWords: 30, receiptHeading: 'Note to the VP of Real Estate',
      prompt: 'Teodora will forward your note to Pallino’s chief financial officer. Name the site you would build first and give its NPV. Then say what payback tells the CFO and why NPV still makes the call.' },
  };
})(typeof window !== 'undefined' ? window : globalThis);
