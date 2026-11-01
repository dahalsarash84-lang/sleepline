/* Somnia — application shell, routing and interactions. */

import { brandMark, icon } from './icons.js';
import {
  clearNights,
  deleteNight,
  exportBackup,
  getNight,
  getNights,
  getSettings,
  importBackup,
  loadSampleData,
  saveNight,
  storageSummary,
  updateSettings,
} from './store.js';
import { buildAdvice, buildTonightPlan, computeStats } from './sleep.js';
import {
  connect,
  disconnect,
  getDevices,
  getPlaylists,
  getProfile,
  handleRedirect,
  isConnected,
  playPlaylist,
  redirectUri,
} from './spotify.js';
import { SOUNDS, soundEngine } from './sounds.js';
import {
  downloadFile,
  escapeHtml,
  formatCountdown,
  formatDuration,
  formatTime,
  initials,
  minutesToTime,
  nightDuration,
  timeToMinutes,
  todayKey,
} from './utils.js';
import {
  spotifyPanelBody,
  spotifyPlaylistGrid,
  viewConfirm,
  viewInsights,
  viewJournal,
  viewLogModal,
  viewOnboarding,
  viewSettings,
  viewSounds,
  viewToday,
} from './views.js';

const ROUTES = ['today', 'insights', 'journal', 'sounds'];

const NAV = [
  { id: 'today', label: 'Today', icon: 'sun' },
  { id: 'insights', label: 'Insights', icon: 'chart' },
  { id: 'journal', label: 'Journal', icon: 'book' },
  { id: 'sounds', label: 'Sound room', icon: 'music' },
];

const PAGE_TITLES = {
  today: 'Today',
  insights: 'Insights',
  journal: 'Journal',
  sounds: 'Sound room',
};

const appState = {
  route: routeFromHash(),
  onboarding: { open: false, step: 0, draft: null },
  spotify: {
    loading: false,
    loaded: false,
    error: '',
    warning: '',
    profile: null,
    playlists: [],
    devices: [],
    selectedDevice: '',
    search: '',
  },
  confirmResolver: null,
  modalFocus: null,
};

function routeFromHash() {
  const raw = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  return ROUTES.includes(raw) ? raw : 'today';
}

function mountShell() {
  document.getElementById('app').innerHTML = `
    <div class="ambient" aria-hidden="true">
      <span class="orb orb-a"></span><span class="orb orb-b"></span><span class="orb orb-c"></span>
      <span class="stars"></span>
    </div>
    <aside class="sidebar">
      <a class="brand" href="#today" aria-label="Somnia home">
        ${brandMark(40)}
        <span class="brand-copy"><strong>Somnia</strong><small>sleep, understood</small></span>
      </a>
      <button type="button" class="btn btn-primary btn-lg btn-block" data-action="log-new">
        ${icon('plus', 18)} Log sleep
      </button>
      <nav class="side-nav" aria-label="Main navigation">
        ${NAV.map(
          (item) =>
            `<a class="nav-link" data-nav="${item.id}" href="#${item.id}">${icon(item.icon, 19)}<span>${item.label}</span></a>`,
        ).join('')}
      </nav>
      <div class="side-target">
        <p class="eyebrow">Tonight’s target</p>
        <strong class="js-target-bed">11:00 PM</strong>
        <p>Wake at <span class="js-target-wake">7:00 AM</span></p>
      </div>
      <button type="button" class="side-profile" data-action="settings-open" aria-label="Open settings">
        <span class="avatar js-avatar">S</span>
        <span class="side-profile-copy"><strong class="js-profile-name">Sleeper</strong><span class="js-goal">8h sleep goal</span></span>
        ${icon('sliders', 18)}
      </button>
    </aside>
    <main class="main">
      <header class="mobile-top">
        <a class="brand brand-mobile" href="#today" aria-label="Somnia home">${brandMark(30)}<strong>Somnia</strong></a>
        <button type="button" class="icon-btn" data-action="settings-open" aria-label="Open settings">${icon('sliders', 19)}</button>
      </header>
      <div id="view" class="view"></div>
    </main>
    <nav class="mobile-nav" aria-label="Main navigation">
      ${NAV.map(
        (item) =>
          `<a class="mobile-nav-link" data-nav="${item.id}" href="#${item.id}">${icon(item.icon, 20)}<span>${item.label === 'Sound room' ? 'Sounds' : item.label}</span></a>`,
      ).join('')}
    </nav>
    <div id="player-bar" class="player-bar" hidden></div>
    <div id="modal-root"></div>
    <div id="settings-root"></div>
    <div id="onboarding-root"></div>
    <div class="toast-root" id="toast-root" aria-live="polite" aria-atomic="false"></div>
  `;
}

