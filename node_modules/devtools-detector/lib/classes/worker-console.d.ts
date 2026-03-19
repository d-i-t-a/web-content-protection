export type WorkerConsoleMethod<Args extends any[]> = (...args: Args) => Promise<{
    time: number;
}>;
export declare class WorkerConsole {
    static workerScript: string;
    private readonly worker;
    private callbacks;
    readonly log: WorkerConsoleMethod<Parameters<Console['log']>>;
    readonly table: WorkerConsoleMethod<Parameters<Console['table']>>;
    readonly clear: WorkerConsoleMethod<Parameters<Console['clear']>>;
    constructor(worker: Worker);
    private send;
}
