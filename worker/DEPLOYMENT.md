# Equation Genius website Worker deployment

The Worker is stateless and handles the two public share-route families plus one
exact App Store redirect route. It requires no secrets, KV, D1, or database.
The `APP_STORE_CLICKS` Analytics Engine binding stores aggregate click counters.

## Before deployment

1. Publish the website repository's updated
   `.well-known/apple-app-site-association`. Confirm it authorizes both
   `/challenge/*` and `/puzzle/*` under
   `WX97LBC882.com.jojoapps.emath`.
2. Confirm the endpoint returns HTTP 200 without a redirect:

   ```sh
   curl -i https://equation-genius.com/.well-known/apple-app-site-association
   ```

3. In Cloudflare DNS, keep the existing apex record values but change the
   records for `equation-genius.com` from **DNS only** to **Proxied**. Do not
   change the GitHub Pages custom domain or origin addresses.
4. In Cloudflare SSL/TLS, retain working end-to-end HTTPS. Prefer **Full
   (strict)** when Cloudflare validates GitHub Pages' certificate for the
   custom hostname.

Enabling the proxy changes the CDN/TLS path for the whole hostname. Verify the
home page, privacy page, image assets, and AASA immediately after this step.

## Deploy

From this directory:

```sh
npm install
npm test
npx wrangler login
npm run deploy
```

`wrangler.toml` attaches exactly these zone routes:

- `equation-genius.com/go/app-store*` (the Worker itself accepts only the exact path)
- `equation-genius.com/challenge/*`
- `equation-genius.com/puzzle/*`

Do not replace them with `equation-genius.com/*`. In particular,
`/.well-known/apple-app-site-association` must continue to reach GitHub Pages.

The App Store route has a hard-coded destination and accepts only coarse,
allowlisted dimensions. It records neither IP addresses, cookies, raw referrers,
nor user identifiers. Requests without a same-origin `Referer`, including direct
bot requests, still redirect but are not counted. If Analytics Engine is
unavailable, the redirect continues to work.

The binding creates the `equation_genius_app_store_clicks` dataset when it first
writes a data point. Its fields are:

- `blob1`: button placement (`homepage_top` or `homepage_bottom`)
- `blob2`: coarse referrer category
- `double1`: click count (`1`)
- `index1`: fixed event family (`app_store_click`)

An example aggregate query for the last 30 days is:

```sql
SELECT
  blob1 AS placement,
  blob2 AS referrer,
  SUM(_sample_interval * double1) AS clicks
FROM equation_genius_app_store_clicks
WHERE timestamp >= NOW() - INTERVAL '30' DAY
GROUP BY placement, referrer
ORDER BY clicks DESC
```

In the Cloudflare dashboard, configure the exact `/go/app-store` route to fail
open so the checked-in static page at `/go/app-store/` can still forward users
if the Worker is unavailable or exceeds its plan limit. Also apply a rate-limit
rule scoped only to `/go/app-store`, using a conservative per-IP threshold
available on the account's plan. Rate limiting is a dashboard control rather
than application code and should be verified after deployment.

The `/challenge/*` and `/puzzle/*` routes remain protected by exact host and
HTTPS checks, GET/HEAD-only handling, strict challenge-date and puzzle-ID
validation, bounded sender-time parsing, generic no-answer metadata, `noindex`,
a restrictive Content Security Policy, `Referrer-Policy: no-referrer`, MIME
sniffing prevention, and frame denial.

## Immediate verification

Use fresh, valid identifiers and inspect the initial response body, not a
browser-rendered DOM:

```sh
curl -i 'https://equation-genius.com/challenge/2026-08-16?time=17.48'
curl -i 'https://equation-genius.com/puzzle/p1-l10-s42'
curl -i 'https://equation-genius.com/challenge/2026-02-30'
curl -i 'https://equation-genius.com/puzzle/p1-l010-s42'
curl -I 'https://equation-genius.com/go/app-store?placement=homepage_top&referrer=direct'
```

The first two must return HTTP 200 with their exact canonical `og:url`, the
generic `social-preview.png`, and the appropriate Open Graph/Twitter copy.
Malformed routes must return 400 or 404. Recheck AASA and Universal Link opens
on a physical device after any proxy or AASA change; Apple caches association
files, so propagation may not be immediate on previously installed devices.
The App Store request must return HTTP 302 to the fixed Apple URL with
`Cache-Control: private, no-store, max-age=0`.
