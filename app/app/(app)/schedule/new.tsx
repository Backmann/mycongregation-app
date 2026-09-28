import { Redirect } from 'expo-router';

/**
 * The old «new assignment» address (28 September).
 *
 * It opened a bare form — the part by its code, the date as text — that
 * could create an assignment on a day without a meeting or for a part the
 * programme does not have. Assignments are made in the week's card now; an
 * old link or bookmark lands there instead of on a blank form.
 */
export default function NewAssignmentScreen() {
  return <Redirect href={'/schedule/edit' as never} />;
}
