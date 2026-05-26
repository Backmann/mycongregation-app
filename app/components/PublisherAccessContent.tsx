import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { extractErrorMessage, publishersApi } from '../lib/api';
import type { GrantAccessInput, Publisher } from '../lib/api';

function formatLastLogin(iso: string | null): string {
  if (!iso) return 'ещё не заходил';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function PublisherAccessContent({ publisher }: { publisher: Publisher }) {
  const queryClient = useQueryClient();
  const [grantOpen, setGrantOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  const accessQuery = useQuery({
    queryKey: ['publisher-access', publisher.id],
    queryFn: () => publishersApi.getAccess(publisher.id),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: ['publisher-access', publisher.id],
    });
    queryClient.invalidateQueries({ queryKey: ['publisher', publisher.id] });
  };

  const grantMutation = useMutation({
    mutationFn: (input: GrantAccessInput) =>
      publishersApi.grantAccess(publisher.id, input),
    onSuccess: () => {
      setGrantOpen(false);
      invalidate();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: {
      password?: string;
      isAdmin?: boolean;
      isActive?: boolean;
    }) => publishersApi.updateAccess(publisher.id, input),
    onSuccess: () => {
      setResetOpen(false);
      invalidate();
    },
  });

  if (accessQuery.isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }

  const access = accessQuery.data;

  if (!access || !access.hasAccess) {
    return (
      <View>
        <Text style={styles.muted}>
          У этого человека нет входа в приложение.
        </Text>
        <Pressable
          style={styles.primaryBtn}
          onPress={() => setGrantOpen(true)}
        >
          <Text style={styles.primaryBtnText}>Дать доступ</Text>
        </Pressable>
        <GrantModal
          visible={grantOpen}
          defaultEmail={publisher.email ?? ''}
          pending={grantMutation.isPending}
          error={grantMutation.isError ? extractErrorMessage(grantMutation.error) : null}
          onCancel={() => {
            grantMutation.reset();
            setGrantOpen(false);
          }}
          onSubmit={(email, password, isAdmin) =>
            grantMutation.mutate({
              email: email || undefined,
              password,
              isAdmin,
            })
          }
        />
      </View>
    );
  }

  return (
    <View>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Email</Text>
        <Text style={styles.rowValue}>{access.email}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Последний вход</Text>
        <Text style={styles.rowValue}>{formatLastLogin(access.lastLoginAt)}</Text>
      </View>
      <View style={styles.switchRow}>
        <Text style={styles.rowLabel}>Администратор</Text>
        <Switch
          value={access.role === 'admin'}
          onValueChange={(v) => updateMutation.mutate({ isAdmin: v })}
          disabled={updateMutation.isPending}
        />
      </View>

      {!access.isActive && (
        <Text style={styles.disabledNote}>Доступ отключён — войти нельзя.</Text>
      )}

      {updateMutation.isError && (
        <Text style={styles.error}>{extractErrorMessage(updateMutation.error)}</Text>
      )}

      <Pressable
        style={styles.secondaryBtn}
        onPress={() => setResetOpen(true)}
      >
        <Text style={styles.secondaryBtnText}>Сбросить пароль</Text>
      </Pressable>

      <Pressable
        style={styles.secondaryBtn}
        onPress={() => updateMutation.mutate({ isActive: !access.isActive })}
        disabled={updateMutation.isPending}
      >
        <Text
          style={[
            styles.secondaryBtnText,
            access.isActive && styles.dangerText,
          ]}
        >
          {access.isActive ? 'Отключить доступ' : 'Включить доступ'}
        </Text>
      </Pressable>

      <ResetModal
        visible={resetOpen}
        pending={updateMutation.isPending}
        error={updateMutation.isError ? extractErrorMessage(updateMutation.error) : null}
        onCancel={() => {
          updateMutation.reset();
          setResetOpen(false);
        }}
        onSubmit={(password) => updateMutation.mutate({ password })}
      />
    </View>
  );
}

function GrantModal({
  visible,
  defaultEmail,
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  visible: boolean;
  defaultEmail: string;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (email: string, password: string, isAdmin: boolean) => void;
}) {
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (visible) {
      setEmail(defaultEmail);
      setPassword('');
      setIsAdmin(false);
    }
  }, [visible, defaultEmail]);

  const canSubmit = password.length >= 8 && !pending;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>Дать доступ</Text>

          <Text style={styles.modalLabel}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="name@example.org"
          />

          <Text style={styles.modalLabel}>Пароль</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="Минимум 8 символов"
          />

          <View style={styles.switchRow}>
            <Text style={styles.rowLabel}>Сделать администратором</Text>
            <Switch value={isAdmin} onValueChange={setIsAdmin} />
          </View>

          <Text style={styles.hint}>
            Роль присвоится автоматически по назначению человека. Пароль сообщите
            ему отдельно — здесь он больше не показывается.
          </Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.modalBtns}>
            <Pressable style={styles.modalCancel} onPress={onCancel}>
              <Text style={styles.modalCancelText}>Отмена</Text>
            </Pressable>
            <Pressable
              style={[styles.modalOk, !canSubmit && styles.modalOkDisabled]}
              disabled={!canSubmit}
              onPress={() => onSubmit(email.trim(), password, isAdmin)}
            >
              <Text style={styles.modalOkText}>
                {pending ? '…' : 'Создать'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ResetModal({
  visible,
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  visible: boolean;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (password: string) => void;
}) {
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (visible) setPassword('');
  }, [visible]);

  const canSubmit = password.length >= 8 && !pending;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>Сбросить пароль</Text>

          <Text style={styles.modalLabel}>Новый пароль</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="Минимум 8 символов"
          />

          <Text style={styles.hint}>Сообщите новый пароль человеку отдельно.</Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.modalBtns}>
            <Pressable style={styles.modalCancel} onPress={onCancel}>
              <Text style={styles.modalCancelText}>Отмена</Text>
            </Pressable>
            <Pressable
              style={[styles.modalOk, !canSubmit && styles.modalOkDisabled]}
              disabled={!canSubmit}
              onPress={() => onSubmit(password)}
            >
              <Text style={styles.modalOkText}>
                {pending ? '…' : 'Сохранить'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  loading: {
    paddingVertical: 16,
    alignItems: 'flex-start',
  },
  muted: {
    fontSize: 15,
    color: '#6b7280',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  rowLabel: {
    fontSize: 15,
    color: '#374151',
    flexShrink: 1,
    paddingRight: 12,
  },
  rowValue: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '500',
    flexShrink: 1,
    textAlign: 'right',
  },
  disabledNote: {
    fontSize: 13,
    color: '#b45309',
    marginTop: 4,
    marginBottom: 4,
  },
  primaryBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  secondaryBtnText: {
    color: '#2563eb',
    fontSize: 15,
    fontWeight: '600',
  },
  dangerText: {
    color: '#dc2626',
  },
  error: {
    color: '#dc2626',
    fontSize: 14,
    marginTop: 8,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  modalLabel: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 6,
    marginTop: 8,
    textTransform: 'uppercase',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111827',
  },
  hint: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 12,
  },
  modalBtns: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
    gap: 12,
  },
  modalCancel: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  modalCancelText: {
    color: '#6b7280',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOk: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  modalOkDisabled: {
    backgroundColor: '#93c5fd',
  },
  modalOkText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
