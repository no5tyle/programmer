/* Fills in the support address from the build's settings (js/config.js), so it isn't written into the code. */
'use strict';
document.querySelectorAll('[data-support-email]').forEach((el) => {
  const email = window.QSTORED_CONFIG?.supportEmail;
  if (!email) return;
  const a = document.createElement('a');
  a.href = `mailto:${email}`;
  a.textContent = email;
  el.replaceWith(a);
});
