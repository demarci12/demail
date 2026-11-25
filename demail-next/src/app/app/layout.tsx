import Link from "next/link";
import { redirect } from "next/navigation";
import { getOrgContext, setOrgCookie } from "@/lib/org";
import { signOut } from "../(auth)/actions";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";

const nav = [
  { href: "/app/contacts", label: "Contacts" },
  { href: "/app/campaigns", label: "Campaigns" },
  { href: "/app/mailboxes", label: "Mailboxes" },
  { href: "/app/suppression", label: "Suppression" },
  { href: "/app/settings/members", label: "Members" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { org, orgs, user } = await getOrgContext();

  async function switchOrg(formData: FormData) {
    "use server";
    // The cookie is only a hint; getOrgContext re-checks membership on every request.
    await setOrgCookie(String(formData.get("workspace") ?? ""));
    redirect("/app");
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col gap-4 border-r border-slate-200 bg-slate-50 p-4">
        <Link href="/app" className="text-lg font-semibold">
          Demail
        </Link>
        <form action={switchOrg} className="flex gap-1">
          <Select name="workspace" defaultValue={org.id} aria-label="Workspace">
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary" className="px-2">
            Go
          </Button>
        </form>
        <nav className="flex flex-col gap-1 text-sm">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-md px-2 py-1.5 hover:bg-slate-200">
              {n.label}
            </Link>
          ))}
        </nav>
        <form action={signOut} className="mt-auto flex flex-col gap-2">
          <span className="truncate text-xs text-slate-500">{user.email}</span>
          <Button type="submit" variant="secondary">
            Sign out
          </Button>
        </form>
      </aside>
      <main className="min-w-0 flex-1 p-8">{children}</main>
    </div>
  );
}
