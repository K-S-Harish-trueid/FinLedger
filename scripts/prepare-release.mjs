#!/usr/bin/env node
/**
 * Writes docs/update.json for a release, hashing the APK so devices can verify
 * what they download. Run it after building the APK and before pushing.
 *
 *   node scripts/prepare-release.mjs \
 *     --apk ./FinLedger-v1.1.0.apk \
 *     --notes "Bug fixes" --notes "Faster sync"
 *
 * Version and versionCode are read from mobile/app.json so the manifest can
 * never disagree with the binary that was built from it.
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OWNER = 'K-S-Harish-trueid';
const REPO = 'FinLedger';

const parseArgs = (argv) => {
  const args = { notes: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--apk') (args.apk = value), (i += 1);
    else if (flag === '--notes') (args.notes.push(value), (i += 1));
    else if (flag === '--force') args.force = true;
  }
  return args;
};

const sha256 = (file) =>
  new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(file)
      .on('error', reject)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')));
  });

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (!args.apk) {
    console.error('Usage: node scripts/prepare-release.mjs --apk <path> [--notes "..."]... [--force]');
    process.exit(1);
  }

  const appJson = JSON.parse(await readFile(path.join(root, 'mobile/app.json'), 'utf8'));
  const { version } = appJson.expo;
  const versionCode = appJson.expo.android?.versionCode;

  if (typeof version !== 'string' || !Number.isInteger(versionCode)) {
    console.error('mobile/app.json needs expo.version and expo.android.versionCode');
    process.exit(1);
  }

  const apkPath = path.resolve(args.apk);
  const { size } = await stat(apkPath);
  const digest = await sha256(apkPath);
  const assetName = `FinLedger-v${version}.apk`;

  const manifest = {
    version,
    versionCode,
    downloadUrl: `https://github.com/${OWNER}/${REPO}/releases/download/v${version}/${assetName}`,
    forceUpdate: Boolean(args.force),
    releaseNotes: args.notes.length > 0 ? args.notes : ['Bug fixes and improvements'],
    sha256: digest,
  };

  const out = path.join(root, 'docs/update.json');
  await writeFile(out, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`wrote ${path.relative(root, out)}`);
  console.log(`  version     ${version} (versionCode ${versionCode})`);
  console.log(`  apk         ${path.basename(apkPath)} — ${(size / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  sha256      ${digest}`);
  console.log(`  forceUpdate ${manifest.forceUpdate}`);
  console.log('');
  console.log(`Next: upload ${assetName} to the v${version} GitHub release, then commit docs/update.json.`);
};

await main();
