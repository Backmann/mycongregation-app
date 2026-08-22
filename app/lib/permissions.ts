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
  /** Record meeting attendance (form S-3). */
  canRecordAttendance: boolean;
  canSubmitReportForOthers: boolean;
  /** S-21 record card — elders only (secretary is an elder too) + admin. */
  canGenerateS21: boolean;

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

  /** Absences — admin OR body coordinator / midweek overseer / secretary. */
  canManageAbsences: boolean;

  /** Local needs — visible to elders (read); managed by admin + L&M overseer. */
  canViewLocalNeeds: boolean;
  canViewPioneerSchool: boolean;
  canManagePioneerSchool: boolean;
  canManageLocalNeeds: boolean;

  /** Public talk coordinator — speaker exchange (incoming/outgoing) + directories. */
  canCoordinatePublicTalks: boolean;

  canViewServiceSummary: boolean;

  /** Circuit-overseer visit schedule (Служение). View: admin or elder; edit:
   *  admin, service overseer, or body coordinator. */
  canViewCoSchedule: boolean;
  canManageAuxiliaryPioneers: boolean;
  canEditCoSchedule: boolean;

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
      // Meeting attendance (form S-3): the secretary keeps it, and a brother
      // may be given the attendance responsibility to enter the figures.
      canRecordAttendance:
        isAdmin ||
        holds('secretary') ||
        holds('attendance_recorder') ||
        // The figure is entered while it is still in somebody's hand; one
        // brother away on a Thursday should not cost the week its record.
        holds('attendance_recorder_assistant'),
      canSubmitReportForOthers: isAdmin || isElder,
      canGenerateS21: isAdmin || isElder,

      // Responsibility-aware (Phase 2): admin OR specific responsibility.
      canEditMidweekSchedule: isAdmin || holds('life_ministry_overseer'),
      canEditWeekendSchedule: isAdmin || holds('body_coordinator'),
      canEditCleaning: isAdmin || holds('cleaning_coordinator'),
      canEditCartWitnessing: isAdmin || holds('public_witnessing'),
      canEditFieldServiceMeetings:
        isAdmin ||
        holds('service_overseer') ||
        holds('service_overseer_assistant'),
      canEditDuties:
        isAdmin || holds('duties_coordinator') || holds('body_coordinator'),

      // Auxiliary pioneers — admin, body coordinator, secretary, service overseer.
      canManageAuxiliaryPioneers:
        isAdmin ||
        holds('body_coordinator') ||
        holds('secretary') ||
        holds('service_overseer'),

      // Secretary + admin only.
      canManageEvents: isAdmin || holds('body_coordinator'),
      canManageAbsences:
        isAdmin ||
        holds('body_coordinator') ||
        holds('life_ministry_overseer') ||
        holds('secretary'),
      canViewLocalNeeds: isAdmin || isElder,
      canViewPioneerSchool: isAdmin || isElder,
      // Only an administrator keeps the schedule — Lionel's decision.
      canManagePioneerSchool: isAdmin,
      canManageLocalNeeds: isAdmin || holds('life_ministry_overseer'),
      canCoordinatePublicTalks: isAdmin || holds('public_talk_coordinator'),
      canViewServiceSummary: isAdmin || holds('secretary'),
      canViewCoSchedule: isAdmin || isElder,
      canEditCoSchedule:
        isAdmin ||
        holds('service_overseer') ||
        holds('service_overseer_assistant') ||
        holds('body_coordinator'),

      responsibilities: mine,
    };
  }, [role, mine]);
}
