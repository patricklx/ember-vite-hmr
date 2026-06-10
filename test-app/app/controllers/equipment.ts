import Controller from '@ember/controller';

export default class EquipmentController extends Controller {
  queryParams = ['groupBy'];

  // BUG REPRO: `groupBy` is a query param but declared as a PLAIN field
  // without `@tracked`. Ember installs a mandatory setter on it (because a
  // query param read in a tracking context is tracked under the hood).
  //
  // ember-vite-hmr's `setupController` patch caches the controller on the
  // first visit and re-writes every cached property back onto the same
  // singleton on EVERY subsequent route entry. That redundant write to an
  // already-consumed non-tracked property trips Ember's mandatory-setter
  // assertion:
  //
  //   "You attempted to update <…EquipmentController…>.groupBy to "day",
  //    but it is being tracked by a tracking context …
  //    you must mark the property as `@tracked` …"
  //
  // Fix on the app side: add `@tracked`. Fix on the library side: don't
  // re-apply cached state onto the same controller instance on plain
  // navigation (see setup-hmr-manager.ts).
  groupBy = 'day';
}
