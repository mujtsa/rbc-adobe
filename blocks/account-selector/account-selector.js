import applyConfig from '../../scripts/config.js';
import { getMetadata } from '../../scripts/aem.js';
import {
  getProduct, getProducts, pickHighlights, isPrice,
} from '../../utils/products.js';
import { footnoteSup, expandRefs, resolveRefLinks } from '../../utils/footnotes.js';
import { escapeHtml, sanitizeHtml, resolveUrl } from '../../utils/dom.js';

const SHEET = '/fragments/account-selector.json';
const TABS = { 'fr-CA': 'fr', 'zh-Hans': 'sc', 'zh-Hant': 'tc' };

const TEMPLATE = `
<form class="account-selector-form">
  <div class="account-selector-progress" aria-hidden="true"></div>
  <p class="account-selector-step"></p>
  <fieldset>
    <legend>
      <p data-key="q1">How many purchases, withdrawals and bill payments do you make on average each month?</p>
      <p data-key="q1-tip"><strong>Tip:</strong> Exclude <em>Interac</em> e-Transfers, public transit transactions and transfers between RBC accounts — they're free</p>
    </legend>
    <div data-full class="account-selector-slider">
      <input type="range" min="0" max="25" value="0">
      <span>0</span><span>25+</span>
      <input type="number" name="transactions" min="0" max="99" value="0">
    </div>
    <details data-full class="account-selector-help">
      <summary data-key="q1-help">Help Me Estimate This</summary>
      <p data-key="q1-help-intro">Each month, how often do you:</p>
      <label><span data-key="q1-help-debit">Use your debit card</span> <input type="number" min="0" max="99" value="0" data-sum></label>
      <label><span data-key="q1-help-atm">Use an ATM</span> <input type="number" min="0" max="99" value="0" data-sum></label>
      <label><span data-key="q1-help-bills">Pay bills from your account</span> <input type="number" min="0" max="99" value="0" data-sum></label>
    </details>
    <div data-short class="account-selector-options">
      <label><input type="radio" name="transactions" value="6" required> <span data-key="q1-less">Less Than 12</span></label>
      <label><input type="radio" name="transactions" value="12" required> <span data-key="q1-more">12 or More</span></label>
    </div>
  </fieldset>
  <fieldset>
    <legend><p data-key="q2">How often would you use non-RBC ATMs in Canada each month?</p></legend>
    <input type="number" name="atms" min="0" max="99" value="0">
  </fieldset>
  <fieldset data-full>
    <legend><p data-key="q3">Do you need any of these other products or features?</p></legend>
    <div class="account-selector-options">
      <label><input type="checkbox" name="additional-accounts" value="Yes"> <span data-key="q3-accounts">Additional Chequing Account(s)</span></label>
      <label><input type="checkbox" name="safe-deposit" value="Yes"> <span data-key="q3-safe">Safe Deposit Box</span></label>
      <label><input type="checkbox" name="overdraft" value="Yes"> <span data-key="q3-overdraft">Overdraft Protection*</span></label>
      <label><input type="checkbox" name="credit-card" value="Yes"> <span data-key="q3-credit">Credit Card*</span></label>
    </div>
    <p class="account-selector-note" data-key="q3-note">*Note: You would need to apply and be approved for each of these separately.</p>
  </fieldset>
  <fieldset data-full>
    <legend>
      <p data-key="q4">Did you know that you can unlock Avion points and potential savings by enrolling your RBC bank account in the Value Program?</p>
      <p data-key="q4-tip">Find out how much you could earn and save by selecting products you're interested in or already have:</p>
    </legend>
    <div class="account-selector-options">
      <label><input type="checkbox" name="investments" value="Yes"> <span data-key="q4-investments">Personal Investment</span></label>
      <label><input type="checkbox" name="mortgage" value="Yes"> <span data-key="q4-mortgage">Residential Mortgage</span></label>
      <label><input type="checkbox" name="business" value="Yes"> <span data-key="q4-business">Small Business Account</span></label>
    </div>
    <p class="account-selector-note" data-key="q4-note">Note: We only ask this question to show your potential rewards and savings. You would need to enrol your bank account and apply and be approved for these products separately if you don't already have them.</p>
  </fieldset>
  <fieldset data-full>
    <legend><p data-key="q5">Does one of the following apply to you? (If yes, you could save on monthly fees.)</p></legend>
    <div class="account-selector-options">
      <label><input type="radio" name="status" value="student"> <span data-key="q5-student">Full-time student or anyone 24 and younger</span></label>
      <label><input type="radio" name="status" value="senior"> <span data-key="q5-senior">Senior (age 65+)</span></label>
      <label><input type="radio" name="status" value="indigenous"> <span data-key="q5-indigenous">Indigenous peoples</span></label>
      <label><input type="radio" name="status" value="newcomer"> <span data-key="q5-newcomer">Newcomer to Canada</span></label>
      <label><input type="radio" name="status" value="rdsp"> <span data-key="q5-rdsp">RDSP holder</span></label>
      <label><input type="radio" name="status" value="none" checked> <span data-key="q5-none">None of these</span></label>
    </div>
  </fieldset>
  <div class="account-selector-nav">
    <button type="button" class="account-selector-back" data-key="back">Back</button>
    <button type="submit" class="button accent"></button>
    <span hidden data-key="continue">Continue</span>
    <span hidden data-key="finish">Show Me My Account</span>
    <span hidden data-key="finish-short">Continue at Account Selector Tool</span>
    <span hidden data-key="minus">Minus one</span>
    <span hidden data-key="plus">Plus one</span>
    <span hidden data-key="step-of">of</span>
    <span hidden data-key="range-label">Transactions per month, 0 to 25 or more</span>
    <span hidden data-key="transactions-label">Transactions per month</span>
    <span hidden data-key="atms-label">Non-RBC ATM uses per month</span>
  </div>
</form>
<div class="account-selector-results" hidden>
  <h2><span data-key="result">Based on your selections, we recommend</span> <span></span></h2>
  <span hidden data-key="badge">Recommended</span>
  <span hidden data-key="open-this-account">Open This Account</span>
  <span hidden data-key="view-account-details">View Account Details</span>
  <span hidden data-key="per-month">/mo</span>
  <ul class="account-selector-cards"></ul>
  <button type="button" class="button secondary" data-key="edit">Edit Details</button>
</div>
`;

