/**
 * The website's API over the user's library. Every route needs the bearer
 * token of a signed-in account; writes reach the phones with their next sync.
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, CurrentUser } from '../auth/auth.guard.ts';
import type { User } from '../users/user.entity.ts';
import type { ShareCreated } from '../shares/shares.service.ts';
import { BackupService, type ImportPreview } from './backup.service.ts';
import {
  CreateFolderDto,
  CreateSetDto,
  CreateWordDto,
  IdsDto,
  NameDto,
  RuleDto,
  UpdateItemDto,
  WordPatchDto,
} from './library.dto.ts';
import {
  LibraryService,
  type FolderDetail,
  type FolderView,
  type LanguageView,
  type SetView,
  type WordView,
} from './library.service.ts';
import type { RuleRecord } from '../sync/protocol.ts';
import type { BackupFile } from './shared/types.ts';

const NO_CONTENT = HttpCode(HttpStatus.NO_CONTENT);

@Controller('languages')
@UseGuards(AuthGuard)
export class LanguagesController {
  constructor(private readonly library: LibraryService) {}

  /** Bundled languages, then the user's own. */
  @Get()
  list(@CurrentUser() user: User): Promise<LanguageView[]> {
    return this.library.listLanguages(user.id);
  }

  /** 409 LANGUAGE_NAME_TAKEN. */
  @Post()
  create(@CurrentUser() user: User, @Body() body: NameDto): Promise<LanguageView> {
    return this.library.createLanguage(user.id, body.name);
  }

  @Patch(':code')
  @NO_CONTENT
  rename(@CurrentUser() user: User, @Param('code') code: string, @Body() body: NameDto) {
    return this.library.renameLanguage(user.id, code, body.name);
  }

  /** Deletes a custom language with all its folders, sets and words. */
  @Delete(':code')
  @NO_CONTENT
  remove(@CurrentUser() user: User, @Param('code') code: string) {
    return this.library.deleteLanguage(user.id, code);
  }

  @Get(':code/stats')
  stats(@CurrentUser() user: User, @Param('code') code: string) {
    return this.library.languageStats(user.id, code);
  }

  /** `?term=…&exclude=<word id>`: "Already added: …" or null. */
  @Get(':code/similar')
  async similar(
    @CurrentUser() user: User,
    @Param('code') code: string,
    @Query('term') term = '',
    @Query('exclude') exclude?: string,
  ): Promise<{ warning: string | null }> {
    return { warning: await this.library.similarWarning(user.id, code, term, exclude) };
  }
}

@Controller('folders')
@UseGuards(AuthGuard)
export class FoldersController {
  constructor(private readonly library: LibraryService) {}

  /** `?language=en`: pinned first, then manual order. */
  @Get()
  list(@CurrentUser() user: User, @Query('language') language: string): Promise<FolderView[]> {
    return this.library.listFolders(user.id, language);
  }

  @Post()
  create(@CurrentUser() user: User, @Body() body: CreateFolderDto): Promise<FolderView> {
    return this.library.createFolder(user.id, body.languageCode, body.name);
  }

  /** Body: `{ids}` in the new order. */
  @Put('order')
  @NO_CONTENT
  reorder(@CurrentUser() user: User, @Body() body: IdsDto) {
    return this.library.reorderFolders(user.id, body.ids);
  }

  @Get(':id')
  get(@CurrentUser() user: User, @Param('id') id: string): Promise<FolderDetail> {
    return this.library.getFolder(user.id, id);
  }

  /** Rename and / or pin. 409 PIN_LIMIT. */
  @Patch(':id')
  @NO_CONTENT
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() body: UpdateItemDto) {
    return this.library.updateFolder(user.id, id, body);
  }

  /** Removes the folder; its sets stay. */
  @Delete(':id')
  @NO_CONTENT
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.library.deleteFolder(user.id, id);
  }

  @Get(':id/sets')
  sets(@CurrentUser() user: User, @Param('id') id: string): Promise<SetView[]> {
    return this.library.listSetsInFolder(user.id, id);
  }

  @Put(':id/sets/:setId')
  @NO_CONTENT
  addSet(@CurrentUser() user: User, @Param('id') id: string, @Param('setId') setId: string) {
    return this.library.setInFolder(user.id, id, setId, true);
  }

  @Delete(':id/sets/:setId')
  @NO_CONTENT
  removeSet(@CurrentUser() user: User, @Param('id') id: string, @Param('setId') setId: string) {
    return this.library.setInFolder(user.id, id, setId, false);
  }
}

@Controller('sets')
@UseGuards(AuthGuard)
export class SetsController {
  constructor(
    private readonly library: LibraryService,
    private readonly backup: BackupService,
  ) {}

  /** `?language=en`: pinned first, then by name. */
  @Get()
  list(@CurrentUser() user: User, @Query('language') language: string): Promise<SetView[]> {
    return this.library.listSets(user.id, language);
  }

  @Post()
  create(@CurrentUser() user: User, @Body() body: CreateSetDto): Promise<SetView> {
    return this.library.createSet(user.id, body.languageCode, body.name, body.folderId);
  }

  @Get(':id')
  get(@CurrentUser() user: User, @Param('id') id: string): Promise<SetView> {
    return this.library.getSet(user.id, id);
  }

