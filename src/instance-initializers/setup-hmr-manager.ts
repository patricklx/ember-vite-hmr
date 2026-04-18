import Route from '@ember/routing/route';
import Service from '@ember/service';
import Component from '@glimmer/component';
import { getInternalComponentManager } from '@glimmer/manager';

interface HotComponent extends Component<{ __hot__?: unknown }> {
  __get_hot_state__?: () => Record<string, unknown>;
  [key: string]: unknown;
}

type Mutable<T> = {
  -readonly [P in keyof T]: unknown;
};

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
    
    if (entry) {
      if (
        entry.writable &&
        !Object.prototype.toString.call(entry.value).includes('Function')
      ) {
        state[key] = component[key as keyof Component];
      }
      if (entry.set) {
        state[key] = component[key as keyof Component];
      }
    }
  }
  return state;
}

function syncState(instance: Mutable<HotComponent>) {
  const args = instance.args as { __hot__?: { getState?: () => Record<string, unknown> } };
  if (args.__hot__) {
    const state =
      (instance.__get_hot_state__ as (() => Record<string, unknown>) | undefined)?.() || args.__hot__.getState?.();
    for (const k in state) {
      if (instance[k as keyof HotComponent] instanceof Service) {
        continue;
      }
      instance[k as keyof HotComponent] = state[k];
    }
    args.__hot__.getState = () => getState(instance as HotComponent, ['args']);
  }
}

export function initialize() {
  const ComponentManager = getInternalComponentManager(Component);
  const proto = Object.getPrototypeOf(ComponentManager);
  const create = proto.create;
  proto.create = function (...args: unknown[]) {
    const instance = create.call(this, ...args);
    syncState(instance.component);
    return instance;
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
    const controllerState = getState(state.controller as HotComponent, skip);
    for (const k in routerState) {
      (this as unknown as Record<string, unknown>)[k] = routerState[k];
    }
    for (const k in controllerState) {
      (controller as Record<string, unknown>)[k] = controllerState[k];
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