const PROXY = '/cgi-bin/bank-accounts/chequing-accounts/proxy.cgi';
const FIELDS = {
  'credit-card': 'creditCardFee',
  'safe-deposit': 'safeDepositBox',
  'additional-accounts': 'additionalAccounts',
  overdraft: 'overdraftProtection',
  investments: 'investments',
  mortgage: 'mortgages',
  business: 'smallBusiness',
  student: 'isStudent',
  senior: 'isSenior',
  indigenous: 'isIndigenous',
  newcomer: 'isNewcomer',
  rdsp: 'isRDSP',
};

function answers(form) {
  const data = Object.fromEntries(Object.values(FIELDS).map((f) => [f, 'No']));
  data.numDebits = Number(form.elements.transactions.value || 0);
  data.numInterac = Number(form.elements.atms.value || 0);
  form.querySelectorAll('input:checked').forEach((input) => {
    const field = FIELDS[input.type === 'radio' ? input.value : input.name];
    if (field) data[field] = 'Yes';
  });
  return data;
}

// the CGI answers with an account name in either language; cards are matched by slug
const SLUGS = [
  [/vip/i, 'vip-banking'],
  [/signature|sans limite/i, 'signature-no-limit'],
  [/day to day|courant/i, 'day-to-day-banking'],
  [/advantage|avantage/i, 'advantage-banking'],
];
const slugFor = (name) => SLUGS.find(([re]) => re.test(name))?.[1];

// ponytail: rule of thumb when the CGI is unreachable (previews); production uses the proxy
function guess(a) {
  if (a.additionalAccounts === 'Yes') return 'vip-banking';
  if (a.creditCardFee === 'Yes' || a.safeDepositBox === 'Yes') return 'signature-no-limit';
  if (a.numDebits <= 12 && a.isStudent !== 'Yes' && a.isNewcomer !== 'Yes') return 'day-to-day-banking';
  return 'advantage-banking';
}

