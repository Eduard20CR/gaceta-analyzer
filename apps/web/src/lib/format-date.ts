// Dates as the user reads them: Spanish of Costa Rica, Costa Rica time.
//
// The API stores dates in UTC ("2026-11-04T20:18:00.000Z"). The user is in
// Costa Rica, so the time zone is fixed instead of taken from the device: the
// page shows the same time on any computer, and tests do not depend on the time
// zone of the machine that runs them.

const COSTA_RICA_DATE_TIME = new Intl.DateTimeFormat('es-CR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Costa_Rica',
});

/** For example "4 nov 2026, 2:18 p. m." for "2026-11-04T20:18:00.000Z". */
export function formatDateTime(isoDate: string): string {
  return COSTA_RICA_DATE_TIME.format(new Date(isoDate));
}
