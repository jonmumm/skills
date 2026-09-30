import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// One self-contained dist/index.html: every module, shader and generated asset inlined.
// No CDN or runtime fetches, so it opens from file://, a static host, or a Claude artifact.
export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    target: 'es2022',
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 20_000,
  },
});
