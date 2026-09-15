import Component from '@glimmer/component';
import { resource } from 'ember-resources';

// A resource-backed field intentionally never dereferenced by the template,
// mirroring reactiveweb's `trackedTask` used purely for its side effects
// (e.g. an ember-concurrency task tied to component lifecycle, not rendered
// via `.value`). Its `resource()` proxy lazily creates its underlying
// helper cache on first property read - see issue #557.
export default class ResourceHolder extends Component {
  backgroundTask = resource(this, () => {
    return { ran: true };
  });

  <template>
    <p class="resource-holder">resource holder</p>
  </template>
}
