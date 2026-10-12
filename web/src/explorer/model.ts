import { toRecords } from '../../../shared/tables.ts';
import type { GraphMethod, Params, SnapshotInfo } from '../../../shared/protocol.ts';
export type Kind = 'identity' | 'dataset' | 'entity_definition' | 'column';
export interface Match {
  key: string;
  match_type: string;
  match_field: string;
  matched_term: string;
  matched_value: string;
}
export interface Hit {
  kind: Kind;
  key: string;
  label: string;
  subject: Record<string, any>;
  matches: Match[];
}
export interface SearchGroup {
  kind: Kind;
  truncated: boolean;
  subject_row_header: string[];
  subject_rows: any[][];
  match_row_header: string[];
  match_rows: string[][];
}
export interface SearchResponse {
  snapshot: SnapshotInfo;
  groups: SearchGroup[];
  truncated: boolean;
}
export interface Dataset {
  node_id: string;
  distance: number;
  descriptor: {
    display_name: string;
    qualified_name: string;
    description?: string;
    tags?: string[];
  };
  grain?: unknown;
  unknown_fields?: string[];
  accessor?: unknown;
}
export interface Endpoint {
  node_id: string;
  dataset_columns: string[];
}
export interface Claims {
  multiplicity: string;
  match_existence: string;
}
export interface Relationship {
  edge_id: string;
  identity_id: string;
  endpoint_a: Endpoint;
  endpoint_b: Endpoint;
  a_to_b: Claims;
  b_to_a: Claims;
  unknown_fields: string[];
  annotation?: unknown;
}
export interface Definition {
  node_id?: string;
  identity_id: string;
  dataset_columns: string[];
  entity_universe: string;
  entity_expression: string[];
  entity_metadata: unknown;
  unknown_fields: string[];
}
export type Focus =
  | {
      kind: 'dataset' | 'column' | 'entity_definition';
      nodeId: string;
      column?: string;
      identityId?: string;
      columns?: string[];
    }
  | { kind: 'identity'; identityId: string }
  | { kind: 'relationship'; edgeId: string };
