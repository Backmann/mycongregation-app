#!/usr/bin/env node
/**
 * patch-form-autosave.cjs
 * "Instant inside, explicit outside" — editing an existing assignment:
 *  - picker choices (publisher / assistant / local speaker) save immediately
 *  - notes / title override / duration autosave with a 1.2 s debounce
 *  - status chips remain only in the creation flow; when editing, a single
 *    "Cancel part / Restore part" toggle replaces them
 *  - the Save button disappears in autosave mode
 *  - a tiny "Saving… / Saved" indicator lives in the context card
 * Wires [id].tsx to pass onInstantSave when the user can edit. Adds i18n keys.
 * Idempotent; LF/CRLF tolerant.
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
    console.log(`SKIP: ${file} already patched (${guard} present)`);
    return;
  }

  for (const [label, anchor, replacement] of edits) {
    const parts = txt.split(anchor);
    if (parts.length !== 2) {
      console.log(`FAIL: anchor for "${label}" found ${parts.length - 1} time(s), expected 1`);
      process.exit(1);
    }
    txt = parts[0] + replacement + parts[1];
    console.log(`OK: ${label}`);
  }

  fs.writeFileSync(file, txt.split('\n').join(eol));
  console.log(`OK: ${file} written`);
}

// ---------- components/AssignmentForm.tsx ----------
patchFile('components/AssignmentForm.tsx', 'onInstantSave', [
  [
    'form: prop type',
    '  onSubmit: (data: CreateAssignmentInput) => Promise<unknown>;',
    nl([
      '  onSubmit: (data: CreateAssignmentInput) => Promise<unknown>;',
      '  /** When set, edits save instantly (pickers) or debounced (text). */',
      '  onInstantSave?: (patch: Partial<CreateAssignmentInput>) => Promise<unknown>;',
    ]),
  ],
  [
    'form: destructure',
    '  onSubmit,',
    nl(['  onSubmit,', '  onInstantSave,']),
  ],
  [
    'form: autosave state + helpers',
    "  const { t } = useTranslation();",
    nl([
      "  const { t } = useTranslation();",
      '  const autosave = !!onInstantSave;',
      '  const [instantSaving, setInstantSaving] = useState(false);',
      '  const [instantSavedAt, setInstantSavedAt] = useState<number | null>(null);',
      '  const [instantError, setInstantError] = useState<string | null>(null);',
      '  // useState initializer: a stable box that survives re-renders (no useRef',
      '  // needed, keeps the import surface untouched).',
      '  const debounceBox = useState(() => ({',
      '    timer: null as ReturnType<typeof setTimeout> | null,',
      '  }))[0];',
      '  const instant = async (patch: Partial<CreateAssignmentInput>) => {',
      '    if (!onInstantSave) return;',
      '    setInstantSaving(true);',
      '    setInstantError(null);',
      '    try {',
      '      await onInstantSave(patch);',
      '      setInstantSavedAt(Date.now());',
      '    } catch (e) {',
      '      setInstantError(e instanceof Error ? e.message : String(e));',
      '    } finally {',
      '      setInstantSaving(false);',
      '    }',
      '  };',
      '  const queueInstant = (patch: Partial<CreateAssignmentInput>) => {',
      '    if (!onInstantSave) return;',
      '    if (debounceBox.timer) clearTimeout(debounceBox.timer);',
      '    debounceBox.timer = setTimeout(() => void instant(patch), 1200);',
      '  };',
    ]),
  ],
  [
    'form: saved indicator in context card',
    '          <Text style={styles.contextPart}>{getPartLabel(form.partKey)}</Text>',
    nl([
      '          <Text style={styles.contextPart}>{getPartLabel(form.partKey)}</Text>',
      '          {autosave && (instantSaving || instantSavedAt || instantError) ? (',
      '            <Text',
      '              style={[',
      '                styles.instantStatus,',
      '                instantError ? styles.instantStatusError : null,',
      '              ]}',
      '              numberOfLines={2}',
      '            >',
      '              {instantError',
      '                ? instantError',
      '                : instantSaving',
      "                  ? t('assignments.form.saving')",
      "                  : t('assignments.form.saved')}",
      '            </Text>',
      '          ) : null}',
    ]),
  ],
  [
    'form: instant save — local speaker picker',
    nl([
      '              <PublisherSelector',
      "                label={t('assignments.form.field.publisher')}",
      '                value={form.publisherId}',
      "                onChange={(id) => update('publisherId', id)}",
      '                requiredCapability={requiredCap}',
    ]),
    nl([
      '              <PublisherSelector',
      "                label={t('assignments.form.field.publisher')}",
      '                value={form.publisherId}',
      '                onChange={(id) => {',
      "                  update('publisherId', id);",
      '                  void instant({ publisherId: id });',
      '                }}',
      '                requiredCapability={requiredCap}',
    ]),
  ],
  [
    'form: instant save — primary picker',
    nl([
      '            <PublisherSelector',
      "              label={t('assignments.form.field.publisher')}",
      '              value={form.publisherId}',
      "              onChange={(id) => update('publisherId', id)}",
      '              excludeIds={',
    ]),
    nl([
      '            <PublisherSelector',
      "              label={t('assignments.form.field.publisher')}",
      '              value={form.publisherId}',
      '              onChange={(id) => {',
      "                update('publisherId', id);",
      '                void instant({ publisherId: id });',
      '              }}',
      '              excludeIds={',
    ]),
  ],
  [
    'form: instant save — assistant picker',
    nl([
      '              <PublisherSelector',
      "                label={t('assignments.form.field.assistant')}",
      '                value={form.assistantPublisherId}',
      "                onChange={(id) => update('assistantPublisherId', id)}",
    ]),
    nl([
      '              <PublisherSelector',
      "                label={t('assignments.form.field.assistant')}",
      '                value={form.assistantPublisherId}',
      '                onChange={(id) => {',
      "                  update('assistantPublisherId', id);",
      '                  void instant({ assistantPublisherId: id });',
      '                }}',
    ]),
  ],
  [
    'form: debounced title override',
    nl([
      "          label={t('assignments.form.field.partTitleOverride')}",
      "          value={form.partTitle ?? ''}",
      "          onChangeText={(v) => update('partTitle', v)}",
    ]),
    nl([
      "          label={t('assignments.form.field.partTitleOverride')}",
      "          value={form.partTitle ?? ''}",
      '          onChangeText={(v) => {',
      "            update('partTitle', v);",
      '            queueInstant({ partTitle: v });',
      '          }}',
    ]),
  ],
  [
    'form: debounced duration',
    nl([
      '          onChangeText={(v) =>',
      "            update('partDurationMin', v ? parseInt(v, 10) : undefined)",
      '          }',
    ]),
    nl([
      '          onChangeText={(v) => {',
      "            update('partDurationMin', v ? parseInt(v, 10) : undefined);",
      '            queueInstant({ partDurationMin: v ? parseInt(v, 10) : null });',
      '          }}',
    ]),
  ],
  [
    'form: status section — chips only on create, cancel toggle + notes autosave',
    nl([
      "      <FormSection title={t('assignments.form.section.status')}>",
      '        <FormChips',
      "          label={t('assignments.form.field.statusLabel')}",
      "          value={form.status ?? 'draft'}",
      '          options={STATUS_OPTIONS}',
      "          onChange={(v) => update('status', v)}",
      '        />',
      '        <FormField',
      "          label={t('common.notes')}",
      "          value={form.notes ?? ''}",
      "          onChangeText={(v) => update('notes', v)}",
      '          multiline',
      '        />',
      '      </FormSection>',
    ]),
    nl([
      "      <FormSection title={t('assignments.form.section.status')}>",
      '        {!autosave && (',
      '          <FormChips',
      "            label={t('assignments.form.field.statusLabel')}",
      "            value={form.status ?? 'draft'}",
      '            options={STATUS_OPTIONS}',
      "            onChange={(v) => update('status', v)}",
      '          />',
      '        )}',
      '        <FormField',
      "          label={t('common.notes')}",
      "          value={form.notes ?? ''}",
      '          onChangeText={(v) => {',
      "            update('notes', v);",
      '            queueInstant({ notes: v || null });',
      '          }}',
      '          multiline',
      '        />',
      '        {autosave ? (',
      '          <Pressable',
      '            style={({ pressed }) => [',
      '              styles.cancelPartLink,',
      '              pressed && styles.cancelPartLinkPressed,',
      '            ]}',
      '            onPress={() => {',
      '              const next =',
      "                form.status === 'cancelled' ? 'draft' : 'cancelled';",
      "              update('status', next);",
      '              void instant({ status: next });',
      '            }}',
      '          >',
      '            <Text',
      '              style={[',
      '                styles.cancelPartText,',
      "                form.status === 'cancelled' && styles.restorePartText,",
      '              ]}',
      '            >',
      "              {form.status === 'cancelled'",
      "                ? t('assignments.form.restorePart')",
      "                : t('assignments.form.cancelPart')}",
      '            </Text>',
      '          </Pressable>',
      '        ) : null}',
      '      </FormSection>',
    ]),
  ],
  [
    'form: hide Save in autosave mode',
    nl(['      {!readOnly && (', '      <View style={styles.actions}>']),
    nl(['      {!readOnly && !autosave && (', '      <View style={styles.actions}>']),
  ],
  [
    'form: styles',
    'const styles = StyleSheet.create({',
    nl([
      'const styles = StyleSheet.create({',
      '  instantStatus: {',
      '    fontSize: 12,',
      "    color: '#16a34a',",
      '    marginTop: 2,',
      '  },',
      "  instantStatusError: { color: '#dc2626' },",
      '  cancelPartLink: {',
      "    alignSelf: 'center',",
      '    paddingVertical: 12,',
      '    paddingHorizontal: 16,',
      '  },',
      '  cancelPartLinkPressed: { opacity: 0.6 },',
      '  cancelPartText: {',
      "    color: '#dc2626',",
      '    fontSize: 14,',
      "    fontWeight: '600',",
      '  },',
      "  restorePartText: { color: '#0369a1' },",
    ]),
  ],
]);

