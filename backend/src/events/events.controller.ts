import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import { AuthGuard, type AuthedRequest } from '../auth/auth.guard.ts';
import { User } from '../users/user.entity.ts';
import { EventsService } from './events.service.ts';
import {
  changedFrame,
  CLIENT_ID_HEADER,
  PING_FRAME,
  PING_INTERVAL_MS,
  validClientId,
} from './protocol.ts';

@Controller('events')
@UseGuards(AuthGuard)
export class EventsController {
  constructor(
    private readonly events: EventsService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /**
   * Server-sent events: `changed` when another client changes this account
   * (see protocol.ts). The client id comes from the X-Client-Id header.
   */
  @Get()
  async stream(@Req() request: AuthedRequest, @Res() response: Response): Promise<void> {
    const userId = request.user.id;
    const clientId = validClientId(request.header(CLIENT_ID_HEADER));

    response.status(200);
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    // nginx and other proxies: don't buffer the stream.
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();
    request.socket.setKeepAlive(true);
    request.socket.setNoDelay(true);

    const write = (frame: string) => {
      if (!response.writableEnded && !response.destroyed) {
        response.write(frame);
      }
    };
    // Subscribe before reading the version, so no change falls in between.
    const unsubscribe = this.events.subscribe({
      userId,
      clientId,
      send: event => write(changedFrame(event)),
    });
    const ping = setInterval(() => write(PING_FRAME), PING_INTERVAL_MS);
    const close = () => {
      clearInterval(ping);
      unsubscribe();
    };
    response.on('close', close);

    const user = await this.dataSource
      .getRepository(User)
      .findOne({ where: { id: userId }, select: { id: true, syncVersion: true } });
    write(changedFrame({ version: user?.syncVersion ?? 0, tables: [] }));
  }
}
