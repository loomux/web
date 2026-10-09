### Fixed

- A message that fails to send (a server error or a lost connection) no longer sits in the conversation as if it had
  gone: it goes back into the message box, ready to send again, and sending it again can't start the same turn twice
  (LOOM-149).
