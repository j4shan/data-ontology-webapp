# Data Ontology Webapp

Stages 1 and 2 deliver a localhost React and TypeScript webapp with a read-only adapter to the graph service. Function #1, the Graph explorer, searches the selected catalog and displays bounded dataset neighborhoods with an evidence inspector. Function #2, the AKG workbench, is labelled **Coming soon**.

## Start locally

Use Node.js 22.12 or later. Install the `data-ontology-graph-server` executable and make sure it is on `PATH`. If it is installed elsewhere, set `DOG_GRAPH_SERVER=/path/to/bin/data-ontology-graph-server` when starting the webapp. From the webapp root:

```sh
npm install
npm run build
npm start
```

Open `http://127.0.0.1:4310` and select **Graph explorer**. The server binds only to `127.0.0.1`; `DOG_WEBSITE_PORT` changes its port from the default of 4310. The webapp starts the installed graph service when it activates a catalog. You do not need to start a separate daemon for normal demo use.

The shared **Data catalog** dropdown offers McDonald’s and Starbucks in both tabs. McDonald’s is the default, and a URL with `catalog=sbux` restores Starbucks. Selecting a catalog loads its bundled snapshot and opens a new starting neighborhood: **Restaurant** for McDonald’s or **Transaction** for Starbucks. The selection clears the previous catalog’s focus, focus history, and results while retaining typed search text and category. The webapp owns one graph process at a time on a private temporary Unix socket. It stops its process when the catalog changes or the webapp shuts down; it does not control unrelated graph daemons.

The snapshots live in `artifacts/catalogs/mcd/current` and `artifacts/catalogs/sbux/current`. Each contains independent copies of `nodes.json`, `edges.json`, and `annotations.json`; no YAML source or sibling repository is needed to load them. Both are committed at [artifacts/catalogs on GitHub](https://github.com/j4shan/data-ontology-webapp/tree/main/artifacts/catalogs). The McDonald’s snapshot has 71 datasets, 283 relationships, and 38 identities; Starbucks has 76 datasets, 203 relationships, and 35 identities. Both use snapshot format 5.0 and schema fingerprint `3f0b8c99b8579402`.

In the Explorer, type a prefix, optionally choose a search category, and select a result. **BFS depth** offers 0, 1, or 2 hops and defaults to 2. The view is limited to 50 datasets; there are no dataset or relationship limit controls. Select a dataset or relationship to recenter, and use **Graph**, **List**, and the inspector to read the evidence. If an identity has more than 50 dataset realizations, select an individual dataset realization. A **Partial neighborhood** notice means some connected objects were omitted; select a nearby dataset to explore another neighborhood. See [Stage 2 delivery](project_metadata/instructions/stage-2-delivery.md) for the controls and focus behavior.

For application server development, `npm run dev` builds once and watches the server. After browser source changes, run `npm run build` and refresh the page.

## Check the local adapter and graph connection

With the webapp running, check the selected catalog’s readiness:

```sh
curl http://127.0.0.1:4310/api/health
```

Health reports `website: "ready"` even when the selected graph is `"unavailable"`, for example if the installed executable cannot start. Use **Refresh connection** to retry. `GET /api/catalogs` returns the configured dropdown choices, `POST /api/catalog` activates a configured ID, and `GET /api/health` reports the current catalog’s readiness. Browser graph calls use `POST /api/graph` and carry `catalog_id`. The server rejects calls for a different selected catalog. Catalog selection and connection generations prevent older responses from appearing as current evidence.

Browsers cannot open Unix sockets. The local HTTP adapter forwards their requests as JSON-RPC 2.0 over the owned graph service’s socket. It allows nine public, read-only graph methods: `graph.snapshot_info`, `graph.search`, `graph.get_identity`, `graph.get_dataset`, `graph.get_relationship`, `graph.get_hops`, `graph.expand_subgraph`, `graph.find_paths`, and `graph.find_connecting_subgraph`. Graph semantics come from the standard service. External agents use its public JSON-RPC API directly.

## Project layout

`web/` contains the browser app; `server/` contains the localhost HTTP adapter and graph transport; `shared/` contains protocol and table utilities; `tests/` contains integration and browser checks; `config/catalogs.json` lists the bundled choices; and `artifacts/catalogs/` contains the two independent demo snapshots. The repository has no public SDK, separate CLI, or client package export.

The bundled McDonald’s and Starbucks snapshots are committed demo assets. Other catalogs, BI questions, graph artifacts, AKG contracts, traces, and run results belong in the configurable Critic project; temporary runtime output remains untracked. The current delivery has no hosted deployment, agent question run, correctness scoring, or SQL execution.

See [Stage 1 delivery](project_metadata/instructions/stage-1-delivery.md) for the backbone and [Stage 2 delivery](project_metadata/instructions/stage-2-delivery.md) for Function #1 and its verification.
