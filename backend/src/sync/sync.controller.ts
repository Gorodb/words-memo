import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, CurrentUser } from '../auth/auth.guard.ts';
import type { User } from '../users/user.entity.ts';
import {
  parseSyncRequest,
  SyncFormatError,
  type SyncResponse,
} from './protocol.ts';
import { SyncService } from './sync.service.ts';

@Controller('sync')
@UseGuards(AuthGuard)
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  /** Body: SyncRequest (see protocol.ts). */
  @Post()
  @HttpCode(HttpStatus.OK)
  run(
    @CurrentUser() user: User,
    @Body() body: unknown,
  ): Promise<SyncResponse> {
    let request;
    try {
      request = parseSyncRequest(body);
    } catch (e) {
      if (e instanceof SyncFormatError) {
        throw new BadRequestException({ code: 'BAD_SYNC_REQUEST', message: e.message });
      }
      throw e;
    }
    return this.sync.sync(user.id, request);
  }
}
