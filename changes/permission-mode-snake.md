### Changed

- The target form reads `permission_mode` in either spelling
  (`accept_edits` since server API v1, `accept-edits` before) and keeps
  sending `accept-edits`, which servers before and after accept, so it
  works whichever is deployed.
