import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GraphClient } from './graph-client.ts';
import { createGateway } from './gateway.ts';
import { loadFeatures } from './features.ts';
const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.DOG_WEBSITE_PORT ?? 4310);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('DOG_WEBSITE_PORT must be an integer from 1 to 65535');
const graph = new GraphClient({ socketPath: process.env.DOG_SOCKET ?? '/tmp/data-ontology-graph.sock' });
const features = await loadFeatures(root);
const server = createGateway({ graph, staticDir: resolve(root, 'dist'), ...features });
server.listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port}`));
server.on('error', error => { console.error(error.message); graph.close(); process.exitCode = 1; });
function stop() { graph.close(); server.close(() => process.exit(0)); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
