"use strict";
// Current Daily 15 (9 exercises, per Wendy, Nov 1). Keys "0".."8".
const EXERCISES = [
  { name: "Tib raises", dose: "2x20" },
  { name: "Split squat", dose: "2x8 each leg" },
  { name: "Glute bridges", dose: "2x15" },
  { name: "Dead bug", dose: "2x10" },
  { name: "Bird dogs", dose: "2x8 each side" },
  { name: "Hollow hold", dose: "2x20s", timer: 20 },
  { name: "Lying leg raises", dose: "2x10" },
  { name: "Standing side bends", dose: "2x10 each side", tip: "Home 25 lb kettlebell, Road work tote, arm straight, no shrug" },
  { name: "Couch stretch", dose: "60s each side", timer: 60 },
];
const CHECKS = [["walk", "30 minute walk and 8k+ steps"], ["no_alcohol", "No alcohol"], ["read", "Read 10 pages"], ["clip", "Filmed a clip"]];
const COUNTERS = [["water_oz", "Water", 100, "oz", [8, 16, 32, -8]], ["protein_g", "Protein", 120, "g", [10, 25, 40, -10]]];
const NOV = Array.from({ length: 30 }, (_, i) => `2026-11-${String(i + 1).padStart(2, "0")}`);
const TZ = "America/New_York";
const $ = id => document.getElementById(id);
const sb = supabase.createClient(H30.url, H30.anonKey, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "h30-auth" } });

function todayNY() { return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function addDays(d, n) { const t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
function uuid() { return crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)); }

// ---------- server cache (truth as last fetched), defensive parse ----------
let server = {};
try { const s = JSON.parse(localStorage.getItem("h30-cache") || "{}"); if (s && typeof s === "object") server = s; } catch { server = {}; }
function saveCache() { try { localStorage.setItem("h30-cache", JSON.stringify(server)); } catch {} }
function blank(day) { return { day, checks: {}, exercises: {}, one_round: false, water_oz: 0, protein_g: 0, note: "", steps: null, deleted_at: null }; }
function norm(r, day) { // tolerate partial or corrupt rows
  const b = blank(day); if (!r || typeof r !== "object") return b;
  return { day, checks: (r.checks && typeof r.checks === "object") ? r.checks : {}, exercises: (r.exercises && typeof r.exercises === "object") ? r.exercises : {},
    one_round: !!r.one_round, water_oz: Number(r.water_oz) || 0, protein_g: Number(r.protein_g) || 0, note: typeof r.note === "string" ? r.note : "", steps: Number.isFinite(+r.steps) && r.steps !== null ? +r.steps : null, deleted_at: r.deleted_at || null };
}

