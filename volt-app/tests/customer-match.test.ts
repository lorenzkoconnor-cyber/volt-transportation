// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { ilikeExact, normalizeEmail, normalizePhone, sameContact } from "../src/lib/customer-match.ts";

test("emails ignore capital letters and spaces", () => {
  assert.equal(normalizeEmail("  Da159431@Gmail.COM "), "da159431@gmail.com");
  assert.equal(normalizeEmail(null), "");
});

test("phones ignore formatting and a leading US 1", () => {
  for (const p of ["7065733364", "(706) 573-3364", "706.573.3364", "+1 706 573 3364", "1-706-573-3364"]) {
    assert.equal(normalizePhone(p), "7065733364");
  }
  assert.equal(normalizePhone(""), "");
});

test("same rider only when both email and phone match", () => {
  const a = { email: "Ray@Example.com", phone: "(706) 573-3364" };
  assert.ok(sameContact(a, { email: "ray@example.com", phone: "7065733364" }));
  assert.ok(!sameContact(a, { email: "ray@example.com", phone: "7065550000" }));
  assert.ok(!sameContact(a, { email: "other@example.com", phone: "7065733364" }));
  assert.ok(!sameContact({ email: "x@y.com", phone: "" }, { email: "x@y.com", phone: "" }));
});

test("ilike patterns treat % and _ literally", () => {
  assert.equal(ilikeExact("first_last%@x.com"), "first\\_last\\%@x.com");
});