function render() {
  const viewElement = document.getElementById('view');
  if (!viewElement) return;
  const settings = getSettings();
  const nights = getNights();
  const stats = computeStats(nights, settings);
  const soundState = soundEngine.getState();

  if (appState.route === 'today') {
    const advice = buildAdvice(nights, settings, stats);
    const plan = buildTonightPlan(settings, stats);
    viewElement.innerHTML = viewToday({ settings, nights, stats, advice, plan });
  } else if (appState.route === 'insights') {
    const advice = buildAdvice(nights, settings, stats);
    viewElement.innerHTML = viewInsights({ settings, nights, stats, advice });
  } else if (appState.route === 'journal') {
    viewElement.innerHTML = viewJournal({ settings, nights });
  } else {
    viewElement.innerHTML = viewSounds({
      settings,
      soundState,
      spotify: { ...appState.spotify, connected: isConnected() },
      redirect: redirectUri(),
    });
  }

  syncChrome(stats);
  syncSoundUI(soundState);
  updateScrollLock();
  document.title = `${PAGE_TITLES[appState.route]} · Somnia`;

  if (appState.route === 'sounds' && isConnected()) {
    queueMicrotask(() => {
      ensureSpotifyData().catch((error) => {
        console.error(error);
      });
    });
  }
}

