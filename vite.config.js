import { defineConfig } from 'vite';

// A new id for every build. The game compares it with version.json on the
// server to notice when a newer version has been deployed.
const BUILD_ID = Date.now().toString(36);

export default defineConfig({
  // Relative paths so the build works on GitHub Pages (/cyber-game/) and in previews.
  base: './',
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  build: {
    // No source maps in production: players only get the minified bundle.
    sourcemap: false,
    // Phaser alone is ~1 MB minified; don't warn about it.
    chunkSizeWarningLimit: 2000,
  },
  plugins: [
    {
      name: 'version-file',
      apply: 'build',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ id: BUILD_ID }) });
      },
    },
  ],
});
