/** Readable file name part: "Verbs: A1/A2" → "Verbs-A1-A2" (as in the app). */
export function safeFileName(name: string): string {
  return (
    name
      .normalize('NFC')
      .replace(/[\\/:*?"<>|\s]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'set'
  );
}
