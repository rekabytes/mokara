import { Hono } from "hono";

// Curated public product copy only. Never publish incident details, credentials,
// infrastructure settings or unreleased work in this feed.
export const releases = [
  {
    version: "0.2.19",
    date: "2026-10-29",
    title: "What's new, all in one place",
    summary: "Browse Mokara releases without leaving your workspace.",
    changes: [
      {
        title: "Release history",
        body: "Find release versions, dates and highlights in the changelog. Expand any older entry to read its updates.",
      },
      {
        title: "A quieter update notice",
        body: "A small corner notice opens the full changelog. Close it with X or let it hide after 30 seconds. What's new stays available whenever you want to return.",
      },
    ],
  },
  {
    version: "0.2.18",
    date: "2026-10-29",
    title: "More control over agent work and customer support",
    summary:
      "Hand tasks to your agent when you are ready, and make your support form feel like your business.",
    changes: [
      {
        title: "Ready for agent",
        body: "Choose which tasks an agent can pick up. Follow its progress, review results and request cancellation from task details. Existing tasks stay Not ready until you choose otherwise.",
      },
      {
        title: "Guided support setup",
        body: "Follow the website setup guide, choose your brand accent and button text color, and preview the customer form before embedding it.",
      },
      {
        title: "Clearer support controls",
        body: "Dropdowns and expandable website details now use consistent chevrons.",
      },
    ],
  },
  {
    version: "0.2.17",
    date: "2026-10-20",
    title: "Support tickets on your website",
    summary: "Embed a support ticket form and receive customer requests in Mokara.",
    changes: [
      {
        title: "Your business, your requests",
        body: "Support emails use a branded sender name. AI connections follow your active GitHub repositories.",
      },
    ],
  },
  {
    version: "0.2.16",
    date: "2026-10-16",
    title: "Clearer analytics history",
    summary: "Reopened tasks count as unfinished work in analytics.",
    changes: [
      {
        title: "Contributing to Mokara",
        body: "The contributor guide explains the testing workflow.",
      },
    ],
  },
  {
    version: "0.2.15",
    date: "2026-10-16",
    title: "Account and workspace improvements",
    summary: "Sign-in, uploads and busy workspaces receive reliability improvements.",
    changes: [
      {
        title: "Clearer account controls",
        body: "Password guidance and account settings are more consistent.",
      },
    ],
  },
  {
    version: "0.2.14",
    date: "2026-10-15",
    title: "More reliable GitHub completion",
    summary: "Linked tasks can complete when a pull request merges into a development branch.",
    changes: [
      {
        title: "Shared-link previews",
        body: "Social preview image information has been updated for shared links.",
      },
    ],
  },
  {
    version: "0.2.13",
    date: "2026-10-15",
    title: "Markdown in task descriptions",
    summary: "Headings, lists and other Markdown styling make task details easier to read.",
    changes: [
      {
        title: "Smoother everyday work",
        body: "Task drawer scrolling is refined, and GitHub connections renew access more reliably.",
      },
    ],
  },
  {
    version: "0.2.12",
    date: "2026-10-15",
    title: "A new Mokara mark",
    summary: "The interlocking M becomes Mokara’s logo.",
    changes: [
      {
        title: "Consistent branding",
        body: "The updated mark appears on the homepage and browser icons.",
      },
    ],
  },
  {
    version: "0.2.11",
    date: "2026-10-15",
    title: "Find the self-hosted project",
    summary: "A GitHub link on the pricing page points to the Mokara project.",
    changes: [
      {
        title: "Clearer setup guidance",
        body: "Updated examples help people configure their own installation.",
      },
    ],
  },
  {
    version: "0.2.10",
    date: "2026-10-14",
    title: "Shared people capacity",
    summary: "Paid plans share their people allowance across the account’s owned workspaces.",
    changes: [
      {
        title: "Easier account support",
        body: "Operators can see workspace membership and invitation history together.",
      },
    ],
  },
  {
    version: "0.2.9",
    date: "2026-10-14",
    title: "mDrive for your AI agent",
    summary: "Let an authorized agent read and upload workspace files.",
    changes: [
      {
        title: "Work with documents",
        body: "Agents can access supported PDF and image content through their approved connection.",
      },
    ],
  },
  {
    version: "0.2.8",
    date: "2026-10-14",
    title: "Meet mDrive",
    summary: "Keep workspace files and folders together in a shared team drive.",
    changes: [
      {
        title: "Manage your files",
        body: "Upload, preview, organize and restore files. Task and comment images have a 3 MB per-file limit.",
      },
    ],
  },
  {
    version: "0.2.7",
    date: "2026-10-14",
    title: "Better on smaller screens",
    summary: "Dashboard layouts and touch controls work more comfortably on mobile.",
    changes: [
      {
        title: "Shared storage allowance",
        body: "Storage is shared across all workspaces owned by an account.",
      },
    ],
  },
  {
    version: "0.2.6",
    date: "2026-10-13",
    title: "Clearer connection settings",
    summary: "Browse and filter GitHub repositories and AI connections in Settings.",
    changes: [
      {
        title: "A new homepage layout",
        body: "Interactive examples show how team work and agent workflows fit together.",
      },
    ],
  },
  {
    version: "0.2.5",
    date: "2026-10-13",
    title: "A skill for your AI agent",
    summary: "Install the Mokara skill to help an agent understand common workflows.",
    changes: [
      {
        title: "Clearer GitHub workflows",
        body: "The tool guide explains task creation and linked GitHub issues.",
      },
    ],
  },
  {
    version: "0.2.4",
    date: "2026-10-13",
    title: "Your agent can help with the work",
    summary: "Approve write access so your agent can create and update tasks.",
    changes: [
      {
        title: "You choose the access",
        body: "Connections keep their existing permissions until you explicitly approve more.",
      },
    ],
  },
  {
    version: "0.2.3",
    date: "2026-10-13",
    title: "Connect an AI agent",
    summary: "Connect a compatible agent to Mokara with read access to approved workspaces.",
    changes: [
      {
        title: "Connection guides",
        body: "Find setup instructions and permission guidance in the documentation.",
      },
    ],
  },
  {
    version: "0.2.1",
    date: "2026-10-11",
    title: "More ways to sign in",
    summary: "Sign in with Google or GitHub and claim your username later in Settings.",
    changes: [
      {
        title: "Clearer administration",
        body: "The operator console adds account, workspace and billing views with consistent controls.",
      },
    ],
  },
  {
    version: "0.2.0",
    date: "2026-10-10",
    title: "GitHub meets your task board",
    summary: "Choose active repositories and keep linked task and issue statuses in sync.",
    changes: [
      {
        title: "A refreshed introduction",
        body: "The homepage and pricing pages share a clearer product story.",
      },
    ],
  },
  {
    version: "0.1.9",
    date: "2026-09-30",
    title: "Tidier analytics scrolling",
    summary: "Long progress lists stay within their analytics panels.",
    changes: [
      {
        title: "Easier browsing",
        body: "Scroll through progress without stretching the surrounding page.",
      },
    ],
  },
  {
    version: "0.1.8",
    date: "2026-09-11",
    title: "A guided first visit",
    summary: "A walkthrough introduces the workspace and its everyday controls.",
    changes: [
      {
        title: "Smoother onboarding",
        body: "Follow the tour at your own pace, with more reliable task creation on the board.",
      },
    ],
  },
  {
    version: "0.1.7",
    date: "2026-09-09",
    title: "More consistent plan access",
    summary: "Paid features reflect the access assigned to your account.",
    changes: [
      {
        title: "Clearer billing",
        body: "Operator-provided access is kept distinct from a paid subscription.",
      },
    ],
  },
  {
    version: "0.1.6",
    date: "2026-09-09",
    title: "Mokara administration",
    summary: "A dedicated console helps operators support accounts.",
    changes: [
      { title: "Account support", body: "Operators can find users and manage plan access." },
    ],
  },
  {
    version: "0.1.5",
    date: "2026-09-08",
    title: "Live task updates",
    summary: "See task board changes as your team works.",
    changes: [
      {
        title: "Plans and pricing",
        body: "Browse the public pricing page and view your plan in Settings.",
      },
    ],
  },
  {
    version: "0.1.4",
    date: "2026-09-07",
    title: "Smoother task creation",
    summary: "Create a task even when your current filters show an empty list.",
    changes: [
      { title: "Readable descriptions", body: "Task descriptions retain their line breaks." },
    ],
  },
  {
    version: "0.1.3",
    date: "2026-09-07",
    title: "Starter billing",
    summary: "Choose Starter and manage your subscription from Mokara.",
    changes: [
      {
        title: "Subscription management",
        body: "Open checkout and manage your plan from the billing settings.",
      },
    ],
  },
  {
    version: "0.1.2",
    date: "2026-09-04",
    title: "Notifications and account settings",
    summary: "Keep up with team activity and manage your account from Settings.",
    changes: [
      {
        title: "Your work at a glance",
        body: "Task assignment, notifications and a refreshed analytics view make it easier to follow progress.",
      },
    ],
  },
  {
    version: "0.1.1",
    date: "2026-09-04",
    title: "A new front door for Mokara",
    summary: "A refreshed homepage introduces the workspace.",
    changes: [
      {
        title: "Helpful information",
        body: "Privacy, terms and cookie information are available from the site.",
      },
    ],
  },
  {
    version: "0.1.0",
    date: "2026-09-04",
    title: "The first Mokara workspace",
    summary: "A shared place to organize tasks and work with your team.",
    changes: [
      { title: "Tasks and teams", body: "Create tasks, invite teammates and keep work together." },
    ],
  },
];

export const changelogRoutes = new Hono();
changelogRoutes.get("/", (c) => {
  c.header("Cache-Control", "no-store");
  return c.json({ releases });
});
