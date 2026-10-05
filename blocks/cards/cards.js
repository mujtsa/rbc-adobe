import {
  createOptimizedPicture, readBlockConfig, toCamelCase, toClassName,
} from '../../scripts/aem.js';
import { escapeHtml, sanitizeHtml, resolveUrl } from '../../utils/dom.js';
import decorateTile, { tileWords } from './tiles.js';
import {
  getProduct, getProducts, monthlyFees, pickHighlights, keyList, offerLegalPage, isPrice, zeroPrice,
} from '../../utils/products.js';
import fetchLocalPlaceholders from '../../utils/placeholders.js';
import { rateSpan } from '../../utils/rates.js';
import {
  footnoteSup, expandRefs, stripRefs, refIds, resolveRefLinks,
} from '../../utils/footnotes.js';

function button(text, href, kind) {
  return `<p class="button-wrapper"><a class="button ${kind}" href="${escapeHtml(href)}">${text}</a></p>`;
}

// highlight links may be same-origin or external HTTPS (e.g. offer detail pages)
function safeHref(url) {
  return resolveUrl(url) || '#';
}

function claim(text, href, page) {
  if (!href) return expandRefs(text, page);
  const safe = safeHref(href);
  const end = text.lastIndexOf(']]');
  if (end < 0) return `<a href="${safe}">${escapeHtml(text)}</a>`;
  const [, lead, tail] = text.slice(end + 2).match(/^([^\w$]*)([\s\S]*)$/);
  if (!tail) return `<a href="${safe}">${stripRefs(text)}</a>${footnoteSup(refIds(text), page)}`;
  return `${expandRefs(text.slice(0, end + 2), page)}${lead}<a href="${safe}">${escapeHtml(tail)}</a>`;
}

