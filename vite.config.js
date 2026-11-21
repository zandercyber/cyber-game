import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths so the build works on GitHub Pages (/cyber-game/) and in previews.
  base: './',
  build: {
    // No source maps in production: players only get the minified bundle.
    sourcemap: false,
    // Phaser alone is ~1 MB minified; don't warn about it.
    chunkSizeWarningLimit: 2000,
  },
});
