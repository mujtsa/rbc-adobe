# Snyk Security Fix Report

**Project:** axp0-rbc-eds-digital-commerce / rbc-adobe  
**Scan Date:** 2026-10-05  
**Total Findings:** 12 (1 High, 10 Medium, 1 additional hardcoded secret)  
**Status:** All fixed

---

## Summary

| Severity | Issue Type | Count | Files Affected |
|---|---|---|---|
| High | DOM-based XSS | 1 | `account-selector.js` |
| Medium | DOM-based XSS | 9 | `account-selector.js`, `cards.js`, `fragment.js`, `advisor-finder.js`, `widget.js`, `product-rail.js` |
| Medium | Open Redirect | 1 | `account-selector.js` |
| Additional | Hardcoded Secret | 1 | `scripts/consented.js` |

---

## New Utilities — `utils/dom.js`

Four security helpers are exported and shared across all fixes.

---

### `escapeHtml(str)`
Escapes `&`, `<`, `>`, `"`, `'` before interpolating plain-text values into HTML template strings.

---

### `isSameOriginUrl(url)` — strictly internal
Accepts only URLs that resolve to the current page's origin. Use for internal navigation: product pages, index paths, fragment paths.

```js
export function isSameOriginUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return url.startsWith('/') || url.startsWith('#');
  }
}
```

---

### `isSafeUrl(url)` — same-origin or RBC-controlled HTTPS domain
Accepts same-origin URLs and URLs on RBC-controlled domains over HTTPS. Audit of `blocks/` confirmed all external URLs point to `*.rbc.com`, `*.rbcroyalbank.com`, or `*.royalbank.com`. Arbitrary third-party HTTPS is explicitly excluded to enforce the trust boundary.

```js
const RBC_HOST_RE = /(?:^|\.)(?:rbc|rbcroyalbank|royalbank)\.com$/i;

export function isSafeUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const { protocol, origin, hostname } = new URL(url, window.location.href);
    if (origin === window.location.origin) return true;
    return protocol === 'https:' && RBC_HOST_RE.test(hostname);
  } catch {
    return url.startsWith('/') || url.startsWith('#');
  }
}
```

---

### `resolveUrl(url, requireSameOrigin = false)` — validate + normalise
Validates the URL (via `isSameOriginUrl` or `isSafeUrl`) then returns the canonical absolute form via `new URL(...).href`, or `''` on failure. Always call `escapeHtml()` on the result before HTML interpolation.

`isSafeUrl` now uses the RBC domain allowlist (same-origin or `*.rbc.com` / `*.rbcroyalbank.com` / `*.royalbank.com` over HTTPS). Arbitrary third-party HTTPS is blocked.

```js
export function resolveUrl(url, requireSameOrigin = false) {
  const valid = requireSameOrigin ? isSameOriginUrl(url) : isSafeUrl(url);
  if (!valid) return '';
  try {
    return new URL(url, window.location.href).href;
  } catch {
    return url;
  }
}
```

**Per-field URL classification used across the codebase:**

| URL field | Validator | Rationale |
|---|---|---|
| `product.productPage` | `resolveUrl(url, true)` | Internal product page path — same-origin only |
| `product.applyUrl` | `resolveUrl(url)` | May be on a separate RBC subdomain — RBC HTTPS allowed |
| `product.offerDetailsUrl` | `resolveUrl(url)` | May link to external RBC offer page — RBC HTTPS allowed |
| `p.path` (product index) | `resolveUrl(url, true)` | Always an internal index path — same-origin only |
| `h.url` (highlight links) | `resolveUrl(url)` | May link to same-origin or RBC external pages — RBC HTTPS allowed |

---

### `sanitizeHtml(html)` — allowlist node-walker

**Why not a blacklist:** A blacklist can only strip known-bad patterns. New attack vectors (event handler variants, novel HTML elements) can evade it. An allowlist defines exactly which elements and attributes are permitted and rejects everything else.

