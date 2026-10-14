import { resend, type ResendConfig } from './resend';
import type { Mailer } from './types';

export type { Mailer, MailMessage } from './types';

export type MailConfig =
  | ({ provider: 'resend' } & Partial<ResendConfig>)
  | ({ provider: 'smtp' } & Partial<import('./node-only').SmtpConfig>)
  | { provider: 'log'; file?: string };

/** Picks the mail provider from config (MAIL_PROVIDER). */
export async function createMailer(config: MailConfig): Promise<Mailer> {
  switch (config.provider) {
    case 'resend': {
      if (!config.apiKey) throw new Error('RESEND_API_KEY is required');
      return resend({ apiKey: config.apiKey });
    }
    case 'smtp': {
      const { smtp } = await import('./node-only');
      if (!config.host) throw new Error('SMTP_HOST is required');
      return smtp({
        host: config.host,
        port: config.port ?? 587,
        secure: config.secure ?? false,
        user: config.user,
        pass: config.pass,
      });
    }
    case 'log': {
      const { logMailer } = await import('./node-only');
      return logMailer(config.file);
    }
  }
}