// ---------- app/(app)/schedule/[id].tsx ----------
patchFile('app/(app)/schedule/[id].tsx', 'onInstantSave', [
  [
    'detail: pass onInstantSave',
    nl([
      '          onSubmit={updateMutation.mutateAsync}',
      '          isSubmitting={updateMutation.isPending}',
      '          lockIdentity',
    ]),
    nl([
      '          onSubmit={updateMutation.mutateAsync}',
      '          onInstantSave={canEdit ? updateMutation.mutateAsync : undefined}',
      '          isSubmitting={updateMutation.isPending}',
      '          lockIdentity',
    ]),
  ],
]);

// ---------- locales ----------
const ADDITIONS = {
  ru: {
    assignments: {
      form: {
        saving: 'Сохранение…',
        saved: 'Сохранено',
        cancelPart: 'Отменить часть',
        restorePart: 'Вернуть часть',
      },
    },
  },
  en: {
    assignments: {
      form: {
        saving: 'Saving…',
        saved: 'Saved',
        cancelPart: 'Cancel part',
        restorePart: 'Restore part',
      },
    },
  },
  de: {
    assignments: {
      form: {
        saving: 'Wird gespeichert…',
        saved: 'Gespeichert',
        cancelPart: 'Programmpunkt absagen',
        restorePart: 'Programmpunkt wiederherstellen',
      },
    },
  },
};

function deepMerge(target, source, pathPrefix, report) {
  for (const key of Object.keys(source)) {
    const p = pathPrefix ? `${pathPrefix}.${key}` : key;
    const sv = source[key];
    if (sv && typeof sv === 'object' && !Array.isArray(sv)) {
      if (!(key in target) || typeof target[key] !== 'object' || target[key] === null) {
        target[key] = {};
      }
      deepMerge(target[key], sv, p, report);
    } else if (key in target) {
      report.skipped.push(p);
    } else {
      target[key] = sv;
      report.added.push(p);
    }
  }
}

for (const locale of Object.keys(ADDITIONS)) {
  const file = `locales/${locale}.json`;
  let obj;
  try {
    obj = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.log(`FAIL: cannot read/parse ${file}: ${e.message}`);
    process.exit(1);
  }
  const report = { added: [], skipped: [] };
  deepMerge(obj, ADDITIONS[locale], '', report);
  if (report.added.length === 0) {
    console.log(`SKIP: ${file} — all keys already present`);
    continue;
  }
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n');
  console.log(`OK: ${file} — added ${report.added.join(', ')}`);
}
