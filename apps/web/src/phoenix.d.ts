/**
 * phoenix.d.ts — minimal ambient types for the `phoenix` npm package (v1.x).
 * The package ships no .d.ts files; we declare only what useSensorChannel.ts uses.
 * Called by: src/hooks/useSensorChannel.ts
 */

declare module "phoenix" {
  export interface SocketOptions {
    params?: Record<string, unknown>;
    timeout?: number;
    transport?: unknown;
    logger?: (kind: string, msg: string, data: unknown) => void;
  }

  export type ChannelState = "closed" | "errored" | "joined" | "joining" | "leaving";

  export interface Push {
    receive(status: string, callback: (response: unknown) => void): Push;
  }

  export interface Channel {
    join(timeout?: number): Push;
    leave(timeout?: number): Push;
    on(event: string, callback: (payload: unknown) => void): number;
    off(event: string, ref?: number): void;
    state: ChannelState;
  }

  export class Socket {
    constructor(endPoint: string, opts?: SocketOptions);
    connect(): void;
    disconnect(callback?: () => void, code?: number, reason?: string): void;
    channel(topic: string, chanParams?: Record<string, unknown>): Channel;
    isConnected(): boolean;
    onOpen(callback: () => void): void;
    onClose(callback: () => void): void;
    onError(callback: (error: unknown) => void): void;
  }
}
