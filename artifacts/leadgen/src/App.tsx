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
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
