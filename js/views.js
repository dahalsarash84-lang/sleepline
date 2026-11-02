/* All render functions. Views are pure-ish: data in, HTML out. */

import { brandMark, icon } from './icons.js';
import { FACTORS, PROVIDERS } from './store.js';
import { qualityLabel, scoreBand, scoreNight } from './sleep.js';
import { SOUNDS } from './sounds.js';
import {
  addDays,
  clamp,
  dateFromKey,
  escapeHtml,
  formatCountdown,
  formatDate,
  formatDelta,
  formatDuration,
  formatLongDate,
  formatMinutesAsTime,
  formatTime,
  initials,
  monthKey,
  monthLabel,
  nightDuration,
  plural,
  sleepGreeting,
  timeToMinutes,
  todayKey,
  weekdayName,
} from './utils.js';

const MIXES = [
  {
    id: 'winddown',
    title: 'Wind down',
    description: 'Calm piano, slow acoustic and soft lo-fi.',
    icon: 'moon',
    term: 'calm sleep playlist',
  },
  {
    id: 'deepsleep',
    title: 'Deep sleep',
    description: 'Brown noise, rain and low ambient drones.',
    icon: 'waves',
    term: 'deep sleep sounds',
  },
  {
    id: 'morning',
    title: 'Soft morning',
    description: 'A gentle landing before the day starts.',
    icon: 'sun',
    term: 'gentle morning acoustic',
  },
];

const GOAL_OPTIONS = [
  { value: 7, label: 'Lean', note: '7 hours' },
  { value: 7.5, label: 'Light', note: '7.5 hours' },
  { value: 8, label: 'Recommended', note: '8 hours' },
  { value: 8.5, label: 'Generous', note: '8.5 hours' },
  { value: 9, label: 'Plenty', note: '9 hours' },
];

export function getProvider(id) {
  return PROVIDERS.find((provider) => provider.id === id) || PROVIDERS[0];
}

export function pageHead({ eyebrow, title, lede = '', actions = '' }) {
  return `<header class="page-head">
    <div class="page-title">
      <p class="eyebrow">${eyebrow}</p>
      <h1>${title}</h1>
      ${lede ? `<p class="lede">${lede}</p>` : ''}
    </div>
    ${actions ? `<div class="page-actions">${actions}</div>` : ''}
  </header>`;
}

export function scoreRing(score, { mini = false } = {}) {
  const safeScore = clamp(Math.round(score), 0, 100);
  const circumference = 2 * Math.PI * 52;
  const offset = (circumference * (1 - safeScore / 100)).toFixed(1);
  return `<div class="score-ring ${mini ? 'is-mini' : ''} band-${scoreBand(safeScore)}" role="img" aria-label="Sleep score ${safeScore} out of 100">
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <circle class="ring-track" cx="60" cy="60" r="52"></circle>
      <circle class="ring-value" cx="60" cy="60" r="52" stroke-dasharray="${circumference.toFixed(1)}" stroke-dashoffset="${offset}" transform="rotate(-90 60 60)"></circle>
    </svg>
    <div class="ring-label"><strong>${safeScore}</strong><span>${mini ? 'score' : 'sleep score'}</span></div>
  </div>`;
}

function qualityDots(quality) {
  return `<span class="quality-dots" role="img" aria-label="${quality} out of 5">${[1, 2, 3, 4, 5]
    .map((index) => `<i class="${index <= quality ? 'is-on' : ''}"></i>`)
    .join('')}</span>`;
}

function statCard({ label, value, sub, iconName, tone = '' }) {
  return `<div class="stat-card ${tone}">
    <div class="stat-top"><span>${label}</span><span class="stat-icon">${icon(iconName, 17)}</span></div>
    <strong class="stat-value">${value}</strong>
    <span class="stat-sub">${sub}</span>
  </div>`;
}

function statGrid(stats, settings) {
  const target = settings.sleepGoal * 60;
  const delta = stats.avgDuration - target;
  return `<div class="stat-grid">
    ${statCard({
      label: '7-night average',
      value: formatDuration(stats.avgDuration),
      sub: `${formatDelta(delta)} vs your ${formatDuration(target)} goal`,
      iconName: 'moon',
    })}
    ${statCard({
      label: 'Consistency',
      value: stats.consistency === null ? '—' : `${stats.consistency}<small>/100</small>`,
      sub: stats.recent.length > 1 ? `Wake times spread ${formatDuration(stats.wakeSpread)}` : 'Needs two nights',
      iconName: 'target',
    })}
    ${statCard({
      label: 'Sleep debt',
      value: stats.sleepDebt ? formatDuration(stats.sleepDebt) : 'None',
      sub: `Across your last ${plural(stats.recent.length, 'night')}`,
      iconName: 'chart',
      tone: stats.sleepDebt >= 180 ? 'is-warn' : '',
    })}
    ${statCard({
      label: 'Logging streak',
      value: `${stats.streak}<small> ${stats.streak === 1 ? 'night' : 'nights'}</small>`,
      sub: stats.streak ? 'Keep the thread going' : 'Log tonight to begin',
      iconName: 'flame',
      tone: stats.streak >= 3 ? 'is-good' : '',
    })}
  </div>`;
}

function adviceAction(action) {
  if (!action) return '';
  if (action.href) {
    return `<a class="text-link" href="${escapeHtml(action.href)}">${escapeHtml(action.label)} ${icon('arrowRight', 15)}</a>`;
  }
  const section = action.section ? ` data-section="${escapeHtml(action.section)}"` : '';
  return `<button type="button" class="text-link" data-action="${escapeHtml(action.action)}"${section}>${escapeHtml(action.label)} ${icon('arrowRight', 15)}</button>`;
}

export function adviceCard(item) {
  return `<article class="advice-card tone-${item.tone}">
    <div class="advice-top">
      <span class="advice-icon">${icon(item.icon, 20)}</span>
      <span class="advice-tag">${escapeHtml(item.tag)}</span>
    </div>
    <h3>${escapeHtml(item.title)}</h3>
    <p>${escapeHtml(item.body)}</p>
    <div class="advice-action">${adviceAction(item.action)}</div>
  </article>`;
}

