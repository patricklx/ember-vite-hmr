/// <reference types="../../types/global" />

import ApplicationInstance from '@ember/application/instance';
import { debounce, next } from '@ember/runloop';
import RouterService from '@ember/routing/router-service';
import { Renderer } from '@ember/-internals/glimmer/lib/renderer';

function patchResolver(application: ApplicationInstance) {
  application.__container__.lookup('service:vite-hot-reload');
  const resolver =
    (application.__registry__.resolver as { _fallback?: unknown })?._fallback ||
    (application.__registry__.fallback?.resolver as { _fallback?: unknown })
      ._fallback ||
    (application.__registry__.fallback?.resolver as unknown) ||
    application.__registry__.resolver;
  
  if (!resolver) return;
  
  const resolverWithResolve = resolver as { resolve: (name: string) => unknown };
  const resolverResolve = resolverWithResolve.resolve;
  resolverWithResolve.resolve = function (name: string) {
    name = name.replace(/--hot-version--.*$/, '');
    return resolverResolve.call(this, name);
  };
}

function supportErrorRecovery(appInstance: ApplicationInstance) {
  const bodyHtml = globalThis.document.body.cloneNode(true);
  const renderer = appInstance.__container__.lookup(
    'renderer:-dom',
  ) as Renderer;
  const router = appInstance.__container__.lookup(
    'service:router',
  ) as RouterService;
  const warn = globalThis.console.warn;
  let scheduleRerender = false;
  async function rerender() {
    if (!scheduleRerender) return;
    scheduleRerender = false;
    const applicationRouter = appInstance.__container__.lookup(
      'route:application',
    ) as {
      _router: { _toplevelView: { destroy: () => void } | null };
      context: unknown;
      setup: (context: unknown, transition: unknown) => void;
    };
    applicationRouter._router._toplevelView?.destroy();
    applicationRouter._router._toplevelView = null;
    (renderer as unknown as { _clearAllRoots: () => void })._clearAllRoots();
    globalThis.document.body = bodyHtml.cloneNode(true) as HTMLBodyElement;
    next(() => {
      const transition = router.refresh();
      applicationRouter.setup(applicationRouter.context, transition);
    });
  }
  if (import.meta.hot) {
    import.meta.hot.on('vite:beforeUpdate', () => debounce(rerender, 100));
  }
  globalThis.console.warn = function (...args) {
    if (
      args[0].includes(
        'Attempted to rerender, but the Ember application has had an unrecoverable error occur during render. You should reload the application after fixing the cause of the error.',
      )
    ) {
      scheduleRerender = true;
    }
    warn.call(globalThis.console, ...args);
  };
}

export function initialize(application: ApplicationInstance) {
  patchResolver(application);
  supportErrorRecovery(application);
}

export default {
  initialize,
};
