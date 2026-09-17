import React, { useMemo, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  AmountInput,
  Banner,
  Button,
  Card,
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
import { buildSnapshot, groupByDay, type Transaction } from '@/lib/gains';
import { currentMonth, dayLabel, formatInr, parseRupees, todayIso } from '@/lib/money';
import { palette, radius, spacing } from '@/lib/theme';

const confirmDelete = (title: string, onConfirm: () => void): void => {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`Remove “${title}”?`)) onConfirm();
    return;
  }
  Alert.alert('Remove this entry?', title, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: onConfirm },
  ]);
};

export default function LeaksScreen(): React.JSX.Element {
  const { data, save, remove } = useFinLedger();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const month = currentMonth();
  const snapshot = useMemo(() => buildSnapshot(data, month), [data, month]);

  const leaks = useMemo(
    () =>
      groupByDay(
        data.transactions
          .filter((row) => !row.deleted && row.type === 'expense' && row.worth === 'not_worth')
          .sort((a, b) => b.updatedAt - a.updatedAt),
      ),
    [data.transactions],
  );

  /** Expenses you have not judged yet — triaging these is what keeps the number honest. */
  const unjudged = useMemo(
    () =>
      data.transactions
        .filter((row) => !row.deleted && row.type === 'expense' && row.worth === null)
        .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn))
        .slice(0, 8),
    [data.transactions],
  );

  const paise = parseRupees(amount);
  const canSave = paise !== null && paise > 0;

  const submit = async (): Promise<void> => {
    if (!canSave) return;
    await save('transactions', {
      type: 'expense',
      amount: paise,
      categoryId: null,
      note: note.trim() || 'Not worth it',
      worth: 'not_worth',
      occurredOn: todayIso(),
    });
    setAmount('');
    setNote('');
  };

  const judge = async (row: Transaction, worth: 'worth' | 'not_worth'): Promise<void> => {
    await save('transactions', { ...row, worth });
  };

  return (
    <Screen>
      <Header title="Was it worth it?" subtitle="Spending you would take back" />

      <Banner tone={snapshot.leaked > 0 ? 'loss' : 'brand'}>
        {snapshot.leaked > 0 ? (
          <>
            {formatInr(snapshot.leaked, { decimals: false })} went on things you flagged as not worth it this month.
            That is {formatInr(snapshot.leaked, { decimals: false })} straight off your gains.
          </>
        ) : (
          <>Nothing flagged yet this month. Log the ones that stung and watch what they cost you together.</>
        )}
      </Banner>

      <Card>
        <SectionTitle>Log a regret</SectionTitle>
        <Field label="How much did it cost?">
          <AmountInput value={amount} onChangeText={setAmount} testID="leak-amount" />
        </Field>
        <Field label="What was it?" hint="Be honest — this is the list you will read at month end.">
          <Input value={note} onChangeText={setNote} placeholder="Impulse snack at the station" />
        </Field>
        <Button
          label="Count it as a loss"
          variant="danger"
          onPress={() => void submit()}
          disabled={!canSave}
          testID="leak-submit"
        />
      </Card>

      {unjudged.length > 0 ? (
        <Card>
          <SectionTitle>Quick review</SectionTitle>
          <Text style={styles.reviewHint}>
            You logged these expenses without judging them. Tap one to decide.
          </Text>
          {unjudged.map((row) => (
            <View key={row.id} style={styles.reviewRow}>
              <View style={styles.reviewBody}>
                <Text style={styles.reviewTitle} numberOfLines={1}>
                  {row.note || 'Expense'}
                </Text>
                <Text style={styles.reviewMeta}>
                  {dayLabel(row.occurredOn)} · {formatInr(row.amount, { decimals: false })}
                </Text>
              </View>
              <View style={styles.judgeRow}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void judge(row, 'worth')}
                  style={[styles.judge, styles.judgeWorth]}>
                  <Text style={styles.judgeWorthText}>Worth it</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void judge(row, 'not_worth')}
                  style={[styles.judge, styles.judgeNot]}>
                  <Text style={styles.judgeNotText}>Not worth</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      <Card>
        <SectionTitle>Your leaks</SectionTitle>
        {leaks.length === 0 ? (
          <Empty
            title="No leaks flagged"
            body="Nothing here is a good thing. When a spend turns out not to be worth it, log it so month end tells the truth."
          />
        ) : (
          leaks.map(([date, rows]) => (
            <View key={date} style={styles.group}>
              <Text style={styles.groupLabel}>{dayLabel(date)}</Text>
              {rows.map((row) => (
                <Row
                  key={row.id}
                  title={row.note || 'Not worth it'}
                  accent={palette.loss}
                  onPress={() => confirmDelete(row.note || 'this entry', () => void remove('transactions', row.id))}
                  right={<Money paise={row.amount} size={15} tone="loss" decimals={false} />}
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
  reviewHint: { fontSize: 13, color: palette.muted, lineHeight: 19 },
  reviewRow: {
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: palette.surfaceAlt,
  },
  reviewBody: { gap: 2 },
  reviewTitle: { fontSize: 14.5, fontWeight: '600', color: palette.text },
  reviewMeta: { fontSize: 12.5, color: palette.muted },
  judgeRow: { flexDirection: 'row', gap: spacing.sm },
  judge: { flex: 1, paddingVertical: 9, borderRadius: radius.sm, alignItems: 'center', borderWidth: 1 },
  judgeWorth: { backgroundColor: palette.gainSoft, borderColor: '#bbf7d0' },
  judgeWorthText: { fontSize: 13, fontWeight: '700', color: '#166534' },
  judgeNot: { backgroundColor: palette.lossSoft, borderColor: '#fecaca' },
  judgeNotText: { fontSize: 13, fontWeight: '700', color: '#991b1b' },
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
