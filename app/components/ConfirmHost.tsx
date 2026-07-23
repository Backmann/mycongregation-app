import { useEffect, useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Dialog } from './Dialog';

/**
 * One confirmation dialog for the whole app, called imperatively.
 *
 * Every delete in the app used to branch by hand: window.confirm on the web,
 * Alert.alert on the phone. Alert renders the app's own styling; window.confirm
 * renders the browser's grey box, so the web quietly wore a different, blunter
 * dialog than the one the screens were designed around. This replaces both with
 * the app's Dialog on either platform, reached through a promise so a caller
 * stays a single line:
 *
 *     if (await confirm({ title, body, confirmLabel, danger: true })) doIt();
 *
 * The host lives once at the root. A module-level setter lets confirm() outside
 * React hand it the request; the returned promise resolves true on confirm and
 * false on cancel or dismissal.
 */

export interface ConfirmRequest {
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
}

type Pending = ConfirmRequest & { resolve: (ok: boolean) => void };

let handProvider: ((req: Pending) => void) | null = null;

export function confirm(req: ConfirmRequest): Promise<boolean> {
  return new Promise((resolve) => {
    if (!handProvider) {
      // No host mounted — fail closed rather than silently proceed. A missing
      // host must never read as "yes" to a delete.
      resolve(false);
      return;
    }
    handProvider({ ...req, resolve });
  });
}

export function ConfirmHost() {
  const { t } = useTranslation();
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    handProvider = (req) => setPending(req);
    return () => {
      handProvider = null;
    };
  }, []);

  const close = (ok: boolean) => {
    if (pending) pending.resolve(ok);
    setPending(null);
  };

  // Mounted ONLY while a question is pending, and that is load-bearing on the
  // web: react-native-web's Modal appends its own container to the end of the
  // document when the COMPONENT mounts, not when it becomes visible, and those
  // containers are position:fixed with no z-index — so whichever mounted last
  // paints on top. A host mounted at app start therefore sat UNDER every sheet
  // opened afterwards, and a delete confirmed from inside an editor opened
  // behind it, invisible: the button appeared to do nothing. Mounting on demand
  // puts the question last in the document, and so above whatever asked it.
  if (!pending) return null;

  return (
    <Dialog
      visible
      title={pending.title}
      icon={pending.danger ? 'warning' : 'help-circle'}
      iconTint={pending.danger ? '#dc2626' : '#0ea5e9'}
      iconBg={pending.danger ? '#fee2e2' : '#e0f2fe'}
      confirmLabel={pending.confirmLabel}
      confirmDanger={pending.danger}
      onConfirm={() => close(true)}
      cancelLabel={pending.cancelLabel ?? t('common.cancel')}
      onCancel={() => close(false)}
    >
      {pending.body ? <Text style={styles.body}>{pending.body}</Text> : null}
    </Dialog>
  );
}

const styles = StyleSheet.create({
  body: { fontSize: 14.5, color: '#334155', lineHeight: 21 },
});
