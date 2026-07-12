import '@testing-library/jest-dom/vitest';

// jsdom doesn't implement matchMedia - stub it so components using
// responsive breakpoints (e.g. BuildXI's mobile/desktop layout switch)
// don't crash under test. Always reports "no match" (mobile layout).
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