// ---------- IndexedDB outbox ----------
let db, outbox = [];
function idb() { return new Promise((res, rej) => { const q = indexedDB.open("h30", 1); q.onupgradeneeded = () => q.result.createObjectStore("outbox", { keyPath: "seq", autoIncrement: true }); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
function tx(mode, fn) { return new Promise((res, rej) => { const t = db.transaction("outbox", mode); const s = t.objectStore("outbox"); const r = fn(s); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); }); }
async function loadOutbox() { outbox = await new Promise((res) => { const out = []; const c = db.transaction("outbox").objectStore("outbox").openCursor(); c.onsuccess = () => { const cur = c.result; if (cur) { out.push(cur.value); cur.continue(); } else res(out); }; }); }

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
function view(day) { let r = norm(server[day], day); for (const op of outbox) if (op.day === day) r = applyOp(r, op); return r; }

async function enqueue(op) {
  op.op_id = op.op_id || uuid(); op.day = op.day || sel;
  const seq = await tx("readwrite", s => s.add(op)); op.seq = seq; outbox.push(op);
  render(); flush();
}

let flushing = false, syncErr = "", failed = [], ackSeq = 0;
try { failed = JSON.parse(localStorage.getItem("h30-failed") || "[]"); if (!Array.isArray(failed)) failed = []; } catch { failed = []; }
function saveFailed() { try { localStorage.setItem("h30-failed", JSON.stringify(failed)); } catch {} }
function isTransient(err) { // network or auth: keep op, retry later
  if (!navigator.onLine) return true;
  const m = String((err && (err.message || err)) || ""), c = String((err && (err.code || err.status)) || "");
  if (!(err && (err.code || err.status))) console.warn("h30 sync: error without code, treating as transient (will retry)", err);
  return /Failed to fetch|NetworkError|Load failed|network|timeout|JWT|jwt|expired|401|403|PGRST301/.test(m + " " + c) || c === "401" || c === "";
}
async function flush() {
  if (flushing || !session) return; flushing = true;
  try {
    while (outbox.length) {
      const op = outbox[0];
      let res;
      try { res = op.kind === "inc"
        ? await sb.rpc("increment_counter", { p_day: op.day, p_field: op.field, p_delta: op.delta, p_op_id: op.op_id })
        : await sb.rpc("patch_day", { p_day: op.day, p_patch: op.patch }); }
      catch (e) { res = { error: e }; }
      if (res.error) {
        if (isTransient(res.error)) { syncErr = navigator.onLine ? (res.error.message || "sync failed") : "offline"; if (/JWT|jwt|expired/.test(res.error.message || "")) sb.auth.refreshSession().catch(() => {}); break; }
        failed.push({ ...op, error: res.error.message || String(res.error) }); saveFailed(); // permanent: park it, keep queue flowing
      } else { syncErr = ""; if (res.data) { server[op.day] = res.data; saveCache(); } }
      await tx("readwrite", s => s.delete(op.seq)); outbox.shift(); ackSeq++; // removed only after server answered
      render();
    }
  } catch (e) { syncErr = navigator.onLine ? String(e.message || e) : "offline"; }
  flushing = false; render();
}
async function retryFailed(i) { const op = failed.splice(i, 1)[0]; saveFailed(); delete op.seq; delete op.error; await enqueue(op); }
function discardFailed(i) { if (confirm("Discard this unsaved change?")) { failed.splice(i, 1); saveFailed(); render(); } }

async function refetch() {
  if (!session) return;
  await flush(); if (outbox.length) return; // don't overwrite while taps are pending
  const startAck = ackSeq;
  const { data, error } = await sb.from("daily_log").select("*").gte("day", "2026-11-01").lte("day", "2026-11-30");
  if (error) { syncErr = navigator.onLine ? error.message : "offline"; render(); return; }
  if (ackSeq !== startAck || outbox.length) return; // stale: an ack landed mid-fetch
  const next = {}; for (const r of data) next[r.day] = r; server = next; saveCache(); render(); flush();
}

// ---------- day selection, midnight-safe ----------
let today = todayNY(), sel = today, pinned = false;
function checkDay() { const t = todayNY(); if (t !== today) { if (!pinned || sel === today) sel = t; today = t; render(); } }
function pick(d) { commitNote(); sel = d; noteDirty = false; $("note").value = view(d).deleted_at ? "" : view(d).note; pinned = d !== today; render(); }

// ---------- derived ----------
function exDone(r) { return EXERCISES.every((_, i) => r.exercises[i] === true); }
function status(r) {
  if (r.deleted_at) r = blank(r.day);
  const c = [exDone(r), !!r.checks.walk, r.water_oz >= 100, r.protein_g >= 120, !!r.checks.no_alcohol, !!r.checks.read, !!r.checks.clip];
  if (c.every(Boolean)) return "done";
  const any = c.some(Boolean) || Object.values(r.exercises).some(v => v === true) || r.water_oz > 0 || r.protein_g > 0 || r.note.trim() || r.one_round;
  return any ? "part" : "none";
}
function streaks() {
  let best = 0, run = 0;
  for (const d of NOV) { if (d > today) break; if (status(view(d)) === "done") { run++; best = Math.max(best, run); } else if (d !== today) run = 0; }
  let cur = 0, d = status(view(today)) === "done" ? today : addDays(today, -1);
  while (d >= "2026-11-01" && status(view(d)) === "done") { cur++; d = addDays(d, -1); }
  return { cur, best };
}

// ---------- timers (end timestamp, independent) ----------
const timers = {}; // i -> {end, left, fired}
// Pre-v2 timer state was keyed by the old 8-item order; drop it so no manual Reset is needed.
try { for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && k.startsWith("h30-timers") && k !== "h30-timers-v2") localStorage.removeItem(k); } } catch {}
try {
  const t = JSON.parse(localStorage.getItem("h30-timers-v2") || "null");
  if (t && t.v === 2 && t.t && typeof t.t === "object") Object.assign(timers, t.t);
  else localStorage.removeItem("h30-timers-v2"); // unversioned or wrong shape predates v2 schema
} catch { try { localStorage.removeItem("h30-timers-v2"); } catch {} }
for (const k of Object.keys(timers)) { const t = timers[k]; if (!EXERCISES[k] || !EXERCISES[k].timer || !t || typeof t !== "object" || (t.end != null && !Number.isFinite(t.end)) || (t.left != null && !Number.isFinite(t.left))) delete timers[k]; }
function saveTimers() { try { localStorage.setItem("h30-timers-v2", JSON.stringify({ v: 2, t: timers })); } catch {} }
function remaining(i) { const t = timers[i]; const full = EXERCISES[i].timer * 1000; if (!t) return full; if (t.end) return Math.max(0, t.end - Date.now()); return t.left ?? full; }
function fmt(ms) { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }
let actx = null;
function unlockAudio() { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === "suspended") actx.resume(); } catch {} }
function timerBtn(i) {
  unlockAudio();
  const t = timers[i];
  if (t && t.end && remaining(i) > 0) { timers[i] = { left: remaining(i) }; }
  else if (t && !t.end && t.left > 0 && t.left < EXERCISES[i].timer * 1000) { timers[i] = { end: Date.now() + t.left }; }
  else { timers[i] = { end: Date.now() + EXERCISES[i].timer * 1000 }; }
  saveTimers(); render();
}
function alarm(i) {
  try { if (navigator.vibrate) navigator.vibrate([300, 150, 300]); } catch {}
  try { if (actx) { if (actx.state === "suspended") actx.resume(); for (const t of [0, 0.35, 0.7]) { const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = 880; g.gain.value = 0.3; o.connect(g); g.connect(actx.destination); o.start(actx.currentTime + t); o.stop(actx.currentTime + t + 0.25); } } } catch {}
  const row = document.querySelector(`[data-row="${i}"]`); if (row) { row.classList.add("flash"); setTimeout(() => row.classList.remove("flash"), 4000); }
}
function tick() {
  for (const i in timers) { const t = timers[i]; if (t.end && !t.fired && t.end <= Date.now()) { t.fired = true; saveTimers(); alarm(i); } }
  document.querySelectorAll("[data-tm]").forEach(el => { const i = el.dataset.tm; el.textContent = fmt(remaining(i)); });
}

