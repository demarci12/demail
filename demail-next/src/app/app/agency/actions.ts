"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getOrgContext, setOrgCookie } from "@/lib/org";
import { cleanText, isSafeName } from "@/lib/input";
const PATH = "/app/agency";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NEEDS_OWNER = "A client workspace needs its own owner before it leaves the agency. Invite one in that workspace's Members page first.";
const fail = (message: string): never => redirect(`${PATH}?error=${encodeURIComponent(message)}`);
const done = (message: string): never => {
  revalidatePath("/app", "layout");
  return redirect(`${PATH}?msg=${encodeURIComponent(message)}`);
};
// The database messages are fixed strings, so matching on one picks the sentence shown to the member.
const detachMessage = (message: string) => (message.includes("own owner") ? NEEDS_OWNER : "Only an owner of the client or of its agency can do this.");
export async function turnIntoAgency() {
  const { supabase, org, role } = await getOrgContext();
  if (role !== "owner" || org.agency_id) return fail("Only an owner of a workspace that is not a client can turn it into an agency.");
  const { error } = await supabase.rpc("set_agency_mode", { p_org: org.id, p_on: true });
  if (error) return fail("Only an owner can change this.");
  return done(`${org.name} is now an agency.`);
}
export async function turnOffAgency() {
  const { supabase, org, role } = await getOrgContext();
  if (role !== "owner") return fail("Only an owner can change this.");
  const { error } = await supabase.rpc("set_agency_mode", { p_org: org.id, p_on: false });
  if (error) return fail(error.code === "42501" ? "Only an owner can change this." : "Remove or release every client workspace first.");
  return done("Agency mode is off.");
}
export async function createClientWorkspace(formData: FormData) {
  const { supabase, org, canManage } = await getOrgContext();
  if (!org.is_agency || !canManage) return fail("Only owners and admins of an agency can create client workspaces.");
  const name = cleanText(formData.get("name"), 80);
  if (!name) return fail("Enter a workspace name up to 80 characters.");
  if (!isSafeName(name)) return fail("Workspace names cannot contain links, web or email addresses.");
  const { data, error } = await supabase.rpc("create_client_workspace", { p_agency: org.id, p_name: name });
  if (error || !data) return fail("Could not create the client workspace.");
  return done(`Created ${name}. Open it from the list or the workspace switcher.`);
}
export async function openClient(clientId: string) {
  const ctx = await getOrgContext();
  if (!UUID_RE.test(clientId) || !ctx.orgs.some((o) => o.id === clientId)) return fail("That workspace is not available to you.");
  await setOrgCookie(clientId);
  redirect("/app");
}
export async function releaseClient(clientId: string) {
  const { supabase, org, role } = await getOrgContext();
  if (!UUID_RE.test(clientId)) return fail("That workspace is not available to you.");
  if (!org.is_agency || role !== "owner") return fail("Only an owner of the agency can release a client workspace.");
  const { error } = await supabase.rpc("detach_client_workspace", { p_client: clientId });
  if (error) return fail(detachMessage(error.message));
  return done("The client workspace was released. Its own members keep it, and agency staff no longer reach it.");
}
export async function leaveAgency() {
  const { supabase, org } = await getOrgContext();
  if (!org.agency_id) return fail("This workspace is not managed by an agency.");
  const { error } = await supabase.rpc("detach_client_workspace", { p_client: org.id });
  if (error) return fail(detachMessage(error.message));
  return done("This workspace left the agency. Agency staff no longer reach it.");
}
