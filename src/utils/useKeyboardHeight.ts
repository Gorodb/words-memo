import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';

/**
 * Current keyboard height (0 when hidden). The app is edge-to-edge, so Android
 * doesn't resize the window for the keyboard: screens with inputs pad their
 * scroll content by this amount themselves.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', e =>
      setHeight(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}
