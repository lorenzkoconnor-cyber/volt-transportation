"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Zap, Eye, EyeOff, CheckCircle, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export default function SetPasswordPage() {
  const router = useRouter();
  const [password, setPassword]       = useState("");
  const [confirm, setConfirm]         = useState("");
  const [showPw, setShowPw]           = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [done, setDone]               = useState(false);
  const [isEmployee, setIsEmployee]   = useState(false);
  const [name, setName]               = useState("");

  const supabase = createClient();

  // Check if this user is an employee so we can personalise the message
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/emp-login"); return; }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: emp } = await (supabase as any)
        .from("employees")
        .select("first_name, role")
        .eq("user_id", user.id)
        .single();

      if (emp) {
        setIsEmployee(true);
        setName(emp.first_name);
      }
    })();
  }, [supabase, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });

    if (err) {
      setError("Could not set password. Your invite link may have expired — request a new one.");
      setLoading(false);
      return;
    }

    setDone(true);
    // Redirect employees → dashboard, customers → portal
    setTimeout(() => {
      router.replace(isEmployee ? "/admin" : "/portal");
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] grid-bg flex items-center justify-center px-4">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[300px] bg-[#7C3AED]/6 blur-[100px] pointer-events-none" />

      <div className="w-full max-w-sm relative">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-10">
          <div className="w-9 h-9 rounded-xl bg-[#7C3AED] flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" fill="white" />
          </div>
          <span className="text-white font-semibold text-xl tracking-tight">Volt</span>
        </div>

        <div className="glass rounded-2xl p-8">
          {done ? (
            <div className="text-center py-4">
              <div className="w-14 h-14 rounded-full bg-[#7C3AED]/15 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-7 h-7 text-[#7C3AED]" />
              </div>
              <h2 className="text-white font-bold text-lg mb-2">
                {name ? `Welcome, ${name}!` : "You're all set!"}
              </h2>
              <p className="text-[#A1A1AA] text-sm">
                {isEmployee
                  ? "Taking you to your dashboard…"
                  : "Taking you to your account…"}
              </p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-center gap-2 mb-1">
                {isEmployee && <Shield className="w-4 h-4 text-[#7C3AED]" />}
                <h1 className="text-white font-bold text-xl">
                  {name ? `Welcome, ${name}` : "Set your password"}
                </h1>
              </div>
              <p className="text-[#A1A1AA] text-sm mb-6">
                {isEmployee
                  ? "Create a password to access the Volt employee dashboard."
                  : "Create a password for your Volt account."}
              </p>

              {error && (
                <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label className="text-[#A1A1AA] text-xs mb-2 block">New Password</Label>
                  <div className="relative">
                    <Input
                      required
                      type={showPw ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Minimum 8 characters"
                      className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 h-11 rounded-xl focus:border-[#7C3AED] pr-10"
                    />
                    <button type="button" onClick={() => setShowPw(!showPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A1A1AA] hover:text-white transition-colors">
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <Label className="text-[#A1A1AA] text-xs mb-2 block">Confirm Password</Label>
                  <Input
                    required
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="••••••••"
                    className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 h-11 rounded-xl focus:border-[#7C3AED]"
                  />
                </div>

                {/* Password strength hints */}
                <ul className="space-y-1">
                  {[
                    { label: "At least 8 characters", met: password.length >= 8 },
                    { label: "Passwords match", met: password === confirm && confirm.length > 0 },
                  ].map((hint) => (
                    <li key={hint.label} className={`text-xs flex items-center gap-1.5 ${hint.met ? "text-green-400" : "text-[#A1A1AA]"}`}>
                      <CheckCircle className={`w-3 h-3 ${hint.met ? "text-green-400" : "text-[#A1A1AA]/40"}`} />
                      {hint.label}
                    </li>
                  ))}
                </ul>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#7C3AED] hover:bg-[#9D5FF5] text-white font-semibold h-11 rounded-xl disabled:opacity-60 mt-2"
                >
                  {loading ? "Setting password…" : "Set Password & Sign In"}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