// ---------- render ----------
let noteTimer = null, noteDirty = false;
function el(h) { const d = document.createElement("div"); d.innerHTML = h; return d.firstElementChild; }
function render() {
  const pend = outbox.length;
  const b = $("sync"); const off = !navigator.onLine || syncErr === "offline" || /Failed to fetch|Load failed|NetworkError/.test(syncErr);
  b.className = "badge" + (off || pend ? " warn" : syncErr || failed.length ? " err" : "");
  b.textContent = (off ? "offline" : "") + (pend ? `${off ? " · " : ""}unsynced ${pend}` : "") + (!off && !pend ? (syncErr ? "sync error" : "synced") : "") + (failed.length ? ` · failed ${failed.length}` : "");
  const xn = $("exportNote"); if (xn) { xn.textContent = pend ? `${pend} unsynced, not in export` : ""; xn.classList.toggle("hidden", !pend); }
  if (!session) return;
  const r = view(sel), deleted = !!r.deleted_at, R = deleted ? blank(sel) : r;
  const dt = new Date(sel + "T12:00:00Z");
  $("dayLbl").textContent = dt.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }) + (sel === today ? " (today)" : "");
  $("delBanner").classList.toggle("hidden", !deleted || r.deleted_at === "pending");
  $("oneRound").checked = R.one_round;
  const ex = $("exList"); ex.innerHTML = "";
  EXERCISES.forEach((e, i) => {
    const dose = R.one_round ? e.dose.replace(/^2x/, "1x") : e.dose;
    const w = el(`<div><label class="ck"><input type="checkbox"><span class="sp">${i + 1}. ${e.name}, ${dose}${e.tip ? `<br><span class="mu">${e.tip}</span>` : ""}</span></label></div>`);
    const cb = w.querySelector("input"); cb.checked = R.exercises[i] === true;
    cb.onchange = () => enqueue({ kind: "patch", patch: { exercises: { [i]: cb.checked } } });
    if (e.timer) { const tr = el(`<div class="row" data-row="${i}" style="padding:6px 0"><span class="tm" data-tm="${i}">${fmt(remaining(i))}</span></div>`);
      const run = timers[i] && timers[i].end && remaining(i) > 0, paused = timers[i] && !timers[i].end && timers[i].left > 0;
      const bt = el(`<button class="pri">${run ? "Pause" : paused ? "Resume" : "Start timer"}</button>`); bt.onclick = () => timerBtn(i);
      const rs = el(`<button>Reset</button>`); rs.onclick = () => { delete timers[i]; saveTimers(); render(); };
      tr.append(bt, rs); w.append(tr); }
    ex.append(w);
  });
  const n = EXERCISES.filter((_, i) => R.exercises[i] === true).length;
  $("exSum").textContent = n === EXERCISES.length ? `Daily 15 done${R.one_round ? " with one round. That counts." : "."}` : `${n} of ${EXERCISES.length} exercises done.`;
  const h = $("h30"); h.innerHTML = "";
  const wk = el(`<label class="ck ro"><input type="checkbox" disabled><span>Daily 15 workout (fills in when all ${EXERCISES.length} are done)</span></label>`);
  wk.querySelector("input").checked = exDone(R); h.append(wk);
  for (const [k, lbl] of CHECKS) { const w = el(`<label class="ck"><input type="checkbox"><span>${lbl}</span></label>`); const cb = w.querySelector("input");
    cb.checked = !!R.checks[k]; cb.onchange = () => enqueue({ kind: "patch", patch: { checks: { [k]: cb.checked } } }); h.append(w); }
  const c = $("ctr"); c.innerHTML = "";
  const sw = el(`<div style="padding:10px 0;border-bottom:1px solid #334155"><div class="row"><strong class="sp">Steps (optional)</strong><input type="number" inputmode="numeric" min="0" style="width:120px;padding:8px;border-radius:8px;border:1px solid #334155;background:#0b1220;color:#e2e8f0;font-size:16px"></div><span class="mu">Walk + 8k check above stays manual.</span></div>`);
  const si = sw.querySelector("input"); if (document.activeElement !== si) si.value = R.steps ?? "";
  si.onchange = () => { const v = si.value.trim() === "" ? null : Math.max(0, Math.min(200000, parseInt(si.value, 10) || 0)); enqueue({ kind: "patch", patch: { steps: v } }); };
  c.append(sw);
  for (const [f, lbl, goal, unit, steps] of COUNTERS) {
    const w = el(`<div style="padding:10px 0;border-bottom:1px solid #334155"><div class="row"><strong class="sp">${R[f] >= goal ? "✓ " : ""}${lbl}: ${R[f]} / ${goal} ${unit}</strong></div><div class="row" style="margin-top:6px"></div></div>`);
    for (const s of steps) { const bt = el(`<button>${s > 0 ? "+" : ""}${s}</button>`); bt.onclick = () => enqueue({ kind: "inc", field: f, delta: s }); w.lastElementChild.append(bt); }
    c.append(w);
  }
  if (!noteDirty && document.activeElement !== $("note")) $("note").value = R.note;
  const cal = $("cal"); cal.innerHTML = "";
  const lead = new Date("2026-11-01T12:00:00Z").getUTCDay(); for (let i = 0; i < lead; i++) cal.append(el(`<span></span>`));
  for (const d of NOV) { const s = status(view(d)); let cls = s === "done" ? "c-done" : s === "part" ? "c-part" : (d < today ? "c-miss" : "");
    if (d === sel) cls += " c-sel"; if (d === today) cls += " c-today";
    const x = el(`<div class="${cls}">${+d.slice(8)}</div>`); x.onclick = () => pick(d); cal.append(x); }
  const st = streaks(); $("streaks").textContent = `Streak ${st.cur} · Best ${st.best}`;
  const fl = $("failed"); fl.innerHTML = ""; failed.forEach((op, i) => { const w = el(`<div class="row" style="padding:4px 0"><span class="sp mu">${op.day} ${op.kind === "inc" ? op.field + " " + op.delta : Object.keys(op.patch).join(",")}: ${String(op.error).replace(/</g, "&lt;")}</span></div>`); const r1 = el(`<button>Retry</button>`); r1.onclick = () => retryFailed(i); const r2 = el(`<button class="dan">Discard</button>`); r2.onclick = () => discardFailed(i); w.append(r1, r2); fl.append(w); }); fl.classList.toggle("hidden", !failed.length);
  $("err").textContent = syncErr && !off ? "Sync error: " + syncErr + " (taps are kept and will retry)" : "";
}

