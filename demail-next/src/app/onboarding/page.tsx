import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { setOrgCookie } from "@/lib/org";
import { cleanText } from "@/lib/input";
import { Alert, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

async function createOrganization(formData: FormData) {
  "use server";
  const name = cleanText(formData.get("name"), 200);
  if (name.length < 1 || name.length > 80) redirect("/onboarding?error=" + encodeURIComponent("Enter a workspace name up to 80 characters."));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_organization", { org_name: name });
  if (error?.code === "23514") redirect("/onboarding?error=" + encodeURIComponent("Workspace names cannot contain tags, links or email addresses."));
  if (error || !data) redirect("/onboarding?error=" + encodeURIComponent("Could not create the workspace."));
  await setOrgCookie(data);
  redirect("/app");
}

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const { count } = await supabase.from("organization_members").select("*", { count: "exact", head: true }).eq("user_id", auth.user.id);
  if (count) redirect("/app");
  const { error } = await searchParams;
  return (
    <main className="mx-auto mt-24 max-w-sm px-4">
      <Card className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">Name your workspace</h1>
        {error && <Alert>{error}</Alert>}
        <form action={createOrganization} className="flex flex-col gap-3">
          <Field label="Workspace name">
            <Input name="name" required maxLength={80} />
          </Field>
          <Button type="submit">Create workspace</Button>
        </form>
      </Card>
    </main>
  );
}
