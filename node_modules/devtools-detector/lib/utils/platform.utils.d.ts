import { WorkerConsole } from '../classes/worker-console';
export declare function getGlobalThis(this: any): typeof globalThis;
export declare function createElement(...args: Parameters<(typeof document)['createElement']>): ReturnType<(typeof document)['createElement']>;
export declare function getWorkerConsole(): WorkerConsole | undefined;
declare global {
    interface Navigator {
        brave: any;
    }
}
export declare let isBrave: () => Promise<boolean>;
