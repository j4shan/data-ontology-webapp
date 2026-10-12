import { useEffect, useMemo, useRef, useState } from 'react';
import type { FeatureProps } from '../App.tsx';
import { createGraphCaller, SnapshotChanged } from './client.ts';
import {
  decodeSearch,
  focusForHit,
  focusKey,
  loadNeighborhood,
  readFocus,
  readBounds,
  type Bounds,
  type Focus,
  type Hit,
  type Neighborhood,
  type SearchResponse,
  type Kind,
} from './model.ts';
import { GraphView } from '../graph/GraphView.tsx';
import { Inspector } from './Inspector.tsx';
import './explorer.css';
const kindNames = {
  identity: 'Logical identities',
  dataset: 'Datasets',
  entity_definition: 'Entity definitions',
  column: 'Columns',
};
function initialKind(): Kind | 'all' {
  const value = new URLSearchParams(location.search).get('kind');
  return value && ['identity', 'dataset', 'entity_definition', 'column'].includes(value)
    ? (value as Kind)
    : 'all';
}
function initialBounds(): Bounds {
  return readBounds(new URLSearchParams(location.search));
}
export default function Explorer({ connection, refresh }: FeatureProps) {
  const [query, setQuery] = useState(() => new URLSearchParams(location.search).get('q') ?? '');
  const [searchKind, setSearchKind] = useState<Kind | 'all'>(initialKind);
  const [groups, setGroups] = useState<ReturnType<typeof decodeSearch>>();
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [selectedSearch, setSelectedSearch] = useState('');
  const [focus, setFocus] = useState<Focus | undefined>(() =>
    readFocus(new URLSearchParams(location.search)),
  );
  const [bounds, setBounds] = useState(initialBounds);
  const [model, setModel] = useState<Neighborhood>();
  const [viewLoading, setViewLoading] = useState(false);
  const [viewError, setViewError] = useState('');
  const [historyState, setHistory] = useState<{ items: Focus[]; index: number }>(() => {
    const f = readFocus(new URLSearchParams(location.search));
    return { items: f ? [f] : [], index: f ? 0 : -1 };
  });
  const [mode, setMode] = useState<'graph' | 'list'>('graph');
  const [filter, setFilter] = useState('');
  const changedMessage = useRef('');
  const connected = connection?.graph === 'connected';
  const call = useMemo(
    () => createGraphCaller(connection?.generation ?? ''),
    [connection?.generation],
  );
  const key = focus ? focusKey(focus) : '';
  function snapshotChanged(error: Error) {
    if (error instanceof SnapshotChanged) {
      setModel(undefined);
      setGroups(undefined);
      setSelectedSearch('');
      changedMessage.current = error.message;
      void refresh();
      return true;
    }
    return false;
  }
  useEffect(() => {
    setModel(undefined);
    setGroups(undefined);
    setSelectedSearch('');
    if (changedMessage.current) {
      setViewError(changedMessage.current);
      changedMessage.current = '';
    }
  }, [connection?.generation]);
  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    setGroups(undefined);
    setSearchError('');
    if (!query.trim() || !connected) {
      setSearchLoading(false);
      return () => controller.abort();
    }
    setSearchLoading(true);
    const timer = setTimeout(() => {
      void call<SearchResponse>(
        'graph.search',
        { query: query.trim(), limit: 25, ...(searchKind === 'all' ? {} : { kind: [searchKind] }) },
        controller.signal,
      )
        .then((response) => {
          if (current && !controller.signal.aborted) {
            setGroups(decodeSearch(response));
            setSearchError('');
          }
        })
        .catch((error: Error) => {
          if (current && !controller.signal.aborted) {
            snapshotChanged(error);
            setSearchError(error.message);
          }
        })
        .finally(() => {
          if (current && !controller.signal.aborted) setSearchLoading(false);
        });
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, searchKind, call, connected]);
  useEffect(() => {
    if (!focus || !connected) {
      setViewLoading(false);
      return;
    }
    const controller = new AbortController();
    setViewLoading(true);
    setViewError('');
    void loadNeighborhood(call, focus, bounds, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setModel(value);
          setViewError('');
        }
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) {
          snapshotChanged(error);
          setViewError(error.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setViewLoading(false);
      });
    return () => controller.abort();
  }, [key, bounds.depth, call, connected]);
  useEffect(() => {
    const url = new URL(location.href);
    if (query) url.searchParams.set('q', query);
    else url.searchParams.delete('q');
    url.searchParams.set('depth', String(bounds.depth));
    if (searchKind === 'all') url.searchParams.delete('kind');
    else url.searchParams.set('kind', searchKind);
    if (focus) url.searchParams.set('focus', JSON.stringify(focus));
    else url.searchParams.delete('focus');
    window.history.replaceState({}, '', url);
  }, [query, key, bounds.depth, searchKind]);
  useEffect(() => {
    const pop = () => {
      const params = new URLSearchParams(location.search);
      setQuery(params.get('q') ?? '');
      setSearchKind(initialKind());
      setFocus(readFocus(params));
      setBounds(initialBounds());
    };
    addEventListener('popstate', pop);
    return () => removeEventListener('popstate', pop);
  }, []);
  function chooseFocus(value: Focus) {
    setFocus(value);
    setHistory((old) => {
      if (old.items[old.index] && focusKey(old.items[old.index]) === focusKey(value)) return old;
      const items = old.items.slice(0, old.index + 1);
      items.push(value);
      return { items, index: items.length - 1 };
    });
  }
  function selectHit(hit: Hit) {
    setSelectedSearch(`${hit.kind}:${hit.key}`);
    chooseFocus(focusForHit(hit));
  }
  function back(delta: number) {
    const index = historyState.index + delta;
    if (index >= 0 && index < historyState.items.length) {
      setHistory({ ...historyState, index });
      setFocus(historyState.items[index]);
    }
  }
  const datasets =
    model?.datasets.filter((node) =>
      `${node.descriptor.display_name} ${node.descriptor.qualified_name}`
        .toLowerCase()
        .includes(filter.toLowerCase()),
    ) ?? [];
  const relationships =
    model?.relationships.filter((edge) =>
      `${edge.identity_id} ${edge.endpoint_a.node_id} ${edge.endpoint_b.node_id}`
        .toLowerCase()
        .includes(filter.toLowerCase()),
    ) ?? [];
  return (
    <div className="explorer-workspace">
      <section className="search-panel" aria-label="Entity search">
        <div className="panel-heading">
          <p className="eyebrow">DISCOVER</p>
          <h2>Search the catalog</h2>
        </div>
        <label htmlFor="entity-search">Entity, dataset or column</label>
        <div className="search-input">
          <span aria-hidden="true">⌕</span>
          <input
            id="entity-search"
            type="search"
            placeholder="Try restaurant, guest, sales…"
            value={query}
            maxLength={160}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedSearch('');
            }}
            disabled={!connected}
          />
        </div>
        <label className="search-category">
          Search category
          <select
            aria-label="Search category"
            value={searchKind}
            onChange={(e) => {
              setSearchKind(e.target.value as Kind | 'all');
              setSelectedSearch('');
            }}
          >
            <option value="all">All kinds</option>
            {Object.entries(kindNames).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <p className="search-help">Type a prefix. Results keep the service’s lexical ranking.</p>
        <div className="search-results" aria-live="polite">
          {!connected ? (
            <p className="empty-message">Connect the graph service to search.</p>
          ) : searchLoading ? (
            <p role="status" className="empty-message">
              Searching…
            </p>
          ) : searchError ? (
            <p role="alert" className="inline-error">
              {searchError}
            </p>
          ) : !query.trim() ? (
            <p className="empty-message">Start with a business term to find a focus.</p>
          ) : groups?.every((group) => !group.hits.length) ? (
            <p className="empty-message">No matches. Try a shorter prefix.</p>
          ) : (
            groups?.map((group) => (
              <section key={group.kind} className="result-group">
                <h3>
                  {kindNames[group.kind]} <span>{group.hits.length}</span>
                </h3>
                {group.truncated && (
                  <p className="partial-note">More matches exist. Refine this prefix.</p>
                )}
                {group.hits.map((hit) => (
                  <button
                    key={hit.key}
                    className={`search-result ${selectedSearch === `${hit.kind}:${hit.key}` ? 'is-selected' : ''}`}
                    aria-pressed={selectedSearch === `${hit.kind}:${hit.key}`}
                    aria-label={`Select ${hit.kind.replace('_', ' ')} ${hit.label}`}
                    onClick={() => selectHit(hit)}
                  >
                    <strong>{hit.label}</strong>
                    {hit.subject.node_id && <small>{hit.subject.node_id}</small>}
                    {hit.matches.map((match, i) => (
                      <span className="match" key={i}>
                        <span className="match-type">{match.match_type}</span>
                        <span>
                          {match.match_field}: {match.matched_value}
                        </span>
                      </span>
                    ))}
                    {hit.subject.unknown_fields?.length > 0 && (
                      <small className="unknown-claims">
                        Unknown: {hit.subject.unknown_fields.join(', ')}
                      </small>
                    )}
                  </button>
                ))}
              </section>
            ))
          )}
        </div>
      </section>
      <section className="view-panel" aria-label="Neighborhood workspace">
        <div className="view-toolbar">
          <div>
            <p className="eyebrow">LOCAL NEIGHBORHOOD</p>
            <h2 data-testid="focus-title">{model?.label ?? 'Choose a starting point'}</h2>
          </div>
          <div className="focus-history">
            <button
              onClick={() => back(-1)}
              disabled={historyState.index <= 0}
              aria-label="Previous focus"
            >
              ←
            </button>
            <button
              onClick={() => back(1)}
              disabled={historyState.index >= historyState.items.length - 1}
              aria-label="Next focus"
            >
              →
            </button>
            <button
              onClick={() => {
                setFocus(undefined);
                setModel(undefined);
                setHistory({ items: [], index: -1 });
                setViewError('');
                setSelectedSearch('');
              }}
            >
              Clear view
            </button>
          </div>
        </div>
        <div className="bounds-bar">
          <label>
            BFS depth
            <select
              aria-label="BFS depth"
              value={bounds.depth}
              onChange={(e) => setBounds({ ...bounds, depth: Number(e.target.value) })}
            >
              {[0, 1, 2].map((depth) => (
                <option key={depth} value={depth}>
                  {depth === 0 ? '0 · focus only' : depth}
                </option>
              ))}
            </select>
          </label>
          <div className="view-switch" aria-label="Neighborhood display">
            <button aria-pressed={mode === 'graph'} onClick={() => setMode('graph')}>
              Graph
            </button>
            <button aria-pressed={mode === 'list'} onClick={() => setMode('list')}>
              List
            </button>
          </div>
        </div>
        {viewLoading && (
          <div className="view-status" role="status">
            Updating neighborhood…{' '}
            {model ? 'The previous view remains visible until the new evidence arrives.' : ''}
          </div>
        )}
        {viewError && (
          <div className="inline-error view-error" role="alert">
            {viewError}
            {model && <span> Showing the previous view.</span>}
          </div>
        )}
        {model?.truncated && (
          <div className="partial-banner" role="status">
            Partial neighborhood: some connected objects were omitted. Select a nearby dataset to
            explore another neighborhood.
          </div>
        )}
        {model?.warnings.map((warning) => (
          <div key={warning} className="partial-banner" role="status">
            {warning}
          </div>
        ))}
        {model ? (
          <>
            <div className="graph-and-inspector">
              <div>
                <div hidden={mode !== 'graph'}>
                  <GraphView model={model} onFocus={chooseFocus} />
                </div>
                <section
                  className="neighborhood-list"
                  hidden={mode !== 'list'}
                  aria-label="Neighborhood objects"
                >
                  <label>
                    Find in this view
                    <input
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      placeholder="Filter datasets or relationships"
                    />
                  </label>
                  <h3>Datasets ({datasets.length})</h3>
                  {datasets.map((node) => (
                    <button
                      className="object-row"
                      key={node.node_id}
                      onClick={() => chooseFocus({ kind: 'dataset', nodeId: node.node_id })}
                      aria-label={`Recenter on dataset ${node.descriptor.display_name}`}
                    >
                      <strong>{node.descriptor.display_name}</strong>
                      <span>{node.descriptor.qualified_name}</span>
                      <small>
                        Depth {node.distance}
                        {node.unknown_fields?.length ? ' · unknown claims' : ''}
                      </small>
                    </button>
                  ))}
                  <h3>Relationships ({relationships.length})</h3>
                  {relationships.map((edge) => (
                    <button
                      className="object-row"
                      key={edge.edge_id}
                      onClick={() => chooseFocus({ kind: 'relationship', edgeId: edge.edge_id })}
                      aria-label={`Recenter on relationship ${edge.identity_id}`}
                    >
                      <strong>{edge.identity_id}</strong>
                      <span>
                        {edge.endpoint_a.node_id} ↔ {edge.endpoint_b.node_id}
                      </span>
                      <small>
                        {edge.a_to_b.multiplicity} / {edge.b_to_a.multiplicity}
                      </small>
                    </button>
                  ))}
                </section>
              </div>
              <Inspector model={model} onFocus={chooseFocus} />
            </div>
            <p className="snapshot-note">
              BFS depth {model.bounds.depth} · {model.seeds.length} focus dataset
              {model.seeds.length === 1 ? '' : 's'} · Snapshot built{' '}
              {model.snapshot?.built_at ?? connection?.snapshot?.built_at}
            </p>
          </>
        ) : (
          <div className="explorer-empty">
            <span className="empty-focus" aria-hidden="true">
              ◎
            </span>
            <h3>One focus. A connected neighborhood.</h3>
            <p>
              Select one search result to explore its datasets and relationships. Click a neighbor
              to make it the new focus.
            </p>
            <p className="muted">
              Fading represents BFS distance. Relationship claims remain available in the inspector.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
