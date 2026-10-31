export const SOURCE = 'https://www.uottawa.ca/campus-life/eat-campus/dining-hall/menu';
export const MEALS = ['Breakfast', 'Lunch', 'Dinner'];
export const FILTERS = [
  { id: 'gluten', name: 'Without gluten', label: 'Made Without Gluten' },
  { id: 'dairy', name: 'Without dairy', label: 'Made without Dairy' },
  { id: 'vegetarian', name: 'Vegetarian', label: 'Vegetarian' },
  { id: 'vegan', name: 'Vegan', label: 'Vegan' },
  { id: 'halal', name: 'Halal', label: 'Halal' },
];
const normal = text => text.toLocaleLowerCase('en').replace(/\s+/g, ' ').trim();
export function todayInOttawa(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map(key => parts.find(p => p.type === key).value).join('-');
}
export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
export function shiftDate(date, amount) {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + amount);
  return next.toISOString().slice(0, 10);
}
export function sourceUrl(date) {
  return `${SOURCE}?menu-date=${encodeURIComponent(date)}`;
}
export function parseMenu(html, requestedDate, Parser = DOMParser) {
  const doc = new Parser().parseFromString(html, 'text/html');
  const dateHeadings = [...doc.querySelectorAll('h2')].map(el => el.textContent.trim());
  const heading = dateHeadings.find(text => /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+[A-Za-z]+\s+\d{1,2},\s+\d{4}\b/.test(text));
  if (!heading) throw new Error('The university menu format has changed or the menu page did not load. Open the original menu below.');
  const parsedDate = new Date(`${heading} 12:00:00 GMT`);
  if (Number.isNaN(parsedDate.valueOf()) || parsedDate.toISOString().slice(0, 10) !== requestedDate) {
    throw new Error('The university returned a menu for a different date. Please check the original menu.');
  }
  const stations = [...doc.querySelectorAll('.cat-content')].map(section => {
    const name = section.querySelector('h4')?.textContent.trim();
    if (!name) return null;
    const meals = {};
    for (const title of section.querySelectorAll('.meal-title')) {
      const meal = MEALS.find(m => normal(m) === normal(title.textContent));
      if (!meal) continue;
      let list = title.nextElementSibling;
      while (list && !list.matches('ul, h4, h5')) list = list.nextElementSibling;
      if (!list?.matches('ul')) continue;
      meals[meal] = [...list.querySelectorAll('li.product-name')].map(li => {
        const labels = [...li.querySelectorAll('img[alt]')].map(img => img.getAttribute('alt').trim());
        const copy = li.cloneNode(true);
        copy.querySelectorAll('i, .diet-icon, img').forEach(el => el.remove());
        const name = copy.textContent.replace(/\s+/g, ' ').trim();
        const heading = /^\*/.test(name) || /^omelette station$/i.test(name);
        return { name: name.replace(/^\*\s*/, ''), labels, heading };
      }).filter(item => item.name);
    }
    return { name, meals };
  }).filter(Boolean);
  if (!stations.length) {
    if (/no menu|not available|not been published|no items/i.test(doc.querySelector('main')?.textContent || '')) return { date: requestedDate, stations: [], unavailable: true };
    throw new Error('No menu stations could be read. The university may have changed the page. Open the original menu below.');
  }
  const count = stations.reduce((n, station) => n + Object.values(station.meals).flat().filter(item => !item.heading).length, 0);
  return { date: requestedDate, stations, unavailable: count === 0 };
}
export function hasLabel(item, label) {
  return item.labels.some(value => normal(value) === normal(label));
}
export function isMeatOrFish(item) {
  if (hasLabel(item, 'Vegetarian') || hasLabel(item, 'Vegan') || /\b(vegan|vegetarian|meatless|plant.based|veggie)\b/i.test(item.name)) return false;
  return /\b(beef|chicken|pork|ham|bacon|turkey|lamb|oxtail|sausage|sausages|pepperoni|donair|meat|meatballs|cheesesteak|pogos|corn dogs|shrimp|salmon|tilapia|hake|cod|basa|haddock|pollock|tuna|fish|seafood|clams?|mussels|lobster)\b/i.test(item.name);
}
export function matches(item, filters, meatOnly) {
  if (item.heading) return false;
  if (meatOnly && !isMeatOrFish(item)) return false;
  return filters.every(id => {
    if (id === 'vegetarian') return hasLabel(item, 'Vegetarian') || hasLabel(item, 'Vegan');
    const filter = FILTERS.find(filter => filter.id === id);
    return filter && hasLabel(item, filter.label);
  });
}
export function readPreferences(storage) {
  const defaults = { filters: ['gluten'], meals: ['Lunch'], meatOnly: false };
  try {
    const saved = JSON.parse(storage.getItem('uottawa-menu-preferences-v1'));
    if (!saved || !Array.isArray(saved.filters) || !Array.isArray(saved.meals)) return defaults;
    return {
      filters: [...new Set(saved.filters)].filter(id => FILTERS.some(filter => filter.id === id)),
      meals: [...new Set(saved.meals)].filter(meal => MEALS.includes(meal)),
      meatOnly: saved.meatOnly === true,
    };
  } catch { return defaults; }
}
