import Service from '@ember/service';
import RouterService from '@ember/routing/router-service';
export default class ViteHotReloadService extends Service {
    container: {
        cache: Record<string, unknown>;
        factoryManagerCache: Record<string, unknown>;
        registry: {
            _resolveCache: Record<string, unknown>;
            registrations: Record<string, unknown>;
        };
        validationCache: Record<string, unknown>;
    };
    router: RouterService;
    init(args?: object): void;
    getLatestChange(obj: unknown): unknown;
}
declare module '@ember/service' {
    interface Registry {
        'hot-reload': ViteHotReloadService;
    }
}
