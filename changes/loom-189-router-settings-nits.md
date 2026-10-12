### Fixed

- Settings → Router model: saved settings that can't be decrypted can be removed from where the warning says to remove them; before, the remove button was hidden in that state (LOOM-189).
- Clearing a saved Anthropic tier's base URL no longer asks for the API key again: an empty base URL is Anthropic's own API, which the tier already uses.
