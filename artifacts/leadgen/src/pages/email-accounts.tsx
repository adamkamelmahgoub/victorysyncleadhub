import { Switch } from "@/components/ui/switch";
import {
  PageHeader,
  PageEmpty,
  WorkspaceDialog,
  workspaceInput,
  workspaceButton,
} from "@/components/page-layout";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Plus } from "lucide-react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
type Domain = {
  id: string;
  domain: string;
  is_primary: boolean;
  allow_primary_sending: boolean;
  dkim_selector: string;
  spf_host: string | null;
  spf_verified: boolean;
  dkim_verified: boolean;
  dmarc_verified: boolean;
  status: string;
};
type Mailbox = {
  id: string | number;
  from_email: string;
  label?: string | null;
  provider: string;
  status: string;
  daily_cap: number;
  warmup_daily_cap?: number | null;
  effective_cap: number;
  sent_today: number;
  email_engine_enabled: boolean;
  bounce_rate_7d: number | string;
  complaint_rate_7d: number | string;
  warmup_started_at: string;
  smtp_host?: string;
  smtp_port?: number;
  smtp_user?: string;
  monitoring_mode?: string;
  inbox_provider?: string;
  inbox_checked_at?: string | null;
};
type Settings = {
  engine_enabled: boolean;
  global_daily_cap: number;
  primary_domains: string[];
  direct_link_domains: string[];
  reset_timezone: string;
};
type Dashboard = {
  settings: Settings;
  domains: Domain[];
  mailboxes: Mailbox[];
  alerts: Array<{ id: number; mailbox_id: string; reason: string }>;
  deploymentEnabled: boolean;
  verificationConfigured: boolean;
};
type Contact = {
  id: string | number;
  firstName: string;
  lastName: string;
  email: string;
};
const input = workspaceInput;
const button = workspaceButton;
export default function EmailAccountsPage() {
  const cache = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, error } = useQuery<Dashboard>({
    queryKey: ["email-infrastructure"],
    queryFn: () => apiFetch("/email/settings"),
    refetchInterval: 30000,
  });
  const [verificationKey, setVerificationKey] = useState("");
  const [domainName, setDomainName] = useState("");
  const [selector, setSelector] = useState("default");
  const [primary, setPrimary] = useState(false);
  const [connection, setConnection] = useState<Mailbox | null>(null);
  const [smtpForm, setSmtpForm] = useState({
    host: "smtp.zoho.com",
    port: 465,
    user: "",
    password: "",
    inboxHost: "imap.zoho.com",
    folder: "INBOX",
  });
  const [signatureEditor, setSignatureEditor] = useState<{
    mailbox: Mailbox;
    value: string;
  } | null>(null);
  const [mailboxEditor, setMailboxEditor] = useState<{
    mailbox: Mailbox;
    label: string;
    dailyCap: number;
    warmupDailyCap: number;
  } | null>(null);
  const [showMailbox, setShowMailbox] = useState(false);
  const [dns, setDns] = useState<Domain | null>(null);
  const [dnsSelector, setDnsSelector] = useState("");
  const [spfHost, setSpfHost] = useState("");
  const [mailbox, setMailbox] = useState({
    fromName: "",
    fromEmail: "",
    provider: "smtp",
    domainId: "",
    smtpHost: "",
    smtpPort: 587,
    smtpUser: "",
    smtpPassword: "",
    apiKey: "",
    resendDomainId: "",
    timezone: "America/New_York",
    dailyCap: 30,
  });
  const [primaryDomains, setPrimaryDomains] = useState<string | null>(null);
  const [directDomains, setDirectDomains] = useState<string | null>(null);
  const [cap, setCap] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sender, setSender] = useState("");
  const { data: verification } = useQuery<{ status: string }>({
    queryKey: ["email-verification", selected?.id],
    enabled: !!selected,
    queryFn: () => apiFetch(`/email/verify/${selected!.id}`),
  });
  const operation = useMutation({
    mutationFn: ({
      path,
      method = "POST",
      payload = {},
    }: {
      path: string;
      method?: string;
      payload?: unknown;
    }) => apiFetch(path, { method, body: JSON.stringify(payload) }),
    onSuccess: () =>
      cache.invalidateQueries({ queryKey: ["email-infrastructure"] }),
  });
  const perform = async (
    path: string,
    payload: unknown = {},
    method = "POST",
  ) => operation.mutateAsync({ path, payload, method });
  async function checkDns(id: string) {
    const result = await perform("/email/domains/" + id + "/verify");
    toast({
      title: result.dnsIssues?.length ? "DNS needs attention" : "DNS verified",
      description: result.dnsIssues?.join("; "),
      variant: result.dnsIssues?.length ? "destructive" : undefined,
    });
    return result;
  }
  async function connectSmtp(e: React.FormEvent) {
    e.preventDefault();
    if (!connection) return;
    await perform("/email/mailboxes/" + connection.id + "/smtp", {
      host: smtpForm.host,
      port: smtpForm.port,
      user: smtpForm.user,
      password: smtpForm.password,
    });
    try {
      await perform("/email/mailboxes/" + connection.id + "/monitor", {
        host: smtpForm.inboxHost,
        user: smtpForm.user,
        password: smtpForm.password,
        folder: smtpForm.folder,
      });
      setSmtpForm({ ...smtpForm, password: "" });
      setConnection(null);
      toast({
        title: "Sending and receiving connections verified",
        description:
          "Bounce and reply monitoring is ready. Verify DNS, then enable your mailbox.",
      });
    } catch (error) {
      toast({
        title: "SMTP connected; Zoho inbox needs attention",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
  }
  async function connectSmtpOnly() {
    if (!connection) return;
    await perform("/email/mailboxes/" + connection.id + "/smtp", {
      host: smtpForm.host,
      port: smtpForm.port,
      user: smtpForm.user,
      password: smtpForm.password,
    });
    await perform("/email/mailboxes/" + connection.id + "/smtp-only");
    setSmtpForm({ ...smtpForm, password: "" });
    setConnection(null);
    toast({
      title: "SMTP-only sending configured",
      description:
        "Record replies, bounces, and unsubscribes manually from the sequence enrollment queue.",
    });
  }
  async function runNext() {
    const result = await perform("/email/run");
    toast({
      title: result.sent
        ? "Email sent"
        : result.state === "unknown"
          ? "Delivery needs review"
          : "Email held",
      description:
        result.reason ??
        (result.sent
          ? "The next eligible queued message was sent."
          : "Check sending flags, recipient verification, local hours, and daily capacity."),
    });
  }
  async function createMailbox(e: React.FormEvent) {
    e.preventDefault();
    await perform("/email/mailboxes", mailbox);
    setMailbox({ ...mailbox, smtpPassword: "", apiKey: "" });
    setShowMailbox(false);
    toast({
      title: "Mailbox connected",
      description: "Sending remains disabled until you enable this mailbox.",
    });
  }
  async function findContacts(e: React.FormEvent) {
    e.preventDefault();
    const result = await apiFetch(
      `/leads?search=${encodeURIComponent(search)}&limit=20`,
    );
    setContacts(result.leads ?? []);
  }
  async function verifyContact() {
    if (!selected) return;
    const result = await perform(`/email/verify/${selected.id}`);
    cache.setQueryData(["email-verification", selected.id], result);
    toast({ title: `Email verification: ${result.status}` });
  }
  async function queueEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    const result = await perform("/email/queue", {
      leadId: selected.id,
      mailboxId: sender || undefined,
      subject,
      body,
    });
    toast({
      title: "Email queued",
      description: `Eligible after ${new Date(result.notBefore).toLocaleString()}; sender limits and local hours still apply.`,
    });
    setBody("");
    setSubject("");
  }
  async function saveSettings(enabled?: boolean) {
    await perform(
      "/email/settings",
      {
        primaryDomains: (
          primaryDomains ??
          data?.settings.primary_domains.join(",") ??
          ""
        )
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        directLinkDomains: (
          directDomains ??
          data?.settings.direct_link_domains.join(",") ??
          ""
        )
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        globalDailyCap: cap ?? data?.settings.global_daily_cap,
        ...(enabled === undefined ? {} : { engineEnabled: enabled }),
      },
      "PATCH",
    );
    toast({ title: "Sending settings saved" });
  }
  if (isLoading)
    return (
      <div className="page-stack">
        <PageHeader
          title="Mailboxes"
          description="Manage your senders, domains, and email delivery in one place."
        />
        <div
          className="workspace-panel p-8 text-sm text-muted-foreground"
          role="status"
        >
          Loading mailboxes…
        </div>
      </div>
    );
  if (error || !data)
    return (
      <div className="page-stack">
        <PageHeader
          title="Mailboxes"
          description="Manage your senders, domains, and email delivery in one place."
        />
        <div className="workspace-panel p-6 text-sm text-red-700" role="alert">
          {error?.message ?? "Mailbox settings unavailable"}
          <Button
            className="mt-4"
            variant="outline"
            onClick={() =>
              void cache.invalidateQueries({
                queryKey: ["email-infrastructure"],
              })
            }
          >
            Try again
          </Button>
        </div>
      </div>
    );
  return (
    <div className="page-stack mailbox-page">
      <PageHeader
        title="Mailboxes"
        description="Manage your senders, domains, and email delivery in one place."
        actions={
          <Button onClick={() => setShowMailbox(true)}>
            <Plus className="h-4 w-4" />
            Connect mailbox
          </Button>
        }
      />
      {!data.deploymentEnabled && (
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
          Live sending is disabled for this deployment. You can configure
          mailboxes and prepare the send queue.
        </p>
      )}
      {data.alerts.length > 0 && (
        <section
          aria-label="Sending alerts"
          className="rounded border border-red-300 bg-red-50 p-4 space-y-2"
        >
          {data.alerts.map((a) => (
            <div key={a.id} className="flex justify-between gap-3 text-sm">
              <span>
                {data.mailboxes.find((m) => String(m.id) === a.mailbox_id)
                  ?.from_email ?? "Mailbox"}
                : {a.reason.replaceAll("_", " ")}
              </span>
              <button
                className={button}
                onClick={() => perform(`/email/alerts/${a.id}/acknowledge`)}
              >
                Acknowledge
              </button>
            </div>
          ))}
        </section>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          ["Connected mailboxes", data.mailboxes.length, "Available senders"],
          [
            "Emails sent today",
            data.mailboxes.reduce((total, m) => total + m.sent_today, 0),
            "Across all mailboxes",
          ],
          [
            "Sending engine",
            data.settings.engine_enabled ? "Enabled" : "Paused",
            data.deploymentEnabled
              ? "Live sending available"
              : "Live sending unavailable",
          ],
        ].map(([title, value, detail]) => (
          <div
            key={title}
            className="workspace-panel p-4 last:col-span-2 sm:p-5 sm:last:col-span-1"
          >
            <p className="text-xs sm:text-sm text-muted-foreground">{title}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
          </div>
        ))}
      </div>
      {operation.error && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {operation.error.message}
        </p>
      )}
      <Tabs defaultValue="mailboxes" className="space-y-5">
        <TabsList aria-label="Mailbox workspace">
          <TabsTrigger value="mailboxes">Mailboxes</TabsTrigger>
          <TabsTrigger value="domains">Domains & DNS</TabsTrigger>
          <TabsTrigger value="sending">Sending settings</TabsTrigger>
          <TabsTrigger value="compose">Verify & compose</TabsTrigger>
        </TabsList>
        <TabsContent value="mailboxes">
          <section className="workspace-panel space-y-5 p-5 sm:p-6">
            <div>
              <h2 className="font-semibold">Connected mailboxes</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Manage sender health, daily limits, and connections.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="workspace-table w-full min-w-[740px] text-left text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="py-2">Mailbox</th>
                    <th>Status</th>
                    <th>Today / effective</th>
                    <th>Sending limits</th>
                    <th>Enabled</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.mailboxes.map((m) => (
                    <tr className="border-b" key={m.id}>
                      <td className="py-3">
                        {m.label && (
                          <span className="block font-medium">{m.label}</span>
                        )}
                        {m.from_email}
                        <span className="block text-xs text-muted-foreground">
                          {m.provider}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize ${m.status === "burned" ? "bg-red-50 text-red-700" : m.status === "paused" ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-700"}`}
                        >
                          {m.status}
                        </span>
                      </td>
                      <td>
                        {m.sent_today} / {m.effective_cap}
                      </td>
                      <td>
                        <span className="block">{m.daily_cap} / day</span>
                        <span className="text-xs text-muted-foreground">
                          Warmup: {m.warmup_daily_cap ?? m.daily_cap} / day
                        </span>
                      </td>
                      <td>
                        <Switch
                          aria-label={`Enable ${m.from_email}`}
                          checked={m.email_engine_enabled}
                          disabled={
                            m.status === "burned" || operation.isPending
                          }
                          onCheckedChange={(checked) => {
                            void perform(
                              `/email/mailboxes/${m.id}`,
                              { engineEnabled: checked },
                              "PATCH",
                            );
                          }}
                        />
                      </td>
                      <td className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Actions for ${m.from_email}`}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              disabled={
                                m.status === "burned" || operation.isPending
                              }
                              onClick={() =>
                                perform(
                                  `/email/mailboxes/${m.id}`,
                                  {
                                    status:
                                      m.status === "paused"
                                        ? "warming"
                                        : "paused",
                                  },
                                  "PATCH",
                                )
                              }
                            >
                              {m.status === "paused" ? "Resume ramp" : "Pause"}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                setMailboxEditor({
                                  mailbox: m,
                                  label: m.label ?? "",
                                  dailyCap: m.daily_cap,
                                  warmupDailyCap:
                                    m.warmup_daily_cap ?? m.daily_cap,
                                })
                              }
                            >
                              Manage
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={operation.isPending}
                              onClick={async () => {
                                const saved = await apiFetch(
                                  `/email/mailboxes/${m.id}/signature`,
                                );
                                setSignatureEditor({
                                  mailbox: m,
                                  value: saved.signature ?? "",
                                });
                              }}
                            >
                              Signature
                            </DropdownMenuItem>
                            {m.provider === "smtp" && (
                              <DropdownMenuItem
                                onClick={() => {
                                  setConnection(m);
                                  setSmtpForm({
                                    host: m.smtp_host ?? "smtp.zoho.com",
                                    port: m.smtp_port ?? 465,
                                    user: m.smtp_user ?? m.from_email,
                                    password: "",
                                    inboxHost:
                                      m.smtp_host === "smtp.gmail.com"
                                        ? "imap.gmail.com"
                                        : "imap.zoho.com",
                                    folder: "INBOX",
                                  });
                                }}
                              >
                                SMTP
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              disabled={operation.isPending}
                              onClick={async () => {
                                if (
                                  confirm(
                                    `Delete ${m.from_email}? Queued emails for it will be cancelled.`,
                                  )
                                )
                                  await perform(
                                    `/email/mailboxes/${m.id}`,
                                    {},
                                    "DELETE",
                                  );
                              }}
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.mailboxes.length && (
              <PageEmpty
                title="Connect your first mailbox"
                description="Add a sender to start preparing your outreach."
                action={
                  <Button onClick={() => setShowMailbox(true)}>
                    Connect mailbox
                  </Button>
                }
              />
            )}
          </section>
        </TabsContent>
        <TabsContent value="domains">
          <section className="workspace-panel space-y-5 p-5 sm:p-6">
            <h2 className="font-semibold">Sending domains</h2>
            <form
              className="flex flex-wrap gap-2 items-end"
              onSubmit={async (e) => {
                e.preventDefault();
                const result = await perform("/email/domains", {
                  domain: domainName,
                  dkimSelector: selector,
                  isPrimary: primary,
                });
                setDomainName("");
                toast({
                  title: result.restored
                    ? "Domain restored"
                    : result.alreadyExists
                      ? "Domain already added"
                      : "Domain added",
                  description: result.restored
                    ? "Check DNS and review mailbox settings before enabling sending."
                    : undefined,
                });
              }}
            >
              <label className="grid gap-2 text-sm font-medium">
                Domain
                <input
                  className={input}
                  required
                  value={domainName}
                  onChange={(e) => setDomainName(e.target.value)}
                  placeholder="outreach-domain.com"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                DKIM selector
                <input
                  className={input}
                  required
                  value={selector}
                  onChange={(e) => setSelector(e.target.value)}
                />
              </label>
              <label className="text-sm">
                <input
                  type="checkbox"
                  checked={primary}
                  onChange={(e) => setPrimary(e.target.checked)}
                />{" "}
                Primary company domain
              </label>
              <button className={button} disabled={operation.isPending}>
                Add domain
              </button>
            </form>
            <div className="overflow-x-auto">
              <table className="workspace-table w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="py-2">Domain</th>
                    <th>SPF</th>
                    <th>DKIM</th>
                    <th>DMARC</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.domains.map((d) => (
                    <tr key={d.id} className="border-b">
                      <td className="py-3">
                        {d.domain}
                        {d.is_primary && (
                          <span className="ml-2 text-red-600">
                            Primary · blocked
                          </span>
                        )}
                      </td>
                      <td>{d.spf_verified ? "Verified" : "Missing"}</td>
                      <td>{d.dkim_verified ? "Verified" : "Missing"}</td>
                      <td>{d.dmarc_verified ? "Verified" : "Missing"}</td>
                      <td>{d.status}</td>
                      <td>
                        <button
                          className={button}
                          disabled={operation.isPending}
                          onClick={() => checkDns(d.id)}
                        >
                          Check DNS
                        </button>
                        <button
                          className={button}
                          onClick={() => {
                            setDns(d);
                            setDnsSelector(d.dkim_selector);
                            setSpfHost(d.spf_host ?? d.domain);
                          }}
                        >
                          DNS setup
                        </button>
                        {d.is_primary && (
                          <label className="block text-xs">
                            <input
                              type="checkbox"
                              checked={d.allow_primary_sending}
                              disabled={operation.isPending}
                              onChange={(e) =>
                                perform(
                                  "/email/domains/" + d.id,
                                  { allowPrimarySending: e.target.checked },
                                  "PATCH",
                                )
                              }
                            />{" "}
                            Allow outreach from this primary domain
                          </label>
                        )}
                        <button
                          className={button}
                          disabled={operation.isPending}
                          onClick={() =>
                            perform("/email/domains/" + d.id, {}, "DELETE")
                          }
                        >
                          Delete domain
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </TabsContent>
        <TabsContent value="sending">
          <section className="workspace-panel space-y-5 p-5 sm:p-6">
            <h2 className="font-semibold">Sending settings</h2>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="grid gap-2 text-sm font-medium">
                Primary company domains (sending requires domain opt-in)
                <input
                  className={input}
                  value={
                    primaryDomains ?? data.settings.primary_domains.join(", ")
                  }
                  onChange={(e) => setPrimaryDomains(e.target.value)}
                  placeholder="victorysync.com"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Global daily ceiling
                <input
                  className={input}
                  type="number"
                  min="1"
                  max="100000"
                  value={cap ?? data.settings.global_daily_cap}
                  onChange={(e) => setCap(Number(e.target.value))}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Approved direct-link domains (optional)
                <input
                  className={input}
                  value={
                    directDomains ??
                    data.settings.direct_link_domains.join(", ")
                  }
                  onChange={(e) => setDirectDomains(e.target.value)}
                  placeholder="example.com"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-3 items-center">
              <button
                className={button}
                disabled={operation.isPending}
                onClick={() => saveSettings()}
              >
                Save settings
              </button>
              <button
                className={button}
                disabled={operation.isPending}
                onClick={() => saveSettings(!data.settings.engine_enabled)}
              >
                {data.settings.engine_enabled
                  ? "Pause all sending"
                  : "Enable sending engine"}
              </button>
              <span className="text-xs text-muted-foreground">
                Global reset: {data.settings.reset_timezone}. Mailboxes also
                need individual enablement.
              </span>
            </div>
          </section>
        </TabsContent>
        <TabsContent value="compose">
          <section className="workspace-panel space-y-5 p-5 sm:p-6">
            <h2 className="font-semibold">Verify and queue email</h2>
            <p className="text-sm">
              Address verification:{" "}
              {data.verificationConfigured
                ? "configured"
                : "API key required before sending to new contacts"}
            </p>
            <details className="rounded-xl border border-border p-4">
              <summary className="cursor-pointer text-sm font-medium">
                Address verification settings
              </summary>
              <div className="mt-4">
                {" "}
                <form
                  className="flex flex-wrap gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await perform("/email/settings/verification", {
                      apiKey: verificationKey,
                    });
                    setVerificationKey("");
                    toast({ title: "Verification key saved securely" });
                  }}
                >
                  <input
                    className={input}
                    type="password"
                    autoComplete="new-password"
                    aria-label="ZeroBounce API key"
                    placeholder="ZeroBounce API key"
                    value={verificationKey}
                    onChange={(e) => setVerificationKey(e.target.value)}
                    required
                  />
                  <button className={button} disabled={operation.isPending}>
                    Save verification key
                  </button>
                  <a
                    className="text-xs underline"
                    href="https://www.zerobounce.net/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Get your key from ZeroBounce
                  </a>
                </form>
              </div>
            </details>
            <button
              className={button}
              disabled={
                operation.isPending ||
                !data.deploymentEnabled ||
                !data.settings.engine_enabled
              }
              onClick={runNext}
            >
              Send next queued email
            </button>
            <p className="text-xs text-muted-foreground">
              Sends at most one eligible email, after checking the receiving
              inbox. Sending hours, warmup, verification and daily caps still
              apply. A recurring worker is needed for unattended sending.
            </p>
            <form className="flex flex-wrap gap-2" onSubmit={findContacts}>
              <input
                aria-label="Find contact"
                className={input}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Find a contact by name, company, or email"
                required
              />
              <button className={button}>Search</button>
            </form>
            {contacts.length > 0 && (
              <select
                aria-label="Choose contact"
                className={input}
                value={String(selected?.id ?? "")}
                onChange={(e) =>
                  setSelected(
                    contacts.find((l) => String(l.id) === e.target.value) ??
                      null,
                  )
                }
              >
                <option value="">Choose a contact</option>
                {contacts.map((l) => (
                  <option key={l.id} value={String(l.id)}>
                    {l.firstName} {l.lastName} · {l.email}
                  </option>
                ))}
              </select>
            )}
            {selected && (
              <>
                <div className="flex flex-wrap gap-3 items-center text-sm">
                  <span>
                    {selected.email} · {verification?.status ?? "unverified"}
                  </span>
                  <button
                    className={button}
                    disabled={operation.isPending}
                    onClick={verifyContact}
                  >
                    Verify address
                  </button>
                </div>
                <form onSubmit={queueEmail} className="space-y-3">
                  <label className="grid gap-2 text-sm font-medium">
                    Sender
                    <select
                      className={input}
                      value={sender}
                      onChange={(e) => setSender(e.target.value)}
                    >
                      <option value="">Rotate across active mailboxes</option>
                      {data.mailboxes
                        .filter(
                          (m) =>
                            m.email_engine_enabled &&
                            ["warming", "active"].includes(m.status),
                        )
                        .map((m) => (
                          <option key={m.id} value={String(m.id)}>
                            {m.from_email} · {m.status}
                          </option>
                        ))}
                    </select>
                  </label>
                  <input
                    className={input}
                    aria-label="Email subject"
                    required
                    placeholder="Subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  />
                  <textarea
                    className={`${input} min-h-36`}
                    aria-label="Plain text email body"
                    required
                    placeholder="Plain text message. The unsubscribe line is added automatically."
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                  />
                  <button
                    className={button}
                    disabled={
                      operation.isPending || verification?.status !== "valid"
                    }
                  >
                    Queue email
                  </button>
                  <p className="text-xs text-muted-foreground">
                    Held outside 8 AM–5 PM on the contact’s weekdays. No HTML,
                    tracking pixels, or tracked links.
                  </p>
                </form>
              </>
            )}
          </section>
        </TabsContent>
      </Tabs>
      <WorkspaceDialog
        open={showMailbox}
        onClose={() => {
          setShowMailbox(false);
          setMailbox({ ...mailbox, smtpPassword: "", apiKey: "" });
        }}
        title="Connect mailbox"
        description="Choose your provider and add the sender's connection details."
      >
        {showMailbox && (
          <form
            onSubmit={createMailbox}
            className="grid gap-3 rounded border p-4 md:grid-cols-3"
          >
            <label className="grid gap-2 text-sm font-medium">
              Transport
              <select
                className={input}
                value={mailbox.provider}
                onChange={(e) =>
                  setMailbox({
                    ...mailbox,
                    provider: e.target.value,
                    smtpPassword: "",
                    apiKey: "",
                  })
                }
              >
                <option value="smtp">SMTP mailbox</option>
                <option value="resend">Resend API</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Sending domain
              <select
                className={input}
                required
                value={mailbox.domainId}
                onChange={(e) =>
                  setMailbox({ ...mailbox, domainId: e.target.value })
                }
              >
                <option value="">Choose domain</option>
                {data.domains
                  .filter(
                    (d) =>
                      (!d.is_primary || d.allow_primary_sending) &&
                      d.status !== "burned",
                  )
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.domain}
                    </option>
                  ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Sender email
              <input
                className={input}
                required
                type="email"
                value={mailbox.fromEmail}
                onChange={(e) =>
                  setMailbox({ ...mailbox, fromEmail: e.target.value })
                }
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Sender name
              <input
                className={input}
                required
                value={mailbox.fromName}
                onChange={(e) =>
                  setMailbox({ ...mailbox, fromName: e.target.value })
                }
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Daily cap
              <input
                className={input}
                type="number"
                min="1"
                max="10000"
                required
                value={mailbox.dailyCap}
                onChange={(e) =>
                  setMailbox({ ...mailbox, dailyCap: Number(e.target.value) })
                }
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Mailbox midnight timezone
              <select
                className={input}
                value={mailbox.timezone}
                onChange={(e) =>
                  setMailbox({ ...mailbox, timezone: e.target.value })
                }
              >
                {[
                  "America/New_York",
                  "America/Chicago",
                  "America/Denver",
                  "America/Phoenix",
                  "America/Los_Angeles",
                  "Africa/Cairo",
                  "UTC",
                ].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            {mailbox.provider === "smtp" ? (
              <>
                <label className="grid gap-2 text-sm font-medium">
                  SMTP host
                  <input
                    className={input}
                    required
                    value={mailbox.smtpHost}
                    onChange={(e) =>
                      setMailbox({ ...mailbox, smtpHost: e.target.value })
                    }
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium">
                  TLS port
                  <select
                    className={input}
                    value={mailbox.smtpPort}
                    onChange={(e) =>
                      setMailbox({
                        ...mailbox,
                        smtpPort: Number(e.target.value),
                      })
                    }
                  >
                    <option value="587">587 · STARTTLS</option>
                    <option value="465">465 · TLS</option>
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-medium">
                  SMTP username
                  <input
                    className={input}
                    required
                    value={mailbox.smtpUser}
                    onChange={(e) =>
                      setMailbox({ ...mailbox, smtpUser: e.target.value })
                    }
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium">
                  SMTP password / app password
                  <input
                    className={input}
                    type="password"
                    autoComplete="new-password"
                    required
                    value={mailbox.smtpPassword}
                    onChange={(e) =>
                      setMailbox({ ...mailbox, smtpPassword: e.target.value })
                    }
                  />
                </label>
              </>
            ) : (
              <label className="grid gap-2 text-sm font-medium">
                Resend API key
                <input
                  className={input}
                  type="password"
                  autoComplete="new-password"
                  required
                  value={mailbox.apiKey}
                  onChange={(e) =>
                    setMailbox({ ...mailbox, apiKey: e.target.value })
                  }
                />
              </label>
            )}
            {mailbox.provider === "resend" && (
              <label className="grid gap-2 text-sm font-medium">
                Resend domain ID
                <input
                  className={input}
                  required
                  value={mailbox.resendDomainId}
                  onChange={(e) =>
                    setMailbox({ ...mailbox, resendDomainId: e.target.value })
                  }
                />
              </label>
            )}
            <div className="md:col-span-3">
              <button className={button} disabled={operation.isPending}>
                Save encrypted credentials
              </button>
              <p className="mt-2 text-xs text-muted-foreground">
                The ramp is 5/day, 15/day, and 25/day for the first three weeks,
                bounded by your daily cap. New mailboxes start disabled.
              </p>
            </div>
          </form>
        )}
      </WorkspaceDialog>
      <WorkspaceDialog
        open={!!dns}
        onClose={() => setDns(null)}
        title="Domain setup"
        description="Configure and verify your sending domain."
      >
        {dns && (
          <section className="rounded-lg border p-4 space-y-3">
            <h2 className="font-semibold">DNS setup: {dns.domain}</h2>
            <p className="text-sm">
              Publish the records supplied by your email provider in your DNS
              host's dashboard (for example Cloudflare or your registrar). This
              portal checks the published records; it does not change your DNS
              account.
            </p>
            <table className="workspace-table w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr>
                  <th>Record</th>
                  <th>Host / name</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>SPF ? TXT</td>
                  <td>{spfHost}</td>
                  <td>
                    Use your provider's SPF value. Merge authorized senders into
                    one SPF record; do not add a second SPF record.
                  </td>
                </tr>
                <tr>
                  <td>DKIM ? TXT or provider CNAME</td>
                  <td>
                    {dnsSelector}._domainkey.{dns.domain}
                  </td>
                  <td>
                    Copy the exact public key or CNAME target from your sending
                    provider.
                  </td>
                </tr>
                <tr>
                  <td>DMARC ? TXT</td>
                  <td>_dmarc.{dns.domain}</td>
                  <td>
                    Use your organization's DMARC policy, for example v=DMARC1;
                    p=none; during setup.
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="text-sm">
              DNS hosts may require relative names (@, _dmarc, or
              selector._domainkey). Keep existing mail routing records. For
              Resend receiving, also publish the MX records from its Receiving
              setup before enabling reply monitoring.
            </p>
            <label className="block text-xs">
              SPF host (your provider may use a return-path subdomain)
              <input
                className={input}
                value={spfHost}
                onChange={(e) => setSpfHost(e.target.value)}
              />
            </label>
            <label className="block text-xs">
              DKIM selector
              <input
                className={input}
                value={dnsSelector}
                onChange={(e) => setDnsSelector(e.target.value)}
              />
            </label>
            <button
              className={button}
              disabled={operation.isPending}
              onClick={async () => {
                await perform(
                  "/email/domains/" + dns.id,
                  { spfHost, dkimSelector: dnsSelector },
                  "PATCH",
                );
                await checkDns(dns.id);
                setDns(null);
              }}
            >
              Save and check DNS
            </button>
            <button className={button} onClick={() => setDns(null)}>
              Close
            </button>
            <p className="text-xs text-muted-foreground">
              Changing DNS hosts pauses linked mailboxes and sequences. After
              all three checks pass, resume and enable the mailboxes. Deleting a
              domain disables its mailboxes and retains delivery history.
            </p>
          </section>
        )}
      </WorkspaceDialog>
      <WorkspaceDialog
        open={!!mailboxEditor}
        onClose={() => setMailboxEditor(null)}
        title="Mailbox settings"
        description="Update the sender label and daily limits."
      >
        {mailboxEditor && (
          <form
            className="rounded-lg border bg-card p-4 space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              await perform(
                `/email/mailboxes/${mailboxEditor.mailbox.id}`,
                {
                  label: mailboxEditor.label,
                  dailyCap: mailboxEditor.dailyCap,
                  warmupDailyCap: mailboxEditor.warmupDailyCap,
                },
                "PATCH",
              );
              setMailboxEditor(null);
              toast({ title: "Mailbox settings saved" });
            }}
          >
            <h2 className="font-semibold">
              Manage {mailboxEditor.mailbox.from_email}
            </h2>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="grid gap-2 text-sm font-medium">
                Mailbox label
                <input
                  className={input}
                  value={mailboxEditor.label}
                  onChange={(e) =>
                    setMailboxEditor({
                      ...mailboxEditor,
                      label: e.target.value,
                    })
                  }
                  placeholder="Primary outbound"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Maximum emails per day
                <input
                  className={input}
                  type="number"
                  min="1"
                  max="10000"
                  value={mailboxEditor.dailyCap}
                  onChange={(e) =>
                    setMailboxEditor({
                      ...mailboxEditor,
                      dailyCap: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Warmup emails per day
                <input
                  className={input}
                  type="number"
                  min="1"
                  max="10000"
                  value={mailboxEditor.warmupDailyCap}
                  onChange={(e) =>
                    setMailboxEditor({
                      ...mailboxEditor,
                      warmupDailyCap: Number(e.target.value),
                    })
                  }
                />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              The warmup target can lower the automatic safety ramp. It cannot
              bypass the week 1–3 limits of 5, 15, and 25.
            </p>
            <button className={button}>Save mailbox</button>
            <button
              type="button"
              className={button}
              onClick={() => setMailboxEditor(null)}
            >
              Cancel
            </button>
          </form>
        )}
      </WorkspaceDialog>
      <WorkspaceDialog
        open={!!signatureEditor}
        onClose={() => setSignatureEditor(null)}
        title="Email signature"
        description="The signature is included in messages from this mailbox."
      >
        {signatureEditor && (
          <form
            className="rounded-lg border bg-card p-4 space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              await perform(
                `/email/mailboxes/${signatureEditor.mailbox.id}/signature`,
                { signature: signatureEditor.value },
                "PATCH",
              );
              toast({
                title: "Email signature saved",
                description:
                  "It will appear above the unsubscribe line on every email from this mailbox.",
              });
              setSignatureEditor(null);
            }}
          >
            <h2 className="font-semibold">
              Signature for {signatureEditor.mailbox.from_email}
            </h2>
            <textarea
              className={`${input} min-h-32`}
              aria-label="Plain text email signature"
              placeholder={"Adam Kamel\nVictory Sync\nPhone or website"}
              value={signatureEditor.value}
              onChange={(e) =>
                setSignatureEditor({
                  ...signatureEditor,
                  value: e.target.value,
                })
              }
            />
            <p className="text-xs text-muted-foreground">
              Plain text only. The unsubscribe line is added automatically after
              this signature.
            </p>
            <div className="flex flex-wrap gap-2">
              <button className={button} disabled={operation.isPending}>
                Save signature
              </button>
              <button
                type="button"
                className={button}
                onClick={() => setSignatureEditor(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </WorkspaceDialog>
      <WorkspaceDialog
        open={!!connection}
        onClose={() => {
          setConnection(null);
          setSmtpForm({ ...smtpForm, password: "" });
        }}
        title="Sending & receiving connection"
        description="Verify your provider credentials and inbox monitoring."
      >
        {connection && (
          <form
            onSubmit={connectSmtp}
            className="rounded-lg border bg-card p-4 space-y-3"
          >
            <h2 className="font-semibold">Connect {connection.from_email}</h2>
            <p className="text-sm">
              Use SMTP-only mode when your plan does not include IMAP. You must
              then record replies, bounces, and unsubscribes manually before
              another sequence email is due.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={button}
                onClick={() =>
                  setSmtpForm({
                    host: "smtp.zoho.com",
                    port: 465,
                    user: connection.from_email,
                    password: "",
                    inboxHost: "imap.zoho.com",
                    folder: "INBOX",
                  })
                }
              >
                Zoho standard/free
              </button>
              <button
                type="button"
                className={button}
                onClick={() =>
                  setSmtpForm({
                    host: "smtppro.zoho.com",
                    port: 465,
                    user: connection.from_email,
                    password: "",
                    inboxHost: "imappro.zoho.com",
                    folder: "INBOX",
                  })
                }
              >
                Zoho paid organization
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium">
                SMTP host
                <input
                  className={input}
                  required
                  value={smtpForm.host}
                  onChange={(e) =>
                    setSmtpForm({ ...smtpForm, host: e.target.value })
                  }
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                SMTP TLS port
                <select
                  className={input}
                  value={smtpForm.port}
                  onChange={(e) =>
                    setSmtpForm({ ...smtpForm, port: Number(e.target.value) })
                  }
                >
                  <option value={465}>465</option>
                  <option value={587}>587</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Provider login email
                <input
                  className={input}
                  required
                  value={smtpForm.user}
                  onChange={(e) =>
                    setSmtpForm({ ...smtpForm, user: e.target.value })
                  }
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Provider app password
                <input
                  className={input}
                  required
                  type="password"
                  autoComplete="new-password"
                  value={smtpForm.password}
                  onChange={(e) =>
                    setSmtpForm({ ...smtpForm, password: e.target.value })
                  }
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Receiving IMAP host (TLS port 993)
                <input
                  className={input}
                  required
                  value={smtpForm.inboxHost}
                  onChange={(e) =>
                    setSmtpForm({ ...smtpForm, inboxHost: e.target.value })
                  }
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Receiving folder
                <input
                  className={input}
                  required
                  value={smtpForm.folder}
                  onChange={(e) =>
                    setSmtpForm({ ...smtpForm, folder: e.target.value })
                  }
                />
              </label>
            </div>
            <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs">
              <strong>Before connecting:</strong> In Zoho Mail open Settings →
              Mail Accounts → {connection.from_email} → IMAP, enable IMAP
              Access, and save. If two-factor authentication is enabled, use a
              Zoho application-specific password here.
            </div>
            <p className="text-xs text-muted-foreground">
              Use the exact server configuration shown in Zoho. Standard/free
              organizations commonly use imap.zoho.com; paid organizations
              commonly use imappro.zoho.com. Inbox monitoring detects matched
              permanent delivery failures; complaint and open data are
              unavailable.
            </p>
            <button className={button} disabled={operation.isPending}>
              Verify SMTP + IMAP
            </button>
            <button
              type="button"
              className={button}
              disabled={operation.isPending || !smtpForm.password}
              onClick={connectSmtpOnly}
            >
              Use SMTP only
            </button>
            <button
              type="button"
              className={button}
              onClick={() => {
                setSmtpForm({ ...smtpForm, password: "" });
                setConnection(null);
              }}
            >
              Cancel
            </button>
          </form>
        )}
      </WorkspaceDialog>
    </div>
  );
}