function durationChart(nights, settings, { compact = false } = {}) {
  if (!nights.length) {
    return '<div class="chart-empty">Log a few nights to see your rhythm.</div>';
  }
  const target = settings.sleepGoal * 60;
  const durations = nights.map(nightDuration);
  const maximum = Math.max(target + 120, 600, ...durations);
  const goalPct = clamp((target / maximum) * 100, 0, 100);
  return `<div class="bar-chart ${compact ? 'is-compact' : ''}" style="--goal:${goalPct}%">
    <div class="chart-plot">
      <div class="goal-line" aria-hidden="true"></div>
      <div class="chart-bars">
        ${nights
          .map((night) => {
            const duration = nightDuration(night);
            const pct = clamp((duration / maximum) * 100, 2, 100);
            const band = scoreBand(scoreNight(night, settings).score);
            return `<div class="chart-col">
              <div class="bar-track">
                <div class="bar-fill band-${band}" style="height:${pct}%" title="${escapeHtml(
                  `${formatDate(night.date)}: ${formatDuration(duration)}`,
                )}" aria-label="${escapeHtml(`${formatDate(night.date)}: ${formatDuration(duration)}`)}" role="img"></div>
              </div>
            </div>`;
          })
          .join('')}
      </div>
    </div>
    <div class="chart-labels">
      ${nights
        .map(
          (night) =>
            `<span><b>${weekdayName(night.date)}</b><small>${dateFromKey(night.date).getDate()}</small></span>`,
        )
        .join('')}
    </div>
    <div class="chart-legend">
      <span><i class="legend-swatch"></i>Sleep</span>
      <span><i class="legend-line"></i>${formatDuration(target)} goal</span>
    </div>
  </div>`;
}

function planCard(plan, stats, settings) {
  const note = plan.repayment
    ? `Includes ${plan.repayment} extra minutes to work on your ${formatDuration(stats.sleepDebt)} sleep debt — gently, not in one long lie-in.`
    : `Built around ${formatDuration(settings.sleepGoal * 60)} of sleep and ${plan.latencyBuffer} minutes to drift off.`;
  return `<section class="card plan-card">
    <div class="card-head">
      <div><p class="kicker">Tonight</p><h2>Your runway to sleep</h2></div>
      <span class="pill pill-soft">${plan.wakeLabel}</span>
    </div>
    <div class="plan-steps">
      <div class="plan-step">
        <span class="step-icon step-lavender">${icon('wind', 18)}</span>
        <div><small>Start winding down</small><strong>${plan.windDownTime}</strong></div>
      </div>
      <div class="plan-step">
        <span class="step-icon step-mint">${icon('bed', 18)}</span>
        <div><small>Lights out target</small><strong>${plan.bedTime}</strong></div>
      </div>
      <div class="plan-step">
        <span class="step-icon step-amber">${icon('alarm', 18)}</span>
        <div><small>Wake</small><strong>${plan.wakeTime}</strong></div>
      </div>
    </div>
    <div class="plan-chips">
      <span class="chip">${icon('coffee', 15)} Caffeine before ${plan.caffeineTime}</span>
      <span class="chip">${icon('timer', 15)} ${formatDuration(plan.plannedSleepMin)} planned</span>
    </div>
    <p class="plan-note">${note}</p>
  </section>`;
}

function musicTeaser() {
  return `<a class="music-teaser" href="#sounds">
    <div class="teaser-copy">
      <p class="kicker">Soundscapes · Spotify · Apple Music · YouTube Music</p>
      <h2>A softer landing</h2>
      <p>Rain, ocean and brown noise generated in your browser — plus a hand-off to whichever player you already use.</p>
      <span class="teaser-link">Open the sound room ${icon('arrowRight', 16)}</span>
    </div>
    <div class="teaser-art" aria-hidden="true">
      <span class="teaser-glow"></span>
      <div class="eq eq-large">${'<i></i>'.repeat(9)}</div>
      <span class="teaser-note">${icon('headphones', 22)}</span>
    </div>
  </a>`;
}

function sampleBanner(settings) {
  if (!settings.sampleData) return '';
  return `<div class="notice notice-sample">
    <span class="notice-icon">${icon('sparkles', 19)}</span>
    <div><strong>Sample nights are loaded</strong><span>Explore the dashboard and insights, then clear them when you’re ready to log your own.</span></div>
    <button type="button" class="btn btn-small btn-ghost" data-action="clear-sample">Clear sample</button>
  </div>`;
}

function emptyHero() {
  return `<section class="card hero hero-empty">
    <div class="empty-art" aria-hidden="true">
      <div class="moon-art"></div>
      <span class="star star-a"></span><span class="star star-b"></span><span class="star star-c"></span>
      <span class="orbit"></span>
    </div>
    <div class="hero-main">
      <span class="pill pill-live"><span class="dot"></span>Your first night</span>
      <h2>Sleep is a pattern.<br>Start with one night.</h2>
      <p class="hero-sub">Log bedtime, wake time and how you felt. Somnia turns those entries into a weekly rhythm, a sleep score, and advice that references your own numbers.</p>
      <div class="hero-actions">
        <button type="button" class="btn btn-primary" data-action="log-new">${icon('plus', 17)} Log last night</button>
        <button type="button" class="btn btn-ghost" data-action="load-sample">Explore with sample data</button>
      </div>
      <p class="privacy-line">${icon('lock', 14)} Private by default · stored only in this browser</p>
    </div>
  </section>`;
}

function howItWorks() {
  const items = [
    {
      icon: 'pencil',
      title: 'Track the honest version',
      body: 'Bedtime, wake time, how long it took to drift off, and what the night felt like. Two minutes in the morning.',
    },
    {
      icon: 'chart',
      title: 'See the pattern',
      body: 'A weekly rhythm chart, a 0–100 sleep score, and simple factors — not a wall of wearable data.',
    },
    {
      icon: 'moon',
      title: 'Get one good next step',
      body: 'Advice tied to your numbers: when to start winding down, where caffeine is landing, how to steady your wake time.',
    },
  ];
  return `<div class="feature-grid">${items
    .map(
      (item) => `<article class="card feature-card">
        <span class="feature-icon">${icon(item.icon, 21)}</span>
        <h3>${item.title}</h3>
        <p>${item.body}</p>
      </article>`,
    )
    .join('')}</div>`;
}

function hero(stats, settings) {
  const night = stats.lastNight;
  const duration = nightDuration(night);
  const target = settings.sleepGoal * 60;
  const score = stats.lastNightScore.score;
  const label =
    night.date === todayKey() || night.date === addDays(todayKey(), -1)
      ? 'Last night'
      : 'Latest night';
  return `<section class="card hero">
    <div class="hero-main">
      <div class="hero-meta-top">
        <span class="pill pill-live"><span class="dot"></span>${label}</span>
        <span class="muted">${formatLongDate(night.date)}</span>
      </div>
      <h2>You slept ${formatDuration(duration)}.</h2>
      <p class="hero-sub">${formatTime(night.bedTime)} <span class="arrow">→</span> ${formatTime(night.wakeTime)}
        <span class="dot-sep">·</span> ${qualityLabel(night.quality)}</p>
      <div class="hero-chips">
        <span class="chip">${icon('target', 15)} ${formatDelta(duration - target)} vs goal</span>
        <span class="chip">${icon('wind', 15)} ${formatDuration(night.latencyMin)} to fall asleep</span>
        <span class="chip">${icon('bed', 15)} ${plural(night.awakenings, 'wake-up')}</span>
      </div>
      <div class="hero-actions">
        <button type="button" class="btn btn-primary" data-action="log-edit" data-id="${escapeHtml(night.id)}">${icon('pencil', 16)} Edit night</button>
        <a class="btn btn-ghost" href="#insights">See the breakdown</a>
      </div>
    </div>
    <div class="hero-score">
      ${scoreRing(score)}
      <div class="score-caption">
        <strong>${qualityLabel(night.quality)} night</strong>
        <span>Duration ${stats.lastNightScore.parts.duration} · Rest ${stats.lastNightScore.parts.rest} · Timing ${stats.lastNightScore.parts.timing}</span>
      </div>
    </div>
  </section>`;
}

