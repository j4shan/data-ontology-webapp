export const graphMethods = [
  'graph.snapshot_info',
  'graph.search',
  'graph.get_identity',
  'graph.get_dataset',
  'graph.get_relationship',
  'graph.get_hops',
  'graph.expand_subgraph',
  'graph.find_paths',
  'graph.find_connecting_subgraph',
] as const;
export type GraphMethod = (typeof graphMethods)[number];
export type Params = Record<string, unknown>;
export interface RpcError {
  code: number;
  message: string;
  data?: unknown;
}
export interface RpcResponse<T = unknown> {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: T;
  error?: RpcError;
}
export interface SnapshotInfo {
  version: string;
  schema_fingerprint: string | null;
  built_at: string;
  node_count: number;
  edge_count: number;
  identity_count: number;
}
export interface Catalog {
  id: string;
  label: string;
  initialFocus: { kind: 'dataset'; nodeId: string };
}
export interface CatalogList {
  catalogs: Catalog[];
  selected_id: string;
}
export interface Health {
  website: 'ready';
  graph: 'connected' | 'unavailable';
  generation: string;
  snapshot?: SnapshotInfo;
  message?: string;
  catalog?: Catalog;
  stages: { id: string; name: string; delivered: boolean }[];
}
export function isRecord(value: unknown): value is Params {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function validMethod(value: unknown): value is GraphMethod {
  return typeof value === 'string' && (graphMethods as readonly string[]).includes(value);
}
export class GraphError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = 'GraphError';
  }
}
