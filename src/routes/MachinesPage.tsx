import { TargetsPage } from "./TargetsPage";
import { WorkspacesPage } from "./WorkspacesPage";

// Machines, for now: the existing Targets and Workspaces screens one above
// the other, so both live at /machines from PR 1. PR 6 replaces this with
// machines that hold their workspaces (build-plan §6).
export function MachinesPage() {
  return (
    <>
      <TargetsPage />
      <WorkspacesPage />
    </>
  );
}
