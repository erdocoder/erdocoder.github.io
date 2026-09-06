import assert from "node:assert/strict";
import test from "node:test";

import {
  default as worker,
  isValidPuzzleID,
  isValidUTCDateID,
  normalizeSenderTime,
  parseShareURL,
  resolveLocale,
} from "../src/index.js";

function installEmptyCache() {
  const writes = [];
  globalThis.caches = {
    default: {
      async match() { return undefined; },
      async put(request, response) {
        writes.push({ request, response });
      },
    },
  };
  return writes;
}

test("valid challenge URLs are canonicalized and unknown parameters are ignored", () => {
  const parsed = parseShareURL(new URL(
    "https://equation-genius.com/challenge/2026-08-16?utm_source=test&time=17.485"
  ));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.kind, "challenge");
  assert.equal(parsed.canonicalURL, "https://equation-genius.com/challenge/2026-08-16?time=17.49");
});

test("daily challenge IDs require real UTC calendar dates", () => {
  assert.equal(isValidUTCDateID("2026-02-28"), true);
  assert.equal(isValidUTCDateID("2026-02-29"), false);
  assert.equal(isValidUTCDateID("2026-2-08"), false);
  assert.equal(isValidUTCDateID("1999-12-31"), false);
});

test("sender time is bounded and normalized to hundredths", () => {
  assert.equal(normalizeSenderTime("17.48"), "17.48");
  assert.equal(normalizeSenderTime("17.485"), "17.49");
  assert.equal(normalizeSenderTime("0"), null);
  assert.equal(normalizeSenderTime("NaN"), null);
  assert.equal(normalizeSenderTime("86400"), null);
});

test("supported browser languages resolve by quality with English fallback", () => {
  assert.equal(resolveLocale("fr-CA,fr;q=0.9,en;q=0.8"), "fr");
  assert.equal(resolveLocale("en;q=0.4,sv-SE;q=0.9"), "sv");
  assert.equal(resolveLocale("zh-Hans-CN,zh;q=0.9"), "zh-Hans");
  assert.equal(resolveLocale("zh-Hant-TW,en;q=0.8"), "en");
  assert.equal(resolveLocale("it-IT"), "en");
  assert.equal(resolveLocale(null), "en");
});

test("duplicate or malformed time parameters fail", () => {
  assert.equal(parseShareURL(new URL(
    "https://equation-genius.com/challenge/2026-08-16?time=1&time=2"
  )).status, 400);
  assert.equal(parseShareURL(new URL(
    "https://equation-genius.com/challenge/2026-08-16?time=Infinity"
  )).status, 400);
});

test("puzzle IDs align with the native generator contract", () => {
  assert.equal(isValidPuzzleID("p1-l3-s1"), true);
  assert.equal(isValidPuzzleID("p1-l12-s2000000999"), true);
  assert.equal(isValidPuzzleID("t1-001"), true);
  assert.equal(isValidPuzzleID("t1-308"), true);
  assert.equal(isValidPuzzleID("p2-l10-s42"), false);
  assert.equal(isValidPuzzleID("p1-l13-s42"), false);
  assert.equal(isValidPuzzleID("p1-l010-s42"), false);
  assert.equal(isValidPuzzleID("p1-l10-s0"), false);
  assert.equal(isValidPuzzleID("t1-000"), false);
  assert.equal(isValidPuzzleID("t1-01"), false);
  assert.equal(isValidPuzzleID("t2-001"), false);
});

test("wrong hosts, schemes, routes, and malformed IDs are rejected", () => {
  const rejected = [
    "http://equation-genius.com/challenge/2026-08-16",
    "https://www.equation-genius.com/challenge/2026-08-16",
    "https://equation-genius.com/challenge/2026-02-30",
    "https://equation-genius.com/puzzle/p1-l10-s42/extra",
    "https://equation-genius.com/other/p1-l10-s42",
  ];
  for (const value of rejected) {
    assert.equal(parseShareURL(new URL(value)).ok, false, value);
  }
});

test("the initial challenge response is HTTP 200 HTML with exact generic metadata", async () => {
  const writes = installEmptyCache();
  const pending = [];
  const result = await worker.fetch(
    new Request("https://equation-genius.com/challenge/2026-08-16?unknown=x&time=17.48"),
    {},
    { waitUntil(promise) { pending.push(promise); } }
  );
  await Promise.all(pending);
  const html = await result.text();

  assert.equal(result.status, 200);
  assert.match(result.headers.get("content-type"), /^text\/html/);
  assert.match(html, /property="og:title" content="Equation Genius Daily Challenge"/);
  assert.match(html, /property="og:url" content="https:\/\/equation-genius\.com\/challenge\/2026-08-16\?time=17\.48"/);
  assert.match(html, /property="og:image" content="https:\/\/equation-genius\.com\/social-preview\.png"/);
  assert.equal(writes[0].request.url, "https://equation-genius.com/challenge/2026-08-16?time=17.48&__eg_locale=en");
});

