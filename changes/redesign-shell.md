### Added

- A new app shell for the redesign (docs/design/redesign/): a sidebar on desktop and a bottom bar with a More sheet
  on phones, with the needs-you count on Inbox in both, the current page marked, and the tab title naming the
  screen ("Inbox (3) · Loomux").
- Settings, with a theme choice (match device, light, dark) saved on the device and applied before first paint.
- A "nothing at this address" page for unknown paths, with a way back to the Inbox.

### Changed

- Navigation is Inbox, Today and Machines, with Vault and Settings one step down. Today lists conversations for now,
  Machines shows targets and workspaces together, and Vault is the credentials page; each is rebuilt in a later
  release.
- Old addresses redirect and keep their query: `/conversations` to `/today`, `/targets` and `/workspaces` to
  `/machines`, `/credentials` to `/vault`. `/conversations/<id>` (notification links) is unchanged.
- Logging in from the login page lands on the Inbox instead of Workspaces.
- Colours come from design tokens, in both themes; the installed app's status bar follows the theme. Fonts
  (Atkinson Hyperlegible Next and Mono) ship with the app.
