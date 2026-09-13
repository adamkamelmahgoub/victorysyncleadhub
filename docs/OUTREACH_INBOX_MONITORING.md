# Zoho SMTP and inbox monitoring

Applied migration: `supabase/migrations/20260916_outreach_inbox_bounces.sql`. Its matching rollback restores the previous webhook-only SMTP guards and disables inbox-monitored mailboxes.

In Mailboxes, choose Configure SMTP and inbox, then Use Zoho settings. Enter the Zoho app password in the portal. SMTP authentication and an IMAP scan must both succeed before inbox monitoring can be enabled. Use the regional/account-specific host shown in Zoho if the defaults differ. Gmail's existing password cannot authenticate with Zoho.

In Cloudflare, publish the DKIM TXT record and selector supplied by Zoho Admin Console. Keep exactly one DMARC policy; consolidate reporting addresses without weakening your intended policy. The existing SPF already authorizes Zoho. Check DNS in the portal after publishing.

Add a ZeroBounce API key in Mailboxes. It is encrypted at rest. Verify recipients before queueing email. Enable sending and then the mailbox. Send next queued email dispatches one eligible message and does not require a worker token. Automated scheduling still requires an external scheduler calling the protected process/poll endpoints with OUTREACH_WORKER_TOKEN.

Inbox mode parses structured delivery failure reports and matches their original message ID and recipient before suppressing an address. It checks replies before dispatch and holds sending if the inbox check is stale or fails. Zoho IMAP does not provide a complete spam complaint feed; complaint data is explicitly marked unavailable. Webhook mode remains available for signed provider events.

Sending windows, suppression, verification, warmup limits, and final enrollment checks remain enforced. No email is sent by connection verification.
