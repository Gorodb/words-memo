/**
 * Pronounces terms with the browser's speech synthesis (Web Speech API).
 * Voices come from the system, so availability depends on the device.
 */
import type { LanguageCode } from '../../domain/types';

/** Voice locale per bundled language. Custom languages have none: no speaker. */
const SPEECH_LOCALES: Partial<Record<LanguageCode, string>> = {
  en: 'en-US',
  de: 'de-DE',
};

export function speechLocale(languageCode: LanguageCode): string | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return null;
  }
  return SPEECH_LOCALES[languageCode] ?? null;
}

/** Voices load asynchronously in Chrome; wait a moment for the first list. */
function voices(): Promise<SpeechSynthesisVoice[]> {
  const now = speechSynthesis.getVoices();
  if (now.length) {
    return Promise.resolve(now);
  }
  return new Promise(resolve => {
    const done = () => resolve(speechSynthesis.getVoices());
    speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 1000);
  });
}

/**
 * Speaks the term in its language, cutting off whatever is being spoken.
 * Returns 'noVoice' when the system has no voice for the language.
 */
export async function speakTerm(
  term: string,
  languageCode: LanguageCode,
): Promise<'spoken' | 'noVoice' | 'unsupported'> {
  const locale = speechLocale(languageCode);
  if (!locale) {
    return 'unsupported';
  }
  if (!term.trim()) {
    return 'spoken';
  }
  const language = locale.split('-')[0];
  const available = (await voices()).filter(v =>
    v.lang.toLowerCase().replace('_', '-').startsWith(language),
  );
  if (available.length === 0) {
    return 'noVoice';
  }
  const utterance = new SpeechSynthesisUtterance(term);
  utterance.lang = locale;
  utterance.voice =
    available.find(v => v.lang.replace('_', '-') === locale && v.localService) ??
    available.find(v => v.lang.replace('_', '-') === locale) ??
    available[0];
  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
  return 'spoken';
}

export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    speechSynthesis.cancel();
  }
}
