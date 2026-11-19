import { redirect } from "next/navigation";
import { getActor } from "@/server/auth/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getActor()) redirect("/dashboard");
  const { next } = await searchParams;
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground">A</span> Atlas Expenses
        </div>
        <div className="max-w-md">
          <h1 className="text-3xl font-semibold leading-tight">Group-wide expense control, local accountability.</h1>
          <p className="mt-4 text-sm text-sidebar-muted">Multi-entity, multi-currency expense claims with configurable approvals, policy controls, budgets and ERP-ready accounting.</p>
        </div>
        <p className="text-xs text-sidebar-muted">Access is restricted to authorised personnel. Activity is logged.</p>
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h2 className="text-xl font-semibold">Sign in</h2>
          <p className="mt-1 text-sm text-muted-foreground">Use your corporate credentials.</p>
          <LoginForm next={next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard"} />
          <p className="mt-6 text-xs text-muted-foreground">Single sign-on with Microsoft Entra ID can be enabled by your administrator.</p>
        </div>
      </section>
    </main>
  );
}
