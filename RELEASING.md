# Releasing a new FinLedger APK

FinLedger updates itself from GitHub Releases. There is no Play Store and no
Firebase: the app reads a small manifest, compares version codes, and opens
Android's own package installer.

```
Bump version + versionCode in mobile/app.json
        ↓
Build the release APK
        ↓
Create GitHub Release (v1.1.0)
        ↓
Upload FinLedger-v1.1.0.apk
        ↓
Regenerate docs/update.json (hashes the APK)
        ↓
Commit + push
        ↓
Existing users are offered the update on next launch
```

> **A note on the original spec.** The request described `pubspec.yaml` and
> `flutter build apk`. FinLedger is an Expo / React Native app, so those map to
> `mobile/app.json` and an EAS or Gradle build. Everything else — the manifest,
> the flow, the dialog behaviour — is exactly as specified.

---

## The one rule that cannot be broken

**Every release must be signed with the same keystore and keep the same
application ID (`in.trueid.finledger`).** Android refuses to install an update
signed by a different key — the user sees "App not installed" and their only
way forward is to uninstall, which deletes their local data.

- Using **EAS Build**, this is automatic: EAS keeps one keystore per project.
  Never run `eas credentials` and generate a new one.
- Building **locally**, reuse the same `.jks` file and passwords every time, and
  back it up somewhere you will not lose it. A lost keystore means no existing
  install can ever be updated again.

App data is untouched by an update: it lives in the app's own storage and
survives an in-place install.

---

## 1. Bump the version

Edit `mobile/app.json`:

```jsonc
{
  "expo": {
    "version": "1.1.0",            // shown to the user
    "android": {
      "versionCode": 2             // MUST increase; this is what the app compares
    }
  }
}
```

`versionCode` is the only thing that decides whether an update is offered. It
must be a whole number and strictly higher than the last release.

## 2. Build the APK

With EAS (free tier, no local Android SDK needed):

```bash
cd mobile
eas build -p android --profile production
```

Download the artifact and rename it to `FinLedger-v1.1.0.apk`.

Building locally instead:

```bash
cd mobile
npx expo prebuild -p android
cd android && ./gradlew assembleRelease
# app/build/outputs/apk/release/app-release.apk
```

## 3. Create the GitHub Release

Tag it `v1.1.0` and attach the APK named exactly `FinLedger-v1.1.0.apk`.
The download URL the app expects is:

```
https://github.com/K-S-Harish-trueid/FinLedger/releases/download/v1.1.0/FinLedger-v1.1.0.apk
```

The release must **not** be a draft — draft assets are not publicly downloadable.

## 4. Regenerate the manifest

```bash
node scripts/prepare-release.mjs --apk ./FinLedger-v1.1.0.apk \
  --notes "Budgets now roll over" \
  --notes "Faster sync on slow connections"
```

This reads the version and versionCode from `mobile/app.json`, computes the
APK's SHA-256, and writes `docs/update.json`. Add `--force` to make the update
mandatory.

## 5. Commit and push

```bash
git add mobile/app.json docs/update.json
git commit -m "Release v1.1.0"
git push
```

Every existing install picks it up on next launch.

---

## Where the manifest is served from

`docs/update.json` is a single file reachable two ways, and the app tries both:

| | URL |
|---|---|
| GitHub Pages *(preferred)* | `https://k-s-harish-trueid.github.io/FinLedger/update.json` |
| Raw *(works with no setup)* | `https://raw.githubusercontent.com/K-S-Harish-trueid/FinLedger/<default-branch>/docs/update.json` |

The raw URL works today with nothing to configure. To enable Pages — which is
worth doing, because its URL does not change if the branch is renamed — go to
**Settings → Pages**, set the source to the default branch and the `/docs`
folder. Both serve the same file, so there is nothing to keep in sync.

To point a build at a different manifest entirely (a staging channel, say):

```bash
EXPO_PUBLIC_UPDATE_MANIFEST_URL=https://example.com/update.json eas build ...
```

---

## Testing a 1.0.0 → 1.1.0 update

You need two APKs built from the **same keystore**.

1. **Build and install 1.0.0.** With `version` `1.0.0` and `versionCode` `1`,
   build the APK and install it on a device or emulator:
   ```bash
   adb install FinLedger-v1.0.0.apk
   ```
   Open the app, sign in, and add a saving so there is data to preserve.

2. **Confirm no update is offered.** `docs/update.json` also says versionCode 1,
   so launching the app should show no dialog at all. This is the check that
   the app does not nag when it is current.

3. **Publish 1.1.0.** Bump to `version` `1.1.0` / `versionCode` `2`, build,
   create the release, upload the APK, run `prepare-release.mjs`, push.

4. **Relaunch the 1.0.0 app.** Within a few seconds the update sheet appears
   showing "FinLedger 1.1.0", your release notes, and **[Later] [Update now]**.

5. **Tap Update now.** Watch the progress bar, then "Verifying download…", then
   Android's installer appears asking you to confirm. Approve it.

6. **Verify.** The app reopens as 1.1.0, **your saving from step 1 is still
   there**, and you are still signed in. That is the whole point: an in-place
   update, not a reinstall.

### Testing the failure paths

| To test | Do this | Expect |
|---|---|---|
| Offline | Turn on aeroplane mode, launch | No dialog, app fully usable |
| Bad JSON | Put `not json` in `docs/update.json`, push | No dialog, app fully usable |
| Bad host | Point `downloadUrl` at a non-GitHub host | Manifest rejected, no dialog |
| Corrupt APK | Change one character of `sha256`, push | Download runs, then "did not match its checksum", file discarded, nothing installed |
| Mandatory | Re-run with `--force` | Only **[Update now]**; back button will not dismiss it |

### Faster iteration

You do not need a real release to test the dialog. Serve a manifest locally and
point a dev build at it:

```bash
python3 -m http.server 8000 --directory docs
EXPO_PUBLIC_UPDATE_MANIFEST_URL=https://<your-tunnel>/update.json npx expo start
```

Note the manifest URL must be HTTPS — the app refuses plain HTTP, so use a
tunnel rather than `http://localhost`.

---

## Why `REQUEST_INSTALL_PACKAGES`

Android requires this permission for an app to hand an APK to the package
installer. It does **not** let FinLedger install anything by itself: the system
installer still shows a confirmation screen, and on Android 8+ the user must
additionally grant "install unknown apps" for FinLedger the first time. Nothing
is ever installed silently.
