/*
 * Settings for accounts. They're empty here, which leaves accounts off: the builder then keeps
 * every program in this browser, as it always has.
 *
 * The deployed site's values are filled in when it's built (.github/workflows/deploy.yml), from the
 * repository's variables, so no address or key is written into the code:
 *   apiBase          the API, e.g. https://api.qstored.org
 *   firebaseApiKey   the Firebase project's web API key (it identifies the project; it isn't a secret)
 *   supportEmail     shown in Help
 *   privacyUrl, termsUrl   linked from Sign in
 *   microsoftSignIn  true to offer Sign in with Microsoft (once it's set up in Firebase and Microsoft Entra)
 * For local work against the emulators, also set authEmulatorHost (e.g. localhost:9099).
 */
window.QSTORED_CONFIG = Object.assign({
  apiBase: '',
  firebaseApiKey: '',
  authEmulatorHost: '',
  supportEmail: '',
  privacyUrl: '',
  termsUrl: '',
  microsoftSignIn: false,
}, window.QSTORED_CONFIG);
