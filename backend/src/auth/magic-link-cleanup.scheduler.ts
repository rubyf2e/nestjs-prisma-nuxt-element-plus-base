import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MagicLinkCleanupScheduler {
  private readonly logger = new Logger(MagicLinkCleanupScheduler.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupExpiredMagicLinks(): Promise<number> {
    const { count } = await this.prisma.magicLink.deleteMany({
      where: {
        usedAt: null,
        expiresAt: { lt: new Date() },
      },
    });

    this.logger.log(`已清理 ${count} 筆過期且未使用的 MagicLink`);
    return count;
  }
}