/**
 * Grouping is the only non-trivial logic in the sync, and a mistake there is
 * invisible in the output — two unrelated apps just quietly share a section.
 *
 *   npm test
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { assignGroups, cleanName, compareApps, groupKeyFor, groupKeyOf } from './sync.mjs';

const app = (name, identifier, extra = {}) => ({ name, identifier, ...extra });

/** Group label per app name, after assignGroups() has run over the list. */
function labels(list) {
  assignGroups(list);
  return Object.fromEntries(list.map((item) => [item.name, item.groupLabel]));
}

test('strips environment suffixes as whole segments', () => {
  assert.equal(groupKeyFor('id.logique.assistforward.dev'), 'id.logique.assistforward');
  assert.equal(groupKeyFor('id.logique.assistforward.stg'), 'id.logique.assistforward');
  assert.equal(groupKeyFor('id.logique.assistforward'), 'id.logique.assistforward');
});

test('strips environment suffixes glued onto the last segment', () => {
  assert.equal(
    groupKeyFor('com.upliftlab.bikeinspectionsystemdev'),
    'com.upliftlab.bikeinspectionsystem'
  );
  assert.equal(
    groupKeyFor('com.upliftlab.bikeinspectionsystemstaging'),
    'com.upliftlab.bikeinspectionsystem'
  );
});

test('keeps a glued suffix when too little of the segment would remain', () => {
  // "dev" here is the whole name, not an environment marker on something else.
  assert.equal(groupKeyFor('com.acme.dev'), 'com.acme');
  assert.equal(groupKeyFor('com.acme.devs'), 'com.acme.devs');
});

test('a vendor-only identifier does not claim the vendor prefix', () => {
  const key = groupKeyOf(app('[DEV] JBA Inventory Flow Control', 'id.logique.dev'));
  assert.equal(key.generic, true);
  assert.equal(key.stripped, 'id.logique');
  assert.notEqual(key.key, 'id.logique');
});

test('vendor-only variants still group together, by cleaned name', () => {
  const list = [
    app('JBA Inventory Flow Control', 'id.logique.live'),
    app('[DEV] JBA Inventory Flow Control', 'id.logique.dev'),
    app('[STG] JBA Inventory Flow Control', 'id.logique.staging'),
  ];
  const keys = new Set(list.map((item) => groupKeyOf(item).key));
  assert.equal(keys.size, 1, 'the three environments belong to one section');
  assert.deepEqual(Object.values(labels(list)), Array(3).fill('JBA Inventory Flow Control'));
});

test('an unrelated app under the same vendor gets its own section', () => {
  const inventory = app('JBA Inventory Flow Control', 'id.logique.live');
  const other = app('Some Other Tool', 'id.logique.prod');
  assert.notEqual(groupKeyOf(inventory).key, groupKeyOf(other).key);
});

test('cleanName removes environment markers, not the product name', () => {
  assert.equal(cleanName('[DEV] JBA Indonesia'), 'JBA Indonesia');
  assert.equal(cleanName('Assist Forward [STG]'), 'Assist Forward');
  assert.equal(cleanName('Blue-T Demo'), 'Blue-T');
  assert.equal(cleanName('Inspire'), 'Inspire');
});

test('two products whose names clean to the same label stay distinguishable', () => {
  const list = [
    app('Blue-T Demo', 'com.toyotatsusho.automotive.bluetdemo'),
    app('Blue-T Dev', 'com.toyotatsusho.automotive.bluetsrilanka.dev'),
  ];
  const result = labels(list);
  assert.notEqual(result['Blue-T Demo'], result['Blue-T Dev']);
});

test('a configured GROUP_LABELS title wins over the derived one', () => {
  const list = [app('JBA Indonesia', 'id.logique.jbabiddingrevamp')];
  assert.equal(labels(list)['JBA Indonesia'], 'JBA Bidding Revamp');
});

test('sorting keeps a section contiguous and a base id before its variants', () => {
  const list = [
    app('Assist Forward [STG]', 'id.logique.assistforward.stg'),
    app('Inspire', 'id.co.jba.inspire'),
    app('Assist Forward', 'id.logique.assistforward'),
    app('Assist Forward [DEV]', 'id.logique.assistforward.dev'),
  ];
  assignGroups(list);
  const order = [...list].sort(compareApps).map((item) => item.name);
  assert.deepEqual(order, [
    'Assist Forward',
    'Assist Forward [DEV]',
    'Assist Forward [STG]',
    'Inspire',
  ]);
});

test('an app with no identifier still lands in a section', () => {
  const list = [app('Untitled', null, { appKey: 'abc123' })];
  assert.ok(labels(list).Untitled);
});
