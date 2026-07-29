import type { Module } from '../types/global';

// Matches the app/addon-relative portion of a path once it reaches one of
// the directories ember-vite-hmr hot-reloads, e.g. the `app/templates/...`
// in `/Users/me/project/app/templates/application.hbs`.
const APP_RELATIVE_ID =
  /(?:^|\/)((?:app|addon)\/(?:routes?|routers|controllers|templates|services)\/.*)$/;

export function moduleIdFromUrl(moduleUrl: string) {
  let id = moduleUrl.split('?')[0]!;
  try {
    // covers http/https and URLs without an explicit port
    id = new URL(id).pathname;
  } catch {
    // not an absolute URL, keep as-is
  }
  // strip vite's `base` so ids are stable (`app/templates/...`) no matter
  // what base the app is served under
  const base = import.meta.env.BASE_URL || '/';
  if (base !== '/' && id.startsWith(base)) {
    id = id.slice(base.length);
  }
  id = id.replace(/^\//, '');
  // Outside of vite's own dev server (e.g. a Node ESM loader running the
  // app directly against on-disk `file://` URLs, with no server `base` to
  // strip) `id` is still the full OS path up to the project root instead
  // of a server-relative one. Re-anchor it to the nearest hot-reloadable
  // directory so consumers that key off ids like `app/templates/...`
  // (ViteHotReloadService's `startsWith('app/templates/')` check) keep
  // working no matter where the checkout lives on disk.
  const rooted = id.match(APP_RELATIVE_ID);
  if (rooted) {
    id = rooted[1]!;
  }
  return id;
}

if (import.meta.hot) {
  const ModuleMap = new Map();

  globalThis.emberHotReloadPlugin = {
    modulePrefix: '',
    podModulePrefix: '',
    Resolver: null,
    _accepting: 0,
    changed: {} as Record<string, { old: Module; new: Module }>,
    subscribers: [],
    version: 1,
    routerVersion: 1,
    moduleDepCallbacks: {},
    versionMap: {},

    clear(module: Module) {
      this.moduleDepCallbacks[module.id] = {};
    },
    register(module: Module, dep: string, callback: () => void) {
      dep = dep.replace(
        new RegExp(`^${globalThis.emberHotReloadPlugin.modulePrefix}/`),
        './',
      );
      this.moduleDepCallbacks[module.id]![dep] =
        this.moduleDepCallbacks[module.id]![dep] || ([] as (() => void)[]);
      this.moduleDepCallbacks[module.id]![dep]!.push(callback);
    },
    loadNew(oldModule: Module, newModule: Module) {
      ModuleMap.set(newModule.id, newModule);
      this.versionMap[newModule.id] = newModule.version;
      const entry = Object.entries(
        this.Resolver.explicitModules as Record<string, { default?: unknown }>,
      ).find(([_name, module]) => module.default === oldModule.exports.default);
      if (!entry) return;
      this.Resolver.explicitModules[entry[0]] = newModule.exports;
    },

    __import(moduleUrl: string) {
      return import(/* @vite-ignore */ moduleUrl);
    },

    async canAcceptNew(moduleUrl: string) {
      this._accepting += 1;
      const m = await this.__import(moduleUrl);
      const module: Module = {
        exports: m,
        id: moduleIdFromUrl(moduleUrl),
        version: 0,
      };
      this._accepting -= 1;
      if (this._accepting === 0) {
        globalThis.setTimeout(() => this.notifyNew(), 0);
      }
      let ok =
        module.id.includes('/routes/') ||
        module.id.includes('/routers/') ||
        module.id.includes('/controllers/') ||
        module.id.includes('/templates/') ||
        module.id.includes('/services/') ||
        module.id.match(/controller\.(js|ts)$/) ||
        module.id.match(/route\.(js|ts|gts)$/);
      if (!ok) {
        return false;
      }

      if (module.id.includes('templates') && module.id.includes('components')) {
        return false;
      }

      if (ModuleMap.get(module.id)) {
        this.changed[module.id] = {
          old: ModuleMap.get(module.id),
          new: module,
        };
      } else {
        ModuleMap.set(module.id, module);
      }
      module.version = this.version;
      return true;
    },
    notifyNew() {
      this.version += 1;
      (
        Object.values(this.changed) as Array<{ old: Module; new: Module }>
      ).forEach((change) => {
        this.loadNew(change.old, change.new);
        this.subscribers.forEach(
          (fn: (oldModule: Module, newModule: Module) => void) =>
            fn(change.old, change.new),
        );
      });
      this.changed = {};
    },
    subscribe(fn: (oldModule: Module, newModule: Module) => void) {
      this.subscribers.push(fn);
    },
    unsubscribe(fn: (oldModule: Module, newModule: Module) => void) {
      const idx = this.subscribers.indexOf(fn);
      if (idx >= 0) {
        this.subscribers.splice(idx, 1);
      }
    },
  };
}
