import { ContactErrorBoundary } from "@/components/contact-error-boundary";
 import { Component, Suspense, lazy, type ErrorInfo, type ReactNode } from "react";
import { Switch, Route, Redirect, Router as WouterRouter, useLocation } from "wouter";
import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
const NotFound = lazy(() => import("@/pages/not-found"));
const Dashboard = lazy(() => import("@/pages/dashboard"));
const Scraper = lazy(() => import("@/pages/scraper"));
const OutreachWeekly = lazy(() => import("@/pages/outreach-weekly"));
const EmailAccounts = lazy(() => import("@/pages/email-accounts"));
const EmailUnsubscribes = lazy(() => import("@/pages/email-unsubscribes"));
const SentEmails = lazy(() => import("@/pages/sent-emails"));
const ActivityLog = lazy(() => import("@/pages/activity-log"));
const Pipeline = lazy(() => import("@/pages/pipeline"));
const Companies = lazy(() => import("@/pages/companies"));
const CompanyDetail = lazy(() => import("@/pages/company-detail"));
const AiAssistant = lazy(() => import("@/pages/ai-assistant"));
const TrialQueue = lazy(() => import("@/pages/trial-queue"));
const CompanyKpis = lazy(() => import("@/pages/company-kpis"));
const CompanyTasks = lazy(() => import("@/pages/company-tasks"));
const Sequences = lazy(() => import("@/pages/sequences"));
const SequenceEditor = lazy(() => import("@/pages/sequence-editor"));
const Leads = lazy(() => import("@/pages/leads"));
const LeadDetail = lazy(() => import("@/pages/lead-detail"));
const CallQueue = lazy(() => import("@/pages/call-queue"));
const Campaigns = lazy(() => import("@/pages/campaigns"));
const CampaignDetail = lazy(() => import("@/pages/campaign-detail"));
const Forms = lazy(() => import("@/pages/forms"));
const FormEditor = lazy(() => import("@/pages/form-editor"));
const LandingPages = lazy(() => import("@/pages/landing-pages"));
const LandingPageEditor = lazy(() => import("@/pages/landing-page-editor"));
const MarketingReports = lazy(() => import("@/pages/marketing-reports"));
const Analytics = lazy(() => import("@/pages/analytics"));
const Settings = lazy(() => import("@/pages/settings"));
const SocialInbox = lazy(() => import("@/pages/social-inbox"));
const DmQueue = lazy(() => import("@/pages/dm-queue"));
const DmCampaigns = lazy(() => import("@/pages/dm-campaigns"));
const SocialReview = lazy(() => import("@/pages/social-review"));
const Automation = lazy(() => import("@/pages/automation"));
const Reputation = lazy(() => import("@/pages/reputation"));
const Team = lazy(() => import("@/pages/team"));
const Integrations = lazy(() => import("@/pages/integrations"));
const LeadImport = lazy(() => import("@/pages/lead-import"));
const SocialPlanner = lazy(() => import("@/pages/social-planner"));
const SocialReports = lazy(() => import("@/pages/social-reports"));
const SocialRepStats = lazy(() => import("@/pages/social-rep-stats"));
const Segments = lazy(() => import("@/pages/segments-v2"));
const SegmentDetail = lazy(() => import("@/pages/segment-detail"));
const Webhooks = lazy(() => import("@/pages/webhooks"));
const EmailTemplatesPage = lazy(() => import("@/pages/email-templates"));
const SubAccounts = lazy(() => import("@/pages/sub-accounts"));
const ClientWorkspace = lazy(() => import("@/pages/client-workspace"));
const ClientPortal = lazy(() => import("@/pages/client-portal"));
const ProspectSearch = lazy(() => import("@/pages/prospect-search"));
const MeetingScheduler = lazy(() => import("@/pages/meeting-scheduler"));
const SequenceAnalytics = lazy(() => import("@/pages/sequence-analytics"));
const RevenueAttribution = lazy(() => import("@/pages/revenue-attribution"));
const Onboarding = lazy(() => import("@/pages/onboarding"));
const Affiliates = lazy(() => import("@/pages/affiliates"));
const BillingIntegration = lazy(() => import("@/pages/billing-integration"));
const VictorySyncHome = lazy(() => import("@/pages/victorysync-home"));
const AgentTraining = lazy(() => import("@/pages/agent-training"));
import { Layout } from "@/components/layout";
import { AssistantLauncher } from "@/components/assistant-launcher";
const Login = lazy(() => import("@/pages/login"));
import { AuthProvider, useAuth } from "@/lib/auth";
import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { canAccessPath } from "@/lib/permissions";
import {ActivityTracker} from '@/components/activity-tracker';
import { MfaGate } from '@/components/mfa-gate';
import { requiresAgencyMfa } from '../../../lib/portal-roles';
import { clearApiCache } from "@/lib/api-cache";

