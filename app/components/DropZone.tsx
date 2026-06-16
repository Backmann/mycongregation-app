import { type ReactNode } from 'react';

interface Props {
  onFile: (file: File) => void;
  disabled?: boolean;
  children: ReactNode;
}

/**
 * Native passthrough for the EPUB import area. OS-level file drag-and-drop
 * isn't available on native, so this simply renders the children; the file
 * picker remains the way to choose a file. The web build uses
 * DropZone.web.tsx, which adds the actual drop handling.
 */
export function DropZone({ children }: Props) {
  return <>{children}</>;
}
