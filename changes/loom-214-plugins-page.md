### Added

- A Plugins page under Settings (LOOM-214). It needs a server with plugins;
  on one without them, the page and its link stay hidden.
  - Each installed plugin shows its state, who vouches for it (bundled,
    signed, pinned or not signed), its check's problems and an upgrade
    when one is available. Configure, Check, Enable or Disable, Upgrade
    and Uninstall are on its card.
  - The settings form is built from the plugin's schema. Secrets are
    write-only: their box starts empty, a stored one only says it's set,
    and Clear erases it.
  - Installing shows what the plugin may do and how it's isolated. A
    build that isn't signed needs a tick first, and one the server
    couldn't verify says why.
  - Uninstalling a plugin that made machines asks whether to keep or
    destroy them, and destroying needs its name typed out.
- Create a machine with a plugin (LOOM-214): a name, a size, whether it
  keeps its data, and its network. The trusted network, which can reach
  the LAN and the tailnet, has a warning and needs a tick. Ask-first and
  the relay settings are there too.
- A created machine's page follows it coming up (Creating, Starting,
  Ready) and says when it's pulling its image. It offers Start, Stop,
  Retry and Update the image, and hides the host key and sign-in
  sections, which Loomux handles for such machines.
