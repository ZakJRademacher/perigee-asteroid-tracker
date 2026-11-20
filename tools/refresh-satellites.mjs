// Refresh the satellite orbit groups in the Workers KV store from outside
// Cloudflare. CelesTrak does not accept connections from Cloudflare Workers, so
// a scheduled GitHub Actions job downloads each group (at most once per two
// hours, as CelesTrak asks) and writes it under the key the Worker reads.
//
// Usage: node tools/refresh-satellites.mjs [--dry-run] [group ...]
// Needs CLOUDFLARE_API_TOKEN (Workers KV edit) and CLOUDFLARE_ACCOUNT_ID unless --dry-run.
import { readFileSync } from 'node:fs';
import {
  SATELLITE_GROUPS,
  SATELLITE_FIELDS,
  SATELLITE_STALE_TTL,
  compactSatellites,
  satelliteKey
} from '../worker/celestrak.js';

const args = process.argv.slice(2),
  dryRun = args.includes('--dry-run');
const groups = args.filter(a => !a.startsWith('--'));
for (const g of groups) if (!SATELLITE_GROUPS.includes(g)) throw Error('Unknown group ' + g);
const config = readFileSync(new URL('../cloudflare.config.ts', import.meta.url), 'utf8');
const namespace =
  process.env.KV_NAMESPACE_ID ?? /bindings\.kv\(\{\s*id:\s*'([0-9a-f]{32})'/.exec(config)?.[1];
const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account } = process.env;
if (!namespace) throw Error('KV namespace ID not found in cloudflare.config.ts');
if (!dryRun && (!token || !account))
  throw Error('Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID, or pass --dry-run.');

const results = [];
for (const group of groups.length ? groups : SATELLITE_GROUPS) {
  try {
    const response = await fetch(
      'https://celestrak.org/NORAD/elements/gp.php?GROUP=' + group + '&FORMAT=json',
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Perigee-orbit-refresh/1.4 (educational visualization)'
        },
        signal: AbortSignal.timeout(60000)
      }
    );
    const text = await response.text();
    if (response.status === 403 && /has not updated/i.test(text)) {
      results.push([group, 'unchanged since last download']);
      continue;
    }
    if (!response.ok) throw Error('CelesTrak HTTP ' + response.status);
    const data = {
      schema: 1,
      group,
      source: 'CelesTrak GP (OMM JSON)',
      fields: SATELLITE_FIELDS,
      retrievedAt: new Date().toISOString(),
      records: compactSatellites(JSON.parse(text), group)
    };
    if (!dryRun) {
      const put = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${account}/storage/kv/namespaces/${namespace}/values/${encodeURIComponent(satelliteKey(group))}?expiration_ttl=${SATELLITE_STALE_TTL / 1000}`,
        {
          method: 'PUT',
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'text/plain' },
          body: JSON.stringify(data)
        }
      );
      if (!put.ok) throw Error('KV write HTTP ' + put.status + ' ' + (await put.text()).slice(0, 200));
    }
    results.push([
      group,
      data.records.length + ' satellites' + (dryRun ? ' (dry run, not written)' : ' written')
    ]);
  } catch (e) {
    results.push([group, 'FAILED: ' + e.message]);
  }
}
for (const [group, result] of results) console.log(group.padEnd(9), result);
if (results.every(([, r]) => r.startsWith('FAILED'))) process.exit(1);
