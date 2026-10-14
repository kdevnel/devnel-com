const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2023-09" → "Sep 2023", "2018" → "2018". */
export function formatPartialDate(value: string): string {
  const [year, month] = value.split('-');
  return month ? `${MONTHS[Number(month) - 1]} ${year}` : year!;
}

/** Start/end pair as a range; an open end reads "present". */
export function formatPeriod(start: string, end?: string): string {
  return `${formatPartialDate(start)} – ${end ? formatPartialDate(end) : 'present'}`;
}

const longDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Africa/Johannesburg',
});

export function formatDate(date: Date): string {
  return longDate.format(date);
}
