import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeSearch,
  focusForHit,
  loadNeighborhood,
  emphasis,
  readFocus,
  readBounds,
  type Call,
  type Hit,
} from '../web/src/explorer/model.ts';
import { createGraphCaller, SnapshotChanged } from '../web/src/explorer/client.ts';
import { edgeGeometry, pairKey, ringLayout } from '../web/src/graph/geometry.ts';
import {
  ids,
  datasets,
  relationships,
  datasetDetail,
  search,
  subgraph,
} from './fixtures/explorer-catalog.ts';
const bounds = { depth: 2 };
test('search joins match evidence by key while preserving service groups and subject ordering', () => {
  const response = search('account');
  response.groups[0].subject_rows.push([ids.customer, 'Customer', []]);
  response.groups[0].match_rows.unshift([ids.customer, 'exact', 'name', 'customer', 'Customer']);
  const groups = decodeSearch(response as any);
  assert.deepEqual(
    groups[0].hits.map((hit) => hit.label),
    ['Account', 'Customer'],
  );
  assert.equal(groups[0].hits[0].matches[0].match_type, 'prefix');
  assert.equal(groups[0].hits[1].matches[0].match_type, 'exact');
});
test('every search kind resolves to its containing dataset or logical identity without parsing opaque IDs', () => {
  const hit = (kind: any, key: string, subject: any): Hit => ({
    kind,
    key,
    subject,
    label: 'Fixture',
    matches: [],
  });
  assert.deepEqual(focusForHit(hit('dataset', ids.account, {})), {
    kind: 'dataset',
    nodeId: ids.account,
  });
  assert.deepEqual(
    focusForHit(hit('column', 'opaque', { node_id: ids.account, column_name: 'customer_id' })),
    { kind: 'column', nodeId: ids.account, column: 'customer_id' },
  );
  assert.deepEqual(
    focusForHit(
      hit('entity_definition', 'opaque', {
        node_id: ids.account,
        identity_id: 'fixture:customer',
        dataset_columns: ['customer_id'],
      }),
    ),
    {
      kind: 'entity_definition',
      nodeId: ids.account,
      identityId: 'fixture:customer',
      columns: ['customer_id'],
    },
  );
  assert.deepEqual(focusForHit(hit('identity', 'fixture:customer', {})), {
    kind: 'identity',
    identityId: 'fixture:customer',
  });
});
test('logical identity seeds every distinct returned realization and surfaces lookup truncation', async () => {
  const calls: any[] = [];
  const call: Call = async (method, params) => {
    calls.push({ method, params });
    if (method === 'graph.get_identity')
      return {
        name: 'Customer',
        description: '',
        truncated: true,
        entity_definitions: [
          { node_id: ids.account },
          { node_id: ids.customer },
          { node_id: ids.account },
        ],
      } as any;
    return subgraph(params!.seed_node_ids as string[], 1) as any;
  };
  const model = await loadNeighborhood(
    call,
    { kind: 'identity', identityId: 'fixture:customer' },
    bounds,
  );
  assert.deepEqual(model.seeds, [ids.account, ids.customer]);
  assert.equal(model.warnings.length, 1);
  assert.equal(calls[1].params.max_depth, 2);
  assert.equal(calls[1].params.max_nodes, 50);
  assert.equal('max_edges' in calls[1].params, false);
});
test('edge focus seeds both endpoints and retains its authoritative edge at depth zero', async () => {
  const edge = relationships[0];
  const call: Call = async (method, params) =>
    method === 'graph.get_relationship'
      ? ({ ...edge, entity_definitions: [], datasets } as any)
      : (subgraph(params!.seed_node_ids as string[], params!.max_depth as number) as any);
  const model = await loadNeighborhood(
    call,
    { kind: 'relationship', edgeId: edge.edge_id },
    { ...bounds, depth: 0 },
  );
  assert.deepEqual(model.seeds, [ids.account, ids.customer]);
  assert.equal(model.relationships[0].edge_id, edge.edge_id);
  assert.equal(model.relationships[0].b_to_a.match_existence, 'unknown');
});
test('oversized identity focus is rejected before BFS instead of silently dropping seeds', async () => {
  const methods: string[] = [];
  const call: Call = async (method) => {
    methods.push(method);
    return {
      name: 'Customer',
      entity_definitions: Array.from({ length: 51 }, (_, i) => ({
        node_id: `fixture:explorer.overflow-${i}`,
      })),
      truncated: false,
    } as any;
  };
  await assert.rejects(
    loadNeighborhood(call, { kind: 'identity', identityId: 'fixture:customer' }, bounds),
    /51 dataset realizations, exceeding the 50-dataset view limit/,
  );
  assert.deepEqual(methods, ['graph.get_identity']);
});
test('unknown dataset evidence is preserved and each new focus replaces the previous neighborhood', async () => {
  const call: Call = async (method, params) =>
    method === 'graph.get_dataset'
      ? (datasetDetail(params!.node_id as string) as any)
      : (subgraph(params!.seed_node_ids as string[], params!.max_depth as number) as any);
  const first = await loadNeighborhood(call, { kind: 'dataset', nodeId: ids.account }, bounds);
  const second = await loadNeighborhood(
    call,
    { kind: 'dataset', nodeId: ids.customer },
    { ...bounds, depth: 0 },
  );
  assert.equal(first.detail.grain, 'unknown');
  assert.deepEqual(
    second.datasets.map((d) => d.node_id),
    [ids.customer],
  );
  assert.deepEqual(second.relationships, []);
});
test('distance emphasis is monotonic and parallel/self relationships retain separate geometry', () => {
  assert.equal(emphasis(0), 1);
  assert.ok(emphasis(1) > emphasis(2));
  assert.ok(emphasis(3) >= 0.38);
  const positions = ringLayout(datasets.map((d, i) => ({ ...d, distance: i === 0 ? 0 : 1 })));
  assert.deepEqual(positions.get(ids.account), { x: 0, y: 0 });
  const siblings = relationships.filter((edge) => pairKey(edge) === pairKey(relationships[0]));
  assert.notEqual(
    edgeGeometry(siblings[0], positions, siblings)?.path,
    edgeGeometry(siblings[1], positions, siblings)?.path,
  );
  assert.match(edgeGeometry(relationships[3], positions, [relationships[3]])!.path, / C /);
});
test('URL focus accepts stable references and rejects malformed field types', () => {
  assert.equal(readFocus(new URLSearchParams('focus=garbage')), undefined);
  assert.equal(
    readFocus(new URLSearchParams({ focus: JSON.stringify({ kind: 'dataset', nodeId: 5 }) })),
    undefined,
  );
  assert.deepEqual(
    readFocus(
      new URLSearchParams({
        focus: JSON.stringify({ kind: 'column', nodeId: ids.account, column: 'customer_id' }),
      }),
    ),
    {
      kind: 'column',
      nodeId: ids.account,
      column: 'customer_id',
      identityId: undefined,
      columns: undefined,
    },
  );
});
test('adapter generation changes reject a response before it becomes graph evidence', async (t) => {
  const before = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = before;
  });
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ jsonrpc: '2.0', id: '1', generation: 'new', result: { datasets: [] } }),
      { status: 200 },
    );
  await assert.rejects(createGraphCaller('old')('graph.expand_subgraph', {}), SnapshotChanged);
});

test('depth defaults to two and old or malformed URL bounds cannot exceed two hops', () => {
  assert.deepEqual(readBounds(new URLSearchParams()), { depth: 2 });
  assert.deepEqual(readBounds(new URLSearchParams('depth=0')), { depth: 0 });
  assert.deepEqual(readBounds(new URLSearchParams('depth=1')), { depth: 1 });
  assert.deepEqual(readBounds(new URLSearchParams('depth=3')), { depth: 2 });
  assert.deepEqual(readBounds(new URLSearchParams('depth=-1')), { depth: 2 });
  assert.deepEqual(readBounds(new URLSearchParams('depth=garbage')), { depth: 2 });
});
