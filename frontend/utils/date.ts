/* Formats a date as a string in the format 'Month day, year'. */
export function getFormattedDate(date: Date): string {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "June",
    "July",
    "Aug",
    "Sept",
    "Oct",
    "Nov",
    "Dec",
  ];
  // UTC getters: the server renders in UTC, and local-time getters gave visitors west of it the
  // previous day, which is also a React hydration mismatch.
  return `${months[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}
