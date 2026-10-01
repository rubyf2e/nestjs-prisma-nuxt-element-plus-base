import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getQueueToken } from '@nestjs/bullmq';
import { createHash } from 'node:crypto';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { MAIL_QUEUE, SEND_MAGIC_LINK_EMAIL_JOB } from '../mail/mail.constants';

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('登入服務', () => {
  let service: AuthService;
  let prisma: {
    user: { upsert: jest.Mock; update: jest.Mock };
    magicLink: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let jwtService: { signAsync: jest.Mock };
  let mailQueue: { add: jest.Mock };
  let configService: { get: jest.Mock; getOrThrow: jest.Mock };

  const databaseUser = {
    id: 1n,
    publicId: 'user-public-1',
    email: 'user@example.com',
  };
  const responseUser = { id: databaseUser.publicId, email: databaseUser.email };
  const token = 'a'.repeat(64);

  beforeEach(async () => {
    prisma = {
      user: {
        upsert: jest.fn().mockResolvedValue(databaseUser),
        update: jest.fn().mockResolvedValue({
          publicId: databaseUser.publicId,
          email: databaseUser.email,
        }),
      },
      magicLink: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(),
    };
    jwtService = { signAsync: jest.fn().mockResolvedValue('signed.jwt.token') };
    mailQueue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
    const values: Record<string, string> = {
      MAGIC_LINK_TTL_MINUTES: '15',
      FRONTEND_URL: 'https://frontend.example',
    };
    configService = {
      get: jest.fn((key: string) => values[key]),
      getOrThrow: jest.fn((key: string) => values[key]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: getQueueToken(MAIL_QUEUE), useValue: mailQueue },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('建立雜湊後的單次使用 token、將郵件工作加入佇列並回傳通用回應', async () => {
    const response = await service.requestMagicLink(databaseUser.email);
    const createCall = prisma.magicLink.create.mock.calls[0][0];
    const jobData = mailQueue.add.mock.calls[0][1];
    const loginUrl = new URL(jobData.loginUrl);
    const rawToken = loginUrl.searchParams.get('token');

    expect(response).toEqual({
      message: 'If this email can be used, a login link has been sent.',
    });
    expect(prisma.user.upsert).toHaveBeenCalledWith({
      where: { email: databaseUser.email },
      create: { email: databaseUser.email },
      update: {},
    });
    expect(createCall.data.userId).toBe(databaseUser.id);
    expect(createCall.data.tokenHash).toBe(
      createHash('sha256').update(rawToken).digest('hex'),
    );
    expect(createCall.data.tokenHash).not.toBe(rawToken);
    expect(Object.keys(createCall.data).sort()).toEqual([
      'expiresAt',
      'tokenHash',
      'userId',
    ]);
    expect(createCall.data.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(mailQueue.add).toHaveBeenCalledWith(SEND_MAGIC_LINK_EMAIL_JOB, {
      recipientEmail: databaseUser.email,
      loginUrl: expect.stringContaining('/auth/verify?token='),
    });
    expect(Object.keys(jobData).sort()).toEqual(['loginUrl', 'recipientEmail']);
  });

  it('驗證並原子性地使用登入連結、更新最後登入時間，且簽發正確的 JWT payload', async () => {
    const magicLink = {
      id: 1n,
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: databaseUser,
    };
    const transaction = {
      magicLink: {
        findUnique: jest.fn().mockResolvedValue(magicLink),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: {
        update: jest.fn().mockResolvedValue({
          publicId: databaseUser.publicId,
          email: databaseUser.email,
        }),
      },
    };
    prisma.$transaction.mockImplementation(async (callback: unknown) =>
      (callback as (tx: unknown) => Promise<unknown>)(transaction),
    );

    const response = await service.verifyMagicLink(token);
    expect(response).toEqual({
      accessToken: 'signed.jwt.token',
      user: responseUser,
    });
    expect(() => JSON.stringify(response)).not.toThrow();
    expect(transaction.magicLink.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: createHash('sha256').update(token).digest('hex') },
      include: { user: true },
    });
    expect(transaction.magicLink.updateMany).toHaveBeenCalledWith({
      where: {
        id: magicLink.id,
        usedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
      data: { usedAt: expect.any(Date) },
    });
    expect(transaction.user.update).toHaveBeenCalledWith({
      where: { id: databaseUser.id },
      data: { lastLoginAt: expect.any(Date) },
      select: { publicId: true, email: true },
    });
    expect(jwtService.signAsync).toHaveBeenCalledWith({
      userId: databaseUser.publicId,
      email: databaseUser.email,
    });
  });

  it.each([
    ['不存在', null],
    ['已過期', { id: 1n, usedAt: null, expiresAt: new Date(0), user: databaseUser }],
    ['已使用', { id: 1n, usedAt: new Date(), expiresAt: new Date(Date.now() + 60_000), user: databaseUser }],
  ])('拒絕%s的登入連結', async (_case, magicLink) => {
    const transaction = {
      magicLink: {
        findUnique: jest.fn().mockResolvedValue(magicLink),
        updateMany: jest.fn(),
      },
      user: { update: jest.fn() },
    };
    prisma.$transaction.mockImplementation(async (callback: unknown) =>
      (callback as (tx: unknown) => Promise<unknown>)(transaction),
    );

    await expect(service.verifyMagicLink(token)).rejects.toThrow(
      'Magic link is invalid, expired, or already used.',
    );
    expect(transaction.magicLink.updateMany).not.toHaveBeenCalled();
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('拒絕已被並發驗證請求領用的登入連結', async () => {
    const transaction = {
      magicLink: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1n,
          usedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
          user: databaseUser,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      user: { update: jest.fn() },
    };
    prisma.$transaction.mockImplementation(async (callback: unknown) =>
      (callback as (tx: unknown) => Promise<unknown>)(transaction),
    );

    await expect(service.verifyMagicLink(token)).rejects.toThrow(
      'Magic link is invalid, expired, or already used.',
    );
    expect(transaction.user.update).not.toHaveBeenCalled();
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('兩個並發驗證請求中只允許一個使用登入連結', async () => {
    let usedAt: Date | null = null;
    const transaction = {
      magicLink: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1n,
          usedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
          user: databaseUser,
        }),
        updateMany: jest.fn(async () => {
          if (usedAt) {
            return { count: 0 };
          }
          usedAt = new Date();
          return { count: 1 };
        }),
      },
      user: {
        update: jest.fn().mockResolvedValue({
          publicId: databaseUser.publicId,
          email: databaseUser.email,
        }),
      },
    };
    prisma.$transaction.mockImplementation(async (callback: unknown) =>
      (callback as (tx: unknown) => Promise<unknown>)(transaction),
    );

    const outcomes = await Promise.allSettled([
      service.verifyMagicLink(token),
      service.verifyMagicLink(token),
    ]);

    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ]);
    expect(transaction.magicLink.updateMany).toHaveBeenCalledTimes(2);
    expect(transaction.user.update).toHaveBeenCalledTimes(1);
    expect(jwtService.signAsync).toHaveBeenCalledTimes(1);
  });
});
