# Stage 2 delivery: Graph explorer

Stage 2 delivers Function #1, a local Explorer for searching a published graph catalog and inspecting a bounded neighborhood around one selected result. It uses the graph service's public JSON-RPC API through the website's read-only adapter. Function #2, the AKG workbench, remains planned for Stage 3.

## Start the website

Node.js 22.12 or later is required for the website. Install the `data-ontology-graph-server` executable and make sure it is on `PATH`. If needed, set `DOG_GRAPH_SERVER=/path/to/bin/data-ontology-graph-server` when starting the webapp. From the webapp root:

```sh
npm install
npm run build
npm start
```

Visit `http://127.0.0.1:4310` and open **Graph explorer**. `DOG_WEBSITE_PORT` changes the default port of 4310; the website remains bound to `127.0.0.1`. The webapp starts the installed graph service when it activates a catalog and owns one process on a private temporary Unix socket. It stops its process when the catalog changes or the webapp shuts down. The connection strip shows readiness; if activation fails, select **Refresh connection** to retry. The website remains available when the graph is unavailable, but Explorer search needs a connected service.

The shared **Data catalog** dropdown lists McDonald’s and Starbucks in both tabs. McDonald’s is selected by default; a URL with `catalog=sbux` restores Starbucks. Selecting a catalog activates its bundled snapshot and displays a new starting neighborhood: **Restaurant** for McDonald’s or **Transaction** for Starbucks. Selection clears the old catalog’s focus, focus history, and results while retaining typed search text and category. Each snapshot contains independent copies of `nodes.json`, `edges.json`, and `annotations.json` in `artifacts/catalogs/mcd/current` or `artifacts/catalogs/sbux/current`. These pre-built demo assets are committed at [artifacts/catalogs on GitHub](https://github.com/j4shan/data-ontology-webapp/tree/main/artifacts/catalogs). Loading them needs no YAML source or sibling repository; browser requests never rebuild or republish YAML.

The McDonald's snapshot contains 71 datasets, 283 relationships, and 38 identities. The Starbucks snapshot contains 76 datasets, 203 relationships, and 35 identities. Both use snapshot format 5.0 and schema fingerprint `3f0b8c99b8579402`. Each was validated in an isolated graph-service process through the public `graph.snapshot_info` and `graph.search` calls. Temporary runtime output remains untracked.

## Explore a neighborhood

1. Type a prefix in **Entity, dataset or column**. Search waits briefly after typing, then shows grouped results in the service's lexical order, with the service's match fields and values. **Search category** can limit results to logical identities, datasets, entity definitions, or columns. If a group has more matches, use a narrower prefix. Select one result at a time.
2. Inspect the focused neighborhood. A dataset, column, or entity definition focuses its containing dataset. A logical identity starts from every distinct dataset realization returned by the service. If an identity has more than 50 distinct dataset realizations, Explorer cannot expand that focus and asks you to select an individual dataset realization from its result group. A relationship starts from both endpoints, and its selected edge remains available even at depth 0.
3. Set **BFS depth** to 0, 1, or 2 hops; the default is 2. Depth 0 shows the focus datasets, plus the selected relationship when the focus is an edge. Explorer sends `max_nodes: 50` with expansion requests and omits `max_edges`, leaving relationship handling to the graph service's standard behavior. It offers no dataset or relationship limit controls. A **Partial neighborhood** notice means some connected objects were omitted; select a nearby dataset to explore another neighborhood before treating the view as complete.
4. Select a dataset or relationship in **Graph** or **List** to recenter. The graph places datasets on deterministic distance rings; fading indicates BFS distance, not confidence. Parallel relationships and self-loops have separate selectable marks. Drag the canvas to pan, drag a dataset to reposition it, use the zoom buttons or pinch to zoom, **Fit** to frame the current layout, and **Arrange** to reset it. Switch to **List** for full object names and relationship values.
5. Read the **Focus inspector**. Dataset focus shows the qualified name, record grain, entity definitions, their columns, universe and expressions, the dataset's columns, and its accessor. Relationship focus shows each endpoint and its directional multiplicity and match-existence claims, associated entity context, annotations, and unknown fields. These are graph claims; the inspector does not infer SQL behavior. Use **Previous focus**, **Next focus**, or **Clear view** to navigate.

Recentering keeps the search text and selected result. The URL stores catalog ID, search text, category, depth, and focus for reopening a view. Older URLs with a depth above 2 open at depth 2; malformed or negative depths also use the default of 2. Focus history works within the selected catalog, and switching tabs retains Explorer state. Changing catalogs starts a new focus history and results while keeping the typed search text and category. In-flight search and neighborhood requests are canceled when superseded; browser graph requests carry `catalog_id`, the server refuses calls for a different selected catalog, and connection generations keep stale evidence out of the current view.

## Verification and scope

The delivered run passed 23 checks, including owned-process cleanup, missing executable and wrong-catalog errors, delayed old results, rapid selection, URL reload, shared tab selection, desktop and portrait layouts, and a live McDonald’s workflow. `npm run build` passed TypeScript checking and production bundling. Actual `server/main.ts` startup, both snapshot counts, and graceful shutdown also passed on a separate local port. To run the same opt-in checks, configure an installed graph executable and a separate live service socket for the existing legacy browser test:

```sh
npm run build
DOG_GRAPH_SERVER=/path/to/bin/data-ontology-graph-server DOG_BROWSER_TESTS=1 DOG_LIVE_GRAPH_TESTS=1 npm test
```

Plain `npm test` skips the opt-in browser and live graph checks. The browser tests use local Google Chrome by default; set `DOG_BROWSER_EXECUTABLE` to another browser executable path if needed. The catalog dropdown browser test uses `DOG_GRAPH_SERVER` or the executable on `PATH`. The existing optional live McDonald’s browser test still uses `DOG_SOCKET`, defaulting to `/tmp/data-ontology-graph.sock`, and requires a separately running service on that socket. Production webapp startup does not use `DOG_SOCKET`.

This stage delivers local graph exploration and catalog switching. Hosted deployment, agent question runs, correctness scoring, and SQL execution remain outside its scope. The committed McDonald’s and Starbucks demo snapshots belong to this webapp; other catalogs, graph artifacts, BI question assets, AKG contracts, traces, and run results remain in the configurable Critic project.
