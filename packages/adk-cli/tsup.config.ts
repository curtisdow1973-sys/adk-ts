import { defineConfig } from 'tsup';

export default defineConfig([
	// CLI build
	{
		entry: ['src/cli/index.ts'],
		format: ['esm'],
		outDir: 'dist/cli',
		clean: true,
		minify: false,
		sourcemap: true,
		shims: true,
		target: 'node22',
		banner: {
			js: '#!/usr/bin/env node\n',
		},
	},
	// Library build
	{
		entry: ['src/index.ts'],
		format: ['esm', 'cjs'],
		outDir: 'dist',
		clean: false,
		dts: true,
		minify: false,
		sourcemap: true,
		external: ['react', 'react-dom'],
		target: 'node22',
	},
]);
