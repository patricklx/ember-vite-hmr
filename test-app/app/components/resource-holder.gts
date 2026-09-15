import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { on } from '@ember/modifier';
import { resource } from 'ember-resources';

// A resource-backed field intentionally never dereferenced by the template,
// mirroring reactiveweb's `trackedTask` used purely for its side effects
// (e.g. an ember-concurrency task tied to component lifecycle, not rendered
// via `.value`). Its `resource()` proxy lazily creates its underlying
// helper cache on first property read - see issue #557.
//
// `count` exists to verify the fix for that crash doesn't regress ordinary
// HMR state transfer (getState() carrying tracked state over to the next
// swapped instance) as a side effect.
export default class ResourceHolder extends Component {
  @tracked count = 0;

  backgroundTask = resource(this, () => {
    return { ran: true };
  });

  @action
  increment() {
    this.count++;
  }

  <template>
    <p class="resource-holder">resource holder</p>
    <p class="resource-holder-count">{{this.count}}</p>
    <button type="button" class="resource-holder-increment" {{on "click" this.increment}}>+</button>
  </template>
}
