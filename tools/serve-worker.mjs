import { createServer } from 'node:http';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import worker from '../dist/server/index.js';
// A file-backed stand-in for the Workers KV binding, so restarting the local
// preview reuses NASA, JPL and CelesTrak responses instead of downloading again.
// CelesTrak in particular refuses repeat downloads of a group within two hours.
const folder = resolve(import.meta.dirname, '..', '.preview-cache');
await mkdir(folder, { recursive: true });
const file = key => resolve(folder, encodeURIComponent(key) + '.json');
const CACHE = {
  async get(key) {
    try {
      const entry = JSON.parse(await readFile(file(key), 'utf8'));
      return entry.expires > Date.now() ? entry.value : null;
    } catch {
      return null;
    }
  },
  async put(key, value, { expirationTtl = 3600 } = {}) {
    await writeFile(file(key), JSON.stringify({ key, value, expires: Date.now() + expirationTtl * 1000 }));
  },
  async list({ prefix = '' } = {}) {
    const keys = [];
    for (const name of await readdir(folder)) {
      const key = decodeURIComponent(name.replace(/\.json$/, ''));
      if (key.startsWith(prefix) && (await CACHE.get(key)) !== null) keys.push({ name: key });
    }
    return { keys, list_complete: true };
  }
};
const port = Number(process.env.PORT || 8790);
const server = createServer(async (req, res) => {
  try {
    const request = new Request('http://127.0.0.1:' + port + req.url, {
        method: req.method,
        headers: req.headers
      }),
      reply = await worker.fetch(request, { NASA_API_KEY: process.env.NASA_API_KEY, CACHE });
    res.writeHead(reply.status, Object.fromEntries(reply.headers));
    res.end(Buffer.from(await reply.arrayBuffer()));
  } catch (e) {
    res.writeHead(500);
    res.end('Preview error: ' + e.message);
  }
});
server.listen(port, '127.0.0.1', () => console.log('Worker preview: http://127.0.0.1:' + port + '/'));
process.on('SIGINT', () => server.close());
