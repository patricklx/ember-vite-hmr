import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { on } from '@ember/modifier';

// Simpler counter component used exclusively by the multi-instance syncState
// test. Separate from ResourceHolder so the resource-teardown tests keep a
// clean single-instance environment.
export default class MultiCounter extends Component {
  @tracked count = 0;

  @action
  increment() {
    this.count++;
  }

  <template>
    <p class="multi-counter">label: counter</p>
    <p class="multi-counter-count">{{this.count}}</p>
    <button type="button" class="multi-counter-increment" {{on "click" this.increment}}>+</button>
  </template>
}
