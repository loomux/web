### Fixed

- The attach command now includes the machine's SSH port when it isn't
  the default, and quotes any value the shell would otherwise misread,
  so the copied command connects to the right place and runs as shown
  (LOOM-168).