function syncChrome(stats = computeStats(getNights(), getSettings())) {
  const settings = getSettings();
  const displayName = settings.name.trim() || 'Sleeper';
  document.querySelectorAll('[data-nav]').forEach((link) => {
    const active = link.dataset.nav === appState.route;
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  document.querySelectorAll('.js-profile-name').forEach((element) => {
    element.textContent = displayName;
  });
  document.querySelectorAll('.js-avatar').forEach((element) => {
    element.textContent = initials(settings.name);
  });
  document.querySelectorAll('.js-goal').forEach((element) => {
    element.textContent = `${settings.sleepGoal}h sleep goal`;
  });

  const plan = buildTonightPlan(settings, stats);
  document.querySelectorAll('.js-target-bed').forEach((element) => {
    element.textContent = plan.bedTime;
  });
  document.querySelectorAll('.js-target-wake').forEach((element) => {
    element.textContent = plan.wakeTime;
  });
  document.body.dataset.route = appState.route;
}

function showToast(message, tone = 'success') {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const toast = document.createElement('div');
  const toneClass = tone === 'error' ? 'is-error' : tone === 'info' ? 'is-info' : 'is-success';
  const iconName = tone === 'error' ? 'alert' : tone === 'info' ? 'info' : 'check';
  toast.className = `toast ${toneClass}`;
  toast.innerHTML = `${icon(iconName, 18)}<span>${escapeHtml(message)}</span>`;
  root.append(toast);
  window.setTimeout(() => toast.classList.add('is-leaving'), 3800);
  window.setTimeout(() => toast.remove(), 4400);
}

function updateScrollLock() {
  const modalOpen = Boolean(document.getElementById('modal-root')?.innerHTML);
  const settingsOpen = Boolean(document.getElementById('settings-root')?.innerHTML);
  const onboardingOpen =
    appState.onboarding.open && Boolean(document.getElementById('onboarding-root')?.innerHTML);
  document.body.classList.toggle('no-scroll', modalOpen || settingsOpen || onboardingOpen);
}

function openModal(html) {
  const root = document.getElementById('modal-root');
  if (!root) return;
  appState.modalFocus = document.activeElement;
  root.innerHTML = html;
  updateScrollLock();
  window.setTimeout(() => {
    const dialog = root.querySelector('.modal');
    const target =
      dialog?.querySelector('input:not([type="hidden"]):not([disabled]), select, textarea, button') ||
      dialog;
    target?.focus({ preventScroll: true });
  }, 40);
}

function closeModal() {
  const root = document.getElementById('modal-root');
  if (!root) return;
  if (appState.confirmResolver) {
    const resolve = appState.confirmResolver;
    appState.confirmResolver = null;
    resolve(false);
  }
  root.innerHTML = '';
  updateScrollLock();
  if (appState.modalFocus?.focus) {
    try {
      appState.modalFocus.focus({ preventScroll: true });
    } catch {
      /* The original element may be gone after a re-render. */
    }
  }
  appState.modalFocus = null;
}

function confirmDialog({ title, body, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    appState.confirmResolver = resolve;
    openModal(viewConfirm({ title, body, confirmLabel, danger }));
  });
}

function resolveConfirm(value) {
  const resolve = appState.confirmResolver;
  appState.confirmResolver = null;
  if (resolve) resolve(value);
  closeModal();
}

function openSettings(section = 'profile') {
  const root = document.getElementById('settings-root');
  if (!root) return;
  root.innerHTML = viewSettings({
    settings: getSettings(),
    connected: isConnected(),
    redirect: redirectUri(),
    nightCount: getNights().length,
    storageBytes: storageSummary(),
  });
  updateScrollLock();
  window.setTimeout(() => {
    if (section === 'music') {
      document.getElementById('settings-music')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      document.getElementById('spotify-client-input')?.focus({ preventScroll: true });
    } else {
      document.querySelector('.drawer input[name="name"]')?.focus({ preventScroll: true });
    }
  }, 60);
}

function closeSettings() {
  const root = document.getElementById('settings-root');
  if (root) root.innerHTML = '';
  updateScrollLock();
}

function resetSpotifyData() {
  Object.assign(appState.spotify, {
    loading: false,
    loaded: false,
    error: '',
    warning: '',
    profile: null,
    playlists: [],
    devices: [],
    selectedDevice: '',
    search: '',
  });
}

function updateSpotifyPanel() {
  if (appState.route !== 'sounds') return;
  const panel = document.getElementById('spotify-panel');
  if (!panel) return;
  panel.innerHTML = spotifyPanelBody({
    settings: getSettings(),
    spotify: { ...appState.spotify, connected: isConnected() },
    redirect: redirectUri(),
  });
}

async function ensureSpotifyData(force = false) {
  const state = appState.spotify;
  if (!isConnected() || state.loading) return;
  if (state.loaded && !force) return;

  state.loading = true;
  state.error = '';
  state.warning = '';
  updateSpotifyPanel();

  try {
    const [profileResult, playlistsResult, devicesResult] = await Promise.allSettled([
      getProfile(),
      getPlaylists(),
      getDevices(),
    ]);

    const failures = [];
    if (profileResult.status === 'fulfilled') state.profile = profileResult.value;
    else failures.push(profileResult.reason);

    if (playlistsResult.status === 'fulfilled') state.playlists = playlistsResult.value;
    else failures.push(playlistsResult.reason);

    if (devicesResult.status === 'fulfilled') {
      state.devices = devicesResult.value.filter((device) => device.id);
    } else {
      failures.push(devicesResult.reason);
      state.warning = 'Playback devices could not be loaded. You can still open playlists in Spotify.';
    }

    if (profileResult.status === 'rejected' && playlistsResult.status === 'rejected') {
      state.error = failures[0]?.message || 'Spotify data could not be loaded.';
    } else if (failures.length) {
      const message = failures[0]?.message || 'Some Spotify data could not be loaded.';
      state.warning = state.warning || message;
    }

    const currentStillThere =
      state.selectedDevice && state.devices.some((device) => device.id === state.selectedDevice);
    state.selectedDevice = currentStillThere
      ? state.selectedDevice
      : state.devices.find((device) => device.active)?.id || state.devices[0]?.id || '';
    state.loaded = true;
  } catch (error) {
    console.error(error);
    state.error = error.message || 'Spotify data could not be loaded.';
    state.loaded = true;
  } finally {
    state.loading = false;
    updateSpotifyPanel();
  }
}

async function handleSpotifyConnect(trigger) {
  const input = document.getElementById('spotify-client-input');
  const clientId = (input ? input.value : getSettings().spotifyClientId).trim();
  if (!clientId) {
    openSettings('music');
    showToast('Add your Spotify Client ID first.', 'info');
    return;
  }
  updateSettings({ spotifyClientId: clientId });
  const previous = trigger?.innerHTML;
  if (trigger) {
    trigger.disabled = true;
    trigger.textContent = 'Redirecting…';
  }
  try {
    await connect(clientId);
  } catch (error) {
    if (trigger) {
      trigger.disabled = false;
      trigger.innerHTML = previous || 'Connect Spotify';
    }
    showToast(error.message || 'Could not start Spotify sign-in.', 'error');
  }
}

async function disconnectSpotify() {
  const confirmed = await confirmDialog({
    title: 'Disconnect Spotify?',
    body: 'Your sleep journal and soundscapes stay exactly where they are. You can reconnect at any time.',
    confirmLabel: 'Disconnect',
    danger: true,
  });
  if (!confirmed) return;
  disconnect();
  resetSpotifyData();
  closeSettings();
  render();
  showToast('Spotify disconnected.', 'info');
}

async function playSpotify(trigger) {
  const uri = trigger.dataset.uri;
  const deviceId =
    document.getElementById('spotify-device')?.value || appState.spotify.selectedDevice || '';
  const previous = trigger.innerHTML;
  trigger.disabled = true;
  trigger.innerHTML = '…';
  try {
    await playPlaylist(uri, deviceId);
    const device = appState.spotify.devices.find((item) => item.id === deviceId);
    showToast(device ? `Playback sent to ${device.name}.` : 'Playback started in Spotify.');
  } catch (error) {
    showToast(error.message || 'Spotify could not start playback.', 'error');
  } finally {
    trigger.disabled = false;
    trigger.innerHTML = previous;
  }
}

/* -------------------------------- logging -------------------------------- */

function defaultLogValues() {
  const settings = getSettings();
  const now = new Date();
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  let wakeTime = settings.targetWake;
  if (minutesNow >= 240 && minutesNow <= 780) {
    wakeTime = minutesToTime(Math.round(minutesNow / 5) * 5);
  }
  return {
    date: todayKey(),
    bedTime: minutesToTime(timeToMinutes(wakeTime) - settings.sleepGoal * 60 - 15),
    wakeTime,
    latencyMin: 15,
    awakenings: 0,
    quality: 3,
    factors: [],
    note: '',
  };
}

function openLogModal(id = '') {
  const night = id ? getNight(id) : null;
  const values = night
    ? {
        date: night.date,
        bedTime: night.bedTime,
        wakeTime: night.wakeTime,
        latencyMin: night.latencyMin,
        awakenings: night.awakenings,
        quality: night.quality,
        factors: [...night.factors],
        note: night.note,
      }
    : defaultLogValues();
  openModal(viewLogModal({ night, values, settings: getSettings() }));
}

function formError(message) {
  const error = document.getElementById('log-error');
  if (error) {
    error.textContent = message;
    error.hidden = false;
    error.scrollIntoView({ block: 'center', behavior: 'smooth' });
  } else {
    showToast(message, 'error');
  }
}

function updateLogPreview() {
  const form = document.getElementById('log-form');
  if (!form) return;
  const bedTime = form.elements.bedTime?.value;
  const wakeTime = form.elements.wakeTime?.value;
  const latency = Number(form.elements.latencyMin?.value) || 0;
  const preview = document.getElementById('log-preview');
  if (!preview || !bedTime || !wakeTime) return;
  const duration = nightDuration({ bedTime, wakeTime });
  if (duration > 0 && duration < 1440) {
    preview.classList.remove('is-invalid');
    preview.innerHTML = `<strong>${formatDuration(duration)}</strong><span>${formatTime(bedTime)} → ${formatTime(wakeTime)} · ${formatDuration(latency)} to fall asleep</span>`;
  } else {
    preview.classList.add('is-invalid');
    preview.innerHTML = '<strong>Check the times</strong><span>Bedtime and wake time can’t be the same.</span>';
  }
  const error = document.getElementById('log-error');
  if (error) error.hidden = true;
  form.querySelectorAll('.quality-option').forEach((label) => {
    label.classList.toggle('is-selected', Boolean(label.querySelector('input')?.checked));
  });
}

function saveLogForm(form) {
  const data = new FormData(form);
  const date = String(data.get('date') || '');
  const bedTime = String(data.get('bedTime') || '');
  const wakeTime = String(data.get('wakeTime') || '');
  if (!date || !bedTime || !wakeTime) {
    formError('Add the date, bedtime and wake time.');
    return;
  }
  if (date > todayKey()) {
    formError('The wake-up date can’t be in the future.');
    return;
  }
  const duration = nightDuration({ bedTime, wakeTime });
  if (duration < 60 || duration > 960) {
    formError('That duration looks unusual. Check whether bedtime is on the right side of midnight.');
    return;
  }

  let id = String(data.get('id') || '');
  if (getSettings().sampleData) {
    const sampleIds = getNights()
      .filter((night) => night.id.startsWith('sample-'))
      .map((night) => night.id);
    sampleIds.forEach(deleteNight);
    updateSettings({ sampleData: false });
    if (sampleIds.includes(id)) id = '';
  }

  try {
    const saved = saveNight({
      id,
      date,
      bedTime,
      wakeTime,
      latencyMin: Number(data.get('latencyMin')) || 0,
      awakenings: Number(data.get('awakenings')) || 0,
      quality: Number(data.get('quality')) || 3,
      factors: data.getAll('factors').map(String),
      note: String(data.get('note') || ''),
    });
    closeModal();
    render();
    showToast(`${formatDuration(nightDuration(saved))} saved.`);
  } catch (error) {
    formError(error.message || 'That night could not be saved.');
  }
}

/* ------------------------------- settings -------------------------------- */

function saveSettingsForm(form) {
  const data = new FormData(form);
  const targetBedtime = String(data.get('targetBedtime') || '');
  const targetWake = String(data.get('targetWake') || '');
  if (!targetBedtime || !targetWake) {
    showToast('Add both a bedtime and a wake time.', 'error');
    return;
  }
  if (targetBedtime === targetWake) {
    showToast('Bedtime and wake time need to be different.', 'error');
    return;
  }

  const current = getSettings();
  const clientId = String(data.get('spotifyClientId') || '').trim();
  let disconnected = false;
  if (clientId !== current.spotifyClientId && isConnected()) {
    disconnect();
    resetSpotifyData();
    disconnected = true;
  }

  updateSettings({
    name: String(data.get('name') || '').trim(),
    sleepGoal: Number(data.get('sleepGoal')) || 8,
    targetBedtime,
    targetWake,
    defaultProvider: String(data.get('defaultProvider') || 'spotify'),
    spotifyClientId: clientId,
    onboarded: true,
  });
  closeSettings();
  render();
  showToast(disconnected ? 'Preferences saved. Spotify was disconnected because the Client ID changed.' : 'Preferences saved.');
}

async function copyRedirect() {
  const value = redirectUri();
  try {
    await navigator.clipboard.writeText(value);
    showToast('Redirect URI copied.');
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      showToast('Redirect URI copied.');
    } catch {
      showToast(`Copy this redirect URI: ${value}`, 'info');
    }
    textarea.remove();
  }
}

