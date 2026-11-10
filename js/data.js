/* Static data: section presets, term dates, defaults and icons. */
'use strict';

/*
 * Section presets. Logos are the official Scouts Australia vertical Section logos
 * (as distributed in the Scouts NSW logo pack); colours are each logo's main brand colour.
 * Use the logos as provided — do not alter them.
 */
const SECTIONS = {
  joeys:     { name: 'Joeys',     color: '#B65518', logo: 'assets/section-logos/joeys.png' },
  cubs:      { name: 'Cubs',      color: '#FFC82E', logo: 'assets/section-logos/cubs.png' },
  scouts:    { name: 'Scouts',    color: '#00AE42', logo: 'assets/section-logos/scouts.png' },
  venturers: { name: 'Venturers', color: '#9E1B32', logo: 'assets/section-logos/venturers.png' },
  rovers:    { name: 'Rovers',    color: '#DC291E', logo: 'assets/section-logos/rovers.png' },
};
/* Section colours used by earlier versions of this app, migrated to the official ones on load. */
const OLD_SECTION_COLORS = { joeys: '#B5651D', cubs: '#FFC72C', scouts: '#00A651', venturers: '#8B1E3F', rovers: '#D6001C' };

/*
 * School term dates (government schools), [start, end] per term.
 * Dates can always be edited by hand in the app; add more regions/years here.
 */
const TERM_DATES = {
  SA: {
    2025: [['2025-01-28', '2025-04-11'], ['2025-04-28', '2025-07-04'], ['2025-07-21', '2025-09-26'], ['2025-10-13', '2025-12-12']],
    2026: [['2026-01-27', '2026-04-10'], ['2026-04-27', '2026-07-03'], ['2026-07-20', '2026-09-25'], ['2026-10-12', '2026-12-11']],
    2027: [['2027-01-27', '2027-04-09'], ['2027-04-26', '2027-07-02'], ['2027-07-19', '2027-09-24'], ['2027-10-11', '2027-12-10']],
    2028: [['2028-01-31', '2028-04-13'], ['2028-05-01', '2028-07-07'], ['2028-07-24', '2028-09-29'], ['2028-10-16', '2028-12-15']],
  },
};

const DEFAULT_COLUMNS = [
  { key: 'week',        label: 'Week',           visible: true,  width: 6,  align: 'center' },
  { key: 'date',        label: 'Date',           visible: true,  width: 8,  align: 'center' },
  { key: 'time',        label: 'Time',           visible: true,  width: 8,  align: 'center' },
  { key: 'activity',    label: 'Activity',       visible: true,  width: 13, align: 'center' },
  { key: 'description', label: 'Description',    visible: true,  width: 19, align: 'center' },
  { key: 'uniform',     label: 'Uniform',        visible: true,  width: 6,  align: 'center' },
  { key: 'forms',       label: 'Forms',          visible: true,  width: 6,  align: 'center' },
  { key: 'where',       label: 'Where',          visible: false, width: 8,  align: 'center' },
  { key: 'patrol',      label: 'Duty Patrol',    visible: true,  width: 6,  align: 'center' },
  { key: 'leader',      label: 'Leader',         visible: true,  width: 7,  align: 'center' },
  { key: 'cost',        label: 'Cost',           visible: true,  width: 5,  align: 'center' },
  { key: 'challenge',   label: 'Challenge Area', visible: true,  width: 7,  align: 'center' },
  { key: 'notes',       label: 'Notes',          visible: true,  width: 16, align: 'left' },
];

const DEFAULT_CATEGORIES = [
  { id: 'hall',   label: 'Scout Hall',     color: '#C9EBC4' },
  { id: 'out',    label: 'Out and About',  color: '#BFD9F2' },
  { id: 'event',  label: 'EVENT',          color: '#F6C9EC' },
  { id: 'friend', label: 'Bring a Friend', color: '#FFF0A6' },
];

const DEFAULT_CHALLENGES = [
  { id: 'community', label: 'Community',       color: '#212D65', icon: null },
  { id: 'outdoors',  label: 'Outdoors',        color: '#7FBE41', icon: null },
  { id: 'creative',  label: 'Creative',        color: '#E22726', icon: null },
  { id: 'personal',  label: 'Personal Growth', color: '#FEC52E', icon: null },
];

