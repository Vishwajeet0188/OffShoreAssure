/*
 * Light and dark mode.
 *
 * The choice is remembered in this browser. Until someone chooses, the site
 * follows the device setting. index.html applies the saved choice before the
 * page is drawn, so there is no flash of the wrong colours.
 */
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'oa-theme';

function savedTheme() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // storage blocked (private window, strict settings)
  }
}

function deviceTheme() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function currentTheme() {
  return document.documentElement.dataset.theme || savedTheme() || deviceTheme();
}

export function useTheme() {
  const [theme, setTheme] = useState(currentTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* the choice just won't be remembered */
    }
    setTheme(next);
  }

  return { theme, toggle };
}
