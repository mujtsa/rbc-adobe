/**
 * Create an element.
 * @param {string} tag the tag for the element
 * @param {object} [props] attributes to apply; `class` accepts a string or an array
 * @param {string|Node|Array<string|Node>} [children] text or nodes to append
 * @returns {Element} the element
 */
export function createElement(tag, props, children) {
  const elem = document.createElement(tag);

  if (props) {
    Object.entries(props).forEach(([name, value]) => {
      if (value === undefined || value === null) return;
      if (name === 'class') {
        const names = Array.isArray(value) ? value : String(value).split(' ');
        elem.classList.add(...names.filter(Boolean));
      } else {
        elem.setAttribute(name, value);
      }
    });
  }

  if (children !== undefined && children !== null) {
    // append() adds strings as text, so this helper can never become an injection point
    [].concat(children)
      .filter((child) => child !== undefined && child !== null && child !== '')
      .forEach((child) => elem.append(child));
  }

  return elem;
}

export default createElement;

// ---------------------------------------------------------------------------
// HTML escaping
// ---------------------------------------------------------------------------

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// ---------------------------------------------------------------------------
// URL validation and normalisation
// ---------------------------------------------------------------------------

// Strictly same-origin. Use for internal navigation: product pages, index paths, fragment paths.
export function isSameOriginUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return url.startsWith('/') || url.startsWith('#');
  }
}

// Same-origin OR an RBC-controlled domain over HTTPS.
// Trust boundary: *.rbc.com, *.rbcroyalbank.com, *.royalbank.com (and bare apex forms).
// Use for apply/offer/highlight URLs that may live on a separate RBC subdomain.
// Deliberately excludes http: and non-RBC third-party domains.
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

