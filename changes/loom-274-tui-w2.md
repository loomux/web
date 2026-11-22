### Added

- Who drives a conversation from the terminal (LOOM-274, loomux/server LOOM-267's holds): a banner under the
  conversation's header, "Driven from the terminal on laptop since 14:02", with **Take back**. Take back asks first,
  then detaches that terminal and hands the agent back to Loomux. If the terminal couldn't be detached, it says that
  nothing changed. The stream's `task_hold` event keeps the banner current. The inbox's takeover card and activity
  rows name the holder too, and the takeover card takes it back from there. A server from before holds sends none
  of this, and those screens look as before.
- Settings → Devices names each session's client and device ("loomux TUI · laptop"). Signing out a terminal says it
  needs `loomux login` again.
- "Open in the terminal" in a conversation's tasks: the `loomux open <id>` command, to copy.

### Changed

- A message refused because someone drives the agent's terminal (error class `held`) says so and names who, and a
  turn ended by a takeover (`taken_over`) says that, instead of "Something went wrong". A turn ended by a takeover
  no longer shows in the inbox as a failure to retry: the takeover is its own card.
