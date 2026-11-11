"use strict";
const s = require("../score.js"), assert = require("assert");

function exAll() { const ex = {}; for (let i = 0; i < 9; i++) ex[String(i)] = true; return ex; }
function row(over) {
  return Object.assign({ day: "2026-11-10", checks: {}, exercises: {}, one_round: false, water_oz: 0, protein_g: 0, note: "", steps: null, deleted_at: null }, over);
}
const fullChecks = { clip: true, read: true, walk: true, no_alcohol: true };

const nov10 = row({
  checks: Object.assign({ alt_workout: true }, fullChecks),
  exercises: {},
  water_oz: 112,
  protein_g: 135,
  note: "Alternative workout (not Daily 15): abs.",
  steps: 8032,
});
assert.strictEqual(s.daily15Done(nov10, 9), false);
assert.strictEqual(s.altFlag(nov10), true);
assert.strictEqual(s.workoutDone(nov10, 9), true);
assert.strictEqual(s.workoutKind(nov10, 9), "alt");
assert.strictEqual(s.dayStatus(nov10, 9), "done");

const nov4 = row({
  day: "2026-11-04",
  checks: fullChecks,
  exercises: exAll(),
  water_oz: 100,
  protein_g: 150,
  steps: 11026,
});
assert.strictEqual(s.daily15Done(nov4, 9), true);
assert.strictEqual(s.workoutDone(nov4, 9), true);
assert.strictEqual(s.workoutKind(nov4, 9), "daily15");
assert.strictEqual(s.dayStatus(nov4, 9), "done");
assert.strictEqual(s.altFlag(nov4), false);

// JSON object keys are strings. Numeric lookup must still see "0".."8".
assert.strictEqual(s.daily15Done({ exercises: JSON.parse(JSON.stringify(exAll())) }, 9), true);
assert.strictEqual(s.altFlag({ checks: JSON.parse('{"alt_workout":true}') }), true);
assert.strictEqual(s.altFlag({ checks: { alt_workout: "true" } }), false);
assert.strictEqual(s.altFlag({ checks: { alt_workout: false } }), false);

const almost = row({ checks: fullChecks, exercises: Object.assign(exAll(), { "8": false }), water_oz: 100, protein_g: 150 });
assert.strictEqual(s.daily15Done(almost, 9), false);
assert.strictEqual(s.workoutDone(almost, 9), false);
assert.strictEqual(s.workoutKind(almost, 9), "none");
assert.strictEqual(s.dayStatus(almost, 9), "part");

const oneRound = row({ one_round: true });
assert.strictEqual(s.workoutDone(oneRound, 9), false);
assert.strictEqual(s.workoutKind(oneRound, 9), "none");
assert.strictEqual(s.dayStatus(oneRound, 9), "part");

const altOnly = row({ checks: { alt_workout: true } });
assert.strictEqual(s.workoutDone(altOnly, 9), true);
assert.strictEqual(s.workoutKind(altOnly, 9), "alt");
assert.strictEqual(s.dayStatus(altOnly, 9), "part");

const cleared = row({ checks: { alt_workout: true }, exercises: exAll(), deleted_at: "2026-11-10T12:00:00Z", water_oz: 112, note: "keep" });
assert.strictEqual(s.dayStatus(cleared, 9), "none");
assert.strictEqual(s.workoutDone(cleared, 9), false);
assert.strictEqual(s.workoutKind(cleared, 9), "none");
assert.strictEqual(s.altFlag(cleared), true);

// Daily 15 still wins when both are set, and turning the flag off leaves the circuit.
const both = row({ day: "2026-11-04", checks: Object.assign({ alt_workout: true }, fullChecks), exercises: exAll(), water_oz: 100, protein_g: 150, note: "circuit" });
assert.strictEqual(s.workoutKind(both, 9), "daily15");
assert.strictEqual(s.dayStatus(both, 9), "done");
s.applyOp(both, { kind: "patch", patch: { checks: { alt_workout: false } } });
assert.strictEqual(both.checks.alt_workout, false);
assert.strictEqual(both.checks.walk, true);
assert.strictEqual(both.checks.clip, true);
assert.strictEqual(both.note, "circuit");
assert.strictEqual(s.workoutKind(both, 9), "daily15");
assert.strictEqual(s.dayStatus(both, 9), "done");

// Other edits merge. alt_workout and unknown keys stay. Note, water, exercises are not replaced wholesale.
const merged = row({
  checks: { alt_workout: true, walk: true, clip: true, no_alcohol: true, future_flag: 1 },
  exercises: {},
  water_oz: 112,
  protein_g: 135,
  note: "abs session",
  steps: 8032,
});
s.applyOp(merged, { kind: "patch", patch: { checks: { read: false } } });
s.applyOp(merged, { kind: "patch", patch: { exercises: { 0: true } } });
s.applyOp(merged, { kind: "inc", field: "protein_g", delta: 10 });
s.applyOp(merged, { kind: "inc", field: "water_oz", delta: 8 });
s.applyOp(merged, { kind: "patch", patch: { steps: 9000 } });
s.applyOp(merged, { kind: "patch", patch: { one_round: true } });
s.applyOp(merged, { kind: "patch", patch: { note: "abs session, plus a line" } });
assert.strictEqual(merged.checks.alt_workout, true);
assert.strictEqual(merged.checks.future_flag, 1);
assert.strictEqual(merged.checks.walk, true);
assert.strictEqual(merged.checks.clip, true);
assert.strictEqual(merged.checks.no_alcohol, true);
assert.strictEqual(merged.checks.read, false);
assert.strictEqual(merged.exercises[0], true);
assert.strictEqual(merged.protein_g, 145);
assert.strictEqual(merged.water_oz, 120);
assert.strictEqual(merged.steps, 9000);
assert.strictEqual(merged.one_round, true);
assert.strictEqual(merged.note, "abs session, plus a line");
assert.strictEqual(s.workoutKind(merged, 9), "alt");
s.applyOp(merged, { kind: "patch", patch: { checks: { alt_workout: false } } });
assert.strictEqual(merged.checks.alt_workout, false);
assert.strictEqual(merged.checks.future_flag, 1);
assert.strictEqual(merged.checks.walk, true);
assert.strictEqual(merged.note, "abs session, plus a line");
assert.strictEqual(merged.water_oz, 120);
assert.strictEqual(merged.exercises[0], true);
assert.strictEqual(s.workoutDone(merged, 9), false);

// Soft-delete hides the day, keeps the stored flag, and restore brings the other workout back.
const kept = row({ checks: { alt_workout: true, walk: true }, note: "abs", water_oz: 40, protein_g: 10 });
s.applyOp(kept, { kind: "patch", patch: { clear: true } });
assert.strictEqual(kept.deleted_at, "pending");
assert.strictEqual(s.dayStatus(kept, 9), "none");
assert.strictEqual(s.workoutKind(kept, 9), "none");
assert.strictEqual(kept.checks.alt_workout, true);
assert.strictEqual(kept.note, "abs");
s.applyOp(kept, { kind: "patch", patch: { restore: true } });
assert.strictEqual(kept.deleted_at, null);
assert.strictEqual(s.workoutKind(kept, 9), "alt");
assert.strictEqual(kept.checks.walk, true);
assert.strictEqual(kept.note, "abs");
assert.strictEqual(kept.water_oz, 40);

console.log("workout tests: all passed");
