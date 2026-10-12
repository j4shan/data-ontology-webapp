import type { Health, CatalogList } from '../../shared/protocol.ts';
async function read<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const value = await response.json();
  if (!response.ok) throw new Error(value.message ?? 'The catalog connection is unavailable');
  return value as T;
}
export function health(signal?: AbortSignal) {
  return read<Health>('/api/health', { signal });
}
export function catalogList(signal?: AbortSignal) {
  return read<CatalogList>('/api/catalogs', { signal });
}
export function activateCatalog(catalogId: string, signal?: AbortSignal) {
  return read<Health>('/api/catalog', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ catalog_id: catalogId }),
    signal,
  });
}
