import { MailerService } from '@nestjs-modules/mailer';
import type { Job } from 'bullmq';
import { MailProcessor } from './mail.processor';
import { SEND_MAGIC_LINK_EMAIL_JOB, SendMagicLinkEmailJobData } from './mail.constants';

describe('MailProcessor', () => {
  let processor: MailProcessor;
  let mailerService: { sendMail: jest.Mock };

  beforeEach(() => {
    mailerService = { sendMail: jest.fn().mockResolvedValue(undefined) };
    processor = new MailProcessor(mailerService as unknown as MailerService);
  });

  it('取得 BullMQ job、渲染登入模板並呼叫 MailerService', async () => {
    const jobData: SendMagicLinkEmailJobData = {
      recipientEmail: 'user@example.com',
      loginUrl: 'https://frontend.example/auth/verify?token=secure-token',
    };
    const job = {
      name: SEND_MAGIC_LINK_EMAIL_JOB,
      data: jobData,
    } as Job<SendMagicLinkEmailJobData>;

    await processor.process(job);

    expect(mailerService.sendMail).toHaveBeenCalledWith({
      to: jobData.recipientEmail,
      subject: 'Your login link',
      html: expect.stringContaining(jobData.loginUrl),
    });
  });
});