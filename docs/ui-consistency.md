# Workspace UI conventions

The workspace shell owns the page width, outer padding, navigation, and scrolling. Pages should not add another padded `main`, negative outer margins, or a viewport-height container.

- Use `page-stack` for the page root and `PageHeader` for the title, description, and actions. Pages with editable titles or custom header controls can use `PageTitle` and `PageDescription`.
- Use the shared `Card` or `workspace-panel` for content surfaces. Keep related controls together; move secondary setup forms into tabs, disclosure sections, or `WorkspaceDialog`.
- Use shared buttons, inputs, selects, and tabs. Native forms can use `workspaceInput`, `workspaceButton`, and `workspace-control`.
- Use `Table` or `workspace-table` inside a container with horizontal scrolling. Wide data tables should scroll inside their panel, without widening the page.
- Allow action rows to wrap. Use responsive grids and `min-w-0` on flexible content. Do not shrink labels or buttons to fit a desktop layout onto a phone.
- Keep loading, error, and empty states in the same page structure. Give icon-only actions accessible labels and preserve visible keyboard focus.

## Mailboxes

Mailboxes, Domains & DNS, Sending settings, and Verify & compose are separate tabs. Connection, DNS, limits, signature, and SMTP/IMAP forms open in dialogs. Each sender has an actions menu and an explicit sending toggle.

## Call queue

The queue uses a searchable contact list and one visible call editor. Call drafts remain mounted when switching contacts. Selecting an outcome does not submit it: the operator saves it explicitly. Existing callback timing, terminal outcome, and retry request-ID rules remain in place.

## Verification

The UI was checked in an isolated local copy with mock authentication and intercepted API responses. These checks do not verify live provider connections or production delivery.

- Workspace library compilation, frontend TypeScript checking, and the Vite production build.
- Browser checks of 38 primary routes at 1440px and 390px widths, including headers, render failures, and page-level overflow.
- Mailbox tabs, dialog opening/closing, signature editing, and email composition.
- Call draft retention, callback-time validation, and submitted call outcome payloads.
