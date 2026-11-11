"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
const root = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const MSG = "App updated - close and reopen";

function boot(globals) {
  const made = [];
  const body = { firstChild: null, insertBefore(node) { this.node = node; } };
  const document = {
    readyState: "complete",
    body,
    createElement() {
      const n = { style: {}, textContent: "", setAttribute() {} };
      made.push(n);
      return n;
    },
    addEventListener() { throw new Error("waited for DOM"); },
  };
  let error = null;
  try { vm.runInNewContext(app, Object.assign({ document, console }, globals), { filename: "app.js" }); }
  catch (e) { error = e; }
  return { error, made, body };
}

const missing = boot({});
assert.ok(missing.error, "missing score.js should stop app.js");
assert.strictEqual(missing.error.message, MSG);
assert.strictEqual(missing.body.node && missing.body.node.textContent, MSG);
assert.strictEqual(missing.body.node.id, "h30-stale");

const partial = boot({ H30Score: {} });
assert.strictEqual(partial.error && partial.error.message, MSG);
assert.strictEqual(partial.body.node && partial.body.node.textContent, MSG);

const ready = boot({ H30Score: { blank() { return {}; } } });
assert.ok(ready.error, "rest of app.js still needs the browser");
assert.notStrictEqual(ready.error.message, MSG);
assert.ok(/supabase/.test(ready.error.message), ready.error.message);
assert.strictEqual(ready.body.node, undefined);

assert.ok(!html.includes("?v="), "versioned script URLs break the offline cache");
assert.ok(html.includes('<script src="score.js"></script><script src="app.js"></script>'));
assert.ok(sw.includes('const C = "h30-shell-v6"'));
for (const file of ["./index.html", "./app.js", "./score.js", "./auth-link.js", "./config.js", "./manifest.webmanifest", "./icon.svg", "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js"]) {
  assert.ok(sw.includes('"' + file + '"'), "shell cache missing " + file);
}

console.log("stale-cache tests: all passed");
