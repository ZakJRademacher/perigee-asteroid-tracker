import { defineConfig, bindings, triggers } from 'cf/config';

export default defineConfig({
  worker: {
    name: 'perigee',
    compatibilityDate: '2026-10-21',
    entrypoint: './dist/server/index.js',
    workersDev: true,
    previewUrls: false,
    // Shared cache for NASA catalogs and JPL position vectors across all Worker instances.
    env: {
      CACHE: bindings.kv({ id: 'fc9e04ca936442249560e1ab3295f22e' }),
      // Per-visitor budgets for uncached NASA/JPL lookups (LIMITS in worker/limit.js; a test keeps them in step).
      CATALOG_LIMITER: bindings.rateLimit({ namespace: '1001', simple: { limit: 10, period: 60 } }),
      ORBIT_LIMITER: bindings.rateLimit({ namespace: '1002', simple: { limit: 300, period: 60 } }),
    },
    // Every 5 minutes, pre-load a small batch of positions for today's window.
    triggers: [triggers.scheduled({ schedule: '*/5 * * * *' })],
    observability: {
      enabled: true,
      logs: { enabled: true, headSamplingRate: 1 },
      traces: { enabled: true, headSamplingRate: 0.01 },
    },
  },
});
