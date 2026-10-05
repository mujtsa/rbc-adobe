import fetchLocalPlaceholders from '../../utils/placeholders.js';
import { createOptimizedPicture } from '../../scripts/aem.js';
import { createModal } from '../modal/modal.js';

function paragraphs(text) {
  return text.split(/\n\s*\n/).map((chunk) => {
    const label = chunk.length < 60 && /[?:]$/.test(chunk.trim());
    const el = document.createElement(label ? 'h4' : 'p');
    el.textContent = chunk.trim();
    return el;
  });
}

function card(person, ph) {
  const li = document.createElement('li');
  li.dataset.province = person.Province;
  const first = person.Nickname || person.Name.split(' ')[0];
  li.append(createOptimizedPicture(person.Image, person.Name, false, [{ width: '320' }]));
  const body = document.createElement('div');
  const h3 = document.createElement('h3');
  h3.textContent = person.Name;
  const locationSpan = document.createElement('span');
  locationSpan.textContent = person.Location;
  h3.append(locationSpan);
  const arrivedP = document.createElement('p');
  const arrivedStrong = document.createElement('strong');
  arrivedStrong.textContent = `${ph.arrived || 'Arrived in Canada'}:`;
  arrivedP.append(arrivedStrong, ` ${person.Arrived}`);
  const speaksP = document.createElement('p');
  const speaksStrong = document.createElement('strong');
  speaksStrong.textContent = `${ph.speaks || 'Speaks'}:`;
  speaksP.append(speaksStrong, ` ${person.Speaks}`);
  const quoteP = document.createElement('p');
  quoteP.className = 'advisor-finder-quote';
  quoteP.textContent = person.Quote;
  body.append(h3, arrivedP, speaksP, quoteP);
  if (person.Bio) {
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'advisor-finder-more';
    more.textContent = `${ph.readMoreAbout || 'Read more about'} ${first}`;
    more.addEventListener('click', async () => {
      const title = Object.assign(document.createElement('h3'), { textContent: person.Name });
      const { showModal } = await createModal([title, ...paragraphs(person.Bio)]);
      showModal();
    });
    body.append(more);
  }
  li.append(body);
  return li;
}

// row 1: label; row 2: link to the advisors sheet (tabs: contacts, team)
export default async function decorate(block) {
  const ph = await fetchLocalPlaceholders();
  const [intro, source] = [...block.children].map((row) => row.firstElementChild);
  const sheet = source?.querySelector('a')?.href || 'advisors.json';
  const json = await fetch(sheet).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  const contacts = json.contacts?.data || [];
  const team = json.team?.data || [];

  const form = document.createElement('form');
  form.className = 'advisor-finder-form';
  const label = document.createElement('label');
  label.htmlFor = 'advisor-province';
  label.append(...intro.childNodes);
  const select = document.createElement('select');
  select.id = 'advisor-province';
  select.required = true;
  select.append(new Option(ph.selectProvince || 'Select a Province', ''));
  [...new Set([...contacts, ...team].flatMap((a) => a.Province.split(', ')))].sort()
    .forEach((name) => select.append(new Option(name, name)));
  const button = document.createElement('button');
  button.type = 'submit';
  button.className = 'button primary';
  button.textContent = ph.search || 'Search';
  form.append(label, select, button);

  const results = document.createElement('div');
  results.className = 'advisor-finder-results';
  results.hidden = true;
  const cards = document.createElement('ul');
  cards.className = 'advisor-finder-team';
  cards.append(...team.map((person) => card(person, ph)));
  cards.hidden = true;
  const empty = document.createElement('p');
  empty.className = 'advisor-finder-empty';
  empty.textContent = ph.noAdvisors || 'No advisors listed for this province yet. Email us and we will connect you.';
  empty.hidden = true;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const province = select.value;
    const heading = document.createElement('p');
    heading.className = 'advisor-finder-heading';
    heading.textContent = ph.emailUsToday || 'Email us today:';
    results.replaceChildren(heading);
    contacts.filter((c) => c.Province === province).forEach((c) => {
      const p = document.createElement('p');
      const a = document.createElement('a');
      a.href = `mailto:${c.Email}`;
      a.textContent = c.Email;
      p.append(...(c.Location ? [`${c.Location} - `] : []), a, document.createElement('br'), `${ph.languagesSpoken || 'Languages Spoken'}: ${c.Languages}`);
      results.append(p);
    });
    results.hidden = false;
    cards.hidden = false;
    let shown = 0;
    cards.querySelectorAll('li').forEach((li) => {
      li.hidden = !li.dataset.province.split(', ').includes(province);
      if (!li.hidden) shown += 1;
    });
    empty.hidden = shown > 0;
    results.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  block.replaceChildren(form, results, empty, cards);
}
