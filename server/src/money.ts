/**
 * Every amount crossing the API or stored in SQLite is an integer count of paise.
 * Floating-point rupees are never persisted — they only exist at render time.
 */
export const RUPEE = 100;

export const rupeesToPaise = (rupees: number): number => Math.round(rupees * RUPEE);

export const paiseToRupees = (paise: number): number => paise / RUPEE;

export const formatInr = (paise: number): string => {
  const negative = paise < 0;
  const whole = Math.floor(Math.abs(paise) / RUPEE);
  const fraction = String(Math.abs(paise) % RUPEE).padStart(2, '0');
  // Indian digit grouping: last three digits, then pairs (12,34,567).
  const digits = String(whole);
  const head = digits.slice(0, -3);
  const tail = digits.slice(-3);
  const grouped = head
    ? `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${tail}`
    : tail;
  return `${negative ? '-' : ''}₹${grouped}.${fraction}`;
};
