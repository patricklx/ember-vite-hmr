ember-vite-hmr

Ember Vite Hmr plugin.

this can hot reload

- helpers
- modifiers
- components + templates, fcct components and its deps
- routes/controllers/route-templates (although it refreshes the whole route and thus looses all state)

it cannot hot reload local properties that turn out to be helpers/modifiers/components.

## Installation

```
ember install ember-vite-hmr
```

## Usage

update your `vite.config.mjs` with

```js
import { hmr } from 'ember-vite-hmr';
...hmr
plugins: [
  ...hmr()
]
```

## Contributing

See the [Contributing](CONTRIBUTING.md) guide for details.

## License

This project is licensed under the [MIT License](LICENSE.md).