function advicePreview(advice) {
  if (!advice.length) return '';
  return `<section class="section">
    <div class="section-head">
      <div><p class="kicker">Personal guidance</p><h2>What to try next</h2></div>
      <a class="text-link" href="#insights">All guidance ${icon('arrowRight', 15)}</a>
    </div>
    <div class="advice-grid">${advice.slice(0, 2).map(adviceCard).join('')}</div>
  </section>`;
}

export function viewToday({ settings, nights, stats, advice, plan }) {
  const firstName = settings.name.trim().split(/\s+/)[0];
  const title = `${sleepGreeting()}${firstName ? `, ${escapeHtml(firstName)}` : ''}.`;
  const lede = nights.length
    ? 'Here’s how the last week is landing — and the one thing worth changing next.'
    : 'A calm, private sleep diary that turns a few notes into a pattern you can work with.';
  const head = pageHead({
    eyebrow: formatLongDate(todayKey()),
    title,
    lede,
    actions: `<button type="button" class="btn btn-primary" data-action="log-new">${icon('plus', 17)} Log sleep</button>`,
  });

  if (!nights.length) {
    return `${head}${sampleBanner(settings)}${emptyHero()}${howItWorks()}<div class="single-grid">${planCard(plan, stats, settings)}</div>${musicTeaser()}`;
  }

  return `${head}
    ${sampleBanner(settings)}
    ${hero(stats, settings)}
    ${statGrid(stats, settings)}
    <div class="dashboard-grid">
      ${planCard(plan, stats, settings)}
      <section class="card chart-card">
        <div class="card-head">
          <div><p class="kicker">Last ${stats.recent.length} nights</p><h2>Sleep rhythm</h2></div>
          <a class="text-link" href="#insights">Details ${icon('arrowRight', 15)}</a>
        </div>
        ${durationChart(stats.recent, settings, { compact: true })}
      </section>
    </div>
    ${advicePreview(advice)}
    ${musicTeaser()}`;
}

function rhythmChart(nights, settings) {
  if (!nights.length) return '<div class="chart-empty">Your sleep window will appear here.</div>';
  const start = 1200;
  const end = 2160;
  const width = 760;
  const height = 64 + nights.length * 38;
  const left = 62;
  const right = 20;
  const top = 32;
  const bottom = 30;
  const plotHeight = height - top - bottom;
  const plotWidth = width - left - right;
  const xFor = (minutes) => left + ((clamp(minutes, start, end) - start) / (end - start)) * plotWidth;
  const clock = (time) => {
    let minutes = timeToMinutes(time);
    if (minutes < 720) minutes += 1440;
    return clamp(minutes, start, end);
  };

  const targetBed = clock(settings.targetBedtime);
  const targetWake = clock(settings.targetWake);
  const ticks = [1260, 1440, 1620, 1800, 1980, 2160];
  const rowHeight = plotHeight / nights.length;

  return `<div class="rhythm-scroll">
    <svg class="rhythm-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Bedtime and wake time for the last ${nights.length} nights">
      <rect class="goal-window" x="${xFor(targetBed).toFixed(1)}" y="${top}" width="${Math.max(
        4,
        xFor(targetWake) - xFor(targetBed),
      ).toFixed(1)}" height="${plotHeight}" rx="10"></rect>
      <text class="goal-label" x="${(xFor(targetBed) + 8).toFixed(1)}" y="${top - 11}">goal window</text>
      ${ticks
        .map(
          (tick) => `<g>
            <line class="rhythm-grid" x1="${xFor(tick)}" y1="${top}" x2="${xFor(tick)}" y2="${top + plotHeight}"></line>
            <text class="axis-label" x="${xFor(tick)}" y="${height - 8}" text-anchor="middle">${formatMinutesAsTime(tick)}</text>
          </g>`,
        )
        .join('')}
      ${nights
        .map((night, index) => {
          const y = top + rowHeight * index + rowHeight / 2;
          const bed = clock(night.bedTime);
          const wake = clock(night.wakeTime);
          const band = scoreBand(scoreNight(night, settings).score);
          return `<g>
            <text class="row-label" x="${left - 12}" y="${y + 4}" text-anchor="end">${weekdayName(night.date)} ${dateFromKey(night.date).getDate()}</text>
            <rect class="rhythm-bar band-${band}" x="${xFor(bed).toFixed(1)}" y="${(y - 8).toFixed(1)}" width="${Math.max(7, xFor(wake) - xFor(bed)).toFixed(1)}" height="16" rx="8">
              <title>${escapeHtml(`${formatDate(night.date)}: ${formatTime(night.bedTime)} to ${formatTime(night.wakeTime)} · ${formatDuration(nightDuration(night))}`)}</title>
            </rect>
          </g>`;
        })
        .join('')}
    </svg>
  </div>
  <div class="chart-legend rhythm-legend">
    <span><i class="legend-swatch legend-window"></i>Sleep window</span>
    <span><i class="legend-swatch band-good"></i>Stronger night</span>
    <span><i class="legend-swatch band-low"></i>Shorter night</span>
  </div>`;
}

function factorSection(factorAnalysis) {
  if (!factorAnalysis.length) {
    return `<section class="card factor-card">
      <div class="card-head"><div><p class="kicker">Tags</p><h2>What moves your sleep</h2></div></div>
      <p class="empty-copy">Add tags like caffeine, screens or exercise for a few nights. Once there are enough, Somnia can compare nights with and without them.</p>
    </section>`;
  }
  const rows = factorAnalysis.slice(0, 5);
  const maxAverage = Math.max(...rows.flatMap((factor) => [factor.avgDurationWith, factor.avgDurationWithout]));
  return `<section class="card factor-card">
    <div class="card-head"><div><p class="kicker">Tags</p><h2>What moves your sleep</h2></div><span class="pill pill-soft">Duration, with vs without</span></div>
    <div class="factor-list">
      ${rows
        .map((factor) => {
          const widthWith = clamp((factor.avgDurationWith / maxAverage) * 100, 8, 100);
          const widthWithout = clamp((factor.avgDurationWithout / maxAverage) * 100, 8, 100);
          const positive = factor.durationDelta >= 0;
          return `<div class="factor-item">
            <span class="factor-icon tone-${factor.tone}">${icon(factor.icon, 18)}</span>
            <div class="factor-body">
              <div class="factor-top"><strong>${factor.label}</strong><span>${factor.count} of ${factor.total} nights · quality ${factor.qualityDelta > 0 ? '+' : ''}${factor.qualityDelta.toFixed(1)}</span></div>
              <div class="compare">
                <div class="compare-row"><span>With</span><div class="compare-track"><i style="width:${widthWith}%"></i></div><b>${formatDuration(factor.avgDurationWith)}</b></div>
                <div class="compare-row"><span>Without</span><div class="compare-track is-muted"><i style="width:${widthWithout}%"></i></div><b>${formatDuration(factor.avgDurationWithout)}</b></div>
              </div>
            </div>
            <span class="factor-delta ${positive ? 'is-positive' : 'is-negative'}">${formatDelta(factor.durationDelta)}</span>
          </div>`;
        })
        .join('')}
    </div>
    <p class="footnote">A correlation in your diary, not proof of cause. A few more tagged nights will sharpen it.</p>
  </section>`;
}