/* ------------------------------- onboarding ------------------------------ */

function openOnboarding() {
  const settings = getSettings();
  appState.onboarding = {
    open: true,
    step: 0,
    draft: {
      name: settings.name,
      sleepGoal: settings.sleepGoal,
      targetBedtime: settings.targetBedtime,
      targetWake: settings.targetWake,
      provider: settings.defaultProvider,
    },
  };
  renderOnboarding();
  updateScrollLock();
}

function renderOnboarding() {
  const root = document.getElementById('onboarding-root');
  if (!root) return;
  root.innerHTML = viewOnboarding({
    step: appState.onboarding.step,
    draft: appState.onboarding.draft,
  });
  updateScrollLock();
  window.setTimeout(() => {
    root.querySelector('.onboarding-body h1')?.focus({ preventScroll: true }) ||
      root.querySelector('input:not([type="radio"])')?.focus({ preventScroll: true });
  }, 60);
}

function readOnboardingForm() {
  const form = document.getElementById('onboarding-form');
  if (!form) return;
  const draft = appState.onboarding.draft;
  const name = form.querySelector('[name="onboardName"]');
  if (name) draft.name = name.value.trim();
  const goal = form.querySelector('input[name="onboardGoal"]:checked');
  if (goal) draft.sleepGoal = Number(goal.value);
  const bedtime = form.querySelector('[name="onboardBedtime"]');
  if (bedtime) draft.targetBedtime = bedtime.value;
  const wake = form.querySelector('[name="onboardWake"]');
  if (wake) draft.targetWake = wake.value;
  const provider = form.querySelector('input[name="onboardProvider"]:checked');
  if (provider) draft.provider = provider.value;
}

