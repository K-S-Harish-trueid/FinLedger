import React, { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { palette, radius, shadow, spacing } from '@/lib/theme';
import { formatInr } from '@/lib/money';

export const Screen = ({
  children,
  scroll = true,
  refreshing,
}: {
  children: ReactNode;
  scroll?: boolean;
  refreshing?: ReactNode;
}): React.JSX.Element => (
  <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
    {refreshing}
    {scroll ? (
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    ) : (
      <View style={styles.scrollContent}>{children}</View>
    )}
  </SafeAreaView>
);

export const Header = ({ title, subtitle }: { title: string; subtitle?: string }): React.JSX.Element => (
  <View style={styles.header}>
    <Text style={styles.headerTitle}>{title}</Text>
    {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
  </View>
);

export const Card = ({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element => <View style={[styles.card, style]}>{children}</View>;

export const SectionTitle = ({ children, action }: { children: ReactNode; action?: ReactNode }): React.JSX.Element => (
  <View style={styles.sectionTitleRow}>
    <Text style={styles.sectionTitle}>{children}</Text>
    {action}
  </View>
);

export const Money = ({
  paise,
  size = 18,
  tone = 'text',
  decimals = true,
}: {
  paise: number;
  size?: number;
  tone?: 'text' | 'gain' | 'loss' | 'muted';
  decimals?: boolean;
}): React.JSX.Element => {
  const color =
    tone === 'gain' ? palette.gain : tone === 'loss' ? palette.loss : tone === 'muted' ? palette.muted : palette.text;
  return (
    <Text style={{ color, fontSize: size, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
      {formatInr(paise, { decimals })}
    </Text>
  );
};

export const Button = ({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
  testID,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'danger' | 'gain';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}): React.JSX.Element => {
  const background =
    variant === 'primary'
      ? palette.brand
      : variant === 'gain'
        ? palette.gain
        : variant === 'danger'
          ? palette.loss
          : 'transparent';
  const color = variant === 'ghost' ? palette.brand : '#ffffff';
  return (
    <Pressable
      accessibilityRole="button"
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: background, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
        variant === 'ghost' && styles.buttonGhost,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <Text style={[styles.buttonLabel, { color }]}>{label}</Text>
      )}
    </Pressable>
  );
};

export const Field = ({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}): React.JSX.Element => (
  <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    {children}
    {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
  </View>
);

export const Input = (props: React.ComponentProps<typeof TextInput>): React.JSX.Element => (
  <TextInput
    placeholderTextColor={palette.faint}
    {...props}
    style={[styles.input, props.style]}
  />
);

export const AmountInput = ({
  value,
  onChangeText,
  placeholder = '0',
  testID,
}: {
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  testID?: string;
}): React.JSX.Element => (
  <View style={styles.amountRow}>
    <Text style={styles.amountPrefix}>₹</Text>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={palette.faint}
      keyboardType="decimal-pad"
      inputMode="decimal"
      testID={testID}
      style={styles.amountInput}
    />
  </View>
);

export const Segmented = <T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (next: T) => void;
}): React.JSX.Element => (
  <View style={styles.segmented}>
    {options.map((option) => {
      const active = option.value === value;
      return (
        <Pressable
          key={option.value}
          accessibilityRole="button"
          onPress={() => onChange(option.value)}
          style={[styles.segment, active && styles.segmentActive]}>
          <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>{option.label}</Text>
        </Pressable>
      );
    })}
  </View>
);

export const Chip = ({
  label,
  active,
  color,
  onPress,
}: {
  label: string;
  active?: boolean;
  color?: string;
  onPress: () => void;
}): React.JSX.Element => (
  <Pressable
    accessibilityRole="button"
    onPress={onPress}
    style={[
      styles.chip,
      active && { backgroundColor: color ?? palette.brand, borderColor: color ?? palette.brand },
    ]}>
    <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{label}</Text>
  </Pressable>
);

export const Row = ({
  title,
  subtitle,
  right,
  onPress,
  accent,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
  accent?: string;
}): React.JSX.Element => {
  const content = (
    <View style={styles.row}>
      {accent ? <View style={[styles.rowAccent, { backgroundColor: accent }]} /> : null}
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.rowSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      {content}
    </Pressable>
  );
};

export const Bar = ({ percent, tone }: { percent: number; tone: 'gain' | 'loss' | 'warn' | 'brand' }): React.JSX.Element => {
  const color =
    tone === 'gain' ? palette.gain : tone === 'loss' ? palette.loss : tone === 'warn' ? palette.warn : palette.brand;
  return (
    <View style={styles.barTrack}>
      <View style={[styles.barFill, { width: `${Math.min(Math.max(percent, 0), 100)}%`, backgroundColor: color }]} />
    </View>
  );
};

export const Empty = ({ title, body }: { title: string; body: string }): React.JSX.Element => (
  <View style={styles.empty}>
    <Text style={styles.emptyTitle}>{title}</Text>
    <Text style={styles.emptyBody}>{body}</Text>
  </View>
);

export const Banner = ({
  tone,
  children,
}: {
  tone: 'gain' | 'loss' | 'warn' | 'brand';
  children: ReactNode;
}): React.JSX.Element => {
  const background =
    tone === 'gain' ? palette.gainSoft : tone === 'loss' ? palette.lossSoft : tone === 'warn' ? palette.warnSoft : palette.brandSoft;
  const color =
    tone === 'gain' ? '#166534' : tone === 'loss' ? '#991b1b' : tone === 'warn' ? '#92400e' : '#3730a3';
  return (
    <View style={[styles.banner, { backgroundColor: background }]}>
      <Text style={[styles.bannerText, { color }]}>{children}</Text>
    </View>
  );
};

export const Label = ({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }): React.JSX.Element => (
  <Text style={[styles.label, style]}>{children}</Text>
);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  scrollContent: { padding: spacing.lg, paddingBottom: spacing.xxl * 2, gap: spacing.lg },
  header: { gap: 2 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: palette.text, letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 14, color: palette.muted },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: palette.border,
    gap: spacing.md,
    ...shadow,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: palette.muted, textTransform: 'uppercase', letterSpacing: 0.8 },
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  buttonGhost: { borderWidth: 1, borderColor: palette.border },
  buttonLabel: { fontSize: 15, fontWeight: '700' },
  field: { gap: spacing.xs },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: palette.muted },
  fieldHint: { fontSize: 12, color: palette.faint },
  input: {
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: spacing.md,
    fontSize: 15,
    color: palette.text,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: spacing.md,
    minHeight: 56,
  },
  amountPrefix: { fontSize: 22, fontWeight: '700', color: palette.muted, marginRight: 4 },
  amountInput: { flex: 1, fontSize: 24, fontWeight: '700', color: palette.text, paddingVertical: spacing.sm },
  segmented: {
    flexDirection: 'row',
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.md,
    padding: 3,
    gap: 3,
  },
  segment: { flex: 1, paddingVertical: 9, borderRadius: radius.sm, alignItems: 'center' },
  segmentActive: { backgroundColor: palette.surface, ...shadow },
  segmentLabel: { fontSize: 13, fontWeight: '600', color: palette.muted },
  segmentLabelActive: { color: palette.text },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  chipLabel: { fontSize: 13, fontWeight: '600', color: palette.muted },
  chipLabelActive: { color: '#ffffff' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  rowAccent: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: palette.text },
  rowSubtitle: { fontSize: 12.5, color: palette.muted },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: palette.surfaceAlt, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  empty: { paddingVertical: spacing.xl, alignItems: 'center', gap: spacing.xs },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: palette.text },
  emptyBody: { fontSize: 13.5, color: palette.muted, textAlign: 'center', lineHeight: 20 },
  banner: { borderRadius: radius.md, padding: spacing.md },
  bannerText: { fontSize: 13.5, lineHeight: 20, fontWeight: '500' },
  label: { fontSize: 12.5, color: palette.muted },
});
