import { createFileRoute } from "@tanstack/react-router";
import { SupabaseAuthGate } from "@/components/supabase-auth-gate";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <SupabaseAuthGate />;
}
