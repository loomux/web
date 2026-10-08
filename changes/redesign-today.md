### Added

- Today, the read-back view. It replaces the Conversations list:
  - **On a desktop:** the chosen day as a weave. Each machine's workspaces are lanes on a real time axis, and each
    conversation is a thread crossing the lanes it moved through. Every step of every turn is a mark: routed, set
    up, the agent's turn and how long it took, an offer and its answer, a command, a failure. What's waiting on you
    is a marigold diamond with a dashed tail showing how long it has waited. Hovering or focusing a mark says what
    it was; selecting it opens that conversation at that turn; Left and Right move along a lane.
  - **On a phone:** the same day as a timeline, newest first, with what waits on you at the top.
  - Previous and next day.
  - All conversations, with search and Needs you / Working / Done filters kept in the address.
- A day strip above the Inbox: where work ran today and what's running, one row per machine (one row on a phone).
  Tapping a diamond jumps to its card.
- Each turn in a conversation lists its steps (routed, set up, agent turn, offer, command, failure): beside the
  thread on wide screens, under "Turn steps" on a phone. A link from Today opens the conversation at that turn.

### Changed

- `/conversations` opens Today at its list of conversations, keeping a `?status=` filter.
