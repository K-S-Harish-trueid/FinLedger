/**
 * Ship a single ABI. The default four (arm64-v8a, armeabi-v7a, x86, x86_64)
 * made a 102 MB APK of which 43 MB was x86/x86_64 — emulator-only code that no
 * phone downloading from GitHub Releases will ever execute.
 *
 * arm64-v8a alone covers every 64-bit Android device, which in practice is
 * everything shipped since ~2015 and all devices running Android 10+, since
 * Google Play has required 64-bit support since 2019.
 *
 * Splitting per ABI instead would mean several APKs, and the update manifest
 * carries exactly one downloadUrl — so trimming is the change that keeps the
 * self-updater simple.
 */
const { withGradleProperties } = require('@expo/config-plugins');

const KEY = 'reactNativeArchitectures';
const VALUE = 'arm64-v8a';

module.exports = (config) =>
  withGradleProperties(config, (cfg) => {
    cfg.modResults = [
      ...cfg.modResults.filter((item) => !(item.type === 'property' && item.key === KEY)),
      { type: 'property', key: KEY, value: VALUE },
    ];
    return cfg;
  });
