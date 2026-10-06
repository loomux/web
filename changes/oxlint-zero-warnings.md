### Changed

- The auth context and `useAuth` live in `src/lib/authContext.ts`, so
  `auth.tsx` exports only `AuthProvider`: oxlint reports no warnings, and
  `npm run lint` (CI) now fails on any new one.
