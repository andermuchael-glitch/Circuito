import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/components/landing-page";
import { SupabaseAuthGate } from "@/components/supabase-auth-gate";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const [showAuth, setShowAuth] = useState(() => {
    try {
      return Boolean(localStorage.getItem("circuito-supabase-session-v1"));
    } catch {
      return false;
    }
  });
  const [initialMode, setInitialMode] = useState<"login" | "signup">("login");

  if (!showAuth) {
    return (
      <LandingPage
        onEnter={() => {
          setInitialMode("login");
          setShowAuth(true);
        }}
        onSignup={() => {
          setInitialMode("signup");
          setShowAuth(true);
        }}
      />
    );
  }

  return <SupabaseAuthGate initialMode={initialMode} />;
}