  /** Rename and / or pin. 409 PIN_LIMIT. */
  @Patch(':id')
  @NO_CONTENT
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() body: UpdateItemDto) {
    return this.library.updateSet(user.id, id, body);
  }

  /** Deletes the set with its words and rules. */
  @Delete(':id')
  @NO_CONTENT
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.library.deleteSet(user.id, id);
  }

  /** Every learned word of the set becomes "to learn". */
  @Post(':id/reset-progress')
  @NO_CONTENT
  reset(@CurrentUser() user: User, @Param('id') id: string) {
    return this.library.resetProgress(user.id, id);
  }

  /** In list order: to learn, then learned; starred first in each part. */
  @Get(':id/words')
  words(@CurrentUser() user: User, @Param('id') id: string): Promise<WordView[]> {
    return this.library.listWords(user.id, id);
  }

  @Post(':id/words')
  createWord(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: CreateWordDto,
  ): Promise<WordView> {
    return this.library.createWord(user.id, id, body);
  }

  /** Body: `{ids}` of one group (to learn / learned × starred) in the new order. */
  @Put(':id/words/order')
  @NO_CONTENT
  reorderWords(@CurrentUser() user: User, @Param('id') id: string, @Body() body: IdsDto) {
    return this.library.reorderWords(user.id, id, body.ids);
  }

  /** `?limit=30`: random words of the language from other sets. */
  @Get(':id/sample-outside')
  sample(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query('limit') limit = '30',
  ): Promise<WordView[]> {
    return this.library.sampleOutsideSet(user.id, id, Math.min(Number(limit) || 30, 200));
  }

  @Get(':id/rules')
  rules(@CurrentUser() user: User, @Param('id') id: string): Promise<RuleRecord[]> {
    return this.library.listRules(user.id, id);
  }

  @Post(':id/rules')
  createRule(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: RuleDto,
  ): Promise<RuleRecord> {
    return this.library.createRule(user.id, id, body);
  }

  /** The set as a backup file (`kind: 'sets'`), to share as a file. */
  @Get(':id/export')
  export(@CurrentUser() user: User, @Param('id') id: string): Promise<BackupFile> {
    return this.backup.exportSets(user.id, [id]);
  }

  /** A share code for the set (snapshot, one use, 7 days). 429 TOO_MANY_SHARES. */
  @Post(':id/share-code')
  share(@CurrentUser() user: User, @Param('id') id: string): Promise<ShareCreated> {
    return this.backup.shareSet(user.id, id);
  }
}

@Controller('words')
@UseGuards(AuthGuard)
export class WordsController {
  constructor(private readonly library: LibraryService) {}

  /** `?ids=a,b,c`: words by id, in that order. */
  @Get()
  list(@CurrentUser() user: User, @Query('ids') ids = ''): Promise<WordView[]> {
    return this.library.getWords(user.id, ids.split(',').filter(Boolean).slice(0, 10_000));
  }

  /** Edit, mark learned / to learn, star / unstar. */
  @Patch(':id')
  update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: WordPatchDto,
  ): Promise<WordView> {
    return this.library.updateWord(user.id, id, body);
  }

  @Delete(':id')
  @NO_CONTENT
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.library.deleteWord(user.id, id);
  }

  /** Body: `{ids}` to mark as learned (end of "Study words"). */
  @Post('learned')
  @NO_CONTENT
  learned(@CurrentUser() user: User, @Body() body: IdsDto) {
    return this.library.markLearned(user.id, body.ids);
  }
}

@Controller('rules')
@UseGuards(AuthGuard)
export class RulesController {
  constructor(private readonly library: LibraryService) {}

  @Patch(':id')
  update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: RuleDto,
  ): Promise<RuleRecord> {
    return this.library.updateRule(user.id, id, body);
  }

  @Delete(':id')
  @NO_CONTENT
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.library.deleteRule(user.id, id);
  }
}

@Controller('backup')
@UseGuards(AuthGuard)
export class BackupController {
  constructor(private readonly backup: BackupService) {}

  /** Everything as the app's backup file. */
  @Get('export')
  export(@CurrentUser() user: User): Promise<BackupFile> {
    return this.backup.exportAll(user.id);
  }

  /** Body: a backup file. What importing it would do; nothing is written. 400 BAD_BACKUP. */
  @Post('import/preview')
  @HttpCode(HttpStatus.OK)
  preview(@CurrentUser() user: User, @Body() body: unknown): Promise<ImportPreview> {
    return this.backup.previewImport(user.id, this.backup.parse(body));
  }

  /** Body: a backup file. Merges it (never deletes). */
  @Post('import')
  @HttpCode(HttpStatus.OK)
  import(@CurrentUser() user: User, @Body() body: unknown): Promise<ImportPreview> {
    return this.backup.import(user.id, this.backup.parse(body));
  }

  /** What importing a shared set would do; the code stays valid. 404 SHARE_NOT_FOUND. */
  @Get('shares/:code/preview')
  previewShare(@CurrentUser() user: User, @Param('code') code: string): Promise<ImportPreview> {
    return this.backup.previewShare(user.id, code);
  }

  /** Uses the code up and imports the shared set. 404 SHARE_NOT_FOUND. */
  @Post('shares/:code/import')
  @HttpCode(HttpStatus.OK)
  importShare(@CurrentUser() user: User, @Param('code') code: string): Promise<ImportPreview> {
    return this.backup.importShare(user.id, code);
  }
}
