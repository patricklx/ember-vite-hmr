import Service, { service } from '@ember/service';
import { getOwner } from '@ember/owner';
import RouterService from '@ember/routing/router-service';
import Router from '@ember/routing/route';
import Controller from '@ember/controller';
import ApplicationInstance from '@ember/application/instance';

const ChangeMap = new WeakMap();

function getLatestChange(obj: any) {
  while (ChangeMap.has(obj)) {
    obj = ChangeMap.get(obj);
  }
  return obj;
}

export default class ViteHotReloadService extends Service {
  declare container: any;
  @service() router!: RouterService;

  init(args: any) {
    super.init(args);
    if (!window.emberHotReloadPlugin) return;
    const app = (getOwner(this) as ApplicationInstance)!.application as any;
    window.emberHotReloadPlugin.Resolver = app.Resolver;
    window.emberHotReloadPlugin.modulePrefix = app.modulePrefix;
    window.emberHotReloadPlugin.podModulePrefix = app.podModulePrefix;
    this.router._router;
    Object.defineProperty(this.router._router, '_routerMicrolib', {
      set(v) {
        const getRoute = v.getRoute;
        v.getRoute = function (name: string) {
          const route = getRoute.call(
            this,
            `${name}--hot-version--${window.emberHotReloadPlugin.routerVersion}`,
          );
          route.fullRouteName = `${name}`.replace(
            /--hot-version--.*$/,
            '',
          );
          return route;
        };
        this.___routerMicrolib = v;
      },
      get() {
        return this.___routerMicrolib;
      },
    });
    this.container = (getOwner(this) as any)?.__container__;
    window.emberHotReloadPlugin.subscribe((oldModule, newModule) => {
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
        oldModule.id.startsWith('app/templates/') &&
        !oldModule.id.startsWith('app/templates/components/')
      ) {
        changed = true;
      }
      if (oldModule.id.startsWith(`./${window.emberHotReloadPlugin.podModulePrefix}/`)) {
        changed = true;
      }
      if (!changed) return;
      window.emberHotReloadPlugin.routerVersion += 1;
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
      Object.keys(this.container.factoryManagerCache).forEach((k) => {
        if (types.some((t) => k.startsWith(`${t}:`))) {
          delete this.container.factoryManagerCache[k];
        }
      });
      Object.keys(this.container.registry._resolveCache).forEach((k) => {
        if (types.some((t) => k.startsWith(`${t}:`))) {
          delete this.container.registry._resolveCache[k];
        }
      });
      Object.keys(this.container.validationCache).forEach((k) => {
        if (types.some((t) => k.startsWith(`${t}:`))) {
          delete this.container.validationCache[k];
        }
      });
      Object.keys(this.container.registry.registrations).forEach((k) => {
        if (types.some((t) => k.startsWith(`${t}:`))) {
          delete this.container.registry.registrations[k];
        }
      });
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
      if (oldModule.id.startsWith(`./${window.emberHotReloadPlugin.podModulePrefix}/`)) {
        this.router.refresh();
      }
    });
  }
  getLatestChange(obj: any) {
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
