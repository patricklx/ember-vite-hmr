# test-app

A minimal Ember + Vite app wired to the **local** `ember-vite-hmr` via the pnpm
workspace (`"ember-vite-hmr": "workspace:*"`), used to reproduce HMR bugs that
only manifest against a real app in vite **dev** mode.

It defines two routes (`equipment`, `project`) and an `EquipmentController`
whose `groupBy` query param is declared **without** `@tracked` — the trigger for
the `setupController` mandatory-setter bug.

The driver lives in the library suite: [`../tests/test-app.test.ts`](../tests/test-app.test.ts).
It boots this app's dev server and drives Equipment → Project → Equipment,
asserting no mandatory-setter assertion fires on the second visit.

## Run it (red → green)

`ember-vite-hmr` is symlinked in via the workspace, so rebuilding the library is
reflected here on the next run (the test starts vite with `--force`).

```sh
# from the library root
pnpm install                     # one-time: installs the workspace (lib + test-app)
pnpm build                       # build dist (with the fix)
pnpm exec vitest run tests/test-app.test.ts   # → GREEN

# prove it catches the bug:
git stash                        # remove the fix
pnpm build
pnpm exec vitest run tests/test-app.test.ts   # → RED (assertion fires)
git stash pop && pnpm build      # restore the fix
```
