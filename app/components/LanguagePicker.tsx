import { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  getCurrentLanguage,
  getDeviceLanguage,
  setLanguage,
  SupportedLanguage,
} from '../lib/i18n';
import { api, TOKEN_KEY } from '../lib/api';
import { storage } from '../lib/storage';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** If true, modal cannot be dismissed without selecting (first-launch mode). */
  required?: boolean;
}

const LANGUAGES: {
  /* flags removed */
  code: SupportedLanguage;
  nameKey: string;
}[] = [
  { code: 'en', nameKey: 'language.english' },
  { code: 'ru', nameKey: 'language.russian' },
  { code: 'de', nameKey: 'language.german' },
];

export function LanguagePickerModal({ visible, onClose, required = false }: Props) {
  const { t } = useTranslation();
  const detected = getDeviceLanguage();
  const current = getCurrentLanguage();
  const [selected, setSelected] = useState<SupportedLanguage>(current);

  const handleConfirm = async () => {
    await setLanguage(selected);
    onClose();
    // Persist to server so push notifications and cross-device sync use the
    // latest choice. Best-effort: failures don't undo the local change.
    try {
      const token = await storage.getItem(TOKEN_KEY);
      if (token) {
        await api.patch('/auth/me', { uiLanguage: selected });
      }
    } catch (err) {
      console.warn('[i18n] Failed to persist uiLanguage to server:', err);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={required ? undefined : onClose}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={required ? undefined : onClose}
          accessibilityRole="button"
        />
        <View style={styles.modal}>
          <Text style={styles.title}>{t('language.choose')}</Text>
          {LANGUAGES.map((lang) => {
            const isSelected = selected === lang.code;
            const isDetected = lang.code === detected;
            return (
              <Pressable
                key={lang.code}
                style={[styles.option, isSelected && styles.optionSelected]}
                onPress={() => setSelected(lang.code)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionText}>{t(lang.nameKey)}</Text>
                  {isDetected && (
                    <Text style={styles.detectedText}>{t('language.detected')}</Text>
                  )}
                </View>
                {isSelected && (
                  <Ionicons name="checkmark-circle" size={22} color="#0ea5e9" />
                )}
              </Pressable>
            );
          })}
          <Pressable style={styles.confirmButton} onPress={handleConfirm}>
            <Text style={styles.confirmText}>{t('common.confirm')}</Text>
          </Pressable>
          {!required && (
            <Pressable style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modal: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 360,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 16,
    textAlign: 'center',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    marginBottom: 8,
    borderWidth: 2,
    borderColor: '#f8fafc',
  },
  optionSelected: {
    borderColor: '#0ea5e9',
    backgroundColor: '#e0f2fe',
  },
  optionText: { fontSize: 15, color: '#0f172a' },
  detectedText: { fontSize: 11, color: '#0ea5e9', marginTop: 2 },
  confirmButton: {
    backgroundColor: '#0ea5e9',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  confirmText: { color: 'white', fontSize: 16, fontWeight: '600' },
  cancelButton: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  cancelText: { color: '#64748b', fontSize: 14 },
});
