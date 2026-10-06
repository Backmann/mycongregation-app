import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./auth";
import { responsibilitiesApi } from "./api";
import type { ResponsibilityType, UserRole } from "./api";

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
  /**
   * «Составление программы» (/schedule/edit) is for whoever edits or imports
   * the programme — and for nobody else. ONE rule, asked by every door to that
   * screen and by the screen itself.
   *
   * It used to be asked by the doors only: a publisher had no way in, but the
   * address opened the screen for her all the same (found on a copy of the
   * live data, 6 October). Nothing leaked — the server gives her no drafts and
   * refuses every change — but a screen titled «Составление программы» is not
   * hers to stand on. scripts/check-programme-editor-door.mjs holds the doors
   * and the screen to this one rule.
   */
  canOpenProgrammeEditor: boolean;
  /**
   * False until the list of responsibilities has arrived (or failed to).
   * Before that a flag that depends on a responsibility reads «no» for
   * everybody, so a screen that turns people away must wait for this.
   */
  loaded: boolean;
  canEditPublishers: boolean;
  /** Record meeting attendance (form S-3). */
  canRecordAttendance: boolean;
  /**
   * Read the attendance sheet (form S-3): the elders, and whoever may record
   * it. A publisher has no task that needs the figures. Mirrors the server's
   * AttendanceReadGuard.
   */
  canViewAttendance: boolean;
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

  /**
   * READ the month's service summary — every elder (Lionel, 30 September
   * 2026: «неактивные должны быть видны всем старейшинам»).
   */
  canViewServiceSummary: boolean;
  /**
   * COMPILE it — close the month, print the S-1, follow the collection: the
   * secretary's work, and an administrator's. The two used to be one flag,
   * so opening the figures to the elders would have handed them the
   * secretary's buttons and his card on Home as well.
   */
  canManageServiceSummary: boolean;

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
  const { data: allResponsibilities, isFetched } = useQuery({
    queryKey: ["responsibilities"],
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
    const isAdmin = role === "admin";
    const isElder = role === "elder";
    const holds = (t: ResponsibilityType) => mine.has(t);

    // The programme: who edits each meeting, who may import. Named here so
    // that «who may open the editor» is made of the very same answers and
    // cannot drift from them.
    const editsMidweek = isAdmin || holds("life_ministry_overseer");
    const editsWeekend = isAdmin || holds("body_coordinator");
    const importsProgramme = isAdmin || isElder;

    return {
      isAdmin,
      isElder,
      isMinisterialServant: role === "ministerial_servant",
      isPublisher: role === "publisher",

      // Admin-only
      canManageUsers: isAdmin,
      canManageResponsibilities: isAdmin,

      // Admin + Elder (current broad scope, pre responsibility refinement)
      canManagePublicTalks: isAdmin || isElder,
      canImportMidweekSchedule: importsProgramme,
      canImportWeekendSchedule: importsProgramme,
      canOpenProgrammeEditor: editsMidweek || editsWeekend || importsProgramme,
      loaded: isFetched,
      canEditPublishers: isAdmin || holds("secretary"),
      // Meeting attendance (form S-3): the secretary keeps it, and a brother
      // may be given the attendance responsibility to enter the figures.
      canRecordAttendance:
        isAdmin ||
        holds("secretary") ||
        holds("attendance_recorder") ||
        // The figure is entered while it is still in somebody's hand; one
        // brother away on a Thursday should not cost the week its record.
        holds("attendance_recorder_assistant"),
      canViewAttendance:
        isAdmin ||
        isElder ||
        holds("secretary") ||
        holds("attendance_recorder") ||
        holds("attendance_recorder_assistant"),
      canSubmitReportForOthers: isAdmin || isElder,
      canGenerateS21: isAdmin || isElder,

      // Responsibility-aware (Phase 2): admin OR specific responsibility.
      canEditMidweekSchedule: editsMidweek,
      canEditWeekendSchedule: editsWeekend,
      canEditCleaning: isAdmin || holds("cleaning_coordinator"),
      canEditCartWitnessing: isAdmin || holds("public_witnessing"),
      canEditFieldServiceMeetings:
        isAdmin ||
        holds("service_overseer") ||
        holds("service_overseer_assistant"),
      canEditDuties:
        isAdmin || holds("duties_coordinator") || holds("body_coordinator"),

      // Auxiliary pioneers — admin, body coordinator, secretary, service overseer.
      canManageAuxiliaryPioneers:
        isAdmin ||
        holds("body_coordinator") ||
        holds("secretary") ||
        holds("service_overseer"),

      // Secretary + admin only.
      canManageEvents: isAdmin || holds("body_coordinator"),
      canManageAbsences:
        isAdmin ||
        holds("body_coordinator") ||
        holds("life_ministry_overseer") ||
        holds("secretary"),
      canViewLocalNeeds: isAdmin || isElder,
      canViewPioneerSchool: isAdmin || isElder,
      // Only an administrator keeps the schedule — Lionel's decision.
      canManagePioneerSchool: isAdmin,
      canManageLocalNeeds: isAdmin || holds("life_ministry_overseer"),
      // Помощник имеет те же права: замену делают перед встречей, и
      // координатора может не быть рядом.
      canCoordinatePublicTalks:
        isAdmin ||
        holds("public_talk_coordinator") ||
        holds("public_talk_coordinator_assistant"),
      canViewServiceSummary: isAdmin || isElder || holds("secretary"),
      canManageServiceSummary: isAdmin || holds("secretary"),
      // Those who plan the visit read its schedule too (27 September): the
      // service overseer's assistant could already change it.
      canViewCoSchedule:
        isAdmin ||
        isElder ||
        holds("service_overseer") ||
        holds("service_overseer_assistant") ||
        holds("body_coordinator"),
      canEditCoSchedule:
        isAdmin ||
        holds("service_overseer") ||
        holds("service_overseer_assistant") ||
        holds("body_coordinator"),

      responsibilities: mine,
    };
  }, [role, mine, isFetched]);
}
