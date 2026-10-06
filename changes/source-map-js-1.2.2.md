### Security

- source-map-js 1.2.1 → 1.2.2 (GHSA-68fv-2mgg-jv7q, high: event-loop
  denial of service through indexed source-map offsets). Build-time only,
  through vite, postcss and jsdom; the shipped bundle doesn't include it.
