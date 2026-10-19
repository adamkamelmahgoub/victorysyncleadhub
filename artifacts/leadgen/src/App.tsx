 import { Component, type ErrorInfo, type ReactNode } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Scraper from "@/pages/scraper";
import OutreachWeekly from '@/pages/outreach-weekly';
import EmailAccounts from "@/pages/email-accounts";
import EmailUnsubscribes from "@/pages/email-unsubscribes";
import SentEmails from "@/pages/sent-emails";
import ActivityLog from '@/pages/activity-log';
import Pipeline from "@/pages/pipeline";
import Companies from "@/pages/companies";
import CompanyDetail from "@/pages/company-detail";
import TrialQueue from "@/pages/trial-queue";
import CompanyKpis from "@/pages/company-kpis";
import CompanyTasks from "@/pages/company-tasks";
import Sequences from "@/pages/sequences";
import SequenceEditor from "@/pages/sequence-editor";
import Leads from "@/pages/leads";
import LeadDetail from "@/pages/lead-detail";
import CallQueue from "@/pages/call-queue";
import Campaigns from "@/pages/campaigns";
import CampaignDetail from "@/pages/campaign-detail";
import Forms from "@/pages/forms";
import FormEditor from "@/pages/form-editor";
import Analytics from "@/pages/analytics";
import Settings from "@/pages/settings";
import SocialInbox from "@/pages/social-inbox";
import DmQueue from "@/pages/dm-queue";
import Automation from "@/pages/automation";
import Reputation from "@/pages/reputation";
import Team from "@/pages/team";
import Integrations from "@/pages/integrations";
import LeadImport from "@/pages/lead-import";
import SocialPlanner from "@/pages/social-planner";
import Segments from "@/pages/segments";
import Webhooks from "@/pages/webhooks";
import EmailTemplatesPage from "@/pages/email-templates";
import SubAccounts from "@/pages/sub-accounts";
import ClientWorkspace from "@/pages/client-workspace";
import ProspectSearch from "@/pages/prospect-search";
import MeetingScheduler from "@/pages/meeting-scheduler";
import SequenceAnalytics from "@/pages/sequence-analytics";
import RevenueAttribution from "@/pages/revenue-attribution";
import Onboarding from "@/pages/onboarding";
import Affiliates from "@/pages/affiliates";
import BillingIntegration from "@/pages/billing-integration";
import VictorySyncHome from "@/pages/victorysync-home";
import AgentTraining from "@/pages/agent-training";
import { Layout } from "@/components/layout";
import Login from "@/pages/login";
import { AuthProvider, useAuth } from "@/lib/auth";
import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { canAccessPath } from "@/lib/permissions";
import {ActivityTracker} from '@/components/activity-tracker';

const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error) => {
      window.dispatchEvent(new CustomEvent("victorysync-api-error", {
        detail: error instanceof Error ? error.message : String(error),
      }));
    },
  }),
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/victorysync" component={VictorySyncHome} />
      <Route path="/" component={Companies} />
      <Route path="/companies" component={Companies} />
      <Route path="/companies/:id" component={CompanyDetail} />
      <Route path="/trial-queue" component={TrialQueue} />
      <Route path="/company-kpis" component={CompanyKpis} />
      <Route path="/crm-tasks" component={CompanyTasks} />
      <Route path="/leadgen/crm-tasks" component={CompanyTasks} />
      <Route path="/leadgen/companies" component={Companies} />
      <Route path="/leadgen/companies/:id" component={CompanyDetail} />
      <Route path="/leadgen/trial-queue" component={TrialQueue} />
      <Route path="/leadgen/company-kpis" component={CompanyKpis} />
      <Route path="/leadgen" component={Dashboard} />
      <Route path="/leadgen/leads" component={Leads} />
      <Route path="/leadgen/call-queue" component={CallQueue} />
      <Route path="/leadgen/leads/:id" component={LeadDetail} />
      <Route path="/leadgen/conversations" component={SocialInbox} />
      <Route path="/leadgen/dm-queue" component={DmQueue} />
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
      <Route path="/leads" component={Leads} />
      <Route path="/call-queue" component={CallQueue} />
      <Route path="/leads/:id" component={LeadDetail} />
      <Route path="/conversations" component={SocialInbox} />
      <Route path="/dm-queue" component={DmQueue} />
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
      <Route path="/segments" component={Segments} />
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

  return (
    <AppErrorBoundary resetKey={location}>
      <ActivityTracker />
      <Layout>
        <Router />
      </Layout>
    </AppErrorBoundary>
  );
}

export default App;
