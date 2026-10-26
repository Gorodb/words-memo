import { Controller, Get, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module.ts';
import { typeOrmOptions } from './database/typeorm.options.ts';
import { SharesModule } from './shares/shares.module.ts';
import { SyncModule } from './sync/sync.module.ts';

@Controller('health')
class HealthController {
  @Get()
  health(): { ok: true } {
    return { ok: true };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        typeOrmOptions(config.getOrThrow<string>('DATABASE_URL')),
    }),
    AuthModule,
    SyncModule,
    SharesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
