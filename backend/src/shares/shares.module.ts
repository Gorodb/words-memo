import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.ts';
import { SharedSet } from './shared-set.entity.ts';
import { SharesController } from './shares.controller.ts';
import { SharesService } from './shares.service.ts';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([SharedSet])],
  controllers: [SharesController],
  providers: [SharesService],
})
export class SharesModule {}
