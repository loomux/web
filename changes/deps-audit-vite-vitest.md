### Security

- Development tooling patched for the advisories `npm audit` reports:
  vite 8.3.5 (GHSA-9jrq-w75r-8gcw, GHSA-rq7h-c2jc-7f22,
  GHSA-vfpm-58rq-9qcg, and the launch-editor it bundles:
  GHSA-587h-7wmj-h5pm, GHSA-698v-4r3x-3vcv, GHSA-r825-w8mm-5pxw) and
  vitest 5.0.5 (`@vitest/mocker`: GHSA-qxg6-89mg-rqv8,
  GHSA-xp26-3454-mjgp). They affect the dev server and the test runner
  only, not the built web client.
