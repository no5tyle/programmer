/* Static data: section presets, term dates, defaults and icons. */
'use strict';

const SECTIONS = {
  joeys:     { name: 'Joeys',     color: '#B5651D' },
  cubs:      { name: 'Cubs',      color: '#FFC72C' },
  scouts:    { name: 'Scouts',    color: '#00A651' },
  venturers: { name: 'Venturers', color: '#8B1E3F' },
  rovers:    { name: 'Rovers',    color: '#D6001C' },
};

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
  { key: 'week',        label: 'Week',           visible: true,  width: 5,  align: 'center' },
  { key: 'date',        label: 'Date',           visible: true,  width: 8,  align: 'center' },
  { key: 'time',        label: 'Time',           visible: true,  width: 8,  align: 'center' },
  { key: 'activity',    label: 'Activity',       visible: true,  width: 13, align: 'center' },
  { key: 'description', label: 'Description',    visible: true,  width: 20, align: 'center' },
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
  { id: 'community', label: 'Community',       color: '#2E6FB7', icon: null },
  { id: 'outdoors',  label: 'Outdoors',        color: '#3A8F2D', icon: null },
  { id: 'creative',  label: 'Creative',        color: '#D23F6E', icon: null },
  { id: 'personal',  label: 'Personal Growth', color: '#7A4BA8', icon: null },
];

const DEFAULT_PATROLS = [
  { name: 'Blue',   color: '#1F5FBF' },
  { name: 'Green',  color: '#2E9E44' },
  { name: 'Orange', color: '#F08A24' },
];

/* Simple line glyphs drawn inside a ring for the built-in challenge areas. */
const CHALLENGE_GLYPHS = {
  community: '<circle cx="9" cy="9.5" r="2.3"/><circle cx="15.3" cy="10" r="1.9"/><path d="M5 16.8c.6-2.4 2.1-3.7 4-3.7s3.4 1.3 4 3.7M13.6 13.7c.5-.3 1.1-.5 1.7-.5 1.6 0 2.8 1.1 3.3 3.2"/>',
  outdoors:  '<path d="M4.5 17 9.5 9l3 4.5 1.8-2.6L19.5 17z"/><circle cx="16" cy="7.5" r="1.4"/>',
  creative:  '<path d="M10 17.5h4M10.6 19.5h2.8M12 5a4.8 4.8 0 0 0-3 8.6c.5.5.8 1.1.8 1.9h4.4c0-.8.3-1.4.8-1.9A4.8 4.8 0 0 0 12 5z"/>',
  personal:  '<path d="M12 19v-6.5M12 12.5c0-3.2-2.3-4.9-5.5-4.9 0 3.2 2.3 4.9 5.5 4.9zM12 14.3c0-2.6 2-4.2 4.8-4.2 0 2.6-2 4.2-4.8 4.2z"/>',
};

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const PAPER_MM = { A4: [297, 210], Letter: [279.4, 215.9] };
