# ember-vite-hmr Changelog

## Release (2026-09-18)

* ember-vite-hmr 2.4.0 (minor)

#### :rocket: Enhancement
* `ember-vite-hmr`
  * [#565](https://github.com/patricklx/ember-vite-hmr/pull/565) Share babel-computed HMR import metadata with hmr.ts instead of re-parsing ([@patricklx](https://github.com/patricklx))
  * [#566](https://github.com/patricklx/ember-vite-hmr/pull/566) Walk the extends chain for named-block detection on inherited-template components ([@patricklx](https://github.com/patricklx))

#### :bug: Bug Fix
* `ember-vite-hmr`
  * [#561](https://github.com/patricklx/ember-vite-hmr/pull/561) Fix service HMR proxy binding own-property functions ([@patricklx](https://github.com/patricklx))
  * [#559](https://github.com/patricklx/ember-vite-hmr/pull/559) Fix "associate a destroyable child" crashes on HMR-destroyed components (#557, #563) ([@patricklx](https://github.com/patricklx))
  * [#558](https://github.com/patricklx/ember-vite-hmr/pull/558) Curry the latest accepted class for instances created after an update ([@emattias](https://github.com/emattias))

#### Committers: 2
- Mattias Hällkvist ([@emattias](https://github.com/emattias))
- Patrick Pircher ([@patricklx](https://github.com/patricklx))

## Release (2026-09-15)

* ember-vite-hmr 2.3.0 (minor)

#### :rocket: Enhancement
* `ember-vite-hmr`
  * [#555](https://github.com/patricklx/ember-vite-hmr/pull/555) Hide HotComponent HMR wrapper from ember-inspector's component tree ([@patricklx](https://github.com/patricklx))

#### :bug: Bug Fix
* `ember-vite-hmr`
  * [#556](https://github.com/patricklx/ember-vite-hmr/pull/556) Fix crash with optimizeDeps.noDiscovery: true ([@patricklx](https://github.com/patricklx))
  * [#551](https://github.com/patricklx/ember-vite-hmr/pull/551) Fix service HMR proxy crashes for private fields and subclassed services ([@patricklx](https://github.com/patricklx))
  * [#550](https://github.com/patricklx/ember-vite-hmr/pull/550) Gate Vite-plugin main export behind "node" condition ([@patricklx](https://github.com/patricklx))

#### :house: Internal
* `ember-vite-hmr`
  * [#547](https://github.com/patricklx/ember-vite-hmr/pull/547) Revert @babel/types, @babel/runtime, @babel/plugin-transform-runtime to 7.x ([@patricklx](https://github.com/patricklx))

#### Committers: 1
- Patrick Pircher ([@patricklx](https://github.com/patricklx))

## Release (2026-09-04)

* ember-vite-hmr 2.2.4 (patch)

#### :bug: Bug Fix
* `ember-vite-hmr`
  * [#536](https://github.com/patricklx/ember-vite-hmr/pull/536) Require a live dev server to enable HMR scaffolding ([@patricklx](https://github.com/patricklx))

#### Committers: 1
- Patrick Pircher ([@patricklx](https://github.com/patricklx))

## Release (2026-07-29)

* ember-vite-hmr 2.2.3 (patch)

#### :bug: Bug Fix
* `ember-vite-hmr`
  * [#532](https://github.com/patricklx/ember-vite-hmr/pull/532) Fix (has-block) always true for named blocks in HMR-wrapped components ([@patricklx](https://github.com/patricklx))

#### Committers: 1
- Patrick Pircher ([@patricklx](https://github.com/patricklx))

## Release (2026-07-29)

* ember-vite-hmr 2.2.2 (patch)

#### :bug: Bug Fix
* `ember-vite-hmr`
  * [#530](https://github.com/patricklx/ember-vite-hmr/pull/530) Fix service HMR duplicate-module race on ember-source 7.1+ ([@patricklx](https://github.com/patricklx))
  * [#529](https://github.com/patricklx/ember-vite-hmr/pull/529) Support template-only components (TOC) in HMR ([@patricklx](https://github.com/patricklx))
  * [#521](https://github.com/patricklx/ember-vite-hmr/pull/521) Fix virtual component 404 for classic components under non-root base (#498) ([@patricklx](https://github.com/patricklx))
  * [#522](https://github.com/patricklx/ember-vite-hmr/pull/522) Fix route/template HMR module ids for Node-loader (non-browser) consumers ([@patricklx](https://github.com/patricklx))

#### Committers: 1
- Patrick Pircher ([@patricklx](https://github.com/patricklx))

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
