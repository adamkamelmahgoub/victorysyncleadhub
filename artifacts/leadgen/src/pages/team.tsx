import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users, UserPlus, Shield, MoreHorizontal, Mail,
  CheckCircle, Clock, XCircle, Trash2, Edit3, Search, Crown, Copy,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { asArray } from "@/lib/data-shape";
import { ALL_PAGE_PERMISSION_KEYS, PAGE_PERMISSIONS } from "@/lib/permissions";

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "agent" | "member" | "viewer";
  clientAccountId: string | null;
  status: "active" | "invited" | "deactivated";
  createdAt: string;
  pagePermissions: string[] | null;
}

interface ClientAccount {
  id: string;
  name: string;
  slug: string;
}

interface InviteResponse {
  member: TeamMember;
  invite: {
    code: string;
    email: string;
    name: string;
    expiresAt: string;
    url?: string;
  };
}

const ROLE_STYLES: Record<string, string> = {
  owner: "bg-purple-100 text-purple-700 border-purple-200",
  admin: "bg-blue-100 text-blue-700 border-blue-200",
  agent: "bg-orange-100 text-orange-700 border-orange-200",
  member: "bg-green-100 text-green-700 border-green-200",
  viewer: "bg-gray-100 text-gray-600 border-gray-200",
};

const STATUS_STYLES: Record<string, { label: string; class: string; icon: React.ElementType }> = {
  active: { label: "Active", class: "text-green-600", icon: CheckCircle },
  invited: { label: "Invited", class: "text-amber-600", icon: Clock },
  deactivated: { label: "Deactivated", class: "text-gray-400", icon: XCircle },
};

const ROLE_PERMS: Record<string, string[]> = {
  owner: ["Full access to all features and billing"],
  admin: ["Manage contacts, campaigns, automations, team (cannot manage billing)"],
  agent: ["Work only for the assigned client account"],
  member: ["Manage contacts, campaigns, automations (cannot manage team)"],
  viewer: ["Read-only access to all data"],
};

