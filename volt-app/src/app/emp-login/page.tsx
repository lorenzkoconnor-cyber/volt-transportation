"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, Eye, EyeOff, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";

export default function EmpLoginPage() {
  const router = useRouter();
  const { signIn, isEmployee, employee, loading: authLoading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // If already logged in as employee, redirect to dashboard
  if (!authLoading && isEmployee && employee) {
    router.replace("/admin");
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: signInError } = await signIn(email, password);

    if (signInError) {
      setError("Invalid credentials. Please check your email and password.");
      setLoading(false);
      return;
    }

    // Re-check role after sign in
    // The AuthContext will update employee state — redirect on next render
    // We'll add a small delay to let the context update
    setTimeout(() => {
      router.replace("/admin");
    }, 500);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] grid-bg flex flex-col items-center justify-center px-4">
      {/* Subtle glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-[#7C3AED]/6 blur-[120px] pointer-events-none" />

      <div className="w-full max-w-sm relative">
        {/* Logo + badge */}
        <div className="flex flex-col items-center mb-10">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-9 h-9 rounded-xl bg-[#7C3AED] flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" fill="white" />
            </div>
            <span className="text-white font-semibold text-xl tracking-tight">Volt</span>
          </div>
          <div className="flex items-center gap-1.5 glass rounded-full px-3 py-1.5">
            <Shield className="w-3 h-3 text-[#7C3AED]" />
            <span className="text-[#A1A1AA] text-xs font-medium">Employee Portal</span>
          </div>
        </div>

        <div className="glass rounded-2xl p-8">
          <div className="mb-6">
            <h1 className="text-white font-bold text-xl">Staff Login</h1>
            <p className="text-[#A1A1AA] text-sm mt-1">
              Access the Volt operations dashboard.
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label className="text-[#A1A1AA] text-xs mb-2 block">Work Email</Label>
              <Input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@volttransportation.com"
                autoComplete="email"
                className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 h-12 rounded-xl focus:border-[#7C3AED]"
              />
            </div>

            <div>
              <Label className="text-[#A1A1AA] text-xs mb-2 block">Password</Label>
              <div className="relative">
                <Input
                  required
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 h-12 rounded-xl focus:border-[#7C3AED] pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A1A1AA] hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-[#7C3AED] hover:bg-[#9D5FF5] text-white font-semibold h-12 rounded-xl disabled:opacity-60 mt-2"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Signing in…
                </span>
              ) : (
                "Sign In to Dashboard"
              )}
            </Button>
          </form>

          <p className="text-center text-[#A1A1AA] text-xs mt-5">
            Having trouble?{" "}
            <a href="mailto:admin@volttransportation.com" className="text-[#7C3AED] hover:text-[#9D5FF5] transition-colors">
              Contact your administrator
            </a>
          </p>
        </div>

        {/* Back to site */}
        <div className="mt-6 text-center">
          <a href="/" className="text-[#3A3A3A] hover:text-[#A1A1AA] text-xs transition-colors">
            ← Back to Volt Transportation
          </a>
        </div>
      </div>
    </div>
  );
}
