### Added

- Machines with a key of their own (LOOM-138). This needs a server with
  LOOM-138; on an older server, or one without SSH keys, nothing changes.
  - Registering a machine over SSH now defaults to a key Loomux makes for
    it, through the server's proxy or straight to the host.
  - A machine's page has a "Signing in" section. It shows the checklist
    (trust its host key, let Loomux in, test), the line to add to
    `authorized_keys` with a copy button, and Replace key.
  - Machines still signing in through the server's SSH config can be
    checked and moved to a key of their own. If the move fails its test,
    the machine stays on the SSH config.
  - The Machines list says which machines aren't set up yet, and which
    still use the server's SSH config.
- Test connection shows which step stopped it: reaching the machine, its
  host key, signing in, or tmux.
