import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Banner, Bar, Button, Card, Empty, Header, Money, Row, Screen, SectionTitle } from '@/components/ui';
import { useFinLedger } from '@/lib/store';
import { budgetProgress, buildSnapshot, groupByDay } from '@/lib/gains';
import { currentMonth, dayLabel, formatInr, monthLabel } from '@/lib/money';
import { palette, radius, spacing } from '@/lib/theme';

const SyncPill = (): React.JSX.Element | null => {
  const { syncState, pendingCount } = useFinLedger();
  if (syncState === 'idle' && pendingCount === 0) return null;
  const text =
    syncState === 'syncing'
      ? 'Syncing…'
      : syncState === 'offline'
        ? `Offline — ${pendingCount} change${pendingCount === 1 ? '' : 's'} waiting`
        : syncState === 'error'
          ? 'Sync failed, will retry'
          : `${pendingCount} change${pendingCount === 1 ? '' : 's'} waiting`;
  return (
    <View style={styles.pill}>
      <Text style={styles.pillText}>{text}</Text>
    </View>
  );
};

export default function TodayScreen(): React.JSX.Element {
  const router = useRouter();
  const { data, session } = useFinLedger();
  const month = currentMonth();

  const snapshot = useMemo(() => buildSnapshot(data, month), [data, month]);
  const budgets = useMemo(
    () => budgetProgress(data.budgets, data.transactions, data.categories, month),
    [data, month],
  );

  const recent = useMemo(() => {
    const savings = data.savings
      .filter((row) => !row.deleted)
      .map((row) => ({ kind: 'saving' as const, id: row.id, title: row.title, amount: row.amount, occurredOn: row.occurredOn }));
    const leaks = data.transactions
      .filter((row) => !row.deleted && row.type === 'expense' && row.worth === 'not_worth')
      .map((row) => ({ kind: 'leak' as const, id: row.id, title: row.note || 'Not worth it', amount: row.amount, occurredOn: row.occurredOn }));
    return groupByDay([...savings, ...leaks]).slice(0, 4);
  }, [data]);

  const overBudget = budgets.filter((budget) => budget.usedPercent >= 80);
  const tone = snapshot.status === 'green' ? 'gain' : snapshot.status === 'red' ? 'loss' : 'muted';

  return (
    <Screen>
      <Header
        title={`Hi ${session?.user.name.split(' ')[0] ?? 'there'}`}
        subtitle={`${monthLabel(month)} so far`}
      />
      <SyncPill />

      <Card style={styles.hero}>
        <Text style={styles.heroLabel}>Net gain this month</Text>
        <Money paise={snapshot.netGain} size={42} tone={tone} decimals={false} />
        <Text style={styles.heroCaption}>
          {snapshot.status === 'green'
            ? 'You are ahead. Keep it up.'
            : snapshot.status === 'red'
              ? 'Not-worth-it spending is winning right now.'
              : 'Log a save to get moving.'}
        </Text>

        <View style={styles.split}>
          <View style={styles.splitItem}>
            <Text style={styles.splitLabel}>Saved</Text>
            <Money paise={snapshot.saved} size={20} tone="gain" decimals={false} />
          </View>
          <View style={styles.splitDivider} />
          <View style={styles.splitItem}>
            <Text style={styles.splitLabel}>Leaked</Text>
            <Money paise={snapshot.leaked} size={20} tone="loss" decimals={false} />
          </View>
          <View style={styles.splitDivider} />
          <View style={styles.splitItem}>
            <Text style={styles.splitLabel}>Streak</Text>
            <Text style={styles.streak}>{snapshot.streak}d</Text>
          </View>
        </View>
      </Card>

      <View style={styles.actions}>
        <Button label="+ I saved" variant="gain" onPress={() => router.push('/savings')} style={styles.action} />
        <Button label="− Not worth it" variant="danger" onPress={() => router.push('/leaks')} style={styles.action} />
      </View>

      {snapshot.investSuggestion > 0 ? (
        <Banner tone="gain">
          You are up {formatInr(snapshot.investSuggestion, { decimals: false })} this month. When it closes green, that
          is the amount you can invest without touching your budget.
        </Banner>
      ) : null}

      {overBudget.length > 0 ? (
        <Card>
          <SectionTitle>Budgets to watch</SectionTitle>
          {overBudget.map((budget) => (
            <View key={budget.id} style={styles.budget}>
              <View style={styles.budgetRow}>
                <Text style={styles.budgetName}>{budget.name}</Text>
                <Text style={styles.budgetValue}>
                  {formatInr(budget.spent, { decimals: false })} of {formatInr(budget.limit, { decimals: false })}
                </Text>
              </View>
              <Bar percent={budget.usedPercent} tone={budget.usedPercent >= 100 ? 'loss' : 'warn'} />
            </View>
          ))}
        </Card>
      ) : null}

      <Card>
        <SectionTitle>Recent activity</SectionTitle>
        {recent.length === 0 ? (
          <Empty
            title="Nothing logged yet"
            body="Walked instead of taking the bus? Tap “I saved” and put that fare on your side of the ledger."
          />
        ) : (
          recent.map(([day, entries]) => (
            <View key={day} style={styles.dayGroup}>
              <Text style={styles.dayLabel}>{dayLabel(day)}</Text>
              {entries.map((entry) => (
                <Row
                  key={entry.id}
                  title={entry.title}
                  accent={entry.kind === 'saving' ? palette.gain : palette.loss}
                  right={
                    <Money
                      paise={entry.amount}
                      size={15}
                      tone={entry.kind === 'saving' ? 'gain' : 'loss'}
                      decimals={false}
                    />
                  }
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
  hero: { alignItems: 'center', gap: spacing.xs },
  heroLabel: { fontSize: 13, fontWeight: '600', color: palette.muted, textTransform: 'uppercase', letterSpacing: 0.8 },
  heroCaption: { fontSize: 13.5, color: palette.muted, textAlign: 'center', marginTop: 2 },
  split: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, alignSelf: 'stretch' },
  splitItem: { flex: 1, alignItems: 'center', gap: 2 },
  splitDivider: { width: 1, height: 28, backgroundColor: palette.border },
  splitLabel: { fontSize: 12, color: palette.muted, fontWeight: '600' },
  streak: { fontSize: 20, fontWeight: '700', color: palette.brand },
  actions: { flexDirection: 'row', gap: spacing.md },
  action: { flex: 1 },
  budget: { gap: spacing.xs, marginTop: spacing.xs },
  budgetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  budgetName: { fontSize: 14, fontWeight: '600', color: palette.text },
  budgetValue: { fontSize: 12.5, color: palette.muted },
  dayGroup: { gap: 2 },
  dayLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.faint,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.sm,
  },
  pill: {
    alignSelf: 'flex-start',
    backgroundColor: palette.brandSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  pillText: { fontSize: 12, fontWeight: '600', color: palette.brand },
});
