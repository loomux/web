### Security

- The test environment is patched for the advisories `npm audit` reports in undici 8.10.2
  (GHSA-4qv8-2p9j-2685, GHSA-f72v-6w45-q472, GHSA-xjj6-f33q-929c). jsdom pulls undici in, so the
  lockfile now resolves it to 8.12.3, within jsdom's `^8.9.0`. Only the tests use it, not the built web
  client.
