import nodemailer, { type Transporter } from 'nodemailer';
import { config, isSmtpConfigured } from './config.ts';
import { formatInr } from './money.ts';
import type { MonthlyReport } from './reports.ts';

let cached: Transporter | null = null;

/**
 * Falls back to nodemailer's JSON transport when no SMTP credentials are set,
 * so development and tests exercise the same code path without sending mail.
 */
export const getTransport = (): Transporter => {
  if (cached) return cached;
  cached = isSmtpConfigured()
    ? nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.port === 465,
        auth: { user: config.smtp.user as string, pass: config.smtp.pass as string },
      })
    : nodemailer.createTransport({ jsonTransport: true });
  return cached;
};

const monthLabel = (month: string): string => {
  const [year, index] = month.split('-');
  const names = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return `${names[Number(index) - 1] ?? month} ${year}`;
};

const row = (label: string, value: string, color = '#0f172a'): string => `
  <tr>
    <td style="padding:10px 0;color:#475569;font-size:14px;">${label}</td>
    <td style="padding:10px 0;text-align:right;font-weight:600;font-size:14px;color:${color};">${value}</td>
  </tr>`;

const listItems = (items: Array<{ label: string; amount: number }>, empty: string): string => {
  if (items.length === 0) return `<p style="color:#94a3b8;font-size:14px;margin:8px 0 0;">${empty}</p>`;
  return `<ul style="margin:8px 0 0;padding-left:18px;color:#334155;font-size:14px;line-height:1.7;">${items
    .map((item) => `<li>${escapeHtml(item.label)} — <strong>${formatInr(item.amount)}</strong></li>`)
    .join('')}</ul>`;
};

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] as string,
  );

export const renderMonthlyEmail = (name: string, report: MonthlyReport): { subject: string; html: string; text: string } => {
  const green = report.netGain > 0;
  const accent = green ? '#16a34a' : report.netGain < 0 ? '#dc2626' : '#64748b';
  const headline = green
    ? `You finished ${monthLabel(report.month)} up ${formatInr(report.netGain)}`
    : report.netGain < 0
      ? `You finished ${monthLabel(report.month)} down ${formatInr(Math.abs(report.netGain))}`
      : `You broke even in ${monthLabel(report.month)}`;

  const nudge = report.investSuggestion > 0
    ? `<div style="margin-top:20px;padding:16px;border-radius:12px;background:#f0fdf4;border:1px solid #bbf7d0;">
         <p style="margin:0;color:#166534;font-size:15px;line-height:1.6;">
           <strong>Put it to work.</strong> Your month closed green, so
           <strong>${formatInr(report.investSuggestion)}</strong> is free to invest without touching your regular budget.
         </p>
       </div>`
    : `<div style="margin-top:20px;padding:16px;border-radius:12px;background:#fef2f2;border:1px solid #fecaca;">
         <p style="margin:0;color:#991b1b;font-size:15px;line-height:1.6;">
           Not-worth-it spending outweighed what you saved this month. Trimming your biggest leak alone
           would have swung ${formatInr(report.topLeaks[0]?.amount ?? 0)} back your way.
         </p>
       </div>`;

  const html = `<!doctype html>
<html><body style="margin:0;background:#f8fafc;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:28px 20px;">
    <p style="margin:0 0 4px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#6366f1;font-weight:700;">FinLedger</p>
    <h1 style="margin:0 0 6px;font-size:22px;line-height:1.3;color:#0f172a;">${escapeHtml(headline)}</h1>
    <p style="margin:0 0 20px;color:#64748b;font-size:14px;">Hi ${escapeHtml(name)}, here is how ${monthLabel(report.month)} went.</p>

    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;padding:18px 20px;">
      <p style="margin:0;color:#64748b;font-size:13px;">Net gain</p>
      <p style="margin:2px 0 0;font-size:30px;font-weight:700;color:${accent};">${formatInr(report.netGain)}</p>
      <table style="width:100%;border-collapse:collapse;margin-top:10px;border-top:1px solid #f1f5f9;">
        ${row('Saved by choosing cheaper', formatInr(report.saved), '#16a34a')}
        ${row('Lost on not-worth-it spends', formatInr(report.leaked), '#dc2626')}
        ${row('Income', formatInr(report.income))}
        ${row('Expenses', formatInr(report.expense))}
        ${row('Cash left over', formatInr(report.netCash))}
        ${row('Already invested', formatInr(report.invested))}
        ${row('Saving streak', `${report.savingStreakDays} days`)}
      </table>
    </div>

    ${nudge}

    <div style="margin-top:20px;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;padding:18px 20px;">
      <h2 style="margin:0;font-size:15px;color:#0f172a;">Your best saves</h2>
      ${listItems(report.topSavings.slice(0, 5).map((s) => ({ label: s.title, amount: s.amount })), 'No savings logged this month.')}
      <h2 style="margin:18px 0 0;font-size:15px;color:#0f172a;">Where it leaked</h2>
      ${listItems(
        report.topLeaks.slice(0, 5).map((l) => ({ label: l.note || l.category, amount: l.amount })),
        'Nothing flagged as not worth it. Clean month.',
      )}
    </div>

    <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;line-height:1.6;">
      You are getting this because monthly summaries are on in FinLedger. You can turn them off in Settings.
    </p>
  </div>
</body></html>`;

  const text = [
    headline,
    '',
    `Saved: ${formatInr(report.saved)}`,
    `Not-worth-it spends: ${formatInr(report.leaked)}`,
    `Net gain: ${formatInr(report.netGain)}`,
    `Income: ${formatInr(report.income)}`,
    `Expenses: ${formatInr(report.expense)}`,
    `Saving streak: ${report.savingStreakDays} days`,
    report.investSuggestion > 0 ? `Free to invest: ${formatInr(report.investSuggestion)}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return { subject: `${headline} — FinLedger`, html, text };
};

export const sendMonthlyEmail = async (
  to: string,
  name: string,
  report: MonthlyReport,
): Promise<void> => {
  const { subject, html, text } = renderMonthlyEmail(name, report);
  await getTransport().sendMail({ from: config.smtp.from, to, subject, html, text });
};
