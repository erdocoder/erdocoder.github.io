const CANONICAL_ORIGIN = "https://equation-genius.com";
const SOCIAL_IMAGE_URL = `${CANONICAL_ORIGIN}/social-preview.png`;
const APP_STORE_URL = "https://apps.apple.com/app/equation-genius/id1475407618";
const CACHE_CONTROL = "public, max-age=3600, s-maxage=604800, stale-while-revalidate=86400";

export default {
  async fetch(request, env, context) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return response("Method Not Allowed", 405, {
        Allow: "GET, HEAD",
        "Content-Type": "text/plain; charset=utf-8",
      });
    }

    const parsed = parseShareURL(new URL(request.url));
    if (!parsed.ok) {
      return response(parsed.status === 400 ? "Bad Request" : "Not Found", parsed.status, {
        "Content-Type": "text/plain; charset=utf-8",
      });
    }

    const cache = caches.default;
    const cacheKey = new Request(parsed.canonicalURL, { method: "GET" });
    let page = await cache.match(cacheKey);

    if (!page) {
      page = response(renderSharePage(parsed), 200, {
        "Cache-Control": CACHE_CONTROL,
        "Content-Type": "text/html; charset=utf-8",
      });
      context.waitUntil(cache.put(cacheKey, page.clone()));
    }

    if (request.method === "HEAD") {
      return new Response(null, { status: page.status, headers: page.headers });
    }
    return page;
  },
};

export function parseShareURL(url) {
  if (url.protocol !== "https:" || url.hostname !== "equation-genius.com" || url.port !== "") {
    return { ok: false, status: 404 };
  }

  const challengeMatch = url.pathname.match(/^\/challenge\/([^/]+)\/?$/);
  if (challengeMatch) {
    const challengeID = challengeMatch[1];
    if (!isValidUTCDateID(challengeID)) {
      return { ok: false, status: 404 };
    }

    const timeValues = url.searchParams.getAll("time");
    if (timeValues.length > 1) {
      return { ok: false, status: 400 };
    }

    let normalizedTime = null;
    if (timeValues.length === 1) {
      normalizedTime = normalizeSenderTime(timeValues[0]);
      if (normalizedTime === null) {
        return { ok: false, status: 400 };
      }
    }

    const canonicalURL = new URL(`${CANONICAL_ORIGIN}/challenge/${challengeID}`);
    if (normalizedTime !== null) {
      canonicalURL.searchParams.set("time", normalizedTime);
    }
    return {
      ok: true,
      kind: "challenge",
      canonicalURL: canonicalURL.toString(),
      title: "Equation Genius Daily Challenge",
      description: "Can you beat the challenge?",
      eyebrow: "Daily Challenge",
      message: "You've been invited to an Equation Genius challenge.",
    };
  }

  const puzzleMatch = url.pathname.match(/^\/puzzle\/([^/]+)\/?$/);
  if (puzzleMatch) {
    const puzzleID = puzzleMatch[1];
    if (!isValidPuzzleID(puzzleID)) {
      return { ok: false, status: 404 };
    }
    return {
      ok: true,
      kind: "puzzle",
      canonicalURL: `${CANONICAL_ORIGIN}/puzzle/${puzzleID}`,
      title: "Can you solve this puzzle?",
      description: "Try the puzzle in Equation Genius.",
      eyebrow: "Shared Puzzle",
      message: "Can you solve this Equation Genius puzzle?",
    };
  }

  return { ok: false, status: 404 };
}

export function isValidUTCDateID(value) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 2000 || year > 9999) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

export function isValidPuzzleID(value) {
  const match = value.match(/^p(\d+)-l(\d+)-s(\d+)$/);
  if (!match) return false;

  const version = Number(match[1]);
  const level = Number(match[2]);
  const seed = Number(match[3]);
  return version === 1 &&
    level >= 3 && level <= 12 &&
    seed >= 1 && seed <= 2_000_000_999 &&
    value === `p${version}-l${level}-s${seed}`;
}

export function normalizeSenderTime(value) {
  if (!/^(?:0|[1-9]\d{0,4})(?:\.\d{1,6})?$/.test(value)) return null;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds >= 86_400) return null;

  const normalized = Math.round(seconds * 100) / 100;
  if (normalized <= 0 || normalized >= 86_400) return null;
  return normalized.toFixed(2);
}

function renderSharePage(page) {
  const canonicalURL = escapeHTML(page.canonicalURL);
  const title = escapeHTML(page.title);
  const description = escapeHTML(page.description);
  const eyebrow = escapeHTML(page.eyebrow);
  const message = escapeHTML(page.message);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <meta name="theme-color" content="#0d4f63">
  <meta name="description" content="${description}">
  <link rel="canonical" href="${canonicalURL}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Equation Genius">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${canonicalURL}">
  <meta property="og:image" content="${SOCIAL_IMAGE_URL}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${SOCIAL_IMAGE_URL}">
  <title>${title}</title>
  <style>
    :root { color-scheme: dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #07384a; color: #fff; }
    * { box-sizing: border-box; }
    body { min-height: 100svh; margin: 0; display: grid; place-items: center; padding: 32px 20px; background: linear-gradient(180deg, #07384a 0%, #0d6371 100%); }
    main { width: min(100%, 460px); text-align: center; }
    .icon { width: 104px; height: 104px; border-radius: 23px; box-shadow: 0 12px 30px rgba(0,0,0,.24); }
    h1 { margin: 24px 0 10px; font-size: clamp(30px, 8vw, 42px); line-height: 1.05; }
    .eyebrow { margin: 0 0 18px; color: #ffd15a; font-size: 15px; font-weight: 800; text-transform: uppercase; }
    .message { margin: 0 auto; max-width: 34ch; color: rgba(255,255,255,.88); font-size: 19px; line-height: 1.45; }
    .availability { margin: 12px 0 26px; color: rgba(255,255,255,.68); font-size: 15px; }
    .store-link { display: inline-flex; align-items: center; justify-content: center; min-height: 56px; padding: 0 24px; border-radius: 8px; background: #fff; color: #082f3e; font-size: 17px; font-weight: 750; text-decoration: none; box-shadow: 0 8px 22px rgba(0,0,0,.2); }
    .store-link:focus-visible { outline: 3px solid #ffd15a; outline-offset: 4px; }
  </style>
</head>
<body>
  <main>
    <img class="icon" src="/app-icon.png" alt="Equation Genius app icon" width="104" height="104">
    <h1>Equation Genius</h1>
    <p class="eyebrow">${eyebrow}</p>
    <p class="message">${message}</p>
    <p class="availability">Equation Genius is currently available for iPhone and iPad.</p>
    <a class="store-link" href="${APP_STORE_URL}">Get or Update Equation Genius</a>
  </main>
</body>
</html>`;
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character]);
}

function response(body, status, extraHeaders) {
  return new Response(body, {
    status,
    headers: {
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      ...extraHeaders,
    },
  });
}
