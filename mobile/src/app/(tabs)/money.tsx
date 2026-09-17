import React, { useMemo, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  AmountInput,
  Bar,
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
  Segmented,
} from '@/components/ui';
import { useFinLedger } from '@/lib/store';
import { budgetProgress, buildSnapshot, groupByDay, type Budget, type Transaction } from '@/lib/gains';
import { currentMonth, dayLabel, formatInr, monthLabel, parseRupees, todayIso } from '@/lib/money';
import { palette, spacing } from '@/lib/theme';

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

export default function MoneyScreen(): React.JSX.Element {
  const { data, save, remove } = useFinLedger();
  const month = currentMonth();

  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [worth, setWorth] = useState<'worth' | 'not_worth' | null>(null);
  const [budgetAmount, setBudgetAmount] = useState('');
  const [budgetCategory, setBudgetCategory] = useState<string | null>(null);

  const snapshot = useMemo(() => buildSnapshot(data, month), [data, month]);
  const categories = useMemo(
    () => data.categories.filter((row) => !row.deleted && row.kind === type),
    [data.categories, type],
  );
  const expenseCategories = useMemo(
    () => data.categories.filter((row) => !row.deleted && row.kind === 'expense'),
    [data.categories],
  );
  const budgets = useMemo(
    () => budgetProgress(data.budgets, data.transactions, data.categories, month),
    [data, month],
  );
  const entries = useMemo(
    () =>
      groupByDay(
        data.transactions
          .filter((row) => !row.deleted && row.occurredOn.startsWith(month))
          .sort((a, b) => b.updatedAt - a.updatedAt),
      ).slice(0, 6),
    [data.transactions, month],
  );

  const paise = parseRupees(amount);
  const canSave = paise !== null && paise > 0;

  const submit = async (): Promise<void> => {
    if (!canSave) return;
    await save('transactions', {
      type,
      amount: paise,
      categoryId,
      note: note.trim(),
      worth: type === 'expense' ? worth : null,
      occurredOn: todayIso(),
    });
    setAmount('');
    setNote('');
    setWorth(null);
  };

  const saveBudget = async (): Promise<void> => {
    const limit = parseRupees(budgetAmount);
    if (limit === null || limit <= 0) return;
    const existing = data.budgets.find(
      (row) => !row.deleted && row.month === month && row.categoryId === budgetCategory,
    );
    await save('budgets', {
      ...(existing ? { id: existing.id } : {}),
      categoryId: budgetCategory,
      month,
      limitAmount: limit,
    });
    setBudgetAmount('');
  };

  const categoryName = (id: string | null): string =>
    id ? (data.categories.find((row) => row.id === id)?.name ?? 'Uncategorised') : 'Uncategorised';

  return (
    <Screen>
      <Header title="Money in, money out" subtitle={monthLabel(month)} />

      <Card>
        <View style={styles.totals}>
          <View style={styles.total}>
            <Text style={styles.totalLabel}>Income</Text>
            <Money paise={snapshot.income} size={18} tone="gain" decimals={false} />
          </View>
          <View style={styles.total}>
            <Text style={styles.totalLabel}>Spent</Text>
            <Money paise={snapshot.expense} size={18} tone="loss" decimals={false} />
          </View>
          <View style={styles.total}>
            <Text style={styles.totalLabel}>Left</Text>
            <Money paise={snapshot.netCash} size={18} tone={snapshot.netCash >= 0 ? 'text' : 'loss'} decimals={false} />
          </View>
        </View>
      </Card>

      <Card>
        <SectionTitle>Add an entry</SectionTitle>
        <Segmented
          value={type}
          onChange={(next) => {
            setType(next);
            setCategoryId(null);
          }}
          options={[
            { value: 'expense', label: 'Expense' },
            { value: 'income', label: 'Income' },
          ]}
        />

        <Field label="Amount">
          <AmountInput value={amount} onChangeText={setAmount} />
        </Field>

        <Field label="Category">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {categories.map((category) => (
              <Chip
                key={category.id}
                label={category.name}
                color={category.color}
                active={categoryId === category.id}
                onPress={() => setCategoryId(categoryId === category.id ? null : category.id)}
              />
            ))}
          </ScrollView>
        </Field>

        <Field label="Note">
          <Input value={note} onChangeText={setNote} placeholder="Groceries for the week" />
        </Field>

        {type === 'expense' ? (
          <Field label="Was it worth it?" hint="Marking it not worth it moves it onto your Leaks page.">
            <Segmented
              value={worth ?? 'undecided'}
              onChange={(next) => setWorth(next === 'undecided' ? null : (next as 'worth' | 'not_worth'))}
              options={[
                { value: 'worth', label: 'Worth it' },
                { value: 'undecided', label: 'Decide later' },
                { value: 'not_worth', label: 'Not worth' },
              ]}
            />
          </Field>
        ) : null}

        <Button label="Save entry" onPress={() => void submit()} disabled={!canSave} />
      </Card>

      <Card>
        <SectionTitle>Budgets for {monthLabel(month)}</SectionTitle>
        {budgets.length === 0 ? (
          <Empty title="No budgets set" body="Set a cap for a category and track how much room is left." />
        ) : (
          budgets.map((budget) => (
            <View key={budget.id} style={styles.budget}>
              <View style={styles.budgetRow}>
                <Text style={styles.budgetName}>{budget.name}</Text>
                <Text style={[styles.budgetValue, budget.remaining < 0 && styles.budgetOver]}>
                  {budget.remaining >= 0
                    ? `${formatInr(budget.remaining, { decimals: false })} left`
                    : `${formatInr(Math.abs(budget.remaining), { decimals: false })} over`}
                </Text>
              </View>
              <Bar
                percent={budget.usedPercent}
                tone={budget.usedPercent >= 100 ? 'loss' : budget.usedPercent >= 80 ? 'warn' : 'gain'}
              />
              <Text style={styles.budgetMeta}>
                {formatInr(budget.spent, { decimals: false })} of {formatInr(budget.limit, { decimals: false })} ·{' '}
                {budget.usedPercent}%
              </Text>
            </View>
          ))
        )}

        <View style={styles.budgetForm}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <Chip
              label="Everything"
              active={budgetCategory === null}
              onPress={() => setBudgetCategory(null)}
            />
            {expenseCategories.map((category) => (
              <Chip
                key={category.id}
                label={category.name}
                color={category.color}
                active={budgetCategory === category.id}
                onPress={() => setBudgetCategory(category.id)}
              />
            ))}
          </ScrollView>
          <AmountInput value={budgetAmount} onChangeText={setBudgetAmount} placeholder="Monthly cap" />
          <Button
            label="Set budget"
            variant="ghost"
            onPress={() => void saveBudget()}
            disabled={parseRupees(budgetAmount) === null}
          />
        </View>
      </Card>

      <Card>
        <SectionTitle>This month</SectionTitle>
        {entries.length === 0 ? (
          <Empty title="Nothing logged" body="Add your first expense or income above." />
        ) : (
          entries.map(([date, rows]) => (
            <View key={date} style={styles.group}>
              <Text style={styles.groupLabel}>{dayLabel(date)}</Text>
              {rows.map((row) => (
                <Row
                  key={row.id}
                  title={row.note || categoryName(row.categoryId)}
                  subtitle={
                    row.type === 'expense' && row.worth === 'not_worth'
                      ? `${categoryName(row.categoryId)} · not worth it`
                      : categoryName(row.categoryId)
                  }
                  accent={row.type === 'income' ? palette.gain : row.worth === 'not_worth' ? palette.loss : palette.border}
                  onPress={() => confirmDelete(row.note || 'this entry', () => void remove('transactions', row.id))}
                  right={
                    <Money
                      paise={row.amount}
                      size={15}
                      tone={row.type === 'income' ? 'gain' : 'text'}
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
  totals: { flexDirection: 'row' },
  total: { flex: 1, alignItems: 'center', gap: 2 },
  totalLabel: { fontSize: 12, fontWeight: '600', color: palette.muted },
  chips: { gap: spacing.sm, paddingRight: spacing.lg },
  budget: { gap: spacing.xs, marginTop: spacing.sm },
  budgetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  budgetName: { fontSize: 14.5, fontWeight: '600', color: palette.text },
  budgetValue: { fontSize: 13, fontWeight: '600', color: palette.muted },
  budgetOver: { color: palette.loss },
  budgetMeta: { fontSize: 12, color: palette.faint },
  budgetForm: { gap: spacing.md, marginTop: spacing.md, borderTopWidth: 1, borderTopColor: palette.surfaceAlt, paddingTop: spacing.md },
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
