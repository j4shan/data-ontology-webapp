# Stage 1 delivery: localhost website backbone

Stage 1 provides the local website shell and a read-only path from browser or local client to an existing graph service. The React and TypeScript shell mounts Graph explorer and AKG workbench panels independently. It supports keyboard tab navigation, selects the tab from the URL, and shows graph connection status with a refresh control. The Explorer search and neighborhood workflow is planned for Stage 2; the Workbench question, agent trace, and AKG workflow is planned for Stage 3. The panels currently describe those future features rather than execute them.

## Start and configure

Node.js 22.12 or later is required. Use the final website directory:

```sh
cd /Users/michaelsj/Documents/Workspace/data-ontology-webapp
npm install
npm run build
npm start
```

Visit `http://127.0.0.1:4310`. The Node HTTP server serves the built browser bundle on `127.0.0.1` only. `DOG_WEBSITE_PORT` changes the listening port. `DOG_SOCKET` points to an existing graph service's Unix socket; it defaults to `/tmp/data-ontology-graph.sock`.

```sh
DOG_SOCKET=/path/to/existing/graph.sock DOG_WEBSITE_PORT=4311 npm start
DOG_WEBSITE_URL=http://127.0.0.1:4311 npm run cli -- health
```

No graph daemon or snapshot is included in this delivery, and the default socket was absent during delivery. The website still starts and `GET /api/health` reports `website: "ready"` with `graph: "unavailable"`. When the service is reachable, health includes snapshot information; use **Refresh connection** in the UI to check again. `npm run dev` builds once and watches the application server. Browser source changes require `npm run build` and a page refresh.

## Use the local adapter

The CLI and SDK use `GET /api/health` and `POST /api/graph` on the localhost website. With a running graph service, these commands read snapshot information and search results:

```sh
npm run cli -- health
npm run cli -- graph graph.snapshot_info
npm run cli -- graph graph.search '{"query":"sales"}'
```

Use `DOG_WEBSITE_URL` to point the CLI at a different local website port. In TypeScript, import `createWebsiteClient`, `toRecords`, and `GraphError` from `./sdk/index.ts` at the repository root. `createWebsiteClient()` uses `http://127.0.0.1:4310` by default; pass another localhost HTTP URL when needed. Call `client.health()` or `client.graph('graph.search', { query: 'sales' })`. `toRecords(result)` decodes a graph table with `header` and `rows` into record objects. Graph service errors retain their code and data as `GraphError` in the SDK.

The adapter forwards only `graph.snapshot_info`, `graph.search`, `graph.get_identity`, `graph.get_dataset`, `graph.get_relationship`, `graph.get_hops`, `graph.expand_subgraph`, `graph.find_paths`, and `graph.find_connecting_subgraph`. It uses generated JSON-RPC IDs, serializes calls over a persistent Unix socket, preserves service errors, enforces request and response bounds and timeouts, and tracks connection generations. The gateway restricts requests to the local host and permitted local origins. The website consumes the graph's public JSON-RPC API; it does not import graph internals.

## Delivery evidence and boundary

Eight functional integration tests passed using isolated Unix socket and HTTP servers. Strict TypeScript checking and the Vite build passed. Browser visual QA was not performed: `iab` and `chrome` preview tools were unavailable, and the browser inventory was empty.

Only the Stage 1 backbone is delivered. The Graph explorer and AKG workbench feature workflows, hosted deployment, scoring, provider credentials, and data assets are outside this stage. Catalogs, BI questions, graph artifacts, AKG contracts, traces, and run results remain in the configurable Critic project; this repository holds website and application source.
