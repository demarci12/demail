-- Trigger functions run only as triggers: no client role may call them through RPC.
-- Firing a trigger does not check EXECUTE, so the triggers keep working.
revoke all on function
  public.set_updated_at(),
  public.prevent_org_change(),
  public.guard_last_owner(),
  public.suppress_matching_contacts(),
  public.guard_agency_fields(),
  public.guard_branding_agency(),
  public.guard_display_name(),
  public.guard_pool_agency(),
  public.guard_client_cap()
from public, anon, authenticated;
