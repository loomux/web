### Added

- Machines replaces Targets and Workspaces. Each machine shows:
  - its health: reachable, latency, tmux version, free disk, when it was last checked;
  - its policy, in plain words;
  - what the router models see of its work;
  - whether its host key is pinned;
  - the workspaces that live on it, with Archive, Reopen and Delete.
- A machine's page (`/machines/<id>`):
  - Test connection, and a check of its agents and health that lists the agent CLIs found and whether they need
    signing in.
  - For a remote machine, host-key pinning: Scan shows the keys the machine offers and trusts nothing. You compare a
    fingerprint with the machine's own, then pin it, within ten minutes of the scan. Unpinning asks first.
  - Its settings in one form, saved together: connection (with the SSH port), what may run there, and what the
    router models see (Everything, Final answer only, Nothing, or the default for its purpose), each explained.
  - Removing it, which explains a refusal while workspaces still live there.
- Registering a machine (`/machines/new`) opens it afterwards, ready to pin its key and test it.

### Changed

- A deleted workspace's note, including terminal sessions not yet stopped, now stays visible after the row is gone.
- `/targets/<id>` opens that machine.
- Lists of machines and workspaces refresh every 15 seconds while visible, so a workspace that just finished
  doesn't keep showing "Agent attached".
