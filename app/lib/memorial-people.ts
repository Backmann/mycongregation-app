/**
 * Who may be put on the Memorial — one answer for the programme AND for the
 * duties, so the two cannot drift apart.
 *
 * Baptized brothers, told by the APPOINTMENT rather than the baptism date: of
 * twenty-seven brothers in this congregation three have a date recorded, so
 * that filter would leave three men in the picker. «unbaptized_publisher» and
 * «student» are the two appointments that are not baptized, and everyone
 * carries one.
 *
 * The duties used to be the wider circle — sisters stood in the foyer and on
 * the car park. That was reversed: the whole evening, programme and places
 * alike, is served by baptized brothers.
 */
import type { PublisherAppointment } from './api';

/** The Memorial is served by brothers — on the programme and at a place. */
export const MEMORIAL_GENDER = 'brother' as const;

/** Appointments that mean «not baptized»; everyone carries an appointment. */
export const MEMORIAL_NOT_BAPTIZED: PublisherAppointment[] = [
  'student',
  'unbaptized_publisher',
];
