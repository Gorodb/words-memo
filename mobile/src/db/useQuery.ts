import { useEffect, useState } from 'react';
import { subscribe, type Table } from './changes';

interface QueryState<T> {
  data: T | undefined;
  error: Error | undefined;
}

/**
 * Runs `load` and re-runs it whenever it changes (memoize it with useCallback)
 * or when one of `tables` is modified.
 */
export function useQuery<T>(
  load: () => Promise<T>,
  tables: Table[],
): QueryState<T> {
  const [state, setState] = useState<QueryState<T>>({
    data: undefined,
    error: undefined,
  });
  const tablesKey = tables.join(',');

  useEffect(() => {
    let latest = 0;
    let active = true;
    const run = () => {
      const call = ++latest;
      load().then(
        data => {
          if (active && call === latest) {
            setState({ data, error: undefined });
          }
        },
        error => {
          if (active && call === latest) {
            setState(prev => ({ data: prev.data, error }));
          }
        },
      );
    };

    run();
    const watched = tablesKey.split(',');
    const unsubscribe = subscribe(changed => {
      if (changed.some(t => watched.includes(t))) {
        run();
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [load, tablesKey]);

  return state;
}
