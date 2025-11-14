if (import.meta.hot) {
    const ModuleMap = new Map();

    window.emberHotReloadPlugin = {
        modulePrefix: '',
        podModulePrefix: '',
        Resolver: null,
        _accepting: 0,
        changed: {} as Record<string, any>,
        subscribers: [],
        version: 1,
        routerVersion: 1,
        moduleDepCallbacks: {},
        versionMap: {},

        clear(module: Module) {
            this.moduleDepCallbacks[module.id] = {};
        },
        register(module: Module, dep: string, callback: Function) {
            dep = dep.replace(new RegExp(`^${window.emberHotReloadPlugin.modulePrefix}/`), './');
            this.moduleDepCallbacks[module.id]![dep] =
                this.moduleDepCallbacks[module.id]![dep] || ([] as Function[]);
            this.moduleDepCallbacks[module.id]![dep]!.push(callback);
        },
        loadNew(oldModule: Module, newModule: Module) {
            ModuleMap.set(newModule.id, newModule);
            this.versionMap[newModule.id] = newModule.version;
            const entry = Object.entries(
                this.Resolver.explicitModules as Record<string, any>,
            ).find(([name, module]) => module.default === oldModule.exports.default);
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
                id: moduleUrl.split('?')[0]!.replace(/http:\/\/.*:[^\/]*\//, ''),
                version: 0,
            };
            this._accepting -= 1;
            if (this._accepting === 0) {
                setTimeout(() => this.notifyNew(), 0);
            }
            let ok =
                module.id.includes('/routes/') ||
                module.id.includes('/routers/') ||
                module.id.includes('/controllers/') ||
                module.id.includes('/templates/') ||
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
            Object.values(this.changed).forEach((change) => {
                this.loadNew(change.old, change.new);
                this.subscribers.forEach((fn: any) => fn(change.old, change.new));
            });
            this.changed = {};
        },
        subscribe(fn) {
            this.subscribers.push(fn);
        },
        unsubscribe(fn) {
            const idx = this.subscribers.indexOf(fn);
            if (idx >= 0) {
                this.subscribers.splice(idx, 1);
            }
        },
    };
}