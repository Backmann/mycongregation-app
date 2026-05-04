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
  familiesApi,
  Publisher,
} from '../../../lib/api';

export default function FamilyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const familyQuery = useQuery({
    queryKey: ['family', id],
    queryFn: () => familiesApi.getById(id!),
    enabled: !!id,
  });

  const membersQuery = useQuery({
    queryKey: ['family', id, 'publishers'],
    queryFn: () => familiesApi.getPublishers(id!),
    enabled: !!id,
  });

  if (familyQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (familyQuery.error || !familyQuery.data) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          {familyQuery.error
            ? extractErrorMessage(familyQuery.error)
            : 'Not found'}
        </Text>
      </View>
    );
  }

  const family = familyQuery.data;
  const members = membersQuery.data?.data ?? [];
  const head = members.find((p) => p.id === family.headPublisherId);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 32 }}>
      <View style={styles.headerSection}>
        <Text style={styles.headerName}>{family.name}</Text>
        {family.deletedAt && (
          <Text style={styles.removedBadge}>Removed</Text>
        )}
      </View>

      {family.notes && (
        <View style={styles.notesBox}>
          <Text style={styles.notesText}>{family.notes}</Text>
        </View>
      )}

      <Text style={styles.sectionTitle}>
        Members ({membersQuery.data?.total ?? 0})
      </Text>

      <View style={styles.list}>
        {membersQuery.isLoading ? (
          <ActivityIndicator style={{ padding: 16 }} />
        ) : members.length === 0 ? (
          <Text style={styles.empty}>No members linked to this family yet</Text>
        ) : (
          members.map((p) => (
            <MemberRow
              key={p.id}
              publisher={p}
              isHead={p.id === family.headPublisherId}
            />
          ))
        )}
      </View>

      {head && (
        <View style={styles.footnote}>
          <Text style={styles.footnoteText}>
            Family head: {head.displayName}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

function MemberRow({
  publisher,
  isHead,
}: {
  publisher: Publisher;
  isHead: boolean;
}) {
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
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{publisher.displayName}</Text>
        {isHead && <Text style={styles.headTag}>Head</Text>}
      </View>
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

  notesBox: {
    backgroundColor: '#fff',
    margin: 16,
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
  name: { fontSize: 15, fontWeight: '500', color: '#0f172a' },
  headTag: {
    fontSize: 11,
    color: '#0369a1',
    backgroundColor: '#e0f2fe',
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    marginTop: 2,
    fontWeight: '500',
  },
  chevron: { color: '#cbd5e1', fontSize: 24, marginLeft: 8 },

  footnote: {
    padding: 16,
    paddingTop: 12,
  },
  footnoteText: { fontSize: 12, color: '#94a3b8', textAlign: 'center' },
});
