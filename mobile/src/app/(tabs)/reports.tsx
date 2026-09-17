import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import {
  AmountInput,
  Banner,
  Bar,
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
import { buildSnapshot, spendByCategory, type Investment } from '@/lib/gains';
import { currentMonth, formatInr, monthLabel, parseRupees, previousMonth, todayIso } from '@/lib/money';
import { palette, radius, spacing } from '@/lib/theme';
import { ApiError } from '@/lib/api';

export default function ReportsScreen(): React.JSX.Element {
  const { data, session, save, signOut, setMonthlyEmail, emailReport, sync } = useFinLedger();
  const [month, setMonth] = useState(currentMonth());
  const [investAmount, setInvestAmount] = useState('');
  const [instrument, setInstrument] = useState('');
  const [emailState, setEmailState] = useState<string | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);

  const snapshot = useMemo(() => buildSnapshot(data, month), [data, month]);
  const previous = useMemo(() => buildSnapshot(data, previousMonth(month)), [data, month]);
  const categories = useMemo(
    () => spendByCategory(data.transactions, data.categories, month),
    [data, month],
  );
  const topSpend = categories[0]?.amount ?? 0;

  const topLeaks = useMemo(
    () =>
      data.transactions
        .filter(
          (row) => !row.deleted && row.type === 'expense' && row.worth === 'not_worth' && row.occurredOn.startsWith(month),
        )
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5),
    [data.transactions, month],
  );

  const investments = useMemo(
    () => data.investments.filter((row) => !row.deleted && row.forMonth === month),
    [data.investments, month],
  );

  const delta = snapshot.netGain - previous.netGain;
  const tone = snapshot.status === 'green' ? 'gain' : snapshot.status === 'red' ? 'loss' : 'muted';

  const recordInvestment = async (): Promise<void> => {
    const paise = parseRupees(investAmount);
    if (paise === null || paise <= 0) return;
    await save('investments', {
      amount: paise,
      instrument: instrument.trim(),
      note: '',
      forMonth: month,
      occurredOn: todayIso(),
    });
    setInvestAmount('');
    setInstrument('');
  };

  const sendEmail = async (): Promise<void> => {
    setEmailBusy(true);
    setEmailState(null);
    try {
      const to = await emailReport(month);
      setEmailState(`Statement sent to ${to}.`);
    } catch (error) {
      setEmailState(
        error instanceof ApiError && error.status === 0
          ? 'You are offline. Connect and try again.'
          : 'Could not send the statement. Check the mail settings on the server.',
      );
    } finally {
      setEmailBusy(false);
    }
  };

  return (
    <Screen>
      <Header title="Your month" subtitle={monthLabel(month)} />

      <View style={styles.monthRow}>
        <Pressable onPress={() => setMonth(previousMonth(month))} style={styles.monthButton}>
          <Text style={styles.monthButtonText}>← {monthLabel(previousMonth(month)).split(' ')[0]}</Text>
        </Pressable>
        {month !== currentMonth() ? (
          <Pressable onPress={() => setMonth(currentMonth())} style={styles.monthButton}>
            <Text style={styles.monthButtonText}>This month →</Text>
          </Pressable>
        ) : null}
      </View>

      <Card style={styles.hero}>
        <Text style={styles.heroLabel}>Net gain</Text>
        <Money paise={snapshot.netGain} size={38} tone={tone} decimals={false} />
        <Text style={styles.heroCaption}>
          {delta === 0
            ? 'Level with last month.'
            : delta > 0
              ? `${formatInr(delta, { decimals: false })} better than ${monthLabel(previousMonth(month)).split(' ')[0]}.`
              : `${formatInr(Math.abs(delta), { decimals: false })} worse than ${monthLabel(previousMonth(month)).split(' ')[0]}.`}
        </Text>
      </Card>

      <Card>
        <SectionTitle>The maths</SectionTitle>
        <Row title="Saved by choosing cheaper" right={<Money paise={snapshot.saved} size={15} tone="gain" />} />
        <Row title="Lost on not-worth-it spends" right={<Money paise={snapshot.leaked} size={15} tone="loss" />} />
        <View style={styles.rule} />
        <Row title="Net gain" right={<Money paise={snapshot.netGain} size={16} tone={tone} />} />
        <View style={styles.rule} />
        <Row title="Income" right={<Money paise={snapshot.income} size={15} tone="muted" />} />
        <Row title="Expenses" right={<Money paise={snapshot.expense} size={15} tone="muted" />} />
        <Row title="Cash left over" right={<Money paise={snapshot.netCash} size={15} tone="muted" />} />
      </Card>

      {snapshot.investSuggestion > 0 ? (
        <Banner tone="gain">
          {month === currentMonth()
            ? `${monthLabel(month)} is running green.`
            : `${monthLabel(month)} closed green.`}{' '}
          {formatInr(snapshot.investSuggestion, { decimals: false })} is free to invest — that is money you earned by
          choosing well, not by earning more.
        </Banner>
      ) : snapshot.status === 'red' ? (
        <Banner tone="loss">
          Leaks outweighed saves this month. Cutting just your biggest one would have swung{' '}
          {formatInr(topLeaks[0]?.amount ?? 0, { decimals: false })} back your way.
        </Banner>
      ) : null}

      <Card>
        <SectionTitle>Put it to work</SectionTitle>
        {investments.length > 0 ? (
          investments.map((row) => (
            <Row
              key={row.id}
              title={row.instrument || 'Invested'}
              subtitle={row.occurredOn}
              accent={palette.brand}
              right={<Money paise={row.amount} size={15} />}
            />
          ))
        ) : (
          <Text style={styles.hint}>
            When the month ends green, record what you actually invested so the suggestion stays honest.
          </Text>
        )}
        <Field label="Amount invested">
          <AmountInput value={investAmount} onChangeText={setInvestAmount} />
        </Field>
        <Field label="Where">
          <Input value={instrument} onChangeText={setInstrument} placeholder="Index fund SIP" />
        </Field>
        <Button
          label="Record investment"
          variant="ghost"
          onPress={() => void recordInvestment()}
          disabled={parseRupees(investAmount) === null}
        />
      </Card>

      <Card>
        <SectionTitle>Where the money went</SectionTitle>
        {categories.length === 0 ? (
          <Empty title="No spending logged" body="Add expenses to see the split by category." />
        ) : (
          categories.map((category) => (
            <View key={category.name} style={styles.category}>
              <View style={styles.categoryRow}>
                <Text style={styles.categoryName}>{category.name}</Text>
                <Money paise={category.amount} size={14} tone="muted" decimals={false} />
              </View>
              <View style={styles.categoryTrack}>
                <View
                  style={[
                    styles.categoryFill,
                    {
                      width: `${topSpend === 0 ? 0 : Math.round((category.amount / topSpend) * 100)}%`,
                      backgroundColor: category.color,
                    },
                  ]}
                />
              </View>
            </View>
          ))
        )}
      </Card>

      {topLeaks.length > 0 ? (
        <Card>
          <SectionTitle>Biggest leaks</SectionTitle>
          {topLeaks.map((row) => (
            <Row
              key={row.id}
              title={row.note || 'Not worth it'}
              subtitle={row.occurredOn}
              accent={palette.loss}
              right={<Money paise={row.amount} size={15} tone="loss" decimals={false} />}
            />
          ))}
        </Card>
      ) : null}

      <Card>
        <SectionTitle>Statement by email</SectionTitle>
        <Text style={styles.hint}>
          FinLedger emails you this statement when the month closes. You can also send it now.
        </Text>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Email me every month</Text>
          <Switch
            value={session?.user.monthlyEmail ?? true}
            onValueChange={(next) => void setMonthlyEmail(next)}
            trackColor={{ true: palette.gain, false: palette.border }}
          />
        </View>
        <Button
          label={`Send ${monthLabel(month)} statement now`}
          variant="ghost"
          onPress={() => void sendEmail()}
          loading={emailBusy}
        />
        {emailState ? <Text style={styles.emailState}>{emailState}</Text> : null}
      </Card>

      <Card>
        <SectionTitle>Account</SectionTitle>
        <Row title={session?.user.name ?? ''} subtitle={session?.user.email} />
        <Button label="Sync now" variant="ghost" onPress={() => void sync()} />
        <Button label="Sign out" variant="danger" onPress={() => void signOut()} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  monthRow: { flexDirection: 'row', gap: spacing.sm },
  monthButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  monthButtonText: { fontSize: 13, fontWeight: '600', color: palette.brand },
  hero: { alignItems: 'center', gap: spacing.xs },
  heroLabel: { fontSize: 13, fontWeight: '600', color: palette.muted, textTransform: 'uppercase', letterSpacing: 0.8 },
  heroCaption: { fontSize: 13.5, color: palette.muted, textAlign: 'center' },
  rule: { height: 1, backgroundColor: palette.surfaceAlt },
  hint: { fontSize: 13, color: palette.muted, lineHeight: 19 },
  category: { gap: 5, marginTop: spacing.sm },
  categoryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  categoryName: { fontSize: 14, fontWeight: '600', color: palette.text },
  categoryTrack: { height: 7, borderRadius: 4, backgroundColor: palette.surfaceAlt, overflow: 'hidden' },
  categoryFill: { height: 7, borderRadius: 4 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchLabel: { fontSize: 14.5, fontWeight: '600', color: palette.text },
  emailState: { fontSize: 13, color: palette.muted, lineHeight: 19 },
});
