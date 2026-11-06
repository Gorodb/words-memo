/**
 * Pronounces words with the system text-to-speech engine (Android
 * TextToSpeech, iOS AVSpeechSynthesizer): offline, no account.
 */
import { Alert, Platform } from 'react-native';
import Speech from '@mhpdev/react-native-speech';
import type { LanguageCode } from '../../domain/types';

/** Voice locale per bundled language. Custom languages have none: no speaker. */
const SPEECH_LOCALES: Partial<Record<LanguageCode, string>> = {
  en: 'en-US',
  de: 'de-DE',
};

export function speechLocale(languageCode: LanguageCode): string | null {
  return SPEECH_LOCALES[languageCode] ?? null;
}

/** Locales already checked for an installed voice (checking costs a native call). */
const voiceFound = new Set<string>();

/**
 * Speaks the term in its language, cutting off whatever is being spoken.
 * Without a voice for the language, asks to install one instead.
 */
export async function speakTerm(
  term: string,
  languageCode: LanguageCode,
): Promise<void> {
  const locale = speechLocale(languageCode);
  if (!locale || !term.trim()) {
    return;
  }
  try {
    if (!voiceFound.has(locale)) {
      // Prefix match: 'de' also finds de-AT / de-CH voices.
      const voices = await Speech.getAvailableVoices(locale.split('-')[0]);
      if (voices.length === 0) {
        askToInstallVoice();
        return;
      }
      voiceFound.add(locale);
    }
    await Speech.stop();
    await Speech.speak(term, { language: locale });
  } catch (e) {
    Alert.alert(
      'Could not pronounce the word',
      e instanceof Error ? e.message : String(e),
    );
  }
}

export function stopSpeaking(): void {
  Speech.stop().catch(() => {});
}

function askToInstallVoice() {
  const message =
    Platform.OS === 'android'
      ? 'Install a voice for this language in the system text-to-speech settings.'
      : 'Add a voice for this language in Settings → Accessibility → Spoken Content → Voices.';
  Alert.alert(
    'No voice for this language',
    message,
    Platform.OS === 'android'
      ? [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Install voice',
            onPress: () =>
              Speech.openVoiceDataInstaller().catch(() =>
                Alert.alert('Could not open the voice installer'),
              ),
          },
        ]
      : undefined,
  );
}
