// Loomux's service worker (LOOM-102): there so the app can be installed
// and opened from a notification's link. It caches nothing and handles
// no requests — every page and API call goes to the network as without
// it, so a deploy is never hidden behind a stale copy. Notifications
// come from ntfy, not Web Push.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
