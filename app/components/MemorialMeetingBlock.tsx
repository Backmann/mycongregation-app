import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  memorialApi,
  MemorialItem,
  songsApi,
  SpecialEvent,
} from '../lib/api';
import { CollapsibleMeetingBlock } from './CollapsibleMeetingBlock';
import { PublisherSelector } from './PublisherSelector';
import { MemorialDutiesCard } from './MemorialDutiesCard';
import { Sheet } from './Sheet';
import { useAllPublishers } from '../lib/useAllPublishers';
import { memorialKey, useMemorialSheet } from '../lib/useMemorialSheet';

/**
 * The Memorial, where the meeting it replaces would have been.
 *
 * It is a MEETING, not an announcement: the congregation gathers, somebody
 * presides, prayers are said, a talk is given. So it belongs on the week's
 * schedule in the place of the meeting it takes — not on a screen of its own
 * reached from the events list, which is where it first went and which
 * confused «where it is created» with «where it lives».
 *
 * Opens in place, like any other meeting block.
 *
 * The parts that carry a person are for BAPTIZED BROTHERS, told by the
 * APPOINTMENT rather than the baptism date: of twenty-seven brothers in this
 * congregation three have a date recorded, so that filter would leave three
 * men in the picker. «unbaptized_publisher» and «student» are the two
 * appointments that are not baptized, and everyone carries one.
 */

const NOT_BAPTIZED = ['student', 'unbaptized_publisher'] as const;
const SONG_PARTS = new Set(['song_opening', 'song_closing']);

export function MemorialMeetingBlock({
  event,
  canEdit,
  hiddenCount,
}: {
  event: SpecialEvent;
  /** Elders and admins settle the programme; everyone else reads it. */
  canEdit: boolean;
  /** Assignments already entered for the meeting the Memorial takes. */
  hiddenCount: number;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();

  // The shared hook, not a useQuery of its own: the duties section reads the
  // same sheet, and two readers with two functions behind one key is how they
  // drift apart.
  const { data, isLoading } = useMemorialSheet(event.id);
  const { data: publishers } = useAllPublishers();

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: memorialKey(event.id) });
  };
  const prepareM = useMutation({
    mutationFn: () => memorialApi.prepare(event.id),
    onSuccess: invalidate,
  });
  const updateM = useMutation({
    mutationFn: (v: {
      lineId: string;
      input: Parameters<typeof memorialApi.updateLine>[1];
    }) => memorialApi.updateLine(v.lineId, v.input),
    onSuccess: invalidate,
  });
  const themeM = useMutation({
    mutationFn: (v: { theme: string | null; url: string | null }) =>
      memorialApi.setTheme(event.id, v.theme, v.url),
    onSuccess: invalidate,
  });
  const publishM = useMutation({
    mutationFn: () => memorialApi.publish(event.id),
    onSuccess: invalidate,
  });

  const programme = (data?.items ?? []).filter(
    (i) => i.section === 'programme',
  );
  const canWrite = canEdit && (data?.editable ?? false);
  const published = !!data?.event.publishedAt;
  const filled = programme.filter(
    (l) =>
      (SONG_PARTS.has(l.partKey ?? '') && l.songNumber !== null) ||
      (!SONG_PARTS.has(l.partKey ?? '') && (l.publisherId || l.personText)),
  ).length;

  const nameOf = (line: MemorialItem): string | null =>
    line.personText ??
    (line.publisherId
      ? (publishers?.data.find((p) => p.id === line.publisherId)?.displayName ??
        null)
      : null);

  return (
    <CollapsibleMeetingBlock
      accent="#7c3aed"
      icon="wine-outline"
      title={t('memorial.title')}
      meta={memorialMeta(event)}
      metaAddress={event.address ?? undefined}
      assigned={filled}
      total={programme.length}
      showBadge={programme.length > 0}
      actionLabel={
        canWrite && !published && programme.length > 0
          ? t('memorial.publish')
          : undefined
      }
      actionBusy={publishM.isPending}
      onAction={() => publishM.mutate()}
    >
      {isLoading ? (
        <ActivityIndicator style={{ marginVertical: 16 }} />
      ) : (
        <View style={styles.body}>
          {/* Draft or ready, said once — it decides whether anybody has been
              told about any of this yet. */}
          {data?.editable ? (
            <View style={published ? styles.statePub : styles.stateDraft}>
              <Ionicons
                name={published ? 'checkmark-circle' : 'create-outline'}
                size={14}
                color={published ? '#15803d' : '#b45309'}
              />
              <Text
                style={published ? styles.statePubText : styles.stateDraftText}
              >
                {t(published ? 'memorial.published' : 'memorial.draft')}
              </Text>
            </View>
          ) : null}

          <ThemeRow
            theme={data?.event.theme ?? null}
            url={data?.event.themeUrl ?? null}
            canWrite={canWrite}
            saving={themeM.isPending}
            onSave={(theme, url) => themeM.mutate({ theme, url })}
          />

          {programme.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>{t('memorial.empty')}</Text>
              {canWrite ? (
                <>
                  <Pressable
                    style={styles.prepareBtn}
                    disabled={prepareM.isPending}
                    onPress={() => prepareM.mutate()}
                  >
                    {prepareM.isPending ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.prepareBtnText}>
                        {t('memorial.prepare')}
                      </Text>
                    )}
                  </Pressable>
                  <Text style={styles.prepareHint}>
                    {t('memorial.prepareHint')}
                  </Text>
                </>
              ) : null}
            </View>
          ) : (
            programme.map((line) => (
              <Line
                key={line.id}
                line={line}
                canWrite={canWrite}
                name={nameOf(line)}
                memorialDate={event.date}
                onChange={(input) => updateM.mutate({ lineId: line.id, input })}
              />
            ))
          )}

          {/* The places the emblems pass, under the programme: they belong to
              the evening's order, not to the duties of the door. The duties
              themselves are in the «Обязанности» section, where whoever looks
              for them expects them. */}
          {programme.length > 0 ? (
            <MemorialDutiesCard
              event={event}
              canEdit={canEdit}
              section="emblems"
              title={t('memorial.sections.emblems')}
            />
          ) : null}

          {/* Assignments entered for the meeting the Memorial takes are not
              deleted, only hidden — so they can be re-homed rather than lost. */}
          {hiddenCount > 0 ? (
            <Text style={styles.hidden}>
              {t('specialEvents.replaced.hidden', { count: hiddenCount })}
            </Text>
          ) : null}
        </View>
      )}
    </CollapsibleMeetingBlock>
  );
}

