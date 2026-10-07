### Added

- The Inbox, the new home screen. Everything waiting on you is answered in place, each as the same kind of card with
  who is asking, where, the exact command or question, and the answers:
  - offers, with Approve and Deny and a countdown to their expiry, after which they can't be approved;
  - agent prompts, with their options, a reply box, and Approve or Trust and Deny;
  - conversations waiting for your reply, or taken over;
  - failed turns, explained in plain words, with Details and Retry.

  Answering leaves a short note of what happened, with a link to the conversation. Anything waiting over a day folds
  into "Older, still waiting", and can be snoozed until tomorrow on this device. Beside the queue (below it on a
  phone): what's working now and what finished today.

### Changed

- The Dashboard is replaced by the Inbox. The web client's version and updates move to Settings, and the workspace
  cards move out (Machines shows workspaces).
- New conversations and sent messages no longer break over plain HTTP on a LAN: ids fall back to
  `crypto.getRandomValues` where `crypto.randomUUID` is missing.
