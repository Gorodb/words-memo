import { Alert } from 'react-native';
import Speech from '@mhpdev/react-native-speech';
import { speakTerm, speechLocale } from '../src/features/speech/speech';

describe('speechLocale', () => {
  test('bundled languages have a voice locale, custom ones none', () => {
    expect(speechLocale('en')).toBe('en-US');
    expect(speechLocale('de')).toBe('de-DE');
    expect(speechLocale('x-3')).toBeNull();
  });
});

describe('speakTerm', () => {
  afterEach(() => jest.restoreAllMocks());

  test('speaks the term with the language voice', async () => {
    jest
      .spyOn(Speech, 'getAvailableVoices')
      .mockResolvedValue([
        { name: 'de', quality: 'Default', language: 'de-DE', identifier: 'de' },
      ]);
    const speak = jest.spyOn(Speech, 'speak');
    await speakTerm('das Essen', 'de');
    expect(speak).toHaveBeenCalledWith('das Essen', { language: 'de-DE' });
  });

  test('without a voice asks to install one and does not speak', async () => {
    jest.spyOn(Speech, 'getAvailableVoices').mockResolvedValue([]);
    const speak = jest.spyOn(Speech, 'speak');
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await speakTerm('apple', 'en');
    expect(speak).not.toHaveBeenCalled();
    expect(alert.mock.calls[0][0]).toBe('No voice for this language');
  });

  test('custom languages are silent', async () => {
    const speak = jest.spyOn(Speech, 'speak');
    await speakTerm('word', 'x-1');
    expect(speak).not.toHaveBeenCalled();
  });
});
