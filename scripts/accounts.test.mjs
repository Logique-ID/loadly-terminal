/**
 * Which key serves which app depends on the account names parsed here, and a
 * bad LOADLY_API_KEYS must fail loudly instead of silently dropping an account.
 *
 *   npm test
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { parseAccounts } from './sync.mjs';

test('the primary key is the default account', () => {
  assert.deepEqual(parseAccounts('k1', undefined), [{ name: 'default', apiKey: 'k1' }]);
  assert.deepEqual(parseAccounts('k1', '  '), [{ name: 'default', apiKey: 'k1' }]);
});

test('extra accounts follow the primary, in order', () => {
  assert.deepEqual(parseAccounts('k1', '{"client-a":"k2","client_b":" k3 "}'), [
    { name: 'default', apiKey: 'k1' },
    { name: 'client-a', apiKey: 'k2' },
    { name: 'client_b', apiKey: 'k3' },
  ]);
});

test('extra accounts work without a primary key', () => {
  assert.deepEqual(parseAccounts('', '{"other":"k2"}'), [{ name: 'other', apiKey: 'k2' }]);
});

test('no key at all is an error', () => {
  assert.throws(() => parseAccounts('', ''), /LOADLY_API_KEY is not set/);
});

test('rejects malformed LOADLY_API_KEYS', () => {
  assert.throws(() => parseAccounts('k1', '{other:k2}'), /not valid JSON/);
  assert.throws(() => parseAccounts('k1', '["k2"]'), /JSON object/);
  assert.throws(() => parseAccounts('k1', '{"default":"k2"}'), /not a valid account name/);
  assert.throws(() => parseAccounts('k1', '{"a b":"k2"}'), /not a valid account name/);
  assert.throws(() => parseAccounts('k1', '{"other":""}'), /has no API key/);
});

test('error messages never contain a key', () => {
  assert.throws(
    () => parseAccounts('k1', '{"other":"secret-key-123"'),
    (error) => !error.message.includes('secret-key-123')
  );
});
