import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { meApi } from '../lib/api';
import { useAuth } from '../lib/auth';
import { hasUnread } from '../lib/inbox';

export const QK_INBOX = ['me', 'inbox'] as const;

/**
 * The bell in the header of «Главная» — the door to «Мои уведомления».
 *
 * A DOT, never a number. A count of unread messages is one more thing asking
 * to be cleared, and the list is not a task: it is where somebody looks when
 * they think they missed something.
 *
 * Draws nothing until the server has answered — an older server has no such
 * door, and a bell that opens an error is worse than no bell.
 */
export function InboxBell() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: QK_INBOX,
    queryFn: () => meApi.inbox(),
    enabled: !!user,
    staleTime: 60_000,
    retry: false,
  });
  if (!data) return null;
  const unread = hasUnread(data.items, data.seenAt);

  return (
    <Pressable
      onPress={() => router.push('/home/inbox' as never)}
      hitSlop={10}
      style={({ pressed }) => [styles.bell, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
      accessibilityLabel={
        unread ? t('inbox.bellUnread') : t('inbox.bell')
      }
    >
      <Ionicons
        name={unread ? 'notifications' : 'notifications-outline'}
        size={22}
        color="#ffffff"
      />
      {unread ? <View style={styles.dot} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bell: { paddingHorizontal: 4, paddingVertical: 2 },
  dot: {
    position: 'absolute',
    top: 1,
    right: 3,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#fbbf24',
    borderWidth: 2,
    borderColor: '#0e7490',
  },
});
