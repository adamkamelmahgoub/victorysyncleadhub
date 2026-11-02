import { PageTitle, PageDescription } from "@/components/page-layout";
import { Link } from "wouter";
import {
  BookOpen, CheckCircle2, Clock, Contact, FileSpreadsheet, GitBranch,
  MessageSquare, ShieldCheck, Target, Users,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const DAILY_WORKFLOW = [
  "Open Contacts and review new or assigned leads.",
  "Open each contact before calling, emailing, or texting.",
  "Log the activity immediately after every outreach attempt.",
  "Update Times Contacted and choose the correct disposition.",
  "Move qualified contacts to the correct pipeline stage.",
  "Create a follow-up task before leaving any active contact.",
  "Finish the day with no overdue tasks and accurate pipeline stages.",
];

const MODULES = [
  {
    title: "1. Access and navigation",
    icon: ShieldCheck,
    points: [
      "Enter through the VictorySync dashboard. Your session should carry into the CRM without another login.",
      "Only pages enabled by your administrator appear in the sidebar.",
      "If a page says Access restricted, ask an administrator to enable it in Team & Members.",
      "Never share your login, invite code, or another client’s information.",
    ],
  },
  {
    title: "2. Contacts",
    icon: Contact,
    points: [
      "Use search and status filters to find the contact you need.",
      "Open the contact record before outreach and verify phone, email, company, source, and prior activity.",
      "Keep status, disposition, assigned client, notes, and custom fields current.",
      "Use Select all only when you have verified the current filtered list.",
    ],
  },
  {
    title: "3. Importing contacts",
    icon: FileSpreadsheet,
    points: [
      "Upload CSV or XLSX files from Import Contacts.",
      "Email is required. Missing names are derived from the email when possible.",
      "Map standard columns, then use Add field for any custom column and name it exactly as it should appear in the CRM.",
      "Review the preview before importing. Fix mapping errors instead of importing incorrect data.",
      "Custom fields appear as columns on Contacts and under Imported Custom Fields on the contact page.",
    ],
  },
  {
    title: "4. Outreach and follow-up",
    icon: MessageSquare,
    points: [
      "Record every call, email, text, meeting, and meaningful outcome.",
      "Increase Times Contacted for genuine outreach attempts.",
      "Use the agreed disposition. Do not create duplicate dispositions for spelling variations.",
      "Write notes as facts: what happened, what the contact said, and the agreed next step.",
      "Do not mark a contact qualified without evidence and a next action.",
    ],
  },
  {
    title: "5. Pipeline management",
    icon: GitBranch,
    points: [
      "Use the pipeline that matches the client or sales process.",
      "Drag contacts only after the stage qualification criteria are met.",
      "Keep unassigned contacts from sitting without an owner or next step.",
      "A pipeline stage describes the current deal position, not the activity you completed.",
    ],
  },
  {
    title: "6. Working for client accounts",
    icon: Users,
    points: [
      "Agents assigned to a client should only work records for that client.",
      "Confirm the client context before importing, contacting, or changing records.",
      "Report incorrect client access immediately; do not continue working in the wrong account.",
      "Administrators manage client assignment, roles, pages, and features from Team & Members.",
    ],
  },
];

export default function AgentTraining() {
  return (
    <div className="page-stack">
      <div className="flex flex-wrap items-start justify-between gap-4 flex-wrap gap-4 min-w-0">
        <div>
          <div className="flex items-center gap-2 text-sm text-primary font-medium mb-1">
            <BookOpen className="w-4 h-4" /> VictorySync Agent Training
          </div>
          <PageTitle>Lead Generation Hub Playbook</PageTitle>
          <PageDescription>The required workflow for accurate outreach, follow-up, and pipeline management.</PageDescription>
        </div>
        <Link href="/leads"><Button><Target className="w-4 h-4 mr-2" /> Start working contacts</Button></Link>
      </div>

      <Card className="p-5 border-primary/20 bg-primary/5">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-primary" />
          <h2 className="font-semibold">Daily agent workflow</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-2">
          {DAILY_WORKFLOW.map((step, index) => (
            <div key={step} className="flex gap-2 text-sm">
              <span className="w-5 h-5 rounded-full bg-primary text-white text-xs flex items-center justify-center flex-shrink-0">{index + 1}</span>
              <span>{step}</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        {MODULES.map(({ title, icon: Icon, points }) => (
          <Card key={title} className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Icon className="w-4 h-4 text-primary" />
              <h2 className="font-semibold">{title}</h2>
            </div>
            <ul className="space-y-2">
              {points.map((point) => (
                <li key={point} className="flex gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <h2 className="font-semibold mb-3">Before you finish a contact</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {["Activity logged", "Disposition updated", "Pipeline stage accurate", "Next step scheduled"].map((item) => (
            <div key={item} className="rounded-lg border border-border p-3 text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600" /> {item}
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5 border-amber-200 bg-amber-50">
        <h2 className="font-semibold text-amber-900 mb-2">When something does not work</h2>
        <ol className="list-decimal pl-5 space-y-1 text-sm text-amber-900">
          <li>Copy the full error message. Do not report only “it does not work.”</li>
          <li>Record the page, button, contact/client, and time of the error.</li>
          <li>Refresh once and retry only if repeating the action cannot create duplicates.</li>
          <li>Send the details to your administrator. Never repeatedly click Create, Import, or Send.</li>
        </ol>
      </Card>
    </div>
  );
}
