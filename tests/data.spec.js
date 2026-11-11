// Term dates and public holiday rules, checked against official data (no browser needed).
const { test, expect } = require('@playwright/test');
const fixtures = require('./fixtures/au-public-holidays.json');
const { loadData } = require('./helpers');

const data = loadData();

test('term dates are weekdays, in order, in their own year', () => {
  const problems = [];
  for (const [region, years] of Object.entries(data.TERM_DATES)) {
    for (const [year, terms] of Object.entries(years)) {
      terms.forEach((t, i) => {
        if (!t) return;
        const [s, e] = t.map((x) => new Date(`${x}T00:00`));
        if ([0, 6].includes(s.getDay()) || [0, 6].includes(e.getDay())) problems.push(`${region} ${year} T${i + 1} weekend`);
        if (e <= s) problems.push(`${region} ${year} T${i + 1} ends before it starts`);
        if (String(s.getFullYear()) !== year) problems.push(`${region} ${year} T${i + 1} wrong year`);
        const prev = terms[i - 1];
        if (prev && new Date(`${prev[1]}T00:00`) >= s) problems.push(`${region} ${year} T${i + 1} overlaps`);
      });
    }
  }
  expect(problems).toEqual([]);
});

test('every term-date region is in the Region list', () => {
  const listed = data.REGIONS.map(([v]) => v);
  for (const region of Object.keys(data.TERM_DATES)) expect(listed).toContain(region);
});

test('SA public holidays match SafeWork SA 2025–2028', () => {
  for (const [year, official] of Object.entries(fixtures.safeworkSA)) {
    expect(Object.keys(data.saPublicHolidays(+year)).sort(), `SA ${year}`).toEqual([...official].sort());
  }
});

test('SA public holidays match data.gov.au 2022–2025', () => {
  // 2021 is left out: the dataset lists only the Monday for that year's Sunday Anzac Day.
  for (const year of ['2022', '2023', '2024', '2025']) {
    expect(Object.keys(data.saPublicHolidays(+year)).sort(), `SA ${year}`).toEqual(fixtures.datagovau.SA[year]);
  }
});

// Deliberate differences: the dataset lists only the Monday for a Sunday Anzac Day in ACT/NT/QLD
// (we keep the Sunday too) and leaves out VIC's 2025 AFL Grand Final Friday.
const allowedExtra = new Set(['ACT 2021-04-25', 'NT 2021-04-25', 'QLD 2021-04-25', 'VIC 2025-09-26']);

for (const region of ['NSW', 'VIC', 'QLD', 'WA', 'TAS', 'ACT', 'NT']) {
  test(`${region} public holidays match data.gov.au 2021–2025`, () => {
    for (const year of ['2021', '2022', '2023', '2024', '2025']) {
      const mine = Object.keys(data.auPublicHolidays(region, +year));
      const theirs = fixtures.datagovau[region][year];
      const missing = theirs.filter((d) => !mine.includes(d));
      const extra = mine.filter((d) => !theirs.includes(d) && !allowedExtra.has(`${region} ${d}`));
      expect({ year, missing, extra }).toEqual({ year, missing: [], extra: [] });
    }
  });
}
