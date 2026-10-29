import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { UndoBar } from '../UndoBar';
import { formatDuration, useLogActions } from '../../lib/useServiceLog';
import type { ServiceLogEntry } from '../../lib/api';

/**
 * «Записано 1 ч 30 мин · Отменить» — after every new entry and every
 * removal, for ten seconds (mockup screen 3). No «are you sure» before: the
 * strip catches the mis-tap after. The bar is placed by the screen, beside
 * its scroller, never inside it.
 */
export function useLogUndo(): {
  undoBar: ReactNode;
  saved: (id: string, isNew: boolean, minutes: number) => void;
  removed: (entry: ServiceLogEntry) => void;
} {
  const { t } = useTranslation();
  const { write, remove } = useLogActions();
  const [last, setLast] = useState<
    | { kind: 'written'; id: string; minutes: number }
    | { kind: 'removed'; entry: ServiceLogEntry }
    | null
  >(null);
  const undoBar = (
    <UndoBar
      visible={!!last}
      icon={last?.kind === 'removed' ? 'trash-outline' : 'time-outline'}
      message={
        last?.kind === 'written'
          ? t('hoursLog.undo.written', { dur: formatDuration(last.minutes, t) })
          : last?.kind === 'removed'
            ? t('hoursLog.undo.removed', { dur: formatDuration(last.entry.minutes, t) })
            : ''
      }
      onUndo={async () => {
        if (!last) return;
        if (last.kind === 'written') await remove(last.id);
        else
          await write(
            {
              day: last.entry.day,
              minutes: last.entry.minutes,
              kind: last.entry.kind,
              note: last.entry.note,
            },
            last.entry.id,
          );
        setLast(null);
      }}
      onDismiss={() => setLast(null)}
    />
  );
  return {
    undoBar,
    saved: (id, isNew, minutes) => {
      if (isNew) setLast({ kind: 'written', id, minutes });
    },
    removed: (entry) => setLast({ kind: 'removed', entry }),
  };
}
