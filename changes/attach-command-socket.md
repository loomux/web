### Fixed

- The attach command names Loomux's own tmux server (the server's
  `attach_command`, e.g. `tmux -L loomux attach -t …`); a bare
  `tmux attach` didn't find the session. It runs over `ssh -t` on a remote
  target and as-is on the local one.
