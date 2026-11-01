"use strict";
// Pure helpers for sign-in links (no DOM, testable in Node).
(function (root) {
  const AUTH_KEYS = ["code", "token", "token_hash", "type", "error", "error_code", "error_description",
    "access_token", "refresh_token", "expires_in", "expires_at", "token_type", "provider_token", "provider_refresh_token", "sb"];
  // Accepts the /auth/v1/verify link from the default template, our own redirect URL, or a bare token hash.
  function parseSignInLink(text) {
    let s = String(text || "").trim().replace(/^<|>$/g, "").replace(/&amp;/g, "&");
    if (!s) return { error: "Paste the link from the email." };
    if (!/^https?:\/\//i.test(s)) {
      if (/^[A-Za-z0-9_-]{20,}$/.test(s)) return pick(s, "magiclink");
      return { error: "That does not look like a sign-in link." };
    }
    let u; try { u = new URL(s); } catch { return { error: "That does not look like a sign-in link." }; }
    const q = u.searchParams, h = new URLSearchParams(u.hash.replace(/^#/, ""));
    if (h.get("error_description") || q.get("error_description")) return { error: (h.get("error_description") || q.get("error_description")).replace(/\+/g, " ") };
    if (h.get("access_token") && h.get("refresh_token")) return { kind: "session", access_token: h.get("access_token"), refresh_token: h.get("refresh_token") };
    const th = q.get("token_hash") || (/\/auth\/v1\/verify\/?$/.test(u.pathname) ? q.get("token") : null);
    if (th) return pick(th, q.get("type") || "magiclink");
    if (q.get("code")) return { error: "This link was already opened (it carries a one-time PKCE code). Request a new link and copy it without tapping." };
    return { error: "No sign-in token found in that link." };
  }
  function pick(hash, type) {
    if (/^pkce_/.test(hash)) return { error: "This link needs the device that requested it. Request a new link from this app." };
    return { kind: "token_hash", token_hash: hash, type: type === "email" ? "email" : "magiclink" };
  }
  // Remove auth params from query and hash, keep everything else.
  function cleanUrl(href) {
    const u = new URL(href);
    AUTH_KEYS.forEach(k => u.searchParams.delete(k));
    if (u.hash) {
      const h = new URLSearchParams(u.hash.slice(1));
      if (AUTH_KEYS.some(k => h.has(k))) { AUTH_KEYS.forEach(k => h.delete(k)); const r = h.toString(); u.hash = r ? "#" + r : ""; }
    }
    return u.toString().replace(/#$/, "");
  }
  function hasAuthParams(href) { return cleanUrl(href) !== String(new URL(href)).replace(/#$/, ""); }
  const api = { parseSignInLink, cleanUrl, hasAuthParams };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.H30Auth = api;
})(typeof window !== "undefined" ? window : globalThis);
