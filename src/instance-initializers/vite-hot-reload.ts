import ApplicationInstance from '@ember/application/instance';
import { debounce, next } from '@ember/runloop';
import RouterService from '@ember/routing/router-service';
import { Renderer } from '@ember/-internals/glimmer/lib/renderer';

function supportErrorRecovery(appInstance: ApplicationInstance) {
  const bodyHtml = window.document.body.cloneNode(true);
  const renderer = appInstance.__container__.lookup('renderer:-dom') as Renderer;
  const router = appInstance.__container__.lookup('service:router') as RouterService;
  const warn = console.warn;
  let scheduleRerender = false;
  async function rerender() {
    if (!scheduleRerender) return;
    scheduleRerender = false;
    const applicationRouter = appInstance.__container__.lookup('route:application') as any;
    applicationRouter._router._toplevelView.destroy();
    applicationRouter._router._toplevelView = null;
    renderer._clearAllRoots();
    window.document.body = bodyHtml.cloneNode(true) as any;
    next(() => {
      const transition = router.refresh();
      applicationRouter.setup(applicationRouter.context, transition);
    });
  }
  import.meta.hot?.on('vite:beforeUpdate', () => debounce(rerender, 100));
  console.warn =  function (...args) {
    if (args[0].includes('Attempted to rerender, but the Ember application has had an unrecoverable error occur during render. You should reload the application after fixing the cause of the error.')) {
      scheduleRerender = true;
    }
    warn.call(console, ...args);
  }
}

export function initialize(application: ApplicationInstance) {
  supportErrorRecovery(application);
}

export default {
  initialize,
};
