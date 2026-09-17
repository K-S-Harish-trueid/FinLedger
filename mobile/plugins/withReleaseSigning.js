/**
 * Release builds from `expo prebuild` are signed with the *debug* key by
 * default. That is a trap for an app that updates itself: Android refuses an
 * update signed by a different key, and the only way forward for a user is to
 * uninstall, which destroys their data. See RELEASING.md.
 *
 * This injects a real release signingConfig fed by Gradle properties, so the
 * keystore never lives in the repo and the setting survives every prebuild.
 * With the properties absent the build falls back to debug signing, so anyone
 * can still produce a throwaway build without the release keystore.
 */
const { withAppBuildGradle } = require('@expo/config-plugins');

const SIGNING_CONFIG = `        release {
            if (project.hasProperty('FINLEDGER_KEYSTORE')) {
                storeFile file(FINLEDGER_KEYSTORE)
                storePassword FINLEDGER_KEYSTORE_PASSWORD
                keyAlias FINLEDGER_KEY_ALIAS
                keyPassword FINLEDGER_KEY_PASSWORD
            }
        }
`;

const withReleaseSigning = (config) =>
  withAppBuildGradle(config, (cfg) => {
    let gradle = cfg.modResults.contents;

    if (!gradle.includes('FINLEDGER_KEYSTORE')) {
      // Add the release signingConfig immediately after the debug one.
      gradle = gradle.replace(
        /(signingConfigs \{\n(?:.*\n)*?        \}\n)/,
        `$1${SIGNING_CONFIG}`,
      );
      // Point the release buildType at it, keeping debug signing as fallback.
      gradle = gradle.replace(
        /(buildTypes \{(?:.*\n)*?        release \{\n(?:.*\n)*?)            signingConfig signingConfigs\.debug\n/,
        "$1            signingConfig project.hasProperty('FINLEDGER_KEYSTORE') ? signingConfigs.release : signingConfigs.debug\n",
      );
    }

    cfg.modResults.contents = gradle;
    return cfg;
  });

module.exports = withReleaseSigning;
