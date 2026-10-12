import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Socket } from 'node:net';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { request } from 'node:http';
import { GraphClient } from '../server/graph-client.ts';
import { createGateway } from '../server/gateway.ts';
import { toRecords } from '../shared/tables.ts';
const snapshot = { version: '5.0', schema_fingerprint: 'test', built_at: '2026-10-11T12:00:00Z', node_count: 3, edge_count: 2, identity_count: 2 };
async function fixture(t: any, handler?: (input: any, socket: Socket) => void) {
  const directory = await mkdtemp(join(tmpdir(), 'dog-web-'));
  const socketPath = join(directory, 'graph.sock');
  const sockets = new Set<Socket>();
  const requests: any[] = [];
  const service = createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket)); let buffer = '';
    socket.on('data', chunk => {
      buffer += chunk;
      while (buffer.includes('\n')) {
        const end = buffer.indexOf('\n'); const input = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1); requests.push(input);
        if (handler) handler(input, socket);
        else {
          const response = JSON.stringify({ jsonrpc: '2.0', id: input.id, ...(input.params.node_id === 'absent' ? { error: { code: -32004, message: 'Dataset not found', data: { node: 'absent' } } } : { result: input.method === 'graph.snapshot_info' ? snapshot : { query: input.params.query, groups: [], truncated: false } }) }) + '\n';
          socket.write(response.slice(0, 9)); socket.write(response.slice(9));
        }
      }
    });
  });
  await new Promise<void>(resolve => service.listen(socketPath, resolve));
  const graph = new GraphClient({ socketPath, timeoutMs: 1000 });
  const staticDir = join(directory, 'site');
  const { mkdir } = await import('node:fs/promises'); await mkdir(staticDir); await writeFile(join(staticDir, 'index.html'), '<h1>Website backbone</h1>');
  const server = createGateway({ graph, staticDir }); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${(server.address() as any).port}`;
  t.after(async () => { graph.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => service.close(() => resolve())); await rm(directory, { recursive: true, force: true }); });
  return { graph, url, requests, socketPath, directory };
}
async function postGraph(url: string, method: string, params: Record<string, unknown>) {
  return fetch(url + '/api/graph', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method, params }) });
}
test('adapter health and concurrent calls preserve RPC IDs and params over a fragmented socket stream', async t => {
  const { url, requests } = await fixture(t);
  assert.equal((await (await fetch(url + '/api/health')).json()).snapshot?.node_count, 3);
  const results = await Promise.all(['guest','sales','store'].map(async query => {
    const response = await postGraph(url, 'graph.search', { query });
    assert.equal(response.status, 200);
    return (await response.json()).result;
  }));
  assert.deepEqual(results.map(result => result.query), ['guest','sales','store']);
  assert.equal(new Set(requests.map(request => request.id)).size, 4);
  assert.ok(requests.every(request => request.jsonrpc === '2.0' && request.id));
});
test('graph client and adapter preserve service error code and evidence data', async t => {
  const { graph, url } = await fixture(t);
  const expected = { code: -32004, message: 'Dataset not found', data: { node: 'absent' } };
  assert.deepEqual((await graph.call('graph.get_dataset', { node_id: 'absent' })).error, expected);
  const response = await postGraph(url, 'graph.get_dataset', { node_id: 'absent' });
  assert.deepEqual((await response.json()).error, expected);
});
test('localhost gateway rejects cross-origin, rebound hosts, unsupported graph operations and malformed params', async t => {
  const { url, requests } = await fixture(t);
  const post = (body: unknown, headers = {}) => fetch(url + '/api/graph', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  assert.equal((await post({ method: 'graph.search', params: { query: 'guest' } }, { origin: 'https://example.com' })).status, 403);
  const reboundStatus = await new Promise<number>(resolve => { const req = request(url + '/api/health', { headers: { host: 'example.com' } }, res => { res.resume(); resolve(res.statusCode!); }); req.end(); });
  assert.equal(reboundStatus, 403);
  assert.equal((await post({ method: 'graph.publish', params: {} })).status, 400);
  assert.equal((await post({ method: 'graph.search', params: [] })).status, 400);
  assert.equal((await fetch(url + '/api/graph', { method: 'POST', body: '{}' })).status, 415);
  assert.equal(requests.length, 0);
});
test('transport timeout disconnects and a subsequent call creates a new generation', async t => {
  let first = true;
  const { graph } = await fixture(t, (input, socket) => { if (first) { first = false; return; } socket.write(JSON.stringify({ jsonrpc: '2.0', id: input.id, result: snapshot })+'\n'); });
  const before = graph.generation;
  await assert.rejects(graph.call('graph.snapshot_info'), /timed out/);
  assert.notEqual(graph.generation, before);
  assert.deepEqual((await graph.call('graph.snapshot_info')).result, snapshot);
});
test('malformed and mismatched responses fail instead of being rendered as graph data', async t => {
  const { graph } = await fixture(t, (_input, socket) => socket.write('{"jsonrpc":"2.0","id":"wrong","result":{}}\n'));
  await assert.rejects(graph.call('graph.snapshot_info'), /Invalid graph response/);
});
test('unavailable graph leaves the website and stage shell accessible', async t => {
  const { graph, url } = await fixture(t); graph.close();
  const health = await (await fetch(url + '/api/health')).json();
  assert.equal(health.website, 'ready'); assert.equal(health.graph, 'unavailable'); assert.equal(health.stages.length, 3);
  const page = await fetch(url); assert.equal(page.status, 200); assert.match(await page.text(), /Website backbone/);
  assert.equal((await fetch(url + '/.env')).status, 404);
});
test('table decoding respects header positions, nested fields, lists and unknowns; hostile headers fail', () => {
  assert.deepEqual(toRecords({ header: ['node_id','descriptor.display_name','unknown_fields'], rows: [['catalog.a','Dataset A',['grain']]] }), [{ node_id: 'catalog.a', descriptor: { display_name: 'Dataset A' }, unknown_fields: ['grain'] }]);
  assert.throws(() => toRecords({ header: ['a'], rows: [[], ['value']] }), /row length/);
  assert.throws(() => toRecords({ header: ['__proto__.polluted'], rows: [[true]] }), /Unsafe/);
  assert.throws(() => toRecords({ header: ['a','a.b'], rows: [['value','other']] }), /Overlapping/);
  assert.equal(({} as any).polluted, undefined);
});
