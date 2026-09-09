import { LoaderCircle } from "lucide-react";

export default function WorkspaceLoading() {
  return (
    <div className="content workspace-loading" role="status" aria-live="polite">
      <LoaderCircle className="button-spinner" />
      <div><b>Loading workspace</b><small>Fetching the latest claim data…</small></div>
    </div>
  );
}
