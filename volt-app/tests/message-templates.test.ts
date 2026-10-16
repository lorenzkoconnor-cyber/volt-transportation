import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_TEMPLATES, renderTemplate, unknownPlaceholders, mergeTemplate } from "../src/lib/message-templates.ts";

test("fills placeholders", () => {
  assert.equal(renderTemplate("Hi {name}, {confirmation}", { name: "Jo", confirmation: "VOLT-AB12CD" }), "Hi Jo, VOLT-AB12CD");
});

test("drops a line whose placeholders are all empty (one-way trip has no return line)", () => {
  const out = renderTemplate("Line 1\n{return_line}\nLine 3", { return_line: "" });
  assert.equal(out, "Line 1\nLine 3");
});

test("keeps a line with text even if a placeholder in it is empty", () => {
  assert.equal(renderTemplate("Call {phone} now", {}), "Call  now");
});

test("collapses extra blank lines and trims", () => {
  assert.equal(renderTemplate("\nA\n\n\n\nB\n", {}), "A\n\nB");
});

test("default confirmation renders with opt-out wording and arrive minutes", () => {
  const out = renderTemplate(DEFAULT_TEMPLATES.confirmation.sms, {
    name: "Jo", confirmation: "VOLT-AB12CD", route: "Volt Columbus → ATL", date: "Friday, October 24, 2026",
    time: "6:00 AM", return_line: "", receipt_link: "https://x/receipt/1", arrive_minutes: 25,
  });
  assert.match(out, /Arrive 25 min early\. Reply STOP to opt out\./);
  assert.doesNotMatch(out, /\{/);
  assert.doesNotMatch(out, /Return:/);
});

test("flags placeholders a message doesn't support", () => {
  assert.deepEqual(unknownPlaceholders("receipt", "Hi {name} {refund_details}"), ["refund_details"]);
  assert.deepEqual(unknownPlaceholders("cancelled", "Hi {name} {refund_details}"), []);
});

test("blank overrides fall back to the default wording", () => {
  const t = mergeTemplate("receipt", { key: "receipt", sms_body: "  ", email_subject: null, email_body: "Custom" });
  assert.equal(t.sms, DEFAULT_TEMPLATES.receipt.sms);
  assert.equal(t.emailBody, "Custom");
});