// ---------- auth ----------
let session = null;
async function showAuth() {
  const { data } = await sb.auth.getSession(); session = data.session;
  $("login").classList.toggle("hidden", !!session); $("app").classList.toggle("hidden", !session);
  if (session) { render(); refetch(); }
}
$("em").value = H30.email;
$("send").onclick = async () => {
  $("lmsg").textContent = "Sending…";
  const { error } = await sb.auth.signInWithOtp({ email: $("em").value.trim(), options: { shouldCreateUser: false } });
  $("lmsg").textContent = error ? error.message : "Code sent. Check your email."; if (!error) $("codeBox").classList.remove("hidden");
};
$("verify").onclick = async () => {
  const { error } = await sb.auth.verifyOtp({ email: $("em").value.trim(), token: $("code").value.trim(), type: "email" });
  $("lmsg").textContent = error ? error.message : ""; if (!error) showAuth();
};
sb.auth.onAuthStateChange((_e, s) => { const was = !!session; session = s; if (!!s !== was) showAuth(); });

// ---------- wiring ----------
$("prev").onclick = () => { if (sel > "2026-11-01") pick(addDays(sel, -1)); };
$("next").onclick = () => { if (sel < "2026-11-30") pick(addDays(sel, 1)); };
$("todayBtn").onclick = () => pick(today);
$("oneRound").onchange = e => enqueue({ kind: "patch", patch: { one_round: e.target.checked } });
function commitNote() { if (noteDirty) { clearTimeout(noteTimer); enqueue({ kind: "patch", day: noteDay, patch: { note: $("note").value } }); noteDirty = false; } }
let noteDay = null;
$("note").oninput = () => { noteDirty = true; noteDay = sel; $("noteSt").textContent = "…"; clearTimeout(noteTimer); const d = sel;
  noteTimer = setTimeout(async () => { await enqueue({ kind: "patch", day: d, patch: { note: $("note").value } }); noteDirty = false; $("noteSt").textContent = "saved locally"; }, 700); };
