# Equation Genius share Worker deployment

The Worker is stateless and handles only the two public share-route families.
It requires no secrets, bindings, KV, D1, database, or paid service.

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

- `equation-genius.com/challenge/*`
- `equation-genius.com/puzzle/*`

Do not replace them with `equation-genius.com/*`. In particular,
`/.well-known/apple-app-site-association` must continue to reach GitHub Pages.

## Immediate verification

Use fresh, valid identifiers and inspect the initial response body, not a
browser-rendered DOM:

```sh
curl -i 'https://equation-genius.com/challenge/2026-08-16?time=17.48'
curl -i 'https://equation-genius.com/puzzle/p1-l10-s42'
curl -i 'https://equation-genius.com/challenge/2026-02-30'
curl -i 'https://equation-genius.com/puzzle/p1-l010-s42'
```

The first two must return HTTP 200 with their exact canonical `og:url`, the
generic `social-preview.png`, and the appropriate Open Graph/Twitter copy.
Malformed routes must return 400 or 404. Recheck AASA and Universal Link opens
on a physical device after any proxy or AASA change; Apple caches association
files, so propagation may not be immediate on previously installed devices.
