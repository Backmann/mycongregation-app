#!/usr/bin/env node
/**
 * patch-invite-client.cjs — галочка «Отправить приглашение по email» в
 * модалке выдачи доступа. При включении поле пароля скрывается (человек
 * задаст пароль сам по ссылке из письма), валидируется email вместо
 * пароля, на сервер уходит sendInvite:true без пароля.
 *  - GrantAccessInput: password опциональный + sendInvite
 *  - грант-форма: state sendInvite, Switch, условное поле пароля, canSubmit
 *  - onSubmit 4-арг → grantMutation → grantAccess
 * Применять ПОВЕРХ 94eeb7d (app) + серверного invite (33ae2dd).
 * Idempotent; LF/CRLF tolerant. Запускать из ~/congmap/app.
 */
const fs = require('fs');

function nl(lines) {
  return lines.join('\n');
}

function patchFile(file, guard, edits) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    console.log(`FAIL: cannot read ${file}: ${e.message}`);
    process.exit(1);
  }
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  let txt = raw.split('\r\n').join('\n');
  if (txt.includes(guard)) {
    console.log(`SKIP: ${file} already patched (${guard})`);
    return;
  }
  for (const [label, anchor, replacement] of edits) {
    const parts = txt.split(anchor);
    if (parts.length !== 2) {
      console.log(`FAIL: anchor for "${label}" in ${file} found ${parts.length - 1} time(s), expected 1`);
      process.exit(1);
    }
    txt = parts[0] + replacement + parts[1];
    console.log(`OK: ${label}`);
  }
  fs.writeFileSync(file, txt.split('\n').join(eol));
  console.log(`OK: ${file} written`);
}

// ===== 1) api.ts: GrantAccessInput — password optional + sendInvite =====
patchFile('lib/api.ts', 'sendInvite?: boolean;\n}', [
  [
    'api: GrantAccessInput sendInvite',
    nl([
      'export interface GrantAccessInput {',
      '  email?: string;',
      '  password: string;',
      '  isAdmin?: boolean;',
      '}',
    ]),
    nl([
      'export interface GrantAccessInput {',
      '  email?: string;',
      '  password?: string;',
      '  isAdmin?: boolean;',
      '  /** When true, create the account without a password and email an',
      '   * invitation link so the person sets their own password. */',
      '  sendInvite?: boolean;',
      '}',
    ]),
  ],
]);

// ===== 2) PublisherAccessContent.tsx =====
patchFile('components/PublisherAccessContent.tsx', 'sendInvite', [
  // 2a) onSubmit signature (4-arg)
  [
    'grant: onSubmit type',
    '  onSubmit: (email: string, password: string, isAdmin: boolean) => void;',
    '  onSubmit: (\n    email: string,\n    password: string,\n    isAdmin: boolean,\n    sendInvite: boolean,\n  ) => void;',
  ],
  // 2b) state sendInvite
  [
    'grant: sendInvite state',
    "  const [isAdmin, setIsAdmin] = useState(false);",
    "  const [isAdmin, setIsAdmin] = useState(false);\n  const [sendInvite, setSendInvite] = useState(false);",
  ],
  // 2c) reset on open
  [
    'grant: reset sendInvite',
    nl([
      '      setPassword(\'\');',
      '      setIsAdmin(false);',
    ]),
    nl([
      '      setPassword(\'\');',
      '      setIsAdmin(false);',
      '      setSendInvite(false);',
    ]),
  ],
  // 2d) canSubmit: invite → validate email; otherwise password
  [
    'grant: canSubmit',
    '  }, [visible, defaultEmail]);\n\n  const canSubmit = password.length >= 8 && !pending;',
    '  }, [visible, defaultEmail]);\n\n  const canSubmit =\n    !pending &&\n    (sendInvite ? email.trim().includes(\'@\') : password.length >= 8);',
  ],
  // 2e) invite switch + conditional password field
  [
    'grant: invite switch & hide password',
    nl([
      '          <Text style={styles.modalLabel}>Пароль</Text>',
      '          <TextInput',
      '            style={styles.input}',
      '            value={password}',
      '            onChangeText={setPassword}',
      '            secureTextEntry',
      '            placeholder="Минимум 8 символов"',
      '          />',
    ]),
    nl([
      '          <View style={styles.switchRow}>',
      '            <Text style={styles.rowLabel}>Отправить приглашение по email</Text>',
      '            <Switch value={sendInvite} onValueChange={setSendInvite} />',
      '          </View>',
      '          {sendInvite ? null : (',
      '            <>',
      '              <Text style={styles.modalLabel}>Пароль</Text>',
      '              <TextInput',
      '                style={styles.input}',
      '                value={password}',
      '                onChangeText={setPassword}',
      '                secureTextEntry',
      '                placeholder="Минимум 8 символов"',
      '              />',
      '            </>',
      '          )}',
    ]),
  ],
  // 2f) hint reflects invite mode
  [
    'grant: hint invite',
    nl([
      '          <Text style={styles.hint}>',
      '            Роль присвоится автоматически по назначению человека. Пароль сообщите',
      '            ему отдельно — здесь он больше не показывается.',
      '          </Text>',
    ]),
    nl([
      '          <Text style={styles.hint}>',
      '            {sendInvite',
      "              ? 'Человек получит письмо со ссылкой и сам задаст пароль (ссылка действует 72 часа).'",
      "              : 'Роль присвоится автоматически по назначению человека. Пароль сообщите ему отдельно — здесь он больше не показывается.'}",
      '          </Text>',
    ]),
  ],
  // 2g) onSubmit call passes sendInvite
  [
    'grant: onSubmit call',
    '          onPress={() => onSubmit(email.trim(), password, isAdmin)}',
    '          onPress={() => onSubmit(email.trim(), password, isAdmin, sendInvite)}',
  ],
  // 2h) submit button label
  [
    'grant: button label',
    "                {pending ? '…' : 'Создать'}",
    "                {pending ? '…' : sendInvite ? 'Пригласить' : 'Создать'}",
  ],
  // 2i) parent onSubmit handler → mutate with sendInvite
  [
    'grant: parent handler',
    nl([
      '          onSubmit={(email, password, isAdmin) =>',
      '            grantMutation.mutate({',
    ]),
    nl([
      '          onSubmit={(email, password, isAdmin, sendInvite) =>',
      '            grantMutation.mutate({',
    ]),
  ],
  // 2j) mutate input type + pass sendInvite
  [
    'grant: mutate input type',
    nl([
      '      password?: string;',
      '      isAdmin?: boolean;',
    ]),
    nl([
      '      password?: string;',
      '      isAdmin?: boolean;',
      '      sendInvite?: boolean;',
    ]),
  ],
  [
    'grant: mutate pass sendInvite',
    nl([
      '              password,',
      '              isAdmin,',
    ]),
    nl([
      '              password,',
      '              isAdmin,',
      '              sendInvite,',
    ]),
  ],
]);

console.log('DONE: invite client (checkbox in grant modal)');
