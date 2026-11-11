// Pure sending rules: daily limits, day boundaries and account rotation.

/** Midnight of `now`'s calendar day in the given IANA time zone, as a UTC Date. */
export function startOfDayInTimeZone(now: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  // Wall-clock time in the zone, interpreted as if it were UTC.
  const wallAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  const offsetMs = wallAsUtc - Math.floor(now.getTime() / 1000) * 1000;
  const midnightWallAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"));
  return new Date(midnightWallAsUtc - offsetMs);
}

/** How many more emails may go out right now. Never negative. */
export function remainingAllowance(input: {
  accountDailyLimit: number;
  accountSentToday: number;
  campaignDailyLimit: number;
  campaignSentToday: number;
  slotsThisRun: number;
}): number {
  const n = Math.min(
    input.accountDailyLimit - input.accountSentToday,
    input.campaignDailyLimit - input.campaignSentToday,
    input.slotsThisRun,
  );
  return Math.max(0, Math.floor(n));
}

/**
 * Spreads `count` emails across accounts round-robin, never giving an
 * account more than its remaining allowance. Returns one account id per email.
 */
export function assignAccounts(
  accounts: { id: string; remaining: number }[],
  count: number,
): string[] {
  const left = new Map(accounts.map((a) => [a.id, Math.max(0, a.remaining)]));
  const out: string[] = [];
  let progressed = true;
  while (out.length < count && progressed) {
    progressed = false;
    for (const a of accounts) {
      if (out.length >= count) break;
      const r = left.get(a.id) ?? 0;
      if (r > 0) {
        out.push(a.id);
        left.set(a.id, r - 1);
        progressed = true;
      }
    }
  }
  return out;
}

/** Emails per scheduled run and runs per hour (every 5 minutes). */
export const SENDS_PER_RUN = 5;
export const RUNS_PER_HOUR = 12;
