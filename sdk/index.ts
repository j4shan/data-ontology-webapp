import { GraphError, type GraphMethod, type Params, type RpcResponse, type Health } from '../shared/protocol.ts';
export { GraphError, graphMethods } from '../shared/protocol.ts';
export type { GraphMethod, Health, Params, SnapshotInfo } from '../shared/protocol.ts';
export { toRecords } from '../shared/tables.ts';
export function createWebsiteClient(baseUrl = 'http://127.0.0.1:4310') {
  const base = new URL(baseUrl);
  if (base.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(base.hostname) || base.username || base.password) throw new Error('The website client requires a localhost HTTP URL');
  async function read<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(new URL(path, base), { ...init, signal: init?.signal ?? AbortSignal.timeout(20_000) });
    const value = await response.json();
    if (!response.ok) throw new GraphError(value.error?.code ?? -32050, value.message ?? 'Website request failed', value.error?.data);
    return value as T;
  }
  return {
    health: () => read<Health>('/api/health'),
    async graph<T = unknown>(method: GraphMethod, params: Params = {}): Promise<T> {
      const value = await read<RpcResponse<T>>('/api/graph', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method, params }) });
      if (value.error) throw new GraphError(value.error.code, value.error.message, value.error.data);
      return value.result as T;
    },
  };
}
