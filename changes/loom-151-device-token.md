### Security

- Logging in sends this browser's device token, kept across logouts (LOOM-151). The server gives a browser that has logged in before its own login backoff, so failed attempts by anyone else no longer lock it out.
