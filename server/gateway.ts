import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { GraphClient } from './graph-client.ts';
import { GraphError, isRecord, validMethod, type Health, type SnapshotInfo } from '../shared/protocol.ts';

export interface FeatureContext { graph: GraphClient; json: typeof json; body: typeof body }
export type FeatureHandler = (req: IncomingMessage, res: ServerResponse, url: URL, context: FeatureContext) => Promise<boolean>;
export interface GatewayOptions { graph: GraphClient; staticDir: string; handlers?: FeatureHandler[]; delivered?: string[] }
const stages = [
  { id: 'backbone', name: 'Website backbone', delivered: true },
  { id: 'explorer', name: 'Function #1 · Graph explorer', delivered: false },
  { id: 'workbench', name: 'Function #2 · AKG workbench', delivered: false },
];
const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}
async function body(req: IncomingMessage) {
  let bytes = 0; const chunks: Buffer[] = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 1024 * 1024) throw new GraphError(-32600, 'Request body exceeds 1 MiB');
    chunks.push(Buffer.from(chunk));
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; }
  catch { throw new GraphError(-32700, 'Invalid JSON'); }
}
export function createGateway(options: GatewayOptions) {
  const staticDir = resolve(options.staticDir);
  const deliveryStages = stages.map(stage => ({ ...stage, delivered: stage.delivered || (options.delivered ?? []).includes(stage.id) }));
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    const port = (server.address() as { port: number } | null)?.port;
    const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
    if (!req.headers.host || !hosts.has(req.headers.host)) { json(res, 403, { message: 'Local host required' }); return; }
    const origin = req.headers.origin;
    if (origin && ![...hosts].some(host => origin === `http://${host}`)) { json(res, 403, { message: 'Origin is not allowed' }); return; }
    if (req.headers['sec-fetch-site'] === 'cross-site') { json(res, 403, { message: 'Cross-site requests are not allowed' }); return; }
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
      if (url.pathname === '/api/health' && req.method === 'GET') {
        const health: Health = { website: 'ready', graph: 'unavailable', generation: options.graph.generation, stages: deliveryStages };
        try {
          const response = await options.graph.call('graph.snapshot_info');
          if (response.error) throw new GraphError(response.error.code, response.error.message, response.error.data);
          health.graph = 'connected'; health.snapshot = response.result as SnapshotInfo;
        } catch (error) { health.message = (error as Error).message; }
        health.generation = options.graph.generation;
        json(res, 200, health); return;
      }
      if (url.pathname === '/api/graph' && req.method === 'POST') {
        if (!req.headers['content-type']?.startsWith('application/json')) { json(res, 415, { message: 'application/json is required' }); return; }
        const input = await body(req);
        if (!isRecord(input) || !validMethod(input.method) || !isRecord(input.params ?? {})) throw new GraphError(-32602, 'Expected an allowed graph method and object params');
        const response = await options.graph.call(input.method, input.params as Record<string, unknown> ?? {});
        json(res, 200, { ...response, generation: options.graph.generation }); return;
      }
      for (const handler of options.handlers ?? []) {
        if (await handler(req, res, url, { graph: options.graph, json, body })) return;
      }
      if (url.pathname.startsWith('/api/')) { json(res, 404, { message: 'Unknown application endpoint' }); return; }
      if (req.method !== 'GET' && req.method !== 'HEAD') { json(res, 405, { message: 'Method not allowed' }); return; }
      const pathname = decodeURIComponent(url.pathname);
      if (pathname.includes('\0') || pathname.includes('..') || pathname.includes('\\')) { json(res, 400, { message: 'Invalid asset path' }); return; }
      const file = resolve(staticDir, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(staticDir + sep)) { json(res, 403, { message: 'Invalid asset path' }); return; }
      try {
        const content = await readFile(file);
        res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'Cache-Control': pathname === '/' ? 'no-cache' : 'public, max-age=3600' });
        res.end(req.method === 'HEAD' ? undefined : content);
      } catch { json(res, 404, { message: 'Asset not found. Build the website with npm run build.' }); }
    } catch (error) {
      if (error instanceof GraphError) json(res, error.code === -32050 ? 503 : 400, { message: error.message, error: { code: error.code, message: error.message, data: error.data } });
      else json(res, 500, { message: 'Application request failed' });
    }
  });
  server.requestTimeout = 20_000;
  server.headersTimeout = 10_000;
  return server;
}
