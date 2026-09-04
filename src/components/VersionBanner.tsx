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
      <div className="bg-amber-100 text-amber-900 text-sm px-4 py-2 text-center dark:bg-amber-900 dark:text-amber-100">
        Could not reach the Loomux server to check API compatibility.
      </div>
    );
  }

  if (data && data.api_version !== EXPECTED_API_VERSION) {
    return (
      <div className="bg-amber-100 text-amber-900 text-sm px-4 py-2 text-center dark:bg-amber-900 dark:text-amber-100">
        Server API version ({data.api_version}) does not match what this
        client expects ({EXPECTED_API_VERSION}) — some features may not
        work correctly.
      </div>
    );
  }

  return null;
}
