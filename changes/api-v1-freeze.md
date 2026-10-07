### Changed

- Ready for the server's API v1 freeze, against either the current server or the new one in any deploy order:
  task statuses are read in either spelling (`awaiting-input` or `awaiting_input`, likewise `needs_attention`
  and `human_takeover`) from the conversation list, a conversation's tasks and the live stream, and are used
  as snake_case everywhere in the client.
- A confirmation card names its workspace from `workspace_name` (API v1), falling back to `workspace` from
  older servers.
- API errors carry the server's machine-readable `code` (e.g. `conversation_busy`, `not_found`) when it
  sends one, beside the message.

### Removed

- The "SSH key reference" field on the Targets form: API v1 no longer has `ssh_key_ref`.
- The "dynamic" badge on dashboard workspaces: API v1 no longer has `is_dynamic` (nor `capabilities`).
