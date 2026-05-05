import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '../../../lib/auth';

export default function ProfileScreen() {
  const { user, logout } = useAuth();

  if (!user) return null;

  const isAdmin = user.role === 'admin' || user.role === 'elder';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f1f5f9' }}
      contentContainerStyle={{ paddingBottom: 32 }}
    >
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>SIGNED IN AS</Text>
        <View style={styles.card}>
          <Text style={styles.email}>{user.email}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{user.role}</Text>
          </View>
        </View>
      </View>

      {isAdmin && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ADMIN TOOLS</Text>
          <View style={styles.card}>
            <Pressable
              style={({ pressed }) => [
                styles.row,
                pressed && styles.rowPressed,
              ]}
              onPress={() => router.push('/profile/public-talks' as any)}
            >
              <View style={styles.rowIcon}>
                <Ionicons name="megaphone-outline" size={20} color="#0ea5e9" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Public talks catalog</Text>
                <Text style={styles.rowSubtitle}>
                  Manage S-34 talks list
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
            </Pressable>
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Pressable
          style={({ pressed }) => [
            styles.logoutButton,
            pressed && { opacity: 0.7 },
          ]}
          onPress={logout}
        >
          <Ionicons name="log-out-outline" size={18} color="#dc2626" />
          <Text style={styles.logoutText}>Sign out</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 16 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
  },
  email: {
    fontSize: 15,
    color: '#0f172a',
    paddingHorizontal: 20,
    paddingTop: 14,
    fontWeight: '500',
  },
  roleBadge: {
    alignSelf: 'flex-start',
    marginHorizontal: 20,
    marginVertical: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: '#e0f2fe',
  },
  roleText: {
    fontSize: 11,
    color: '#0369a1',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowPressed: { backgroundColor: '#f8fafc' },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e0f2fe',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rowTitle: { fontSize: 15, color: '#0f172a', fontWeight: '500' },
  rowSubtitle: { fontSize: 12, color: '#64748b', marginTop: 2 },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    marginHorizontal: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 10,
  },
  logoutText: { color: '#dc2626', fontSize: 16, fontWeight: '500' },
});
