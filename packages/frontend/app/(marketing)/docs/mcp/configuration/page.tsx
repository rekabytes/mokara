import { permanentRedirect } from "next/navigation";

// Previously published deployment documentation now resolves to the user guide.
export default function RemovedConfigurationPage() {
  permanentRedirect("/docs/mcp");
}
