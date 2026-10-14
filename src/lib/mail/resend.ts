import { formatAddress, type Mailer } from './types';

export interface ResendConfig {
  apiKey: string;
}

/** Resend HTTP API with plain fetch: no SDK, runs on Node and Workers. */
export function resend({ apiKey }: ResendConfig): Mailer {
  return {
    async send(message) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          // Resend rejects requests without one, and Workers' fetch doesn't add it.
          'User-Agent': 'devnel-com',
        },
        body: JSON.stringify({
          from: formatAddress(message.from),
          to: [message.to],
          reply_to: formatAddress(message.replyTo),
          subject: message.subject,
          text: message.text,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        throw new Error(`Resend responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
      }
    },
  };
}
