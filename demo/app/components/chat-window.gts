import Component from '@glimmer/component';
import { service } from '@ember/service';
import MessageList from 'ember-vite-hmr-chat-demo/components/message-list';
import Composer from 'ember-vite-hmr-chat-demo/components/composer';
import type ChatService from 'ember-vite-hmr-chat-demo/services/chat';

export default class ChatWindow extends Component {
  @service declare chat: ChatService;

  <template>
    <div class="chat-window">
      <header class="chat-header">
        <h1>ember-vite-hmr chat demo</h1>
        <p>
          A mocked AI chat UI, modeled after
          <a
            href="https://github.com/carbon-design-system/carbon-ai-chat/tree/main/demo"
            target="_blank"
            rel="noopener noreferrer"
          >carbon-ai-chat's demo</a>, used to exercise HMR against a
          service-backed, streamed message list. Edit
          <code>app/services/chat.ts</code>
          or
          <code>app/components/message-bubble.gts</code>
          while a reply is streaming and the conversation should survive the
          hot swap.
        </p>
      </header>

      <MessageList @messages={{this.chat.messages}} />

      <Composer
        @isResponding={{this.chat.isResponding}}
        @onSend={{this.chat.send}}
      />
    </div>
  </template>
}
