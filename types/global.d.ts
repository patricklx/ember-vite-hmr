declare module 'thread-loader' {
  export function warmup(options: any, loaders: string[]): void;
}

declare module '*.hbs';

type ReqJSEntry = {
  module: Module
}

type Module = {
  id: string;
  exports: any;
  version: number;
};

interface Window {
  emberHotReloadPlugin: {
    subscribers: any;
    loadNew(old: any, _new: any): unknown;
    version: number;
    changed: Record<string, any>;
    notifyNew(): unknown;
    register: any;
    canAcceptNew: any;
    clear(module: Module): unknown;
    __import(moduleUrl: string): unknown;
    _accepting: number;
    moduleDepCallbacks: Record<string, Record<string, Function[]>>;
    versionMap: Record<string, number>;
    subscribe(cb: (newModule: Module, oldModule: Module) => void): void;
    unsubscribe(cb: (newModule: Module, oldModule: Module) => void): void;
  };
}
interface ImportMeta {
  hot?: {
    accept(): void;
    on(status: string, cb: (options: any) => void): void;
  };
}

declare const requirejs: any;
