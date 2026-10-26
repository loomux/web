### Added

- A card for a machine offer from chat (`create_target`, LOOM-247): "Create the machine <name>?", its plan part by
  part (plugin, size, data, network, in the chat's own words), and Approve and Deny, so the yes no longer has to be
  typed. Once answered it keeps the plan and reads "Approved", or "Denied: <reason>" from the server's
  `status_reason` as other offers do.
- A `machine` event kind (LOOM-247): a machine made from chat is a "New machine <name>" step in the turn rail and
  the Today weave, with its own mark and legend entry. A server from before LOOM-247 logs it as a `provision` that
  names no workspace, which now reads the same way instead of "Set up a workspace".
