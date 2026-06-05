"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Zap, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get("redirect") || "/portal";
  const { signIn, signUp } = useAuth();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [success, setSuccess] = useState("");

  // Form fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (mode === "login") {
      const { error: err } = await signIn(email, password);
      if (err) {
        setError("Invalid email or password. Please try again.");
        setLoading(false);
        return;
      }
      router.push(redirect);
    } else {
      if (password.length < 8) {
        setError("Password must be at least 8 characters.");
        setLoading(false);
        return;
      }
      const { error: err } = await signUp(email, password, firstName, lastName, phone);
      if (err) {
        setError(err);
        setLoading(false);
        return;
      }
      setSuccess("Account created! Check your email to confirm, then sign in.");
      setMode("login");
    }
    setLoading(false);
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError("Enter your email address above, then click Forgot Password.");
      return;
    }
    router.push(`/auth/reset-password?email=${encodeURIComponent(email)}`);
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center px-4 grid-bg">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-[#7C3AED]/8 blur-[100px] pointer-events-none" />

      <div className="w-full max-w-sm relative">
        {/* Logo */}
        <Link href="/" className="flex items-center justify-center gap-2 mb-10">
          <div className="w-9 h-9 rounded-xl bg-[#7C3AED] flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" fill="white" />
          </div>
          <span className="text-white font-semibold text-xl tracking-tight">Volt</span>
        </Link>

        <div className="glass rounded-2xl p-8">
          {/* Tab switcher */}
          <div className="flex rounded-xl overflow-hidden border border-white/10 mb-7">
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError(""); setSuccess(""); }}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                  mode === m ? "bg-[#7C3AED] text-white" : "text-[#A1A1AA] hover:text-white"
                }`}
              >
                {m === "login" ? "Sign In" : "Create Account"}
              </button>
            ))}
          </div>

          <div className="mb-6">
            <h1 className="text-white font-bold text-xl">
              {mode === "login" ? "Welcome back" : "Create your account"}
            </h1>
            <p className="text-[#A1A1AA] text-sm mt-1">
              {mode === "login"
                ? "Sign in to view your trips and manage bookings."
                : "Save your trips and rebook with one tap."}
            </p>
          </div>

          {success && (
            <div className="mb-4 p-3 rounded-xl bg-green-500/10 border border-green-500/20">
              <p className="text-green-400 text-sm">{success}</p>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[#A1A1AA] text-xs mb-1.5 block">First Name</Label>
                  <Input
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="John"
                    className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 h-11 rounded-xl focus:border-[#7C3AED]"
                  />
                </div>
                <div>
                  <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Last Name</Label>
                  <Input
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Smith"
                    className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 h-11 rounded-xl focus:border-[#7C3AED]"
                  />
                </div>
              </div>
            )}

            {mode === "signup" && (
              <div>
                <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Phone Number</Label>
                <Input
                  required
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(706) 555-0000"
                  className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 h-11 rounded-xl focus:border-[#7C3AED]"
                />
              </div>
            )}

            <div>
              <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Email</Label>
              <Input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 h-11 rounded-xl focus:border-[#7C3AED]"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label className="text-[#A1A1AA] text-xs">Password</Label>
                {mode === "login" && (
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-[#7C3AED] text-xs hover:text-[#9D5FF5] transition-colors"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Input
                  required
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  minLength={mode === "signup" ? 8 : 1}
                  className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 h-11 rounded-xl focus:border-[#7C3AED] pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A1A1AA] hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {mode === "signup" && (
                <p className="text-[#A1A1AA] text-xs mt-1">Minimum 8 characters</p>
              )}
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-[#7C3AED] hover:bg-[#9D5FF5] text-white font-semibold h-11 rounded-xl mt-2 disabled:opacity-60"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  {mode === "login" ? "Signing in…" : "Creating account…"}
                </span>
              ) : (
                mode === "login" ? "Sign In" : "Create Account"
              )}
            </Button>
          </form>

          <p className="text-center text-[#A1A1AA] text-xs mt-5">
            {mode === "login" ? "Don't have an account? " : "Already have an account? "}
            <button
              type="button"
              onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}
              className="text-[#7C3AED] hover:text-[#9D5FF5] transition-colors"
            >
              {mode === "login" ? "Create one" : "Sign in"}
            </button>
          </p>
        </div>

        <div className="mt-6 text-center space-y-2">
          <p className="text-[#A1A1AA] text-xs">
            No account needed to book.{" "}
            <Link href="/book" className="text-[#7C3AED] hover:text-[#9D5FF5] transition-colors">
              Book as guest →
            </Link>
          </p>
          <Link href="/" className="block text-[#3A3A3A] hover:text-[#A1A1AA] text-xs transition-colors">
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-[#7C3AED]/30 border-t-[#7C3AED] animate-spin" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
