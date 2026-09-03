import { redirect } from "next/navigation";

// Pending invitations are accepted/declined from the container page
// (/teams/[id]) since PRD-06, and this route already bounced to /tasks on
// mount, so its list was unreachable. Kept as a server redirect for any old
// link; PRD-05 (notifications) is where invitation UI comes back.
export default function InvitationsPage() {
  redirect("/tasks");
}
