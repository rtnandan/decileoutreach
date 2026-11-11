import { describe, expect, it } from "vitest";
import { classifyImportRows, isValidEmail, missingVariables, renderTemplate } from "./email-utils";
import { assignAccounts, remainingAllowance, startOfDayInTimeZone } from "./sending-rules";

describe("personalisation", () => {
  const lead = { first_name: "Priya", company: "Acme", designation: "CMO", industry: "", custom_fields: { city: "Pune" } };
  it("fills the four required variables", () => {
    expect(renderTemplate("Hi {{first_name}}, {{designation}} at {{company}} in {{industry}}", lead)).toBe(
      "Hi Priya, CMO at Acme in ",
    );
  });
  it("uses fallbacks and custom fields", () => {
    expect(renderTemplate("{{industry|your industry}} / {{city}}", lead)).toBe("your industry / Pune");
  });
  it("reports missing variables without fallback", () => {
    expect(missingVariables("{{industry}} {{industry|x}} {{first_name}}", lead)).toEqual(["industry"]);
  });
});

describe("lead import", () => {
  it("validates emails", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
  });
  it("flags duplicates in file and existing leads", () => {
    const r = classifyImportRows(
      [{ email: "A@x.com" }, { email: "a@x.com" }, { email: "old@x.com" }, { email: "bad" }],
      new Set(["old@x.com"]),
    );
    expect(r.valid.map((v) => v.email)).toEqual(["a@x.com"]);
    expect(r.duplicateInFile).toHaveLength(1);
    expect(r.alreadyExists).toHaveLength(1);
    expect(r.invalid).toHaveLength(1);
  });
});

describe("daily limits", () => {
  it("never exceeds the account limit", () => {
    expect(remainingAllowance({ accountDailyLimit: 250, accountSentToday: 249, campaignDailyLimit: 500, campaignSentToday: 0, slotsThisRun: 5 })).toBe(1);
  });
  it("never exceeds the campaign limit", () => {
    expect(remainingAllowance({ accountDailyLimit: 500, accountSentToday: 0, campaignDailyLimit: 250, campaignSentToday: 250, slotsThisRun: 5 })).toBe(0);
  });
  it("is never negative", () => {
    expect(remainingAllowance({ accountDailyLimit: 10, accountSentToday: 12, campaignDailyLimit: 10, campaignSentToday: 0, slotsThisRun: 5 })).toBe(0);
  });
  it("rotates accounts within their allowance", () => {
    expect(assignAccounts([{ id: "a", remaining: 1 }, { id: "b", remaining: 3 }], 4)).toEqual(["a", "b", "b", "b"]);
    expect(assignAccounts([{ id: "a", remaining: 1 }], 4)).toEqual(["a"]);
  });
  it("resets the day at midnight India time", () => {
    // 2026-11-11 13:16 UTC = 18:46 IST -> day starts 2026-11-10 18:30 UTC
    expect(startOfDayInTimeZone(new Date("2026-11-11T13:16:00Z"), "Asia/Kolkata").toISOString()).toBe(
      "2026-11-10T18:30:00.000Z",
    );
    // 2026-11-11 20:00 UTC = 01:30 IST next day
    expect(startOfDayInTimeZone(new Date("2026-11-11T20:00:00Z"), "Asia/Kolkata").toISOString()).toBe(
      "2026-11-11T18:30:00.000Z",
    );
  });
});

import { guessTarget, mapRow } from "./import-mapping";
describe("import mapping", () => {
  it("recognises common column names", () => {
    expect(guessTarget("Email Address")).toBe("email");
    expect(guessTarget("Job Title")).toBe("designation");
    expect(guessTarget("Company Name")).toBe("company");
    expect(guessTarget("LinkedIn")).toBe("custom");
  });
  it("splits full names and keeps custom fields", () => {
    const r = mapRow({ Name: "Ravi Kumar Shah", City: "Pune" }, { Name: "full_name", City: "custom" }, 0);
    expect(r.first_name).toBe("Ravi");
    expect(r.last_name).toBe("Kumar Shah");
    expect(r.custom_fields).toEqual({ city: "Pune" });
  });
});