async function recommend(a) {
  try {
    const res = await fetch(PROXY, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(a),
      signal: AbortSignal.timeout(8000),
    });
    const json = await res.json();
    const name = json.result_code === 0 && json.result_content?.recommended;
    const slug = name && slugFor(name);
    if (slug) return slug;
  } catch (e) { /* fall through */ }
  return guess(a);
}

// result cards come from the product records in the `products` row, or every chequing account
function productCard(product, text) {
  const sup = (value) => footnoteSup(value, product.productPage);
  const li = document.createElement('li');
  li.dataset.name = product.name;
  li.dataset.slug = product.slug;
  li.innerHTML = `<p class="account-selector-badge">${text('badge')}</p>
    <div class="account-selector-head"><h3>${escapeHtml(product.name)}</h3><p>${escapeHtml(product.tagline)}</p></div>
    <div class="account-selector-body">
      <p>${escapeHtml(product.fees[0]?.displayValue || '')}${isPrice(product.fees[0]?.displayValue) ? text('per-month') : ''}${sup(product.fees[0]?.footnotes)}</p>
      <ul>${pickHighlights(product).slice(0, 3).map((h) => `<li>${expandRefs(h.text, product.productPage)}</li>`).join('')}</ul>
      ${resolveUrl(product.applyUrl) ? `<p class="button-wrapper"><a class="button primary" href="${escapeHtml(resolveUrl(product.applyUrl))}">${text('open-this-account')}</a></p>` : ''}
      <p><a href="${escapeHtml(resolveUrl(product.productPage, true) || '#')}">${text('view-account-details')}</a></p>
    </div>`;
  return li;
}

const SLIDER_ONLY = '[data-short], .account-selector-help, fieldset ~ fieldset, legend, .account-selector-progress, .account-selector-step';

// copy sheet: an authored link to a .json replaces the default; tab per page language
async function loadCopy(block) {
  const link = [...block.querySelectorAll('a[href]')]
    .find((a) => new URL(a.href, window.location.href).pathname.endsWith('.json'));
  const path = link ? new URL(link.href, window.location.href).pathname : SHEET;
  [...block.children].find((row) => row.contains(link))?.remove();
  const json = await fetch(path).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  const tab = TABS[getMetadata('lang')] || 'data';
  const rows = Array.isArray(json.data) ? json.data : (json[tab] || json.data)?.data || [];
  const filled = rows.filter((r) => r.Key && r.Text);
  return Object.fromEntries(filled.map((r) => [r.Key.trim().toLowerCase(), r.Text]));
}

