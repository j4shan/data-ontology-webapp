# Stage 1 delivery: localhost website backbone

Stage 1 established the localhost React and TypeScript shell and the read-only adapter to the graph service. The shell provides keyboard tab navigation, selects the tab from the URL, and shows graph connection status with a refresh control. Stage 2 added the working Graph explorer and a shared catalog selector; the AKG workbench is labelled **Coming soon**.

## Start and configure

Node.js 22.12 or later is required. Install the `data-ontology-graph-server` executable and make sure it is on `PATH`, or set `DOG_GRAPH_SERVER=/path/to/bin/data-ontology-graph-server` when starting the webapp. From the webapp root:

```sh
npm install
npm run build
npm start
```

Visit `http://127.0.0.1:4310`. The Node HTTP server serves the built browser bundle on `127.0.0.1` only. `DOG_WEBSITE_PORT` changes its listening port from the default of 4310. The shared **Data catalog** dropdown offers McDonald’s by default and Starbucks in both tabs. A URL with `catalog=sbux` restores Starbucks. Selecting a catalog loads its bundled snapshot and starts its initial neighborhood: **Restaurant** for McDonald’s or **Transaction** for Starbucks. Selection clears old focus, focus history, and results while retaining typed search text and category.

The webapp starts the installed graph executable on catalog activation and owns one process on a private temporary Unix socket. It stops its process when changing catalogs or shutting down. If activation fails, the website remains available and **Refresh connection** retries it. `npm run dev` builds once and watches the application server; after browser source changes, run `npm run build` and refresh the page.

The snapshots are in `artifacts/catalogs/mcd/current` and `artifacts/catalogs/sbux/current`. Each directory contains independent copies of `nodes.json`, `edges.json`, and `annotations.json`. Both are committed at [artifacts/catalogs on GitHub](https://github.com/j4shan/data-ontology-webapp/tree/main/artifacts/catalogs). The webapp does not read sibling-project catalogs or rebuild or republish YAML from a browser request.

## Browser transport and graph API

The browser uses `GET /api/catalogs` for configured choices, `POST /api/catalog` to activate a configured ID, `GET /api/health` for the current catalog’s readiness, and `POST /api/graph` for catalog-scoped graph calls. Check status with:

```sh
curl http://127.0.0.1:4310/api/health
```

Health reports `website: "ready"` even when `graph` is `"unavailable"`. Browsers cannot open Unix sockets, so `server/graph-client.ts` forwards the adapter’s allowed graph calls as JSON-RPC 2.0 requests over the owned service’s socket. Browser graph calls carry `catalog_id`; the server rejects a call for a different selected catalog. The allowed methods are `graph.snapshot_info`, `graph.search`, `graph.get_identity`, `graph.get_dataset`, `graph.get_relationship`, `graph.get_hops`, `graph.expand_subgraph`, `graph.find_paths`, and `graph.find_connecting_subgraph`. The adapter preserves service errors, enforces request and response bounds and timeouts, and tracks connection generations so old evidence cannot appear under a new selection. The gateway restricts requests to local hosts and permitted local origins.

These HTTP endpoints serve the browser. External agents use the graph service's standard JSON-RPC API directly. This repository contains no public SDK or separate CLI. Its source is organized under `web/`, `server/`, and `shared/`; integration and browser checks live under `tests/`.

## Delivery evidence and boundary

Seven backbone integration tests cover local adapter requests, graph RPC responses, transport failures, and shared table decoding. The final validation passed 23 checks, including owned-process cleanup, executable failures, catalog-scoped requests, rapid selection, URL reload, both tab contexts, desktop and portrait layouts, and the optional live McDonald’s workflow. `npm run build` passed TypeScript checking and production bundling. Actual application startup, both snapshot counts, and graceful shutdown also passed on a separate local port.

The webapp owns the two bundled demo snapshots. Other catalogs, BI question assets, graph artifacts, AKG contracts, traces, and run results remain in the configurable Critic project. The initial deployment is localhost only. See [Stage 2 delivery](stage-2-delivery.md) for Explorer controls and verification.
