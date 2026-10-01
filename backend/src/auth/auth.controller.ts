import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { RequestMagicLinkDto } from './dto/request-magic-link.dto';
import { VerifyMagicLinkDto } from './dto/verify-magic-link.dto';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
	constructor(private readonly authService: AuthService) {}

	@Post('magic-link')
	@HttpCode(HttpStatus.ACCEPTED)
	requestMagicLink(@Body() request: RequestMagicLinkDto) {
		return this.authService.requestMagicLink(request.email);
	}

	@Get('magic-link/verify')
	verifyMagicLink(@Query() query: VerifyMagicLinkDto) {
		return this.authService.verifyMagicLink(query.token);
	}
}
