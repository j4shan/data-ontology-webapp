# Stage 1 delivery: localhost website backbone

Stage 1 established the localhost React and TypeScript shell and the read-only connection to an existing graph service. The shell provides keyboard tab navigation, selects the tab from the URL, and shows graph connection status with a refresh control. Stage 2 added the working Graph explorer; the AKG workbench is labelled **Coming soon**.

## Start and configure

Node.js 22.12 or later is required. Install the `data-ontology-graph-server` executable and make sure it is on `PATH`. From the webapp root, start it with the bundled McDonald's snapshot:

```sh
data-ontology-graph-server \
  --snapshot-dir artifacts/catalogs/mcd/current \
  --socket /tmp/data-ontology-graph.sock
```

For the Starbucks demo, use `artifacts/catalogs/sbux/current` instead. Each directory contains independent copies of `nodes.json`, `edges.json`, and `annotations.json`. The snapshots are committed at [artifacts/catalogs on GitHub](https://github.com/j4shan/data-ontology-webapp/tree/main/artifacts/catalogs). The webapp has no catalog selector; restart the graph service with the desired snapshot path to change catalogs.

Keep the graph service running. In another terminal, from the webapp root:

```sh
npm install
npm run build
npm start
```

Visit `http://127.0.0.1:4310`. The Node HTTP server serves the built browser bundle on `127.0.0.1` only. `DOG_WEBSITE_PORT` changes its listening port. `DOG_SOCKET` points to the graph service's Unix socket and defaults to `/tmp/data-ontology-graph.sock`. If the service starts after the webapp, use **Refresh connection** in the UI. The webapp remains available when the graph service is unavailable, but Explorer search needs a connected service. `npm run dev` builds once and watches the application server; after browser source changes, run `npm run build` and refresh the page.

## Browser transport and graph API

The browser calls `GET /api/health` and `POST /api/graph` on the local HTTP adapter. Check connection status with:

```sh
curl http://127.0.0.1:4310/api/health
```

Health reports `website: "ready"` even when `graph` is `"unavailable"`. Browsers cannot open Unix sockets, so `server/graph-client.ts` forwards the adapter's allowed graph calls as JSON-RPC 2.0 requests over the graph-service socket. The allowed methods are `graph.snapshot_info`, `graph.search`, `graph.get_identity`, `graph.get_dataset`, `graph.get_relationship`, `graph.get_hops`, `graph.expand_subgraph`, `graph.find_paths`, and `graph.find_connecting_subgraph`. The adapter preserves service errors, enforces request and response bounds and timeouts, and tracks connection generations. The gateway restricts requests to local hosts and permitted local origins.

These HTTP endpoints serve the browser. External agents use the graph service's standard JSON-RPC API directly. This repository contains no public SDK or separate CLI. Its source is organized under `web/`, `server/`, and `shared/`; integration and browser checks live under `tests/`.

## Delivery evidence and boundary

Seven backbone integration tests cover local adapter requests, graph RPC responses, transport failures, and shared table decoding. The full Stage 2 validation passed 18 checks, including desktop and portrait browser checks and a live service reading the bundled McDonald's snapshot. Strict TypeScript checking and the production build passed.

The webapp owns the two bundled demo snapshots. Other catalogs, BI question assets, graph artifacts, AKG contracts, traces, and run results remain in the configurable Critic project. The initial deployment is localhost only. See [Stage 2 delivery](stage-2-delivery.md) for Explorer controls and verification.
