// Simple logger wrapper: debug/info/warn only print in development; error always prints
const isDev = process.env.NODE_ENV === 'development';

export const debug = (...args: unknown[]) => {
  if (isDev && typeof console !== 'undefined' && console.debug) console.debug(...args);
};

export const info = (...args: unknown[]) => {
  if (isDev && typeof console !== 'undefined' && console.info) console.info(...args);
};

export const warn = (...args: unknown[]) => {
  if (isDev && typeof console !== 'undefined' && console.warn) console.warn(...args);
};

export const error = (...args: unknown[]) => {
  if (typeof console !== 'undefined' && console.error) console.error(...args);
};

export default { debug, info, warn, error };
