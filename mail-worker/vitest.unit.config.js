import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		include: ['test/**/*.spec.js'],
		exclude: ['test/index.spec.js'],
	},
});
