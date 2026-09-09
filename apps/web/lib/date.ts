const MAURITIUS_TIME_ZONE = "Indian/Mauritius";

export function formatMauritiusDateTime(value: string | Date) {
  return new Intl.DateTimeFormat("en-MU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: MAURITIUS_TIME_ZONE,
  }).format(new Date(value));
}

export function formatMauritiusDate(value: string | Date) {
  return new Intl.DateTimeFormat("en-MU", {
    dateStyle: "medium",
    timeZone: MAURITIUS_TIME_ZONE,
  }).format(new Date(value));
}
