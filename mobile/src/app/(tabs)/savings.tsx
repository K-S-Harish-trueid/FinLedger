import React, { useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  AmountInput,
  Banner,
  Button,
  Card,
  Chip,
  Empty,
  Field,
  Header,
  Input,
  Money,
  Row,
  Screen,
  SectionTitle,
} from '@/components/ui';
import { useFinLedger } from '@/lib/store';
import { buildSnapshot, groupByDay, type Saving } from '@/lib/gains';
import { currentMonth, dayLabel, parseRupees, todayIso } from '@/lib/money';
import { palette, spacing } from '@/lib/theme';

/** Common swaps, so logging a save is two taps instead of a form. */
const PRESETS = [
  { title: 'Walked instead of the bus', rupees: 30, baseline: 'Bus fare' },
  { title: 'Cooked instead of ordering', rupees: 250, baseline: 'Delivery order' },
  { title: 'Skipped the cab', rupees: 180, baseline: 'Cab fare' },
  { title: 'Carried water', rupees: 20, baseline: 'Bottled water' },
  { title: 'Made coffee at home', rupees: 150, baseline: 'Cafe coffee' },
];

const confirmDelete = (title: string, onConfirm: () => void): void => {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`Remove “${title}”?`)) onConfirm();
    return;
  }
  Alert.alert('Remove this save?', title, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: onConfirm },
  ]);
};

export default function SavingsScreen(): React.JSX.Element {
  const { data, save, remove } = useFinLedger();
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [baseline, setBaseline] = useState('');
  const [day, setDay] = useState(todayIso());

  const month = currentMonth();
  const snapshot = useMemo(() => buildSnapshot(data, month), [data, month]);

  const entries = useMemo(
    () => groupByDay(data.savings.filter((row) => !row.deleted).sort((a, b) => b.updatedAt - a.updatedAt)),
    [data.savings],
  );

  const paise = parseRupees(amount);
  const canSave = paise !== null && paise > 0 && title.trim().length > 0;

  const submit = async (): Promise<void> => {
    if (!canSave) return;
    await save('savings', {
      title: title.trim(),
      amount: paise,
      baseline: baseline.trim(),
      occurredOn: day,
    });
    setAmount('');
    setTitle('');
    setBaseline('');
  };

  const applyPreset = (preset: (typeof PRESETS)[number]): void => {
    setTitle(preset.title);
    setBaseline(preset.baseline);
    setAmount(String(preset.rupees));
  };

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  return (
    <Screen>
      <Header title="What did you save?" subtitle="The cheaper choice you made today" />

      <Banner tone="gain">
        Saved {snapshot.saved > 0 ? '' : 'nothing yet '}this month:{' '}
        <Text style={styles.strong}>₹{Math.floor(snapshot.saved / 100).toLocaleString('en-IN')}</Text>
        {snapshot.streak > 0 ? ` · ${snapshot.streak} day streak` : ''}
      </Banner>

      <Card>
        <SectionTitle>Quick add</SectionTitle>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presets}>
          {PRESETS.map((preset) => (
            <Chip
              key={preset.title}
              label={`${preset.title} · ₹${preset.rupees}`}
              color={palette.gain}
              onPress={() => applyPreset(preset)}
            />
          ))}
        </ScrollView>

        <Field label="Amount you did not spend">
          <AmountInput value={amount} onChangeText={setAmount} />
        </Field>

        <Field label="What did you do?">
          <Input value={title} onChangeText={setTitle} placeholder="Walked to the office" />
        </Field>

        <Field label="Instead of" hint="What it would have cost you otherwise.">
          <Input value={baseline} onChangeText={setBaseline} placeholder="Bus fare" />
        </Field>

        <View style={styles.dayRow}>
          <Pressable onPress={() => setDay(todayIso())} style={[styles.day, day === todayIso() && styles.dayActive]}>
            <Text style={[styles.dayText, day === todayIso() && styles.dayTextActive]}>Today</Text>
          </Pressable>
          <Pressable onPress={() => setDay(yesterday)} style={[styles.day, day === yesterday && styles.dayActive]}>
            <Text style={[styles.dayText, day === yesterday && styles.dayTextActive]}>Yesterday</Text>
          </Pressable>
        </View>

        <Button label="Add to my gains" variant="gain" onPress={() => void submit()} disabled={!canSave} />
      </Card>

      <Card>
        <SectionTitle>Everything you have saved</SectionTitle>
        {entries.length === 0 ? (
          <Empty
            title="No saves logged"
            body="Each time you take the cheaper option, log the difference. Those rupees are what fund your investing at month end."
          />
        ) : (
          entries.map(([date, rows]) => (
            <View key={date} style={styles.group}>
              <Text style={styles.groupLabel}>{dayLabel(date)}</Text>
              {rows.map((row) => (
                <Row
                  key={row.id}
                  title={row.title}
                  subtitle={row.baseline ? `Instead of ${row.baseline}` : undefined}
                  accent={palette.gain}
                  onPress={() => confirmDelete(row.title, () => void remove('savings', row.id))}
                  right={<Money paise={row.amount} size={15} tone="gain" decimals={false} />}
                />
              ))}
            </View>
          ))
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  strong: { fontWeight: '800' },
  presets: { gap: spacing.sm, paddingRight: spacing.lg },
  dayRow: { flexDirection: 'row', gap: spacing.sm },
  day: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    backgroundColor: palette.surface,
  },
  dayActive: { backgroundColor: palette.gain, borderColor: palette.gain },
  dayText: { fontSize: 13.5, fontWeight: '600', color: palette.muted },
  dayTextActive: { color: '#ffffff' },
  group: { gap: 2 },
  groupLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.faint,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.sm,
  },
});
