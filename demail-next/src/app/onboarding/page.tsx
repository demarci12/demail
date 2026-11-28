import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { setOrgCookie } from "@/lib/org";
import { cleanText } from "@/lib/input";
import { Alert, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { getT } from "@/lib/i18n/server";
import { LocaleSwitch } from "@/components/locale-switch";

async function createOrganization(formData: FormData) {
  "use server";
  const t = await getT();
  const name = cleanText(formData.get("name"), 200);
  if (name.length < 1 || name.length > 80) redirect("/onboarding?error=" + encodeURIComponent(t("onb.err.name")));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_organization", { org_name: name });
  if (error?.code === "23514") redirect("/onboarding?error=" + encodeURIComponent(t("onb.err.link")));
  if (error || !data) redirect("/onboarding?error=" + encodeURIComponent(t("onb.err.create")));
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
  const t = await getT();
  return (
    <main className="mx-auto mt-24 max-w-sm px-4">
      <Card className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">{t("onb.title")}</h1>
        {error && <Alert>{error}</Alert>}
        <form action={createOrganization} className="flex flex-col gap-3">
          <Field label={t("onb.name")}>
            <Input name="name" required maxLength={80} />
          </Field>
          <Button type="submit">{t("onb.create")}</Button>
        </form>
        <LocaleSwitch />
      </Card>
    </main>
  );
}
