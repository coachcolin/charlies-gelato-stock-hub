import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

import logo from "@/assets/charlies-logo.png";

export function AppShell({
  title,
  subtitle,
  children,
  action,
  back = true,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
  back?: boolean;
}) {
  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-30 border-b border-border bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          {back ? (
            <Link
              to="/"
              aria-label="Back to home"
              className="-ml-2 flex size-10 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-primary-foreground/15"
            >
              <ChevronLeft className="size-6" />
            </Link>
          ) : (
            <img src={logo} alt="Charlie's Gelato" className="size-11 shrink-0 rounded-full bg-card" />
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-xl leading-tight sm:text-2xl">{title}</h1>
            {subtitle ? (
              <p className="truncate text-xs opacity-80 sm:text-sm">{subtitle}</p>
            ) : null}
          </div>
          {action}
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-5">{children}</main>
    </div>
  );
}
