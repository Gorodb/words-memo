import { Module } from '@nestjs/common';
import { DictionariesController } from './dictionaries.controller.ts';
import { DictionariesService } from './dictionaries.service.ts';

@Module({
  controllers: [DictionariesController],
  providers: [DictionariesService],
  exports: [DictionariesService],
})
export class DictionariesModule {}