export default function Team() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [editMember, setEditMember] = useState<TeamMember | null>(null);
  const [form, setForm] = useState({ name: "", email: "", role: "member" as TeamMember["role"], clientAccountId: null as string | null, pagePermissions: [...ALL_PAGE_PERMISSION_KEYS] });
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [createdInvite, setCreatedInvite] = useState<InviteResponse["invite"] | null>(null);

  const { data: membersResponse = [], isLoading, error: membersError } = useQuery<TeamMember[]>({
    queryKey: ["team"],
    queryFn: async () => {
      await apiFetch("/auth/sync-session", {
        method: "POST",
        body: JSON.stringify({ orgId: window.sessionStorage.getItem("victorysync_org_id") }),
      });
      return apiFetch("/team");
    },
  });
  const members = asArray<TeamMember>(membersResponse);
  const { data: accountsResponse = [], isLoading: accountsLoading } = useQuery<ClientAccount[]>({
    queryKey: ["sub-accounts"],
    queryFn: () => apiFetch("/sub-accounts"),
  });
  const clientAccounts = asArray<ClientAccount>(accountsResponse);

  const invite = useMutation({
    mutationFn: (body: typeof form) => apiFetch("/team/invite", { method: "POST", body: JSON.stringify(body) }) as Promise<InviteResponse>,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["team"] });
      setCreatedInvite(data.invite);
      setForm({ name: "", email: "", role: "member", clientAccountId: null, pagePermissions: [...ALL_PAGE_PERMISSION_KEYS] });
    },
  });

  const update = useMutation({
    mutationFn: ({ id, ...body }: Partial<TeamMember> & { id: string }) =>
      apiFetch(`/team/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["team"] }); setEditMember(null); setOpenMenu(null); },
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/team/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["team"] }); setOpenMenu(null); },
  });
  const resend = useMutation({
    mutationFn: (id: string) => apiFetch(`/team/${id}/resend`, { method: "POST" }) as Promise<InviteResponse["invite"]>,
    onSuccess: (data) => { setCreatedInvite(data); setShowInvite(true); },
  });

  const filtered = members.filter((m) =>
    !search || m.name.toLowerCase().includes(search.toLowerCase()) || m.email.toLowerCase().includes(search.toLowerCase())
  );

  const stats = [
    { label: "Total Members", value: members.length, icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Active", value: members.filter((m) => m.status === "active").length, icon: CheckCircle, color: "text-green-600", bg: "bg-green-50" },
    { label: "Pending Invite", value: members.filter((m) => m.status === "invited").length, icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
    { label: "Admins", value: members.filter((m) => m.role === "admin" || m.role === "owner").length, icon: Shield, color: "text-purple-600", bg: "bg-purple-50" },
  ];

  return (
    <>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Team Management</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Manage your team members and their permissions</p>
          </div>
          <button
            onClick={() => setShowInvite(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
          >
            <UserPlus className="w-4 h-4" /> Invite Member
          </button>
        </div>

        <div className="grid grid-cols-4 gap-4">
          {stats.map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-border shadow-sm p-4 flex gap-3 items-center">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.bg} flex-shrink-0`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <div>
                <div className="text-xl font-bold text-foreground">{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search members..."
              className="pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-white outline-none focus:ring-2 focus:ring-primary/30 w-64"
            />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
          {membersError && (
            <div className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">
              Team synchronization failed: {membersError instanceof Error ? membersError.message : String(membersError)}
            </div>
          )}
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left text-xs font-semibold text-muted-foreground px-5 py-3">Member</th>
                <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Role</th>
                <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Status</th>
                <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Joined</th>
                <th className="text-right text-xs font-semibold text-muted-foreground px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={5} className="text-center py-12 text-sm text-muted-foreground">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-16 text-center">
                    <Users className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
                    <p className="text-sm font-medium text-foreground">No team members yet</p>
                    <button onClick={() => setShowInvite(true)} className="text-sm text-primary hover:underline mt-1">Invite your first member</button>
                  </td>
                </tr>
              ) : filtered.map((m) => {
                const statusInfo = STATUS_STYLES[m.status] ?? STATUS_STYLES.active!;
                const StatusIcon = statusInfo.icon;
                return (
                  <tr key={m.id} className="hover:bg-muted/20 transition-colors relative">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary flex-shrink-0">
                          {m.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold text-foreground">{m.name}</span>
                            {m.role === "owner" && <Crown className="w-3.5 h-3.5 text-amber-500" />}
                          </div>
                          <div className="text-xs text-muted-foreground">{m.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center text-xs px-2.5 py-0.5 rounded-full font-medium border capitalize ${ROLE_STYLES[m.role] ?? ""}`}>
                        {m.role}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className={`flex items-center gap-1.5 text-xs font-medium ${statusInfo.class}`}>
                        <StatusIcon className="w-3.5 h-3.5" />
                        {statusInfo.label}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-muted-foreground">
                      {new Date(m.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1 relative">
                        {m.status === "invited" && (
                          <button
                            onClick={() => resend.mutate(m.id)}
                            disabled={resend.isPending}
                            className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-border hover:bg-muted text-muted-foreground"
                          >
                            <Mail className="w-3 h-3" /> Resend
                          </button>
                        )}
                        <button
                          onClick={() => setOpenMenu(openMenu === m.id ? null : m.id)}
                          className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                        {openMenu === m.id && (
                          <div className="absolute right-0 top-8 z-20 bg-white border border-border rounded-xl shadow-lg py-1 w-44">
                            <button
                              onClick={() => { setEditMember(m); setOpenMenu(null); }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-muted-foreground" /> Edit Role
                            </button>
                            {m.status !== "deactivated" ? (
                              <button
                                onClick={() => update.mutate({ id: m.id, status: "deactivated" })}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2 text-amber-600"
                              >
                                <XCircle className="w-3.5 h-3.5" /> Deactivate
                              </button>
                            ) : (
                              <button
                                onClick={() => update.mutate({ id: m.id, status: "active" })}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2 text-green-600"
                              >
                                <CheckCircle className="w-3.5 h-3.5" /> Reactivate
                              </button>
                            )}
                            <div className="border-t border-border my-1" />
                            <button
                              onClick={() => remove.mutate(m.id)}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 flex items-center gap-2 text-red-500"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Remove
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Roles reference */}
        <div className="bg-white rounded-xl border border-border shadow-sm p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Role Permissions</h3>
          <div className="grid grid-cols-4 gap-4">
            {(["owner", "admin", "agent", "member", "viewer"] as const).map((role) => (
              <div key={role} className="p-3 rounded-lg bg-muted/40 border border-border">
                <div className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium border mb-2 capitalize ${ROLE_STYLES[role]}`}>
                  {role}
                </div>
                <ul className="text-xs text-muted-foreground space-y-1">
                  {(ROLE_PERMS[role] ?? []).map((p) => (
                    <li key={p} className="flex items-start gap-1"><CheckCircle className="w-3 h-3 text-green-500 mt-0.5 flex-shrink-0" />{p}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Invite modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowInvite(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-border" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Invite Team Member</h3>
              <button onClick={() => { setShowInvite(false); setCreatedInvite(null); }} className="text-muted-foreground hover:text-foreground">x</button>
            </div>
            {createdInvite ? (
              <>
                <div className="p-6 space-y-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">Invite created for {createdInvite.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">{createdInvite.email}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/40 p-3">
                    <label className="text-xs font-medium text-muted-foreground">Invite code</label>
                    <div className="mt-1 flex items-center gap-2">
                      <code className="flex-1 text-sm font-semibold text-foreground break-all">{createdInvite.code}</code>
                      <button type="button" onClick={() => void navigator.clipboard.writeText(createdInvite.code)} className="p-2 rounded border border-border hover:bg-white" title="Copy code">
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {createdInvite.url && (
                    <div className="rounded-lg border border-border bg-muted/40 p-3">
                      <label className="text-xs font-medium text-muted-foreground">Invite link</label>
                      <div className="mt-1 flex items-center gap-2">
                        <input readOnly value={createdInvite.url} className="flex-1 text-xs bg-transparent outline-none" />
                        <button type="button" onClick={() => void navigator.clipboard.writeText(createdInvite.url ?? "")} className="p-2 rounded border border-border hover:bg-white" title="Copy link">
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    This code expires {new Date(createdInvite.expiresAt).toLocaleString()} and can only be used once by this exact name and email.
                  </p>
                </div>
                <div className="px-6 pb-6 flex justify-end">
                  <button onClick={() => { setShowInvite(false); setCreatedInvite(null); }} className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90">Done</button>
                </div>
              </>
            ) : (
              <>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1.5">Full Name</label>
                    <input
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="Enter full name"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1.5">Email Address</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="jane@company.com"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-2">Role</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["admin", "agent", "member", "viewer"] as const).map((role) => (
                        <button
                          key={role}
                          onClick={() => setForm((f) => ({ ...f, role }))}
                          className={`p-3 border rounded-xl text-left transition-colors ${form.role === role ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                        >
                          <div className={`text-xs font-semibold capitalize mb-0.5 ${form.role === role ? "text-primary" : "text-foreground"}`}>{role}</div>
                          <div className="text-[10px] text-muted-foreground leading-tight">{(ROLE_PERMS[role] ?? [])[0]?.split("(")[0]}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  {form.role === "agent" && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1.5">Assigned client *</label>
                      <select
                        value={form.clientAccountId ?? ""}
                        onChange={(e) => setForm((f) => ({ ...f, clientAccountId: e.target.value || null }))}
                        disabled={accountsLoading}
                        className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white"
                      >
                        <option value="">{accountsLoading ? "Loading clients..." : "Select a client account"}</option>
                        {clientAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                      </select>
                      {!accountsLoading && clientAccounts.length === 0 && <p className="mt-1 text-xs text-amber-600">Create a client account before inviting an agent.</p>}
                    </div>
                  )}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-medium text-muted-foreground">Pages and features</label>
                      <button type="button" onClick={() => setForm((current) => ({ ...current, pagePermissions: current.pagePermissions.length === ALL_PAGE_PERMISSION_KEYS.length ? [] : [...ALL_PAGE_PERMISSION_KEYS] }))} className="text-xs text-primary hover:underline">
                        {form.pagePermissions.length === ALL_PAGE_PERMISSION_KEYS.length ? "Clear all" : "Select all"}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 max-h-44 overflow-y-auto rounded-lg border border-border p-3">
                      {PAGE_PERMISSIONS.map((permission) => (
                        <label key={permission.key} className="flex items-center gap-2 text-xs text-foreground">
                          <input
                            type="checkbox"
                            checked={form.pagePermissions.includes(permission.key)}
                            onChange={(event) => setForm((current) => ({
                              ...current,
                              pagePermissions: event.target.checked
                                ? [...current.pagePermissions, permission.key]
                                : current.pagePermissions.filter((key) => key !== permission.key),
                            }))}
                          />
                          {permission.label}
                        </label>
                      ))}
                    </div>
                  </div>
                  {invite.error && <p className="text-xs text-red-500">{invite.error instanceof Error ? invite.error.message : String(invite.error)}</p>}
                </div>
                <div className="px-6 pb-6 flex gap-2 justify-end">
                  <button onClick={() => setShowInvite(false)} className="px-4 py-2 text-sm font-medium text-muted-foreground border border-border rounded-lg hover:bg-muted">Cancel</button>
                  <button
                    onClick={() => invite.mutate(form)}
                    disabled={!form.name || !form.email || (form.role === "agent" && !form.clientAccountId) || invite.isPending}
                    className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-40 transition-colors"
                  >
                    {invite.isPending ? "Creating..." : "Create Invite"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Edit role modal */}
      {editMember && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setEditMember(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm border border-border" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Edit Role — {editMember.name}</h3>
              <button onClick={() => setEditMember(null)} className="text-muted-foreground hover:text-foreground">x</button>
            </div>
            <div className="p-6 space-y-3">
              {(["admin", "agent", "member", "viewer"] as const).map((role) => (
                <button
                  key={role}
                  onClick={() => setEditMember((member) => member ? { ...member, role } : member)}
                  className={`w-full p-3 border rounded-xl text-left transition-colors ${editMember.role === role ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                >
                  <div className={`text-sm font-semibold capitalize ${editMember.role === role ? "text-primary" : "text-foreground"}`}>{role}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{(ROLE_PERMS[role] ?? [])[0]}</div>
                </button>
              ))}
              <div className="pt-3 border-t border-border">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-muted-foreground">Pages and features</label>
                  <button type="button" onClick={() => setEditMember((member) => member ? { ...member, pagePermissions: (member.pagePermissions ?? ALL_PAGE_PERMISSION_KEYS).length === ALL_PAGE_PERMISSION_KEYS.length ? [] : [...ALL_PAGE_PERMISSION_KEYS] } : member)} className="text-xs text-primary hover:underline">
                    {(editMember.pagePermissions ?? ALL_PAGE_PERMISSION_KEYS).length === ALL_PAGE_PERMISSION_KEYS.length ? "Clear all" : "Select all"}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto rounded-lg border border-border p-3">
                  {PAGE_PERMISSIONS.map((permission) => {
                    const selected = editMember.pagePermissions ?? ALL_PAGE_PERMISSION_KEYS;
                    return (
                      <label key={permission.key} className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={selected.includes(permission.key)}
                          onChange={(event) => setEditMember((member) => {
                            if (!member) return member;
                            const current = member.pagePermissions ?? [...ALL_PAGE_PERMISSION_KEYS];
                            return { ...member, pagePermissions: event.target.checked ? [...current, permission.key] : current.filter((key) => key !== permission.key) };
                          })}
                        />
                        {permission.label}
                      </label>
                    );
                  })}
                </div>
              </div>
              <button
                onClick={() => update.mutate({ id: editMember.id, role: editMember.role, pagePermissions: editMember.pagePermissions ?? [...ALL_PAGE_PERMISSION_KEYS] })}
                disabled={update.isPending}
                className="w-full mt-2 px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg disabled:opacity-50"
              >
                {update.isPending ? "Saving..." : "Save access"}
              </button>
            </div>
          </div>
        </div>
      )}

      {openMenu !== null && <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />}

    </>
  );
}
