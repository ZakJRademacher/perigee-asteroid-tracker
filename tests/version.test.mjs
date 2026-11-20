import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the page footer and the JPL User-Agent show the package version', () => {
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const page = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
  assert.ok(page.includes(`<span id="version">v${version}</span>`));
  const horizons = readFileSync(new URL('../worker/horizons.js', import.meta.url), 'utf8');
  assert.ok(horizons.includes(`'Perigee/${version.split('.').slice(0, 2).join('.')} (`));
});
