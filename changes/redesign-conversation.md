### Added

- A rebuilt conversation screen:
  - Every decision is answered where it came up, with the same card as the Inbox: an offer under the reply that
    made it, a failed turn under the message that started it, an agent's question at the end. An offer can't be
    approved once it expires, even before the page refreshes.
  - The turn in flight shows its steps (queued, deciding where it goes, the agent at work), how long it has run,
    Cancel, the attach command and the agent's terminal.
  - Every task in the conversation is listed with its own attach command and terminal: beside the thread on wide
    screens, under "Tasks" on narrower ones.
- The terminal shows the agent's pane as it was at the end of the last turn, and says so. If the server can serve
  the live pane (a proposed addition to the API), it shows that while a turn runs; until then it says live output
  isn't available and points to the attach command.
- Code blocks in replies have a Copy button.

### Changed

- You can keep writing while a turn runs. Send then reads "Send when done" and holds the message until the turn
  ends; "Keep it as a draft" takes it back.
- On a touch screen Enter adds a new line and Send is the button; with a keyboard Enter still sends (Shift+Enter
  for a new line). The keyboard no longer pops up by itself on phones after a turn.
- The thread stays where you are when you've scrolled up to read, instead of jumping to the end on every update.
- The header names the conversation by its first message, and shows whether its live updates are connected.

### Fixed

- A conversation that fails to load says so, with Try again, instead of looking empty.
