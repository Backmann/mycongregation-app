import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { TimeWheel } from './TimeWheel';

/**
 * Compact time input: a one-line field showing the value; tapping it expands
 * the iOS-style wheel underneath (with a Done button), so an always-open
 * wheel never hijacks the modal's scroll gesture.
 */
export function TimeField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable style={styles.field} onPress={() => setOpen((v) => !v)}>
        <Ionicons name="time-outline" size={17} color="#0369a1" />
        <Text style={[styles.value, !value && styles.placeholder]}>
          {value || placeholder || '—'}
        </Text>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={16}
          color="#94a3b8"
        />
      </Pressable>
      {open ? (
        <View style={styles.wheelBox}>
          <TimeWheel value={value} onChange={onChange} />
          <Pressable style={styles.doneBtn} onPress={() => setOpen(false)}>
            <Text style={styles.doneText}>{t('common.done')}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: '#f8fafc',
  },
  value: { flex: 1, fontSize: 15, fontWeight: '700', color: '#0f172a' },
  placeholder: { color: '#94a3b8', fontWeight: '400' },
  wheelBox: { marginTop: 6 },
  doneBtn: {
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 22,
    borderRadius: 10,
    backgroundColor: '#e0f2fe',
    marginTop: 2,
  },
  doneText: { color: '#0369a1', fontSize: 14, fontWeight: '700' },
});
