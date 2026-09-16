const required = (name: string, fallback?: string): string => {
  const value = process.env[name] ?? fallback;
  if (value === undefined) throw new Error(`Missing required env var ${name}`);
  return value;
};

export const config = {
  port: Number(process.env.PORT ?? 4000),
  // `file:...` for local development, `libsql://...` for the hosted database.
  databaseUrl: process.env.DATABASE_URL ?? 'file:finledger.db',
  databaseAuthToken: process.env.DATABASE_AUTH_TOKEN,
  jwtSecret: required('JWT_SECRET', 'dev-only-insecure-secret-change-me'),
  accessTokenTtlSeconds: Number(process.env.ACCESS_TOKEN_TTL ?? 60 * 15),
  refreshTokenTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 60),
  appName: 'FinLedger',
  defaultCurrency: process.env.DEFAULT_CURRENCY ?? 'INR',
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.MAIL_FROM ?? 'FinLedger <no-reply@finledger.app>',
  },
} as const;

export const isSmtpConfigured = (): boolean =>
  Boolean(config.smtp.host && config.smtp.user && config.smtp.pass);
