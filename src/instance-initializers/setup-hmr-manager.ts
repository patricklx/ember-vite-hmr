import Route from '@ember/routing/route';
import Controller from '@ember/controller';
import Component from '@glimmer/component';
// @ts-ignore
import { getInternalComponentManager } from '@glimmer/manager';

// vite dep optimizer is currently broken and cannot optimize new deps, need to include this ones from start
import { tracked } from '@glimmer/tracking';
// @ts-ignore
import { createComputeRef } from '@glimmer/reference';
// @ts-ignore
import { curry } from '@glimmer/runtime';

(function () {
  let run = false;
  if (run) {
    console.log(tracked, createComputeRef, curry);
  }
})();

interface HotComponent extends Component<{ __hot__?: any }> {
  __get_hot_state__?: () => Record<string, any>;
}

type Mutable<T> = {
  -readonly [P in keyof T]: any;
};

function findPropertyDescriptor(component: Object, key: string) {
  let proto = component;
  while (proto) {
    const desc = Object.getOwnPropertyDescriptor(proto, key);
    if (desc) return desc;
    proto = Object.getPrototypeOf(proto);
  }
}

function getState(component: HotComponent, skip: string[]) {
  const state: Record<string, any> = {};
  if (!component) {
    return state;
  }
  for (const key in component) {
    if (skip.includes(key)) continue;
    const entry = findPropertyDescriptor(component, key);
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
  if (instance.args.__hot__) {
    const state =
      instance.__get_hot_state__?.() || instance.args.__hot__.getState?.();
    for (const k in state) {
      instance[k as keyof HotComponent] = state[k];
    }
    instance.args.__hot__.getState = () => getState(instance, ['args']);
  }
}

export function initialize() {
  const ComponentManager = getInternalComponentManager(Component);
  const proto = Object.getPrototypeOf(ComponentManager);
  const create = proto.create;
  proto.create = function (...args: any[]) {
    const instance = create.call(this, ...args);
    syncState(instance.component);
    return instance;
  };

  const setupController = Route.prototype.setupController;

  const StateCache: Record<string, any> = {};

  Route.prototype.setupController = function (...args: any[]) {
    const controller = args[0];
    // @ts-ignore
    const r = setupController.call(this, ...args);
    const fullRouteName = this.fullRouteName;
    const state = StateCache[fullRouteName] || {};
    const skip = ['_qpDelegate', 'target', 'queryParams'];
    const routerState = getState(state.router, skip);
    const controllerState = getState(state.controller, skip);
    for (const k in routerState) {
      (this as any)[k] = routerState[k];
    }
    for (const k in controllerState) {
      controller[k] = controllerState[k];
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
