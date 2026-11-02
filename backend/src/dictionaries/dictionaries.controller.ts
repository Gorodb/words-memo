import { Controller, Get, NotFoundException, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  DictionariesService,
  DictionaryErrorCode,
  type DictionaryInfo,
} from './dictionaries.service.ts';
import type { DictionaryEntry } from './queries.ts';

const MAX_GLOSSES = 6;

/**
 * Dictionaries: no account needed (the app downloads them before or without
 * signing in). Lookups serve the website's word form.
 */
@Controller('dictionaries')
export class DictionariesController {
  constructor(private readonly dictionaries: DictionariesService) {}

  /** The dictionaries on the server. */
  @Get()
  list(): DictionaryInfo[] {
    return this.dictionaries.list();
  }

  /** Word suggestions for a typed prefix (with forms and translations). */
  @Get(':language/search')
  async search(
    @Param('language') language: string,
    @Query('q') q = '',
  ): Promise<DictionaryEntry[]> {
    if (!this.dictionaries.has(language) || q.trim().length < 2) {
      return [];
    }
    return this.dictionaries.search(language, q);
  }

  /** Russian translations of a word (its main form), for the translation field. */
  @Get(':language/translations')
  async translations(
    @Param('language') language: string,
    @Query('term') term = '',
  ): Promise<string[]> {
    if (!this.dictionaries.has(language) || !term.trim()) {
      return [];
    }
    const entries = (await this.dictionaries.exact(language, term)).slice(0, 2);
    return [...new Set(entries.flatMap(e => e.glosses))].slice(0, MAX_GLOSSES);
  }

  /**
   * The file itself (e.g. GET /dictionaries/de-ru.db), with Range and ETag
   * support so downloads can resume and be cached.
   */
  @Get(':file')
  download(@Param('file') file: string, @Res() res: Response): void {
    const full = this.dictionaries.filePath(file);
    if (!full) {
      throw new NotFoundException({
        code: DictionaryErrorCode.notFound,
        message: `There is no ${file} on the server`,
      });
    }
    res.sendFile(full, {
      headers: { 'Content-Type': 'application/vnd.sqlite3' },
      maxAge: '1h',
    });
  }
}