function updateOnboardingWindow() {
  const form = document.getElementById('onboarding-form');
  const windowElement = document.getElementById('onboard-window');
  if (!form || !windowElement) return;
  const bed = form.querySelector('[name="onboardBedtime"]')?.value;
  const wake = form.querySelector('[name="onboardWake"]')?.value;
  if (!bed || !wake || bed === wake) {
    windowElement.textContent = 'Bedtime and wake time need to be different.';
    return;
  }
  const duration = ((timeToMinutes(wake) - timeToMinutes(bed) + 1440) % 1440) || 1440;
  windowElement.textContent = `That’s ${formatDuration(duration)} in bed.`;
}

function updateOnboardingSelections(target) {
  if (target.name === 'onboardGoal') {
    document.querySelectorAll('.goal-option').forEach((label) => {
      label.classList.toggle('is-selected', Boolean(label.querySelector('input')?.checked));
    });
  }
  if (target.name === 'onboardProvider') {
    document.querySelectorAll('.provider-choice').forEach((label) => {
      label.classList.toggle('is-selected', Boolean(label.querySelector('input')?.checked));
    });
  }
}

function onboardingNext() {
  readOnboardingForm();
  const { step, draft } = appState.onboarding;
  if (step === 1) {
    if (!draft.targetBedtime || !draft.targetWake || draft.targetBedtime === draft.targetWake) {
      showToast('Choose a bedtime and a different wake time.', 'error');
      return;
    }
  }
  if (step < 2) {
    appState.onboarding.step += 1;
    renderOnboarding();
    return;
  }
  finishOnboarding();
}

