import { useCallback, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';

interface Props {
  /** Called with the dropped file (already filtered to .epub). */
  onFile: (file: File) => void;
  /** Disabled while a parse/apply is in flight. */
  disabled?: boolean;
  children: ReactNode;
}

/**
 * Web-only drag-and-drop wrapper for the EPUB import area. Picked up by
 * Metro only in the web build (`.web.tsx`); native uses DropZone.tsx, which
 * is a passthrough since OS file-drop isn't available there.
 *
 * The dropped File is a Blob, so it flows into the exact same client-side
 * parser the file picker uses — no separate parsing path.
 */
export function DropZone({ onFile, disabled, children }: Props) {
  const [active, setActive] = useState(false);
  // Track nested dragenter/dragleave so the highlight doesn't flicker.
  const depth = useRef(0);

  const onDragEnter = useCallback(
    (e: any) => {
      e.preventDefault();
      if (disabled) return;
      depth.current += 1;
      setActive(true);
    },
    [disabled],
  );

  const onDragOver = useCallback(
    (e: any) => {
      e.preventDefault();
      if (!disabled) e.dataTransfer.dropEffect = 'copy';
    },
    [disabled],
  );

  const onDragLeave = useCallback((e: any) => {
    e.preventDefault();
    depth.current -= 1;
    if (depth.current <= 0) {
      depth.current = 0;
      setActive(false);
    }
  }, []);

  const onDrop = useCallback(
    (e: any) => {
      e.preventDefault();
      depth.current = 0;
      setActive(false);
      if (disabled) return;
      const file: File | undefined = e.dataTransfer?.files?.[0];
      if (file && file.name.toLowerCase().endsWith('.epub')) {
        onFile(file);
      }
    },
    [disabled, onFile],
  );

  return (
    <View
      // RN-web forwards unknown DOM props to the underlying <div>.
      {...({ onDragEnter, onDragOver, onDragLeave, onDrop } as any)}
      style={[
        active && {
          outlineStyle: 'dashed',
          outlineWidth: 2,
          outlineColor: '#0ea5e9',
          borderRadius: 12,
          backgroundColor: 'rgba(14,165,233,0.06)',
        },
      ]}
    >
      {children}
    </View>
  );
}
