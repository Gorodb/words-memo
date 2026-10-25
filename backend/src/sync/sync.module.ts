import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.ts';
import { SyncController } from './sync.controller.ts';
import { SyncService } from './sync.service.ts';

@Module({
  imports: [AuthModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
