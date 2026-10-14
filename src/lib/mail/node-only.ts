/**
 * Mailers that need Node APIs. They're loaded with a computed specifier so
 * bundlers can't follow the import: none of this ends up in a Workers build.
 */
import { formatAddress, type Mailer } from './types';

const load = <T>(specifier: string): Promise<T> => import(/* @vite-ignore */ specifier);

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
}

/** SMTP via Nodemailer (Node only). */
export function smtp(config: SmtpConfig): Mailer {
  return {
    async send(message) {
      const nodemailer = await load<typeof import('nodemailer')>('nodemailer');
      const transport = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: config.user ? { user: config.user, pass: config.pass } : undefined,
      });
      await transport.sendMail({
        from: formatAddress(message.from),
        to: message.to,
        replyTo: formatAddress(message.replyTo),
        subject: message.subject,
        text: message.text,
      });
    },
  };
}

/** Development and tests: log instead of sending, optionally to a JSONL file. */
export function logMailer(file?: string): Mailer {
  return {
    async send(message) {
      if (!file) {
        console.info('[mail:log]', JSON.stringify(message));
        return;
      }
      const fs = await load<typeof import('node:fs/promises')>('node:fs/promises');
      await fs.appendFile(file, JSON.stringify(message) + '\n');
    },
  };
}
