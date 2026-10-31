import { FILTERS, MEALS, todayInOttawa, validDate, shiftDate, sourceUrl, parseMenu, matches, hasLabel, isMeatOrFish, readPreferences } from './menu.js';

const $ = id => document.getElementById(id);
let storage;
try { storage = window.localStorage; } catch { storage = { getItem: () => null, setItem: () => { throw new Error('Storage unavailable'); } }; }
const prefs = readPreferences(storage);
const urlDate = new URL(location.href).searchParams.get('date');
let date = validDate(urlDate) ? urlDate : todayInOttawa();
let menu = null;
let activeRequest = null;
let requestNumber = 0;
let loadedAt = null;
const cacheKey = day => `uottawa-menu-cache-v1:${day}`;
const cache = new Map();
const mealHours = { Breakfast: '6–10 a.m.', Lunch: '11 a.m.–3:30 p.m.', Dinner: '4:30–11 p.m.' };
const badges = [ ['Made Without Gluten','GF'], ['Made without Dairy','DF'], ['Vegetarian','V'], ['Vegan','VG'], ['Halal','H'], ['Spicy','S'] ];

function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
function save() {
  try { storage.setItem('uottawa-menu-preferences-v1', JSON.stringify(prefs)); $('saved').textContent = 'Saved on this device'; }
  catch { $('saved').textContent = 'Storage unavailable'; }
}
function setupOptions() {
  for (const meal of MEALS) {
    const label = element('label', 'meal-option');
    const input = document.createElement('input'); input.type = 'checkbox'; input.value = meal; input.checked = prefs.meals.includes(meal);
    input.addEventListener('change', () => { prefs.meals = [...$('meal-options').querySelectorAll('input:checked')].map(input => input.value); save(); render(); });
    label.append(input, element('span', null, meal)); $('meal-options').append(label);
  }
  for (const filter of FILTERS) {
    const label = element('label', 'diet-option'); label.title = filter.label;
    const input = document.createElement('input'); input.type = 'checkbox'; input.value = filter.id; input.checked = prefs.filters.includes(filter.id);
    input.addEventListener('change', () => { prefs.filters = [...$('diet-options').querySelectorAll('input:checked')].map(input => input.value); save(); render(); });
    label.append(input, element('span', null, filter.name)); $('diet-options').append(label);
  }
  $('meat-only').checked = prefs.meatOnly;
}
function clearFilters() {
  prefs.filters = []; prefs.meatOnly = false;
  $('diet-options').querySelectorAll('input').forEach(input => { input.checked = false; });
  $('meat-only').checked = false; save(); render();
}
function emptyState(title, copy, action) {
  const block = element('div', 'empty-state'); block.append(element('h3', null, title), element('p', null, copy));
  if (action) { const button = element('button', 'inline-button', action.text); button.addEventListener('click', action.fn); block.append(button); }
  return block;
}
function renderItem(item) {
  const li = element('li', 'item'); li.append(element('p', 'item-name', item.name));
  const tags = element('div', 'badges');
  for (const [label, abbreviation] of badges) {
    if (!hasLabel(item, label)) continue;
    const badge = element('abbr', `badge badge-${abbreviation.toLowerCase()}`, abbreviation);
    badge.title = label; badge.setAttribute('aria-label', label); tags.append(badge);
  }
  if (isMeatOrFish(item)) {
    const badge = element('abbr', 'badge badge-p', 'P');
    badge.title = 'Protein: meat or fish identified from the dish name';
    badge.setAttribute('aria-label', badge.title);
    tags.append(badge);
  }
  li.append(tags); return li;
}
function render() {
  if (!menu) return;
  $('results').replaceChildren(); $('results').setAttribute('aria-busy', 'false');
  const selectedMeals = MEALS.filter(meal => prefs.meals.includes(meal));
  $('results-title').textContent = selectedMeals.length ? selectedMeals.join(' & ') : 'Choose a meal';
  if (!selectedMeals.length) {
    $('results-summary').textContent = '';
    $('results').append(emptyState('What meal are you heading to?', 'Check Breakfast, Lunch or Dinner above. You can choose more than one.'));
    return;
  }
  if (menu.unavailable) {
    $('results-summary').textContent = '';
    $('results').append(emptyState('No published menu for this date', 'Try a nearby date, or check the original uOttawa menu for updates.'));
    return;
  }
  let total = 0, matching = 0;
  const visible = selectedMeals.map(meal => ({ meal, stations: menu.stations.map(station => {
    const items = (station.meals[meal] || []).filter(item => !item.heading);
    const filtered = items.filter(item => matches(item, prefs.filters, prefs.meatOnly));
    total += items.length; matching += filtered.length;
    return { name: station.name, items, filtered };
  }) }));
  const filtered = prefs.filters.length > 0 || prefs.meatOnly;
  const stationCount = menu.stations.length;
  const time = loadedAt ? new Intl.DateTimeFormat('en-CA', { timeZone:'America/Toronto',hour:'numeric',minute:'2-digit' }).format(new Date(loadedAt)) : '';
  $('results-summary').textContent = `${matching} ${matching === 1 ? 'item' : 'items'}${filtered ? ` match, out of ${total}` : ''} · all ${stationCount} stations${time ? ` · updated ${time}` : ''}`;
  if (!matching && total) {
    const dietaryConflict = prefs.meatOnly && (prefs.filters.includes('vegetarian') || prefs.filters.includes('vegan'));
    $('results').append(emptyState('No items match these filters', dietaryConflict ? 'Meat & fish cannot also be vegetarian or vegan. Turn off one of those filters to see options.' : 'No published items carry every selected label. Try clearing a filter or choosing another meal. Unlabelled items are not treated as suitable.', { text:'Clear dietary filters',fn:clearFilters }));
  }
  for (const group of visible) {
    if (selectedMeals.length > 1) {
      const heading = element('div', 'meal-heading'); heading.append(element('h3', null, group.meal), element('span', null, mealHours[group.meal])); $('results').append(heading);
    }
    for (const station of group.stations) {
      const section = element('section', `station${station.filtered.length ? '' : ' empty'}`);
      const heading = element('div', 'station-heading');
      const counted = filtered ? station.items.length : station.filtered.length;
      heading.append(element('h3', null, station.name), element('p', null, `${station.filtered.length}${filtered ? ` of ${station.items.length}` : ''} ${counted === 1 ? 'item' : 'items'}`));
      section.append(heading);
      if (station.filtered.length) {
        const list = element('ul', 'items'); list.append(...station.filtered.map(renderItem)); section.append(list);
      } else section.append(element('p', 'station-empty', station.items.length ? 'No items match your filters.' : `No ${group.meal.toLowerCase()} items listed.`));
      $('results').append(section);
    }
  }
}
function updateDateUI() {
  $('menu-date').value = date;
  $('date-label').textContent = new Intl.DateTimeFormat('en-CA', { weekday:'long',year:'numeric',month:'long',day:'numeric',timeZone:'UTC' }).format(new Date(`${date}T12:00:00Z`));
  $('original-top').href = $('original-bottom').href = sourceUrl(date);
  const url = new URL(location.href);
  if (date === todayInOttawa()) url.searchParams.delete('date'); else url.searchParams.set('date',date);
  history.replaceState(null,'',url);
}
function readCache(day) {
  if (cache.has(day)) return cache.get(day);
  try {
    const saved = JSON.parse(storage.getItem(cacheKey(day)));
    if (saved?.menu?.date === day && Array.isArray(saved.menu.stations) && Number.isFinite(saved.time)) return saved;
  } catch {}
  return null;
}
function writeCache(day, entry) {
  cache.set(day, entry);
  try {
    storage.setItem(cacheKey(day),JSON.stringify(entry));
    const dates = JSON.parse(storage.getItem('uottawa-menu-cache-index-v1') || '[]');
    const keep = [day,...(Array.isArray(dates) ? dates : []).filter(d => d !== day)].slice(0,5);
    for (const old of dates) if (!keep.includes(old)) storage.removeItem(cacheKey(old));
    storage.setItem('uottawa-menu-cache-index-v1',JSON.stringify(keep));
  } catch {}
}
function warning(text) { $('notice').textContent = text; $('notice').hidden = !text; }
async function load(force = false) {
  const thisRequest = ++requestNumber;
  activeRequest?.abort(); const controller = new AbortController(); activeRequest = controller;
  const requestedDate = date;
  updateDateUI(); menu = null; loadedAt = null; warning('');
  $('results-title').textContent = 'Loading the menu…'; $('results-summary').textContent = 'Getting the latest menu from uOttawa.';
  $('results').setAttribute('aria-busy','true'); $('results').replaceChildren(...Array.from({length:3}, () => { const el=element('div','skeleton');el.setAttribute('aria-hidden','true');return el; }));
  $('refresh').disabled = true;
  const saved = readCache(requestedDate);
  if (!force && saved && Date.now() - saved.time < 5 * 60 * 1000 && Date.now() >= saved.time) {
    menu = saved.menu; loadedAt = saved.time; render(); $('refresh').disabled = false; return;
  }
  const timer = setTimeout(() => controller.abort(), 18000);
  try {
    const response = await fetch(sourceUrl(requestedDate), { mode:'cors', credentials:'omit', signal:controller.signal, cache: force ? 'reload' : 'default' });
    if (!response.ok) throw new Error(`uOttawa returned an error (${response.status}).`);
    const html = await response.text();
    if (html.length > 3000000) throw new Error('The menu response was unexpectedly large. Please check the original page.');
    const parsed = parseMenu(html, requestedDate);
    if (thisRequest !== requestNumber) return;
    menu = parsed; loadedAt = Date.now(); writeCache(requestedDate,{menu,time:loadedAt}); render();
  } catch (error) {
    if (thisRequest !== requestNumber) return;
    if (saved) {
      menu = saved.menu; loadedAt = saved.time; render();
      const stamp = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(saved.time));
      warning(`Couldn’t refresh from uOttawa. Showing the saved menu for this exact date, last loaded ${stamp}. It may have changed. Use Refresh to try again.`);
    } else {
      $('results-title').textContent = 'The menu couldn’t load'; $('results-summary').textContent = '';
      $('results').replaceChildren(emptyState('Try again or open the original menu', error.name === 'AbortError' ? 'The university’s menu took too long to respond. Your saved filters are still here.' : error instanceof TypeError ? 'The university’s site could not be reached from this browser. Check your connection or try the original menu. Your saved filters are still here.' : error.message, {text:'Try again',fn:() => load(true)}));
      $('results').setAttribute('aria-busy','false');
    }
  } finally { clearTimeout(timer); if (thisRequest === requestNumber) $('refresh').disabled = false; }
}
function chooseDate(value) { if (!validDate(value)) return; date = value; load(); }
setupOptions();
$('menu-date').addEventListener('change',event => { if (validDate(event.target.value)) chooseDate(event.target.value); else event.target.value=date; });
$('previous').addEventListener('click',() => chooseDate(shiftDate(date,-1)));
$('next').addEventListener('click',() => chooseDate(shiftDate(date,1)));
$('today').addEventListener('click',() => chooseDate(todayInOttawa()));
$('refresh').addEventListener('click',() => load(true));
$('clear').addEventListener('click',clearFilters);
$('meat-only').addEventListener('change',event => { prefs.meatOnly=event.target.checked;save();render(); });
load();
