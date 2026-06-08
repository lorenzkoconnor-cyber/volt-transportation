"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, Eye, EyeOff, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

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
    const supabase = createClient();
    const { error: err } = await supabase.auth.updateUser({ password });

    if (err) {
      setError("Could not update password. Your reset link may have expired — request a new one.");
    } else {
      setDone(true);
      setTimeout(() => router.replace("/portal"), 2500);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] grid-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-10">
          <div className="w-9 h-9 rounded-xl bg-[#7C3AED] flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" fill="white" />
          </div>
          <span className="text-white font-semibold text-xl">Volt</span>
        </div>

        <div className="glass rounded-2xl p-8">
          {done ? (
            <div className="text-center py-4">
              <div className="w-14 h-14 rounded-full bg-[#7C3AED]/15 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-7 h-7 text-[#7C3AED]" />
              </div>
              <h2 className="text-white font-bold text-lg mb-2">Password updated!</h2>
              <p className="text-[#A1A1AA] text-sm">Redirecting you to your account…</p>
            </div>
          ) : (
            <>
              <h1 className="text-white font-bold text-xl mb-1">Set new password</h1>
              <p className="text-[#A1A1AA] text-sm mb-6">Choose a strong password for your account.</p>

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
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Minimum 8 characters"
                      className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 h-11 rounded-xl focus:border-[#7C3AED] pr-10"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A1A1AA] hover:text-white">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
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
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#7C3AED] hover:bg-[#9D5FF5] text-white font-semibold h-11 rounded-xl disabled:opacity-60"
                >
                  {loading ? "Updating…" : "Update Password"}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
