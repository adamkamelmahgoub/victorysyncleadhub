# Company deletion and Trash

Open a company and choose **Delete company**, or select company rows and choose **Delete selected** (up to 100 at a time). Confirm **Move to Trash**. The Companies toolbar has a **Trash** button for restoring records.

Deletion is reversible: company records, people, activity, tasks and file attachments remain stored. Deleted companies and their linked records are hidden from active company views and reports through database row-level security. Their inbound trial capacity is released. Restoring a booked or active trial requires its original dates to be available; overlapping restores fail without changing the record. Viewer, inactive, client and restricted accounts cannot delete or restore companies.

Apply [20260907_company_trash.sql](../supabase/migrations/20260907_company_trash.sql) after the existing company migrations. This rerunnable migration adds a deletion timestamp, restrictive visibility policies and guarded Trash functions. It updates the trial-overlap constraint to exclude deleted companies. It does not delete existing records or storage objects. The app reports the migration name if it has not been applied.

The migration was tested against disposable PostgreSQL, including preserved child records, direct-write restrictions, hidden files and tasks, permission checks, freed trial capacity and conflicting restores. Browser checks covered confirmation, cancellation, deletion, Trash and restoration with mocked API data. No live companies were deleted and the production migration was not run from this environment.
