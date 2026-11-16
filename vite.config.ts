/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { BASE_PATH } from './worker/base';

export default defineConfig({
	base: BASE_PATH,
	plugins: [react()],
	test: {
		environment: 'node',
	},
});
