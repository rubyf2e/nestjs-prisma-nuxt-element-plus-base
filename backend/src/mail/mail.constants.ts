export const MAIL_QUEUE = 'mail';
export const SEND_MAGIC_LINK_EMAIL_JOB = 'send-magic-link-email';

export interface SendMagicLinkEmailJobData {
  recipientEmail: string;
  loginUrl: string;
}