import { useNeedsYou } from "./useNeedsYou";

// How many decisions wait on the user, for the count in the shell and the
// Inbox's tab title.
export function useNeedsYouCount(): number {
  return useNeedsYou().count;
}
