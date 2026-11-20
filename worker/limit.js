// Per-visitor budgets for requests that would contact NASA or JPL. Answers already in the shared
// cache are never limited, so ordinary browsing is unaffected; the budgets only stop one client
// from spending the upstream rate limits that every visitor depends on.
//   catalog: an uncached start date costs about seven NASA NeoWs calls, and a visitor rarely
//            needs more than a few new dates a minute.
//   orbit:   positions are only fetched for objects in that window's catalog (up to about 265), and
//            the first visitor on a cold day can ask JPL for all of them within a minute or two.
//            The budget sits above a whole window so that visitor is never paused; it stops one
//            connection from requesting faster than that.
export const LIMITS = { catalog: { limit: 10, period: 60 }, orbit: { limit: 300, period: 60 } };

// binding: the Workers rate-limiting binding (shared across instances in a location). Without it,
// for example in local previews, a per-instance sliding window applies the same budget.
export function makeUpstreamGate({ now = Date.now, ...budget } = {}) {
  const { limit, period } = budget;
  if (!(limit > 0 && period > 0)) throw RangeError('A rate-limit budget needs a positive limit and period.');
  const recent = new Map();
  return async (key, binding = null) => {
    if (binding) {
      try {
        return (await binding.limit({ key })).success;
      } catch {
        // Fall back to the local window rather than failing open or closed.
      }
    }
    const t = now(),
      hits = (recent.get(key) ?? []).filter(time => t - time < period * 1000);
    const allowed = hits.length < limit;
    if (allowed) hits.push(t);
    recent.delete(key);
    recent.set(key, hits);
    if (recent.size > 2000) recent.delete(recent.keys().next().value);
    return allowed;
  };
}

export function clientKey(request) {
  return request.headers.get('CF-Connecting-IP') ?? 'local';
}
