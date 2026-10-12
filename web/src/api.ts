import { GraphError, type GraphMethod, type Health, type Params, type RpcResponse } from '../../shared/protocol.ts';
export async function health(signal?: AbortSignal): Promise<Health> {
  const response = await fetch('/api/health', { signal });
  if (!response.ok) throw new Error('The website connection is unavailable');
  return response.json();
}
export async function graph<T>(method: GraphMethod, params: Params, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api/graph', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method, params }), signal });
  const value = await response.json() as RpcResponse<T> & { message?: string };
  if (!response.ok || value.error) throw new GraphError(value.error?.code ?? -32050, value.error?.message ?? value.message ?? 'Graph request failed', value.error?.data);
  return value.result as T;
}
