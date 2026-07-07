import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Check, ChevronRight, Plug, Users, Megaphone, GitBranch, UserPlus, Zap, Rocket, Clock, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

const STEP_ICONS: Record<string, React.ElementType> = { connect_integrations: Plug, import_contacts: Users, create_campaign: Megaphone, setup_pipeline: GitBranch, invite_team: UserPlus, configure_automation: Zap, launch: Rocket };
const STEP_LINKS: Record<string, string> = { connect_integrations: "/integrations", import_contacts: "/lead-import", create_campaign: "/campaigns", setup_pipeline: "/pipeline", invite_team: "/team", configure_automation: "/automation", launch: "/" };

interface Step { id: string; title: string; description: string; icon: string; estimatedMinutes: number; completed: boolean; current: boolean; }
interface Progress { steps: Step[]; completedCount: number; totalSteps: number; percentComplete: number; isCompleted: boolean; currentStep: string; }

export default function Onboarding() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: progress, isLoading } = useQuery<Progress>({ queryKey: ["onboarding"], queryFn: () => apiFetch("/onboarding?subAccountId=1") });

  const completeStep = useMutation({
    mutationFn: (stepId: string) => apiFetch("/onboarding/complete-step", { method: "POST", body: JSON.stringify({ stepId, subAccountId: 1 }) }),
    onSuccess: (_, stepId) => { qc.invalidateQueries({ queryKey: ["onboarding"] }); toast({ title: "Step completed! 🎉" }); },
  });

  const reset = useMutation({
    mutationFn: () => apiFetch("/onboarding/reset", { method: "POST", body: JSON.stringify({ subAccountId: 1 }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["onboarding"] }),
  });

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;
  if (!progress) return null;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Getting Started</h1>
          <p className="text-muted-foreground text-sm">Complete these steps to get the most out of VictorySync</p>
        </div>
        <button onClick={() => reset.mutate()} className="text-xs text-muted-foreground hover:text-foreground">Reset progress</button>
      </div>

      <div className="bg-card border rounded-xl p-6">
        <div className="flex items-center justify-between mb-3">
          <span className="font-semibold">{progress.percentComplete}% complete</span>
          <span className="text-sm text-muted-foreground">{progress.completedCount} of {progress.totalSteps} steps</span>
        </div>
        <div className="h-3 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all duration-700" style={{ width: `${progress.percentComplete}%` }} />
        </div>
        {progress.isCompleted && (
          <div className="mt-4 flex items-center gap-2 text-green-600 font-medium"><Check className="w-5 h-5" /> You're all set! VictorySync is fully configured.</div>
        )}
      </div>

      <div className="space-y-3">
        {progress.steps.map((step, i) => {
          const Icon = STEP_ICONS[step.id] || Zap;
          const link = STEP_LINKS[step.id] || "/";
          return (
            <div key={step.id} className={`bg-card border rounded-xl overflow-hidden transition-all ${step.current && !step.completed ? "border-primary/40 shadow-sm" : ""} ${step.completed ? "opacity-75" : ""}`}>
              <div className="flex items-center gap-4 p-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${step.completed ? "bg-green-100 text-green-600" : step.current ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>
                  {step.completed ? <Check className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`font-semibold ${step.completed ? "line-through text-muted-foreground" : ""}`}>{step.title}</div>
                  <div className="text-sm text-muted-foreground mt-0.5">{step.description}</div>
                  {!step.completed && <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1"><Clock className="w-3 h-3" /> ~{step.estimatedMinutes} min</div>}
                </div>
                {step.completed ? (
                  <Check className="w-5 h-5 text-green-500 shrink-0" />
                ) : (
                  <div className="flex items-center gap-2 shrink-0">
                    <Link href={link}>
                      <Button size="sm" variant={step.current ? "default" : "outline"} className={step.current ? "bg-primary text-white" : ""}>
                        {step.current ? <>Go <ArrowRight className="w-3.5 h-3.5 ml-1.5" /></> : "Open"}
                      </Button>
                    </Link>
                    <Button size="sm" variant="ghost" className="text-xs text-muted-foreground" onClick={() => completeStep.mutate(step.id)} disabled={completeStep.isPending}>
                      Mark done
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
