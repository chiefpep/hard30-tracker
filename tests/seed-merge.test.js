"use strict";
const fs = require("fs"), path = require("path"), assert = require("assert");
const root = path.join(__dirname, "..");

function checksReplace(sql) {
  return /checks\s*=\s*excluded\.checks\b/.test(sql) || /exercises\s*=\s*excluded\.exercises\b/.test(sql);
}

for (const file of ["supabase/seed_template.sql", "supabase/seed_2026-11-01.sql"]) {
  const sql = fs.readFileSync(path.join(root, file), "utf8");
  assert.ok(sql.includes("checks = daily_log.checks || excluded.checks"), file + " checks merge");
  assert.ok(sql.includes("exercises = daily_log.exercises || excluded.exercises"), file + " exercises merge");
  assert.ok(!checksReplace(sql), file + " still replaces jsonb: " + sql.match(/checks\s*=\s*excluded\.checks|exercises\s*=\s*excluded\.exercises/));
  assert.ok(/alt_workout/.test(sql), file + " comment should mention alt_workout");
}

const template = fs.readFileSync(path.join(root, "supabase/seed_template.sql"), "utf8");
assert.ok(/daily_log \|\| excluded/.test(template), "template comment should describe the merge");
assert.ok(!/Upsert overwrites only days listed/.test(template));

console.log("seed-merge tests: all passed");
