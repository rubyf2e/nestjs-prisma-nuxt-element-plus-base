import { MailerService } from '@nestjs-modules/mailer';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Job } from 'bullmq';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import Handlebars from 'handlebars';
import {
  MAIL_QUEUE,
  SEND_MAGIC_LINK_EMAIL_JOB,
  SendMagicLinkEmailJobData,
} from './mail.constants';

@Injectable()
@Processor(MAIL_QUEUE)
export class MailProcessor extends WorkerHost {
  constructor(private readonly mailerService: MailerService) {
    super();
  }

  async process(job: Job<SendMagicLinkEmailJobData>): Promise<void> {
    if (job.name !== SEND_MAGIC_LINK_EMAIL_JOB) {
      throw new Error(`Unsupported mail job: ${job.name}`);
    }

    const template = await readFile(
      join(__dirname, '../auth/templates/magic-link.hbs'),
      'utf8',
    );
    const html = Handlebars.compile(template, { strict: true })({
      loginUrl: job.data.loginUrl,
    });

    await this.mailerService.sendMail({
      to: job.data.recipientEmail,
      subject: 'Your login link',
      html,
    });
  }
}