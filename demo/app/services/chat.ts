import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  pending: boolean;
}

const MOCK_REPLIES = [
  "Sure — here's a quick summary of what I found. This is a canned reply, streamed word by word, no network calls involved.",
  "Good question. Since this demo has no real model behind it, I can only recite one of a handful of scripted answers.",
  "I don't have live data here, but this is exactly the kind of streaming, tracked message list that's worth exercising HMR against.",
  "Try editing message-bubble.gts or chat.ts while a reply is streaming — the conversation should survive the hot swap.",
];

let nextId = 0;

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// A mocked AI-chat service: owns the conversation's tracked message list and
// fakes a streaming assistant reply. Modeled after carbon-ai-chat's demo/,
// but with the network/model layer replaced by a local, canned responder so
// the demo has no external dependencies and runs entirely offline.
export default class ChatService extends Service {
  @tracked messages: ChatMessage[] = [
    {
      id: nextId++,
      role: 'assistant',
      text: "Hi! I'm a mocked assistant for the ember-vite-hmr demo. Ask me anything — replies are scripted and streamed locally.",
      pending: false,
    },
  ];

  @tracked isResponding = false;

  send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || this.isResponding) {
      return;
    }

    this.messages = [
      ...this.messages,
      { id: nextId++, role: 'user', text: trimmed, pending: false },
    ];

    await this.respond();
  };

  private async respond() {
    this.isResponding = true;

    const reply =
      MOCK_REPLIES[Math.floor(Math.random() * MOCK_REPLIES.length)]!;
    const words = reply.split(' ');
    const id = nextId++;
    let text = '';

    for (const word of words) {
      await wait(40);
      text = text ? `${text} ${word}` : word;
      this.replaceMessage({ id, role: 'assistant', text, pending: true });
    }

    this.replaceMessage({ id, role: 'assistant', text, pending: false });
    this.isResponding = false;
  }

  private replaceMessage(message: ChatMessage) {
    this.messages = [
      ...this.messages.filter((existing) => existing.id !== message.id),
      message,
    ];
  }
}

declare module '@ember/service' {
  interface Registry {
    chat: ChatService;
  }
}
