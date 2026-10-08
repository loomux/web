### Added

- An "offline" bar when the device loses its connection, instead of requests failing with the browser's own error.
- Installed-app shortcuts: Inbox, New conversation and Today.
- After the server signs this device out (an expired session, or a sign-out from another device), the login page
  says so, and logging in returns to where you were.
- An accessibility check in the end-to-end tests: every main screen, in both themes, has no serious or critical axe
  findings.

### Changed

- The login page, the version warning and the error screen match the new design. A wrong password reads "Invalid
  password. Check it and try again."; too many tries say to wait.
- Secondary text, links and the terminal's dim text have more contrast, to meet WCAG AA on every surface in both
  themes.
- Signing another device out, from Settings, asks first. A credential scoped to a deleted workspace says no agent
  gets it any more. A credential that fails to save because of a server error doesn't keep its value in the page.
