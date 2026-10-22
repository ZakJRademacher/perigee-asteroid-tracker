import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig({
  plugins: [cloudflare()],
  publicDir: false,
  // dist/ contains the existing frontend source; never empty it during a build.
  build: { outDir: '.cloudflare/build', emptyOutDir: true },
});
