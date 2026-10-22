import { defineConfig } from 'cf/config';

export default defineConfig({
  worker: {
    name: 'perigee',
    compatibilityDate: '2026-10-21',
    entrypoint: './dist/server/index.js',
    workersDev: true,
    previewUrls: false,
    observability: {
      enabled: true,
      logs: { enabled: true, headSamplingRate: 1 },
      traces: { enabled: true, headSamplingRate: 0.01 },
    },
  },
});
