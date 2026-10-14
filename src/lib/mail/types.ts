export interface MailMessage {
  from: { name: string; address: string };
  to: string;
  replyTo: { name: string; address: string };
  subject: string;
  text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export const formatAddress = ({ name, address }: { name: string; address: string }) =>
  `"${name.replace(/["\\\r\n]/g, '')}" <${address}>`;
