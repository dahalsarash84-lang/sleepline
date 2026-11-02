/* Product analytics — PostHog, opt-in only.

   Nothing is downloaded, stored or sent until usage sharing is switched on in
   Settings or on the last onboarding step, and the app works exactly the same
   with it off. Events describe what was done (onboarding finished, a night
   logged, a soundscape started) plus coarse preferences such as the sleep
   goal and how many nights exist. Names, notes, sleep times and quality
   ratings never leave the device.

   The SDK is vendored at js/vendor/posthog.js (posthog-js 1.444.0, the
   official browser ES module build) so the app keeps its no-build promise. */

import { getSettings } from './store.js';
import { uid } from './utils.js';

const HOST = 'https://us.i.posthog.com';
const VISITOR_KEY = 'somnia.analytics.id';

let client = null;
let loading = null;

function readVisitorId() {
  try {
    return localStorage.getItem(VISITOR_KEY) || '';
  } catch {
    return '';
  }
}

function ensureVisitorId() {
  const existing = readVisitorId();
  if (existing) return existing;
  const created = uid();
  try {
    localStorage.setItem(VISITOR_KEY, created);
  } catch {
    /* Private mode: the in-memory id lasts for this visit only. */
  }
  return created;
}

/** True when the person agreed to analytics and a project key is configured. */
export function analyticsAllowed() {
  const settings = getSettings();
  return Boolean(settings.analyticsConsent && settings.posthogKey);
}

/** Loads and starts the SDK once. Resolves to null when analytics is off. */
function ensureClient() {
  if (client) return Promise.resolve(client);
  if (!analyticsAllowed()) return Promise.resolve(null);
  if (loading) return loading;

  const token = getSettings().posthogKey.trim();
  loading = import('./vendor/posthog.js')
    .then(({ default: posthog }) => {
      posthog.init(token, {
        api_host: HOST,
        defaults: '2025-05-24',
        person_profiles: 'identified_only',
        persistence: 'localStorage',
        capture_pageview: false,
        capture_pageleave: false,
        autocapture: false,
        disable_session_recording: true,
        disable_surveys: true,
        disable_external_dependency_loading: true,
      });
      client = posthog;
      return client;
    })
    .catch((error) => {
      loading = null;
      console.warn('Usage analytics unavailable:', error.message);
      return null;
    });

  return loading;
}

/** Ties the event stream to this browser, so funnels and retention line up. */
export async function identifyPerson(properties = {}) {
  const posthog = await ensureClient();
  if (!posthog) return;
  try {
    posthog.identify(ensureVisitorId(), properties);
  } catch (error) {
    console.warn('Could not identify the analytics visitor:', error.message);
  }
}

export async function capture(event, properties = {}) {
  const posthog = await ensureClient();
  if (!posthog) return;
  try {
    posthog.capture(event, properties);
  } catch (error) {
    console.warn(`Could not record "${event}":`, error.message);
  }
}

/** One $pageview per route, sent by hand because Somnia is a single page. */
export async function capturePageview(route) {
  await capture('$pageview', { route, $current_url: `${window.location.origin}/#${route}` });
}

/** Re-checks the setting after a save. Identifies when it was just turned on. */
export async function syncAnalytics(properties = {}) {
  if (!analyticsAllowed()) {
    stopAnalytics();
    return;
  }
  await identifyPerson(properties);
}

/** Withdraws consent: stops sending, clears the PostHog person and our id. */
export function stopAnalytics() {
  if (client) {
    try {
      client.opt_out_capturing();
      client.reset();
    } catch (error) {
      console.warn('Could not stop analytics:', error.message);
    }
  }
  client = null;
  loading = null;
  try {
    localStorage.removeItem(VISITOR_KEY);
  } catch {
    /* Nothing stored, nothing to clear. */
  }
}
