// Loaded by the generated service worker (see vite.config.ts → workbox.importScripts).
//
// 1. Pages are fetched fresh from the network whenever online; the saved copy is
//    used only offline. An outdated or wrong saved page can never be shown again.
// 2. One-time repair: earlier versions could save the website's homepage as this
//    app's page. When this version activates, reload any open windows once so
//    they pick up the real app.

const SCOPE_PATH = new URL(self.registration.scope).pathname;
// Caches are shared by every app on this domain, so the marker is specific to this app.
const REPAIR_MARKER = `app-page-repair-v1:${SCOPE_PATH}`;

self.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.mode !== 'navigate') return;
	const url = new URL(request.url);
	if (url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE_PATH) || url.pathname.includes('/api/')) return;

	event.respondWith(
		(async () => {
			try {
				const response = await fetch(request);
				if (response.ok) return response;
				throw new Error(`HTTP ${response.status}`);
			} catch {
				// Offline: fall back to the saved app page.
				const saved = await caches.match(new URL('index.html', self.registration.scope).href, { ignoreSearch: true });
				return saved ?? Response.error();
			}
		})(),
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			if (await caches.has(REPAIR_MARKER)) return;
			await caches.open(REPAIR_MARKER);
			await self.clients.claim();
			const windows = await self.clients.matchAll({ type: 'window' });
			await Promise.all(windows.map((client) => client.navigate(client.url).catch(() => {})));
		})(),
	);
});