export function viewInsights({ settings, nights, stats, advice }) {
  const head = pageHead({
    eyebrow: 'Insights',
    title: nights.length ? 'Patterns, not perfection.' : 'Patterns need a few nights.',
    lede: nights.length
      ? 'Your last week in context: how long you slept, how steady the rhythm was, and what your own notes suggest.'
      : 'Log three or four nights and this page starts comparing sleep duration, timing and the factors you tag.',
    actions: nights.length
      ? `<button type="button" class="btn btn-ghost" data-action="log-new">${icon('plus', 17)} Add a night</button>`
      : '',
  });

  if (!nights.length) {
    return `${head}${sampleBanner(settings)}<section class="card empty-panel">
      <span class="empty-panel-icon">${icon('chart', 26)}</span>
      <h2>Nothing to chart yet</h2>
      <p>Start with last night — even an approximate bedtime and wake time is enough. Or load sample data to see how the app works.</p>
      <div class="button-row center">
        <button type="button" class="btn btn-primary" data-action="log-new">${icon('plus', 17)} Log my night</button>
        <button type="button" class="btn btn-ghost" data-action="load-sample">Explore sample data</button>
      </div>
    </section>`;
  }

  return `${head}
    ${sampleBanner(settings)}
    ${statGrid(stats, settings)}
    <section class="card chart-card chart-wide">
      <div class="card-head">
        <div><p class="kicker">Sleep duration</p><h2>Against your ${formatDuration(settings.sleepGoal * 60)} goal</h2></div>
        <span class="pill pill-soft">${plural(stats.recent.length, 'night')} logged</span>
      </div>
      ${durationChart(stats.recent, settings)}
    </section>
    <section class="card chart-card">
      <div class="card-head">
        <div><p class="kicker">Body clock</p><h2>Your sleep window</h2></div>
        <span class="pill pill-soft">Goal ${formatTime(settings.targetBedtime)}–${formatTime(settings.targetWake)}</span>
      </div>
      ${rhythmChart(stats.recent, settings)}
    </section>
    <section class="section">
      <div class="section-head">
        <div><p class="kicker">Personal guidance</p><h2>What your week is asking for</h2></div>
      </div>
      <div class="advice-grid">${advice.map(adviceCard).join('')}</div>
    </section>
    ${factorSection(stats.factorAnalysis)}
    <section class="card disclaimer">
      <span class="disclaimer-icon">${icon('info', 18)}</span>
      <p><strong>A note on advice.</strong> Somnia offers general sleep-wellbeing guidance based on the entries you make. It is not a medical device and does not diagnose or treat insomnia or any health condition. If sleep problems persist or affect your daytime life, talk with a clinician.</p>
    </section>`;
}

function journalEntry(night, settings) {
  const duration = nightDuration(night);
  const score = scoreNight(night, settings).score;
  const factors = night.factors
    .map((id) => FACTORS.find((factor) => factor.id === id))
    .filter(Boolean);
  const date = dateFromKey(night.date);
  return `<article class="night-entry">
    <div class="night-day"><strong>${date.getDate()}</strong><span>${new Intl.DateTimeFormat(undefined, { month: 'short' }).format(date)}</span></div>
    <div class="night-info">
      <div class="night-headline">
        <strong>${formatDuration(duration)}</strong>
        <span class="quality-badge">${qualityDots(night.quality)} ${qualityLabel(night.quality)}</span>
        <span class="score-pill band-${scoreBand(score)}">${score}</span>
      </div>
      <p class="night-times">${formatTime(night.bedTime)} → ${formatTime(night.wakeTime)} <span>·</span> ${formatDuration(night.latencyMin)} to fall asleep <span>·</span> ${plural(night.awakenings, 'wake-up')}</p>
      ${factors.length ? `<div class="tag-row">${factors.map((factor) => `<span class="factor-tag tone-${factor.tone}">${icon(factor.icon, 13)} ${factor.short}</span>`).join('')}</div>` : ''}
      ${night.note ? `<p class="night-note">“${escapeHtml(night.note)}”</p>` : ''}
    </div>
    <div class="night-actions">
      <button type="button" class="icon-btn" data-action="log-edit" data-id="${escapeHtml(night.id)}" aria-label="Edit ${formatDate(night.date)}">${icon('pencil', 17)}</button>
      <button type="button" class="icon-btn danger" data-action="log-delete" data-id="${escapeHtml(night.id)}" aria-label="Delete ${formatDate(night.date)}">${icon('trash', 17)}</button>
    </div>
  </article>`;
}

export function viewJournal({ settings, nights }) {
  const head = pageHead({
    eyebrow: 'Journal',
    title: 'Your nights, in writing.',
    lede: 'Every entry sharpens the pattern. Edit a night if you remembered it differently.',
    actions: `<button type="button" class="btn btn-primary" data-action="log-new">${icon('plus', 17)} Log sleep</button>`,
  });

  if (!nights.length) {
    return `${head}${sampleBanner(settings)}<section class="card empty-panel">
      <span class="empty-panel-icon">${icon('book', 26)}</span>
      <h2>The journal is open</h2>
      <p>Start with last night. You can always come back and fill in the details.</p>
      <div class="button-row center">
        <button type="button" class="btn btn-primary" data-action="log-new">${icon('plus', 17)} Log my night</button>
        <button type="button" class="btn btn-ghost" data-action="load-sample">Load sample nights</button>
      </div>
    </section>`;
  }

  const groups = new Map();
  [...nights]
    .sort((a, b) => b.date.localeCompare(a.date))
    .forEach((night) => {
      const key = monthKey(night.date);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(night);
    });

  return `${head}
    ${sampleBanner(settings)}
    <div class="journal-toolbar">
      <span class="muted">${plural(nights.length, 'night')} logged</span>
      <div class="button-row">
        <button type="button" class="btn btn-small btn-ghost" data-action="export">${icon('download', 15)} Export</button>
        <button type="button" class="btn btn-small btn-ghost" data-action="import">${icon('upload', 15)} Import</button>
      </div>
    </div>
    <input id="import-file" type="file" accept="application/json,.json" hidden>
    ${[...groups.entries()]
      .map(
        ([key, entries]) => `<section class="journal-group">
          <div class="group-head"><h2>${monthLabel(key)}</h2><span>${plural(entries.length, 'night')}</span></div>
          <div class="journal-list">${entries.map((night) => journalEntry(night, settings)).join('')}</div>
        </section>`,
      )
      .join('')}`;
}

