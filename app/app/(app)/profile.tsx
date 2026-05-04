import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrator',
  elder: 'Elder',
  ministerial_servant: 'Ministerial Servant',
  publisher: 'Publisher',
};

export default function ProfileScreen() {
  const { user, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    router.replace('/(auth)/login');
  };

  if (!user) return null;

  const initial = user.email[0]?.toUpperCase() ?? '?';

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 32 }}>
      <View style={styles.headerSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <Text style={styles.email}>{user.email}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>{ROLE_LABELS[user.role] ?? user.role}</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Connection</Text>
      <View style={styles.section}>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>API endpoint</Text>
          <Text style={styles.fieldValue} numberOfLines={1}>
            {API_URL}
          </Text>
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Congregation ID</Text>
          <Text style={styles.fieldValueMono} numberOfLines={1}>
            {user.congregationId}
          </Text>
        </View>
      </View>

      <Pressable
        style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.7 }]}
        onPress={handleSignOut}
      >
        <Ionicons name="log-out-outline" color="#dc2626" size={20} />
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },

  headerSection: {
    backgroundColor: '#fff',
    paddingTop: 24,
    paddingBottom: 24,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: { color: '#fff', fontSize: 36, fontWeight: '700' },
  email: { fontSize: 18, fontWeight: '600', color: '#0f172a' },
  roleBadge: {
    marginTop: 6,
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  roleText: { color: '#0369a1', fontSize: 13, fontWeight: '500' },

  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    marginTop: 24,
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  section: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
  },
  field: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  fieldLabel: { fontSize: 12, color: '#94a3b8', marginBottom: 2 },
  fieldValue: { fontSize: 14, color: '#0f172a' },
  fieldValueMono: {
    fontSize: 13,
    color: '#475569',
    fontFamily: 'monospace',
  },

  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    margin: 20,
    marginTop: 32,
    padding: 14,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
    gap: 8,
  },
  signOutText: { color: '#dc2626', fontSize: 16, fontWeight: '600' },
});
