import Route from '@ember/routing/route';
import Service from '@ember/service';
import Component from '@glimmer/component';
import { getInternalComponentManager } from '@glimmer/manager';

interface HotComponent extends Component {
  __get_hot_state__?: () => Record<string, unknown>;
  _hmrAccepted?: (oldInstance?: HotComponent) => void;
  [key: string]: unknown;
}

type Mutable<T> = {
  -readonly [P in keyof T]: unknown;
};

// Accessor for the HMR runtime helpers exposed on the global by
// virtual:ember-vite-hmr-runtime. Only set in dev/serve mode (guarded by
// `if (!import.meta.hot)` at the call site).
interface HmrRuntime {
  current: (value: unknown) => unknown;
  isHmrClass: (value: unknown) => boolean;
  enqueueInstance: (klass: unknown, instance: HotComponent) => void;
  dequeueInstance: (klass: unknown) => HotComponent | null;
}

function hmrRuntime(): HmrRuntime | undefined {
  return (globalThis as unknown as { __ember_vite_hmr?: HmrRuntime }).__ember_vite_hmr;
}

function findPropertyDescriptor(
  component: HotComponent | Record<string, unknown>,
  key: string,
) {
  let proto = component;
  while (proto) {
    const desc = Object.getOwnPropertyDescriptor(proto, key);
    if (desc) return desc;
    proto = Object.getPrototypeOf(proto);
  }
}

// The private property key `ember-resources`' `wrapForPlainUsage()` uses on
// the plain object it wraps in a Proxy for `resource()` (which reactiveweb's
// `trackedTask` uses internally) - see
// https://github.com/NullVoxPopuli/ember-resources/blob/main/ember-resources/src/plain/index.ts.
// Carrying such a proxy's *reference* over onto a new HMR-swapped instance
// (instead of leaving the new instance's own, correctly-parented resource in
// place) is unsafe: the proxy's underlying helper cache is lazily created on
// first property read and permanently bound, at that point, to whichever
// component instance was passed as `context` when `resource()` was called -
// for a carried-over proxy that's always the *old*, already-destroyed
// instance, so the first read after the swap throws "Attempted to associate
// a destroyable child with an object that is already destroying or
// destroyed" - see issue #563.
//
// `in` is used (rather than reading a property, or `Object.keys`/
// `Object.prototype.toString.call`) because it's the one reflective
// operation `wrapForPlainUsage`'s Proxy doesn't trap (no `has` handler), so
// it forwards to a plain `[[HasProperty]]` on the underlying target without
// ever invoking the lazy getter - it can't accidentally trigger the same
// crash it's checking for. If `ember-resources` ever renames this key, this
// check simply stops matching and behavior falls back to today's (already
// broken, pre-existing) state - it does not introduce a new failure mode.
const RESOURCE_INTERMEDIATE_VALUE_KEY = '__Intermediate_Value__';

function isUnsafeToCarryOver(value: unknown): boolean {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    RESOURCE_INTERMEDIATE_VALUE_KEY in value
  );
}

function getState(component: HotComponent, skip: string[]) {
  const state: Record<string, unknown> = {};
  if (!component) {
    return state;
  }
  for (const key in component) {
    if (skip.includes(key)) continue;
    const entry = findPropertyDescriptor(component, key);
    const value = component[key as keyof Component];
    
    // Skip Service instances - they should not be synced
    if (value instanceof Service) {
      continue;
    }
    
    // Skip Function properties - they should not be synced
    if (typeof value === 'function') {
      continue;
    }

    // Skip resource()-backed proxies - see isUnsafeToCarryOver above.
    if (isUnsafeToCarryOver(value)) {
      continue;
    }

    if (entry) {
      // Note: don't probe `entry.value` any further here (e.g. via
      // `Object.prototype.toString.call`) to decide whether it's a plain
      // function - the `typeof value === 'function'` check above already
      // covers that, and a stricter check on `entry.value` (which may be a
      // resource proxy, e.g. reactiveweb's `trackedTask`) can trigger that
      // proxy's `get` trap on first touch, lazily invoking a helper against
      // this component instance - see issue #557.
      if (entry.writable) {
        state[key] = value;
      }
      if (entry.set) {
        state[key] = value;
      }
    }
  }
  return state;
}

