# demo

A small, fully-mocked AI-chat app — modeled after
[carbon-ai-chat's `demo/`](https://github.com/carbon-design-system/carbon-ai-chat/tree/main/demo)
— used to show `ember-vite-hmr` hot-reloading a realistic, stateful chat UI.

There's no model or network call behind it: `app/services/chat.ts` owns a
`@tracked` message list and fakes a streaming assistant reply locally (canned
text, streamed word-by-word on a timer). That gives it exactly the kind of
state HMR needs to survive across an edit — a growing tracked array, an
in-flight async response — without needing an API key or a backend.

## Run it

```sh
pnpm install     # one-time, from the repo root
cd demo
pnpm start
```

Visit [http://localhost:4200](http://localhost:4200).

## Things to try

With the dev server running, send a message so a reply starts streaming, then
edit one of these while it's still typing out:

- `app/components/message-bubble.gts` — change the bubble markup or styling.
- `app/services/chat.ts` — tweak `MOCK_REPLIES` or the typing delay.
- `app/components/composer.gts` — change the input/button.

The conversation history and the in-progress reply should survive the hot
swap instead of resetting.

## Build

```sh
pnpm build
```
