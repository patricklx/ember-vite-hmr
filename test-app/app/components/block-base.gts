import Component from '@glimmer/component';

export default class BlockBase extends Component {
  <template>
    <div class="block-base-default">{{yield}}</div>
    <div class="block-base-footer">{{yield to="footer"}}</div>
  </template>
}