function finishOnboarding() {
  readOnboardingForm();
  const draft = appState.onboarding.draft;
  if (draft.targetBedtime === draft.targetWake) {
    showToast('Bedtime and wake time need to be different.', 'error');
    return;
  }
  updateSettings({
    name: draft.name,
    sleepGoal: draft.sleepGoal,
    targetBedtime: draft.targetBedtime,
    targetWake: draft.targetWake,
    defaultProvider: draft.provider,
    onboarded: true,
  });
  closeOnboarding();
  render();
  showToast('You’re set up. Log your first night when you’re ready.');
}

function closeOnboarding() {
  appState.onboarding.open = false;
  const root = document.getElementById('onboarding-root');
  if (root) root.innerHTML = '';
  updateScrollLock();
}

function skipOnboarding() {
  updateSettings({ onboarded: true });
  closeOnboarding();
  render();
  showToast('You can set everything up later in Settings.', 'info');
}

/* -------------------------------- sounds --------------------------------- */

function syncSoundUI(state = soundEngine.getState()) {
  document.querySelectorAll('[data-sound-card]').forEach((card) => {
    const active = card.dataset.soundCard === state.activeId;
    card.classList.toggle('is-playing', active);
    card.setAttribute('aria-pressed', String(active));
  });

  document.querySelectorAll('.js-timer-left').forEach((element) => {
    element.textContent = state.remainingMs
      ? `Ends in ${formatCountdown(state.remainingMs)}`
      : 'No timer';
  });

  document.querySelectorAll('[data-action="sound-timer"]').forEach((button) => {
    const minutes = Number(button.dataset.minutes) || 0;
    const active = minutes === state.timerMinutes;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });

  const volumeValue = document.querySelector('.js-volume-value');
  if (volumeValue) volumeValue.textContent = `${Math.round(state.volume * 100)}%`;

  const bar = document.getElementById('player-bar');
  if (!bar) return;
  const sound = SOUNDS.find((item) => item.id === state.activeId);
  if (!sound) {
    bar.hidden = true;
    bar.innerHTML = '';
    delete bar.dataset.sound;
    return;
  }
  if (bar.dataset.sound !== sound.id) {
    bar.innerHTML = `<div class="player-inner">
      <span class="player-art" style="--sound-color:${sound.color}">${icon(sound.icon, 19)}</span>
      <div class="player-copy"><strong>${sound.name}</strong><span class="js-player-time">Playing</span></div>
      <div class="player-actions">
        <button type="button" class="icon-btn" data-action="sound-toggle-active" aria-label="Pause soundscape">${icon('pause', 17)}</button>
        <button type="button" class="icon-btn" data-action="sound-stop" aria-label="Stop soundscape">${icon('close', 17)}</button>
      </div>
    </div>`;
    bar.dataset.sound = sound.id;
  }
  bar.hidden = false;
  const time = bar.querySelector('.js-player-time');
  if (time) {
    time.textContent = state.remainingMs
      ? `Timer ${formatCountdown(state.remainingMs)}`
      : 'Playing';
  }
}

async function toggleSound(id) {
  try {
    await soundEngine.toggle(id);
  } catch (error) {
    console.error(error);
    showToast(error.message || 'That soundscape could not start.', 'error');
  }
}

/* -------------------------------- actions -------------------------------- */