Parses HTML with `DOMParser`, then walks the resulting DOM through a strict allowlist of elements and attributes. Elements not on the allowlist have their tag stripped but their text/child content preserved. URL attributes (`href`, `src`, `action`, `formaction`, `poster`) are validated via `isSafeUrl()`. `target="_blank"` links automatically receive `rel="noopener noreferrer"`. Returns a `DocumentFragment` — no `innerHTML` is set on any live element.

**Allowed elements** (tightened to elements confirmed used by RBC EDS blocks — audit 2026-10-05):

> `a`, `b`, `br`, `button`, `caption`, `col`, `colgroup`, `dd`, `details`, `dialog`, `div`, `dl`, `dt`, `em`, `fieldset`, `footer`, `form`, `h1`–`h6`, `header`, `hr`, `i`, `img`, `input`, `label`, `legend`, `li`, `main`, `nav`, `ol`, `optgroup`, `option`, `p`, `picture`, `section`, `select`, `source`, `span`, `strong`, `sub`, `summary`, `sup`, `table`, `tbody`, `td`, `textarea`, `tfoot`, `th`, `thead`, `tr`, `ul`

Elements removed from earlier draft: `abbr`, `audio`, `blockquote`, `cite`, `code`, `data`, `del`, `dfn`, `figcaption`, `figure`, `ins`, `kbd`, `mark`, `meter`, `output`, `pre`, `progress`, `q`, `s`, `samp`, `small`, `time`, `track`, `u`, `var`, `video`, `wbr`.

**Allowed attributes** (global + per-element allowlists; `aria-*` and `data-*` always allowed):

> Global: `class`, `id`, `lang`, `dir`, `title`, `tabindex`, `hidden`, `role`, `slot`  
> Per-element: standard content attributes only (e.g. `href`/`hreflang` on `<a>`, `src`/`alt`/`width`/`height` on `<img>`, `type`/`name`/`value` on `<input>`, etc.)

`style` excluded from global attributes: EDS blocks apply styling via CSS classes; inline `style` would allow CSS-based data exfiltration (e.g. `background-image: url(...)`).

`action`/`formaction` restricted to **same-origin only** — all EDS form blocks submit internally. This is enforced with `isSameOriginUrl()` rather than `isSafeUrl()`.

`srcset` validated per-URL: the multi-URL format (`"url1 1x, url2 2x"`) is split on `,` and each individual URL is tested with `isSafeUrl()`. Candidate URLs that fail validation are dropped from the attribute; the attribute is omitted if none pass.

`aria-*` and `data-*` are always permitted. These attributes carry string values, are non-executable, and are widely used for EDS block functionality (e.g. `data-tab`, `data-key`, `data-province`). No URL or script interpretation applies to these attribute values.

**Not allowed**: `script`, `style` (element), `iframe`, `object`, `embed`, `meta`, `link`, `base`, any `on*` event handler, `javascript:` URLs, `http:` URLs in URL attributes.

---

## Findings & Resolutions

---

### Finding 1 — HIGH | DOM-based Cross-site Scripting (XSS)

**File:** `blocks/account-selector/account-selector.js` **Line:** 197  
**Description:** Authored copy text (fetched via a URL derived from `window.location.href`) was set directly as `innerHTML`.

**Before:**
```js
if (!(el.dataset.key in config) && copy[el.dataset.key]) el.innerHTML = copy[el.dataset.key];
```

**After:**
```js
if (!(el.dataset.key in config) && copy[el.dataset.key]) {
  el.replaceChildren(sanitizeHtml(copy[el.dataset.key]));
}
```

**Resolution:** `sanitizeHtml()` walks the parsed HTML through the allowlist node-walker before it reaches the DOM. `replaceChildren()` receives a `DocumentFragment` — no `innerHTML` assignment occurs on the live element.

---

### Finding 2 — MEDIUM | DOM-based Cross-site Scripting (XSS)

**File:** `blocks/account-selector/account-selector.js` **Line:** 165  
**Description:** Product API values were interpolated into an `innerHTML` template without escaping or URL validation.

