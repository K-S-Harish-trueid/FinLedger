/** Amounts travel and are stored as integer paise, matching the API. */
export const RUPEE = 100;

export const rupeesToPaise = (rupees: number): number => Math.round(rupees * RUPEE);

export const parseRupees = (input: string): number | null => {
  const cleaned = input.replace(/[₹,\s]/g, '');
  if (cleaned === '') return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return rupeesToPaise(value);
};

const group = (whole: number): string => {
  const digits = String(whole);
  const head = digits.slice(0, -3);
  const tail = digits.slice(-3);
  return head ? `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${tail}` : tail;
};

export const formatInr = (paise: number, options: { decimals?: boolean } = {}): string => {
  const sign = paise < 0 ? '-' : '';
  const absolute = Math.abs(paise);
  const whole = Math.floor(absolute / RUPEE);
  if (options.decimals === false) return `${sign}₹${group(whole)}`;
  return `${sign}₹${group(whole)}.${String(absolute % RUPEE).padStart(2, '0')}`;
};

export const formatSigned = (paise: number): string =>
  `${paise > 0 ? '+' : ''}${formatInr(paise, { decimals: false })}`;

export const todayIso = (): string => new Date().toISOString().slice(0, 10);

export const currentMonth = (): string => todayIso().slice(0, 7);

export const monthLabel = (month: string): string => {
  const [year, index] = month.split('-');
  const names = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return `${names[Number(index) - 1] ?? month} ${year}`;
};

export const previousMonth = (month: string): string => {
  const [yearText, monthText] = month.split('-');
  const year = Number(yearText);
  const index = Number(monthText);
  const prevYear = index === 1 ? year - 1 : year;
  const prevIndex = index === 1 ? 12 : index - 1;
  return `${prevYear}-${String(prevIndex).padStart(2, '0')}`;
};

export const dayLabel = (iso: string): string => {
  const today = todayIso();
  if (iso === today) return 'Today';
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (iso === yesterday) return 'Yesterday';
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
};
