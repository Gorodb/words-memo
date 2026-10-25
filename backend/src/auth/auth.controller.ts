import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { User } from '../users/user.entity.ts';
import { CredentialsDto, type AuthResponse } from './auth.dto.ts';
import { AuthGuard, CurrentUser, type AuthedRequest } from './auth.guard.ts';
import { AuthService } from './auth.service.ts';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** 201 + session; 409 EMAIL_TAKEN. */
  @Post('register')
  register(@Body() body: CredentialsDto): Promise<AuthResponse> {
    return this.auth.register(body);
  }

  /** 200 + session; 404 USER_NOT_FOUND; 401 WRONG_PASSWORD. */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() body: CredentialsDto): Promise<AuthResponse> {
    return this.auth.login(body);
  }

  /** Revokes the token of this request. */
  @Post('logout')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() request: AuthedRequest): Promise<void> {
    await this.auth.logout(request.token);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: User): { id: string; email: string } {
    return { id: user.id, email: user.email };
  }
}
