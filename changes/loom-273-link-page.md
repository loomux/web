### Added

- A page to sign in a terminal, `/link` (LOOM-273, the terminal client's link flow). `loomux login` opens
  `/link#h=<token hash>&label=<host>`; the page shows the terminal's name and a code, and Approve signs that terminal
  in (`POST /api/v1/sessions`, server LOOM-268, v0.3.151 or later) only if the code matches the one the terminal
  shows. The terminal's token never reaches the browser, and the link stays in the address's fragment, which is never
  sent or logged. Approve arms a second after the page has the focus; a link that changes while the page is open, a
  page inside a frame, or a browser without WebCrypto gets nothing to approve. A link used once already changes
  nothing, and Undo revokes an approval its terminal stopped waiting for.
