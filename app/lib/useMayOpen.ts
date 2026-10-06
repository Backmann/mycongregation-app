import { useCallback } from 'react';
import { useAuth } from './auth';
import { usePermissions } from './permissions';
import { screenAllowed } from './screen-access';

/**
 * «May this person open that screen?» — for a door.
 *
 *   const mayOpen = useMayOpen();
 *   {mayOpen('/tasks') ? <Row … /> : null}
 *
 * The answer is the screen's own (lib/screen-access), so a door cannot be
 * offered to somebody the screen will turn away, and cannot be kept from
 * somebody it would let in — which is what happened while each door carried
 * a condition of its own, written to match the screen's and free to drift:
 * every elder was offered «Снять речи», a screen for the talk coordinator.
 *
 * The address is the screen's key in the table, without what follows «?».
 * scripts/check-doors.mjs holds every door to a restricted screen to this.
 */
export function useMayOpen(): (route: string) => boolean {
  const perms = usePermissions();
  const { user } = useAuth();
  return useCallback(
    (route: string) => screenAllowed(route.split('?')[0], perms, user),
    [perms, user],
  );
}
