import Link from "next/link";
import { Alert, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { BrandFooter, BrandLogo } from "@/components/public-brand";
import type { Branding } from "@/lib/branding";
import { getT } from "@/lib/i18n/server";
import { LocaleSwitch } from "@/components/locale-switch";
const HEX_RE = /^#[0-9a-f]{6}$/;

export async function AuthForm({
  mode,
  action,
  error,
  message,
  next,
  brand = null,
}: {
  mode: "login" | "signup";
  action: (formData: FormData) => Promise<void>;
  error?: string;
  message?: string;
  next: string;
  brand?: Branding | null;
}) {
  const t = await getT();
  const login = mode === "login";
  const name = brand?.brand_name ?? "Demail";
  const buttonStyle = brand && HEX_RE.test(brand.accent_color) ? { backgroundColor: brand.accent_color } : undefined;
  const suffix = next !== "/app" ? `?next=${encodeURIComponent(next)}` : "";
  return (
    <main className="mx-auto mt-24 max-w-sm px-4">
      <Card className="flex flex-col gap-4">
        <BrandLogo brand={brand} />
        <h1 className="text-xl font-semibold">{login ? t("auth.signin.title", { name }) : t("auth.signup.title", { name })}</h1>
        {error && <Alert>{error}</Alert>}
        {message && <Alert tone="info">{message}</Alert>}
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="next" value={next} />
          <Field label={t("auth.email")}>
            <Input name="email" type="email" required autoComplete="email" />
          </Field>
          <Field label={t("auth.password")}>
            <Input name="password" type="password" required minLength={8} autoComplete={login ? "current-password" : "new-password"} />
          </Field>
          <Button type="submit" style={buttonStyle}>
            {login ? t("auth.signin") : t("auth.signup")}
          </Button>
        </form>
        <p className="text-sm text-slate-600">
          {login ? t("auth.noaccount") : t("auth.haveaccount")}{" "}
          <Link className="text-sky-700 underline" href={`${login ? "/signup" : "/login"}${suffix}`}>
            {login ? t("auth.signup") : t("auth.signin")}
          </Link>
        </p>
        <LocaleSwitch />
      </Card>
      {brand && <BrandFooter brand={brand} />}
    </main>
  );
}
