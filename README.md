# Data Ontology Webapp

Stages 1 and 2 deliver a localhost React and TypeScript webapp with a read-only adapter to the graph service. Function #1, the Graph explorer, searches a connected catalog and displays bounded dataset neighborhoods with an evidence inspector. Function #2, the AKG workbench, is labelled **Coming soon**.

## Start locally

Use Node.js 22.12 or later. Install the `data-ontology-graph-server` executable and make sure it is on `PATH`. This graph service is a separate runtime dependency. From the webapp root, start it with one of the bundled, pre-built snapshots:

```sh
data-ontology-graph-server \
  --snapshot-dir artifacts/catalogs/mcd/current \
  --socket /tmp/data-ontology-graph.sock
```

For the Starbucks demo, use `artifacts/catalogs/sbux/current` as the snapshot directory instead. Start the graph service with the desired path each time you choose a catalog. Each directory contains `nodes.json`, `edges.json`, and `annotations.json`; no YAML source or sibling project is needed to load them. Both snapshots are committed to this repository at [artifacts/catalogs on GitHub](https://github.com/j4shan/data-ontology-webapp/tree/main/artifacts/catalogs).

Keep the graph service running. In another terminal, from the webapp root:

```sh
npm install
npm run build
npm start
```

Open `http://127.0.0.1:4310` and select **Graph explorer**. The server binds only to `127.0.0.1`. Set `DOG_WEBSITE_PORT` to use another port. Set `DOG_SOCKET` to the Unix socket of an existing graph service before starting the website:

```sh
DOG_SOCKET=/path/to/existing/graph.sock DOG_WEBSITE_PORT=4310 npm start
```

The default graph socket is `/tmp/data-ontology-graph.sock`. The McDonald's snapshot has 71 datasets, 283 relationships, and 38 identities; the Starbucks snapshot has 76 datasets, 203 relationships, and 35 identities. Both use snapshot format 5.0 and schema fingerprint `3f0b8c99b8579402`. Both were validated with isolated graph-service processes through the public `graph.snapshot_info` and `graph.search` methods. The website also starts without a graph connection; use **Refresh connection** when the service becomes available.

In the Explorer, type a prefix, optionally choose a search category, and select a result. The initial neighborhood uses BFS depth 1, a 100 dataset limit, and a 200 relationship limit. Adjust the bounds, select a dataset or relationship to recenter, and use **Graph**, **List**, and the inspector to read the evidence. A partial-neighborhood notice means the displayed graph omitted evidence. See [Stage 2 delivery](project_metadata/instructions/stage-2-delivery.md) for the controls, focus behavior, and graph startup commands.

For application server development, `npm run dev` builds once and watches the server. After browser source changes, run `npm run build` and refresh the page.

## Check the local adapter and graph connection

With the webapp running, check its connection status:

```sh
curl http://127.0.0.1:4310/api/health
```

Health reports `website: "ready"` even when `graph` is `"unavailable"`; graph calls need a reachable graph service. The browser uses `GET /api/health` and `POST /api/graph` on this local adapter. For example, its graph request body can be `{"method":"graph.search","params":{"query":"sales"}}`. These HTTP endpoints provide browser transport; external agents should use the graph service's standard JSON-RPC API directly.

Browsers cannot open Unix sockets. The browser code in `web/src/api.ts` and `web/src/explorer/client.ts` therefore calls the local HTTP adapter, which uses `server/graph-client.ts` to send JSON-RPC 2.0 requests over the graph-service Unix socket. The adapter allows nine public, read-only graph methods: `graph.snapshot_info`, `graph.search`, `graph.get_identity`, `graph.get_dataset`, `graph.get_relationship`, `graph.get_hops`, `graph.expand_subgraph`, `graph.find_paths`, and `graph.find_connecting_subgraph`. It preserves service errors and tracks connection generations so Explorer can reject evidence from a changed connection. Graph semantics come from the public graph service.

## Project layout

`web/` contains the browser app; `server/` contains the localhost HTTP adapter and graph transport; `shared/` contains protocol and table utilities; `tests/` contains integration and browser checks; and `artifacts/catalogs/` contains the two independent demo snapshots. The repository has no public SDK, separate CLI, or client package export.

The bundled McDonald's and Starbucks snapshots are committed demo assets. Other catalogs, BI questions, graph artifacts, AKG contracts, traces, and run results belong in the configurable Critic project; temporary runtime output remains untracked. The current delivery has no catalog switching control, hosted deployment, agent question run, correctness scoring, or SQL execution.

See [Stage 1 delivery](project_metadata/instructions/stage-1-delivery.md) for the backbone and [Stage 2 delivery](project_metadata/instructions/stage-2-delivery.md) for Function #1 and its verification.
