import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity.ts';
import { AuthToken } from './auth-token.entity.ts';
import { AuthController } from './auth.controller.ts';
import { AuthGuard } from './auth.guard.ts';
import { AuthService } from './auth.service.ts';

@Module({
  imports: [TypeOrmModule.forFeature([User, AuthToken])],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
