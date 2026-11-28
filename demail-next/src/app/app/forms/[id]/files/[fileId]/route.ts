import { NextResponse } from "next/server";
import { z } from "zod";
import { fileDisplayName } from "@/lib/forms/files";
import { getOrgContext } from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const uuid = z.string().uuid();
const SIGNED_SECONDS = 60;

// Members only: the row is read under RLS in the current workspace, then a 60 second download link is signed. Files are never public.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const { id, fileId } = await params;
  if (!uuid.safeParse(id).success || !uuid.safeParse(fileId).success) return new NextResponse(null, { status: 404 });
  const { supabase, org } = await getOrgContext();
  const { data: file } = await supabase
    .from("form_files")
    .select("storage_path, original_name, content_type, status")
    .eq("id", fileId)
    .eq("form_id", id)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!file || file.status !== "stored") return new NextResponse(null, { status: 404 });
  const { data, error } = await createAdminClient().storage.from("form-files").createSignedUrl(file.storage_path, SIGNED_SECONDS, { download: fileDisplayName(file.original_name, file.content_type) });
  if (error || !data?.signedUrl) return new NextResponse(null, { status: 502 });
  return NextResponse.redirect(data.signedUrl, { status: 302, headers: { "cache-control": "no-store" } });
}