export const MAX_DATASETS = 50;
export interface Bounds {
  depth: number;
}
export function readBounds(params: URLSearchParams): Bounds {
  const depth = Number(params.get('depth') ?? 2);
  return { depth: Number.isInteger(depth) && depth >= 0 ? Math.min(depth, 2) : 2 };
}
export type Call = <T = any>(
  method: GraphMethod,
  params?: Params,
  signal?: AbortSignal,
) => Promise<T>;
export interface Neighborhood {
  focus: Focus;
  label: string;
  seeds: string[];
  datasets: Dataset[];
  relationships: Relationship[];
  definitions: Definition[];
  columns: any[];
  detail: any;
  truncated: boolean;
  warnings: string[];
  bounds: Bounds;
  snapshot?: SnapshotInfo;
}
export function decodeSearch(
  response: SearchResponse,
): { kind: Kind; hits: Hit[]; truncated: boolean }[] {
  return response.groups.map((group) => {
    const subjects = toRecords<Record<string, any>>({
      header: group.subject_row_header,
      rows: group.subject_rows,
    });
    const matches = toRecords<Match>({ header: group.match_row_header, rows: group.match_rows });
    const byKey = new Map<string, Match[]>();
    for (const match of matches) byKey.set(match.key, [...(byKey.get(match.key) ?? []), match]);
    return {
      kind: group.kind,
      truncated: group.truncated,
      hits: subjects.map((subject) => ({
        kind: group.kind,
        key: subject.key,
        label:
          subject.display_name ??
          subject.name ??
          subject.column_name ??
          subject.entity_expression?.[0] ??
          subject.identity_id ??
          subject.key,
        subject,
        matches: byKey.get(subject.key) ?? [],
      })),
    };
  });
}
export function focusForHit(hit: Hit): Focus {
  if (hit.kind === 'identity') return { kind: 'identity', identityId: hit.key };
  if (hit.kind === 'dataset') return { kind: 'dataset', nodeId: hit.key };
  if (hit.kind === 'column')
    return { kind: 'column', nodeId: hit.subject.node_id, column: hit.subject.column_name };
  return {
    kind: 'entity_definition',
    nodeId: hit.subject.node_id,
    identityId: hit.subject.identity_id,
    columns: hit.subject.dataset_columns,
  };
}
export function emphasis(distance: number): number {
  return Math.max(0.38, 0.72 ** Math.max(0, distance));
}
export async function loadNeighborhood(
  call: Call,
  focus: Focus,
  bounds: Bounds,
  signal?: AbortSignal,
): Promise<Neighborhood> {
  let detail: any;
  let seeds: string[];
  const warnings: string[] = [];
  if (focus.kind === 'identity') {
    detail = await call(
      'graph.get_identity',
      { identity_id: focus.identityId, limit: 1000, response_format: 'records' },
      signal,
    );
    seeds = [...new Set(toRecords<Definition>(detail.entity_definitions).map((d) => d.node_id!))];
    if (detail.truncated)
      warnings.push(
        'Identity realizations are limited by the service. Narrow the identity focus before treating this as a complete list.',
      );
  } else if (focus.kind === 'relationship') {
    detail = await call(
      'graph.get_relationship',
      { edge_id: focus.edgeId, response_format: 'records' },
      signal,
    );
    seeds = [...new Set([detail.endpoint_a.node_id, detail.endpoint_b.node_id])];
  } else {
    detail = await call('graph.get_dataset', { node_id: focus.nodeId }, signal);
    seeds = [focus.nodeId];
  }
  if (seeds.length > MAX_DATASETS)
    throw new Error(
      `This identity has ${seeds.length} dataset realizations, exceeding the ${MAX_DATASETS}-dataset view limit. Select a dataset realization from its result group.`,
    );
  const label =
    focus.kind === 'identity'
      ? detail.name
      : focus.kind === 'relationship'
        ? detail.identity_id
        : detail.descriptor.display_name;
  if (!seeds.length)
    return {
      focus,
      label,
      seeds,
      datasets: [],
      relationships: [],
      definitions: [],
      columns: [],
      detail,
      truncated: false,
      warnings: [...warnings, 'This identity has no registered dataset realizations.'],
      bounds,
    };
  const result = await call(
    'graph.expand_subgraph',
    {
      seed_node_ids: seeds,
      max_depth: Math.min(bounds.depth, 2),
      max_nodes: MAX_DATASETS,
      response_format: 'records',
    },
    signal,
  );
  const datasets = toRecords<Dataset>(result.datasets);
  const relationships = toRecords<Relationship>(result.relationships);
  // Selected edge evidence comes from detail even when a depth-zero BFS returns no relationships.
  if (focus.kind === 'relationship' && !relationships.some((edge) => edge.edge_id === focus.edgeId))
    relationships.unshift(detail as Relationship);
  const definitions = toRecords<Definition>(result.entity_definitions);
  return {
    focus,
    label,
    seeds,
    datasets,
    relationships,
    definitions,
    columns: toRecords(result.columns),
    detail,
    truncated: result.truncated,
    warnings,
    bounds,
    snapshot: result.snapshot,
  };
}
export function focusKey(focus: Focus): string {
  return JSON.stringify(focus);
}
export function readFocus(params: URLSearchParams): Focus | undefined {
  const encoded = params.get('focus');
  if (!encoded) return;
  try {
    const value = JSON.parse(encoded);
    if (value.kind === 'identity' && typeof value.identityId === 'string' && value.identityId)
      return { kind: 'identity', identityId: value.identityId };
    if (value.kind === 'relationship' && typeof value.edgeId === 'string' && value.edgeId)
      return { kind: 'relationship', edgeId: value.edgeId };
    if (
      ['dataset', 'column', 'entity_definition'].includes(value.kind) &&
      typeof value.nodeId === 'string' &&
      value.nodeId
    ) {
      if (value.column !== undefined && typeof value.column !== 'string') return;
      if (value.identityId !== undefined && typeof value.identityId !== 'string') return;
      if (
        value.columns !== undefined &&
        (!Array.isArray(value.columns) ||
          !value.columns.every((s: unknown) => typeof s === 'string'))
      )
        return;
      return {
        kind: value.kind,
        nodeId: value.nodeId,
        column: value.column,
        identityId: value.identityId,
        columns: value.columns,
      };
    }
  } catch {
    return;
  }
}
