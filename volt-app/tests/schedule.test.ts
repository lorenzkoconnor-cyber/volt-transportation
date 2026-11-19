// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  weekStart, weekDays, shiftMinutes, isOvernight, remainingMinutes, summarizeHours,
  summarizeWeek, payCents, formatMinutes, validateShift, easternNow, type Shift,
} from "../src/lib/schedule.ts";

let n = 0;
const shift = (o: Partial<Shift>): Shift => ({
  id: String(++n), employee_id: "e1", kind: "scheduled", shift_date: "2026-11-18",
  start_time: "08:00", end_time: "16:00", break_minutes: 0, ...o,
});

test("weeks run Monday to Sunday", () => {
  assert.equal(weekStart("2026-11-19"), "2026-11-16"); // Thu
  assert.equal(weekStart("2026-11-16"), "2026-11-16"); // Mon
  assert.equal(weekStart("2026-11-22"), "2026-11-16"); // Sun
  assert.equal(weekStart("2026-11-01"), "2026-10-26"); // DST change day
  assert.deepEqual(weekDays("2026-12-28").slice(-2), ["2027-01-02", "2027-01-03"]);
});

test("shift length, breaks and overnight shifts", () => {
  assert.equal(shiftMinutes(shift({})), 480);
  assert.equal(shiftMinutes(shift({ break_minutes: 30 })), 450);
  const night = shift({ start_time: "22:00", end_time: "06:00:00" });
  assert.ok(isOvernight(night));
  assert.equal(shiftMinutes(night), 480);
  assert.equal(shiftMinutes(shift({ start_time: "08:00", end_time: "09:00", break_minutes: 90 })), 0);
});

test("remaining time counts only what hasn't happened", () => {
  const s = shift({ break_minutes: 30 }); // Nov 18 8–4, 7.5h paid
  assert.equal(remainingMinutes(s, { date: "2026-11-17", minutes: 1400 }), 450);
  assert.equal(remainingMinutes(s, { date: "2026-11-18", minutes: 8 * 60 }), 450);
  assert.equal(remainingMinutes(s, { date: "2026-11-18", minutes: 14 * 60 }), 120);
  assert.equal(remainingMinutes(s, { date: "2026-11-18", minutes: 16 * 60 }), 0);
  assert.equal(remainingMinutes(s, { date: "2026-11-19", minutes: 0 }), 0);
  const night = shift({ start_time: "22:00", end_time: "06:00" });
  assert.equal(remainingMinutes(night, { date: "2026-11-19", minutes: 5 * 60 }), 60);
});

test("overtime past 40 worked hours is paid at 1.5x", () => {
  const now = { date: "2026-11-23", minutes: 0 };
  const worked = ["16", "17", "18", "19", "20"].map((d) =>
    shift({ kind: "worked", shift_date: `2026-11-${d}`, start_time: "07:00", end_time: "16:00" }));
  const sum = summarizeHours(worked, now, 2000); // $20/h, 45h
  assert.equal(sum.workedMin, 2700);
  assert.equal(sum.regularMin, 2400);
  assert.equal(sum.overtimeMin, 300);
  assert.equal(sum.payCents, 40 * 2000 + 5 * 3000);
  assert.equal(summarizeHours(worked, now, null).payCents, null);
  assert.equal(payCents(90, 0, 1550), 2325);
});

test("week summary splits worked, scheduled and still to work per employee", () => {
  const now = { date: "2026-11-19", minutes: 12 * 60 };
  const shifts = [
    shift({ kind: "scheduled", shift_date: "2026-11-17" }),             // past
    shift({ kind: "worked", shift_date: "2026-11-17", end_time: "17:00" }),
    shift({ kind: "scheduled", shift_date: "2026-11-21" }),             // ahead
    shift({ kind: "scheduled", shift_date: "2026-11-24" }),             // next week
    shift({ employee_id: "e2", kind: "scheduled", shift_date: "2026-11-19" }), // under way
  ];
  const w = summarizeWeek(shifts, ["e1", "e2", "e3"], "2026-11-16", now, { e1: 1800 });
  assert.equal(w.e1.scheduledMin, 960);
  assert.equal(w.e1.workedMin, 540);
  assert.equal(w.e1.remainingMin, 480);
  assert.equal(w.e1.projectedMin, 1020);
  assert.equal(w.e1.payCents, 9 * 1800);
  assert.equal(w.e2.remainingMin, 240);
  assert.equal(w.e2.payCents, null);
  assert.equal(w.e3.scheduledMin, 0);
});

test("formatting and validation", () => {
  assert.equal(formatMinutes(450), "7h 30m");
  assert.equal(formatMinutes(480), "8h");
  assert.equal(validateShift({ start_time: "08:00", end_time: "08:00", break_minutes: 0 }), "Start and end can't be the same time.");
  assert.equal(validateShift({ start_time: "08:00", end_time: "09:00", break_minutes: 60 }), "Break is longer than the shift.");
  assert.equal(validateShift({ start_time: "22:00", end_time: "02:00", break_minutes: 30 }), null);
  assert.deepEqual(easternNow(new Date("2026-11-19T17:30:00Z")), { date: "2026-11-19", minutes: 12 * 60 + 30 });
  assert.deepEqual(easternNow(new Date("2026-11-20T03:00:00Z")), { date: "2026-11-19", minutes: 22 * 60 });
});