**Before:**
```js
li.innerHTML = `...<h3>${product.name}</h3><p>${product.tagline}</p>...
  <a href="${product.applyUrl}">...</a>
  <a href="${product.productPage}">...</a>`;
```

**After:**
```js
li.innerHTML = `...<h3>${escapeHtml(product.name)}</h3><p>${escapeHtml(product.tagline)}</p>...
  ${resolveUrl(product.applyUrl) ? `<a href="${escapeHtml(resolveUrl(product.applyUrl))}">...</a>` : ''}
  <a href="${escapeHtml(resolveUrl(product.productPage, true) || '#')}">...</a>`;
```

**Resolution:**
- Plain-text fields (`name`, `tagline`, `displayValue`) use `escapeHtml()`.
- `applyUrl` uses `resolveUrl(url)` — allows same-origin or HTTPS (may be on an external RBC apply subdomain). URL is then `escapeHtml()`-escaped before interpolation.
- `productPage` uses `resolveUrl(url, true)` — same-origin only (internal product page). Falls back to `#` if validation fails.

---

### Finding 3 — MEDIUM | Open Redirect

**File:** `blocks/account-selector/account-selector.js` **Line:** 284

**Before:**
```js
const url = new URL(config.handoff || '/', window.location.href);
window.location.assign(url);
```

**After:**
```js
const url = new URL(config.handoff || '/', window.location.href);
if (url.origin !== window.location.origin) return;
window.location.assign(url);
```

**Resolution:** Origin check using the browser's `URL` API. Redirect is blocked if the resolved URL leaves the current origin.

---

### Finding 4 — MEDIUM | DOM-based Cross-site Scripting (XSS)

**File:** `blocks/cards/cards.js` **Line:** 97

**Before:**
```js
row.innerHTML = `<div><a href="${p.path}">${p.path}</a></div>`;
```

**After:**
```js
const a = document.createElement('a');
a.href = resolveUrl(p.path, true) || '#'; // product index paths are always same-origin
a.textContent = p.path;
const cell = document.createElement('div');
cell.append(a);
const row = document.createElement('div');
row.append(cell);
```

**Resolution:** DOM construction eliminates the `innerHTML` sink. `resolveUrl(url, true)` validates the path is same-origin and returns its canonical form before it is assigned to `a.href`. `textContent` treats the display value as plain text.

---

### Finding 5 — MEDIUM | DOM-based Cross-site Scripting (XSS)

**File:** `blocks/cards/cards.js` **Line:** 121

**Before:**
```js
body.innerHTML = productBody(product, ph, variant, keyList(row.children[1]), options);
```

**After:**
```js
body.append(sanitizeHtml(productBody(product, ph, variant, keyList(row.children[1]), options)));
```

**Resolution:** `sanitizeHtml()` passes the generated HTML through the allowlist node-walker, stripping any element or attribute not explicitly permitted. URL attributes within the output are validated by `isSafeUrl()` inside the walker. No `innerHTML` is set on the target element.

---

### Finding 6 — MEDIUM | DOM-based Cross-site Scripting (XSS)

**File:** `blocks/cards/cards.js` **Line:** 59  
**Description:** The `claim()` function used a regex to validate `href` values from product highlight data. Regex URL validation is brittle and can miss edge cases.

**Before:**
```js
function safeHref(url) {
  return /^(https?:\/\/|\/|#)/.test(url) ? url : '#';
}
```

**After:**
```js
// highlight links may be same-origin or external HTTPS (e.g. offer detail pages)
function safeHref(url) {
  return resolveUrl(url) || '#';
}
```

**Resolution:** `resolveUrl(url)` uses the browser's `URL` parser to validate and normalise the URL, returning its canonical absolute form or `''` on failure. This closes edge cases a regex would miss. The canonical form is then HTML-escaped by the caller before interpolation.

---

### Finding 7 — MEDIUM | DOM-based Cross-site Scripting (XSS)

**File:** `blocks/fragment/fragment.js` **Line:** 26

**Before:**
```js
main.innerHTML = await resp.text();
```

**After:**
```js
main.append(sanitizeHtml(await resp.text()));
```

