import type { Dataset, Relationship } from '../../web/src/explorer/model.ts';
export const ids = {
  account: 'fixture:explorer.account',
  customer: 'fixture:explorer.customer',
  activity: 'fixture:explorer.activity',
};
export const snapshot = {
  version: '5.0',
  schema_fingerprint: 'fixture',
  built_at: '2026-10-12T00:00:00Z',
  node_count: 3,
  edge_count: 4,
  identity_count: 2,
};
export const datasets: Dataset[] = Object.entries(ids).map(([name, node_id]) => ({
  node_id,
  distance: 0,
  descriptor: {
    display_name: name[0].toUpperCase() + name.slice(1),
    qualified_name: `fixture.explorer.${name}`,
    description: `A ${name} dataset.`,
  },
  grain: 'unknown',
  unknown_fields: ['grain'],
}));
export const relationships: Relationship[] = [
  {
    edge_id: 'fixture:explorer.customer-primary',
    identity_id: 'fixture:customer',
    endpoint_a: { node_id: ids.account, dataset_columns: ['customer_id'] },
    endpoint_b: { node_id: ids.customer, dataset_columns: ['customer_id'] },
    a_to_b: { multiplicity: 'many:1', match_existence: 'optional' },
    b_to_a: { multiplicity: '1:many', match_existence: 'unknown' },
    unknown_fields: ['b_to_a.match_existence'],
  },
  {
    edge_id: 'fixture:explorer.customer-secondary',
    identity_id: 'fixture:customer',
    endpoint_a: { node_id: ids.account, dataset_columns: ['secondary_customer_id'] },
    endpoint_b: { node_id: ids.customer, dataset_columns: ['customer_id'] },
    a_to_b: { multiplicity: 'unknown', match_existence: 'unknown' },
    b_to_a: { multiplicity: 'unknown', match_existence: 'unknown' },
    unknown_fields: [
      'a_to_b.multiplicity',
      'a_to_b.match_existence',
      'b_to_a.multiplicity',
      'b_to_a.match_existence',
    ],
  },
  {
    edge_id: 'fixture:explorer.activity',
    identity_id: 'fixture:account',
    endpoint_a: { node_id: ids.account, dataset_columns: ['account_id'] },
    endpoint_b: { node_id: ids.activity, dataset_columns: ['account_id'] },
    a_to_b: { multiplicity: '1:many', match_existence: 'optional' },
    b_to_a: { multiplicity: 'many:1', match_existence: 'always' },
    unknown_fields: [],
  },
  {
    edge_id: 'fixture:explorer.self',
    identity_id: 'fixture:account',
    endpoint_a: { node_id: ids.account, dataset_columns: ['account_id'] },
    endpoint_b: { node_id: ids.account, dataset_columns: ['parent_account_id'] },
    a_to_b: { multiplicity: 'many:1', match_existence: 'optional' },
    b_to_a: { multiplicity: '1:many', match_existence: 'optional' },
    unknown_fields: [],
  },
];
export function datasetDetail(nodeId: string) {
  const dataset = datasets.find((d) => d.node_id === nodeId);
  if (!dataset) throw new Error('Dataset not found');
  return {
    ...dataset,
    accessor: { schema_id: 'accessor.fixture', properties: {} },
    columns: ['account_id', 'customer_id', 'secondary_customer_id', 'parent_account_id'].map(
      (name) => ({ name, description: `Column ${name}`, value_description: '' }),
    ),
    entity_definitions: [
      {
        identity_id: 'fixture:customer',
        dataset_columns: ['customer_id'],
        entity_universe: 'unknown',
        entity_expression: ['Customer identity'],
        entity_metadata: {},
        unknown_fields: ['entity_universe'],
      },
    ],
  };
}
export function search(query: string) {
  const header = ['key', 'display_name', 'unknown_fields'];
  const subjects =
    query === 'missing'
      ? []
      : query === 'slow'
        ? [['fixture:explorer.stale', 'Stale result', []]]
        : [[ids.account, 'Account', ['grain']]];
  return {
    snapshot,
    groups: [
      {
        kind: 'dataset',
        truncated: false,
        subject_row_header: header,
        subject_rows: subjects,
        match_row_header: ['key', 'match_type', 'match_field', 'matched_term', 'matched_value'],
        match_rows: subjects.map((row) => [row[0], 'prefix', 'display_name', query, row[1]]),
      },
    ],
    truncated: false,
  };
}
export function subgraph(seeds: string[], depth: number) {
  const selected = depth === 0 ? datasets.filter((d) => seeds.includes(d.node_id)) : datasets;
  return {
    snapshot,
    truncated: depth === 2,
    datasets: selected.map((d) => ({ ...d, distance: seeds.includes(d.node_id) ? 0 : 1 })),
    relationships: depth === 0 ? [] : relationships,
    entity_definitions: [],
    columns: [],
  };
}
