/** Backup files in the browser: download, share sheet, file picker. */

/** Saves JSON through the browser's download. */
export function downloadJson(data: unknown, fileName: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function canShareFiles(): boolean {
  try {
    const probe = new File(['{}'], 'probe.json', { type: 'application/json' });
    return !!navigator.canShare?.({ files: [probe] });
  } catch {
    return false;
  }
}

/** Share sheet with the file where the browser has one (phones), else download. */
export async function shareOrDownload(data: unknown, fileName: string, title: string) {
  const file = new File([JSON.stringify(data, null, 2)], fileName, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        return; // cancelled: a normal outcome
      }
    }
  }
  downloadJson(data, fileName);
}

/** Opens the file picker; resolves with the parsed JSON, or null when nothing was picked. */
export function pickJsonFile(): Promise<unknown | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(await file.text()));
      } catch {
        reject(new Error('This file is not a words backup (not JSON).'));
      }
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}