$("note").onblur = commitNote;
$("clear").onclick = () => { if (confirm(`Clear everything logged for ${sel}? You can restore it until you log something new that day.`)) enqueue({ kind: "patch", patch: { clear: true } }); };
$("restore").onclick = () => enqueue({ kind: "patch", patch: { restore: true } });
$("refresh").onclick = refetch;
$("export").onclick = async () => {
  const { data, error } = await sb.from("daily_log").select("*").gte("day", "2026-11-01").lte("day", "2026-11-30").order("day");
  if (error) { alert("Export failed: " + error.message); return; }
  const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["day", "status", "daily15", ...EXERCISES.map(e => e.name), "one_round", "walk_8k", "water_oz", "protein_g", "no_alcohol", "read_10", "clip", "steps", "note", "deleted_at", "updated_at"];
  const rows = data.map(r0 => { const r = norm(r0, r0.day); return [r0.day, status(r), exDone(r), ...EXERCISES.map((_, i) => r.exercises[i] === true), r.one_round, !!r.checks.walk, r.water_oz, r.protein_g, !!r.checks.no_alcohol, !!r.checks.read, !!r.checks.clip, r.steps ?? "", r.note, r0.deleted_at ?? "", r0.updated_at]; });
  const csv = [head, ...rows].map(a => a.map(q).join(",")).join("\n");
  await deliverCsv(csv, "hard30-november-2026.csv");
};
// iOS home-screen apps ignore <a download>; prefer the share sheet, then blob download, then a new tab.
async function deliverCsv(csv, name) {
  try {
    const file = new File([csv], name, { type: "text/csv" });
    if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); window.__h30Export = "share"; return; }
      catch (e) { if (e && e.name === "AbortError") { window.__h30Export = "share-cancelled"; return; } }
    }
  } catch {}
  const standalone = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!(standalone && isIOS)) {
    try { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000); window.__h30Export = "download"; return; } catch {}
  }
  const w = window.open("data:text/csv;charset=utf-8," + encodeURIComponent(csv), "_blank");
  window.__h30Export = w ? "tab" : "tab-blocked";
  if (!w) alert("Could not open the CSV. Allow pop-ups or try again.");
}
$("logout").onclick = async () => { if (outbox.length && !confirm(`${outbox.length} taps are not synced yet. Sign out anyway? They stay on this device.`)) return; await sb.auth.signOut(); showAuth(); };
function wake() { checkDay(); refetch(); }
document.addEventListener("visibilitychange", () => { if (!document.hidden) wake(); });
window.addEventListener("focus", wake); window.addEventListener("online", () => { syncErr = ""; flush(); }); window.addEventListener("offline", () => { syncErr = "offline"; render(); });
setInterval(checkDay, 60000); setInterval(tick, 250); setInterval(flush, 30000);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

(async () => { db = await idb(); await loadOutbox(); await showAuth(); render(); })();
