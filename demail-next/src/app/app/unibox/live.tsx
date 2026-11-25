"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
// Refreshes the server-rendered page when threads or messages change; RLS decides what the socket may see.
export function UniboxLive({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        router.refresh();
      }, 1000);
    };
    const filter = `organization_id=eq.${organizationId}`;
    const channel = supabase
      .channel(`unibox:${organizationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "threads", filter }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "thread_messages", filter }, refresh)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [organizationId, router]);
  return null;
}