async function handleAction(action, trigger) {
  switch (action) {
    case 'log-new':
      openLogModal();
      break;
    case 'log-save': {
      const form = document.getElementById('log-form');
      if (form) saveLogForm(form);
      break;
    }
    case 'log-edit':
      openLogModal(trigger.dataset.id || '');
      break;
    case 'log-delete': {
      const night = getNight(trigger.dataset.id || '');
      if (!night) return;
      const confirmed = await confirmDialog({
        title: 'Delete this night?',
        body: `The entry for ${formatTime(night.bedTime)} to ${formatTime(night.wakeTime)} will be removed from your journal.`,
        confirmLabel: 'Delete night',
        danger: true,
      });
      if (confirmed) {
        deleteNight(night.id);
        render();
        showToast('Night removed.', 'info');
      }
      break;
    }
    case 'load-sample': {
      if (getNights().length) {
        const confirmed = await confirmDialog({
          title: 'Load sample nights?',
          body: 'This replaces your current journal with sample entries so you can explore the app. Export a backup first if you want to keep what you have.',
          confirmLabel: 'Load sample',
        });
        if (!confirmed) return;
      }
      const count = loadSampleData();
      updateSettings({ sampleData: true, onboarded: true });
      closeSettings();
      render();
      showToast(`${count} sample nights loaded.`);
      break;
    }
    case 'clear-sample': {
      const confirmed = await confirmDialog({
        title: 'Clear the sample nights?',
        body: 'The sample journal will be removed. Your preferences and music setup stay in place.',
        confirmLabel: 'Clear sample',
        danger: true,
      });
      if (confirmed) {
        clearNights();
        render();
        showToast('Sample nights cleared.', 'info');
      }
      break;
    }
    case 'settings-open':
      openSettings(trigger.dataset.section || 'profile');
      break;
    case 'settings-close':
      closeSettings();
      break;
    case 'settings-save': {
      const form = document.getElementById('settings-form');
      if (form) saveSettingsForm(form);
      break;
    }
    case 'copy-redirect':
      await copyRedirect();
      break;
    case 'spotify-connect':
      await handleSpotifyConnect(trigger);
      break;
    case 'spotify-disconnect':
      await disconnectSpotify();
      break;
    case 'spotify-refresh':
      await ensureSpotifyData(true);
      break;
    case 'spotify-play':
      await playSpotify(trigger);
      break;
    case 'sound-toggle':
      await toggleSound(trigger.dataset.sound);
      break;
    case 'sound-toggle-active': {
      const activeId = soundEngine.getState().activeId;
      if (activeId) await toggleSound(activeId);
      break;
    }
    case 'sound-stop':
      soundEngine.stop();
      break;
    case 'sound-timer': {
      if (!soundEngine.getState().activeId) {
        showToast('Start a soundscape first, then set a timer.', 'info');
        return;
      }
      soundEngine.setTimer(Number(trigger.dataset.minutes) || 0);
      break;
    }
    case 'provider-select':
      updateSettings({ defaultProvider: trigger.dataset.provider || 'spotify' });
      render();
      break;
    case 'export': {
      downloadFile(
        `somnia-backup-${todayKey()}.json`,
        JSON.stringify(exportBackup(), null, 2),
      );
      showToast('Backup downloaded.');
      break;
    }
    case 'import': {
      const input =
        document.querySelector('#settings-root #import-file') || document.querySelector('#import-file');
      input?.click();
      break;
    }
    case 'clear-data': {
      const confirmed = await confirmDialog({
        title: 'Clear your journal?',
        body: 'All sleep entries will be deleted from this browser. Your preferences and Spotify Client ID stay. This cannot be undone.',
        confirmLabel: 'Clear journal',
        danger: true,
      });
      if (confirmed) {
        clearNights();
        updateSettings({ sampleData: false });
        closeSettings();
        render();
        showToast('Journal cleared.', 'info');
      }
      break;
    }
    case 'modal-close':
      closeModal();
      break;
    case 'confirm-yes':
      resolveConfirm(true);
      break;
    case 'confirm-cancel':
      resolveConfirm(false);
      break;
    case 'onboard-next':
      onboardingNext();
      break;
    case 'onboard-back':
      readOnboardingForm();
      appState.onboarding.step = Math.max(0, appState.onboarding.step - 1);
      renderOnboarding();
      break;
    case 'onboard-skip':
      skipOnboarding();
      break;
    default:
      console.warn('Unknown action', action);
  }
}

async function importJournal(file) {
  if (getNights().length) {
    const confirmed = await confirmDialog({
      title: 'Import this backup?',
      body: 'The imported journal will replace the sleep entries currently in this browser. Your Spotify setup is kept.',
      confirmLabel: 'Import backup',
    });
    if (!confirmed) return;
  }
  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    const count = importBackup(payload);
    updateSettings({ onboarded: true });
    closeSettings();
    render();
    showToast(`${count} ${count === 1 ? 'night' : 'nights'} imported.`);
  } catch (error) {
    console.error(error);
    showToast(error.message || 'That file could not be imported.', 'error');
  }
}

