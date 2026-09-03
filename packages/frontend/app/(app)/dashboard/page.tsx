import { redirect } from "next/navigation";

// PRD-06 replaced this screen: the container page (/teams/[id]) is where
// members, invites, projects and KPIs live now, and the sidebar's Team item is
// the only route to it. The page here already redirected itself to /tasks on
// mount, so nothing on it was ever visible — the redirect is now the whole
// component, which keeps bookmarks and the create-team flow working with no
// client JS and no mount effect.
export default function DashboardPage() {
  redirect("/tasks");
}