// Apply a stashed old-instance state to a freshly created new instance.
// Also calls the _hmrAccepted lifecycle hook if defined on the new instance.
function applySyncState(
  instance: Mutable<HotComponent>,
  state: Record<string, unknown>,
  oldInstance: HotComponent | undefined,
) {
  for (const k in state) {
    if (instance[k as keyof HotComponent] instanceof Service) {
      continue;
    }
    instance[k as keyof HotComponent] = state[k];
  }
  if (typeof instance._hmrAccepted === 'function') {
    instance._hmrAccepted(oldInstance);
  }
}

export function initialize() {
  // HMR-only: in a production build `import.meta.hot` is undefined, so this
  // (and the manager/route monkey-patches below) is dead-code-eliminated.
  if (!import.meta.hot) return;

  const ComponentManager = getInternalComponentManager(Component);
  const proto = Object.getPrototypeOf(ComponentManager);
  const create = proto.create;
  proto.create = function (...args: unknown[]) {
    const bucket = create.call(this, ...args);
    const component = bucket.component as HotComponent;

    // Enqueue this instance in the runtime's per-class FIFO queue. The runtime
    // only enqueues when isHmrClass(klass) is true (registered HMR class), and
    // clears the queue at update() time so user-flow stale entries are never
    // present when willDestroy fires during an HMR swap.
    const klass = component.constructor as object;
    const rt = hmrRuntime();
    if (rt?.isHmrClass(klass)) {
      rt.enqueueInstance(klass, component);
    }

    return bucket;
  };

  // Patch willDestroy on the Component prototype to detect HMR swaps and
  // transfer state from the old instance to the freshly-created new one.
  //
  // Why willDestroy instead of registerDestructor: Glimmer creates the NEW
  // component instance BEFORE calling willDestroy on the OLD one (willDestroy
  // is scheduled in Ember's "actions" runloop queue, which runs after
  // rendering). This ordering is exactly what we need: by willDestroy time,
  // the new instance is already live in liveInstances.
  const origWillDestroy = Component.prototype.willDestroy;
  Component.prototype.willDestroy = function (this: HotComponent) {
    const rt = hmrRuntime();
    if (rt) {
      const klass = this.constructor as object;
      const newClass = rt.current(klass);
      if (newClass !== klass) {
        // The class was swapped via HMR — dequeue the next new instance for
        // the replacement class (FIFO matches DOM/creation order) and
        // schedule a state transfer onto it.
        const newInstance = rt.dequeueInstance(newClass);
        if (newInstance) {
          const state = getState(this, ['args']);
          const oldInstance = this;
          setTimeout(() => applySyncState(newInstance as Mutable<HotComponent>, state, oldInstance));
        }
      }
    }
    return origWillDestroy?.call(this);
  };

  const setupController = Route.prototype.setupController;

  const StateCache: Record<string, unknown> = {};

  Route.prototype.setupController = function (...args: Parameters<typeof setupController>) {
    const controller = args[0] as unknown as Record<string, unknown>;
    const r = setupController.call(this, ...args);
    const fullRouteName = this.fullRouteName;
    const state = StateCache[fullRouteName] as { router?: Record<string, unknown>; controller?: Record<string, unknown> } || {};
    const skip = ['_qpDelegate', 'target', 'queryParams'];
    const routerState = getState(state.router as HotComponent, skip);
    for (const k in routerState) {
      (this as unknown as Record<string, unknown>)[k] = routerState[k];
    }
    // Only re-apply controller state onto a *new* instance (an HMR swap). On
    // ordinary navigation it is the same singleton, and re-applying a
    // non-`@tracked` query param onto itself trips Ember's mandatory setter.
    if (state.controller && state.controller !== controller) {
      const controllerState = getState(state.controller as HotComponent, skip);
      for (const k in controllerState) {
        (controller as Record<string, unknown>)[k] = controllerState[k];
      }
    }
    StateCache[fullRouteName] = {
      route: this,
      controller,
    };
    return r;
  };
}

export default {
  initialize,
};