function soundDeck(soundState) {
  const active = SOUNDS.find((sound) => sound.id === soundState.activeId);
  const remaining = soundState.remainingMs;
  const volumePct = Math.round(soundState.volume * 100);
  return `<section class="card sound-deck">
    <div class="card-head">
      <div>
        <p class="kicker">Generated locally</p>
        <h2>Soundscapes</h2>
        <p class="card-sub">No files to stream, no account needed. Pick a texture and let the timer take it from there.</p>
      </div>
      <span class="pill ${active ? 'pill-live' : 'pill-soft'}">${active ? `<span class="dot"></span>${active.name}` : 'Nothing playing'}</span>
    </div>
    <div class="sound-grid">
      ${SOUNDS.map(
        (sound) => `<button type="button" class="sound-card ${soundState.activeId === sound.id ? 'is-playing' : ''}" data-sound-card="${sound.id}" data-action="sound-toggle" data-sound="${sound.id}" aria-pressed="${soundState.activeId === sound.id}" style="--sound-color:${sound.color};--sound-accent:${sound.accent}">
          <span class="sound-top">
            <span class="sound-icon">${icon(sound.icon, 22)}</span>
            <span class="sound-eq" aria-hidden="true">${'<i></i>'.repeat(5)}</span>
          </span>
          <span class="sound-name">${sound.name}</span>
          <span class="sound-description">${sound.description}</span>
          <span class="sound-play">
            <span class="when-idle">${icon('play', 15)} Play</span>
            <span class="when-playing">${icon('pause', 15)} Playing</span>
          </span>
        </button>`,
      ).join('')}
    </div>
    <div class="sound-controls">
      <label class="volume-control">
        ${icon('volume', 18)}
        <input id="sound-volume" type="range" min="0" max="100" step="1" value="${volumePct}" aria-label="Sound volume">
        <span class="js-volume-value">${volumePct}%</span>
      </label>
      <div class="timer-row">
        <span class="timer-label">${icon('timer', 16)} Sleep timer</span>
        <div class="timer-chips">
          ${[0, 15, 30, 45, 60]
            .map(
              (minutes) => `<button type="button" class="chip-btn ${soundState.timerMinutes === minutes ? 'is-active' : ''}" data-action="sound-timer" data-minutes="${minutes}" aria-pressed="${soundState.timerMinutes === minutes}">${minutes ? `${minutes}m` : 'Off'}</button>`,
            )
            .join('')}
        </div>
        <span class="js-timer-left timer-left">${remaining ? `Ends in ${formatCountdown(remaining)}` : 'No timer'}</span>
      </div>
    </div>
  </section>`;
}

export function spotifyPlaylistGrid(spotify) {
  return playlistGrid(spotify);
}

function playlistGrid(spotify) {
  const query = spotify.search.trim().toLowerCase();
  const playlists = spotify.playlists.filter(
    (playlist) =>
      !query ||
      playlist.name.toLowerCase().includes(query) ||
      playlist.owner.toLowerCase().includes(query),
  );
  if (!playlists.length) {
    return `<p class="empty-copy">${spotify.playlists.length ? 'No playlists match that search.' : 'No playlists found in this Spotify account.'}</p>`;
  }
  return `<div class="playlist-grid">${playlists
    .map(
      (playlist) => `<article class="playlist-card">
        <div class="playlist-art">${playlist.image ? `<img src="${escapeHtml(playlist.image)}" alt="" loading="lazy">` : `<span>${icon('music', 22)}</span>`}</div>
        <div class="playlist-info">
          <strong title="${escapeHtml(playlist.name)}">${escapeHtml(playlist.name)}</strong>
          <span>${playlist.trackCount ? plural(playlist.trackCount, 'track') : 'Playlist'}${playlist.owner ? ` · ${escapeHtml(playlist.owner)}` : ''}</span>
        </div>
        <div class="playlist-actions">
          ${playlist.url ? `<a class="icon-btn" href="${escapeHtml(playlist.url)}" target="_blank" rel="noopener" aria-label="Open ${escapeHtml(playlist.name)} in Spotify">${icon('external', 16)}</a>` : ''}
          <button type="button" class="icon-btn accent" data-action="spotify-play" data-uri="${escapeHtml(playlist.uri)}" aria-label="Play ${escapeHtml(playlist.name)}">${icon('play', 16)}</button>
        </div>
      </article>`,
    )
    .join('')}</div>`;
}

