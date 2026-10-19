import type { ReactNode, HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function PageHeading({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("page-heading min-w-0 space-y-2", className)} {...props}>
      {children}
    </div>
  );
}

export function PageTitle({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h1
      className={cn(
        "text-2xl font-semibold tracking-tight text-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </h1>
  );
}

export function PageDescription({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn(
        "mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </p>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header flex flex-wrap items-start justify-between gap-4">
      <PageHeading>
        <PageTitle>{title}</PageTitle>
        {description && <PageDescription>{description}</PageDescription>}
      </PageHeading>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </header>
  );
}

export function PageEmpty({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed bg-slate-50/50 px-6 py-10 text-center">
      <p className="text-sm font-semibold">{title}</p>
      {description && (
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function WorkspaceDialog({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="workspace-form min-w-0">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

export const workspaceInput =
  "min-h-10 w-full min-w-0 rounded-lg border border-input bg-white px-3 py-2 text-sm shadow-xs outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-50";
export const workspaceButton =
  "inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-input bg-white px-4 py-2 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-50";
