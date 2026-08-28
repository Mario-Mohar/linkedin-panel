const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

let state = {
  data: null, feed: null, sort: 'reactions', hideFresh: true, view: 'posts',
  // Filled from /api/i18n before the first render.
  messages: {}, locale: 'en-US', lang: 'en',
  // Current collector run, polled from /api/run while one is going.
  run: null, runError: null, pollTimer: null,
};

const LIMIT_KEY = 'lip.postLimit';
const LIMIT_MIN = 1;
const LIMIT_MAX = 100;

/**
 * The chosen post count survives a reload. localStorage can throw (private
 * windows, blocked site data), so every access is guarded and the default is
 * always a working answer.
 */
function readLimit() {
  try {
    const stored = Number.parseInt(window.localStorage.getItem(LIMIT_KEY) ?? '', 10);
    if (Number.isFinite(stored)) return Math.min(LIMIT_MAX, Math.max(LIMIT_MIN, stored));
  } catch {
    // no stored value available, fall through to the default
  }
  return 15;
}

function writeLimit(value) {
  try { window.localStorage.setItem(LIMIT_KEY, String(value)); } catch { /* not storable, fine */ }
}

/**
 * Looks up a label and fills `{placeholders}`.
 * A missing key renders as the key itself — a visible `kpi.followers` points at
 * the gap, an empty label just looks like a rendering bug.
 */
function t(key, vars = {}) {
  const template = state.messages[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name) => (name in vars ? String(vars[name]) : `{${name}}`));
}

const fmt = (n) => new Intl.NumberFormat(state.locale).format(n);
const fmtDate = (iso) => new Date(iso).toLocaleDateString(state.locale, { weekday: 'short', day: '2-digit', month: '2-digit' });
const fmtDateTime = (iso) => new Date(iso).toLocaleString(state.locale);
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
// Reach figures only exist after a `npm run analytics` run. Until then null is
// the honest value — not 0, which would be a claim.
const has = (v) => v !== null && v !== undefined;
const numOrDash = (v) => (has(v) ? fmt(v) : '–');
const pctOrDash = (v) => (has(v) ? v.toFixed(1) + '%' : '–');
const withAnalytics = () => (state.data?.kpis?.postsWithAnalytics ?? 0) > 0;
// A benchmark needs enough matured (non-fresh) posts, otherwise "Top X%" is noise.
const MIN_MATURE_FOR_BENCHMARK = 5;

/**
 * Fetches the message catalogue once and labels the static chrome with it.
 * The server decides the language, so there is a single source of truth for it.
 */
async function loadMessages() {
  const i18n = await fetch('/api/i18n').then((r) => r.json());
  state.messages = i18n.messages ?? {};
  state.lang = i18n.lang ?? 'en';
  state.locale = state.messages['meta.locale'] ?? 'en-US';
  document.documentElement.lang = state.lang;
  document.title = t('app.name');
  $('.brand').textContent = `📊 ${t('app.name')}`;
  $('.tabs').setAttribute('aria-label', t('app.viewLabel'));
  $('#tabPosts').textContent = t('tab.posts');
  $('#tabFeed').textContent = t('tab.feed');
  const loading = $('#app .loading');
  if (loading) loading.textContent = t('app.loading');
}

async function load() {
  await loadMessages();
  const [data, run] = await Promise.all([
    fetch('/api/data').then((r) => r.json()),
    fetch('/api/run').then((r) => r.json()).catch(() => null),
  ]);
  state.data = data;
  state.run = run;
  if (state.view === 'posts') render();
  // A run started before this page was opened should still be followed.
  if (run?.running) startPolling();
}

/* ---------- run panel ---------- */

function runStatusText() {
  if (state.runError) return state.runError;
  const r = state.run;
  if (!r || !r.kind) return t('run.idle');
  const kind = t(`run.kind.${r.kind}`);
  if (r.running) return t('run.running', { kind });
  return r.exitCode === 0
    ? t('run.finishedOk', { kind })
    : t('run.finishedFail', { kind, code: r.exitCode });
}

