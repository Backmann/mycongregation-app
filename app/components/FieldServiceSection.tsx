import { useEffect, useState } from 'react';
import {
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import {
  CreateFieldServiceMeetingInput,
  FieldServiceMeeting,
  Publisher,
  UpdateFieldServiceMeetingInput,
} from '../lib/api';
import { PublisherSelector } from './PublisherSelector';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

function sortMeetings(a: FieldServiceMeeting, b: FieldServiceMeeting): number {
  return a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime);
}

type Props = {
  meetings: FieldServiceMeeting[];
  publishersById: Map<string, Publisher>;
  canEdit: boolean;
  weekStartISO: string;
  onCreate: (input: CreateFieldServiceMeetingInput) => void;
  onUpdate: (id: string, input: UpdateFieldServiceMeetingInput) => void;
  onRemove: (id: string) => void;
  pending?: boolean;
};

export function FieldServiceSection({
  meetings,
  publishersById,
  canEdit,
  weekStartISO,
  onCreate,
  onUpdate,
  onRemove,
  pending,
}: Props) {
  const { t } = useTranslation();
  const [formFor, setFormFor] = useState<FieldServiceMeeting | 'new' | null>(
    null,
  );

  if (meetings.length === 0 && !canEdit) return null;

  const list = meetings.slice().sort(sortMeetings);

  const openLink = (url: string) => {
    Linking.openURL(url).catch(() => {});
  };

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Ionicons name="megaphone-outline" size={16} color="#475569" />
        <Text style={styles.headerText}>{t('fieldService.title')}</Text>
      </View>

      {list.length === 0 ? (
        <Text style={styles.empty}>{t('fieldService.empty')}</Text>
      ) : (
        <View style={styles.rows}>
          {list.map((m) => {
            const conductor = m.conductorPublisherId
              ? publishersById.get(m.conductorPublisherId) ?? null
              : null;
            return (
              <View key={m.id} style={styles.row}>
                <View style={styles.rowMain}>
                  <View style={styles.rowTop}>
                    <Text style={styles.when}>
                      {t(`fieldService.days.${m.dayOfWeek}`)} · {m.startTime}
                    </Text>
                    <Text
                      style={[
                        styles.conductor,
                        !conductor && styles.unassigned,
                      ]}
                      numberOfLines={1}
                    >
                      {conductor
                        ? conductor.displayName
                        : t('fieldService.unassigned')}
                    </Text>
                  </View>
                  <Text style={styles.address} numberOfLines={2}>
                    {m.address}
                  </Text>
                  {!!m.topic && (
                    <Text style={styles.topic} numberOfLines={3}>
                      {m.topic}
                    </Text>
                  )}
                  {!!m.sourceUrl && (
                    <Pressable
                      onPress={() => openLink(m.sourceUrl as string)}
                      hitSlop={6}
                    >
                      <Text style={styles.link} numberOfLines={1}>
                        <Ionicons
                          name="link-outline"
                          size={13}
                          color="#0369a1"
                        />{' '}
                        {t('fieldService.openLink')}
                      </Text>
                    </Pressable>
                  )}
                </View>
                {canEdit && (
                  <View style={styles.rowActions}>
                    <Pressable
                      onPress={() => setFormFor(m)}
                      hitSlop={8}
                      style={styles.iconBtn}
                      disabled={pending}
                    >
                      <Ionicons name="create-outline" size={20} color="#0369a1" />
                    </Pressable>
                    <Pressable
                      onPress={() => onRemove(m.id)}
                      hitSlop={8}
                      style={styles.iconBtn}
                      disabled={pending}
                    >
                      <Ionicons name="trash-outline" size={20} color="#dc2626" />
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      {canEdit && (
        <Pressable
          style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed]}
          onPress={() => setFormFor('new')}
        >
          <Ionicons name="add-circle-outline" size={16} color="#0369a1" />
          <Text style={styles.addBtnText}>{t('fieldService.addEntry')}</Text>
        </Pressable>
      )}

      <FieldServiceForm
        target={formFor}
        weekStartISO={weekStartISO}
        onClose={() => setFormFor(null)}
        onCreate={(input) => {
          onCreate(input);
          setFormFor(null);
        }}
        onUpdate={(id, input) => {
          onUpdate(id, input);
          setFormFor(null);
        }}
      />
    </View>
  );
}

function FieldServiceForm({
  target,
  weekStartISO,
  onClose,
  onCreate,
  onUpdate,
}: {
  target: FieldServiceMeeting | 'new' | null;
  weekStartISO: string;
  onClose: () => void;
  onCreate: (input: CreateFieldServiceMeetingInput) => void;
  onUpdate: (id: string, input: UpdateFieldServiceMeetingInput) => void;
}) {
  const { t } = useTranslation();
  const editing = target && target !== 'new' ? target : null;
  const visible = target !== null;

  const [dayOfWeek, setDayOfWeek] = useState<number>(2);
  const [startTime, setStartTime] = useState('');
  const [address, setAddress] = useState('');
  const [conductorPublisherId, setConductorPublisherId] = useState<
    string | null
  >(null);
  const [topic, setTopic] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');

  useEffect(() => {
    if (target === 'new') {
      setDayOfWeek(2);
      setStartTime('');
      setAddress('');
      setConductorPublisherId(null);
      setTopic('');
      setSourceUrl('');
    } else if (target) {
      setDayOfWeek(target.dayOfWeek);
      setStartTime(target.startTime);
      setAddress(target.address);
      setConductorPublisherId(target.conductorPublisherId);
      setTopic(target.topic ?? '');
      setSourceUrl(target.sourceUrl ?? '');
    }
  }, [target]);

  const canSave = address.trim().length > 0 && TIME_RE.test(startTime);

  const submit = () => {
    if (!canSave) return;
    const base = {
      dayOfWeek,
      startTime,
      address: address.trim(),
      conductorPublisherId,
      topic: topic.trim() || null,
      sourceUrl: sourceUrl.trim() || null,
    };
    if (editing) {
      onUpdate(editing.id, base);
    } else {
      onCreate({ weekStartDate: weekStartISO, ...base });
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>
            {editing ? t('fieldService.form.editTitle') : t('fieldService.form.addTitle')}
          </Text>

          <ScrollView
            style={styles.formScroll}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.fieldLabel}>{t('fieldService.dayLabel')}</Text>
            <View style={styles.dayRow}>
              {DAYS.map((d) => {
                const selected = d === dayOfWeek;
                return (
                  <Pressable
                    key={d}
                    onPress={() => setDayOfWeek(d)}
                    style={[styles.dayChip, selected && styles.dayChipOn]}
                  >
                    <Text
                      style={[
                        styles.dayChipText,
                        selected && styles.dayChipTextOn,
                      ]}
                    >
                      {t(`fieldService.days.${d}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>{t('fieldService.timeLabel')}</Text>
            <TextInput
              style={styles.input}
              value={startTime}
              onChangeText={setStartTime}
              placeholder={t('fieldService.form.timePlaceholder')}
              placeholderTextColor="#94a3b8"
              keyboardType="numbers-and-punctuation"
              maxLength={5}
            />

            <Text style={styles.fieldLabel}>{t('fieldService.addressLabel')}</Text>
            <TextInput
              style={styles.input}
              value={address}
              onChangeText={setAddress}
              placeholder={t('fieldService.form.addressPlaceholder')}
              placeholderTextColor="#94a3b8"
              maxLength={255}
            />

            <Text style={styles.fieldLabel}>{t('fieldService.conductor')}</Text>
            <PublisherSelector
              label={t('fieldService.conductor')}
              value={conductorPublisherId}
              onChange={setConductorPublisherId}
            />

            <Text style={styles.fieldLabel}>{t('fieldService.topicLabel')}</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={topic}
              onChangeText={setTopic}
              placeholder={t('fieldService.form.topicPlaceholder')}
              placeholderTextColor="#94a3b8"
              multiline
              maxLength={2000}
            />

            <Text style={styles.fieldLabel}>{t('fieldService.linkLabel')}</Text>
            <TextInput
              style={styles.input}
              value={sourceUrl}
              onChangeText={setSourceUrl}
              placeholder={t('fieldService.form.linkPlaceholder')}
              placeholderTextColor="#94a3b8"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              maxLength={2000}
            />
          </ScrollView>

          <View style={styles.modalActions}>
            <Pressable style={styles.modalCancel} onPress={onClose}>
              <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable
              style={[styles.modalConfirm, !canSave && styles.disabled]}
              onPress={submit}
              disabled={!canSave}
            >
              <Text style={styles.modalConfirmText}>
                {t('fieldService.form.save')}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  headerText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  empty: {
    fontSize: 13,
    color: '#94a3b8',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },

  rows: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f1f5f9',
    gap: 10,
  },
  rowMain: { flex: 1, gap: 2 },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  when: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  conductor: {
    fontSize: 14,
    color: '#334155',
    fontWeight: '600',
    maxWidth: '55%',
  },
  unassigned: { color: '#cbd5e1', fontWeight: '400' },
  address: { fontSize: 13, color: '#475569' },
  topic: { fontSize: 13, color: '#64748b', fontStyle: 'italic' },
  link: { fontSize: 13, color: '#0369a1', fontWeight: '600', marginTop: 2 },
  rowActions: { flexDirection: 'row', gap: 2 },
  iconBtn: { padding: 4 },

  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#bae6fd',
    backgroundColor: '#f8fafc',
  },
  addBtnPressed: { backgroundColor: '#e0f2fe' },
  addBtnText: { fontSize: 14, fontWeight: '600', color: '#0369a1' },

  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    gap: 12,
    maxHeight: '85%',
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  formScroll: { maxHeight: 420 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginTop: 10,
    marginBottom: 4,
  },
  dayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dayChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
  },
  dayChipOn: { borderColor: '#0ea5e9', backgroundColor: '#e0f2fe' },
  dayChipText: { fontSize: 13, color: '#475569', fontWeight: '600' },
  dayChipTextOn: { color: '#0369a1' },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0f172a',
  },
  multiline: { minHeight: 64, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  modalCancel: { paddingVertical: 10, paddingHorizontal: 14 },
  modalCancelText: { fontSize: 15, color: '#64748b', fontWeight: '600' },
  modalConfirm: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: '#0ea5e9',
  },
  modalConfirmText: { fontSize: 15, color: '#fff', fontWeight: '600' },
  disabled: { opacity: 0.5 },
});
