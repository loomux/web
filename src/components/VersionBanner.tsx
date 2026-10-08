import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

// The client's own expected API version — bumped by hand whenever this
// client is updated to target a new server API version. Compared against
// GET /version on boot (design spec §10 axis 1's intent, extended to this
// client): a mismatch is a visible warning, not a silent failure, but also
// not a hard block — see docs/design/web-client-design.md "Error handling".
const EXPECTED_API_VERSION = "v1";

export function VersionBanner() {
  const { data, isError } = useQuery({
    queryKey: ["version"],
    queryFn: api.getVersion,
    retry: false,
  });

  if (isError) {
    return (
      <div role="status" className="bg-mari-soft px-4 py-2 text-center text-sm text-mari-ink">
        Couldn't reach the Loomux server to check that this app and the server match.
      </div>
    );
  }

  if (data && data.api_version !== EXPECTED_API_VERSION) {
    return (
      <div role="status" className="bg-mari-soft px-4 py-2 text-center text-sm text-mari-ink">
        The server speaks API {data.api_version}, but this app expects {EXPECTED_API_VERSION}, so some things may not
        work. Update the app or the server.
      </div>
    );
  }

  return null;
}
