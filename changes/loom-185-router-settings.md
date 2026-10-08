### Added

- A Router model section in Settings (LOOM-185). This needs a server with
  LOOM-185; on an older server the section doesn't show.
  - Each tier (primary, escalation) shows where its settings come from
    (saved in Loomux, the server's environment, or off), its base URL and
    model, and its key only as a fingerprint and last four characters.
  - Edit sets the base URL, model and API key; leaving the key empty
    keeps the saved one. The key is typed into a password field and
    cleared from the page once sent, saved or not.
  - Test makes one call with the tier's settings and says whether it
    worked. "Use environment settings" goes back to the server's
    environment for that tier.
  - Recent changes lists what was changed and when, never a key.
