/**
 * The page swaps a download button for the install page once its signed link
 * has expired, so the expiry read from Loadly's redirect has to be right.
 *
 *   npm test
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { parseSignedUrl } from './sync.mjs';

test('reads the expiry from a signed storage URL', () => {
  const location =
    'https://app-storage.loadly.io/abc.apk?response-content-disposition=attachment%3Bfilename%3Dabc.apk' +
    '&OSSAccessKeyId=x&Expires=1791286375&Signature=y%3D';
  const download = parseSignedUrl(location);
  assert.equal(download.url, location);
  assert.equal(download.expiresAt, '2026-10-06T11:32:55.000Z');
});

test('a URL without Expires has no expiry', () => {
  assert.equal(parseSignedUrl('https://example.com/a.apk').expiresAt, null);
});

test('rejects anything that is not an https URL', () => {
  assert.equal(parseSignedUrl('http://example.com/a.apk'), null);
  assert.equal(parseSignedUrl('/relative/path'), null);
  assert.equal(parseSignedUrl('javascript:alert(1)'), null);
});
