import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.ts';
import { EventsController } from './events.controller.ts';
import { EventsService } from './events.service.ts';

/** Live change notices for open clients; global, since every writer publishes. */
@Global()
@Module({
  imports: [AuthModule],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
