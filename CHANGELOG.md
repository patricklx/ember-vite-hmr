# ember-vite-hmr Changelog

## Release (2026-07-29)

* ember-vite-hmr 2.2.1 (patch)

#### :bug: Bug Fix
* `ember-vite-hmr`
  * [#518](https://github.com/patricklx/ember-vite-hmr/pull/518) Fix mut helper crash inside hot-wrapped components ([@patricklx](https://github.com/patricklx))
  * [#509](https://github.com/patricklx/ember-vite-hmr/pull/509) Fix route template HMR when vite base or https is configured ([@patricklx](https://github.com/patricklx))
  * [#500](https://github.com/patricklx/ember-vite-hmr/pull/500) Fix named blocks dropped for classic .hbs components with a backing class ([@patricklx](https://github.com/patricklx))

#### Committers: 1
- Patrick Pircher ([@patricklx](https://github.com/patricklx))

## Release (2026-06-10)

* ember-vite-hmr 2.2.0 (minor)

#### :rocket: Enhancement
* `ember-vite-hmr`
  * [#470](https://github.com/patricklx/ember-vite-hmr/pull/470) Optimize on demand deps by default in vite ([@johanrd](https://github.com/johanrd))

#### :bug: Bug Fix
* `ember-vite-hmr`
  * [#468](https://github.com/patricklx/ember-vite-hmr/pull/468) Fix/setup controller state restore ([@johanrd](https://github.com/johanrd))
  * [#464](https://github.com/patricklx/ember-vite-hmr/pull/464) fix: detect app entry for HMR by its compat-modules import, not its path ([@johanrd](https://github.com/johanrd))
  * [#465](https://github.com/patricklx/ember-vite-hmr/pull/465) Fix/guard hmr initializers in prod ([@johanrd](https://github.com/johanrd))

#### :house: Internal
* `ember-vite-hmr`
  * [#485](https://github.com/patricklx/ember-vite-hmr/pull/485) Add release-plan dependency to package.json ([@patricklx](https://github.com/patricklx))

#### Committers: 2
- Johan Røed ([@johanrd](https://github.com/johanrd))
- Patrick Pircher ([@patricklx](https://github.com/patricklx))
