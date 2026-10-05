// Registers the service worker that makes Loomux installable (LOOM-102;
// public/sw.js). Production builds only: in dev, Vite serves the app and
// a worker would only get in the way. A browser without service workers,
// or a failed registration, leaves the app working as a plain page.
export function registerServiceWorker(
  nav: Navigator = navigator,
  production: boolean = import.meta.env.PROD,
): void {
  if (!production || !("serviceWorker" in nav)) return;
  window.addEventListener("load", () => {
    nav.serviceWorker.register("/sw.js").catch((err: unknown) => {
      console.warn("service worker not registered", err);
    });
  });
}