// Validates then returns the canonical absolute URL, or '' when the URL fails validation.
// Pass requireSameOrigin = true for links that must stay on this origin (productPage, index paths).
// Pass requireSameOrigin = false (default) for apply/offer URLs that may be external HTTPS.
export function resolveUrl(url, requireSameOrigin = false) {
  const valid = requireSameOrigin ? isSameOriginUrl(url) : isSafeUrl(url);
  if (!valid) return '';
  try {
    return new URL(url, window.location.href).href;
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------------------
// HTML sanitisation — allowlist-based node walker
// ---------------------------------------------------------------------------

// Elements whose wrapper is preserved. Unlisted elements have their tag stripped
// but their text/child content kept.
// Tightened to elements confirmed used by RBC EDS blocks (audit: 2026-10-05).
// Structural fragments (header/footer/section/nav/main) are kept because fragment.js
// fetches arbitrary page sections. Form controls kept: account-selector, account-filter,
// savings-calculator, branch-finder all use them.
const ALLOWED_TAGS = new Set([
  'a', 'b', 'br', 'button',
  'caption', 'col', 'colgroup', 'dd', 'details', 'dialog', 'div', 'dl', 'dt',
  'em', 'fieldset', 'footer', 'form',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'i',
  'img', 'input', 'label', 'legend', 'li',
  'main', 'nav', 'ol', 'optgroup', 'option',
  'p', 'picture', 'section', 'select', 'source', 'span', 'strong',
  'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'textarea', 'tfoot', 'th',
  'thead', 'tr', 'ul',
]);

const TAG_ATTRS = {
  a: ['href', 'hreflang', 'download', 'type'],
  button: ['type', 'name', 'value', 'disabled', 'form'],
  col: ['span'],
  colgroup: ['span'],
  details: ['open'],
  dialog: ['open'],
  form: ['action', 'method', 'enctype', 'novalidate', 'autocomplete'],
  img: ['src', 'srcset', 'alt', 'width', 'height', 'loading', 'decoding', 'sizes'],
  input: ['type', 'name', 'value', 'min', 'max', 'step', 'placeholder', 'required',
    'checked', 'disabled', 'readonly', 'autocomplete', 'minlength', 'maxlength',
    'pattern', 'multiple', 'accept'],
  label: ['for'],
  option: ['value', 'selected', 'disabled', 'label'],
  optgroup: ['label', 'disabled'],
  select: ['name', 'required', 'disabled', 'multiple', 'size', 'autocomplete'],
  source: ['src', 'srcset', 'media', 'type', 'sizes'],
  td: ['colspan', 'rowspan'],
  textarea: ['name', 'rows', 'cols', 'required', 'disabled', 'readonly',
    'placeholder', 'minlength', 'maxlength', 'autocomplete'],
  th: ['colspan', 'rowspan', 'scope'],
};

// style excluded: EDS blocks apply CSS via classes; inline style risks CSS-based data exfil.
const GLOBAL_ATTRS = new Set([
  'class', 'id', 'lang', 'dir', 'title', 'tabindex', 'hidden', 'role', 'slot',
]);

// Single-URL attributes validated with isSafeUrl (same-origin or RBC HTTPS).
const URL_ATTRS = new Set(['href', 'src', 'poster']);

// form action/formaction must be same-origin — all RBC EDS forms submit internally.
const SAME_ORIGIN_URL_ATTRS = new Set(['action', 'formaction']);

function sanitizeNode(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.cloneNode();
  if (node.nodeType !== Node.ELEMENT_NODE) return null;

  const tag = node.tagName.toLowerCase();
  const sanitizedChildren = [...node.childNodes].map(sanitizeNode).filter(Boolean);

  if (!ALLOWED_TAGS.has(tag)) {
    // strip the element but preserve its content
    const frag = document.createDocumentFragment();
    sanitizedChildren.forEach((c) => frag.append(c));
    return frag;
  }

  const el = document.createElement(tag);
  const permitted = new Set([...GLOBAL_ATTRS, ...(TAG_ATTRS[tag] || [])]);

  [...node.attributes].forEach(({ name, value }) => {
    // aria-* and data-* are non-executable; always allow. (Values are strings, not URLs.)
    if (/^(aria|data)-/.test(name)) { el.setAttribute(name, value); return; }
    if (name === 'target' || name === 'rel') return; // handled together below
    if (!permitted.has(name)) return;
    if (URL_ATTRS.has(name) && !isSafeUrl(value)) return;
    if (SAME_ORIGIN_URL_ATTRS.has(name) && !isSameOriginUrl(value)) return;
    // srcset is a space-separated list of "url descriptor" pairs; validate each URL.
    if (name === 'srcset') {
      const safeSet = value.split(',').filter((part) => isSafeUrl(part.trim().split(/\s+/)[0]));
      if (safeSet.length) el.setAttribute(name, safeSet.join(','));
      return;
    }
    el.setAttribute(name, value);
  });

  // target + rel handled together to guarantee noopener on _blank links
  if (tag === 'a') {
    const target = node.getAttribute('target');
    if (target === '_blank' || target === '_self') el.setAttribute('target', target);
    const rels = new Set((node.getAttribute('rel') || '').split(/\s+/).filter(Boolean));
    if (el.getAttribute('target') === '_blank') { rels.add('noopener'); rels.add('noreferrer'); }
    if (rels.size) el.setAttribute('rel', [...rels].join(' '));
  }

  sanitizedChildren.forEach((c) => el.append(c));
  return el;
}

// Parses html, walks the DOM through an allowlist, and returns a DocumentFragment
// safe to append directly to the page. No innerHTML is set on any live element.
export function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const frag = document.createDocumentFragment();
  [...doc.body.childNodes].map(sanitizeNode).filter(Boolean).forEach((n) => frag.append(n));
  return frag;
}

// calls back with true when the element reaches the top of the viewport, false once it is below
export function watchStuck(element, callback) {
  let stuck = null;
  const check = () => {
    const rect = element.getBoundingClientRect();
    if (!rect.width && !rect.height) return;
    const next = rect.top <= 0;
    if (next !== stuck) {
      stuck = next;
      callback(stuck);
    }
  };
  ['scroll', 'resize', 'hashchange'].forEach((type) => window.addEventListener(type, check, { passive: true }));
  check();
}