/* -------------------------------- events --------------------------------- */

function bindEvents() {
  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-action]');
    if (!trigger) return;
    const action = trigger.dataset.action;
    if (!action) return;
    event.preventDefault();
    handleAction(action, trigger).catch((error) => {
      console.error(error);
      showToast(error.message || 'Something went wrong.', 'error');
    });
  });

  document.addEventListener('submit', (event) => {
    if (event.target.id === 'log-form') {
      event.preventDefault();
      saveLogForm(event.target);
    } else if (event.target.id === 'settings-form') {
      event.preventDefault();
      saveSettingsForm(event.target);
    } else if (event.target.id === 'onboarding-form') {
      event.preventDefault();
      onboardingNext();
    }
  });

  document.addEventListener('input', (event) => {
    const target = event.target;
    if (target.id === 'sound-volume') {
      soundEngine.setVolume(Number(target.value) / 100);
      return;
    }
    if (target.closest('#log-form')) {
      updateLogPreview();
      return;
    }
    if (target.closest('#onboarding-form')) {
      updateOnboardingSelections(target);
      if (target.id === 'onboard-bedtime' || target.id === 'onboard-wake') {
        updateOnboardingWindow();
      }
      return;
    }
    if (target.id === 'spotify-search') {
      appState.spotify.search = target.value;
      const list = document.getElementById('spotify-list');
      if (list) {
        list.innerHTML = spotifyPlaylistGrid({
          ...appState.spotify,
          connected: isConnected(),
        });
      }
      return;
    }
    if (target.id === 'goal-range') {
      const output = document.getElementById('goal-output');
      if (output) output.textContent = `${target.value}h`;
    }
  });

  document.addEventListener('change', async (event) => {
    const target = event.target;
    if (target.id === 'import-file') {
      const file = target.files?.[0];
      target.value = '';
      if (file) await importJournal(file);
      return;
    }
    if (target.id === 'spotify-device') {
      appState.spotify.selectedDevice = target.value;
      return;
    }
    if (target.closest('#log-form')) {
      updateLogPreview();
      return;
    }
    if (target.closest('#onboarding-form')) {
      updateOnboardingSelections(target);
      return;
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target.tagName !== 'TEXTAREA') {
      if (event.target.closest('#log-form')) {
        event.preventDefault();
        const form = document.getElementById('log-form');
        if (form) saveLogForm(form);
        return;
      }
      if (event.target.closest('#settings-form') && event.target.tagName !== 'BUTTON') {
        event.preventDefault();
        const form = document.getElementById('settings-form');
        if (form) saveSettingsForm(form);
        return;
      }
      if (event.target.closest('#onboarding-form') && event.target.tagName !== 'BUTTON') {
        event.preventDefault();
        onboardingNext();
        return;
      }
    }
    if (event.key === 'Escape') {
      if (document.getElementById('modal-root')?.innerHTML) {
        closeModal();
        return;
      }
      if (document.getElementById('settings-root')?.innerHTML) {
        closeSettings();
        return;
      }
    }
    if (event.key !== 'Tab') return;
    const modal = document.querySelector('#modal-root .modal');
    const drawer = document.querySelector('#settings-root .drawer');
    const onboarding = document.querySelector('#onboarding-root .onboarding-card');
    const container = modal || drawer || onboarding;
    if (!container) return;
    const focusable = [...container.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )].filter((element) => element.getClientRects().length > 0);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  window.addEventListener('hashchange', () => {
    appState.route = routeFromHash();
    render();
    window.scrollTo({ top: 0, behavior: 'auto' });
  });
}

/* Offline shell. Only possible on https:// or localhost, so this is a quiet
   no-op over plain Wi-Fi rather than an error the user has to dismiss. */
function registerOfflineShell() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((error) => {
      console.warn('Offline support unavailable:', error.message);
    });
  });
}

async function boot() {
  mountShell();
  registerOfflineShell();
  bindEvents();
  soundEngine.onChange((state) => syncSoundUI(state));
  appState.route = routeFromHash();

  let redirectError = '';
  try {
    const handled = await handleRedirect();
    if (handled) appState.route = routeFromHash();
  } catch (error) {
    console.error(error);
    redirectError = error.message || 'Spotify sign-in could not be completed.';
  }

  render();
  syncSoundUI();
  if (redirectError) showToast(redirectError, 'error');
  if (!getSettings().onboarded) openOnboarding();
}

boot();
