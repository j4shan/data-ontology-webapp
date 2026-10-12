import { spawn, type ChildProcess } from 'node:child_process';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { GraphClient } from './graph-client.ts';
import {
  GraphError,
  isRecord,
  type Catalog,
  type GraphMethod,
  type Params,
  type SnapshotInfo,
} from '../shared/protocol.ts';

export interface CatalogDefinition extends Catalog {
  snapshotDirectory: string;
}
export interface CatalogOptions {
  catalogs: CatalogDefinition[];
  executable?: string;
  executableArgs?: string[];
  readinessMs?: number;
}
export async function readCatalogs(root: string): Promise<CatalogDefinition[]> {
  const values: unknown = JSON.parse(await readFile(resolve(root, 'config/catalogs.json'), 'utf8'));
  if (!Array.isArray(values) || !values.length) throw new Error('Catalog registry is empty');
  const seen = new Set<string>();
  return values.map((value) => {
    if (
      !isRecord(value) ||
      typeof value.id !== 'string' ||
      !/^[a-z0-9-]+$/.test(value.id) ||
      seen.has(value.id) ||
      typeof value.label !== 'string' ||
      typeof value.snapshotDirectory !== 'string' ||
      !isRecord(value.initialFocus) ||
      value.initialFocus.kind !== 'dataset' ||
      typeof value.initialFocus.nodeId !== 'string'
    )
      throw new Error('Invalid catalog registry');
    seen.add(value.id);
    const snapshotDirectory = resolve(root, value.snapshotDirectory);
    if (!snapshotDirectory.startsWith(resolve(root, 'artifacts/catalogs') + sep))
      throw new Error('Catalog snapshot must be bundled with the webapp');
    return {
      id: value.id,
      label: value.label,
      initialFocus: { kind: 'dataset', nodeId: value.initialFocus.nodeId },
      snapshotDirectory,
    };
  });
}
export class CatalogManager {
  private client?: GraphClient;
  private child?: ChildProcess;
  private directory?: string;
  private epoch = randomUUID();
  private queue: Promise<unknown> = Promise.resolve();
  private pending?: { id: string; promise: Promise<void> };
  private closed = false;
  private activeId?: string;
  selectedId: string;
  constructor(private readonly options: CatalogOptions) {
    if (!options.catalogs.length) throw new Error('Catalog registry is empty');
    this.selectedId = options.catalogs[0].id;
  }
  get generation() {
    return `${this.epoch}:${this.client?.generation ?? 'loading'}`;
  }
  get catalog(): Catalog {
    const { id, label, initialFocus } = this.definition(this.selectedId);
    return { id, label, initialFocus };
  }
  list(): Catalog[] {
    return this.options.catalogs.map(({ id, label, initialFocus }) => ({
      id,
      label,
      initialFocus,
    }));
  }
  private definition(id: string) {
    const value = this.options.catalogs.find((catalog) => catalog.id === id);
    if (!value) throw new GraphError(-32602, 'Unknown data catalog');
    return value;
  }
  async activate(id: string): Promise<void> {
    const catalog = this.definition(id);
    if (this.closed) throw new GraphError(-32050, 'Catalog service is closed');
    if (this.pending?.id === id && this.selectedId === id) return this.pending.promise;
    if (
      this.activeId === id &&
      this.selectedId === id &&
      this.child?.exitCode === null &&
      this.child.signalCode === null &&
      !this.child.killed
    )
      return;
    this.selectedId = id;
    const epoch = (this.epoch = randomUUID());
    // Immediately invalidate the old transport, including queued requests.
    this.client?.close();
    const operation = this.queue
      .then(async () => {
        await this.stopRuntime();
        if (this.closed || epoch !== this.epoch)
          throw new GraphError(-32051, 'Catalog selection changed');
        for (const file of ['nodes.json', 'edges.json', 'annotations.json'])
          await access(join(catalog.snapshotDirectory, file));
        this.directory = await mkdtemp(join(tmpdir(), 'dog-webapp-'));
        const socketPath = join(this.directory, 'graph.sock');
        const child = (this.child = spawn(
          this.options.executable ?? 'data-ontology-graph-server',
          [
            ...(this.options.executableArgs ?? []),
            '--snapshot-dir',
            catalog.snapshotDirectory,
            '--socket',
            socketPath,
          ],
          { stdio: ['ignore', 'ignore', 'pipe'] },
        ));
        let failure: Error | undefined;
        let stderr = '';
        child.on('error', (error) => {
          failure = error;
        });
        child.stderr?.on('data', (chunk) => {
          stderr = (stderr + String(chunk)).slice(-4096);
        });
        const client = (this.client = new GraphClient({ socketPath }));
        const deadline = Date.now() + (this.options.readinessMs ?? 15_000);
        while (Date.now() < deadline) {
          if (this.closed || epoch !== this.epoch)
            throw new GraphError(-32051, 'Catalog selection changed');
          if (failure || child.exitCode !== null || child.signalCode !== null)
            throw failure ?? new Error(stderr || 'Graph service exited');
          try {
            await access(socketPath);
            const response = await client.call('graph.snapshot_info');
            if (response.error)
              throw new GraphError(
                response.error.code,
                response.error.message,
                response.error.data,
              );
            if (this.closed || epoch !== this.epoch)
              throw new GraphError(-32051, 'Catalog selection changed');
            this.activeId = id;
            return;
          } catch (error) {
            if (error instanceof GraphError && error.code === -32051) throw error;
          }
          await delay(40);
        }
        throw new Error('Graph service readiness timed out');
      })
      .catch(async (error) => {
        await this.stopRuntime();
        if (error instanceof GraphError && error.code === -32051) throw error;
        console.error(`Catalog ${id}: ${(error as Error).message}`);
        throw new GraphError(
          -32050,
          'Unable to load the selected catalog. Check the graph service installation and try again.',
        );
      });
    this.queue = operation.catch(() => undefined);
    this.pending = { id, promise: operation };
    try {
      await operation;
    } finally {
      if (this.pending?.promise === operation) this.pending = undefined;
    }
  }
  async callFor(id: string, method: GraphMethod, params: Params = {}) {
    this.definition(id);
    if (id !== this.selectedId) throw new GraphError(-32051, 'Catalog selection changed');
    await this.activate(id);
    const client = this.client!;
    const epoch = this.epoch;
    const response = await client.call(method, params);
    if (id !== this.selectedId || epoch !== this.epoch || client !== this.client)
      throw new GraphError(-32051, 'Catalog selection changed');
    return { response, generation: this.generation, catalogId: id };
  }
  async call(method: GraphMethod, params: Params = {}) {
    return (await this.callFor(this.selectedId, method, params)).response;
  }
  async status(): Promise<{
    graph: 'connected' | 'unavailable';
    generation: string;
    catalog: Catalog;
    snapshot?: SnapshotInfo;
    message?: string;
  }> {
    const id = this.selectedId;
    try {
      const { response, generation } = await this.callFor(id, 'graph.snapshot_info');
      if (response.error)
        throw new GraphError(response.error.code, response.error.message, response.error.data);
      if (id !== this.selectedId || generation !== this.generation)
        throw new GraphError(-32051, 'Catalog selection changed');
      return {
        graph: 'connected',
        generation,
        catalog: this.catalog,
        snapshot: response.result as SnapshotInfo,
      };
    } catch (error) {
      return {
        graph: 'unavailable',
        generation: this.generation,
        catalog: this.catalog,
        message: (error as Error).message,
      };
    }
  }
  private async stopRuntime() {
    this.client?.close();
    this.client = undefined;
    this.activeId = undefined;
    const child = this.child;
    this.child = undefined;
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
      child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), 2000);
      try {
        await exited;
      } finally {
        clearTimeout(timer);
      }
    }
    const directory = this.directory;
    this.directory = undefined;
    if (directory) await rm(directory, { recursive: true, force: true });
  }
  async close() {
    this.closed = true;
    this.epoch = randomUUID();
    this.client?.close();
    await this.queue;
    await this.stopRuntime();
  }
}
