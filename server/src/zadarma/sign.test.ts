import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signZadarmaRequest } from './sign';

/**
 * Vectors computed independently with raw node:crypto calls, not by importing
 * signZadarmaRequest — see the verification commands in git history for this
 * file's commit. Vector 1's shape (empty params_str, method + "" + md5("")
 * as the string to sign) is what Zadarma support confirmed against the live
 * API for GET /v1/info/balance/ with a real key; the auth here uses a
 * synthetic secret so the expected signature is safe to commit.
 */

test('empty params — the actual /v1/info/balance/ shape confirmed against the live API', () => {
  const { url, headers } = signZadarmaRequest(
    'https://api.zadarma.com',
    '/v1/info/balance/',
    {},
    { key: 'testkey', secret: 'testsecret' },
  );

  assert.equal(url, 'https://api.zadarma.com/v1/info/balance/');
  assert.equal(
    headers.Authorization,
    'testkey:YWMyNjcxZTQ5ZGI0OGJmOWNiZWExY2UxZDdjNzU0MTYzN2UzNGM1YQ==',
  );
});

test('one param — signature is base64 of the hex digest, not raw digest bytes', () => {
  const { url, headers } = signZadarmaRequest(
    'https://api.zadarma.com',
    '/v1/webrtc/get_key/',
    { sip: '45089' },
    { key: 'testkey', secret: 'testsecret' },
  );

  assert.equal(url, 'https://api.zadarma.com/v1/webrtc/get_key/?sip=45089');
  assert.equal(
    headers.Authorization,
    'testkey:NDA1NjIwOTU5MGY1N2I2YWNlNDY1MzFlMGQ2OWI0MTQwZmM3OThiNQ==',
  );
});

test('does not inject format=json — params_str must be exactly what the caller passed', () => {
  const { url } = signZadarmaRequest(
    'https://api.zadarma.com',
    '/v1/info/balance/',
    {},
    { key: 'testkey', secret: 'testsecret' },
  );

  assert.ok(!url.includes('format'), `expected no format param in ${url}`);
  assert.ok(!url.includes('?'), `expected no query string at all in ${url}`);
});

test('POST puts params in the body, not the query string — this is the widget-create bug', () => {
  const { url, headers, body } = signZadarmaRequest(
    'https://api.zadarma.com',
    '/v1/webrtc/create/',
    { domain: 'test.domain.com' },
    { key: 'testkey', secret: 'testsecret' },
    'POST',
  );

  assert.equal(url, 'https://api.zadarma.com/v1/webrtc/create/', 'POST url must carry no query string');
  assert.equal(body, 'domain=test.domain.com');
  assert.equal(headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.equal(
    headers.Authorization,
    'testkey:ZjcwZmJiNGZjMWNmNzdkYmE2ZTljNWI3N2Q1ZTdlZjMwMzQ2ZGQyOA==',
  );
});
