### Fixed

- A link to a conversation that doesn't exist now says "Conversation not found" instead of opening as a new, empty conversation (LOOM-175).
- A card for an agent waiting on your reply now shows what the agent asked, and a card's text no longer ends with a double full stop when the conversation's first message already ends in one (LOOM-175).
- Browsers no longer offer to save or generate a password in the Vault's secret fields (LOOM-175).
- Logging out clears everything the session had loaded from the page's memory (LOOM-175).
- Colours stay right in browsers that don't support `light-dark()`: the build's CSS target is now fixed so the fallback it generates can't be dropped by a later target change (LOOM-175).