export function spotifyPanelBody({ settings, spotify, redirect }) {
  const clientReady = Boolean(settings.spotifyClientId);

  if (!spotify.connected) {
    return `<div class="spotify-head">
      <div class="spotify-title">
        <span class="provider-orb provider-spotify">${icon('music', 21)}</span>
        <div><p class="kicker">Streaming</p><h2>${clientReady ? 'Connect Spotify' : 'Bring your own playlists'}</h2></div>
      </div>
      <span class="pill pill-soft">Optional</span>
    </div>
    ${
      clientReady
        ? `<p class="spotify-copy">Your Client ID is saved in this browser. Connect your account to pull in playlists and send playback to a Spotify device that’s already open.</p>
          <div class="spotify-actions">
            <button type="button" class="btn btn-primary" data-action="spotify-connect">${icon('music', 17)} Connect Spotify</button>
            <button type="button" class="text-link" data-action="settings-open" data-section="music">Spotify settings</button>
          </div>
          <p class="footnote">You’ll be sent to Spotify to approve read access to your playlists and playback control. Nothing is sent to a Somnia server.</p>`
        : `<p class="spotify-copy">Spotify is the one platform with a browser-safe account connection. Add a free developer Client ID once, then your own playlists and devices show up here. Apple Music, YouTube Music, Amazon Music and SoundCloud open directly in their apps below.</p>
          <div class="setup-steps">
            <div><span>1</span><p>Create a free app in the Spotify developer dashboard.</p></div>
            <div><span>2</span><p>Add this exact redirect URI: <code>${escapeHtml(redirect)}</code></p></div>
            <div><span>3</span><p>Paste the Client ID into Somnia’s music settings.</p></div>
          </div>
          <div class="spotify-actions">
            <button type="button" class="btn btn-primary" data-action="settings-open" data-section="music">${icon('sliders', 17)} Set up Spotify</button>
            <a class="text-link" href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener">Developer dashboard ${icon('external', 14)}</a>
          </div>
          <p class="footnote">Optional. The generated soundscapes above work without any account.</p>`
    }`;
  }

  if (!spotify.loaded || spotify.loading) {
    return `<div class="spotify-head">
      <div class="spotify-title"><span class="provider-orb provider-spotify">${icon('music', 21)}</span><div><p class="kicker">Streaming</p><h2>Spotify</h2></div></div>
      <span class="pill pill-live"><span class="dot"></span>Connected</span>
    </div>
    <div class="loading-panel"><span class="spinner"></span><p>Gathering your playlists and devices…</p></div>`;
  }

  const name = spotify.profile?.display_name || 'Spotify listener';
  const image = spotify.profile?.images?.[0]?.url || '';
  const devices = spotify.devices;
  return `<div class="spotify-head">
    <div class="spotify-title"><span class="provider-orb provider-spotify">${icon('music', 21)}</span><div><p class="kicker">Connected</p><h2>Your Spotify library</h2></div></div>
    <button type="button" class="text-link danger-text" data-action="spotify-disconnect">Disconnect</button>
  </div>
  <div class="spotify-profile">
    <span class="spotify-avatar">${image ? `<img src="${escapeHtml(image)}" alt="">` : initials(name)}</span>
    <div><strong>${escapeHtml(name)}</strong><span>${plural(spotify.playlists.length, 'playlist')} available</span></div>
    <button type="button" class="icon-btn" data-action="spotify-refresh" aria-label="Refresh Spotify data">${icon('refresh', 17)}</button>
  </div>
  ${spotify.error ? `<div class="notice notice-warn"><span class="notice-icon">${icon('alert', 18)}</span><div><strong>Spotify had trouble</strong><span>${escapeHtml(spotify.error)}</span></div><button type="button" class="btn btn-small btn-ghost" data-action="spotify-refresh">Retry</button></div>` : ''}
  ${spotify.warning && !spotify.error ? `<div class="notice notice-soft"><span class="notice-icon">${icon('info', 18)}</span><div><span>${escapeHtml(spotify.warning)}</span></div></div>` : ''}
  <div class="spotify-toolbar">
    <label class="search-field">${icon('search', 16)}<input id="spotify-search" type="search" placeholder="Find a playlist" value="${escapeHtml(spotify.search)}" aria-label="Search Spotify playlists"></label>
    <div class="device-picker">
      <span class="device-icon">${icon('speaker', 16)}</span>
      <select id="spotify-device" aria-label="Spotify playback device">
        <option value="">Auto / active device</option>
        ${devices.map((device) => `<option value="${escapeHtml(device.id)}" ${spotify.selectedDevice === device.id ? 'selected' : ''}>${escapeHtml(device.name)}${device.active ? ' · active' : ''}${device.restricted ? ' · restricted' : ''}</option>`).join('')}
      </select>
      <button type="button" class="icon-btn" data-action="spotify-refresh" aria-label="Refresh playback devices">${icon('refresh', 15)}</button>
    </div>
  </div>
  <div id="spotify-list">${playlistGrid(spotify)}</div>
  <p class="footnote">${devices.length ? 'Playback starts on the selected device. Keep Spotify open there.' : 'Open Spotify on your phone or computer so Somnia has somewhere to send playback.'} Premium is required by Spotify for playback control.</p>`;
}

function providersSection(settings) {
  const provider = getProvider(settings.defaultProvider);
  return `<section class="card providers-card">
    <div class="card-head">
      <div><p class="kicker">Your player, your ritual</p><h2>Hand off to any platform</h2><p class="card-sub">Choose where you listen. Somnia opens a sleep-ready search right in that app or web player.</p></div>
    </div>
    <div class="provider-tabs" role="group" aria-label="Choose a streaming platform">
      ${PROVIDERS.map(
        (item) => `<button type="button" class="provider-tab ${item.id === provider.id ? 'is-active' : ''}" data-action="provider-select" data-provider="${item.id}" aria-pressed="${item.id === provider.id}">
          <span class="provider-dot" style="--provider-color:${item.color}"></span>${item.name}
        </button>`,
      ).join('')}
    </div>
    <p class="provider-note">${provider.note}</p>
    <div class="mix-grid">
      ${MIXES.map(
        (mix) => `<a class="mix-card" href="${provider.search(mix.term)}" target="_blank" rel="noopener" style="--provider-color:${provider.color}">
          <span class="mix-icon">${icon(mix.icon, 20)}</span>
          <span class="mix-copy"><small>${provider.name}</small><strong>${mix.title}</strong><span>${mix.description}</span></span>
          <span class="mix-arrow">${icon('external', 16)}</span>
        </a>`,
      ).join('')}
    </div>
    <p class="footnote">Only Spotify supports an account connection here; the others open through their own links. On mobile, those links hand off to the installed app when available.</p>
  </section>`;
}

export function viewSounds({ settings, soundState, spotify, redirect }) {
  return `${pageHead({
    eyebrow: 'Sound room',
    title: 'A softer landing.',
    lede: 'Start with a soundscape you can generate offline, or take your own playlists into the night.',
  })}
  ${soundDeck(soundState)}
  <section class="card spotify-card" id="spotify-panel">${spotifyPanelBody({ settings, spotify, redirect })}</section>
  ${providersSection(settings)}
  <p class="privacy-line center-line">${icon('lock', 14)} Soundscapes are synthesized on this device. Streaming links open only when you choose them.</p>`;
}

