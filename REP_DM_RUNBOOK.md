# Rep DM tracking operations

This workspace uses the Victory Sync organization automatically. Reps send first messages and follow ups themselves in the social app. The CRM only sends a human written reply after an inbound message exists.

## Connect and reconnect

1. In Settings, open Connected Accounts. An owner configures the Unipile API key and signed webhook secret once. Both are stored in Supabase Vault.
2. The rep reviews the account consent text and chooses **Connect Instagram** or **Connect LinkedIn**. Finish the hosted connection flow, including any platform checkpoint.
3. Check that the account says active and healthy. The worker queues the most recent 30 days of messages, then reconciles chat pages throughout the day. Settings shows webhook and sync health.
4. If the account disconnects, choose **Reconnect** on the same account. History remains in the CRM. A successful reconnection schedules another reconciliation.
5. For Facebook personal accounts or any unconnected account, use **Manual account**. Mark sends in the queue and log replies in the inbox.

## Fix unmatched conversations

1. In Unified Inbox choose the **Suggested** or **Unmatched** filter.
2. Check the participant profile in the social app. Link the correct lead, contact or company. A linked lead must belong to the same rep.
3. If the chat is personal, choose **Personal conversation, ignore**. It is hidden from the default inbox and its message bodies are hidden from owners who are not the assigned rep.
4. If a lead belongs to another rep, have an owner reassign it through the existing lead controls before linking.

## Reporting and recovery

- Social Reports has a 7, 30, 90 or 365 day range, outreach event breakdowns, bookings, revenue, matching quality, and CSV export.
- `social_unipile_sync_state` records the chat cursor, last sync, next sync and last error. It is server only. The worker processes due sync pages and queues message events with stable dedupe keys.
- `social_webhook_events` retains failures with retries and a dead state. Inspect `integration_alerts` for terminal failures.
- To request a new reconciliation, set `next_sync_at=now()` for an account in `social_unipile_sync_state`; keep its `chat_cursor` to resume, or clear it to scan chats again.
- Rotate the Unipile key and webhook secret in Settings. Update the matching secret in the provider dashboard at the same time.
