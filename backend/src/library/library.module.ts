import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.ts';
import { DictionariesModule } from '../dictionaries/dictionaries.module.ts';
import { SharesModule } from '../shares/shares.module.ts';
import { BackupService } from './backup.service.ts';
import {
  BackupController,
  FoldersController,
  LanguagesController,
  RulesController,
  SetsController,
  WordsController,
} from './library.controller.ts';
import { LibraryService } from './library.service.ts';
import { LibraryStore } from './store.ts';

/** The website's routes over the same tables the phones sync. */
@Module({
  imports: [AuthModule, SharesModule, DictionariesModule],
  controllers: [
    LanguagesController,
    FoldersController,
    SetsController,
    WordsController,
    RulesController,
    BackupController,
  ],
  providers: [LibraryStore, LibraryService, BackupService],
})
export class LibraryModule {}