const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onSuccess: () => clearApiCache(),
    onError: (error) => {
      window.dispatchEvent(new CustomEvent("victorysync-api-error", {
        detail: error instanceof Error ? error.message : String(error),
      }));
    },
  }),
  defaultOptions: {
    queries: { staleTime: 60_000, gcTime: 15 * 60_000, retry: 1, refetchOnWindowFocus: false },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/victorysync" component={VictorySyncHome} />
      <Route path="/" component={Companies} />
      <Route path="/companies" component={Companies} />
      <Route path="/companies/:id" component={CompanyDetail} />
      <Route path="/ai-assistant" component={() => <AiAssistant />} />
      <Route path="/leadgen/ai-assistant" component={() => <AiAssistant />} />
      <Route path="/trial-queue" component={TrialQueue} />
      <Route path="/company-kpis" component={CompanyKpis} />
      <Route path="/crm-tasks" component={CompanyTasks} />
      <Route path="/leadgen/crm-tasks" component={CompanyTasks} />
      <Route path="/leadgen/companies" component={Companies} />
      <Route path="/leadgen/companies/:id" component={CompanyDetail} />
      <Route path="/leadgen/trial-queue" component={TrialQueue} />
      <Route path="/leadgen/company-kpis" component={CompanyKpis} />
      <Route path="/leadgen" component={Dashboard} />
      <Route path="/leadgen/client-portal" component={ClientPortal} />
      <Route path="/leadgen/client-portal/:section" component={ClientPortal} />
      <Route path="/leadgen/leads" component={Leads} />
      <Route path="/leadgen/call-queue" component={CallQueue} />
      <Route path="/leadgen/leads/:id" component={() => <ContactErrorBoundary fallback={<div role="alert" className="p-6">Could not display this contact.</div>}><LeadDetail /></ContactErrorBoundary>} />
      <Route path="/leadgen/conversations" component={SocialInbox} />
      <Route path="/leadgen/dm-queue" component={DmQueue} />
      <Route path="/leadgen/dm-campaigns" component={DmCampaigns} />
      <Route path="/leadgen/social-review" component={SocialReview} />
      <Route path="/leadgen/calendars" component={MeetingScheduler} />
      <Route path="/leadgen/automation" component={Automation} />
      <Route path="/leadgen/reputation" component={Reputation} />
      <Route path="/leadgen/pipeline" component={Pipeline} />
      <Route path="/leadgen/sequences" component={Sequences} />
      <Route path="/leadgen/sequences/:id" component={SequenceEditor} />
      <Route path="/leadgen/campaigns" component={Campaigns} />
      <Route path="/leadgen/campaigns/:id" component={CampaignDetail} />
      <Route path="/leadgen/forms" component={Forms} />
      <Route path="/leadgen/forms/:id" component={FormEditor} />
      <Route path="/leadgen/landing-pages" component={LandingPages} />
      <Route path="/leadgen/landing-pages/:id" component={LandingPageEditor} />
      <Route path="/leadgen/marketing-reports" component={MarketingReports} />
      <Route path="/leadgen/analytics" component={Analytics} />
      <Route path="/leadgen/scraper" component={Scraper} />
      <Route path="/leadgen/email-accounts" component={EmailAccounts} />
      <Route path="/leadgen/email-unsubscribes" component={EmailUnsubscribes} />
      <Route path="/leadgen/sent-emails" component={SentEmails} />
      <Route path="/leadgen/activity-log" component={ActivityLog} />
      <Route path="/leadgen/integrations" component={Integrations} />
      <Route path="/leadgen/company-import" component={() => <LeadImport companyMode />} />
      <Route path="/leadgen/lead-import" component={() => <LeadImport />} />
      <Route path="/leadgen/social-planner" component={SocialPlanner} />
      <Route path="/leadgen/social-reports" component={SocialReports} />
      <Route path="/leadgen/me/stats" component={SocialRepStats} />
      <Route path="/leadgen/segments" component={Segments} />
      <Route path="/leadgen/webhooks" component={Webhooks} />
      <Route path="/leadgen/email-templates" component={EmailTemplatesPage} />
      <Route path="/leadgen/prospect-search" component={ProspectSearch} />
      <Route path="/leadgen/meeting-scheduler" component={MeetingScheduler} />
      <Route path="/leadgen/sequence-analytics" component={SequenceAnalytics} />
      <Route path="/leadgen/revenue-attribution" component={RevenueAttribution} />
      <Route path="/leadgen/getting-started" component={Onboarding} />
      <Route path="/leadgen/training" component={AgentTraining} />

      <Route path="/dashboard" component={Companies} />
      <Route path="/client-portal" component={ClientPortal} />
      <Route path="/client-portal/:section" component={ClientPortal} />
      <Route path="/leads" component={Leads} />
      <Route path="/call-queue" component={CallQueue} />
      <Route path="/leads/:id" component={() => <ContactErrorBoundary fallback={<div role="alert" className="p-6">Could not display this contact.</div>}><LeadDetail /></ContactErrorBoundary>} />
      <Route path="/conversations" component={SocialInbox} />
      <Route path="/dm-queue" component={DmQueue} />
      <Route path="/dm-campaigns" component={DmCampaigns} />
      <Route path="/social-review" component={SocialReview} />
      <Route path="/calendars" component={MeetingScheduler} />
      <Route path="/automation" component={Automation} />
      <Route path="/reputation" component={Reputation} />
      <Route path="/pipeline" component={Pipeline} />
      <Route path="/sequences" component={Sequences} />
      <Route path="/sequences/:id" component={SequenceEditor} />
      <Route path="/campaigns" component={Campaigns} />
      <Route path="/campaigns/:id" component={CampaignDetail} />
      <Route path="/forms" component={Forms} />
      <Route path="/forms/:id" component={FormEditor} />
      <Route path="/landing-pages" component={LandingPages} />
      <Route path="/landing-pages/:id" component={LandingPageEditor} />
      <Route path="/marketing-reports" component={MarketingReports} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/scraper" component={Scraper} />
      <Route path="/outreach-weekly" component={OutreachWeekly} />
      <Route path="/leadgen/outreach-weekly" component={OutreachWeekly} />
      <Route path="/email-accounts" component={EmailAccounts} />
      <Route path="/email-unsubscribes" component={EmailUnsubscribes} />
      <Route path="/sent-emails" component={SentEmails} />
      <Route path="/activity-log" component={ActivityLog} />
      <Route path="/settings" component={Settings} />
      <Route path="/team" component={Team} />
      <Route path="/integrations" component={Integrations} />
      <Route path="/company-import" component={() => <LeadImport companyMode />} />
      <Route path="/lead-import" component={() => <LeadImport />} />
      <Route path="/social-planner" component={SocialPlanner} />
      <Route path="/social-reports" component={SocialReports} />
      <Route path="/me/stats" component={SocialRepStats} />
      <Route path="/segments" component={Segments} />
      <Route path="/contacts/segments/:id" component={SegmentDetail} />
      <Route path="/webhooks" component={Webhooks} />
      <Route path="/email-templates" component={EmailTemplatesPage} />
      <Route path="/sub-accounts" component={SubAccounts} />
      <Route path="/sub-accounts/:id" component={ClientWorkspace} />
      <Route path="/prospect-search" component={ProspectSearch} />
      <Route path="/meeting-scheduler" component={MeetingScheduler} />
      <Route path="/sequence-analytics" component={SequenceAnalytics} />
      <Route path="/revenue-attribution" component={RevenueAttribution} />
      <Route path="/getting-started" component={Onboarding} />
      <Route path="/training" component={AgentTraining} />
      <Route path="/affiliates" component={Affiliates} />
      <Route path="/billing-integration" component={BillingIntegration} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppErrorBoundary>
        <AuthProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <AuthenticatedApp />
            </WouterRouter>
            <ApiErrorNotifier />
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </AppErrorBoundary>
    </QueryClientProvider>
  );
}

