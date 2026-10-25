### Changed

- A conversation's answered offer that was denied after a yes, because the offer changed, the name was taken or
  the quota was reached, says why: "Denied: <reason>" from the server's `status_reason` (LOOM-216). A plain no
  still reads "Denied: nothing was run".
