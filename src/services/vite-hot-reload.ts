import Service, { service } from '@ember/service';
import { getOwner } from '@ember/owner';
import RouterService from '@ember/routing/router-service';
import Router from '@ember/routing/route';
import Controller from '@ember/controller';
import ApplicationInstance from '@ember/application/instance';

const ChangeMap = new WeakMap<object, unknown>();

function getLatestChange(obj: unknown) {
  while (obj && typeof obj === 'object' && ChangeMap.has(obj)) {
    obj = ChangeMap.get(obj);
  }
  return obj;
}

export default class ViteHotReloadService extends Service {
  declare container: {
    cache: Record<string, unknown>;
    factoryManagerCache: Record<string, unknown>;
    registry: {
      _resolveCache: Record<string, unknown>;
      registrations: Record<string, unknown>;
    };
    validationCache: Record<string, unknown>;
  };
  @service() router!: RouterService;

  init(args?: object) {
    super.init(args);
    if (!globalThis.emberHotReloadPlugin) return;
    const app = (getOwner(this) as ApplicationInstance)!.application as unknown as {
      Resolver: unknown;
      modulePrefix: string;
      podModulePrefix: string;
    };
    globalThis.emberHotReloadPlugin.Resolver = app.Resolver;
    globalThis.emberHotReloadPlugin.modulePrefix = app.modulePrefix;
    globalThis.emberHotReloadPlugin.podModulePrefix = app.podModulePrefix;
    // Ensure router is initialized
    void this.router._router;
    Object.defineProperty(this.router._router, '_routerMicrolib', {
      set(v) {
        const getRoute = v.getRoute;
        v.getRoute = function (name: string) {
          const route = getRoute.call(
            this,
            `${name}--hot-version--${globalThis.emberHotReloadPlugin.routerVersion}`,
          );
          route.fullRouteName = `${name}`.replace(/--hot-version--.*$/, '');
          return route;
        };
        this.___routerMicrolib = v;
      },
      get() {
        return this.___routerMicrolib;
      },
    });
    const owner = getOwner(this) as unknown as { __container__: ViteHotReloadService['container'] };
    this.container = owner?.__container__;
    globalThis.emberHotReloadPlugin.subscribe(
      (
        oldModule: {
          exports: { default?: { prototype?: unknown } };
          id: string;
        },
        _newModule: unknown,
      ) => {
        let changed = false;
        if (
          oldModule.exports.default?.prototype &&
          oldModule.exports.default.prototype instanceof Router
        ) {
          changed = true;
        }
        if (
          oldModule.exports.default?.prototype &&
          oldModule.exports.default.prototype instanceof Controller
        ) {
          changed = true;
        }
        if (
          oldModule.exports.default?.prototype &&
          oldModule.exports.default.prototype instanceof Service
        ) {
          changed = true;
        }
        if (
          oldModule.id.startsWith('app/templates/') &&
          !oldModule.id.startsWith('app/templates/components/')
        ) {
          changed = true;
        }
        if (
          oldModule.id.startsWith(
            `./${globalThis.emberHotReloadPlugin.podModulePrefix}/`,
          )
        ) {
          changed = true;
        }
        if (!changed) return;
        globalThis.emberHotReloadPlugin.routerVersion += 1;
        const types = [
          'route',
          'controller',
          'template',
          'modifier',
          'helper',
          'component',
        ];
        Object.keys(this.container.cache).forEach((k) => {
          if (types.some((t) => k.startsWith(`${t}:`))) {
            delete this.container.cache[k];
          }
        });
        Object.keys(this.container.factoryManagerCache || {}).forEach((k) => {
          if (types.some((t) => k.startsWith(`${t}:`))) {
            delete this.container.factoryManagerCache[k];
          }
        });
        Object.keys(this.container.registry._resolveCache || {}).forEach(
          (k) => {
            if (types.some((t) => k.startsWith(`${t}:`))) {
              delete this.container.registry._resolveCache[k];
            }
          },
        );
        Object.keys(this.container.validationCache || {}).forEach((k) => {
          if (types.some((t) => k.startsWith(`${t}:`))) {
            delete this.container.validationCache[k];
          }
        });
        Object.keys(this.container.registry.registrations || {}).forEach(
          (k) => {
            if (types.some((t) => k.startsWith(`${t}:`))) {
              delete this.container.registry.registrations[k];
            }
          },
        );
        if (
          oldModule.exports.default?.prototype &&
          oldModule.exports.default.prototype instanceof Router
        ) {
          this.router.refresh();
        }
        if (
          oldModule.exports.default?.prototype &&
          oldModule.exports.default.prototype instanceof Controller
        ) {
          this.router.refresh();
        }
        if (
          oldModule.id.startsWith('app/templates/') &&
          !oldModule.id.startsWith('app/templates/components/')
        ) {
          this.router.refresh();
        }
        if (
          oldModule.id.startsWith(
            `./${globalThis.emberHotReloadPlugin.podModulePrefix}/`,
          )
        ) {
          this.router.refresh();
        }
      },
    );
  }
  getLatestChange(obj: unknown) {
    return getLatestChange(obj);
  }
}

// Don't remove this declaration: this is what enables TypeScript to resolve
// this service using `Owner.lookup('service:hot-reload')`, as well
// as to check when you pass the service name as an argument to the decorator,
// like `@service('hot-reload') declare altName: HotReloadService;`.
declare module '@ember/service' {
  interface Registry {
    'hot-reload': ViteHotReloadService;
  }
}
