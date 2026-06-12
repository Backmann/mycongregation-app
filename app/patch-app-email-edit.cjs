#!/usr/bin/env node
/**
 * patch-app-email-edit.cjs
 * Publisher access panel: the Email row becomes editable (pencil -> modal),
 * wired into the existing updateAccess mutation ({ email }).
 *  - lib/api.ts: UpdateAccessInput gains email?: string
 *  - PublisherAccessContent: emailOpen state, tappable Email row,
 *    EmailModal (self-contained styles), mutation input type + onSuccess
 * Idempotent; LF/CRLF tolerant. RU strings match the file's existing style.
 */
const fs = require('fs');
const nl = (l) => l.join('\n');

let failed = false;
function patchFile(file, guard, edits) {
  const raw = fs.readFileSync(file, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  let txt = raw.split('\r\n').join('\n');
  if (txt.includes(guard)) {
    console.log(`SKIP: ${file} already patched`);
    return;
  }
  for (const [label, anchor, replacement] of edits) {
    const parts = txt.split(anchor);
    if (parts.length !== 2) {
      console.log(`FAIL: anchor for "${label}" found ${parts.length - 1} time(s), expected 1`);
      failed = true;
      return;
    }
    txt = parts[0] + replacement + parts[1];
    console.log(`OK: ${label}`);
  }
  fs.writeFileSync(file, txt.split('\n').join(eol));
  console.log(`OK: ${file} written`);
}

// ---------- lib/api.ts ----------
patchFile('lib/api.ts', 'New login email', [
  [
    'api: UpdateAccessInput.email',
    nl(['export interface UpdateAccessInput {', '  password?: string;']),
    nl([
      'export interface UpdateAccessInput {',
      '  /** New login email — e.g. to fix a typo. Must be unique. */',
      '  email?: string;',
      '  password?: string;',
    ]),
  ],
]);

// ---------- components/PublisherAccessContent.tsx ----------
patchFile('components/PublisherAccessContent.tsx', 'EmailModal', [
  [
    'panel: emailOpen state',
    "  const [resetOpen, setResetOpen] = useState(false);",
    nl([
      "  const [resetOpen, setResetOpen] = useState(false);",
      '  const [emailOpen, setEmailOpen] = useState(false);',
    ]),
  ],
  [
    'panel: mutation input type',
    nl(['    mutationFn: (input: {', '      password?: string;']),
    nl([
      '    mutationFn: (input: {',
      '      email?: string;',
      '      password?: string;',
    ]),
  ],
  [
    'panel: onSuccess closes email modal',
    nl([
      '    }) => publishersApi.updateAccess(publisher.id, input),',
      '    onSuccess: () => {',
      '      setResetOpen(false);',
    ]),
    nl([
      '    }) => publishersApi.updateAccess(publisher.id, input),',
      '    onSuccess: () => {',
      '      setResetOpen(false);',
      '      setEmailOpen(false);',
    ]),
  ],
  [
    'panel: editable email row',
    nl([
      '      <View style={styles.row}>',
      '        <Text style={styles.rowLabel}>Email</Text>',
      '        <Text style={styles.rowValue}>{access.email}</Text>',
      '      </View>',
    ]),
    nl([
      '      <View style={styles.row}>',
      '        <Text style={styles.rowLabel}>Email</Text>',
      '        <Pressable',
      '          style={emailStyles.rowBtn}',
      '          onPress={() => setEmailOpen(true)}',
      '          hitSlop={6}',
      '        >',
      '          <Text style={styles.rowValue}>{access.email}</Text>',
      '          <Text style={emailStyles.pencil}>✎</Text>',
      '        </Pressable>',
      '      </View>',
    ]),
  ],
  [
    'panel: render EmailModal',
    nl(['      <ResetModal', '        visible={resetOpen}']),
    nl([
      '      <EmailModal',
      '        visible={emailOpen}',
      '        current={access.email}',
      '        pending={updateMutation.isPending}',
      '        error={',
      '          updateMutation.isError',
      '            ? extractErrorMessage(updateMutation.error)',
      '            : null',
      '        }',
      '        onCancel={() => {',
      '          updateMutation.reset();',
      '          setEmailOpen(false);',
      '        }}',
      '        onSubmit={(email) => updateMutation.mutate({ email })}',
      '      />',
      '      <ResetModal',
      '        visible={resetOpen}',
    ]),
  ],
  [
    'panel: EmailModal component',
    'function GrantModal({',
    nl([
      'function EmailModal({',
      '  visible,',
      '  current,',
      '  pending,',
      '  error,',
      '  onCancel,',
      '  onSubmit,',
      '}: {',
      '  visible: boolean;',
      '  current: string;',
      '  pending: boolean;',
      '  error: string | null;',
      '  onCancel: () => void;',
      '  onSubmit: (email: string) => void;',
      '}) {',
      '  const [email, setEmail] = useState(current);',
      '',
      '  useEffect(() => {',
      '    if (visible) setEmail(current);',
      '  }, [visible, current]);',
      '',
      '  const trimmed = email.trim();',
      '  const canSave =',
      '    /.+@.+\\..+/.test(trimmed) &&',
      '    trimmed.toLowerCase() !== current.toLowerCase();',
      '',
      '  return (',
      '    <Modal',
      '      visible={visible}',
      '      transparent',
      '      animationType="fade"',
      '      onRequestClose={onCancel}',
      '    >',
      '      <View style={emailStyles.overlay}>',
      '        <View style={emailStyles.card}>',
      '          <Text style={emailStyles.title}>Изменить почту</Text>',
      '          <Text style={emailStyles.hint}>',
      '            Человек будет входить с новой почтой. Пароль не меняется.',
      '          </Text>',
      '          <TextInput',
      '            style={emailStyles.input}',
      '            value={email}',
      '            onChangeText={setEmail}',
      '            autoCapitalize="none"',
      '            autoCorrect={false}',
      '            keyboardType="email-address"',
      '            placeholder="email@example.com"',
      '            placeholderTextColor="#94a3b8"',
      '          />',
      '          {error && <Text style={emailStyles.error}>{error}</Text>}',
      '          <View style={emailStyles.actions}>',
      '            <Pressable',
      '              style={emailStyles.cancel}',
      '              onPress={onCancel}',
      '              disabled={pending}',
      '            >',
      '              <Text style={emailStyles.cancelText}>Отмена</Text>',
      '            </Pressable>',
      '            <Pressable',
      '              style={[',
      '                emailStyles.confirm,',
      '                (!canSave || pending) && emailStyles.disabled,',
      '              ]}',
      '              onPress={() => onSubmit(trimmed)}',
      '              disabled={!canSave || pending}',
      '            >',
      '              <Text style={emailStyles.confirmText}>Сохранить</Text>',
      '            </Pressable>',
      '          </View>',
      '        </View>',
      '      </View>',
      '    </Modal>',
      '  );',
      '}',
      '',
      'const emailStyles = StyleSheet.create({',
      "  rowBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },",
      "  pencil: { fontSize: 14, color: '#0369a1' },",
      '  overlay: {',
      '    flex: 1,',
      "    backgroundColor: 'rgba(15,23,42,0.45)',",
      "    justifyContent: 'center',",
      '    paddingHorizontal: 24,',
      '  },',
      '  card: {',
      "    backgroundColor: '#fff',",
      '    borderRadius: 14,',
      '    padding: 18,',
      '    gap: 10,',
      '  },',
      "  title: { fontSize: 16, fontWeight: '700', color: '#0f172a' },",
      "  hint: { fontSize: 13, color: '#64748b', lineHeight: 18 },",
      '  input: {',
      '    borderWidth: 1,',
      "    borderColor: '#cbd5e1',",
      '    borderRadius: 8,',
      '    paddingHorizontal: 12,',
      '    paddingVertical: 10,',
      '    fontSize: 15,',
      "    color: '#0f172a',",
      '  },',
      "  error: { fontSize: 13, color: '#dc2626' },",
      '  actions: {',
      "    flexDirection: 'row',",
      "    justifyContent: 'flex-end',",
      '    gap: 10,',
      '    marginTop: 4,',
      '  },',
      '  cancel: { paddingVertical: 10, paddingHorizontal: 14 },',
      "  cancelText: { fontSize: 15, color: '#64748b', fontWeight: '600' },",
      '  confirm: {',
      '    paddingVertical: 10,',
      '    paddingHorizontal: 18,',
      '    borderRadius: 10,',
      "    backgroundColor: '#0ea5e9',",
      '  },',
      "  confirmText: { fontSize: 15, color: '#fff', fontWeight: '600' },",
      '  disabled: { opacity: 0.5 },',
      '});',
      '',
      'function GrantModal({',
    ]),
  ],
]);

if (failed) {
  console.log('FAIL: patch aborted');
  process.exit(1);
}
