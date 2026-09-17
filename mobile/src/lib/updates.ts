import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import { getContentUriAsync } from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { Platform } from 'react-native';
import {
  isHttpsUrlOnAllowedHost,
  isNewer,
  parseManifest,
  type UpdateManifest,
} from '@/lib/updateManifest';

export { parseManifest, type UpdateManifest };

/**
 * Sideloaded APK updates, checked against a manifest published on GitHub.
 *
 * Every step here is best-effort: a missing manifest, a timeout, malformed JSON
 * or a failed download must leave the app exactly as usable as it was. Nothing
 * in this file is allowed to throw into app startup.
 */

/**
 * Both entries serve the same `docs/update.json`. GitHub Pages is tried first
 * because its URL does not move if the default branch is renamed; the raw URL
 * is the fallback so updates keep working even if Pages is never enabled.
 * Setting EXPO_PUBLIC_UPDATE_MANIFEST_URL overrides both.
 */
export const MANIFEST_URLS: string[] = process.env.EXPO_PUBLIC_UPDATE_MANIFEST_URL
  ? [process.env.EXPO_PUBLIC_UPDATE_MANIFEST_URL]
  : [
      'https://k-s-harish-trueid.github.io/FinLedger/update.json',
      'https://raw.githubusercontent.com/K-S-Harish-trueid/FinLedger/claude/new-session-h0g10g/docs/update.json',
    ];

/** A slow or hanging GitHub must never hold up app startup. */
const MANIFEST_TIMEOUT_MS = 8000;

export interface AvailableUpdate {
  manifest: UpdateManifest;
  mandatory: boolean;
  currentVersion: string;
  currentVersionCode: number;
}

export type DownloadStage = 'downloading' | 'verifying' | 'opening-installer';

export interface DownloadProgress {
  stage: DownloadStage;
  /** 0..1, or null while the total size is unknown. */
  ratio: number | null;
  bytesWritten: number;
  totalBytes: number | null;
}

/** Android reports its versionCode through nativeBuildVersion. */
export const currentVersionCode = (): number => {
  const raw = Application.nativeBuildVersion;
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const currentVersion = (): string => Application.nativeApplicationVersion ?? '0.0.0';

/**
 * Returns the update to offer, or null when there is nothing to do — including
 * every failure case, which is why this never rejects.
 */
const fetchManifest = async (url: string): Promise<UpdateManifest | null> => {
  if (!url.startsWith('https://')) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MANIFEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    return parseManifest(await response.json());
  } catch {
    // Offline, timed out, GitHub down, invalid JSON — all simply mean "no manifest".
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

export const checkForUpdate = async (): Promise<AvailableUpdate | null> => {
  if (Platform.OS !== 'android') return null;

  for (const url of MANIFEST_URLS) {
    const manifest = await fetchManifest(url);
    if (!manifest) continue;

    const installed = currentVersionCode();
    if (!isNewer(manifest.versionCode, installed)) return null;

    return {
      manifest,
      mandatory: manifest.forceUpdate,
      currentVersion: currentVersion(),
      currentVersionCode: installed,
    };
  }
  return null;
};

const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

export class UpdateError extends Error {}

/**
 * Downloads the APK, verifies it when the manifest publishes a hash, and hands
 * it to Android's package installer. The installer always asks the user to
 * confirm — nothing is installed silently, and the APK is only ever opened
 * through the system installer, never executed by the app.
 */
export const downloadAndInstall = async (
  manifest: UpdateManifest,
  onProgress: (progress: DownloadProgress) => void,
): Promise<void> => {
  if (Platform.OS !== 'android') throw new UpdateError('Updates are only supported on Android.');
  if (!isHttpsUrlOnAllowedHost(manifest.downloadUrl)) throw new UpdateError('Refusing an untrusted download URL.');

  const target = new File(Paths.cache, `FinLedger-${manifest.version}.apk`);
  if (target.exists) target.delete();

  onProgress({ stage: 'downloading', ratio: null, bytesWritten: 0, totalBytes: null });

  let downloaded: File;
  try {
    const task = File.createDownloadTask(manifest.downloadUrl, target, {
      onProgress: ({ bytesWritten, totalBytes }) => {
        const total = typeof totalBytes === 'number' && totalBytes > 0 ? totalBytes : null;
        onProgress({
          stage: 'downloading',
          ratio: total ? Math.min(bytesWritten / total, 1) : null,
          bytesWritten,
          totalBytes: total,
        });
      },
    });
    downloaded = (await task.downloadAsync()) as File;
  } catch {
    throw new UpdateError('The download did not finish. Check your connection and try again.');
  }

  if (!downloaded.exists || downloaded.size <= 0) {
    throw new UpdateError('The downloaded file was empty.');
  }

  if (manifest.sha256) {
    onProgress({ stage: 'verifying', ratio: 1, bytesWritten: downloaded.size, totalBytes: downloaded.size });
    let actual: string;
    try {
      const bytes = await downloaded.bytes();
      actual = toHex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes));
    } catch {
      // Could not verify, so do not install. Failing closed is the point of the hash.
      downloaded.delete();
      throw new UpdateError('Could not verify the download, so it was discarded.');
    }
    if (actual !== manifest.sha256) {
      downloaded.delete();
      throw new UpdateError('The download did not match its checksum and was discarded.');
    }
  }

  onProgress({ stage: 'opening-installer', ratio: 1, bytesWritten: downloaded.size, totalBytes: downloaded.size });

  // Android 7+ rejects file:// URIs handed to other apps; FileProvider gives a
  // content:// URI, and FLAG_GRANT_READ_URI_PERMISSION (1) lets the installer read it.
  const contentUri = await getContentUriAsync(downloaded.uri);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    type: 'application/vnd.android.package-archive',
    flags: 1,
  });
};