function runPanelHtml() {
  const running = !!state.run?.running;
  const limit = readLimit();
  const lines = state.run?.lines ?? [];
  const btn = (kind, label, hint) =>
    `<button type="button" class="ctl runbtn" data-run="${kind}" title="${esc(hint)}"${running ? ' disabled' : ''}>${esc(label)}</button>`;
  return `
    <h4>${esc(t('run.title'))}</h4>
    <div class="runrow">
      <label class="runlimit">${esc(t('run.limitLabel'))}
        <input type="number" id="runLimit" min="${LIMIT_MIN}" max="${LIMIT_MAX}" value="${limit}"${running ? ' disabled' : ''}>
      </label>
      ${btn('login', t('run.login'), t('run.loginHint'))}
      ${btn('collect', t('run.collect'), t('run.collectHint'))}
      ${btn('analytics', t('run.analytics'), t('run.analyticsHint'))}
    </div>
    <div class="cap">${esc(t('run.limitHint'))}</div>
    <div class="runstatus${running ? ' on' : ''}">${esc(runStatusText())}</div>
    ${lines.length ? `<pre class="runlog">${esc(lines.slice(-12).join('\n'))}</pre>` : ''}`;
}

function paintRunPanel() {
  const el = $('#runpanel');
  if (el) el.innerHTML = runPanelHtml();
}

async function pollRun() {
  try {
    const before = state.run?.running;
    state.run = await fetch('/api/run').then((r) => r.json());
    paintRunPanel();
    if (before && !state.run.running) {
      // A finished run means new numbers on disk — pick them up without making
      // the user reload.
      stopPolling();
      const data = await fetch('/api/data').then((r) => r.json());
      state.data = data;
      if (state.view === 'posts') render();
    }
  } catch {
    stopPolling();
  }
}

function startPolling() {
  if (state.pollTimer) return;
  state.pollTimer = window.setInterval(pollRun, 1500);
}

function stopPolling() {
  if (!state.pollTimer) return;
  window.clearInterval(state.pollTimer);
  state.pollTimer = null;
}

async function startRun(kind) {
  state.runError = null;
  try {
    const res = await fetch('/api/run', {
      method: 'POST',
      // The header is what makes this request impossible to forge from another
      // page: a cross-origin form post cannot set it.
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'linkedin-panel' },
      body: JSON.stringify({ kind, limit: readLimit() }),
    });
    if (res.status === 403) { state.runError = t('run.forbidden'); paintRunPanel(); return; }
    const body = await res.json();
    if (res.status === 409) {
      state.run = body.state;
      state.runError = t('run.busy', { kind: t(`run.kind.${body.state?.kind ?? kind}`) });
    } else if (!res.ok) {
      state.runError = t('run.failed', { message: body.error ?? res.status });
    } else {
      state.run = body;
    }
  } catch (e) {
    state.runError = t('run.failed', { message: e.message });
  }
  paintRunPanel();
  startPolling();
}

function kpiCard(label, value, sub = '', title = '') {
  return `<div class="kpi"${title ? ` title="${esc(title)}"` : ''}><div class="big">${value}</div><small>${label}${sub ? ' · ' + sub : ''}</small></div>`;
}

