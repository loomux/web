### Fixed

- Ids are now always escaped when the client puts them in a request
  path, so an id with a character such as `/`, `?`, `#` or `%` reaches
  the right item instead of a different address (LOOM-167).
