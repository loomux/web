### Fixed

- Opening another conversation starts clean: a half-written message, a held message or a turn from the one before no longer carries over (LOOM-173).
- While an agent is stopped at a prompt, that prompt is the card at the end of the conversation, even when another task is newer, so no other card asks for a reply your next message would actually answer. The prompt isn't offered again while your answer is on its way, and a message held with "Send when done" waits for it to be answered (LOOM-173).
