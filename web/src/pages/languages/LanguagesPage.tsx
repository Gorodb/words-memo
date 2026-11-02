import { Check, CircleEllipsis, Plus } from 'lucide-react';
import { PageBody, PageHeader } from '../../app/Layout';
import { useActiveLanguage, useLanguages } from '../../app/useLanguages';
import type { Language } from '../../domain/types';
import {
  addLanguage,
  languageStats,
  removeLanguage,
  renameLanguage,
  setActiveLanguage,
} from '../../store/actions';
import { IconButton } from '../../ui/Button';
import { ListRow } from '../../ui/common';
import { errorText, showAlert, showForm, showMenu } from '../../ui/dialogs';
import { nameForm } from '../../ui/forms';
import { confirmDelete } from '../../ui/itemActions';
import { plural } from '../../utils/plural';

/** Bundled and custom languages; the checked one is active in Folders and Sets. */
export function LanguagesPage() {
  const languages = useLanguages();
  const active = useActiveLanguage();

  const openCreate = () =>
    showForm(
      nameForm({
        title: 'New language',
        placeholder: 'Language name, e.g. Spanish',
        onSubmit: async name => {
          setActiveLanguage((await addLanguage(name)).code);
        },
      }),
    );

  const languageMenu = (language: Language) =>
    showMenu({
      title: language.name,
      items: [
        {
          label: 'Rename',
          onPress: () =>
            showForm(
              nameForm({
                title: 'Rename language',
                placeholder: 'Language name',
                initialValue: language.name,
                onSubmit: name => renameLanguage(language.code, name),
              }),
            ),
        },
        {
          label: 'Delete',
          destructive: true,
          onPress: async () => {
            let counts;
            try {
              counts = await languageStats(language.code);
            } catch (e) {
              showAlert('Could not delete', errorText(e));
              return;
            }
            const { sets, words } = counts;
            confirmDelete(
              language.name,
              sets > 0
                ? `${plural(sets, 'set')} with ${plural(
                    words,
                    'word',
                  )} and all folders of this language will be deleted.`
                : 'The language and its folders will be deleted.',
              () => removeLanguage(language.code),
            );
          },
        },
      ],
    });

  return (
    <>
      <PageHeader
        title="Languages"
        actions={<IconButton icon={Plus} label="Add language" onClick={openCreate} />}
      />
      <PageBody>
        <div className="flex flex-col gap-2">
          {languages.map(language => {
            const isActive = language.code === active.code;
            return (
              <ListRow
                key={language.code}
                title={language.name}
                subtitle={
                  language.custom
                    ? 'Added by you · words are typed by hand'
                    : language.nativeName
                }
                selected={isActive}
                onPress={() => setActiveLanguage(language.code)}
                onMenu={language.custom ? () => languageMenu(language) : undefined}
                left={
                  <span
                    className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 ${
                      isActive ? 'border-primary bg-primary text-white' : 'border-line'
                    }`}
                  >
                    {isActive ? <Check size={14} strokeWidth={3} /> : null}
                  </span>
                }
                right={
                  language.custom ? (
                    <IconButton
                      icon={CircleEllipsis}
                      label={`${language.name} actions`}
                      onClick={e => {
                        e.stopPropagation();
                        languageMenu(language);
                      }}
                    />
                  ) : null
                }
              />
            );
          })}
        </div>
        <p className="px-1 pt-5 text-sm text-muted">
          English and German words get suggestions from the Wiktionary
          dictionaries on the server. Languages you add have none: their words
          are typed by hand.
        </p>
      </PageBody>
    </>
  );
}
