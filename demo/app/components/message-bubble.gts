import Component from '@glimmer/component';
import type { ChatMessage } from 'ember-vite-hmr-chat-demo/services/chat';

interface Signature {
  Args: { message: ChatMessage };
}

export default class MessageBubble extends Component<Signature> {
  get roleLabel() {
    return this.args.message.role === 'user' ? 'You' : 'Assistant';
  }

  <template>
    <div class="message message--{{@message.role}}">
      <span class="message__role">{{this.roleLabel}}</span>
      <p class="message__text">
        {{@message.text}}{{#if @message.pending}}<span
            class="message__cursor"
          >▍</span>{{/if}}
      </p>
    </div>
  </template>
}
