import Service from '@ember/service';
import RouterService from '@ember/routing/router-service';
export default class ViteHotReloadService extends Service {
  container: any;
  router: RouterService;
  init(): void;
  getLatestChange(obj: any): any;
}
declare module '@ember/service' {
  interface Registry {
    'hot-reload': ViteHotReloadService;
  }
}
//# sourceMappingURL=vite-hot-reload.d.ts.map
