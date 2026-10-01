import { ValidationPipe } from '@nestjs/common';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('登入 API 控制器', () => {
  let app: INestApplication;
  let authService: { requestMagicLink: jest.Mock; verifyMagicLink: jest.Mock };

  beforeEach(async () => {
    authService = {
      requestMagicLink: jest.fn().mockResolvedValue({
        message: 'If this email can be used, a login link has been sent.',
      }),
      verifyMagicLink: jest.fn().mockResolvedValue({
        accessToken: 'signed.jwt.token',
        user: { id: 'user-1', email: 'user@example.com' },
      }),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('接受有效的登入連結請求，且不洩漏帳號是否存在', async () => {
    await request(app.getHttpServer())
      .post('/auth/magic-link')
      .send({ email: 'user@example.com' })
      .expect(202)
      .expect({ message: 'If this email can be used, a login link has been sent.' });
    expect(authService.requestMagicLink).toHaveBeenCalledWith('user@example.com');
  });

  it('驗證請求中的電子郵件格式', async () => {
    await request(app.getHttpServer())
      .post('/auth/magic-link')
      .send({ email: 'not-an-email' })
      .expect(400);
    expect(authService.requestMagicLink).not.toHaveBeenCalled();
  });

  it('驗證查詢參數中的 token 並回傳登入使用者', async () => {
    await request(app.getHttpServer())
      .get('/auth/magic-link/verify')
      .query({ token: 'opaque-token' })
      .expect(200)
      .expect({
        accessToken: 'signed.jwt.token',
        user: { id: 'user-1', email: 'user@example.com' },
      });
    expect(authService.verifyMagicLink).toHaveBeenCalledWith('opaque-token');
  });
});
