import { useMemo } from 'react';
import { useAuth } from './auth';
import type { UserRole } from './api';

/**
 * UI-side permission flags derived from the current user's role.
 *
 * These mirror the server-side authorization rules in
 * `docs/architecture/roles-and-permissions.md` (Phase 1).
 *
 * The server remains authoritative — these booleans only drive UI
 * affordances (hide/show buttons, sections, screens). Every protected
 * action is enforced server-side by RolesGuard. Never assume the
 * absence of a UI button means the user cannot perform an action;
 * always send the request and let the server be the source of truth.
 */
export interface Permissions {
  /** Pure role checks */
  isAdmin: boolean;
  isElder: boolean;
  isMinisterialServant: boolean;
  isPublisher: boolean;

  /** Capability flags — what the UI should expose */
  canManageUsers: boolean;
  canManagePublicTalks: boolean;
  canImportMidweekSchedule: boolean;
  canImportWeekendSchedule: boolean;
  canEditPublishers: boolean;
  canSubmitReportForOthers: boolean;
}

export function usePermissions(): Permissions {
  const { user } = useAuth();
  const role: UserRole | null = user?.role ?? null;

  return useMemo<Permissions>(
    () => ({
      isAdmin: role === 'admin',
      isElder: role === 'elder',
      isMinisterialServant: role === 'ministerial_servant',
      isPublisher: role === 'publisher',

      // Admin-only (Phase 1 hardline)
      canManageUsers: role === 'admin',

      // Admin + Elder (current scope — pre Phase 2 responsibilities)
      canManagePublicTalks: role === 'admin' || role === 'elder',
      canImportMidweekSchedule: role === 'admin' || role === 'elder',
      canImportWeekendSchedule: role === 'admin' || role === 'elder',
      canEditPublishers: role === 'admin' || role === 'elder',

      // Admin + Elder (secretary scope) — will expand with Phase 2 responsibilities
      canSubmitReportForOthers: role === 'admin' || role === 'elder',
    }),
    [role],
  );
}