/** Small inline SVG line chart with an area wash, an end dot and a direct end label. */
function lineChart(points, w = 320, h = 64) {
  if (points.length < 2) return `<div class="cap">${esc(t('chart.tooFewPoints'))}</div>`;
  const pad = 6;
  const xs = points.map((_, i) => pad + (i / (points.length - 1)) * (w - pad * 2));
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const y = (v) => pad + (h - pad * 2) * (1 - (v - min) / range);
  const coords = points.map((p, i) => [xs[i], y(p.value)]);
  const line = coords.map(([x, yy]) => `${x.toFixed(1)},${yy.toFixed(1)}`).join(' ');
  const area = `${coords[0][0].toFixed(1)},${h} ${line} ${coords[coords.length - 1][0].toFixed(1)},${h}`;
  const [lx, ly] = coords[coords.length - 1];
  const last = points[points.length - 1];
  const labelAnchor = lx > w - 28 ? 'end' : 'start';
  const labelX = labelAnchor === 'end' ? lx - 6 : lx + 6;
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img" aria-label="${esc(t('chart.ariaTrend', { value: fmt(last.value) }))}">
    <polygon class="area" points="${area}"></polygon>
    <polyline class="spark" points="${line}"><title>${esc(t('chart.range', { min: fmt(min), max: fmt(max) }))}</title></polyline>
    <circle class="dot" cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="4"><title>${esc(t('chart.point', { date: fmtDate(last.at), value: fmt(last.value) }))}</title></circle>
    <text class="dotlabel" x="${labelX.toFixed(1)}" y="${Math.max(10, ly - 8).toFixed(1)}" text-anchor="${labelAnchor}">${fmt(last.value)}</text>
  </svg>`;
}

/** One bar per weekday, capped width, rounded cap, native tooltips. */
function weekdayChart(wd) {
  const max = Math.max(1, ...wd.map((d) => d.avgReactions));
  return `<div class="wd">${wd.map((d) => `
    <div class="col" title="${esc(t('weekday.tooltip', { label: d.label, avg: fmt(d.avgReactions), count: d.count }))}">
      <div class="colbar" style="height:${Math.max(2, (d.avgReactions / max) * 100)}%"></div>
      <div class="lab">${esc(d.label)}·${fmt(d.avgReactions)}</div>
    </div>`).join('')}</div>`;
}

/**
 * Benchmark cell. Fresh posts always show their maturity tag. A "Top X%" badge
 * appears only when there are enough matured posts (MIN_MATURE_FOR_BENCHMARK)
 * AND the post is genuinely above average (percentile >= 50) — otherwise a post
 * with 0 reactions (percentile 0) would read as "Top 100%", which looks like
 * praise but means the opposite. Below-average posts get a neutral marker.
 */
function benchmarkCell(p, matureCount) {
  if (p.fresh) return `<span class="freshtag">${esc(t('tag.fresh', { days: p.ageDays }))}</span>`;
  if (matureCount >= MIN_MATURE_FOR_BENCHMARK && p.percentile !== null && p.percentile >= 50) {
    return `<span class="badge">${esc(t('badge.top', { percent: Math.max(1, 100 - p.percentile) }))}</span>`;
  }
  return `<span class="cap">—</span>`;
}

function postRows() {
  const d = state.data;
  const matureCount = d.posts.filter((p) => !p.fresh).length;
  let rows = d.posts.slice();
  if (state.hideFresh) rows = rows.filter((p) => !p.fresh);
  const key = state.sort;
  // Posts without reach data belong at the bottom when sorting, not scattered
  // around by NaN comparisons.
  const sortVal = (r) => (has(r[key]) ? r[key] : -Infinity);
  rows.sort((a, b) => (key === 'postedAt' ? (a.postedAt < b.postedAt ? 1 : -1) : sortVal(b) - sortVal(a)));
  const cols = withAnalytics() ? 9 : 7;
  if (rows.length === 0) return `<tr><td colspan="${cols}" class="cap">${esc(t('table.empty'))}</td></tr>`;
  return rows.map((p) => `
    <tr data-urn="${esc(p.postUrn)}" tabindex="0" role="button" aria-label="${esc(fmtDate(p.postedAt))}">
      <td class="txt">${esc(p.textExcerpt)}</td>
      <td>${fmtDate(p.postedAt)}</td>
      ${withAnalytics() ? `<td class="num">${numOrDash(p.impressions)}</td><td class="num">${numOrDash(p.membersReached)}</td>` : ''}
      <td class="num">${fmt(p.reactions)}</td><td class="num">${fmt(p.comments)}</td><td class="num">${fmt(p.reposts)}</td>
      <td class="num">${withAnalytics() ? pctOrDash(p.engagementRate) : pctOrDash(p.followerRate)}</td><td>${benchmarkCell(p, matureCount)}</td>
    </tr>`).join('');
}

function sortBtn(key, label) { return `<button class="ctl ${state.sort === key ? 'on' : ''}" data-sort="${key}">${esc(label)}</button>`; }

function render() {
  const d = state.data;
  $('#meta').textContent = t('meta.updated', { when: fmtDateTime(d.generatedAt) });
  $('#app').innerHTML = `
    ${d.isExample ? `<div class="notice">${t('notice.example')}</div>` : ''}
    <section class="panel runpanel" id="runpanel">${runPanelHtml()}</section>
    <section class="kpis">
      ${kpiCard(esc(t('kpi.followers')), d.kpis.followers ?? '–')}
      ${kpiCard(
        esc(t('kpi.connections')),
        // LinkedIn stops at "500+", so showing a bare 500 would claim precision
        // the page never gave.
        d.kpis.connections === null ? '–' : fmt(d.kpis.connections) + (d.kpis.connectionsCapped ? '+' : ''),
        '', d.kpis.connectionsCapped ? t('kpi.connectionsCappedTitle') : '')}
      ${kpiCard(esc(t('kpi.posts')), d.kpis.postCount, esc(t('kpi.postsFresh', { count: d.kpis.freshCount })))}
      ${kpiCard(esc(t('kpi.avgReactions')), d.kpis.avgReactions)}
      ${has(d.kpis.avgImpressions) ? kpiCard(esc(t('kpi.avgImpressions')), fmt(d.kpis.avgImpressions), '', t('kpi.avgImpressionsTitle')) : ''}
      ${has(d.kpis.avgEngagementRate)
        ? kpiCard(esc(t('kpi.engagementRate')), d.kpis.avgEngagementRate.toFixed(1) + '%',
            esc(t('kpi.engagementRateSub', { count: d.kpis.postsWithAnalytics })), t('kpi.engagementRateTitle'))
        : kpiCard(esc(t('kpi.followerRate')), d.kpis.avgFollowerRate.toFixed(1) + '%',
            // Distinguish "no reach data at all" from "reach data, but only on
            // posts that are still too fresh to benchmark" — otherwise the
            // dashboard looks like it lost the numbers it just collected.
            esc(t(d.kpis.postsWithAnalytics > 0 ? 'kpi.followerRateSubFresh' : 'kpi.followerRateSub')),
            t('kpi.followerRateTitle'))}
    </section>
    <section class="grid2">
      <div class="panel"><h4>${esc(t('panel.followerTrend'))}</h4>${lineChart(d.followerTrend)}</div>
      <div class="panel"><h4>${esc(t('panel.weekday'))}</h4>
        <div class="cap">${esc(t('panel.weekdayNote'))}</div>${weekdayChart(d.weekday)}</div>
    </section>
    <section class="panel">
      <h4>${esc(t('panel.posts'))}</h4>
      <div class="toolbar">
        <span class="cap">${esc(t('sort.label'))}</span>${sortBtn('reactions', t('sort.reactions'))}${sortBtn('comments', t('sort.comments'))}${sortBtn('postedAt', t('sort.date'))}${withAnalytics() ? sortBtn('impressions', t('sort.impressions')) + sortBtn('engagementRate', t('sort.rate')) : sortBtn('followerRate', t('sort.quota'))}
        <button class="ctl ${state.hideFresh ? 'on' : ''}" id="toggleFresh">${esc(t('filter.hideFresh'))}</button>
      </div>
      <div class="tablewrap"><table><thead><tr><th>${esc(t('th.post'))}</th><th>${esc(t('th.date'))}</th>${withAnalytics() ? `<th class="num">${esc(t('th.impressions'))}</th><th class="num">${esc(t('th.reach'))}</th>` : ''}<th class="num">${esc(t('th.reactions'))}</th><th class="num">${esc(t('th.comments'))}</th><th class="num">${esc(t('th.reposts'))}</th><th class="num">${esc(withAnalytics() ? t('th.er') : t('th.quota'))}</th><th>${esc(t('th.benchmark'))}</th></tr></thead>
      <tbody id="rows">${postRows()}</tbody></table></div>
    </section>
    <div id="detail" class="detail" hidden></div>`;

  $('#app').querySelectorAll('[data-sort]').forEach((b) => b.onclick = () => { state.sort = b.dataset.sort; render(); });
  $('#toggleFresh').onclick = () => { state.hideFresh = !state.hideFresh; render(); };
  $('#rows').querySelectorAll('tr[data-urn]').forEach((tr) => {
    tr.onclick = () => showDetail(tr.dataset.urn);
    tr.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showDetail(tr.dataset.urn); } };
  });
}

async function showDetail(urn) {
  const p = state.data.posts.find((x) => x.postUrn === urn);
  const hist = await fetch('/api/post/' + encodeURIComponent(urn)).then((r) => r.json());
  const el = $('#detail'); el.hidden = false;
  const safeUrl = /^https:\/\/www\.linkedin\.com\//.test(p.url) ? p.url : '#';
  const reach = has(p.impressions)
    ? `<div class="cap">${esc(t('detail.reach', { impressions: fmt(p.impressions), reached: numOrDash(p.membersReached) }))}`
      + (has(p.inNetworkPct)
        ? esc(t('detail.network', { inPct: p.inNetworkPct.toFixed(0), outPct: has(p.outNetworkPct) ? p.outNetworkPct.toFixed(0) : '–' }))
        : '')
      + esc(t('detail.savedSent', { saves: numOrDash(p.saves), sends: numOrDash(p.sends) })) + '</div>'
      + `<div class="cap">${esc(t('detail.profileEffect', { views: numOrDash(p.profileViews), followers: numOrDash(p.followersGained) }))}</div>`
    : `<div class="cap">${t('detail.noReach')}</div>`;
  const rate = has(p.engagementRate)
    ? t('detail.er', { value: p.engagementRate.toFixed(1) })
    : t('detail.quota', { value: p.followerRate.toFixed(1) });
  el.innerHTML = `<b>${esc(p.textExcerpt)}</b>
    <div class="cap">${esc(t('detail.summary', {
      date: fmtDate(p.postedAt), reactions: fmt(p.reactions), comments: fmt(p.comments), reposts: fmt(p.reposts), rate,
    }))}</div>
    ${reach}
    <div class="cap">${esc(t('detail.reactionsHistory'))}</div>${lineChart(hist.reactions)}
    ${hist.impressions?.length > 1 ? `<div class="cap">${esc(t('detail.impressionsHistory'))}</div>${lineChart(hist.impressions)}` : ''}
    <a href="${esc(safeUrl)}" target="_blank" rel="noopener">${esc(t('detail.open'))}</a>`;
  el.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'nearest' });
}

/* ---------- Feed view (phase 3) ---------- */

/** Score badge tier: high (eye-catching) / medium (tinted) / low (neutral). Rank, not advice. */
function scoreTier(score) {
  if (score >= 70) return 'hi';
  if (score >= 40) return 'mid';
  return 'lo';
}

/** Score components broken out transparently (momentum/topic/relationship, each 0..1). */
function scoreParts(parts) {
  const p = parts || { momentum: 0, topical: 0, relationship: 0 };
  const items = [
    [t('feed.partMomentum'), p.momentum],
    [t('feed.partTopical'), p.topical],
    [t('feed.partRelationship'), p.relationship],
  ];
  return `<div class="parts">${items.map(([label, v]) => {
    const pct = Math.round(Math.max(0, Math.min(1, v || 0)) * 100);
    return `<div class="part" title="${esc(label)}: ${pct}%">
      <span class="partlab">${esc(label)}</span>
      <span class="partbar"><span class="partfill" style="width:${pct}%"></span></span>
    </div>`;
  }).join('')}</div>`;
}

function feedCard(p, drafts) {
  const reasons = (p.reasons || []).map((r) => `<span class="chip">${esc(r)}</span>`).join('');
  const draftHtml = (drafts && drafts.length)
    ? drafts.map((d) => `<div class="draft"><div class="dtext">${esc(d)}</div>
        <button type="button" class="ctl copy" data-copy="${esc(d)}">${esc(t('feed.copy'))}</button></div>`).join('')
    : `<div class="cap">${esc(t('feed.noDraft'))}</div>`;
  const safeUrl = /^https:\/\/www\.linkedin\.com\//.test(p.url) ? p.url : '#';
  const tier = scoreTier(p.score);
  return `<article class="feedcard">
    <div class="fhead">
      <div class="score ${tier}" title="${esc(t('feed.scoreTitle', { score: p.score }))}">${p.score}</div>
      <div class="fauthor">
        <b>${esc(p.authorName)}</b>
        <span class="cap">${esc(p.authorHeadline)}</span>
      </div>
    </div>
    ${scoreParts(p.parts)}
    ${p.socialProof ? `<div class="cap">🔗 ${esc(p.socialProof)}</div>` : ''}
    <div class="ftext">${esc(p.textExcerpt)}</div>
    ${reasons ? `<div class="reasons">${reasons}</div>` : ''}
    ${draftHtml}
    <a class="openlink" href="${esc(safeUrl)}" target="_blank" rel="noopener">${esc(t('feed.open'))}</a>
  </article>`;
}

function renderFeed() {
  const d = state.feed;
  const app = $('#app');
  $('#meta').textContent = d.generatedAt ? t('meta.feedUpdated', { when: fmtDateTime(d.generatedAt) }) : '';
  if (!d.posts || d.posts.length === 0) {
    app.innerHTML = `<p class="loading">${t('feed.noRun')}</p>`;
    return;
  }
  app.innerHTML = `<section class="feedlist">${d.posts.map((p) => feedCard(p, d.drafts[p.postUrn] || [])).join('')}</section>`;
}

async function loadFeed() {
  $('#app').innerHTML = `<p class="loading">${esc(t('app.loading'))}</p>`;
  try {
    state.feed = await fetch('/api/feed').then((r) => r.json());
  } catch (e) {
    $('#app').innerHTML = `<p class="loading">${esc(t('app.error', { message: e.message }))}</p>`;
    return;
  }
  renderFeed();
}

function switchView(view) {
  state.view = view;
  $('#tabPosts').classList.toggle('on', view === 'posts');
  $('#tabPosts').setAttribute('aria-selected', String(view === 'posts'));
  $('#tabFeed').classList.toggle('on', view === 'feed');
  $('#tabFeed').setAttribute('aria-selected', String(view === 'feed'));
  if (view === 'posts') {
    if (state.data) render();
    else $('#app').innerHTML = `<p class="loading">${esc(t('app.loading'))}</p>`;
  } else if (state.feed) {
    renderFeed();
  } else {
    loadFeed();
  }
}

$('#tabPosts').onclick = () => switchView('posts');
$('#tabFeed').onclick = () => switchView('feed');

// Run buttons and the limit field are delegated: the panel is rebuilt on every
// poll, so handlers bound to the elements themselves would not survive.
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-run]');
  if (btn && !btn.disabled) startRun(btn.dataset.run);
});

document.addEventListener('change', (e) => {
  if (e.target.id !== 'runLimit') return;
  const value = Math.min(LIMIT_MAX, Math.max(LIMIT_MIN, Number.parseInt(e.target.value, 10) || 15));
  e.target.value = String(value);
  writeLimit(value);
});

// Copy buttons are delegated (cards are rebuilt on every feed render).
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.copy');
  if (!btn) return;
  const text = btn.dataset.copy || '';
  navigator.clipboard.writeText(text).then(() => {
    const original = btn.textContent;
    btn.textContent = t('feed.copied');
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = original; btn.classList.remove('copied'); }, 1500);
  }).catch(() => {
    btn.textContent = t('feed.copyError');
  });
});

load().catch((e) => {
  if (state.view === 'posts') {
    document.querySelector('#app').innerHTML = `<p class="loading">${esc(t('app.bootError', { message: e.message }))}</p>`;
  }
});
