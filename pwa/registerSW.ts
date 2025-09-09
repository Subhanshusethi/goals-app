// Lightweight service worker registration helper
// Safe to import from client components.

export function registerSW() {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;

  const swUrl = '/sw.js';
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(swUrl)
      .then((reg) => {
        // Optional: listen for updates
        if (reg && reg.update) {
          // Trigger update check
          try { reg.update(); } catch {}
        }
      })
      .catch(() => {
        // no-op
      });
  });
}
