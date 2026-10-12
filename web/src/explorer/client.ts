import {
  GraphError,
  type RpcResponse,
  type GraphMethod,
  type Params,
} from '../../../shared/protocol.ts';
import type { Call } from './model.ts';
export class SnapshotChanged extends Error {
  constructor() {
    super(
      'The graph service changed. Refresh the connection to load evidence from the current snapshot.',
    );
  }
}
export function createGraphCaller(generation: string, catalogId?: string): Call {
  return async <T>(method: GraphMethod, params: Params = {}, signal?: AbortSignal): Promise<T> => {
    const response = await fetch('/api/graph', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method, params, ...(catalogId ? { catalog_id: catalogId } : {}) }),
      signal,
    });
    const value = (await response.json()) as RpcResponse<T> & {
      generation?: string;
      catalog_id?: string;
      message?: string;
    };
    if (value.error?.code === -32051) throw new SnapshotChanged();
    if (!response.ok || value.error)
      throw new GraphError(
        value.error?.code ?? -32050,
        value.error?.message ?? value.message ?? 'Graph request failed',
        value.error?.data,
      );
    if (value.generation !== generation || (catalogId && value.catalog_id !== catalogId))
      throw new SnapshotChanged();
    return value.result as T;
  };
}
