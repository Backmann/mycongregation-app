import { useMemo } from 'react';
import { View } from 'react-native';
import { qrMatrix } from '../lib/qr';

/**
 * A QR code drawn with plain views — see lib/qr.ts for why it is our own.
 *
 * Each row is laid out as runs of equal colour, not module by module: a code
 * of this size is about a thousand squares and some forty runs a row, and the
 * difference is felt on an old phone opening the dialog.
 *
 * Renders nothing when the text does not fit, so the caller's letters-only
 * fallback is simply what remains on screen.
 */
export function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  const rows = useMemo(() => qrMatrix(value), [value]);
  if (!rows) return null;

  // The light margin is part of the code: without four modules of it a camera
  // cannot tell where the pattern ends.
  const QUIET = 4;
  const cell = Math.max(2, Math.floor(size / (rows.length + QUIET * 2)));
  const side = cell * (rows.length + QUIET * 2);

  return (
    <View
      accessibilityRole="image"
      style={{
        width: side,
        height: side,
        padding: cell * QUIET,
        backgroundColor: '#ffffff',
      }}
    >
      {rows.map((row, r) => {
        const runs: { dark: boolean; length: number }[] = [];
        for (const dark of row) {
          const last = runs[runs.length - 1];
          if (last && last.dark === dark) last.length++;
          else runs.push({ dark, length: 1 });
        }
        return (
          <View key={r} style={{ flexDirection: 'row', height: cell }}>
            {runs.map((run, i) => (
              <View
                key={i}
                style={{
                  width: run.length * cell,
                  height: cell,
                  // Pure black on pure white: the one place in the app where
                  // the palette gives way to what a camera reads best.
                  backgroundColor: run.dark ? '#000000' : '#ffffff',
                }}
              />
            ))}
          </View>
        );
      })}
    </View>
  );
}
