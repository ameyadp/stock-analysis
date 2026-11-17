/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { BASE_PATH } from './worker/base';

export default defineConfig({
	base: BASE_PATH,
	define: {
		__APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
	},
	plugins: [
		react(),
		VitePWA({
			registerType: 'autoUpdate',
			includeAssets: ['icon.svg', 'apple-touch-icon.png'],
			manifest: {
				name: 'Stock Analysis',
				short_name: 'Stocks',
				description: 'See how a stock behaved through Fed rate cycles and how sensitive it is to the economy.',
				theme_color: '#2b4acb',
				background_color: '#ffffff',
				display: 'standalone',
				start_url: BASE_PATH,
				scope: BASE_PATH,
				id: BASE_PATH,
				icons: [
					{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
					{ src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
					{ src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
				],
			},
			workbox: {
				// Network-first app page + one-time repair of windows stuck on the website homepage.
				importScripts: ['sw-heal.js'],
				// Data and usage pings always go to the network; the app caches data itself.
				navigateFallbackDenylist: [/\/api\//],
			},
		}),
	],
	test: {
		environment: 'node',
	},
});
