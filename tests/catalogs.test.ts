import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { CatalogManager } from '../server/catalogs.ts';
import { createGateway } from '../server/gateway.ts';

const fixtureService = String.raw`
const { createServer } = require('node:net');
const { readFileSync, writeFileSync, appendFileSync } = require('node:fs');
const { join, dirname } = require('node:path');
const args = process.argv.slice(2);
const directory = args[args.indexOf('--snapshot-dir') + 1];
const socket = args[args.indexOf('--socket') + 1];
const { tag } = JSON.parse(readFileSync(join(directory, 'nodes.json'), 'utf8'));
writeFileSync(join(directory, 'pid'), String(process.pid));
appendFileSync(join(dirname(process.argv[1]), 'pids'), process.pid + '\n');
const server = createServer(connection => {
 let buffer = '';
 connection.on('data', chunk => {
  buffer += chunk;
  while (buffer.includes('\n')) {
   const end = buffer.indexOf('\n');
   const request = JSON.parse(buffer.slice(0,end)); buffer = buffer.slice(end+1);
   const result = request.method === 'graph.snapshot_info'
    ? {version:'5.0', schema_fingerprint:tag, built_at:'2026-10-12T00:00:00Z', node_count:1, edge_count:0, identity_count:1}
    : {tag,query:request.params.query};
   const reply = () => { if (!connection.destroyed) connection.write(JSON.stringify({jsonrpc:'2.0',id:request.id,result}) + '\n'); };
   if (request.params.query === 'slow') setTimeout(reply,300); else reply();
  }
 });
});
server.listen(socket);
process.on('SIGTERM', () => server.close(() => process.exit(0)));
`;
async function fixture(t: any) {
  const directory = await mkdtemp(join(tmpdir(), 'dog-catalog-test-'));
  const executable = join(directory, 'service.cjs');
  await writeFile(executable, fixtureService);
  const definitions = await Promise.all(
    ['mcd', 'sbux'].map(async (id) => {
      const snapshotDirectory = join(directory, id);
      await mkdir(snapshotDirectory);
      await writeFile(join(snapshotDirectory, 'nodes.json'), JSON.stringify({ tag: id }));
      await writeFile(join(snapshotDirectory, 'edges.json'), '{}');
      await writeFile(join(snapshotDirectory, 'annotations.json'), '{}');
      return {
        id,
        label: id,
        snapshotDirectory,
        initialFocus: { kind: 'dataset' as const, nodeId: `fixture:${id}.start` },
      };
    }),
  );
  const manager = new CatalogManager({
    catalogs: definitions,
    executable: process.execPath,
    executableArgs: [executable],
    readinessMs: 3000,
  });
  t.after(async () => {
    await manager.close();
    await rm(directory, { recursive: true, force: true });
  });
  return { manager, directory, definitions };
}
test('dropdown registry activates one owned runtime and rejects wrong-catalog requests', async (t) => {
  const { manager, directory } = await fixture(t);
  const server = createGateway({ graph: manager, catalogs: manager, staticDir: directory });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const url = `http://127.0.0.1:${(server.address() as any).port}`;
  const post = (path: string, value: unknown) =>
    fetch(url + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(value),
    });
  const inventory = await (await fetch(url + '/api/catalogs')).json();
  assert.deepEqual(
    inventory.catalogs.map((catalog: any) => catalog.id),
    ['mcd', 'sbux'],
  );
  assert.ok(!JSON.stringify(inventory).includes(directory));
  const first = await (await post('/api/catalog', { catalog_id: 'mcd' })).json();
  assert.equal(first.catalog.id, 'mcd');
  assert.equal(first.graph, 'connected');
  const firstPid = Number(await readFile(join(directory, 'mcd/pid'), 'utf8'));
  const second = await (await post('/api/catalog', { catalog_id: 'sbux' })).json();
  assert.equal(second.catalog.id, 'sbux');
  assert.equal(second.snapshot.schema_fingerprint, 'sbux');
  assert.notEqual(first.generation, second.generation);
  assert.throws(() => process.kill(firstPid, 0));
  assert.equal(
    (
      await post('/api/graph', {
        catalog_id: 'mcd',
        method: 'graph.search',
        params: { query: 'sales' },
      })
    ).status,
    409,
  );
  assert.equal(
    (await post('/api/graph', { method: 'graph.search', params: { query: 'sales' } })).status,
    400,
  );
  assert.equal((await post('/api/catalog', { catalog_id: '../../other' })).status, 400);
  const result = await (
    await post('/api/graph', {
      catalog_id: 'sbux',
      method: 'graph.search',
      params: { query: 'sales' },
    })
  ).json();
  assert.equal(result.catalog_id, 'sbux');
  assert.equal(result.result.tag, 'sbux');
  assert.equal(result.generation, second.generation);
});
test('switching invalidates in-flight evidence and shutdown leaves no owned processes', async (t) => {
  const { manager, directory } = await fixture(t);
  await manager.activate('mcd');
  const rejected = assert.rejects(manager.callFor('mcd', 'graph.search', { query: 'slow' }));
  await new Promise((resolve) => setTimeout(resolve, 40));
  await manager.activate('sbux');
  await rejected;
  assert.equal(
    (await manager.callFor('sbux', 'graph.search', { query: 'sales' })).response.result &&
      manager.selectedId,
    'sbux',
  );
  const attempts = await Promise.allSettled([
    manager.activate('mcd'),
    manager.activate('sbux'),
    manager.activate('mcd'),
  ]);
  assert.equal(attempts[2].status, 'fulfilled');
  assert.equal(manager.selectedId, 'mcd');
  assert.equal((await manager.status()).snapshot?.schema_fingerprint, 'mcd');
  await manager.close();
  for (const pid of (await readFile(join(directory, 'pids'), 'utf8')).trim().split('\n'))
    assert.throws(() => process.kill(Number(pid), 0));
});
test('missing graph executable produces a recoverable catalog error without a stuck shutdown', async (t) => {
  const { directory, definitions } = await fixture(t);
  const manager = new CatalogManager({
    catalogs: definitions,
    executable: join(directory, 'missing-service'),
    readinessMs: 500,
  });
  t.after(() => manager.close());
  await assert.rejects(manager.activate('mcd'), /Unable to load the selected catalog/);
  const status = await manager.status();
  assert.equal(status.graph, 'unavailable');
  assert.equal(status.catalog.id, 'mcd');
  await manager.close();
});