function memorialMeta(event: SpecialEvent): string {
  const d = new Date(`${event.date}T00:00:00`);
  const day = d.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return event.time ? `${day} · ${event.time}` : day;
}

/** The theme comes from the yearly letter, so it is typed, never compiled in. */
function ThemeRow({
  theme,
  url,
  canWrite,
  saving,
  onSave,
}: {
  theme: string | null;
  url: string | null;
  canWrite: boolean;
  saving: boolean;
  onSave: (theme: string | null, url: string | null) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(theme ?? '');
  const [draftUrl, setDraftUrl] = useState(url ?? '');

  if (!open) {
    return (
      <Pressable
        disabled={!canWrite}
        onPress={() => setOpen(true)}
        style={styles.themeRow}
      >
        <Text style={styles.themeLabel}>{t('memorial.theme')}</Text>
        <Text style={styles.themeValue}>{theme || '—'}</Text>
      </Pressable>
    );
  }
  return (
    <View style={styles.themeEdit}>
      <Text style={styles.themeLabel}>{t('memorial.theme')}</Text>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        placeholder={t('memorial.themePlaceholder')}
        placeholderTextColor="#94a3b8"
        style={styles.input}
        multiline
      />
      <TextInput
        value={draftUrl}
        onChangeText={setDraftUrl}
        placeholder={t('memorial.themeUrlPlaceholder')}
        placeholderTextColor="#94a3b8"
        style={styles.input}
        autoCapitalize="none"
        keyboardType="url"
      />
      <Pressable
        style={styles.saveBtn}
        disabled={saving}
        onPress={() => {
          onSave(draft.trim() || null, draftUrl.trim() || null);
          setOpen(false);
        }}
      >
        <Text style={styles.saveBtnText}>{t('common.save')}</Text>
      </Pressable>
    </View>
  );
}

function Line({
  line,
  canWrite,
  name,
  memorialDate,
  onChange,
}: {
  line: MemorialItem;
  canWrite: boolean;
  name: string | null;
  memorialDate: string;
  onChange: (input: Parameters<typeof memorialApi.updateLine>[1]) => void;
}) {
  const { t } = useTranslation();
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState(line.note ?? '');
  const isSong = SONG_PARTS.has(line.partKey ?? '');

  return (
    <View style={styles.line}>
      {isSong ? (
        <SongRow
          label={line.label}
          number={line.songNumber}
          canWrite={canWrite}
          onPick={(n) => onChange({ songNumber: n })}
        />
      ) : canWrite ? (
        <PublisherSelector
          boxed
          label={line.label}
          value={line.publisherId}
          onChange={(pid) => onChange({ publisherId: pid })}
          genderFilter="brother"
          excludeAppointments={[...NOT_BAPTIZED]}
          absenceDate={memorialDate}
        />
      ) : (
        <>
          <Text style={styles.lineLabel}>{line.label}</Text>
          <Text style={styles.readValue}>{name || '—'}</Text>
        </>
      )}

      {line.note || canWrite ? (
        noteOpen && canWrite ? (
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder={t('memorial.notePlaceholder')}
            placeholderTextColor="#94a3b8"
            style={styles.input}
            multiline
            autoFocus
            onBlur={() => {
              if (note !== (line.note ?? '')) {
                onChange({ note: note.trim() || null });
              }
              setNoteOpen(false);
            }}
          />
        ) : (
          <Pressable
            disabled={!canWrite}
            onPress={() => setNoteOpen(true)}
            style={styles.noteRow}
          >
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={13}
              color="#64748b"
            />
            <Text style={styles.noteText}>
              {line.note || t('memorial.addNote')}
            </Text>
          </Pressable>
        )
      ) : null}
    </View>
  );
}

/**
 * A song is CHOSEN, not browsed.
 *
 * The first attempt put the picker inline, and it unrolled all hundred and
 * fifty-one songs inside the line. A tap opens the list in a sheet, the way
 * every other choice in this app is made, and closes on picking.
 */
function SongRow({
  label,
  number,
  canWrite,
  onPick,
}: {
  label: string;
  number: number | null;
  canWrite: boolean;
  onPick: (n: number | null) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { data: songs } = useQuery({
    queryKey: ['songs'],
    queryFn: () => songsApi.list({ limit: 500 }),
    enabled: open,
    staleTime: 60 * 60 * 1000,
  });

  const current = songs?.data.find((s) => s.number === number);
  const q = search.trim().toLowerCase();
  const shown = (songs?.data ?? []).filter(
    (s) =>
      !q || String(s.number) === q || s.title.toLowerCase().includes(q),
  );

  return (
    <>
      <Pressable
        disabled={!canWrite}
        onPress={() => setOpen(true)}
        style={styles.songRow}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.lineLabel}>{label}</Text>
          <Text style={number ? styles.songValue : styles.songEmpty}>
            {number
              ? `${number}${current ? ` — ${current.title}` : ''}`
              : t('songPicker.none')}
          </Text>
        </View>
        {canWrite ? (
          <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
        ) : null}
      </Pressable>

      <Sheet
        visible={open}
        title={label}
        onClose={() => setOpen(false)}
        closeLabel={t('common.close')}
      >
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t('songPicker.search')}
          placeholderTextColor="#94a3b8"
          style={styles.input}
        />
        {number ? (
          <Pressable
            style={styles.clearRow}
            onPress={() => {
              onPick(null);
              setOpen(false);
            }}
          >
            <Ionicons name="close-circle-outline" size={16} color="#dc2626" />
            <Text style={styles.clearText}>{t('songPicker.clear')}</Text>
          </Pressable>
        ) : null}
        <ScrollView style={styles.songList}>
          {shown.map((s) => (
            <Pressable
              key={s.id}
              style={[
                styles.songOption,
                s.number === number && styles.songOptionActive,
              ]}
              onPress={() => {
                onPick(s.number);
                setOpen(false);
              }}
            >
              <Text style={styles.songNum}>{s.number}</Text>
              <Text style={styles.songTitle}>{s.title}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  body: { gap: 10, paddingHorizontal: 16, paddingBottom: 16 },
  stateDraft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    padding: 10,
  },
  stateDraftText: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'Manrope_600SemiBold',
    color: '#b45309',
  },
  statePub: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#dcfce7',
    borderRadius: 8,
    padding: 10,
  },
  statePubText: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'Manrope_600SemiBold',
    color: '#15803d',
  },

  themeRow: { gap: 2, paddingVertical: 6 },
  themeEdit: { gap: 8, paddingVertical: 6 },
  themeLabel: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  themeValue: { fontSize: 14, color: '#0f172a', lineHeight: 20 },

  line: { gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  lineLabel: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
    color: '#334155',
  },
  readValue: { fontSize: 15, color: '#0f172a' },

  songRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  songValue: { fontSize: 15, color: '#0f172a', marginTop: 2 },
  songEmpty: { fontSize: 15, color: '#94a3b8', marginTop: 2 },
  songList: { maxHeight: 420 },
  songOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  songOptionActive: { backgroundColor: '#ecfeff' },
  songNum: {
    width: 34,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
    color: '#0369a1',
    backgroundColor: '#e0f2fe',
    borderRadius: 6,
    paddingVertical: 2,
  },
  songTitle: { flex: 1, fontSize: 14, color: '#0f172a' },
  clearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  clearText: { fontSize: 14, color: '#dc2626' },

  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: '#0f172a',
  },
  saveBtn: {
    backgroundColor: '#0ea5e9',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  emptyBox: { alignItems: 'center', gap: 10, paddingVertical: 14 },
  emptyText: { fontSize: 14, color: '#64748b', textAlign: 'center' },
  prepareBtn: {
    backgroundColor: '#0ea5e9',
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 20,
  },
  prepareBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  prepareHint: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 17,
  },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  noteText: { flex: 1, fontSize: 12, color: '#64748b', lineHeight: 17 },
  hidden: {
    fontSize: 12,
    color: '#b45309',
    fontStyle: 'italic',
    marginTop: 6,
  },
});