function ApiErrorNotifier() {
  const { toast } = useToast();
  useEffect(() => {
    const showError = (event: Event) => {
      const message = (event as CustomEvent<string>).detail;
      let description = message;
      try {
        const parsed = JSON.parse(message) as { error?: string };
        description = parsed.error ?? message;
      } catch {
        // The API may return a plain-text error.
      }
      toast({ title: "Action failed", description, variant: "destructive" });
    };
    window.addEventListener("victorysync-api-error", showError);
    return () => window.removeEventListener("victorysync-api-error", showError);
  }, [toast]);
  return null;
}

class AppErrorBoundary extends Component<
  { children: ReactNode; resetKey?: string },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("App render failed", error, info);
  }

  componentDidUpdate(prevProps: { resetKey?: string }) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <main className="min-h-screen bg-background flex items-center justify-center px-4">
          <div className="w-full max-w-md bg-white border border-border rounded-lg shadow-sm p-6">
            <h1 className="text-lg font-semibold text-foreground">Something went wrong</h1>
            <p className="text-sm text-muted-foreground mt-2">
              {this.state.error.message}
            </p>
            <button
              type="button"
              className="mt-4 px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}

function AuthenticatedApp() {
  const { loading, session, pagePermissions, role, clientAccountId } = useAuth();
  const [location] = useLocation();

  if (loading) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center text-sm text-muted-foreground">
        Loading...
      </main>
    );
  }

  if (!session) {
    return <Login />;
  }

  const agencyMfaRequired = requiresAgencyMfa(role);

  if (window.location.hostname === "portal.victorysync.com" && ["/", "/dashboard", "/victorysync"].includes(location)) {
    return <Redirect to="/client-portal" />;
  }
  if (["client_owner", "client_staff"].includes(role) && ["/", "/dashboard", "/victorysync", "/leadgen", "/login"].includes(location)) {
    return <Redirect to="/client-portal/dashboard" />;
  }

  if ((role === "client" && !clientAccountId) || !canAccessPath(location, pagePermissions, role)) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto mt-20 rounded-xl border border-border bg-white p-8 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-foreground">No Lead Gen Hub access</h1>
          <p className="mt-2 text-sm text-muted-foreground">Ask your administrator to assign a role and, for client accounts, a client workspace.</p>
        </div>
      </Layout>
    );
  }

  return <MfaGate required={agencyMfaRequired}>
    <AppErrorBoundary resetKey={location}>
      <ActivityTracker />
      <Layout>
        <Suspense fallback={<main className="p-6 text-sm text-muted-foreground" role="status">Loading page…</main>}><Router /></Suspense>
      </Layout>
      <AssistantLauncher />
    </AppErrorBoundary>
  </MfaGate>;
}

export default App;
