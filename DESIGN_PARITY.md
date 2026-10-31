# HighLevel structure and workflow comparison

Reference material is from the [HighLevel Launchpad guide](https://help.gohighlevel.com/support/solutions/articles/155000005436-subaccount-launchpad), [unified task guide](https://help.gohighlevel.com/support/solutions/articles/155000005529), [contact detail layout guide](https://help.gohighlevel.com/support/solutions/articles/155000007588), [contact overlay guide](https://help.gohighlevel.com/support/solutions/articles/155000008627-how-to-use-the-contact-overlay-in-highlevel), and [global search guide](https://help.gohighlevel.com/support/solutions/articles/155000008323-global-search-v2). Screenshots and visual regression comparisons remain pending. Victory Sync uses its own logo, colors, copy, and Lucide icons.

| HighLevel screen | Victory Sync screen | Matches now | Differences and reason |
| --- | --- | --- | --- |
| Agency Dashboard | `/client-portal` agency view | Account health and MRR overview | Full revenue and billing widgets need visual QA. |
| Sub-Accounts | `/sub-accounts`, `/client-portal` | Account switcher and create flow | Search, filter and quick switch placement differ. |
| Account Snapshots | Package template actions | Apply operation | Template editor and update flow are absent. |
| Launchpad | No dedicated route | Onboarding tasks exist | Needs a role-aware checklist screen and shortcuts. |
| Dashboard | `/client-portal/dashboard` | KPI cards and range controls | Widget density and arrangement differ. |
| Conversations | `/conversations`, `/social-inbox` | Thread and channel views | Unified all-channel three-pane view is incomplete. |
| Calendars | `/meeting-scheduler` | Scheduling route | Week/month layout and appointment panel need comparison. |
| Contacts Smart Lists | `/leads`, `/segments` | Lists, segments and import | Column picker, bulk bar and saved-list tabs need comparison. |
| Contact Detail | `/leads/:id` | Fields, activity and tasks | Configurable left panel and persistent center conversation differ. |
| Opportunities | `/pipeline` | Kanban stages and drag | Slide-over editor and list filters need work; pagination is in progress. |
| Payments | `/client-portal/billing` | Invoice list and Stripe portal | Agency/client separation and layout need QA. |
| Marketing | Marketing routes | Planner, templates and DM tools | Navigation grouping differs. |
| Automation | `/automation` | Workflow list and actions | Branch canvas, test mode and execution log are incomplete. |
| Sites | `/landing-pages`, `/forms` | Page editor and forms | Theme editor interaction needs screenshots and accessibility QA. |
| Reputation | `/reputation`, `/client-portal/reviews` | Reviews and requests | Account scoped tabs and trend layout need QA. |
| Reporting | Report routes | Call, social and marketing reports | Unified attribution screen and density differ. |
| Call Center | `/call-queue` | Queue and calling tools | Agent usage and voicemail placement are Victory Sync additions. |
| Settings | `/settings` | Integrations and business settings | Secondary left navigation and forms need redesign. |
| Global search | Current page search | Keyboard shortcut | Search across contacts, opportunities, pages and workflows is missing. |

The public references describe information architecture and interaction patterns. They do not grant use of HighLevel brand assets or source code.
