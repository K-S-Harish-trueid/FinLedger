/**
 * Validation for the update manifest, kept free of native imports so it can be
 * unit tested in plain Node. This is the security boundary: everything the
 * manifest claims is untrusted until it has been through `parseManifest`.
 */

/**
 * The APK may only come from GitHub. A manifest that has been tampered with
 * cannot redirect the download to an attacker's host.
 */
export const ALLOWED_DOWNLOAD_HOSTS = [
  'github.com',
  'www.github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
];

const MAX_RELEASE_NOTES = 12;

export interface UpdateManifest {
  version: string;
  versionCode: number;
  downloadUrl: string;
  forceUpdate: boolean;
  releaseNotes: string[];
  /** Optional hex SHA-256 of the APK. When present it is enforced. */
  sha256?: string;
}

export const isHttpsUrlOnAllowedHost = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === 'https:' && ALLOWED_DOWNLOAD_HOSTS.includes(url.hostname);
};

/** Rejects anything that is not exactly the shape we expect. */
export const parseManifest = (raw: unknown): UpdateManifest | null => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;

  const versionCode = value.versionCode;
  if (typeof versionCode !== 'number' || !Number.isInteger(versionCode) || versionCode <= 0) return null;
  if (typeof value.version !== 'string' || value.version.length === 0 || value.version.length > 32) return null;
  if (!isHttpsUrlOnAllowedHost(value.downloadUrl)) return null;

  const sha256 = typeof value.sha256 === 'string' ? value.sha256.trim().toLowerCase() : undefined;
  if (sha256 !== undefined && !/^[0-9a-f]{64}$/.test(sha256)) return null;

  const releaseNotes = Array.isArray(value.releaseNotes)
    ? value.releaseNotes.filter((note): note is string => typeof note === 'string').slice(0, MAX_RELEASE_NOTES)
    : [];

  return {
    version: value.version,
    versionCode,
    downloadUrl: value.downloadUrl,
    forceUpdate: value.forceUpdate === true,
    releaseNotes,
    ...(sha256 ? { sha256 } : {}),
  };
};

/** An update is offered only when the published build is strictly newer. */
export const isNewer = (manifestVersionCode: number, installedVersionCode: number): boolean =>
  manifestVersionCode > installedVersionCode;
