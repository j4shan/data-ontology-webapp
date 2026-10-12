# Stage 2 delivery: Graph explorer

Stage 2 delivers Function #1, a local Explorer for searching a published graph catalog and inspecting a bounded neighborhood around one selected result. It uses the graph service's public JSON-RPC API through the website's read-only adapter. Function #2, the AKG workbench, remains planned for Stage 3.

## Start the graph and website

Node.js 22.12 or later is required for the website. Install the `data-ontology-graph-server` executable and make sure it is on `PATH`. From the webapp root, start the installed graph service with a bundled snapshot:

```sh
data-ontology-graph-server \
  --snapshot-dir artifacts/catalogs/mcd/current \
  --socket /tmp/data-ontology-graph.sock
```

To use Starbucks instead, start the service with `--snapshot-dir artifacts/catalogs/sbux/current`. One service loads the chosen snapshot at startup; choosing another catalog requires starting it with that path. Each snapshot contains `nodes.json`, `edges.json`, and `annotations.json`. These pre-built demo assets are committed to this repository at [artifacts/catalogs on GitHub](https://github.com/j4shan/data-ontology-webapp/tree/main/artifacts/catalogs). Loading them needs no YAML source or sibling repository.

Keep the graph service running. In another terminal, from the webapp root:

```sh
npm install
npm run build
DOG_SOCKET="${DOG_SOCKET:-/tmp/data-ontology-graph.sock}" npm start
```

Use the same `DOG_SOCKET` value in both terminals if you change the default. Visit `http://127.0.0.1:4310` and open **Graph explorer**. `DOG_WEBSITE_PORT` changes the website port; the website remains bound to `127.0.0.1`. The connection strip shows service status. If the service starts after the website, select **Refresh connection**. The website remains available when the graph is unavailable, but Explorer search needs a connected service.

The McDonald's snapshot contains 71 datasets, 283 relationships, and 38 identities. The Starbucks snapshot contains 76 datasets, 203 relationships, and 35 identities. Both use snapshot format 5.0 and schema fingerprint `3f0b8c99b8579402`. Each was validated in an isolated graph-service process through the public `graph.snapshot_info` and `graph.search` calls. Temporary runtime output remains untracked.

## Explore a neighborhood

1. Type a prefix in **Entity, dataset or column**. Search waits briefly after typing, then shows grouped results in the service's lexical order, with the service's match fields and values. **Search category** can limit results to logical identities, datasets, entity definitions, or columns. If a group has more matches, use a narrower prefix. Select one result at a time.
2. Inspect the focused neighborhood. A dataset, column, or entity definition focuses its containing dataset. A logical identity starts from every distinct dataset realization returned by the service. If those seeds exceed the dataset limit, Explorer shows an explicit message before expanding the graph; increase the limit or choose a realization. A relationship starts from both endpoints, and its selected edge remains available even at depth 0.
3. Adjust **BFS depth**, **Datasets**, and **Relationships** as needed. Defaults are depth 1, 100 datasets, and 200 relationships. Depth ranges from 0 to 3; dataset limits are 25, 50, 100, and 200; relationship limits are 50, 100, 200, and 500. Depth 0 shows the focus datasets, plus the selected relationship when the focus is an edge. A **Partial neighborhood** notice means a bound omitted evidence; increase a bound or narrow the focus before treating the view as complete.
4. Select a dataset or relationship in **Graph** or **List** to recenter. The graph places datasets on deterministic distance rings; fading indicates BFS distance, not confidence. Parallel relationships and self-loops have separate selectable marks. Drag the canvas to pan, drag a dataset to reposition it, use the zoom buttons or pinch to zoom, **Fit** to frame the current layout, and **Arrange** to reset it. Switch to **List** for full object names and relationship values.
5. Read the **Focus inspector**. Dataset focus shows the qualified name, record grain, entity definitions, their columns, universe and expressions, the dataset's columns, and its accessor. Relationship focus shows each endpoint and its directional multiplicity and match-existence claims, associated entity context, annotations, and unknown fields. These are graph claims; the inspector does not infer SQL behavior. Use **Previous focus**, **Next focus**, or **Clear view** to navigate.

Recentering keeps the search text and selected result. The URL stores search text, category, depth, and focus for reopening a view; focus history also works within the session. Switching tabs retains Explorer state. In-flight search and neighborhood requests are canceled when superseded, and responses from a changed graph connection cannot silently mix with current evidence.

## Verification and scope

The delivered run passed 18 functional checks, including seven backbone tests, desktop and portrait browser coverage, and a live McDonald's catalog workflow. Strict TypeScript checking and the production build also passed. To run the same opt-in checks with a reachable graph service and built browser bundle:

```sh
npm run build
DOG_BROWSER_TESTS=1 DOG_LIVE_GRAPH_TESTS=1 npm test
```

Plain `npm test` skips the opt-in browser and live graph checks. The browser tests use local Google Chrome by default; set `DOG_BROWSER_EXECUTABLE` to another browser executable path if needed. The live test uses `DOG_SOCKET`, defaulting to `/tmp/data-ontology-graph.sock`.

This stage delivers local graph exploration only. Catalog switching in the website, hosted deployment, agent question runs, correctness scoring, and SQL execution are outside its scope. The committed McDonald's and Starbucks demo snapshots belong to this webapp; other catalogs, graph artifacts, BI question assets, AKG contracts, traces, and run results remain in the configurable Critic project.
