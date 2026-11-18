/*
 * Putting two people's changes to a program together (a three-way merge).
 *
 * `base` is the program as both last had it (the account's copy this device last saved or opened), `mine` is this
 * device's, and `theirs` is the account's newer copy. A change on one side only is kept. Changes on both sides to
 * different rows, cells or settings are both kept. Only the same cell or setting changed on both sides is a clash:
 * mine is kept (the later save), and theirs stays in the account's version history.
 *
 * Lists whose items have ids (the rows, the columns, categories and the like) are put together item by item: a row
 * added on either side is kept, in its place; a row deleted on one side goes, unless the other side changed it, when
 * it's kept. Other lists (a row's leaders, the extra dates) count as one value.
 */
// eslint-disable-next-line no-unused-vars
const mergeProgram = (() => {
  const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);
  const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
  const hasIds = (...lists) => lists.some((l) => Array.isArray(l) && l.length)
    && lists.every((l) => l === undefined || (Array.isArray(l) && l.every((x) => isObject(x) && typeof x.id === 'string')));

  function merge(base, mine, theirs, path, clashes) {
    if (same(mine, theirs)) return mine;
    if (same(base, mine)) return theirs;
    if (same(base, theirs)) return mine;
    if (isObject(mine) && isObject(theirs)) {
      const b = isObject(base) ? base : {};
      const out = {};
      for (const k of new Set([...Object.keys(mine), ...Object.keys(theirs)])) {
        const v = merge(b[k], mine[k], theirs[k], [...path, k], clashes);
        if (v !== undefined) out[k] = v;
      }
      return out;
    }
    if (hasIds(base, mine, theirs) && Array.isArray(mine) && Array.isArray(theirs)) return mergeList(base || [], mine, theirs, path, clashes);
    clashes.push(path);
    return mine;
  }

  /** Lists of things with ids: item by item, each in its place. */
  function mergeList(base, mine, theirs, path, clashes) {
    const B = new Map(base.map((x) => [x.id, x]));
    const M = new Map(mine.map((x) => [x.id, x]));
    const T = new Map(theirs.map((x) => [x.id, x]));
    const kept = new Map();
    for (const id of new Set([...M.keys(), ...T.keys(), ...B.keys()])) {
      const b = B.get(id), m = M.get(id), t = T.get(id);
      if (b && !m && !t) continue;   // deleted on both
      if (b && !m) { if (!same(b, t)) kept.set(id, t); continue; }   // I deleted it: gone, unless they changed it
      if (b && !t) { if (!same(b, m)) kept.set(id, m); continue; }   // they deleted it: gone, unless I changed it
      kept.set(id, merge(b, m, t, [...path, id], clashes));
    }
    // The order: mine if I moved things about, else theirs; then what only the other side has, after the item it
    // follows there
    const order = (list) => list.map((x) => x.id).filter((id) => B.has(id));
    const iMoved = !same(order(mine), order(base).filter((id) => M.has(id)));
    const [frame, other] = iMoved ? [mine, theirs] : [theirs, mine];
    const ids = frame.map((x) => x.id).filter((id) => kept.has(id));
    other.forEach((x, i) => {
      if (!kept.has(x.id) || ids.includes(x.id)) return;
      let at = 0;
      for (let j = i - 1; j >= 0; j--) { const k = ids.indexOf(other[j].id); if (k >= 0) { at = k + 1; break; } }
      ids.splice(at, 0, x.id);
    });
    return ids.map((id) => kept.get(id));
  }

  /** The merged program, and the paths (['rows', rowId, 'activity'], say) changed on both sides. */
  return (base, mine, theirs) => {
    const clashes = [];
    const data = merge(base, mine, theirs, [], clashes);
    return { data, clashes };
  };
})();
