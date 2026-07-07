import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Scraper from "@/pages/scraper";
import EmailAccounts from "@/pages/email-accounts";
import Pipeline from "@/pages/pipeline";
import Sequences from "@/pages/sequences";
import SequenceEditor from "@/pages/sequence-editor";
import Leads from "@/pages/leads";
import LeadDetail from "@/pages/lead-detail";
import Campaigns from "@/pages/campaigns";
import CampaignDetail from "@/pages/campaign-detail";
import Forms from "@/pages/forms";
import FormEditor from "@/pages/form-editor";
import Analytics from "@/pages/analytics";
import Settings from "@/pages/settings";
import Conversations from "@/pages/conversations";
import CalendarPage from "@/pages/calendar";
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
import ProspectSearch from "@/pages/prospect-search";
import MeetingScheduler from "@/pages/meeting-scheduler";
import SequenceAnalytics from "@/pages/sequence-analytics";
import RevenueAttribution from "@/pages/revenue-attribution";
import Onboarding from "@/pages/onboarding";
import Affiliates from "@/pages/affiliates";
import BillingIntegration from "@/pages/billing-integration";
import { Layout } from "@/components/layout";
import Login from "@/pages/login";
import { AuthProvider, useAuth } from "@/lib/auth";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/leads" component={Leads} />
      <Route path="/leads/:id" component={LeadDetail} />
      <Route path="/conversations" component={Conversations} />
      <Route path="/calendars" component={CalendarPage} />
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
      <Route path="/email-accounts" component={EmailAccounts} />
      <Route path="/settings" component={Settings} />
      <Route path="/team" component={Team} />
      <Route path="/integrations" component={Integrations} />
      <Route path="/lead-import" component={LeadImport} />
      <Route path="/social-planner" component={SocialPlanner} />
      <Route path="/segments" component={Segments} />
      <Route path="/webhooks" component={Webhooks} />
      <Route path="/email-templates" component={EmailTemplatesPage} />
      <Route path="/sub-accounts" component={SubAccounts} />
      <Route path="/prospect-search" component={ProspectSearch} />
      <Route path="/meeting-scheduler" component={MeetingScheduler} />
      <Route path="/sequence-analytics" component={SequenceAnalytics} />
      <Route path="/revenue-attribution" component={RevenueAttribution} />
      <Route path="/getting-started" component={Onboarding} />
      <Route path="/affiliates" component={Affiliates} />
      <Route path="/billing-integration" component={BillingIntegration} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AuthenticatedApp />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function AuthenticatedApp() {
  const { loading, session } = useAuth();

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

  return (
    <Layout>
      <Router />
    </Layout>
  );
}

export default App;
