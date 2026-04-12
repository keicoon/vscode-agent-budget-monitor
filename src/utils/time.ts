export function formatRelativeDuration(targetDate: Date, now = new Date()): string {
  const deltaMs = targetDate.getTime() - now.getTime();
  const sign = deltaMs < 0 ? "-" : "";
  const totalSeconds = Math.abs(Math.floor(deltaMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${sign}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatIsoDate(input?: string): string | undefined {
  if (!input) {
    return undefined;
  }

  const value = new Date(input);
  if (Number.isNaN(value.getTime())) {
    return undefined;
  }

  return value.toISOString();
}
