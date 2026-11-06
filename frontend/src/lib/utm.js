/*
 * Remembers the UTM tags (utm_source, utm_medium …) from the first link a
 * visitor opened, so we can record where a new account came from at sign-up.
 * Only the first visit counts; nothing is sent anywhere until they register.
 */
const STORAGE_KEY = 'oa-signup-source';
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

export function captureUtm() {
  const params = new URLSearchParams(window.location.search);
  const tags = Object.fromEntries(
    UTM_KEYS.filter(key => params.get(key)).map(key => [key, params.get(key).slice(0, 100)]),
  );
  if (Object.keys(tags).length === 0) return;

  try {
    if (localStorage.getItem(STORAGE_KEY)) return; // keep the first source
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...tags, landingPage: window.location.pathname.slice(0, 200) }),
    );
  } catch {
    /* storage blocked: the source just isn't recorded */
  }
}

export function signupSource() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : undefined;
  } catch {
    return undefined;
  }
}

export function clearSignupSource() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to clear */
  }
}
