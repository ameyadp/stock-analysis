/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { BASE_PATH } from './worker/base';

export default defineConfig({
	base: BASE_PATH,
	define: {
		__APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
	},
	plugins: [react()],
	test: {
		environment: 'node',
	},
});
