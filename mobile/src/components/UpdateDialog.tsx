import React, { useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { Bar, Button } from '@/components/ui';
import { palette, radius, shadow, spacing } from '@/lib/theme';
import {
  downloadAndInstall,
  UpdateError,
  type AvailableUpdate,
  type DownloadProgress,
} from '@/lib/updates';

const megabytes = (bytes: number): string => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const stageLabel = (progress: DownloadProgress): string => {
  if (progress.stage === 'verifying') return 'Verifying download…';
  if (progress.stage === 'opening-installer') return 'Opening the installer…';
  if (progress.totalBytes === null) return 'Downloading…';
  return `Downloading ${megabytes(progress.bytesWritten)} of ${megabytes(progress.totalBytes)}`;
};

export const UpdateDialog = ({
  update,
  onDismiss,
}: {
  update: AvailableUpdate;
  onDismiss: () => void;
}): React.JSX.Element => {
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = progress !== null;

  const start = async (): Promise<void> => {
    setError(null);
    setProgress({ stage: 'downloading', ratio: null, bytesWritten: 0, totalBytes: null });
    try {
      await downloadAndInstall(update.manifest, setProgress);
      // The system installer is now in front of the user. Leave the dialog up:
      // if they decline, they come back to it rather than to a blank screen.
      setProgress(null);
    } catch (caught) {
      setProgress(null);
      setError(
        caught instanceof UpdateError
          ? caught.message
          : 'Something went wrong preparing the update. Please try again.',
      );
    }
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      // A mandatory update cannot be dismissed with the back button.
      onRequestClose={update.mandatory ? () => {} : onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.eyebrow}>{update.mandatory ? 'Required update' : 'Update available'}</Text>
          <Text style={styles.title}>FinLedger {update.manifest.version}</Text>
          <Text style={styles.subtitle}>You are on {update.currentVersion}</Text>

          {update.manifest.releaseNotes.length > 0 ? (
            <View style={styles.notes}>
              {update.manifest.releaseNotes.map((note) => (
                <View key={note} style={styles.noteRow}>
                  <View style={styles.bullet} />
                  <Text style={styles.noteText}>{note}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {update.mandatory ? (
            <Text style={styles.mandatory}>
              This version is required to keep using FinLedger. Your data stays on your device and syncs as usual.
            </Text>
          ) : null}

          {busy && progress ? (
            <View style={styles.progress}>
              <Bar percent={progress.ratio === null ? 8 : Math.round(progress.ratio * 100)} tone="brand" />
              <Text style={styles.progressLabel}>{stageLabel(progress)}</Text>
            </View>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.actions}>
            {update.mandatory ? null : (
              <Button label="Later" variant="ghost" onPress={onDismiss} disabled={busy} style={styles.action} />
            )}
            <Button
              label={error ? 'Try again' : 'Update now'}
              onPress={() => void start()}
              loading={busy}
              style={styles.action}
              testID="update-now"
            />
          </View>

          <Text style={styles.footnote}>
            Android will ask you to confirm before anything is installed.
          </Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
    ...shadow,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.brand,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  title: { fontSize: 24, fontWeight: '800', color: palette.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 13.5, color: palette.muted },
  notes: { gap: spacing.xs, marginTop: spacing.sm },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  bullet: { width: 5, height: 5, borderRadius: 3, backgroundColor: palette.brand, marginTop: 7 },
  noteText: { flex: 1, fontSize: 14, color: palette.text, lineHeight: 20 },
  mandatory: {
    marginTop: spacing.sm,
    fontSize: 13,
    lineHeight: 19,
    color: '#92400e',
    backgroundColor: palette.warnSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  progress: { gap: spacing.xs, marginTop: spacing.md },
  progressLabel: { fontSize: 12.5, color: palette.muted },
  error: { marginTop: spacing.sm, fontSize: 13, color: palette.loss, lineHeight: 19 },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  action: { flex: 1 },
  footnote: { fontSize: 11.5, color: palette.faint, textAlign: 'center', marginTop: spacing.sm },
});
