import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from './auth';
import { responsibilitiesApi } from './api';
import type { ResponsibilityType, UserRole } from './api';

/**
 * UI-side permission flags derived from the current user's role and their
 * Layer 2 responsibilities.
 *
 * These mirror the server-side authorization rules in
 * `docs/architecture/roles-and-permissions.md` (Phases 1-2).
 *
 * The server remains authoritative — these booleans only drive UI
 * affordances (hide/show buttons, sections, screens). Every protected
 * action is enforced server-side by RolesGuard / ResponsibilityGuard.
 * Never assume the absence of a UI button means the user cannot perform an
 * action; always send the request and let the server be the source of truth.
 */
export interface Permissions {
  /** Pure role checks */
  isAdmin: boolean;
  isElder: boolean;
  isMinisterialServant: boolean;
  isPublisher: boolean;

  /** Capability flags — what the UI should expose */
  canManageUsers: boolean;
  canManageResponsibilities: boolean;
  canManagePublicTalks: boolean;
  canImportMidweekSchedule: boolean;
  canImportWeekendSchedule: boolean;
  canEditPublishers: boolean;
  canSubmitReportForOthers: boolean;

  /**
   * Responsibility-aware flags (Phase 2). Each is "admin OR holds the
   * specific responsibility", matching the authoritative permission matrix.
   * These gate the upcoming Schedule sections (duties, cleaning, cart
   * witnessing, field-service meetings, midweek/weekend program editing).
   */
  canEditMidweekSchedule: boolean;
  canEditWeekendSchedule: boolean;
  canEditCleaning: boolean;
  canEditCartWitnessing: boolean;
  canEditFieldServiceMeetings: boolean;
  canEditDuties: boolean;

  /**
   * Monthly service summary (secretary's tool). Admin OR the holder of the
   * SECRETARY responsibility — elders are view-only on reports and are NOT
   * summary recipients, mirroring the server-side getSummary gate.
   */
  /** Special events — admin OR body coordinator (совет старейшин). */
  canManageEvents: boolean;

  canViewServiceSummary: boolean;

  /** The set of responsibility types held by the current user. */
  responsibilities: ReadonlySet<ResponsibilityType>;
}

export function usePermissions(): Permissions {
  const { user } = useAuth();
  const role: UserRole | null = user?.role ?? null;

  // All responsibilities in the congregation, fetched once and shared across
  // every usePermissions() consumer via react-query's cache.
  const { data: allResponsibilities } = useQuery({
    queryKey: ['responsibilities'],
    queryFn: () => responsibilitiesApi.list(),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const mine = useMemo<ReadonlySet<ResponsibilityType>>(() => {
    const set = new Set<ResponsibilityType>();
    if (user?.id) {
      for (const r of allResponsibilities ?? []) {
        if (r.userId === user.id) {
          set.add(r.type);
        }
      }
    }
    return set;
  }, [allResponsibilities, user?.id]);

  return useMemo<Permissions>(() => {
    const isAdmin = role === 'admin';
    const isElder = role === 'elder';
    const holds = (t: ResponsibilityType) => mine.has(t);

    return {
      isAdmin,
      isElder,
      isMinisterialServant: role === 'ministerial_servant',
      isPublisher: role === 'publisher',

      // Admin-only
      canManageUsers: isAdmin,
      canManageResponsibilities: isAdmin,

      // Admin + Elder (current broad scope, pre responsibility refinement)
      canManagePublicTalks: isAdmin || isElder,
      canImportMidweekSchedule: isAdmin || isElder,
      canImportWeekendSchedule: isAdmin || isElder,
      canEditPublishers: isAdmin || holds('secretary'),
      canSubmitReportForOthers: isAdmin || isElder,

      // Responsibility-aware (Phase 2): admin OR specific responsibility.
      canEditMidweekSchedule: isAdmin || holds('life_ministry_overseer'),
      canEditWeekendSchedule: isAdmin || holds('body_coordinator'),
      canEditCleaning: isAdmin || holds('cleaning_coordinator'),
      canEditCartWitnessing: isAdmin || holds('public_witnessing'),
      canEditFieldServiceMeetings: isAdmin || holds('service_overseer'),
      canEditDuties:
        isAdmin || holds('duties_coordinator') || holds('body_coordinator'),

      // Secretary + admin only.
      canManageEvents: isAdmin || holds('body_coordinator'),
      canViewServiceSummary: isAdmin || holds('secretary'),

      responsibilities: mine,
    };
  }, [role, mine]);
}
