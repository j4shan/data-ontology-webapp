# Data Ontology Webapp

Stage 1 delivers the localhost website backbone: a React and TypeScript shell, a read-only adapter to an existing graph service, and a CLI and SDK for local callers. The Graph explorer and AKG workbench have separate tabs, but their feature workflows are scheduled for Stages 2 and 3. The tabs currently show previews of those workflows.

## Start locally

Use Node.js 22.12 or later. From the website repository:

```sh
cd /Users/michaelsj/Documents/Workspace/data-ontology-webapp
npm install
npm run build
npm start
```

Open `http://127.0.0.1:4310`. The server binds only to `127.0.0.1`. Set `DOG_WEBSITE_PORT` to use another port. Set `DOG_SOCKET` to the Unix socket of an existing graph service before starting the website:

```sh
DOG_SOCKET=/path/to/existing/graph.sock DOG_WEBSITE_PORT=4310 npm start
```

The default graph socket is `/tmp/data-ontology-graph.sock`; no graph daemon or published snapshot is supplied with this stage. The website starts without the socket. Its connection strip shows the graph status and offers **Refresh connection** after the service becomes available.

For application server development, `npm run dev` builds once and watches the server. After browser source changes, run `npm run build` and refresh the page.

## Check health and read graph data

The CLI calls the same localhost application endpoints as the SDK. Run these from the repository root while the website server is running:

```sh
npm run cli -- health
npm run cli -- graph graph.snapshot_info
npm run cli -- graph graph.search '{"query":"sales"}'
```

If you changed the website port, set `DOG_WEBSITE_URL` for CLI calls, for example `DOG_WEBSITE_URL=http://127.0.0.1:4311 npm run cli -- health`. Health reports `website: "ready"` even when `graph` is `"unavailable"`; graph calls need a reachable graph service. The same endpoints are `GET /api/health` and `POST /api/graph` with JSON such as `{"method":"graph.search","params":{"query":"sales"}}`.

TypeScript callers can import the local SDK:

```ts
import { createWebsiteClient, toRecords } from './sdk/index.ts';

const client = createWebsiteClient(); // Or pass a localhost URL for a different port.
const health = await client.health();
const snapshot = await client.graph('graph.snapshot_info');
const search = await client.graph('graph.search', { query: 'sales' });
const records = toRecords({ header: ['node_id'], rows: [['example.dataset']] });
```

`toRecords` converts graph tables with `header` and `rows` into objects, including nested fields named with dots. It also accepts an existing array of records. The SDK exposes graph service errors as `GraphError` with their code and data.

The adapter allows nine public, read-only graph methods: `graph.snapshot_info`, `graph.search`, `graph.get_identity`, `graph.get_dataset`, `graph.get_relationship`, `graph.get_hops`, `graph.expand_subgraph`, `graph.find_paths`, and `graph.find_connecting_subgraph`. It generates RPC request IDs and serializes calls over a persistent Unix socket. Requests and responses have size limits and timeouts; connection generations change when the connection changes. The website accesses the graph only through its public JSON-RPC API.

Catalogs, BI questions, graph artifacts, AKG contracts, traces, and run results belong in the configurable Critic project. This repository contains website and application source only. There is no hosted deployment or provider credential setup in Stage 1.

See [Stage 1 delivery](project_metadata/instructions/stage-1-delivery.md) for scope and verification.