export function viewSettings({ settings, connected, redirect, nightCount, storageBytes }) {
  return `<div class="drawer-backdrop" data-action="settings-close"></div>
  <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="settings-title">
    <header class="drawer-head">
      <div><p class="kicker">Preferences</p><h2 id="settings-title">Settings</h2></div>
      <button type="button" class="icon-btn" data-action="settings-close" aria-label="Close settings">${icon('close', 19)}</button>
    </header>
    <form id="settings-form" class="drawer-body">
      <section class="settings-section">
        <h3>About you</h3>
        <label class="field"><span>Name</span><input name="name" value="${escapeHtml(settings.name)}" maxlength="60" placeholder="What should we call you?" autocomplete="nickname"></label>
        <label class="field"><span>Sleep goal</span>
          <div class="range-row">
            <input id="goal-range" name="sleepGoal" type="range" min="6" max="10" step="0.5" value="${settings.sleepGoal}">
            <output id="goal-output">${settings.sleepGoal}h</output>
          </div>
          <small>Most adults do best with 7–9 hours. Your score and advice use this target.</small>
        </label>
      </section>
      <section class="settings-section">
        <h3>Sleep schedule</h3>
        <div class="field-grid">
          <label class="field"><span>Target bedtime</span><input name="targetBedtime" type="time" value="${escapeHtml(settings.targetBedtime)}" required></label>
          <label class="field"><span>Target wake</span><input name="targetWake" type="time" value="${escapeHtml(settings.targetWake)}" required></label>
        </div>
        <p class="field-note">Used for your sleep score, tonight’s wind-down plan and timing advice.</p>
      </section>
      <section class="settings-section" id="settings-music">
        <h3>Music & streaming</h3>
        <label class="field"><span>Default platform</span>
          <select name="defaultProvider">
            ${PROVIDERS.map((provider) => `<option value="${provider.id}" ${provider.id === settings.defaultProvider ? 'selected' : ''}>${provider.name}</option>`).join('')}
          </select>
        </label>
        <div class="spotify-setup">
          <div class="setup-heading"><strong>Spotify connection</strong><span class="pill pill-soft">Optional</span></div>
          <p class="field-note">Add this exact redirect URI to your Spotify app. It must match, character for character.</p>
          <div class="copy-row"><code>${escapeHtml(redirect)}</code><button type="button" class="btn btn-small btn-ghost" data-action="copy-redirect">${icon('copy', 15)} Copy</button></div>
          <label class="field"><span>Spotify Client ID</span><input id="spotify-client-input" name="spotifyClientId" value="${escapeHtml(settings.spotifyClientId)}" placeholder="Paste your 32-character Client ID" autocomplete="off" spellcheck="false"></label>
          <div class="setup-actions">
            ${
              connected
                ? `<span class="status-ok">${icon('check', 15)} Connected</span><button type="button" class="btn btn-small btn-danger-ghost" data-action="spotify-disconnect">Disconnect</button>`
                : `<button type="button" class="btn btn-small btn-primary" data-action="spotify-connect">${icon('music', 15)} ${settings.spotifyClientId ? 'Connect Spotify' : 'Save & connect'}</button>`
            }
            <a class="text-link" href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener">Developer dashboard ${icon('external', 14)}</a>
          </div>
          <details class="help">
            <summary>How to set this up</summary>
            <ol>
              <li>Open the Spotify developer dashboard and create an app.</li>
              <li>In the app settings, add the redirect URI shown above.</li>
              <li>Under User Management, add the Spotify account you’ll use (development mode is limited to 5 people).</li>
              <li>Paste the app’s Client ID above and connect.</li>
            </ol>
            <p>Spotify development mode currently requires the app owner to have Premium. Somnia has no backend and no client secret; your tokens stay in this browser.</p>
          </details>
        </div>
      </section>
      <section class="settings-section">
        <h3>Your data</h3>
        <div class="button-row wrap">
          <button type="button" class="btn btn-small btn-ghost" data-action="export">${icon('download', 15)} Export JSON</button>
          <button type="button" class="btn btn-small btn-ghost" data-action="import">${icon('upload', 15)} Import backup</button>
          <button type="button" class="btn btn-small btn-ghost" data-action="load-sample">${icon('sparkles', 15)} Load sample</button>
        </div>
        <input id="import-file" type="file" accept="application/json,.json" hidden>
        <p class="field-note">${plural(nightCount, 'night')} · ${Math.max(1, Math.round(storageBytes / 1024))} KB stored locally. Nothing is uploaded to Somnia.</p>
        <button type="button" class="btn btn-small btn-danger-ghost" data-action="clear-data">${icon('trash', 15)} Clear journal</button>
      </section>
      <section class="settings-section">
        <h3>Privacy & analytics</h3>
        <div class="spotify-setup">
          <div class="setup-heading"><strong>Usage analytics</strong><span class="pill pill-soft">Optional</span></div>
          <label class="consent-option">
            <input type="checkbox" name="analyticsConsent" ${settings.analyticsConsent ? 'checked' : ''}>
            <span>Share anonymous usage data with PostHog</span>
          </label>
          <p class="field-note">Records the screens you open, finishing setup, logging a night and starting a soundscape, plus your sleep goal and how many nights you have. Your name, notes, sleep times and quality ratings are never sent. Off by default — untick it to delete the saved analytics id and stop every request.</p>
          <label class="field"><span>PostHog project API key</span><input name="posthogKey" value="${escapeHtml(settings.posthogKey)}" placeholder="phc_…" autocomplete="off" spellcheck="false"></label>
          <p class="field-note">Create a free project at <a class="text-link" href="https://posthog.com" target="_blank" rel="noopener">posthog.com</a> and paste its project API key. That key can only write events, so it is safe to keep in this browser.</p>
        </div>
      </section>
      <section class="settings-section about-section">
        <h3>About Somnia</h3>
        <p>A local-first sleep diary and wind-down companion. No account and no uploads: your entries stay in this browser. Usage analytics is optional and off until you turn it on above. Spotify requests happen only after you connect your own account. External music links open only when you tap them.</p>
        <p class="fine-print">Somnia is not a medical device and does not diagnose or treat any condition. If sleep problems persist, speak with a clinician.</p>
      </section>
    </form>
    <footer class="drawer-foot">
      <button type="button" class="btn btn-primary btn-block" data-action="settings-save">Save changes</button>
    </footer>
  </aside>`;
}

export function viewOnboarding({ step, draft }) {
  const titles = [
    { kicker: 'Welcome to Somnia', title: 'Better sleep starts with noticing.', body: 'A private diary, a weekly pattern, and guidance that points at your own numbers — not someone else’s ideal.' },
    { kicker: 'Your rhythm', title: 'Pick a window to protect.', body: 'A steady wake time matters more than a perfect bedtime. Choose something realistic, then adjust as you learn.' },
    { kicker: 'Wind down', title: 'Choose your soundtrack.', body: 'Somnia can generate soundscapes offline and hand off to the music app you already use. You can change this any time.' },
  ];
  const current = titles[step];
  const goalOptions = GOAL_OPTIONS.map(
    (option) => `<label class="goal-option ${Number(draft.sleepGoal) === option.value ? 'is-selected' : ''}">
      <input type="radio" name="onboardGoal" value="${option.value}" ${Number(draft.sleepGoal) === option.value ? 'checked' : ''}>
      <strong>${option.note}</strong><span>${option.label}</span>
    </label>`,
  ).join('');
  const providerOptions = PROVIDERS.map(
    (provider) => `<label class="provider-choice ${draft.provider === provider.id ? 'is-selected' : ''}">
      <input type="radio" name="onboardProvider" value="${provider.id}" ${draft.provider === provider.id ? 'checked' : ''}>
      <span class="provider-dot" style="--provider-color:${provider.color}"></span>
      <span class="provider-choice-copy"><strong>${provider.name}</strong><small>${provider.note}</small></span>
    </label>`,
  ).join('');

  const body =
    step === 0
      ? `<label class="field"><span>What should we call you?</span><input id="onboard-name" name="onboardName" value="${escapeHtml(draft.name)}" maxlength="60" placeholder="Your first name (optional)" autocomplete="given-name" autofocus></label>
        <div class="field"><span>How much sleep feels right?</span><div class="goal-options">${goalOptions}</div><small class="field-note">A range, not a rule. 8 hours is a good starting point for most adults.</small></div>`
      : step === 1
        ? `<div class="field-grid">
            <label class="field"><span>Target bedtime</span><input id="onboard-bedtime" name="onboardBedtime" type="time" value="${escapeHtml(draft.targetBedtime)}" required></label>
            <label class="field"><span>Target wake time</span><input id="onboard-wake" name="onboardWake" type="time" value="${escapeHtml(draft.targetWake)}" required></label>
          </div>
          <div class="onboarding-window" id="onboard-window">That’s ${formatDuration(
            ((timeToMinutes(draft.targetWake) - timeToMinutes(draft.targetBedtime) + 1440) % 1440) || 0,
          )} in bed.</div>
          <div class="onboard-note">${icon('info', 16)} If you’re not sure, start with 11:00 PM to 7:00 AM. You can change it after a week of real nights.</div>`
        : `<div class="provider-choice-list">${providerOptions}</div>
          <div class="privacy-card">${icon('lock', 18)}<div><strong>Everything stays on this device.</strong><p>Sleep entries are stored in your browser’s local storage. No account, no cloud. Export a backup any time.</p></div></div>
          <label class="consent-option">
            <input type="checkbox" name="onboardConsent" ${draft.consent ? 'checked' : ''}>
            <span>Share anonymous usage data so we can see which parts of Somnia help. Optional, never your sleep details.</span>
          </label>`;

  return `<div class="onboarding">
    <div class="onboarding-glow" aria-hidden="true"></div>
    <div class="onboarding-card" role="dialog" aria-modal="true" aria-labelledby="onboard-title">
      <header class="onboarding-head">
        <div class="brand brand-static">${brandMark(36)}<span class="brand-copy"><strong>Somnia</strong><small>sleep, understood</small></span></div>
        <div class="onboarding-head-right"><span>${step + 1} of 3</span><button type="button" class="btn btn-small btn-ghost" data-action="onboard-skip">Skip setup</button></div>
      </header>
      <div class="onboarding-progress" aria-hidden="true">${[0, 1, 2].map((index) => `<span class="${index <= step ? 'is-on' : ''}"></span>`).join('')}</div>
      <form id="onboarding-form">
        <div class="onboarding-body">
          <p class="kicker">${current.kicker}</p>
          <h1 id="onboard-title">${current.title}</h1>
          <p class="onboarding-lede">${current.body}</p>
          ${body}
        </div>
        <footer class="onboarding-foot">
          <div>${step > 0 ? `<button type="button" class="btn btn-ghost" data-action="onboard-back">${icon('arrowLeft', 16)} Back</button>` : '<span></span>'}</div>
          <div class="onboarding-foot-right">
            ${step === 0 ? `<button type="button" class="text-link" data-action="onboard-skip">Use defaults</button>` : ''}
            <button type="button" class="btn btn-primary" data-action="onboard-next">${step === 2 ? 'Start tracking' : `Continue ${icon('arrowRight', 16)}`}</button>
          </div>
        </footer>
      </form>
    </div>
  </div>`;
}

