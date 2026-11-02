/* Browser-only Spotify Authorization Code + PKCE. No client secret, no backend. */

const TOKEN_KEY = 'somnia.spotify.tokens.v1';
const PKCE_KEY = 'somnia.spotify.pkce.v1';
const RETURN_KEY = 'somnia.spotify.return.v1';

const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API_URL = 'https://api.spotify.com/v1';

export const SPOTIFY_SCOPES = [
  'user-read-private',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-read-playback-state',
  'user-modify-playback-state',
];

export class SpotifyError extends Error {
  constructor(message, { status = 0, reason = '' } = {}) {
    super(message);
    this.name = 'SpotifyError';
    this.status = status;
    this.reason = reason;
  }
}

function readSession(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSession(key, value) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* Private mode can block this; the redirect will then ask for consent again. */
  }
}

function clearSession(key) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* noop */
  }
}

function loadTokens() {
  try {
    const parsed = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.accessToken && !parsed.refreshToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveTokens(tokens) {
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
  } catch {
    throw new SpotifyError('Your browser blocked local storage, so Spotify cannot stay connected.');
  }
}

let tokens = loadTokens();
let refreshPromise = null;

export function redirectUri() {
  return `${window.location.origin}${window.location.pathname}`;
}

export function isConnected() {
  return Boolean(tokens?.refreshToken || tokens?.accessToken);
}

export function getTokenInfo() {
  if (!tokens) return null;
  return {
    expiresAt: tokens.expiresAt,
    scope: tokens.scope,
    clientId: tokens.clientId,
  };
}

export function disconnect() {
  tokens = null;
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* noop */
  }
  clearSession(PKCE_KEY);
}

function randomVerifier(length = 72) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

function base64Url(bytes) {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256(value) {
  if (!crypto?.subtle) {
    throw new SpotifyError(
      'Spotify needs a secure browser context. Open Sleepline on http://127.0.0.1 or HTTPS.',
    );
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return base64Url(new Uint8Array(digest));
}

export async function connect(clientId) {
  const trimmed = String(clientId || '').trim();
  if (!trimmed) throw new SpotifyError('Add your Spotify Client ID first.');

  const verifier = randomVerifier();
  const challenge = await sha256(verifier);
  const state = randomVerifier(24);

  writeSession(
    PKCE_KEY,
    JSON.stringify({
      verifier,
      state,
      clientId: trimmed,
      createdAt: Date.now(),
    }),
  );
  writeSession(RETURN_KEY, window.location.hash || '#sounds');

  // A new Client ID means any old tokens are no longer useful.
  disconnect();
  writeSession(
    PKCE_KEY,
    JSON.stringify({
      verifier,
      state,
      clientId: trimmed,
      createdAt: Date.now(),
    }),
  );
  writeSession(RETURN_KEY, window.location.hash || '#sounds');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: trimmed,
    scope: SPOTIFY_SCOPES.join(' '),
    redirect_uri: redirectUri(),
    state,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    show_dialog: 'false',
  });

  window.location.assign(`${AUTH_URL}?${params.toString()}`);
}

async function exchangeCode(code, verifier, clientId) {
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(),
    code_verifier: verifier,
  });

  let response;
  try {
    response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch {
    throw new SpotifyError(
      'Could not reach Spotify. Check your connection or any browser privacy settings blocking the token request.',
    );
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new SpotifyError(
      data.error_description || 'Spotify rejected the sign-in. Check the Client ID and redirect URI.',
      { status: response.status, reason: data.error || '' },
    );
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
    scope: data.scope || SPOTIFY_SCOPES.join(' '),
    clientId,
    connectedAt: Date.now(),
  };
}

