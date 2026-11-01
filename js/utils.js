/* Small, dependency-free helpers used across Somnia. */

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const mean = (values) =>
  values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;

export const sum = (values) => values.reduce((total, value) => total + value, 0);

export function stdDev(values) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

export const pad2 = (value) => String(value).padStart(2, '0');

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => {
    const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return entities[character];
  });
}

/* ------------------------------- dates ---------------------------------- */

export function keyFromDate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function dateFromKey(key) {
  const [year, month, day] = String(key).split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function todayKey() {
  return keyFromDate(new Date());
}

export function addDays(key, amount) {
  const date = dateFromKey(key);
  date.setDate(date.getDate() + amount);
  return keyFromDate(date);
}

/** Whole calendar days between two YYYY-MM-DD keys. */
export function daysBetween(fromKey, toKey) {
  const from = dateFromKey(fromKey);
  const to = dateFromKey(toKey);
  return Math.round(
    (Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) -
      Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) /
      86400000,
  );
}

export function timeToMinutes(time) {
  const [hours, minutes] = String(time || '00:00').split(':').map(Number);
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
}

export function minutesToTime(totalMinutes) {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(normalized / 60))}:${pad2(normalized % 60)}`;
}

/** Sleep duration in minutes for a night. Times are wall-clock, so DST cannot distort it. */
export function nightDuration(night) {
  const bed = timeToMinutes(night.bedTime);
  let wake = timeToMinutes(night.wakeTime);
  if (wake <= bed) wake += 1440;
  return wake - bed;
}

export function bedDateKey(night) {
  return timeToMinutes(night.bedTime) > timeToMinutes(night.wakeTime)
    ? addDays(night.date, -1)
    : night.date;
}

export function formatTime(time) {
  if (!time) return '—';
  const minutes = timeToMinutes(time);
  const date = new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60);
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function formatMinutesAsTime(minutes) {
  return formatTime(minutesToTime(minutes));
}

export function formatDuration(minutes) {
  const rounded = Math.max(0, Math.round(Number(minutes) || 0));
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  if (!hours) return `${mins}m`;
  if (!mins) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/** Signed duration, e.g. −42m or +1h 10m. */
export function formatDelta(minutes) {
  const rounded = Math.round(minutes);
  if (!rounded) return '0m';
  return `${rounded > 0 ? '+' : '−'}${formatDuration(Math.abs(rounded))}`;
}

export function formatCountdown(milliseconds) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours) return `${hours}:${pad2(minutes)}:${pad2(seconds)}`;
  return `${minutes}:${pad2(seconds)}`;
}

export function formatNumber(value, digits = 0) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

export function formatDate(key, options = {}) {
  const date = typeof key === 'string' ? dateFromKey(key) : key;
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...options,
  }).format(date);
}

export function formatLongDate(key) {
  const date = typeof key === 'string' ? dateFromKey(key) : key;
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

export function relativeDay(key) {
  if (!key) return '';
  const difference = daysBetween(key, todayKey());
  if (difference === 0) return 'Today';
  if (difference === 1) return 'Yesterday';
  return formatDate(key);
}

export function weekdayName(key) {
  return new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(dateFromKey(key));
}

export function monthKey(key) {
  return String(key).slice(0, 7);
}

export function monthLabel(key) {
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(
    dateFromKey(`${key}-01`),
  );
}

export function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 5) return 'Still up';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 22) return 'Good evening';
  return 'Time to wind down';
}

export function sleepGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 5) return 'Late night';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function initials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return 'S';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function debounce(fn, wait = 160) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function downloadFile(filename, content, type = 'application/json') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Clock-face difference between two times, in minutes (max 12h). */
export function clockDiff(aMinutes, bMinutes) {
  const difference = Math.abs(aMinutes - bMinutes) % 1440;
  return Math.min(difference, 1440 - difference);
}
