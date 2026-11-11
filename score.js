"use strict";
// Pure day scoring and local patch merge (no DOM). Workout credit is all 9 Daily 15
// exercises, or checks.alt_workout === true. one_round only shortens the circuit.
(function (root) {
  const EXERCISE_COUNT = 9;
  function blank(day) {
    return { day: day || "", checks: {}, exercises: {}, one_round: false, water_oz: 0, protein_g: 0, note: "", steps: null, deleted_at: null };
  }
  function visible(r) {
    if (!r || r.deleted_at) return blank(r && r.day);
    return r;
  }
  function daily15Done(r, count) {
    const n = count == null ? EXERCISE_COUNT : count;
    const ex = (r && r.exercises) || {};
    for (let i = 0; i < n; i++) if (ex[i] !== true) return false;
    return true;
  }
  // Stored flag, including on a soft-deleted row. Credit uses visible().
  function altFlag(r) {
    return !!(r && r.checks && r.checks.alt_workout === true);
  }
  function workoutDone(r, count) {
    r = visible(r);
    return daily15Done(r, count) || altFlag(r);
  }
  // "daily15" wins when the circuit is complete, so the record stays honest.
  function workoutKind(r, count) {
    r = visible(r);
    if (daily15Done(r, count)) return "daily15";
    if (altFlag(r)) return "alt";
    return "none";
  }
  function dayStatus(r, count) {
    r = visible(r);
    const checks = r.checks || {};
    const exercises = r.exercises || {};
    const c = [workoutDone(r, count), !!checks.walk, r.water_oz >= 100, r.protein_g >= 120, !!checks.no_alcohol, !!checks.read, !!checks.clip];
    if (c.every(Boolean)) return "done";
    const any = c.some(Boolean) || Object.values(exercises).some(v => v === true) || r.water_oz > 0 || r.protein_g > 0 || String(r.note || "").trim() || r.one_round;
    return any ? "part" : "none";
  }
  // Same merge the outbox applies before the server answers. checks and exercises are shallow merges.
  function applyOp(r, op) {
    if (op.kind === "inc") { if (r.deleted_at) Object.assign(r, blank(r.day)); r[op.field] = Math.max(0, r[op.field] + op.delta); return r; }
    const p = op.patch;
    if (p.clear) { r.deleted_at = "pending"; return r; }
    if (p.restore) { r.deleted_at = null; return r; }
    if (r.deleted_at) Object.assign(r, blank(r.day));
    if (p.checks) r.checks = { ...r.checks, ...p.checks };
    if (p.exercises) r.exercises = { ...r.exercises, ...p.exercises };
    if ("one_round" in p) r.one_round = p.one_round;
    if ("note" in p) r.note = p.note;
    if ("steps" in p) r.steps = p.steps;
    return r;
  }
  const api = { EXERCISE_COUNT, blank, visible, daily15Done, altFlag, workoutDone, workoutKind, dayStatus, applyOp };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.H30Score = api;
})(typeof window !== "undefined" ? window : globalThis);
