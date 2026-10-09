### Fixed

- While the server can't be reached, a conversation reconnects less and less often (from every second up to every 30 seconds) instead of every second for as long as the page is open, and starts over once it's back. A conversation the server refuses or doesn't know shows "Not live" and stops trying. A hidden tab closes its stream and reopens it when shown (LOOM-159).