/** Returns true when the current URL contained a Spotify callback that was handled. */
export async function handleRedirect() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const error = params.get('error');
  if (!code && !error) return false;

  const cleanUrl = () => {
    window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`);
  };

  if (error) {
    cleanUrl();
    throw new SpotifyError(
      error === 'access_denied'
        ? 'Spotify connection was cancelled.'
        : `Spotify sign-in failed: ${params.get('error_description') || error}`,
      { reason: error },
    );
  }

  const raw = readSession(PKCE_KEY);
  if (!raw) {
    cleanUrl();
    throw new SpotifyError('The Spotify sign-in link expired. Try connecting again.');
  }

  let pending;
  try {
    pending = JSON.parse(raw);
  } catch {
    cleanUrl();
    throw new SpotifyError('The Spotify sign-in could not be verified. Try again.');
  }

  if (params.get('state') !== pending.state) {
    cleanUrl();
    throw new SpotifyError('Spotify sign-in state did not match. Try connecting again.');
  }

  try {
    const nextTokens = await exchangeCode(code, pending.verifier, pending.clientId);
    tokens = nextTokens;
    saveTokens(nextTokens);
    clearSession(PKCE_KEY);
    cleanUrl();
    const returnHash = readSession(RETURN_KEY);
    if (returnHash) {
      window.location.hash = returnHash;
      clearSession(RETURN_KEY);
    }
    return true;
  } catch (err) {
    cleanUrl();
    throw err;
  }
}

async function refreshTokens() {
  if (!tokens?.refreshToken) {
    throw new SpotifyError('Connect Spotify again to continue.');
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refreshToken,
    client_id: tokens.clientId || '',
  });

  let response;
  try {
    response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch {
    throw new SpotifyError('Could not reach Spotify to refresh the connection.');
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (data.error === 'invalid_grant') {
      disconnect();
      throw new SpotifyError('The Spotify connection expired. Connect again.', {
        status: response.status,
        reason: data.error,
      });
    }
    throw new SpotifyError(data.error_description || 'Spotify could not refresh the connection.', {
      status: response.status,
      reason: data.error || '',
    });
  }

  tokens = {
    ...tokens,
    accessToken: data.access_token,
    refreshToken: data.refresh_token || tokens.refreshToken,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
    scope: data.scope || tokens.scope,
  };
  saveTokens(tokens);
  return tokens.accessToken;
}

async function accessToken(force = false) {
  if (!tokens) throw new SpotifyError('Connect Spotify first.');
  if (!force && tokens.accessToken && Date.now() < tokens.expiresAt - 60000) {
    return tokens.accessToken;
  }
  if (!refreshPromise) {
    refreshPromise = refreshTokens().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function api(path, { method = 'GET', body, retry = true } = {}) {
  const token = await accessToken();
  const headers = { Authorization: `Bearer ${token}` };
  if (body) headers['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new SpotifyError('Could not reach Spotify. Check your connection.');
  }

  if (response.status === 401 && retry) {
    await accessToken(true);
    return api(path, { method, body, retry: false });
  }

  if (response.status === 204) return null;

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.error?.message || `Spotify request failed (${response.status}).`;
    throw new SpotifyError(message, {
      status: response.status,
      reason: data?.error?.reason || '',
    });
  }
  return data;
}

export async function getProfile() {
  return api('/me');
}

export async function getPlaylists() {
  const data = await api('/me/playlists?limit=50');
  const items = Array.isArray(data?.items) ? data.items : [];
  return items
    .filter(Boolean)
    .map((playlist) => ({
      id: playlist.id,
      name: playlist.name || 'Untitled playlist',
      uri: playlist.uri,
      description: playlist.description || '',
      image: playlist.images?.[0]?.url || '',
      trackCount: playlist.items?.total ?? playlist.tracks?.total ?? 0,
      owner: playlist.owner?.display_name || '',
      url: playlist.external_urls?.spotify || '',
    }))
    .filter((playlist) => playlist.uri);
}

export async function getDevices() {
  const data = await api('/me/player/devices');
  const devices = Array.isArray(data?.devices) ? data.devices : [];
  return devices.map((device) => ({
    id: device.id,
    name: device.name || 'Spotify device',
    type: device.type || 'device',
    active: Boolean(device.is_active),
    volume: device.volume_percent,
    restricted: Boolean(device.is_restricted),
  }));
}

export async function playPlaylist(uri, deviceId) {
  const query = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : '';
  try {
    await api(`/me/player/play${query}`, {
      method: 'PUT',
      body: { context_uri: uri },
    });
  } catch (error) {
    if (error.status === 404) {
      throw new SpotifyError(
        'No active Spotify device. Open Spotify on your phone or computer, play something briefly, then try again.',
        { status: 404, reason: 'NO_ACTIVE_DEVICE' },
      );
    }
    if (error.status === 403) {
      throw new SpotifyError(
        'Playback needs Spotify Premium and an allowed developer account. You can still open the playlist in Spotify.',
        { status: 403, reason: 'PREMIUM_REQUIRED' },
      );
    }
    throw error;
  }
}
