import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from 'react-native';

/**
 * A scrolling form that keeps the field being typed in above the keyboard
 * (2 November 2026).
 *
 * The app runs edge-to-edge on Android, and there the window no longer
 * shrinks when the keyboard comes up: the keyboard is drawn OVER the screen.
 * A field in the lower half — the address in «Мои контакты», the note of an
 * absence, the e-mail and the notes of a new card — ended up under it,
 * whole, and the person typed blind. Seen on Lionel's phone, all four.
 *
 * So, on Android, while the keyboard is up:
 *  - the form gets room at its foot as tall as the keyboard, so its last
 *    field CAN be scrolled above it (`pad`; a sheet or dialog that already
 *    lifts its card by the keyboard's height passes `pad={false}`);
 *  - the field with the cursor is scrolled into the visible part — when the
 *    keyboard opens, and again when another field is tapped while it is open.
 *
 * Elsewhere nothing changes: a browser resizes its page itself, and iOS is
 * not shipped. Every screen with text fields uses this instead of a bare
 * ScrollView — scripts/check-keyboard.mjs fails the gate otherwise.
 */

/**
 * Room left between the field and the keyboard's edge.
 *
 * 72, not 24 (2 November 2026, on Lionel's Samsung): with 24 every field
 * came up but stopped AT the keyboard, half of it still under the strip of
 * tools the keyboard draws above its keys. Measured from the screenshots,
 * the keyboard's reported top was about 42 dp below its real one — that
 * strip is not counted. 72 leaves the whole field and some air above it
 * whatever the keyboard adds on top.
 */
const GAP = 72;

/**
 * Which scroller the person is working in. A sheet open over a form is a
 * second scroller on the same screen; only the one that was touched last may
 * move, or the form underneath would scroll by itself behind the sheet.
 */
let lastTouched = 0;
let nextId = 1;

export interface KeyboardScrollProps extends ScrollViewProps {
  /** Add room under the content for the keyboard (default). */
  pad?: boolean;
}

export const KeyboardScroll = forwardRef<ScrollView, KeyboardScrollProps>(
  function KeyboardScroll(
    { pad = true, contentContainerStyle, onScroll, onTouchStart, onTouchEnd, ...rest },
    ref,
  ) {
    const inner = useRef<ScrollView>(null);
    useImperativeHandle(ref, () => inner.current as ScrollView);
    const id = useRef(nextId++).current;
    const offset = useRef(0);
    const keyboardTop = useRef<number | null>(null);
    const [room, setRoom] = useState(0);

    const reveal = useCallback(() => {
      const top = keyboardTop.current;
      if (top == null || lastTouched !== id) return;
      const input = TextInput.State.currentlyFocusedInput?.() as
        | { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void }
        | null
        | undefined;
      const scroller = inner.current as unknown as {
        measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void;
      } | null;
      if (!input?.measureInWindow || !scroller?.measureInWindow) return;
      // Both measured in the SAME window: a sheet is a window of its own, and
      // its numbers do not match the keyboard's screen position. Where the
      // card is already lifted above the keyboard (`pad` false), the bottom
      // of the scroller is the limit; on a screen, the keyboard's top is.
      scroller.measureInWindow((_sx, sy, _sw, sh) => {
        input.measureInWindow!((_x, y, _w, h) => {
          const limit = pad ? Math.min(top, sy + sh) : sy + sh;
          const below = y + h + GAP - limit;
          if (below > 0) {
            inner.current?.scrollTo({ y: offset.current + below, animated: true });
          }
        });
      });
    }, [id, pad]);

    // The scroller shown last is the one in front (a sheet opens over a form).
    useEffect(() => {
      lastTouched = id;
    }, [id]);

    useEffect(() => {
      if (Platform.OS !== 'android') return;
      const show = Keyboard.addListener('keyboardDidShow', (e) => {
        keyboardTop.current = e.endCoordinates.screenY;
        setRoom(e.endCoordinates.height);
        // After the room is laid out, or the last field has nowhere to go.
        setTimeout(reveal, 80);
      });
      const hide = Keyboard.addListener('keyboardDidHide', () => {
        keyboardTop.current = null;
        setRoom(0);
      });
      return () => {
        show.remove();
        hide.remove();
      };
    }, [reveal]);

    const base = StyleSheet.flatten(contentContainerStyle) ?? {};
    const basePad =
      (typeof base.paddingBottom === 'number' ? base.paddingBottom : null) ??
      (typeof base.paddingVertical === 'number' ? base.paddingVertical : null) ??
      (typeof base.padding === 'number' ? base.padding : 0);

    return (
      <ScrollView
        ref={inner}
        keyboardShouldPersistTaps="handled"
        {...rest}
        contentContainerStyle={
          pad && room > 0
            ? [contentContainerStyle, { paddingBottom: basePad + room }]
            : contentContainerStyle
        }
        scrollEventThrottle={rest.scrollEventThrottle ?? 32}
        onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
          offset.current = e.nativeEvent.contentOffset.y;
          onScroll?.(e);
        }}
        onTouchStart={(e) => {
          lastTouched = id;
          onTouchStart?.(e);
        }}
        onTouchEnd={(e) => {
          // Another field tapped while the keyboard is up: no new
          // «keyboardDidShow» comes, so look again once focus has moved.
          if (keyboardTop.current != null) setTimeout(reveal, 250);
          onTouchEnd?.(e);
        }}
      />
    );
  },
);