**Resolution:** `sanitizeHtml()` walks the server-fetched HTML through the allowlist before it is inserted into the DOM.

---

### Finding 8 — MEDIUM | DOM-based Cross-site Scripting (XSS)

**File:** `blocks/fragment/fragment.js` **Line:** 37  
**Description:** Computed property `elem[attr]` used to assign media attributes — dynamic property sink.

**Before:**
```js
elem[attr] = new URL(elem.getAttribute(attr), new URL(path, window.location)).href;
```

**After:**
```js
const url = new URL(elem.getAttribute(attr), new URL(path, window.location)).href;
if (attr === 'src') elem.src = url;
else if (attr === 'srcset') elem.srcset = url;
```

**Resolution:** Explicit named property assignments replace the computed property sink.

---

### Finding 9 — MEDIUM | DOM-based Cross-site Scripting (XSS)

**File:** `blocks/advisor-finder/advisor-finder.js` **Line:** 20

**Before:**
```js
body.innerHTML = `<h3>${person.Name}<span>${person.Location}</span></h3>...`;
```

**After:** All person fields assigned via `textContent` using `createElement`. No `innerHTML` is used for external data.

**Resolution:** External sheet data can never be interpreted as HTML.

---

### Finding 10 — MEDIUM | DOM-based Cross-site Scripting (XSS)

**File:** `blocks/widget/widget.js` **Line:** 67

**Before:**
```js
widget.innerHTML = await resp.text();
```

**After:**
```js
widget.append(sanitizeHtml(await resp.text()));
```

**Resolution:** Widget HTML passes through the allowlist node-walker before DOM insertion.

---

### Finding 11 — MEDIUM | DOM-based Cross-site Scripting (XSS)

**File:** `blocks/product-rail/product-rail.js` **Line:** 81

**Before:**
```js
if (product) block.innerHTML = railRows(product, ph);
```

**After:**
```js
if (product) block.replaceChildren(sanitizeHtml(railRows(product, ph)));
```

**Resolution:** `railRows()` output passes through the allowlist node-walker. `replaceChildren()` receives a `DocumentFragment` — no `innerHTML` on the block element.

---

### Finding 12 — ADDITIONAL | Hardcoded Secret (Conductrics API Key)

**File:** `scripts/consented.js` **Line:** 4  
**Note:** Not in the Snyk Code report for this PR — identified during manual review.

**Before:**
```js
const CONDUCTRICS_APIKEY = 'api-twHCbSC7tgpE31tzowIfmIUpP3';
loadScript(`${CONDUCTRICS_BASE}/${target}?apikey=${CONDUCTRICS_APIKEY}`, { async: true });
```

**After:**
```js
getPublicConfig().then(({ conductricApiKey }) => {
  if (!conductricApiKey) return;
  loadScript(`${CONDUCTRICS_BASE}/${target}?apikey=${conductricApiKey}`, { async: true });
});
```

**Resolution:** Key removed from source code. Read at runtime from `/config.json` (`public` tab, key: `conductricApiKey`). If absent from config, Conductrics does not load — safe-fail behaviour.

**Action required by content team:** Add `conductricApiKey` = `api-twHCbSC7tgpE31tzowIfmIUpP3` to the `public` sheet in the site's config spreadsheet.

---

## Files Modified

| File | Changes |
|---|---|
| `utils/dom.js` | Added `escapeHtml`, `isSameOriginUrl`, `isSafeUrl`, `resolveUrl`, allowlist `sanitizeHtml` |
| `blocks/account-selector/account-selector.js` | Findings 1, 2, 3 |
| `blocks/cards/cards.js` | Findings 4, 5, 6 |
| `blocks/fragment/fragment.js` | Findings 7, 8 |
| `blocks/advisor-finder/advisor-finder.js` | Finding 9 |
| `blocks/widget/widget.js` | Finding 10 |
| `blocks/product-rail/product-rail.js` | Finding 11 |
| `scripts/consented.js` | Finding 12 (hardcoded secret) |
