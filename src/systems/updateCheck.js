// Auto-update: GitHub Pages lets browsers reuse a saved copy of the page for
// ~10 minutes, so right after a deploy you could still get the old game.
// This asks the server which version is live (never cached) and, if it's
// newer than the one running, reloads once with a fresh URL to fetch it.

import { DEBUG } from './debug.js';

const RUNNING = __BUILD_ID__;

export async function checkForUpdate() {
  // Only on the live site (and locally in debug mode, for testing).
  if (!window.location.hostname.endsWith('github.io') && !DEBUG) return;
  try {
    const res = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const { id } = await res.json();
    if (!id || id === RUNNING) return;

    // Never reload more than once per new version (no reload loops).
    const key = `cyber-game-updated-to-${id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');

    const url = new URL(window.location.href);
    url.searchParams.set('v', id); // a new URL can't come from the browser's saved copy
    window.location.replace(url.toString());
  } catch {
    // Offline or blocked: keep playing the version we have.
  }
}

/** Check now, and again whenever the player comes back to the tab. */
export function watchForUpdates() {
  checkForUpdate();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate();
  });
}

export const BUILD_ID = RUNNING;
