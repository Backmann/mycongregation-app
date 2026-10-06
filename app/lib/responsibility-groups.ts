import type { ResponsibilityType } from "./api";

/**
 * The congregation's duties, in the order they are shown — ONE order, for the
 * administrator's screen where they are assigned and for the list everybody
 * reads (6 October 2026). Kept in a screen's own file it would have been
 * copied for the second screen, and the two would have drifted.
 */

/**
 * The order they are shown in, and it is not the order they were written in.
 *
 * Grouped the way the body itself is: who leads, then the meeting, then the
 * ministry, then what is kept and counted. A brother looking for one of them
 * scans a group of three rather than a list of twelve.
 *
 * KEPT BY HAND, and that is the trap it fell into: two responsibilities were
 * added to the server and this list was not, so they existed everywhere except
 * where somebody could assign them. Anything added to ResponsibilityType
 * belongs here too.
 */
export const RESPONSIBILITY_GROUPS: {
  key: string;
  types: ResponsibilityType[];
}[] = [
  {
    // The service committee first, because it is the body's working core and
    // the first thing anybody comes here to check. Their assistants stand with
    // them: formally the committee is three, but a man looking for «кто вместо
    // секретаря» looks here, not two screens down.
    key: "committee",
    types: [
      "body_coordinator",
      "body_coordinator_assistant",
      "secretary",
      "service_overseer",
      "service_overseer_assistant",
    ],
  },
  {
    key: "meeting",
    types: [
      "life_ministry_overseer",
      "wt_study_conductor",
      "wt_study_conductor_backup",
      "public_talk_coordinator",
      "public_talk_coordinator_assistant",
      "adviser",
      "attendance_recorder",
      "attendance_recorder_assistant",
    ],
  },
  { key: "service", types: ["public_witnessing"] },
  {
    key: "house",
    types: ["accounts_servant", "cleaning_coordinator", "duties_coordinator"],
  },
];

/**
 * Every responsibility appears somewhere — checked by the compiler.
 *
 * The list above is kept by hand, and it fell into exactly the trap that
 * invites: two responsibilities were added to the server and not here, so they
 * existed everywhere except where somebody could assign them. This map has one
 * entry per ResponsibilityType, so leaving one out no longer builds.
 */
const GROUP_OF: Record<ResponsibilityType, string> = {
  body_coordinator: "committee",
  body_coordinator_assistant: "committee",
  secretary: "committee",
  service_overseer: "committee",
  service_overseer_assistant: "committee",
  life_ministry_overseer: "meeting",
  wt_study_conductor: "meeting",
  wt_study_conductor_backup: "meeting",
  public_talk_coordinator: "meeting",
  public_talk_coordinator_assistant: "meeting",
  adviser: "meeting",
  attendance_recorder: "meeting",
  attendance_recorder_assistant: "meeting",
  public_witnessing: "service",
  accounts_servant: "house",
  cleaning_coordinator: "house",
  duties_coordinator: "house",
};

/**
 * Сторож видимого списка.
 *
 * Выше в этом файле уже записано, что список ведётся руками и однажды в эту
 * ловушку попал: роли добавили на сервер и не сюда, и они существовали везде,
 * кроме места, где их назначают. `GROUP_OF` завели, чтобы забытая роль не
 * собиралась, — но он проверяет ТОЛЬКО себя, а не порядок показа. Роль,
 * внесённая в GROUP_OF и не внесённая в RESPONSIBILITY_GROUPS, снова
 * невидима, и ровно это случилось при добавлении помощника координатора речей.
 *
 * Теперь равенство двух списков проверяется при запуске экрана: расхождение
 * видно сразу, а не через месяц, когда кто-то не нашёл роль.
 */
const listedTypes = new Set(
  RESPONSIBILITY_GROUPS.flatMap((g) => g.types as string[]),
);
for (const type of Object.keys(GROUP_OF)) {
  if (!listedTypes.has(type)) {
    // По-английски намеренно: это сообщение для того, кто правит код, а не
    // надпись на экране — проверка зашитых текстов справедливо не умеет
    // отличать одно от другого.
    console.error(
      `[responsibilities] "${type}" is in GROUP_OF but missing from RESPONSIBILITY_GROUPS, so nobody can assign or see it`,
    );
  }
}
