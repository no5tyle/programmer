// 404.html's one job: a group's address (/g/{gid}/…) opens the app with that group (see 404.html).
(() => {
  const m = /^\/g\/([A-Za-z0-9_-]+)\/?$/.exec(location.pathname);
  if (m) location.replace(`/?g=${encodeURIComponent(m[1])}${location.hash}`);
})();
