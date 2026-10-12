import { createConnection, type Socket } from 'node:net';
import { randomUUID } from 'node:crypto';
import { GraphError, isRecord, validMethod, type GraphMethod, type Params, type RpcResponse } from '../shared/protocol.ts';

export interface GraphOptions { socketPath: string; timeoutMs?: number; maxResponseBytes?: number }
export class GraphClient {
  private socket?: Socket;
  private connecting?: Promise<Socket>;
  private connectionSocket?: Socket;
  private queue: Promise<unknown> = Promise.resolve();
  private pending?: { id: string; resolve: (value: RpcResponse) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
  private buffer = '';
  private closed = false;
  generation = randomUUID();
  constructor(private readonly options: GraphOptions) {}
  private disconnect(error: Error) {
    const socket = this.socket;
    this.socket = undefined; this.buffer = ''; this.generation = randomUUID();
    if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(error); this.pending = undefined; }
    socket?.destroy();
  }
  private connect(): Promise<Socket> {
    if (this.closed) return Promise.reject(new GraphError(-32050, 'Graph client is closed'));
    if (this.socket && !this.socket.destroyed) return Promise.resolve(this.socket);
    if (this.connecting) return this.connecting;
    this.connecting = new Promise<Socket>((resolve, reject) => {
      const socket = createConnection(this.options.socketPath);
      this.connectionSocket = socket;
      socket.setEncoding('utf8');
      const timer = setTimeout(() => { socket.destroy(); reject(new GraphError(-32050, 'Graph connection timed out')); }, this.options.timeoutMs ?? 15_000);
      const failConnect = (error: Error) => { clearTimeout(timer); reject(new GraphError(-32050, `Graph service unavailable: ${error.message}`)); };
      socket.once('error', failConnect);
      socket.once('close', () => { clearTimeout(timer); if (this.socket !== socket) reject(new GraphError(-32050, 'Graph connection closed')); });
      socket.once('connect', () => {
        if (this.closed) { socket.destroy(); reject(new GraphError(-32050, 'Graph client is closed')); return; }
        clearTimeout(timer); socket.removeListener('error', failConnect); this.socket = socket;
        this.generation = randomUUID();
        socket.on('data', chunk => this.receive(String(chunk)));
        socket.on('error', error => this.disconnect(new GraphError(-32050, `Graph connection failed: ${error.message}`)));
        socket.on('close', () => { if (this.socket === socket) this.disconnect(new GraphError(-32050, 'Graph service disconnected')); });
        resolve(socket);
      });
    }).finally(() => { this.connecting = undefined; });
    return this.connecting;
  }
  private receive(chunk: string) {
    this.buffer += chunk;
    if (Buffer.byteLength(this.buffer) > (this.options.maxResponseBytes ?? 32 * 1024 * 1024)) {
      this.disconnect(new GraphError(-32050, 'Graph response exceeds the adapter message limit')); return;
    }
    const end = this.buffer.indexOf('\n');
    if (end < 0) return;
    const line = this.buffer.slice(0, end); this.buffer = this.buffer.slice(end + 1);
    const pending = this.pending;
    if (!pending) { this.disconnect(new GraphError(-32050, 'Unexpected graph response')); return; }
    try {
      const value: unknown = JSON.parse(line);
      if (!isRecord(value) || value.jsonrpc !== '2.0' || value.id !== pending.id ||
          (Object.hasOwn(value, 'result') === Object.hasOwn(value, 'error'))) throw new Error('Invalid JSON-RPC response');
      if (Object.hasOwn(value, 'error') && (!isRecord(value.error) || typeof value.error.code !== 'number' || typeof value.error.message !== 'string')) throw new Error('Invalid JSON-RPC error');
      clearTimeout(pending.timer); this.pending = undefined; pending.resolve(value as unknown as RpcResponse);
    } catch (error) { this.disconnect(new GraphError(-32050, `Invalid graph response: ${(error as Error).message}`)); }
  }
  call(method: GraphMethod, params: Params = {}): Promise<RpcResponse> {
    if (!validMethod(method) || !isRecord(params)) return Promise.reject(new GraphError(-32602, 'Invalid graph method or params'));
    const execute = async (): Promise<RpcResponse> => {
      const socket = await this.connect();
      const id = randomUUID();
      const message = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
      if (Buffer.byteLength(message) > 1024 * 1024) throw new GraphError(-32602, 'Graph request exceeds 1 MiB');
      return new Promise<RpcResponse>((resolve, reject) => {
        const timer = setTimeout(() => this.disconnect(new GraphError(-32050, 'Graph request timed out')), this.options.timeoutMs ?? 15_000);
        this.pending = { id, resolve, reject, timer };
        socket.write(message);
      });
    };
    const result = this.queue.then(execute, execute);
    this.queue = result.catch(() => undefined);
    return result;
  }
  close() { this.closed = true; this.connectionSocket?.destroy(); this.disconnect(new GraphError(-32050, 'Graph client is closed')); }
}
