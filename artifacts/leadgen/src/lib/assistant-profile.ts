export type AssistantProfile = {
  company_name: string;
  what_we_do: string;
  ideal_customers: string;
  offers: string;
  differentiators: string;
  call_goal: string;
  tone: string;
  signature: string;
};

export const emptyAssistantProfile: AssistantProfile = {
  company_name: "VictorySync (Victory Sync LLC)",
  what_we_do: "US-managed contact center: trained human agents handle outbound cold calling, inbound support, lead follow-up, lead qualification, and appointment setting. Cairo-based agents work with US-led onboarding, management, quality standards, and campaign oversight. AI assists agents with prompts, summaries, routing, and reporting; humans handle the conversations.",
  ideal_customers: "US small and midsize businesses needing dependable calling capacity, especially home services, real estate, SaaS, agencies, and professional services.",
  offers: "A managed calling workflow with an approved playbook, trained agents, qualification, booking, CRM/calendar handoff, coaching, QA, and activity reporting. The public website says dedicated agent engagements start from $10/hour; final pricing is scoped on a discovery call. Confirm current terms before quoting. No long-term contract is required to begin.",
  differentiators: "US-led account management and quality oversight with Cairo-based trained agents; human-led calls supported by AI; agents can use a client's approved CRM and calendar; clear qualification, notes, and reporting.",
  call_goal: "Book a discovery call to understand the prospect's inbound or outbound workflow and whether managed calling is a fit.",
  tone: "Direct, respectful, conversational, concise. Lead with a real operational problem; avoid inflated claims or guaranteed outcomes.",
  signature: "VictorySync | https://www.victorysync.com/",
};
const storageKey = "victorysync:assistant-profile:v1";
export function loadAssistantProfile(): AssistantProfile {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "{}") as Partial<AssistantProfile>;
    return Object.fromEntries(Object.keys(emptyAssistantProfile).map((key) =>
      [key, typeof saved[key as keyof AssistantProfile] === "string"
        ? saved[key as keyof AssistantProfile] : emptyAssistantProfile[key as keyof AssistantProfile]])) as AssistantProfile;
  } catch { return { ...emptyAssistantProfile }; }
}
export function saveAssistantProfile(profile: AssistantProfile): void {
  localStorage.setItem(storageKey, JSON.stringify(profile));
}