export function viewLogModal({ night, values, settings }) {
  const editing = Boolean(night);
  const qualityOptions = [1, 2, 3, 4, 5]
    .map(
      (value) => `<label class="quality-option ${Number(values.quality) === value ? 'is-selected' : ''}">
        <input type="radio" name="quality" value="${value}" ${Number(values.quality) === value ? 'checked' : ''}>
        <span class="quality-dot"></span><span>${qualityLabel(value)}</span>
      </label>`,
    )
    .join('');
  const duration = nightDuration(values);
  const preview =
    duration > 0 && duration < 1440
      ? `<strong>${formatDuration(duration)}</strong><span>${formatTime(values.bedTime)} → ${formatTime(values.wakeTime)} · ${formatDuration(values.latencyMin)} to fall asleep</span>`
      : '<strong>Check the times</strong><span>Bedtime and wake time can’t be the same.</span>';

  return `<div class="modal-backdrop" data-action="modal-close"></div>
  <div class="modal log-modal" role="dialog" aria-modal="true" aria-labelledby="log-title">
    <header class="modal-head">
      <div><p class="kicker">${editing ? 'Edit entry' : 'Sleep diary'}</p><h2 id="log-title">${editing ? 'Edit your night' : 'How did you sleep?'}</h2></div>
      <button type="button" class="icon-btn" data-action="modal-close" aria-label="Close">${icon('close', 19)}</button>
    </header>
    <form id="log-form">
      <input type="hidden" name="id" value="${escapeHtml(night?.id || '')}">
      <div class="modal-body">
        <div class="field-grid three">
          <label class="field"><span>Wake-up date</span><input name="date" type="date" value="${escapeHtml(values.date)}" max="${todayKey()}" required></label>
          <label class="field"><span>Bedtime</span><input name="bedTime" type="time" value="${escapeHtml(values.bedTime)}" required></label>
          <label class="field"><span>Wake time</span><input name="wakeTime" type="time" value="${escapeHtml(values.wakeTime)}" required></label>
        </div>
        <div class="field-grid">
          <label class="field"><span>Minutes to fall asleep</span><input name="latencyMin" type="number" min="0" max="240" step="1" value="${Number(values.latencyMin) || 0}" inputmode="numeric"></label>
          <label class="field"><span>Wake-ups during the night</span><input name="awakenings" type="number" min="0" max="20" step="1" value="${Number(values.awakenings) || 0}" inputmode="numeric"></label>
        </div>
        <div class="field"><span>How did it feel?</span><div class="quality-picker">${qualityOptions}</div></div>
        <fieldset class="factor-fieldset">
          <legend>What was part of the night?</legend>
          <div class="factor-picker">
            ${FACTORS.map(
              (factor) => `<label class="factor-option tone-${factor.tone}">
                <input type="checkbox" name="factors" value="${factor.id}" ${values.factors.includes(factor.id) ? 'checked' : ''}>
                <span>${icon(factor.icon, 16)} ${factor.label}</span>
              </label>`,
            ).join('')}
          </div>
        </fieldset>
        <label class="field"><span>Anything worth remembering?</span><textarea name="note" rows="3" maxlength="600" placeholder="A late coffee, a racing mind, a really good book…">${escapeHtml(values.note || '')}</textarea></label>
        <div class="log-preview ${duration > 0 && duration < 1440 ? '' : 'is-invalid'}" id="log-preview">${preview}</div>
        <p class="form-error" id="log-error" role="alert" hidden></p>
        <p class="field-note">Times are when you got into bed and when you got up. Your goal is ${formatDuration(settings.sleepGoal * 60)}.</p>
      </div>
      <footer class="modal-foot">
        <button type="button" class="btn btn-ghost" data-action="modal-close">Cancel</button>
        <button type="button" class="btn btn-primary" data-action="log-save">${editing ? 'Save changes' : 'Save night'}</button>
      </footer>
    </form>
  </div>`;
}

export function viewConfirm({ title, body, confirmLabel = 'Confirm', danger = false }) {
  return `<div class="modal-backdrop" data-action="confirm-cancel"></div>
  <div class="modal confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
    <div class="modal-body">
      <span class="confirm-icon ${danger ? 'is-danger' : ''}">${icon(danger ? 'alert' : 'info', 21)}</span>
      <h2 id="confirm-title">${escapeHtml(title)}</h2>
      <p>${escapeHtml(body)}</p>
    </div>
    <footer class="modal-foot">
      <button type="button" class="btn btn-ghost" data-action="confirm-cancel">Cancel</button>
      <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-action="confirm-yes">${escapeHtml(confirmLabel)}</button>
    </footer>
  </div>`;
}
