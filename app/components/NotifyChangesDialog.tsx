import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Dialog } from './Dialog';
import { choiceStyles } from './PublishDialog';
import { assignmentsApi, EventType } from '../lib/api';

interface Props {
  open: boolean;
  busy?: boolean;
  /** The meeting that was edited — the window asks the server who it concerns. */
  weekStartDate?: string;
  eventType?: EventType;
  /** Called with notify=true (tell them now) or notify=false (not now). */
  onConfirm: (notify: boolean) => void;
  onCancel: () => void;
}

/**
 * Shown when a scheduler edits an already-published programme.
 *
 * It used to promise that «возвещатели получат уведомление о том, что
 * программа изменена» — which reads as a message to the whole congregation,
 * and on the weekend meeting the answer was «тихо» almost every time: the
 * audit of 1 October 2026 found weeks of chairmen and prayers assigned without
 * one of them being told. In truth only the people touched by the edit hear
 * of it, and the window now says exactly that — by name, with what each will
 * be told, and whether anything can reach them at all.
 *
 * «Не сейчас» means not NOW, as Lionel put it: nothing goes out today, and
 * the evening ladder tells each person on its next step. Where no evening is
 * left before the meeting, that choice is not offered — nobody would hear.
 */
export function NotifyChangesDialog({
  open,
  busy,
  weekStartDate,
  eventType,
  onConfirm,
  onCancel,
}: Props) {
  const { t, i18n } = useTranslation();
  const query = useQuery({
    queryKey: ['assignments', 'pending-notice', weekStartDate, eventType],
    queryFn: () =>
      assignmentsApi.pendingNotice({
        weekStartDate: weekStartDate!,
        eventType: eventType!,
      }),
    enabled: open && !!weekStartDate && !!eventType,
    // What it shows changes with every edit; never serve it from memory.
    staleTime: 0,
    gcTime: 0,
  });
  const data = query.data;
  const rows = data?.rows ?? [];
  // Until the answer is here the safe default is the old behaviour: both
  // choices on offer.
  const canWait = data ? data.canWait : true;

  const evening = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString(i18n.language, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });

  return (
    <Dialog
      visible={open}
      title={t('schedule.notifyChanges.dialog.title')}
      icon="notifications-outline"
      cancelLabel={t('common.cancel')}
      onCancel={onCancel}
      pending={busy}
    >
      {query.isPending && open ? (
        <ActivityIndicator style={{ marginVertical: 12 }} />
      ) : rows.length === 0 ? (
        <Text style={choiceStyles.subtitle}>
          {t('schedule.notifyChanges.dialog.nobody')}
        </Text>
      ) : (
        <>
          <Text style={choiceStyles.subtitle}>
            {t('schedule.notifyChanges.dialog.lead', { count: rows.length })}
          </Text>
          <View style={s.list}>
            {rows.map((r, idx) => (
              <View
                key={`${r.publisherId}:${r.tone}:${idx}`}
                style={[s.row, idx > 0 && s.rowDivided]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{r.displayName}</Text>
                  <Text style={s.what}>
                    {t(`schedule.notifyChanges.dialog.tone.${r.tone}`, {
                      label: r.label,
                    })}
                  </Text>
                </View>
                {r.reach !== 'push' ? (
                  <View style={[s.pill, r.reach === 'none' && s.pillNone]}>
                    <Text
                      style={[s.pillText, r.reach === 'none' && s.pillTextNone]}
                    >
                      {t(`schedule.notifyChanges.dialog.reach.${r.reach}`)}
                    </Text>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        </>
      )}

      <Pressable
        style={({ pressed }) => [
          choiceStyles.primary,
          pressed && choiceStyles.pressed,
          busy && choiceStyles.disabled,
        ]}
        disabled={busy}
        onPress={() => onConfirm(true)}
      >
        <Text style={choiceStyles.primaryText}>
          {t('schedule.notifyChanges.dialog.now')}
        </Text>
      </Pressable>

      {canWait ? (
        <Pressable
          style={({ pressed }) => [
            choiceStyles.secondary,
            pressed && choiceStyles.pressed,
            busy && choiceStyles.disabled,
          ]}
          disabled={busy}
          onPress={() => onConfirm(false)}
        >
          <Text style={choiceStyles.secondaryText}>
            {t('schedule.notifyChanges.dialog.later')}
          </Text>
          <Text style={choiceStyles.secondaryHint}>
            {data?.nextWord
              ? t('schedule.notifyChanges.dialog.laterHint', {
                  date: evening(data.nextWord),
                })
              : t('schedule.notifyChanges.dialog.laterHintPlain')}
          </Text>
        </Pressable>
      ) : (
        <Text style={s.mustNow}>
          {t('schedule.notifyChanges.dialog.mustNow')}
        </Text>
      )}
    </Dialog>
  );
}

const s = StyleSheet.create({
  list: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 9,
  },
  rowDivided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
  },
  name: {
    fontSize: 14.5,
    color: '#0f172a',
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
  },
  what: { fontSize: 12.5, color: '#64748b', marginTop: 1 },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#fef3c7',
  },
  pillNone: { backgroundColor: '#fee2e2' },
  pillText: { fontSize: 11.5, fontWeight: '600', color: '#92400e' },
  pillTextNone: { color: '#b91c1c' },
  mustNow: { fontSize: 12.5, color: '#b45309', lineHeight: 18, marginTop: 4 },
});
