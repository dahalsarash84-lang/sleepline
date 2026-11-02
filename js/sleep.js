/* Sleep scoring and the rule-based coaching engine. */

import {
  addDays,
  clamp,
  clockDiff,
  dateFromKey,
  formatDuration,
  formatDelta,
  formatMinutesAsTime,
  formatTime,
  mean,
  nightDuration,
  stdDev,
  timeToMinutes,
  todayKey,
} from './utils.js';
import { FACTORS } from './store.js';

export const QUALITY_LABELS = ['', 'Rough', 'Poor', 'Okay', 'Good', 'Great'];

export function qualityLabel(quality) {
  return QUALITY_LABELS[clamp(Math.round(quality), 0, 5)] || 'Okay';
}

export function scoreBand(score) {
  if (score >= 85) return 'great';
  if (score >= 70) return 'good';
  if (score >= 55) return 'fair';
  return 'low';
}

/** A 0–100 score for one night: duration, felt quality, restfulness and timing. */
export function scoreNight(night, settings) {
  const target = settings.sleepGoal * 60;
  const duration = nightDuration(night);
  const delta = duration - target;

  let durationScore;
  if (delta < 0) durationScore = clamp(100 + delta * 0.7, 8, 100);
  else if (delta <= 60) durationScore = 100 - delta * 0.15;
  else durationScore = clamp(91 - (delta - 60) * 0.45, 8, 100);

  const qualityScore = clamp(((night.quality - 1) / 4) * 100, 0, 100);
  const latencyScore = clamp(100 - Math.max(0, night.latencyMin - 15) * 1.15, 10, 100);
  const wakeScore = clamp(100 - night.awakenings * 18, 5, 100);
  const restScore = latencyScore * 0.55 + wakeScore * 0.45;

  const bedDiff = clockDiff(
    timeToMinutes(night.bedTime),
    timeToMinutes(settings.targetBedtime),
  );
  const wakeDiff = clockDiff(
    timeToMinutes(night.wakeTime),
    timeToMinutes(settings.targetWake),
  );
  const timingScore = clamp(100 - bedDiff * 0.35 - wakeDiff * 0.6, 10, 100);

  const score = Math.round(
    durationScore * 0.4 + qualityScore * 0.2 + restScore * 0.2 + timingScore * 0.2,
  );

  return {
    score: clamp(score, 0, 100),
    parts: {
      duration: Math.round(durationScore),
      quality: Math.round(qualityScore),
      rest: Math.round(restScore),
      timing: Math.round(timingScore),
    },
    duration,
  };
}

function bedtimeClock(night) {
  const minutes = timeToMinutes(night.bedTime);
  return minutes < 720 ? minutes + 1440 : minutes;
}

