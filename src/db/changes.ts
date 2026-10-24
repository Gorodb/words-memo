/**
 * Minimal change feed: repositories call notifyChanged() after writes,
 * useQuery() re-runs queries that depend on the touched tables.
 */
export type Table = 'folders' | 'sets' | 'folder_sets' | 'words' | 'rules';

type Listener = (tables: Table[]) => void;

const listeners = new Set<Listener>();

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyChanged(...tables: Table[]): void {
  listeners.forEach(listener => listener(tables));
}
