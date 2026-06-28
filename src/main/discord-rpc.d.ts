declare module 'discord-rpc' {
  export class Client {
    constructor(options?: { transport?: string })
    on(event: string, listener: (...args: any[]) => void): this
    login(options?: { clientId?: string; scopes?: string[] }): Promise<this>
    setActivity(args: Record<string, unknown>): Promise<unknown>
    destroy(): void
  }
}
