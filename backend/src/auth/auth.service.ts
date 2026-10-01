import { createHash, randomBytes } from 'node:crypto';
import {
	Injectable,
	UnauthorizedException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import {
	MAIL_QUEUE,
	SEND_MAGIC_LINK_EMAIL_JOB,
	SendMagicLinkEmailJobData,
} from '../mail/mail.constants';

@Injectable()
export class AuthService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly jwtService: JwtService,
		private readonly configService: ConfigService,
		@InjectQueue(MAIL_QUEUE)
		private readonly mailQueue: Queue<SendMagicLinkEmailJobData>,
	) {}

	async requestMagicLink(email: string) {
		const token = randomBytes(32).toString('hex');
		const tokenHash = createHash('sha256').update(token).digest('hex');
		const ttlMinutes = Number(this.configService.get<string>('MAGIC_LINK_TTL_MINUTES') ?? 15);
		const expiresAt = new Date(
			Date.now() + (Number.isFinite(ttlMinutes) && ttlMinutes > 0 ? ttlMinutes : 15) * 60_000,
		);
		const user = await this.prisma.user.upsert({
			where: { email },
			create: { email },
			update: {},
		});

		await this.prisma.magicLink.create({
			data: { userId: user.id, tokenHash, expiresAt },
		});

		const frontendUrl = this.configService
			.getOrThrow<string>('FRONTEND_URL')
			.replace(/\/+$/, '');
		const loginUrl = `${frontendUrl}/auth/verify?token=${encodeURIComponent(token)}`;

		await this.mailQueue.add(SEND_MAGIC_LINK_EMAIL_JOB, {
			recipientEmail: email,
			loginUrl,
		});

		return { message: 'If this email can be used, a login link has been sent.' };
	}

	async verifyMagicLink(token: string) {
		const tokenHash = createHash('sha256').update(token).digest('hex');
		const now = new Date();
		const user = await this.prisma.$transaction(async (transaction) => {
			const magicLink = await transaction.magicLink.findUnique({
				where: { tokenHash },
				include: { user: true },
			});

			if (!magicLink || magicLink.usedAt || magicLink.expiresAt <= now) {
				return null;
			}

			const claim = await transaction.magicLink.updateMany({
				where: { id: magicLink.id, usedAt: null, expiresAt: { gt: now } },
				data: { usedAt: now },
			});

			if (claim.count !== 1) {
				return null;
			}

			return transaction.user.update({
				where: { id: magicLink.user.id },
				data: { lastLoginAt: now },
				select: { id: true, email: true },
			});
		});

		if (!user) {
			throw new UnauthorizedException('Magic link is invalid, expired, or already used.');
		}

		const accessToken = await this.jwtService.signAsync({
			userId: user.id,
			email: user.email,
		});

		return { accessToken, user };
	}
}
