import { describe, expect, it } from "vitest";
import { extractReplyText, nextLeadStatus, parseAddress, quickCategory } from "./replies";

describe("reply → lead status", () => {
  it("any first reply marks the lead Replied", () => {
    expect(nextLeadStatus("email_sent", null)).toBe("replied");
  });
  it("maps categories to the brief's statuses", () => {
    expect(nextLeadStatus("replied", "interested")).toBe("interested");
    expect(nextLeadStatus("replied", "meeting_request")).toBe("meeting_requested");
    expect(nextLeadStatus("replied", "follow_up_later")).toBe("follow_up_required");
    expect(nextLeadStatus("replied", "not_interested")).toBe("not_interested");
    expect(nextLeadStatus("replied", "unsubscribe")).toBe("unsubscribed");
  });
  it("out-of-office leaves the status alone", () => {
    expect(nextLeadStatus("email_sent", "out_of_office")).toBe("email_sent");
  });
  it("never revives an unsubscribed or bounced lead automatically", () => {
    expect(nextLeadStatus("unsubscribed", "interested")).toBe("unsubscribed");
    expect(nextLeadStatus("bounced", null)).toBe("bounced");
  });
  it("'Other' doesn't downgrade an interested lead", () => {
    expect(nextLeadStatus("interested", "other")).toBe("interested");
  });
});

describe("quick sorting", () => {
  it("catches opt-outs", () => {
    expect(quickCategory({ text: "Please remove me from your list" })).toBe("unsubscribe");
  });
  it("catches auto-replies", () => {
    expect(quickCategory({ text: "I'm away", autoSubmitted: "auto-replied" })).toBe("out_of_office");
    expect(quickCategory({ subject: "Automatic reply: Quick question", text: "away" })).toBe("out_of_office");
  });
  it("leaves real answers for AI", () => {
    expect(quickCategory({ text: "Yeah I will be available" })).toBeNull();
  });
});

describe("reply text", () => {
  it("drops the quoted email", () => {
    const body = "Yeah I will be available\n\nNandan T\n\nOn Fri, 13 Nov 2026 at 1:20 PM Nandan <a@b.com>\nwrote:\n\n> Hi Nandan,\n> quick question";
    expect(extractReplyText(body)).toBe("Yeah I will be available\n\nNandan T");
  });
  it("reads the address from a From header", () => {
    expect(parseAddress("Nandan T <Nandan@Involynk.com>")).toBe("nandan@involynk.com");
  });
});