/*
 * Official Scouts Australia Challenge Area icons (resources.scouts.com.au → Program Icons).
 * Use as provided — do not alter. "named" versions include the area name under the icon.
 */
const CHALLENGE_ASSETS = {
  community: { label: 'Community',       icon: 'assets/challenge-areas/community.png', named: 'assets/challenge-areas/community-named.png' },
  outdoors:  { label: 'Outdoors',        icon: 'assets/challenge-areas/outdoors.png',  named: 'assets/challenge-areas/outdoors-named.png' },
  creative:  { label: 'Creative',        icon: 'assets/challenge-areas/creative.png',  named: 'assets/challenge-areas/creative-named.png' },
  personal:  { label: 'Personal Growth', icon: 'assets/challenge-areas/personal.png',  named: 'assets/challenge-areas/personal-named.png' },
};
/* Colours used by earlier versions of this app, migrated to the official ones on load. */
const OLD_CHALLENGE_COLORS = { community: '#2E6FB7', outdoors: '#3A8F2D', creative: '#D23F6E', personal: '#7A4BA8' };

const DEFAULT_PATROLS = [
  { name: 'Blue',   color: '#1F5FBF' },
  { name: 'Green',  color: '#2E9E44' },
  { name: 'Orange', color: '#F08A24' },
];

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const PAPER_MM = { A4: [297, 210], Letter: [279.4, 215.9] };

/** SA_HOLIDAYS_START */
/**
 * South Australian public holidays for a year, as { 'YYYY-MM-DD': name }.
 * Rules follow the Holidays Act 1910 (SA), checked against data.gov.au (2021–2025) and
 * SafeWork SA's "South Australia public holidays 2025 – 2028" list, including the
 * 7pm–midnight part-day holidays on Christmas Eve and New Year's Eve.
 */
function saPublicHolidays(year) {
  const out = {};
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const day = (m, d) => new Date(year, m - 1, d);
  const plus = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const add = (d, name) => { out[iso(d)] = name; };
  const nthMonday = (m, n) => { const first = day(m, 1); return plus(first, ((8 - first.getDay()) % 7) + (n - 1) * 7); };
  // Easter Sunday (anonymous Gregorian algorithm).
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const easter = day(Math.floor((h + l - 7 * m + 114) / 31), ((h + l - 7 * m + 114) % 31) + 1);

  const ny = day(1, 1);
  // Weekend New Year's Day gets an additional Monday; before 2023 a Saturday one moved to Monday.
  if (!(ny.getDay() === 6 && year < 2023)) add(ny, "New Year's Day");
  if (ny.getDay() === 6) add(day(1, 3), "New Year's Day");
  if (ny.getDay() === 0) add(day(1, 2), "New Year's Day");
  const aus = day(1, 26);
  add(aus.getDay() === 0 ? day(1, 27) : aus.getDay() === 6 ? day(1, 28) : aus, 'Australia Day');
  add(nthMonday(3, 2), 'Adelaide Cup Day');
  add(plus(easter, -2), 'Good Friday');
  add(plus(easter, -1), 'Easter Saturday');
  if (year >= 2025) add(easter, 'Easter Sunday');
  add(plus(easter, 1), 'Easter Monday');
  const anzac = day(4, 25);
  add(anzac, 'Anzac Day');
  if (anzac.getDay() === 0 && year < 2023) add(day(4, 26), 'Anzac Day');   // no Monday since 2023
  add(nthMonday(6, 2), "King's Birthday");
  add(nthMonday(10, 1), 'Labour Day');
  add(day(12, 24), 'Christmas Eve');
  const xmas = day(12, 25), dow = xmas.getDay();
  add(xmas, 'Christmas Day');
  add(day(12, 26), 'Proclamation Day');
  if (dow === 5) add(day(12, 28), 'Proclamation Day');                                   // 26th is a Saturday
  if (dow === 6) { add(day(12, 27), 'Christmas Day'); add(day(12, 28), 'Proclamation Day'); }
  if (dow === 0) add(day(12, 27), 'Christmas Day');
  add(day(12, 31), "New Year's Eve");
  return out;
}
/** SA_HOLIDAYS_END */

/* Public holiday sources per term-date region. */
const PUBLIC_HOLIDAYS = { SA: saPublicHolidays };