export default async function decorate(block) {
  const refs = [...block.querySelectorAll('a[href*="/products/"]')].map((a) => a.getAttribute('href'));
  const copy = await loadCopy(block);
  const config = applyConfig(block, TEMPLATE);
  // block rows win over the sheet
  block.querySelectorAll('[data-key]').forEach((el) => {
    if (!(el.dataset.key in config) && copy[el.dataset.key]) {
      el.replaceChildren(sanitizeHtml(copy[el.dataset.key]));
    }
  });
  const short = block.classList.contains('short');
  const slider = block.classList.contains('slider');
  const handoff = short || slider;
  let removed = short ? '[data-full]' : '[data-short]';
  if (slider) removed = SLIDER_ONLY;
  block.querySelectorAll(removed).forEach((el) => el.remove());
  const form = block.querySelector('form');
  const steps = [...form.querySelectorAll('fieldset')];
  const progress = form.querySelector('.account-selector-progress');
  progress?.append(...steps.map(() => document.createElement('i')));
  const stepLabel = form.querySelector('.account-selector-step');
  const back = form.querySelector('.account-selector-back');
  const next = form.querySelector('[type=submit]');
  if (slider) next.className = 'button primary';
  const label = (key) => form.querySelector(`[data-key="${key}"]`).textContent;
  form.querySelector('input[type=range]')?.setAttribute('aria-label', label('range-label'));
  form.querySelector('input[type=number][name=transactions]')?.setAttribute('aria-label', label('transactions-label'));
  form.querySelector('input[name=atms]')?.setAttribute('aria-label', label('atms-label'));
  const results = block.querySelector('.account-selector-results');
  const cards = results.querySelector('.account-selector-cards');
  const heading = results.querySelector('h2');
  const edit = results.querySelector('.account-selector-results > button');
  const text = (key) => results.querySelector(`[data-key="${key}"]`).textContent;
  let products = [];
  if (!handoff) products = refs.length ? await Promise.all(refs.map(getProduct)) : await getProducts({ category: 'chequing', persona: 'everyone' });
  cards.append(...products.filter(Boolean).map((product) => productCard(product, text)));
  resolveRefLinks(cards);

  const prefill = new URLSearchParams(window.location.search);
  form.querySelectorAll('input[type=number]').forEach((input) => {
    if (prefill.has(input.name)) input.value = prefill.get(input.name);
    const stepper = document.createElement('div');
    stepper.className = 'account-selector-stepper';
    input.replaceWith(stepper);
    [-1, 1].forEach((step) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = step < 0 ? 'account-selector-minus' : 'account-selector-plus';
      button.setAttribute('aria-label', step < 0 ? label('minus') : label('plus'));
      button.addEventListener('click', () => {
        const min = Number(input.min) || 0;
        const max = Number(input.max) || Infinity;
        input.value = Math.min(Math.max(Number(input.value || 0) + step, min), max);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      stepper.append(button);
    });
    stepper.insertBefore(input, stepper.lastElementChild);
  });
  const range = form.querySelector('input[type=range]');
  const { transactions } = form.elements;
  if (range) {
    range.value = transactions.value;
    range.addEventListener('input', () => { transactions.value = range.value; });
    transactions.addEventListener('input', () => { range.value = Math.min(transactions.value, 25); });
    form.querySelectorAll('[data-sum]').forEach((input) => input.addEventListener('input', () => {
      transactions.value = [...form.querySelectorAll('[data-sum]')].reduce((sum, i) => sum + Number(i.value || 0), 0);
      range.value = Math.min(transactions.value, 25);
    }));
  }

  let current = 0;
  const show = (i) => {
    current = i;
    steps.forEach((s, n) => { s.hidden = n !== i; });
    progress?.querySelectorAll('i').forEach((seg, n) => seg.classList.toggle('active', n <= i));
    if (stepLabel) stepLabel.textContent = `${i + 1} ${label('step-of')} ${steps.length}`;
    back.hidden = i === 0;
    const last = i === steps.length - 1;
    let finish = short ? 'finish-short' : 'finish';
    if (slider) finish = 'continue';
    next.textContent = label(last ? finish : 'continue');
    next.disabled = short && !steps[i].querySelector('input:checked, input[type=number]');
  };
  form.addEventListener('change', () => { next.disabled = false; });
  back.addEventListener('click', () => show(current - 1));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (current < steps.length - 1) {
      show(current + 1);
      return;
    }
    if (handoff) {
      const url = new URL(config.handoff || '/', window.location.href);
      if (url.origin !== window.location.origin) return;
      new URLSearchParams(new FormData(form)).forEach((v, k) => url.searchParams.set(k, v));
      window.location.assign(url);
      return;
    }
    next.disabled = true;
    const pick = await recommend(answers(form));
    next.disabled = false;
    cards.querySelectorAll(':scope > li').forEach((li) => {
      const hit = li.dataset.slug === pick;
      li.classList.toggle('recommended', hit);
      if (hit) cards.prepend(li);
    });
    heading.lastElementChild.textContent = cards.querySelector('.recommended')?.dataset.name || '';
    form.hidden = true;
    results.hidden = false;
    results.scrollIntoView({ behavior: 'smooth' });
  });
  edit.addEventListener('click', () => {
    results.hidden = true;
    form.hidden = false;
    show(0);
  });
  show(0);
}
