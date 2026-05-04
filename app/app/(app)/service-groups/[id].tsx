import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  extractErrorMessage,
  Publisher,
  serviceGroupsApi,
} from '../../../lib/api';

export default function ServiceGroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const groupQuery = useQuery({
    queryKey: ['service-group', id],
    queryFn: () => serviceGroupsApi.getById(id!),
    enabled: !!id,
  });

  const membersQuery = useQuery({
    queryKey: ['service-group', id, 'publishers'],
    queryFn: () => serviceGroupsApi.getPublishers(id!),
    enabled: !!id,
  });

  if (groupQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (groupQuery.error || !groupQuery.data) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          {groupQuery.error
            ? extractErrorMessage(groupQuery.error)
            : 'Not found'}
        </Text>
      </View>
    );
  }

  const group = groupQuery.data;
  const members = membersQuery.data?.data ?? [];
  const overseer = members.find((p) => p.id === group.overseerPublisherId);
  const assistant = members.find((p) => p.id === group.assistantPublisherId);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 32 }}>
      <View style={styles.headerSection}>
        <Text style={styles.headerName}>{group.name}</Text>
        {group.meetingLocation && (
          <Text style={styles.headerSub}>📍 {group.meetingLocation}</Text>
        )}
        {group.deletedAt && <Text style={styles.removedBadge}>Removed</Text>}
      </View>

      {(overseer || assistant) && (
        <View style={styles.leadership}>
          {overseer && (
            <Pressable
              style={({ pressed }) => [
                styles.leaderCard,
                pressed && styles.rowPressed,
              ]}
              onPress={() => router.push(`/publishers/${overseer.id}` as any)}
            >
              <Text style={styles.leaderRole}>Overseer</Text>
              <Text style={styles.leaderName}>{overseer.displayName}</Text>
            </Pressable>
          )}
          {assistant && (
            <Pressable
              style={({ pressed }) => [
                styles.leaderCard,
                pressed && styles.rowPressed,
              ]}
              onPress={() => router.push(`/publishers/${assistant.id}` as any)}
            >
              <Text style={styles.leaderRole}>Assistant</Text>
              <Text style={styles.leaderName}>{assistant.displayName}</Text>
            </Pressable>
          )}
        </View>
      )}

      {group.notes && (
        <View style={styles.notesBox}>
          <Text style={styles.notesText}>{group.notes}</Text>
        </View>
      )}

      <Text style={styles.sectionTitle}>
        Members ({membersQuery.data?.total ?? 0})
      </Text>

      <View style={styles.list}>
        {membersQuery.isLoading ? (
          <ActivityIndicator style={{ padding: 16 }} />
        ) : members.length === 0 ? (
          <Text style={styles.empty}>No members in this group yet</Text>
        ) : (
          members.map((p) => <MemberRow key={p.id} publisher={p} />)
        )}
      </View>
    </ScrollView>
  );
}

function MemberRow({ publisher }: { publisher: Publisher }) {
  const initials =
    (publisher.firstName[0] ?? '') + (publisher.lastName[0] ?? '');
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={() => router.push(`/publishers/${publisher.id}` as any)}
    >
      <View
        style={[
          styles.avatar,
          {
            backgroundColor:
              publisher.gender === 'brother' ? '#0ea5e9' : '#ec4899',
          },
        ]}
      >
        <Text style={styles.avatarText}>{initials}</Text>
      </View>
      <Text style={styles.name}>{publisher.displayName}</Text>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  errorText: { color: '#dc2626', fontSize: 16, textAlign: 'center' },

  headerSection: {
    backgroundColor: '#fff',
    paddingTop: 24,
    paddingBottom: 24,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0f172a',
    paddingHorizontal: 24,
    textAlign: 'center',
  },
  headerSub: { color: '#64748b', marginTop: 6, fontSize: 14 },
  removedBadge: {
    marginTop: 8,
    color: '#92400e',
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    fontSize: 12,
    fontWeight: '600',
  },

  leadership: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  leaderCard: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  leaderRole: {
    fontSize: 11,
    color: '#7c3aed',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  leaderName: {
    fontSize: 15,
    color: '#0f172a',
    marginTop: 4,
    fontWeight: '500',
  },

  notesBox: {
    backgroundColor: '#fff',
    margin: 16,
    marginTop: 0,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  notesText: { color: '#475569', fontSize: 14 },

  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    marginTop: 8,
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  list: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
  },
  empty: {
    textAlign: 'center',
    color: '#94a3b8',
    padding: 32,
    fontSize: 14,
  },

  row: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    alignItems: 'center',
  },
  rowPressed: { backgroundColor: '#f8fafc' },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  name: { fontSize: 15, fontWeight: '500', color: '#0f172a', flex: 1 },
  chevron: { color: '#cbd5e1', fontSize: 24, marginLeft: 8 },
});
