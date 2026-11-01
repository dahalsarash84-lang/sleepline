/* Local-first persistence. Nothing leaves the browser. */

import { addDays, clamp, keyFromDate, todayKey, uid } from './utils.js';

const STORAGE_KEY = 'somnia.data.v1';
const MAX_NIGHTS = 3700;

export const FACTORS = [
  { id: 'caffeine', label: 'Late caffeine', short: 'Caffeine', tone: 'negative', icon: 'coffee' },
  { id: 'alcohol', label: 'Alcohol', short: 'Alcohol', tone: 'negative', icon: 'wine' },
  { id: 'screens', label: 'Screens in bed', short: 'Screens', tone: 'negative', icon: 'screen' },
  { id: 'lateMeal', label: 'Late meal', short: 'Late meal', tone: 'negative', icon: 'meal' },
  { id: 'stress', label: 'Stress', short: 'Stress', tone: 'negative', icon: 'brain' },
  { id: 'noise', label: 'Noisy room', short: 'Noise', tone: 'negative', icon: 'noise' },
  { id: 'exercise', label: 'Exercised', short: 'Exercise', tone: 'positive', icon: 'exercise' },
  { id: 'reading', label: 'Read before bed', short: 'Reading', tone: 'positive', icon: 'read' },
  { id: 'winddown', label: 'Wind-down routine', short: 'Wind-down', tone: 'positive', icon: 'wind' },
  { id: 'coolRoom', label: 'Cool, dark room', short: 'Cool room', tone: 'positive', icon: 'moon' },
];

export const PROVIDERS = [
  {
    id: 'spotify',
    name: 'Spotify',
    short: 'Spotify',
    color: '#1ed760',
    term: 'sleep music',
    note: 'Account connection, your playlists and device playback.',
    url: 'https://open.spotify.com',
    search: (term) => `https://open.spotify.com/search/${encodeURIComponent(term)}`,
  },
  {
    id: 'apple',
    name: 'Apple Music',
    short: 'Apple Music',
    color: '#fa5c73',
    term: 'sleep music',
    note: 'Opens the Apple Music app or web player.',
    url: 'https://music.apple.com',
    search: (term) => `https://music.apple.com/us/search?term=${encodeURIComponent(term)}`,
  },
  {
    id: 'youtube',
    name: 'YouTube Music',
    short: 'YouTube Music',
    color: '#ff4e45',
    term: 'sleep music',
    note: 'Opens YouTube Music search in the app or browser.',
    url: 'https://music.youtube.com',
    search: (term) => `https://music.youtube.com/search?q=${encodeURIComponent(term)}`,
  },
  {
    id: 'amazon',
    name: 'Amazon Music',
    short: 'Amazon Music',
    color: '#25d1da',
    term: 'sleep music',
    note: 'Opens Amazon Music search in the app or browser.',
    url: 'https://music.amazon.com',
    search: (term) => `https://music.amazon.com/search/${encodeURIComponent(term)}`,
  },
  {
    id: 'soundcloud',
    name: 'SoundCloud',
    short: 'SoundCloud',
    color: '#ff8a3d',
    term: 'sleep ambient',
    note: 'Opens SoundCloud search in the app or browser.',
    url: 'https://soundcloud.com',
    search: (term) => `https://soundcloud.com/search?q=${encodeURIComponent(term)}`,
  },
];

export const DEFAULT_SETTINGS = {
  name: '',
  sleepGoal: 8,
  targetBedtime: '23:00',
  targetWake: '07:00',
  defaultProvider: 'spotify',
  spotifyClientId: '',
  onboarded: false,
  sampleData: false,
};

export function defaultState() {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    nights: [],
  };
}

function normalizeSettings(settings = {}) {
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  merged.sleepGoal = clamp(Number(merged.sleepGoal) || 8, 4, 12);
  merged.name = String(merged.name || '').slice(0, 60);
  if (!/^\d{2}:\d{2}$/.test(merged.targetBedtime)) merged.targetBedtime = '23:00';
  if (!/^\d{2}:\d{2}$/.test(merged.targetWake)) merged.targetWake = '07:00';
  if (!PROVIDERS.some((provider) => provider.id === merged.defaultProvider)) {
    merged.defaultProvider = 'spotify';
  }
  merged.spotifyClientId = String(merged.spotifyClientId || '').trim();
  merged.onboarded = Boolean(merged.onboarded);
  merged.sampleData = Boolean(merged.sampleData);
  return merged;
}

function normalizeNight(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const date = String(raw.date || '');
  const bedTime = String(raw.bedTime || '');
  const wakeTime = String(raw.wakeTime || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!/^\d{2}:\d{2}$/.test(bedTime) || !/^\d{2}:\d{2}$/.test(wakeTime)) return null;
  return {
    id: String(raw.id || uid()),
    date,
    bedTime,
    wakeTime,
    latencyMin: clamp(Math.round(Number(raw.latencyMin) || 0), 0, 240),
    awakenings: clamp(Math.round(Number(raw.awakenings) || 0), 0, 20),
    quality: clamp(Math.round(Number(raw.quality) || 3), 1, 5),
    factors: Array.isArray(raw.factors)
      ? [...new Set(raw.factors.filter((factor) => FACTORS.some((item) => item.id === factor)))]
      : [],
    note: String(raw.note || '').slice(0, 600),
    createdAt: Number(raw.createdAt) || Date.now(),
    updatedAt: Number(raw.updatedAt) || Date.now(),
  };
}

function sortNights(nights) {
  return [...nights].sort((a, b) => {
    if (a.date === b.date) return a.wakeTime.localeCompare(b.wakeTime);
    return a.date < b.date ? -1 : 1;
  });
}