test("the initial puzzle response is HTTP 200 without exposing an answer", async () => {
  installEmptyCache();
  const result = await worker.fetch(
    new Request("https://equation-genius.com/puzzle/p1-l10-s42?answer=12"),
    {},
    { waitUntil() {} }
  );
  const html = await result.text();

  assert.equal(result.status, 200);
  assert.match(html, /property="og:title" content="Can you solve this puzzle\?"/);
  assert.match(html, /property="og:url" content="https:\/\/equation-genius\.com\/puzzle\/p1-l10-s42"/);
  assert.equal(html.includes("answer=12"), false);
});

test("curated Tricky puzzle URLs receive the same generic fallback without leaking blind content", async () => {
  installEmptyCache();
  const result = await worker.fetch(
    new Request("https://equation-genius.com/puzzle/t1-001?mode=blind_challenge"),
    {},
    { waitUntil() {} }
  );
  const html = await result.text();

  assert.equal(result.status, 200);
  assert.match(html, /property="og:title" content="Can you solve this puzzle\?"/);
  assert.match(html, /property="og:url" content="https:\/\/equation-genius\.com\/puzzle\/t1-001"/);
  assert.equal(html.includes("blind_challenge"), false);
  assert.equal(html.includes("t1-001"), true);
  assert.equal(html.includes("answer="), false);
});

test("share pages localize visible copy, metadata, language, and direction", async () => {
  installEmptyCache();
  const swedish = await worker.fetch(
    new Request("https://equation-genius.com/challenge/2026-08-16", {
      headers: { "Accept-Language": "sv-SE,sv;q=0.9" },
    }),
    {},
    { waitUntil() {} }
  );
  const swedishHTML = await swedish.text();
  assert.equal(swedish.headers.get("content-language"), "sv");
  assert.equal(swedish.headers.get("vary"), "Accept-Language");
  assert.match(swedishHTML, /<html lang="sv" dir="ltr">/);
  assert.match(swedishHTML, /Dagens utmaning/);
  assert.match(swedishHTML, /Hämta eller uppdatera Equation Genius/);
  assert.match(swedishHTML, /property="og:title" content="Equation Genius – Dagens utmaning"/);

  installEmptyCache();
  const arabic = await worker.fetch(
    new Request("https://equation-genius.com/puzzle/p1-l10-s42", {
      headers: { "Accept-Language": "ar" },
    }),
    {},
    { waitUntil() {} }
  );
  const arabicHTML = await arabic.text();
  assert.equal(arabic.headers.get("content-language"), "ar");
  assert.match(arabicHTML, /<html lang="ar" dir="rtl">/);
  assert.match(arabicHTML, /مسألة مشتركة/);
});

test("every supported locale renders its established share-page terminology", async () => {
  const expectations = {
    en: ["Shared Puzzle", "Can you solve this equation?", "Get or Update Equation Genius"],
    sv: ["Delad ekvation", "Kan du lösa den här ekvationen?", "Hämta eller uppdatera Equation Genius"],
    de: ["Geteilte Gleichung", "Kannst du diese Gleichung lösen?", "Equation Genius laden oder aktualisieren"],
    fr: ["Équation partagée", "Pouvez-vous résoudre cette équation ?", "Obtenir ou mettre à jour Equation Genius"],
    es: ["Ecuación compartida", "¿Puedes resolver esta ecuación?", "Obtener o actualizar Equation Genius"],
    ja: ["共有された方程式", "この方程式を解けますか？", "Equation Geniusを入手またはアップデート"],
    ar: ["مسألة مشتركة", "هل يمكنك حل هذه المعادلة؟", "تنزيل Equation Genius أو تحديثه"],
    "zh-Hans": ["分享的方程", "你能解出这道方程吗？", "获取或更新 Equation Genius"],
  };

  for (const [locale, expectedCopy] of Object.entries(expectations)) {
    installEmptyCache();
    const result = await worker.fetch(
      new Request("https://equation-genius.com/puzzle/p1-l10-s42", {
        headers: { "Accept-Language": locale },
      }),
      {},
      { waitUntil() {} }
    );
    const html = await result.text();
    assert.equal(result.headers.get("content-language"), locale);
    for (const copy of expectedCopy) assert.equal(html.includes(copy), true, `${locale}: ${copy}`);
  }
});

test("the cache key isolates localized responses without changing the canonical URL", async () => {
  const writes = installEmptyCache();
  const url = "https://equation-genius.com/challenge/2026-08-16?time=17.48";

  for (const language of ["sv", "de"]) {
    const pending = [];
    await worker.fetch(
      new Request(url, { headers: { "Accept-Language": language } }),
      {},
      { waitUntil(promise) { pending.push(promise); } }
    );
    await Promise.all(pending);
  }

  assert.equal(writes.length, 2);
  assert.equal(writes[0].request.url.endsWith("__eg_locale=sv"), true);
  assert.equal(writes[1].request.url.endsWith("__eg_locale=de"), true);
  for (const write of writes) {
    const html = await write.response.text();
    assert.match(html, /property="og:url" content="https:\/\/equation-genius\.com\/challenge\/2026-08-16\?time=17\.48"/);
    assert.equal(html.includes("__eg_locale"), false);
  }
});
