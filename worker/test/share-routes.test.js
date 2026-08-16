import assert from "node:assert/strict";
import test from "node:test";

import {
  default as worker,
  isValidPuzzleID,
  isValidUTCDateID,
  normalizeSenderTime,
  parseShareURL,
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
  assert.equal(isValidPuzzleID("p2-l10-s42"), false);
  assert.equal(isValidPuzzleID("p1-l13-s42"), false);
  assert.equal(isValidPuzzleID("p1-l010-s42"), false);
  assert.equal(isValidPuzzleID("p1-l10-s0"), false);
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
  assert.equal(writes[0].request.url, "https://equation-genius.com/challenge/2026-08-16?time=17.48");
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
