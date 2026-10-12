# Data Ontology Webapp

Stages 1 and 2 deliver a localhost React and TypeScript website, a read-only adapter to the graph service, and a CLI and SDK for local callers. Function #1, the Graph explorer, now searches a connected catalog and displays bounded dataset neighborhoods with an evidence inspector. Function #2, the AKG workbench, remains planned for Stage 3.

## Start locally

Use Node.js 22.12 or later. From the website repository:

```sh
cd /Users/michaelsj/Documents/Workspace/data-ontology-webapp
npm install
npm run build
npm start
```

Open `http://127.0.0.1:4310` and select **Graph explorer**. The server binds only to `127.0.0.1`. Set `DOG_WEBSITE_PORT` to use another port. Set `DOG_SOCKET` to the Unix socket of an existing graph service before starting the website:

```sh
DOG_SOCKET=/path/to/existing/graph.sock DOG_WEBSITE_PORT=4310 npm start
```

The default graph socket is `/tmp/data-ontology-graph.sock`. The published McDonald's catalog currently used for local verification is under `../data-ontology-agent-critic/artifacts/website/mcd/current`; it contains 71 datasets, 283 relationships, and 38 identities. The graph service currently uses that socket, and the website is running at the URL above. For a new session, start the graph service against the published artifact as described in [Stage 2 delivery](project_metadata/instructions/stage-2-delivery.md), then start the website. The website also starts without a graph connection; use **Refresh connection** when the service becomes available.

In the Explorer, type a prefix, optionally choose a search category, and select a result. The initial neighborhood uses BFS depth 1, a 100 dataset limit, and a 200 relationship limit. Adjust the bounds, select a dataset or relationship to recenter, and use **Graph**, **List**, and the inspector to read the evidence. A partial-neighborhood notice means the displayed graph omitted evidence. See [Stage 2 delivery](project_metadata/instructions/stage-2-delivery.md) for the controls, focus behavior, and graph startup commands.

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

Catalogs, BI questions, graph artifacts, AKG contracts, traces, and run results belong in the configurable Critic project. This repository contains website and application source only. The current delivery has no hosted deployment, agent question run, correctness scoring, or SQL execution.

See [Stage 1 delivery](project_metadata/instructions/stage-1-delivery.md) for the backbone and [Stage 2 delivery](project_metadata/instructions/stage-2-delivery.md) for Function #1 and its verification.
