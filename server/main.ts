import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CatalogManager, readCatalogs } from './catalogs.ts';
import { createGateway } from './gateway.ts';
import { loadFeatures } from './features.ts';
const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.DOG_WEBSITE_PORT ?? 4310);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('DOG_WEBSITE_PORT must be an integer from 1 to 65535');
const catalogs = new CatalogManager({
  catalogs: await readCatalogs(root),
  executable: process.env.DOG_GRAPH_SERVER,
});
const features = await loadFeatures(root);
const server = createGateway({
  graph: catalogs,
  catalogs,
  staticDir: resolve(root, 'dist'),
  ...features,
});
server.listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port}`));
server.on('error', async (error) => {
  console.error(error.message);
  await catalogs.close();
  process.exitCode = 1;
});
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  server.closeAllConnections();
  await Promise.all([
    catalogs.close(),
    new Promise<void>((resolve) => server.close(() => resolve())),
  ]);
  process.exit(0);
}
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