function offerLink(product, text) {
  const href = resolveUrl(product.offerDetailsUrl); // offer pages may be external HTTPS
  return href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${text}</a>` : text;
}

function priceLine(product, ph) {
  const {
    regular, rebate, regularFootnotes, rebateFootnotes,
  } = monthlyFees(product);
  if (!regular) return '';
  const per = (value) => (isPrice(value) ? ph.perMonth || '/mo' : '');
  const sup = (value) => footnoteSup(value, product.productPage);
  const price = product.fees[0]?.amount === 0 && !isPrice(regular) ? zeroPrice() : regular;
  const amount = (value, footnotes) => `<span class="cards-product-amount"><strong>${value}</strong>${per(value)}${sup(footnotes)}</span>`;
  if (!rebate) return `<p class="cards-product-price">${amount(price, regularFootnotes)}</p>`;
  return `<p class="cards-product-price cards-product-price-split">${amount(price, regularFootnotes)}
    <em class="cards-product-or">${ph.or || 'or'}</em>
    <span class="cards-product-rebate">${amount(rebate, rebateFootnotes)}
    <span class="cards-product-rebate-label">${ph.withTheValueProgram || 'with the Value Program'}</span></span></p>`;
}

function cardLabel(product, ph, label) {
  if (label === 'none') return '';
  const type = label === 'type' && ph[toCamelCase(`category-${product.category}`)];
  return `<p>${type || product.categoryLabel}</p>`;
}

function productBody(product, ph, variant, keys = [], options = {}) {
  const page = product.productPage;
  const cta = options.cta || ph.openAccount || 'Open Account';
  const sup = (value) => footnoteSup(value, page);
  const showRate = product.rateFallbackValue && (!keys.length || keys.includes('rate'));
  const rate = showRate
    ? `<li>${expandRefs(product.rateLabel, page)}: ${product.rateRateCode ? rateSpan(product.rateRateCode, product.rateFallbackValue) : product.rateFallbackValue}</li>` : '';
  const highlights = pickHighlights(product, keys.filter((k) => k !== 'rate'))
    .map((h) => `<li>${claim(h.text, h.url, page)}</li>`).join('') + rate;
  const note = product.note ? `<p>${expandRefs(product.note, page)}</p>` : '';
  const [fee] = product.fees;
  const feeSup = sup(fee?.footnotes);
  if (variant === 'compact') {
    return `<h3>${product.name}</h3><p class="cards-product-price">${fee?.label || ''} <span class="cards-product-amount"><strong>${fee?.displayValue || ''}</strong>${feeSup}</span></p>
      <p class="link-wrapper"><a href="${product.productPage}">${ph.viewAccount || 'View Account'}</a></p>`;
  }
  if (variant === 'picture') {
    return `${cardLabel(product, ph, options.label)}<h3><a href="${product.productPage}">${product.name}</a></h3>
      <p>${ph.monthlyFee || 'Monthly Fee'}: ${fee?.displayValue || ''}${feeSup}</p>${note}<ul>${highlights}</ul>
      <p class="button-wrapper"><a class="button primary" href="${product.productPage}">${ph.learnMore || 'Learn More'}</a>${product.applyUrl ? ` <a class="button secondary" href="${product.applyUrl}">${cta}</a>` : ''}</p>`;
  }
  const offerPage = offerLegalPage(product);
  const badge = product.offerBadge
    ? `<p><em>${offerLink(product, stripRefs(product.offerBadge))}${footnoteSup(refIds(product.offerBadge), offerPage)}</em></p>` : '';
  const caption = product.offerBadge && product.offerCaption
    ? `<p class="cards-product-caption"><em>${expandRefs(product.offerCaption, offerPage)}</em></p>` : '';
  return `${cardLabel(product, ph, options.label)}<h3>${product.name}</h3><p>${product.tagline}</p><ul>${highlights}</ul>
    ${note}${badge}${caption}${priceLine(product, ph)}
    ${product.applyUrl ? button(cta, product.applyUrl, 'primary') : ''}
    <p class="link-wrapper"><a href="${product.productPage}">${ph.viewMoreAccountBenefits || 'View More Account Benefits'}</a></p>`;
}

const CONFIG_KEYS = ['category', 'persona', 'cta', 'label'];
const words = (value) => String(value || '').split(',').map((v) => v.trim().toLowerCase()).filter(Boolean);

async function expandFilterRows(anchor, config) {
  const category = words(config.category);
  const persona = words(config.persona);
  if (!category.length && !persona.length) return;
  const wanted = (p) => (!category.length || category.includes(p.category))
    && (persona.length ? persona.includes(p.persona) : !p.variantOf);
  const products = (await getProducts()).filter(wanted);
  anchor.before(...products.map((p) => {
    const a = document.createElement('a');
    a.href = resolveUrl(p.path, true) || '#'; // product index paths are always same-origin
    a.textContent = p.path;
    const cell = document.createElement('div');
    cell.append(a);
    const row = document.createElement('div');
    row.append(cell);
    return row;
  }));
}

async function renderProductRows(block) {
  const config = readBlockConfig(block);
  const settings = [...block.children].filter((row) => row.children.length === 2
    && CONFIG_KEYS.includes(toClassName(row.firstElementChild.textContent)));
  if (settings.length) await expandFilterRows(settings[0], config);
  settings.forEach((row) => row.remove());
  const options = { cta: config.cta, label: config.label && toClassName(config.label) };
  const rows = [...block.children].filter((row) => {
    const cell = row.firstElementChild;
    const a = cell?.querySelector('a[href*="/products/"]');
    return a && row.children.length <= 2 && cell.textContent.trim() === a.textContent.trim();
  });
  if (!rows.length) return;
  const ph = await fetchLocalPlaceholders();
  const variant = ['compact', 'picture'].find((word) => block.classList.contains(word));
  await Promise.all(rows.map(async (row) => {
    const product = await getProduct(row.querySelector('a').getAttribute('href'));
    if (!product) { row.remove(); return; }
    const body = document.createElement('div');
    body.append(sanitizeHtml(productBody(product, ph, variant, keyList(row.children[1]), options)));
    if (variant !== 'compact') body.dataset.category = product.category;
    row.replaceChildren(body);
    if (variant === 'picture' && product.image) {
      const image = document.createElement('div');
      image.append(createOptimizedPicture(product.image, product.imageAlt));
      row.append(image);
    }
  }));
  await resolveRefLinks(block);
}

function decorateProduct(li) {
  const body = li.querySelector('.cards-card-body');
  const heading = body?.querySelector('.cards-card-title');
  if (!heading) return;

  const category = heading.previousElementSibling;
  const tagline = heading.nextElementSibling;
  const head = document.createElement('div');
  head.className = 'cards-product-head';
  head.append(heading);
  if (tagline?.tagName === 'P' && !tagline.querySelector('a, strong, em, picture')) head.append(tagline);
  body.prepend(head);

  if (category?.tagName === 'P' && !category.querySelector('a, picture')) {
    li.dataset.category = toClassName(category.textContent);
    head.dataset.category = category.textContent.trim();
    category.className = 'cards-product-category';
    head.after(category);
  }
  if (body.dataset.category) li.dataset.category = body.dataset.category;

  body.querySelectorAll(':scope > p').forEach((p) => {
    const strong = p.querySelector(':scope > strong');
    const last = p.lastElementChild?.textContent.trim();
    const endsInValue = strong && p.textContent.trim().endsWith(last);
    if (strong && (/\d/.test(p.textContent) || endsInValue)) p.classList.add('cards-product-price');
    else if (p.children.length === 1 && p.firstElementChild.tagName === 'EM' && !p.className) p.classList.add('cards-product-badge');
  });
}

let detailCount = 0;

function decorateDetail(li, detail, ph) {
  detailCount += 1;
  detail.className = 'cards-card-detail';
  detail.id = `cards-card-detail-${detailCount}`;
  detail.hidden = true;
  const heading = li.querySelector('h2, h3, h4, h5, h6');
  const title = document.createElement('p');
  title.className = 'cards-card-detail-title';
  title.textContent = heading?.textContent || '';
  const icon = li.querySelector('.cards-card-image')?.cloneNode(true);
  const iconButton = (className, label) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = className;
    el.setAttribute('aria-label', `${label}: ${title.textContent}`);
    return el;
  };
  const open = iconButton('cards-card-open', ph.showDetails || 'Show details');
  const close = iconButton('cards-card-close', ph.close || 'Close');
  open.setAttribute('aria-expanded', 'false');
  open.setAttribute('aria-controls', detail.id);
  detail.prepend(...[close, icon, title].filter(Boolean));
  const toggle = (show) => {
    detail.hidden = !show;
    open.setAttribute('aria-expanded', show);
    (show ? close : open).focus();
  };
  open.addEventListener('click', () => toggle(true));
  close.addEventListener('click', () => toggle(false));
  detail.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggle(false); });
  li.append(open, detail);
}

export default async function decorate(block) {
  if (block.classList.contains('tinted-alternate')) block.classList.add('tinted');
  if (block.classList.contains('product')) await renderProductRows(block);
  const expandable = block.classList.contains('expandable');
  const ph = expandable ? await fetchLocalPlaceholders() : {};
  const ul = document.createElement('ul');
  [...block.children].forEach((row) => {
    const li = document.createElement('li');
    while (row.firstElementChild) li.append(row.firstElementChild);
    const detail = expandable && li.children.length > 2 ? li.lastElementChild : null;
    detail?.remove();
    if (block.classList.contains('tile')) {
      decorateTile(li, tileWords(block));
      ul.append(li);
      return;
    }
    [...li.children].forEach((div) => {
      const media = div.querySelector('picture, img, .icon');
      const only = div.children.length === 1 && media && !div.textContent.trim();
      div.className = only ? 'cards-card-image' : 'cards-card-body';
    });
    if (detail) decorateDetail(li, detail, ph);
    ul.append(li);
  });
  ul.querySelectorAll('.cards-card-image img').forEach((img) => {
    if (img.closest('.icon') || new URL(img.src).origin !== window.location.origin) return;
    const optimized = createOptimizedPicture(img.src, img.alt, false, [{ width: '750' }]);
    (img.closest('picture') || img).replaceWith(optimized);
  });
  if (block.classList.contains('yellow-eyebrow')) {
    ul.querySelectorAll(':scope > li').forEach((li) => {
      const eyebrow = li.querySelector('.cards-card-body > p:first-child:not(:has(a:not(.footnote), picture))');
      if (!eyebrow?.nextElementSibling?.matches('h2, h3, h4, h5, h6')) return;
      eyebrow.className = 'cards-card-eyebrow';
      li.prepend(eyebrow);
    });
  }
  ul.querySelectorAll('h2, h3, h4, h5, h6').forEach((heading) => {
    const title = document.createElement('p');
    title.className = `cards-card-title ${heading.tagName.toLowerCase()}`;
    if (heading.id) title.id = heading.id;
    title.append(...heading.childNodes);
    heading.replaceWith(title);
  });
  block.replaceChildren(ul);

  if (block.classList.contains('product')) ul.querySelectorAll(':scope > li').forEach(decorateProduct);
}