function calculateStreak(nights) {
  const dates = new Set(nights.map((night) => night.date));
  let cursor = todayKey();
  if (!dates.has(cursor)) cursor = addDays(cursor, -1);
  if (!dates.has(cursor)) return 0;
  let streak = 0;
  while (dates.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function analyzeFactors(nights) {
  const results = [];
  for (const factor of FACTORS) {
    const withFactor = nights.filter((night) => night.factors.includes(factor.id));
    const withoutFactor = nights.filter((night) => !night.factors.includes(factor.id));
    if (withFactor.length < 2 || withoutFactor.length < 2) continue;
    const avgWith = mean(withFactor.map(nightDuration));
    const avgWithout = mean(withoutFactor.map(nightDuration));
    results.push({
      ...factor,
      count: withFactor.length,
      total: nights.length,
      avgDurationWith: avgWith,
      avgDurationWithout: avgWithout,
      durationDelta: avgWith - avgWithout,
      qualityDelta: mean(withFactor.map((night) => night.quality)) -
        mean(withoutFactor.map((night) => night.quality)),
    });
  }
  return results.sort(
    (a, b) => Math.abs(b.qualityDelta) * 40 + Math.abs(b.durationDelta) -
      (Math.abs(a.qualityDelta) * 40 + Math.abs(a.durationDelta)),
  );
}

const EMPTY_STATS = {
  count: 0,
  recent: [],
  lastNight: null,
  avgDuration: 0,
  avgQuality: 0,
  avgLatency: 0,
  avgAwakenings: 0,
  avgScore: 0,
  sleepDebt: 0,
  bedStd: 0,
  wakeStd: 0,
  bedSpread: 0,
  wakeSpread: 0,
  consistency: null,
  streak: 0,
  weekendDrift: null,
  weekdayWake: null,
  weekendWake: null,
  trend: null,
  factorAnalysis: [],
  lastNightScore: null,
};

export function computeStats(nights, settings) {
  if (!nights.length) return { ...EMPTY_STATS };

  const sorted = [...nights].sort((a, b) => a.date.localeCompare(b.date));
  const recent = sorted.slice(-7);
  const lastNight = sorted[sorted.length - 1];
  const durations = recent.map(nightDuration);
  const avgDuration = mean(durations);
  const target = settings.sleepGoal * 60;

  const bedValues = recent.map(bedtimeClock);
  const wakeValues = recent.map((night) => timeToMinutes(night.wakeTime));
  const bedStd = recent.length > 1 ? stdDev(bedValues) : 0;
  const wakeStd = recent.length > 1 ? stdDev(wakeValues) : 0;

  const weekendNights = recent.filter((night) => [0, 6].includes(dateFromKey(night.date).getDay()));
  const weekdayNights = recent.filter((night) => ![0, 6].includes(dateFromKey(night.date).getDay()));
  let weekendDrift = null;
  if (weekendNights.length >= 2 && weekdayNights.length >= 2) {
    weekendDrift =
      mean(weekendNights.map((night) => timeToMinutes(night.wakeTime))) -
      mean(weekdayNights.map((night) => timeToMinutes(night.wakeTime)));
  }

  let trend = null;
  if (sorted.length >= 6) {
    const lastThree = sorted.slice(-3).map(nightDuration);
    const previousThree = sorted.slice(-6, -3).map(nightDuration);
    trend = mean(lastThree) - mean(previousThree);
  }

  const scores = recent.map((night) => scoreNight(night, settings).score);
  const sleepDebt = recent.reduce(
    (debt, night) => debt + Math.max(0, target - nightDuration(night)),
    0,
  );

  return {
    count: sorted.length,
    recent,
    lastNight,
    avgDuration,
    avgQuality: mean(recent.map((night) => night.quality)),
    avgLatency: mean(recent.map((night) => night.latencyMin)),
    avgAwakenings: mean(recent.map((night) => night.awakenings)),
    avgScore: Math.round(mean(scores)),
    sleepDebt,
    bedStd,
    wakeStd,
    bedSpread: Math.max(...bedValues) - Math.min(...bedValues),
    wakeSpread: Math.max(...wakeValues) - Math.min(...wakeValues),
    consistency:
      recent.length > 1 ? Math.round(clamp(100 - bedStd * 0.45 - wakeStd * 0.65, 0, 100)) : null,
    streak: calculateStreak(sorted),
    weekendDrift,
    weekdayWake: weekdayNights.length
      ? mean(weekdayNights.map((night) => timeToMinutes(night.wakeTime)))
      : null,
    weekendWake: weekendNights.length
      ? mean(weekendNights.map((night) => timeToMinutes(night.wakeTime)))
      : null,
    trend,
    factorAnalysis: analyzeFactors(sorted.slice(-14)),
    lastNightScore: scoreNight(lastNight, settings),
  };
}

function bedtimeForShift(settings, avgLatency, extraMinutes) {
  const wakeMinutes = timeToMinutes(settings.targetWake);
  const latencyBuffer = clamp(Math.round((avgLatency || 15) / 5) * 5, 10, 30);
  const bed = wakeMinutes - settings.sleepGoal * 60 - latencyBuffer - extraMinutes;
  return formatMinutesAsTime(bed);
}

export function buildAdvice(nights, settings, stats = computeStats(nights, settings)) {
  if (!nights.length) return [];
  const n = stats.recent.length;
  const target = settings.sleepGoal * 60;
  const avg = stats.avgDuration;
  const deficit = target - avg;
  const high = [];
  const medium = [];
  const strengths = [];

  const add = (bucket, item) => bucket.push({ ...item, tone: bucket === strengths ? 'strength' : 'focus' });

  if (n < 3) {
    add(medium, {
      id: 'pattern',
      icon: 'calendar',
      tag: 'Get started',
      title: 'Give it three nights',
      body: `You’ve logged ${n} ${n === 1 ? 'night' : 'nights'} so far. Three or four entries is enough to spot your real pattern — until then, these tips stay deliberately gentle.`,
      action: { label: 'Log a night', action: 'log-new' },
    });
  } else if (deficit > 25) {
    const shift = clamp(Math.ceil(deficit / 15) * 15, 15, 45);
    const suggested = bedtimeForShift(settings, stats.avgLatency, shift);
    const debtLine =
      stats.sleepDebt >= 150
        ? ` Sleep debt is ${formatDuration(stats.sleepDebt)} across the week, so add 20–30 minutes for a few nights rather than one long lie-in.`
        : '';
    add(high, {
      id: 'duration',
      icon: 'moon',
      tag: 'Priority focus',
      title: `Find ${formatDuration(deficit)} more sleep`,
      body: `You averaged ${formatDuration(avg)} across your last ${n} nights — ${formatDuration(deficit)} under your ${formatDuration(target)} goal. A lights-out target around ${suggested} would close most of that gap.${debtLine}`,
      action: { label: 'Adjust my schedule', action: 'settings-open' },
    });
  } else if (avg > target + 75 && stats.avgQuality < 3.6) {
    add(medium, {
      id: 'oversleep',
      icon: 'sun',
      tag: 'Worth trying',
      title: 'Long nights, tired mornings',
      body: `You averaged ${formatDuration(avg)} but rated quality ${stats.avgQuality.toFixed(1)}/5. Extra time in bed isn’t always restorative — try a consistent wake time and see whether quality follows.`,
      action: { label: 'Set a wake target', action: 'settings-open' },
    });
  }

  if (n >= 3 && stats.wakeSpread > 75) {
    const wakeTimes = stats.recent.map((night) => timeToMinutes(night.wakeTime));
    const earliest = formatMinutesAsTime(Math.min(...wakeTimes));
    const latest = formatMinutesAsTime(Math.max(...wakeTimes));
    add(high, {
      id: 'anchor',
      icon: 'alarm',
      tag: 'Priority focus',
      title: 'Anchor your wake time',
      body: `Your wake-up moved by ${formatDuration(stats.wakeSpread)} this week (${earliest} to ${latest}). A steady wake time is one of the strongest signals for your body clock — aim to keep it within 30 minutes, weekends included.`,
      action: { label: 'Adjust wake target', action: 'settings-open' },
    });
  } else if (stats.weekendDrift !== null && stats.weekendDrift > 55) {
    add(medium, {
      id: 'weekend',
      icon: 'calendar',
      tag: 'Worth trying',
      title: 'Ease the weekend lag',
      body: `You wake ${formatDuration(stats.weekendDrift)} later on weekends. That shift can feel like jet lag by Monday. Try moving weekend wake-up halfway toward your weekday time.`,
      action: { label: 'Review schedule', action: 'settings-open' },
    });
  }

  if (stats.avgLatency > 30) {
    add(medium, {
      id: 'latency',
      icon: 'wind',
      tag: 'Worth trying',
      title: 'Build a 20-minute runway',
      body: `It took you ${formatDuration(stats.avgLatency)} to fall asleep on average. Dim the lights, park screens and do something quiet until you feel drowsy. If you’re still awake after 20 minutes, get up for a little while.`,
      action: { label: 'Open wind-down sounds', href: '#sounds' },
    });
  }

  if (stats.avgAwakenings >= 1.5) {
    add(medium, {
      id: 'awakenings',
      icon: 'bed',
      tag: 'Worth trying',
      title: 'Fewer middle-of-the-night wake-ups',
      body: `You averaged ${stats.avgAwakenings.toFixed(1)} wake-ups a night. Keep the room cool, dark and quiet, and keep the clock out of sight. If alcohol or late meals show up often, test a night without them.`,
    });
  }

  const findFactor = (id) => stats.factorAnalysis.find((factor) => factor.id === id);

  const caffeine = findFactor('caffeine');
  if (caffeine && caffeine.count >= Math.max(2, Math.ceil(n * 0.3))) {
    add(high, {
      id: 'caffeine',
      icon: 'coffee',
      tag: 'Priority focus',
      title: 'Set a caffeine curfew',
      body: `Late caffeine showed up on ${caffeine.count} of your last ${n} nights. Caffeine can still be active hours later — try a cutoff around ${formatMinutesAsTime(timeToMinutes(settings.targetBedtime) - 480)} and see how the next few nights feel.`,
    });
  }

  const screens = findFactor('screens');
  if (screens && screens.count >= Math.max(2, Math.ceil(n * 0.4))) {
    add(medium, {
      id: 'screens',
      icon: 'screen',
      tag: 'Worth trying',
      title: 'Make the bed a screen-free zone',
      body: `Screens in bed appeared on ${screens.count} of ${n} nights. Try parking your phone across the room and swapping the last 20 minutes of scrolling for audio, a book or dim lights.`,
      action: { label: 'Try a soundscape', href: '#sounds' },
    });
  }

  const alcohol = findFactor('alcohol');
  if (alcohol && alcohol.count >= Math.max(2, Math.ceil(n * 0.25))) {
    add(medium, {
      id: 'alcohol',
      icon: 'wine',
      tag: 'Worth trying',
      title: 'Alcohol isn’t a sleep aid',
      body: `Alcohol appeared on ${alcohol.count} of ${n} nights. It can make you drowsy at first, then fragment the second half of the night. If you drink, leave three or more hours before bed and keep water nearby.`,
    });
  }

  const stress = findFactor('stress');
  if (stress && stress.count >= Math.max(2, Math.ceil(n * 0.35))) {
    add(medium, {
      id: 'stress',
      icon: 'brain',
      tag: 'Worth trying',
      title: 'Put tomorrow on paper',
      body: `Stress showed up on ${stress.count} of ${n} nights. Try a five-minute brain dump before bed: write tomorrow’s tasks down so your mind doesn’t rehearse them at 2 a.m.`,
    });
  }

  if (stats.avgQuality < 3 && n >= 3) {
    add(medium, {
      id: 'room',
      icon: 'moon',
      tag: 'Worth trying',
      title: 'Reset the room',
      body: `Your sleep quality averaged ${stats.avgQuality.toFixed(1)}/5. Before changing anything else, check the basics: a cool room, real darkness and less background noise.`,
      action: { label: 'Play masking sound', href: '#sounds' },
    });
  }

  const exercise = findFactor('exercise');
  const winddown = findFactor('winddown');
  const reading = findFactor('reading');

  if (exercise && exercise.count >= 2 && exercise.qualityDelta > 0.15) {
    add(strengths, {
      id: 'exercise',
      icon: 'exercise',
      tag: 'Working well',
      title: 'Movement is paying off',
      body: `On nights you exercised, you rated sleep ${exercise.qualityDelta.toFixed(1)} points higher. Keep the habit — just aim to finish intense workouts a couple of hours before bed.`,
    });
  } else if (winddown && winddown.count >= 2 && winddown.durationDelta > 10) {
    add(strengths, {
      id: 'winddown',
      icon: 'wind',
      tag: 'Working well',
      title: 'Your wind-down is earning sleep',
      body: `Nights with a wind-down routine averaged ${formatDuration(winddown.durationDelta)} more sleep (${winddown.count} nights). That’s a ritual worth protecting.`,
    });
  } else if (reading && reading.count >= 2 && reading.durationDelta > 10) {
    add(strengths, {
      id: 'reading',
      icon: 'read',
      tag: 'Working well',
      title: 'Keep the paper pages',
      body: `Reading before bed showed up on nights with ${formatDuration(reading.durationDelta)} more sleep on average. Keep it in the routine and leave the phone elsewhere.`,
    });
  } else if (stats.consistency !== null && stats.consistency >= 75) {
    add(strengths, {
      id: 'consistency',
      icon: 'target',
      tag: 'Working well',
      title: 'Your rhythm is steady',
      body: `Your bedtime and wake time are holding together at ${stats.consistency}/100 consistency. That regularity is doing quiet work behind the scenes — protect it.`,
    });
  } else {
    add(strengths, {
      id: 'logging',
      icon: 'book',
      tag: 'Working well',
      title: 'Keep the thread',
      body: `You’ve logged ${n} nights and averaged ${formatDuration(avg)}. Showing up consistently is the hard part; each entry makes the next recommendation more personal.`,
    });
  }

  if (
    n >= 3 &&
    (stats.avgLatency > 25 || stress || screens) &&
    !medium.some((item) => item.id === 'latency')
  ) {
    add(strengths, {
      id: 'sound',
      icon: 'headphones',
      tag: 'A small experiment',
      title: 'Trade the scroll for sound',
      body: 'Rain, ocean and brown noise are generated locally in Sleepline and can stop themselves on a timer. Try one during wind-down and see whether it shortens the drift off.',
      action: { label: 'Open sounds', href: '#sounds' },
    });
  }

  const picked = [
    ...high.slice(0, 3),
    ...medium.slice(0, 3),
  ];
  if (picked.length < 3) picked.push(...strengths.slice(0, 1));
  const final = [...picked];
  if (!final.some((item) => item.tone === 'strength') && strengths[0]) final.push(strengths[0]);
  return final.slice(0, 6);
}

export function buildTonightPlan(settings, stats) {
  const now = new Date();
  const wakeDate = new Date(now);
  wakeDate.setHours(
    Math.floor(timeToMinutes(settings.targetWake) / 60),
    timeToMinutes(settings.targetWake) % 60,
    0,
    0,
  );
  if (wakeDate <= now) wakeDate.setDate(wakeDate.getDate() + 1);

  const latencyBuffer = stats.count
    ? clamp(Math.round(stats.avgLatency / 5) * 5, 10, 30)
    : 15;
  const repayment = stats.sleepDebt >= 240 ? 30 : stats.sleepDebt >= 120 ? 15 : 0;
  const plannedSleepMin = settings.sleepGoal * 60 + repayment;
  const bedDate = new Date(
    wakeDate.getTime() - (plannedSleepMin + latencyBuffer) * 60000,
  );
  const windDownDate = new Date(bedDate.getTime() - 45 * 60000);
  const caffeineDate = new Date(bedDate.getTime() - 8 * 60 * 60000);

  const clock = (date) =>
    new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);

  const wakeLabel =
    wakeDate.toDateString() === now.toDateString()
      ? 'This morning'
      : wakeDate.toDateString() === new Date(now.getTime() + 86400000).toDateString()
        ? 'Tomorrow morning'
        : 'Next wake';

  return {
    bedDate,
    wakeDate,
    bedTime: clock(bedDate),
    wakeTime: clock(wakeDate),
    windDownTime: clock(windDownDate),
    caffeineTime: clock(caffeineDate),
    plannedSleepMin,
    latencyBuffer,
    repayment,
    wakeLabel,
  };
}

export function lastSeven(nights) {
  return [...nights].sort((a, b) => a.date.localeCompare(b.date)).slice(-7);
}

export function average(values) {
  return mean(values);
}
