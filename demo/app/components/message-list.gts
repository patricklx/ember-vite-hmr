import Component from '@glimmer/component';
import MessageBubble from 'ember-vite-hmr-chat-demo/components/message-bubble';
import type { ChatMessage } from 'ember-vite-hmr-chat-demo/services/chat';

interface Signature {
  Args: { messages: ChatMessage[] };
}

export default class MessageList extends Component<Signature> {
  <template>
    <ul class="message-list" ...attributes>
      {{#each @messages key="id" as |message|}}
        <li><MessageBubble @message={{message}} /></li>
      {{/each}}
    </ul>
  </template>
}
