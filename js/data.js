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
    2028: [['2028-01-31', '2028-04-13'], ['2028-05-01', '2028-07-07'], ['2028-07-24', '2028-09-29'], null],
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
