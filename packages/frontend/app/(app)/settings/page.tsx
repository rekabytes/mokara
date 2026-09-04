import { CONTACT } from "@/lib/legal";
import { SettingsView } from "./settings-view";

// Server shell: LEG_CONTACT_EMAIL is server-only (lib/legal reads process.env
// without the NEXT_PUBLIC_ prefix, so a client bundle would see nothing), so
// the danger strip's mailto is wired here and passed down as a prop.
export default function SettingsPage() {
  return <SettingsView contactEmail={CONTACT.email} />;
}
