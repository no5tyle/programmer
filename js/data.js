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
  /* Students' first and last days. Sources: each state's education department (NSW, VIC, QLD,
     WA, TAS, SA); ACT and NT from secondary sources quoting the official tables (their sites
     could not be reached), so check those. NSW Western division schools start Term 1 later. */
  NSW: {
    2026: [['2026-02-02', '2026-04-02'], ['2026-04-22', '2026-07-03'], ['2026-07-21', '2026-09-25'], ['2026-10-13', '2026-12-17']],
    2027: [['2027-02-03', '2027-04-09'], ['2027-04-29', '2027-07-02'], ['2027-07-20', '2027-09-24'], ['2027-10-11', '2027-12-17']],
  },
  'NSW-W': {
    2026: [['2026-02-09', '2026-04-02'], ['2026-04-22', '2026-07-03'], ['2026-07-21', '2026-09-25'], ['2026-10-13', '2026-12-17']],
    2027: [['2027-02-10', '2027-04-09'], ['2027-04-29', '2027-07-02'], ['2027-07-20', '2027-09-24'], ['2027-10-11', '2027-12-17']],
  },
  VIC: {
    2026: [['2026-01-28', '2026-04-02'], ['2026-04-20', '2026-06-26'], ['2026-07-13', '2026-09-18'], ['2026-10-05', '2026-12-18']],
    2027: [['2027-01-28', '2027-03-25'], ['2027-04-12', '2027-06-25'], ['2027-07-12', '2027-09-17'], ['2027-10-04', '2027-12-17']],
    2028: [['2028-01-28', '2028-03-31'], ['2028-04-18', '2028-06-30'], ['2028-07-17', '2028-09-22'], ['2028-10-09', '2028-12-21']],
    2029: [['2029-01-30', '2029-03-29'], ['2029-04-16', '2029-06-29'], ['2029-07-16', '2029-09-21'], ['2029-10-08', '2029-12-21']],
  },
  QLD: {
    2026: [['2026-01-27', '2026-04-02'], ['2026-04-20', '2026-06-26'], ['2026-07-13', '2026-09-18'], ['2026-10-06', '2026-12-11']],
    2027: [['2027-01-27', '2027-03-25'], ['2027-04-12', '2027-06-25'], ['2027-07-12', '2027-09-17'], ['2027-10-05', '2027-12-10']],
    2028: [['2028-01-24', '2028-03-31'], ['2028-04-18', '2028-06-23'], ['2028-07-10', '2028-09-15'], ['2028-10-03', '2028-12-08']],
  },
  WA: {
    2026: [['2026-02-02', '2026-04-02'], ['2026-04-20', '2026-07-03'], ['2026-07-20', '2026-09-25'], ['2026-10-12', '2026-12-17']],
    2027: [['2027-02-01', '2027-04-09'], ['2027-04-27', '2027-07-02'], ['2027-07-19', '2027-09-24'], ['2027-10-11', '2027-12-16']],
    2028: [['2028-02-02', '2028-04-07'], ['2028-04-24', '2028-06-30'], ['2028-07-17', '2028-09-22'], ['2028-10-09', '2028-12-14']],
  },
  TAS: {
    2026: [['2026-02-05', '2026-04-17'], ['2026-05-04', '2026-07-10'], ['2026-07-27', '2026-10-02'], ['2026-10-19', '2026-12-18']],
    2027: [['2027-02-04', '2027-04-09'], ['2027-04-26', '2027-07-02'], ['2027-07-19', '2027-09-24'], ['2027-10-11', '2027-12-16']],
  },
  ACT: {
    2026: [['2026-02-02', '2026-04-02'], ['2026-04-21', '2026-07-03'], ['2026-07-21', '2026-09-25'], ['2026-10-13', '2026-12-18']],
    2027: [['2027-02-02', '2027-04-09'], ['2027-04-28', '2027-07-02'], ['2027-07-20', '2027-09-24'], ['2027-10-12', '2027-12-17']],
  },
  NT: {
    2026: [['2026-01-29', '2026-04-02'], ['2026-04-14', '2026-06-19'], ['2026-07-14', '2026-09-18'], ['2026-10-06', '2026-12-10']],
    2027: [['2027-01-27', '2027-04-02'], ['2027-04-13', '2027-06-18'], ['2027-07-13', '2027-09-17'], ['2027-10-05', '2027-12-09']],
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

/** AU_HOLIDAYS_START */
/**
 * Statewide public holidays for the other states and territories, as { 'YYYY-MM-DD': name }.
 * Rules checked against data.gov.au's Australian public holidays (2021–2025). Regional or
 * restricted days are left out (NSW Bank Holiday, TAS Easter Tuesday, Royal Hobart Regatta and
 * Recreation Day, Royal Queensland Show, NT show days); add those as weeks off if they apply.
 */
function auPublicHolidays(region, year) {
  const out = {};
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const day = (m, d) => new Date(year, m - 1, d);
  const plus = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const add = (d, name) => { out[iso(d)] = name; };
  const nthMonday = (m, n) => { const first = day(m, 1); return plus(first, ((8 - first.getDay()) % 7) + (n - 1) * 7); };
  const lastMonday = (m) => { const last = day(m + 1, 0); return plus(last, -((last.getDay() + 6) % 7)); };
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const easter = day(Math.floor((h + l - 7 * m + 114) / 31), ((h + l - 7 * m + 114) % 31) + 1);
  const r = region;

  // New Year's Day: a weekend one gets an additional Monday (NT and TAS move a Saturday one).
  const ny = day(1, 1);
  if (!(ny.getDay() === 6 && (r === 'NT' || r === 'TAS'))) add(ny, "New Year's Day");
  if (ny.getDay() === 6) add(day(1, 3), "New Year's Day");
  if (ny.getDay() === 0) add(day(1, 2), "New Year's Day");
  const aus = day(1, 26);
  add(aus.getDay() === 0 ? day(1, 27) : aus.getDay() === 6 ? day(1, 28) : aus, 'Australia Day');

  add(plus(easter, -2), 'Good Friday');
  if (r !== 'WA' && r !== 'TAS') add(plus(easter, -1), 'Easter Saturday');
  if (r !== 'TAS' && !((r === 'WA' || r === 'NT') && year < 2023)) add(easter, 'Easter Sunday');  // WA, NT from 2023
  add(plus(easter, 1), 'Easter Monday');

  const anzac = day(4, 25);
  add(anzac, 'Anzac Day');
  if (anzac.getDay() === 0 && ['ACT', 'NT', 'QLD', 'WA'].includes(r)) add(day(4, 26), 'Anzac Day');
  if (anzac.getDay() === 6 && r === 'WA') add(day(4, 27), 'Anzac Day');

  if (r === 'NSW') { add(nthMonday(6, 2), "King's Birthday"); add(nthMonday(10, 1), 'Labour Day'); }
  if (r === 'VIC') {
    add(nthMonday(3, 2), 'Labour Day');
    add(nthMonday(6, 2), "King's Birthday");
    // Set each year (the Friday before the AFL Grand Final); only announced dates are listed.
    const afl = { 2021: '09-24', 2022: '09-23', 2023: '09-29', 2024: '09-27', 2025: '09-26', 2026: '09-25' }[year];
    if (afl) out[`${year}-${afl}`] = 'AFL Grand Final Friday';
    const nov1 = day(11, 1);
    add(plus(nov1, (9 - nov1.getDay()) % 7), 'Melbourne Cup Day');   // first Tuesday in November
  }
  if (r === 'QLD') {
    add(nthMonday(5, 1), 'Labour Day');
    add(nthMonday(10, 1), "King's Birthday");
    add(day(12, 24), 'Christmas Eve');                                  // 6pm–midnight
  }
  if (r === 'WA') {
    add(nthMonday(3, 1), 'Labour Day');
    add(nthMonday(6, 1), 'Western Australia Day');
    add({ 2024: day(9, 23) }[year] || lastMonday(9), "King's Birthday");  // proclaimed each year
  }
  if (r === 'TAS') { add(nthMonday(3, 2), 'Eight Hours Day'); add(nthMonday(6, 2), "King's Birthday"); }
  if (r === 'ACT') {
    add(nthMonday(3, 2), 'Canberra Day');
    const may27 = day(5, 27);
    add(plus(may27, (8 - may27.getDay()) % 7), 'Reconciliation Day');  // Monday on or after 27 May
    add(nthMonday(6, 2), "King's Birthday");
    add(nthMonday(10, 1), 'Labour Day');
  }
  if (r === 'NT') {
    add(nthMonday(5, 1), 'May Day');
    add(nthMonday(6, 2), "King's Birthday");
    add(nthMonday(8, 1), 'Picnic Day');
    add(day(12, 24), 'Christmas Eve');                                  // 7pm–midnight
    add(day(12, 31), "New Year's Eve");                                 // 7pm–midnight
  }

  const xmas = day(12, 25), dow = xmas.getDay();
  add(xmas, 'Christmas Day');
  add(day(12, 26), 'Boxing Day');
  if (dow === 5) add(day(12, 28), 'Boxing Day');
  if (dow === 6) { add(day(12, 27), 'Christmas Day'); add(day(12, 28), 'Boxing Day'); }
  if (dow === 0) add(day(12, 27), 'Christmas Day');
  return out;
}
/** AU_HOLIDAYS_END */

/*
 * Public holiday sources per term-date region, and the years they're known to be right for
 * (WA's holidays change from 2028 under the Public and Bank Holidays Amendment Act 2026).
 */
const PUBLIC_HOLIDAYS = {
  SA: { fn: saPublicHolidays, to: 2028 },
  NSW: { fn: (y) => auPublicHolidays('NSW', y), to: 2030 },
  'NSW-W': { fn: (y) => auPublicHolidays('NSW', y), to: 2030 },
  VIC: { fn: (y) => auPublicHolidays('VIC', y), to: 2030 },
  QLD: { fn: (y) => auPublicHolidays('QLD', y), to: 2030 },
  WA: { fn: (y) => auPublicHolidays('WA', y), to: 2027 },
  TAS: { fn: (y) => auPublicHolidays('TAS', y), to: 2030 },
  ACT: { fn: (y) => auPublicHolidays('ACT', y), to: 2030 },
  NT: { fn: (y) => auPublicHolidays('NT', y), to: 2030 },
};

const REGIONS = [
  ['SA', 'South Australia'], ['NSW', 'New South Wales (Eastern)'], ['NSW-W', 'New South Wales (Western)'],
  ['VIC', 'Victoria'], ['QLD', 'Queensland'], ['WA', 'Western Australia'], ['TAS', 'Tasmania'],
  ['ACT', 'Australian Capital Territory'], ['NT', 'Northern Territory'], ['custom', 'Other / custom'],
];
