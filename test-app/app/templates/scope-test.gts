import { tracked } from '@glimmer/tracking';
import Component from '@glimmer/component';
import { helper } from '@ember/component/helper';

// ── tracked registry ────────────────────────────────────────────────────────
class Entry {
  @tracked current;
  constructor(value: unknown) { this.current = value; }
}
const registry = new Entry(null as unknown);

// ── two versions of the inner component ─────────────────────────────────────
class V1 extends Component {
  <template><span class="inner-label">v1</span></template>
}
class V2 extends Component {
  <template><span class="inner-label">v2</span></template>
}

// ── helpers ──────────────────────────────────────────────────────────────────
let idCounter = 0;
const getId = helper(() => ++idCounter);           // increments on every call
const getCurrent = helper(() => registry.current); // reads the tracked cell

// ── route controller/template ────────────────────────────────────────────────
export default class ScopeTestRoute extends Component {
  constructor(owner: unknown, args: object) {
    super(owner, args);
    registry.current = V1;
  }

  swap = () => { registry.current = V2; };

  <template>
    <div class="scope-test">
      {{! Test A: {{#let}} wrapper around the component invocation.
          getId runs once per let-block enter. Does the outer let survive? }}
      {{#let (getId) as |id|}}
        <span class="outer-id">{{id}}</span>
        {{#let (getCurrent) as |Comp|}}
          <Comp />
        {{/let}}
      {{/let}}

      <button class="swap-btn" {{on "click" this.swap}}>Swap to V2</button>
    </div>
  </template>
}
