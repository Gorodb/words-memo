import type { Language } from '../domain/types';

/** Languages available out of the box (dictionaries ship with the app). */
export const BUNDLED_LANGUAGES: Language[] = [
  {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    dictionaryStatus: 'bundled',
  },
  {
    code: 'de',
    name: 'German',
    nativeName: 'Deutsch',
    dictionaryStatus: 'bundled',
  },
];

export const DEFAULT_LANGUAGE_CODE = 'en';

/** Source of downloadable <lang>-ru dictionaries. */
export const DICTIONARY_CATALOG_URL =
  'https://github.com/open-dsl-dict/wikidict-dsl-ruC';