let state;
try {
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  if (stored && typeof stored === 'object') {
    state = {
      version: 1,
      settings: normalizeSettings(stored.settings),
      nights: sortNights((Array.isArray(stored.nights) ? stored.nights : []).map(normalizeNight).filter(Boolean)),
    };
  } else {
    state = defaultState();
  }
} catch {
  state = defaultState();
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    console.error('Could not save Somnia data', error);
    return false;
  }
}

export function getState() {
  return state;
}

export function getSettings() {
  return state.settings;
}

export function getNights() {
  return sortNights(state.nights);
}

export function getNight(id) {
  return state.nights.find((night) => night.id === id) || null;
}

export function updateSettings(patch) {
  state.settings = normalizeSettings({ ...state.settings, ...patch });
  persist();
  return state.settings;
}

export function saveNight(raw) {
  const night = normalizeNight({ ...raw, updatedAt: Date.now() });
  if (!night) throw new Error('That night is missing a date or time.');
  const existing =
    state.nights.find((item) => item.id === night.id) ||
    state.nights.find((item) => item.date === night.date);
  if (existing) {
    Object.assign(existing, night, { id: existing.id, createdAt: existing.createdAt });
  } else {
    state.nights.push(night);
  }
  state.nights = sortNights(state.nights).slice(-MAX_NIGHTS);
  persist();
  return existing || night;
}

export function deleteNight(id) {
  state.nights = state.nights.filter((night) => night.id !== id);
  persist();
}

export function clearNights({ keepSampleFlag = false } = {}) {
  state.nights = [];
  if (!keepSampleFlag) state.settings.sampleData = false;
  persist();
}

export function replaceAll(next, { keepSettings = false } = {}) {
  const normalizedNights = (Array.isArray(next.nights) ? next.nights : [])
    .map(normalizeNight)
    .filter(Boolean)
    .slice(-MAX_NIGHTS);
  state.nights = sortNights(normalizedNights);
  if (!keepSettings && next.settings) {
    state.settings = normalizeSettings({ ...state.settings, ...next.settings });
  }
  persist();
  return state.nights.length;
}

export function exportBackup() {
  return {
    app: 'Somnia',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: state.settings,
    nights: sortNights(state.nights),
  };
}

export function importBackup(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('That file is not a Somnia backup.');
  const nights = Array.isArray(payload) ? payload : payload.nights;
  if (!Array.isArray(nights)) throw new Error('No sleep entries were found in that file.');
  const settings = Array.isArray(payload) ? null : payload.settings;
  const count = replaceAll({ nights, settings });
  return count;
}

export function storageSummary() {
  try {
    return new Blob([JSON.stringify(state)]).size;
  } catch {
    return 0;
  }
}

/* ------------------------------ sample data ----------------------------- */

export function makeSampleNights() {
  const today = todayKey();
  const notes = {
    0: 'Brain wouldn’t switch off. Scrolled longer than I meant to.',
    4: 'Woke up before my alarm feeling actually rested.',
    9: 'A stressful day followed me to bed.',
  };
  const specs = [
    { ago: 0, bed: '00:18', wake: '07:05', latency: 34, wakes: 2, quality: 3, factors: ['screens', 'stress'] },
    { ago: 1, bed: '23:52', wake: '07:00', latency: 26, wakes: 1, quality: 3, factors: ['screens', 'caffeine'] },
    { ago: 2, bed: '23:35', wake: '06:58', latency: 18, wakes: 1, quality: 4, factors: ['exercise', 'reading'] },
    { ago: 4, bed: '23:20', wake: '07:02', latency: 15, wakes: 0, quality: 4, factors: ['exercise', 'reading', 'winddown', 'coolRoom'] },
    { ago: 5, bed: '01:12', wake: '09:24', latency: 28, wakes: 2, quality: 3, factors: ['alcohol', 'screens'] },
    { ago: 6, bed: '00:48', wake: '09:10', latency: 22, wakes: 1, quality: 4, factors: ['alcohol', 'lateMeal', 'caffeine'] },
    { ago: 7, bed: '23:41', wake: '07:08', latency: 20, wakes: 1, quality: 4, factors: ['exercise', 'winddown'] },
    { ago: 9, bed: '00:05', wake: '06:50', latency: 38, wakes: 3, quality: 2, factors: ['stress', 'screens', 'caffeine'] },
    { ago: 10, bed: '23:30', wake: '07:00', latency: 25, wakes: 1, quality: 3, factors: ['screens'] },
    { ago: 11, bed: '23:58', wake: '07:06', latency: 30, wakes: 2, quality: 3, factors: ['caffeine', 'lateMeal'] },
    { ago: 12, bed: '23:12', wake: '06:55', latency: 16, wakes: 0, quality: 4, factors: ['exercise', 'reading', 'winddown'] },
  ];
  return specs.map((spec, index) => ({
    id: `sample-${index}`,
    date: addDays(today, -spec.ago),
    bedTime: spec.bed,
    wakeTime: spec.wake,
    latencyMin: spec.latency,
    awakenings: spec.wakes,
    quality: spec.quality,
    factors: spec.factors,
    note: notes[spec.ago] || '',
    createdAt: Date.now() - spec.ago * 86400000,
    updatedAt: Date.now() - spec.ago * 86400000,
  }));
}

export function loadSampleData() {
  state.nights = sortNights(makeSampleNights());
  state.settings.sampleData = true;
  persist();
  return state.nights.length;
}

export function todayLabel() {
  return keyFromDate(new Date());
}
