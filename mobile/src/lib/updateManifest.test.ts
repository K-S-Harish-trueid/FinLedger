import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isHttpsUrlOnAllowedHost, isNewer, parseManifest } from './updateManifest.ts';

const valid = {
  version: '1.2.0',
  versionCode: 12,
  downloadUrl:
    'https://github.com/K-S-Harish-trueid/FinLedger/releases/download/v1.2.0/FinLedger-v1.2.0.apk',
  forceUpdate: false,
  releaseNotes: ['Bug fixes', 'Performance improvements'],
};

describe('update manifest validation', () => {
  it('accepts the documented manifest', () => {
    const parsed = parseManifest(valid);
    assert.equal(parsed?.version, '1.2.0');
    assert.equal(parsed?.versionCode, 12);
    assert.equal(parsed?.forceUpdate, false);
    assert.deepEqual(parsed?.releaseNotes, ['Bug fixes', 'Performance improvements']);
  });

  it('refuses a download that is not on GitHub', () => {
    assert.equal(parseManifest({ ...valid, downloadUrl: 'https://evil.example.com/app.apk' }), null);
  });

  it('refuses plain http, even on GitHub', () => {
    assert.equal(
      parseManifest({ ...valid, downloadUrl: 'http://github.com/x/y/releases/download/v1/a.apk' }),
      null,
    );
  });

  it('refuses a host that merely looks like GitHub', () => {
    assert.equal(isHttpsUrlOnAllowedHost('https://github.com.evil.net/a.apk'), false);
    assert.equal(isHttpsUrlOnAllowedHost('https://notgithub.com/a.apk'), false);
    assert.equal(isHttpsUrlOnAllowedHost('https://objects.githubusercontent.com/a.apk'), true);
  });

  it('refuses junk in place of a manifest', () => {
    for (const junk of [null, undefined, 42, 'nope', [], {}, { version: '1.0.0' }]) {
      assert.equal(parseManifest(junk), null, `should reject ${JSON.stringify(junk)}`);
    }
  });

  it('refuses a bad versionCode', () => {
    for (const versionCode of [0, -1, 1.5, '12', null]) {
      assert.equal(parseManifest({ ...valid, versionCode }), null, `should reject ${versionCode}`);
    }
  });

  it('only accepts a well-formed sha256, and normalises case', () => {
    const hash = 'A'.repeat(64);
    assert.equal(parseManifest({ ...valid, sha256: hash })?.sha256, 'a'.repeat(64));
    assert.equal(parseManifest({ ...valid, sha256: 'abc' }), null);
    assert.equal(parseManifest({ ...valid, sha256: 'z'.repeat(64) }), null);
  });

  it('treats a missing or non-boolean forceUpdate as optional', () => {
    assert.equal(parseManifest({ ...valid, forceUpdate: undefined })?.forceUpdate, false);
    assert.equal(parseManifest({ ...valid, forceUpdate: 'yes' })?.forceUpdate, false);
    assert.equal(parseManifest({ ...valid, forceUpdate: true })?.forceUpdate, true);
  });

  it('survives release notes that are not a list of strings', () => {
    assert.deepEqual(parseManifest({ ...valid, releaseNotes: 'oops' })?.releaseNotes, []);
    assert.deepEqual(parseManifest({ ...valid, releaseNotes: [1, 'kept', null] })?.releaseNotes, ['kept']);
  });

  it('caps release notes so a huge manifest cannot flood the dialog', () => {
    const many = Array.from({ length: 50 }, (_, i) => `note ${i}`);
    assert.equal(parseManifest({ ...valid, releaseNotes: many })?.releaseNotes.length, 12);
  });

  it('offers an update only for a strictly higher versionCode', () => {
    assert.equal(isNewer(12, 11), true);
    assert.equal(isNewer(12, 12), false);
    assert.equal(isNewer(11, 12), false);
  });
});
