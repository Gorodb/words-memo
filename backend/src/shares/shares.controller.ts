import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, CurrentUser } from '../auth/auth.guard.ts';
import type { User } from '../users/user.entity.ts';
import { parseSharePayload, SharePayloadError } from './share-payload.ts';
import {
  ShareErrorCode,
  SharesService,
  type ShareContent,
  type ShareCreated,
} from './shares.service.ts';

/**
 * Sharing a set by code. Creating a code needs an account; reading and
 * redeeming one don't, so a future website link works for anyone.
 */
@Controller('shares')
export class SharesController {
  constructor(private readonly shares: SharesService) {}

  /** Body: `{payload}` (a backup file of kind 'sets'). 201 `{code, expiresAt}`. */
  @Post()
  @UseGuards(AuthGuard)
  create(
    @CurrentUser() user: User,
    @Body() body: unknown,
  ): Promise<ShareCreated> {
    let payload;
    try {
      payload = parseSharePayload(
        (body as { payload?: unknown } | null)?.payload,
      );
    } catch (e) {
      if (e instanceof SharePayloadError) {
        throw new BadRequestException({
          code: ShareErrorCode.badPayload,
          message: e.message,
        });
      }
      throw e;
    }
    return this.shares.create(user.id, payload);
  }

  /** The content, without using the code up. 404 SHARE_NOT_FOUND. */
  @Get(':code')
  peek(@Param('code') code: string): Promise<ShareContent> {
    return this.shares.peek(code);
  }

  /** Uses the code up and returns the content. 404 SHARE_NOT_FOUND. */
  @Post(':code/redeem')
  @HttpCode(HttpStatus.OK)
  redeem(@Param('code') code: string): Promise<ShareContent> {
    return this.shares.redeem(code);
  }
}
