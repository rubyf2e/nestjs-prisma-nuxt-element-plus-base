import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { MagicLinkCleanupScheduler } from './magic-link-cleanup.scheduler';

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

type MagicLinkFixture = {
  expiresAt: Date;
  usedAt: Date | null;
};

type DeleteManyArgs = {
  where: {
    usedAt: null;
    expiresAt: { lt: Date };
  };
};

describe('MagicLink 清理排程', () => {
  let scheduler: MagicLinkCleanupScheduler;
  let prisma: { magicLink: { deleteMany: jest.Mock } };

  beforeEach(async () => {
    prisma = { magicLink: { deleteMany: jest.fn() } };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MagicLinkCleanupScheduler,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    scheduler = module.get(MagicLinkCleanupScheduler);
  });

  function mockDeleteManyFor(links: MagicLinkFixture[]) {
    prisma.magicLink.deleteMany.mockImplementation(async (args: DeleteManyArgs) => ({
      count: links.filter(
        (link) => link.usedAt === args.where.usedAt && link.expiresAt < args.where.expiresAt.lt,
      ).length,
    }));
  }

  it('刪除已過期且未使用的 MagicLink', async () => {
    mockDeleteManyFor([{ expiresAt: new Date(Date.now() - 60_000), usedAt: null }]);

    await expect(scheduler.cleanupExpiredMagicLinks()).resolves.toBe(1);
  });

  it('不刪除尚未過期且未使用的 MagicLink', async () => {
    mockDeleteManyFor([{ expiresAt: new Date(Date.now() + 60_000), usedAt: null }]);

    await expect(scheduler.cleanupExpiredMagicLinks()).resolves.toBe(0);
  });

  it('不處理已使用但已過期的 MagicLink', async () => {
    mockDeleteManyFor([{ expiresAt: new Date(Date.now() - 60_000), usedAt: new Date() }]);

    await expect(scheduler.cleanupExpiredMagicLinks()).resolves.toBe(0);
  });

  it('以單次 deleteMany 使用指定的 where 條件並回傳刪除筆數', async () => {
    prisma.magicLink.deleteMany.mockResolvedValue({ count: 4 });

    await expect(scheduler.cleanupExpiredMagicLinks()).resolves.toBe(4);

    expect(prisma.magicLink.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.magicLink.deleteMany).toHaveBeenCalledWith({
      where: {
        usedAt: null,
        expiresAt: { lt: expect.any(Date) },
      },
    });
  });
});