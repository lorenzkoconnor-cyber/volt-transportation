"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { useAuth } from "@/context/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft, Loader2, User, CheckCircle2, AlertCircle, KeyRound, Eye, EyeOff,
  ShieldCheck, BadgeCheck, Clock, Upload,
} from "lucide-react";
import {
  MILITARY_CATEGORIES,
  MILITARY_ID_ACCEPT,
  isAllowedIdFile,
  type MilitaryCategory,
} from "@/lib/military";

export default function EditProfilePage() {
  const router = useRouter();
  const { user, customer, loading, refreshProfile } = useAuth();
  const supabase = createClient();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName]   = useState("");
  const [phone, setPhone]         = useState("");
  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError]     = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [newPassword, setNewPassword]         = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword]       = useState(false);
  const [pwSaving, setPwSaving]               = useState(false);
  const [pwError, setPwError]                 = useState("");
  const [pwSuccess, setPwSuccess]             = useState(false);

  // Military & First Responder verification
  const [milCategory, setMilCategory]  = useState<MilitaryCategory | "">("");
  const [milFile, setMilFile]          = useState<File | null>(null);
  const [milError, setMilError]        = useState("");
  const [milUploading, setMilUploading] = useState(false);

  const militaryStatus = customer?.militaryStatus ?? "none";

  const handleMilitaryFile = (f: File | null) => {
    setMilError("");
    if (!f) { setMilFile(null); return; }
    const check = isAllowedIdFile(f.type, f.size);
    if (!check.ok) { setMilFile(null); setMilError(check.error ?? "Invalid file."); return; }
    setMilFile(f);
  };

  const handleMilitarySubmit = async () => {
    setMilError("");
    if (!milCategory) { setMilError("Please choose a category."); return; }
    if (!milFile) { setMilError("Please upload your ID."); return; }
    setMilUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", milFile);
      fd.append("category", milCategory);
      const res = await fetch("/api/military/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed.");
      setMilFile(null);
      setMilCategory("");
      await refreshProfile();
    } catch (err) {
      setMilError(err instanceof Error ? err.message : "Upload failed. Please try again.");
    }
    setMilUploading(false);
  };

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login?redirect=/portal/profile");
    }
  }, [user, loading, router]);

  // Pre-fill the form once the customer profile loads
  useEffect(() => {
    if (customer) {
      setFirstName(customer.firstName);
      setLastName(customer.lastName);
      setPhone(customer.phone);
    }
  }, [customer]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#7C3AED] animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    setSaveSuccess(false);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    let error;

    if (customer) {
      ({ error } = await sb
        .from("customers")
        .update({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.trim(),
        })
        .eq("id", customer.id));
    } else {
      // Profile row missing (e.g. insert failed during signup) — create it now
      ({ error } = await sb.from("customers").insert({
        user_id: user.id,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: user.email,
        phone: phone.trim(),
        is_military: false,
      }));
    }

    if (error) {
      setSaveError(error.message ?? "Failed to save changes. Please try again.");
    } else {
      await refreshProfile();
      setSaveSuccess(true);
    }
    setSaving(false);
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError("");
    setPwSuccess(false);

    if (newPassword.length < 8) {
      setPwError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError("Passwords do not match.");
      return;
    }

    setPwSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setPwError(error.message);
    } else {
      setPwSuccess(true);
      setNewPassword("");
      setConfirmPassword("");
    }
    setPwSaving(false);
  };

  return (
    <>
      <Navbar />
      <main className="pt-20 min-h-screen">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <Link href="/portal">
              <button className="w-9 h-9 rounded-xl glass flex items-center justify-center text-[#A1A1AA] hover:text-white transition-colors">
                <ArrowLeft className="w-4 h-4" />
              </button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-white">Edit Profile</h1>
              <p className="text-[#A1A1AA] text-sm">{user.email}</p>
            </div>
          </div>

          {/* Profile details */}
          <form onSubmit={handleSave} className="glass rounded-2xl p-6 sm:p-7 space-y-5 mb-8">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-full bg-[#7C3AED]/20 flex items-center justify-center">
                <User className="w-4.5 h-4.5 text-[#7C3AED]" size={18} />
              </div>
              <h2 className="text-white font-semibold">Personal Information</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-[#A1A1AA] text-xs mb-1.5 block">First Name *</Label>
                <Input
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First name"
                  className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 h-11 rounded-xl focus:border-[#7C3AED]"
                />
              </div>
              <div>
                <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Last Name *</Label>
                <Input
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last name"
                  className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 h-11 rounded-xl focus:border-[#7C3AED]"
                />
              </div>
            </div>

            <div>
              <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Phone *</Label>
              <Input
                required
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(706) 555-0000"
                className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 h-11 rounded-xl focus:border-[#7C3AED]"
              />
              <p className="text-[#A1A1AA] text-xs mt-1.5">
                We use this to reach you about your trips (delays, reminders, pickup updates).
              </p>
            </div>

            <div>
              <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Email</Label>
              <Input
                value={user.email ?? ""}
                disabled
                className="bg-white/3 border-white/10 text-[#A1A1AA] h-11 rounded-xl cursor-not-allowed"
              />
              <p className="text-[#A1A1AA] text-xs mt-1.5">
                Your email is your sign-in and can&apos;t be changed here. Contact us if you need to update it.
              </p>
            </div>

            {saveError && (
              <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-red-400 text-sm">{saveError}</p>
              </div>
            )}
            {saveSuccess && (
              <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
                <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                <p className="text-green-400 text-sm">Profile updated.</p>
              </div>
            )}

            <Button
              type="submit"
              disabled={saving}
              className="w-full bg-[#7C3AED] hover:bg-[#9D5FF5] text-white font-semibold h-11 rounded-xl disabled:opacity-60"
            >
              {saving
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</>
                : "Save Changes"}
            </Button>
          </form>

          {/* Military & First Responder discount */}
          <div className="glass rounded-2xl p-6 sm:p-7 space-y-5 mb-8">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-full bg-[#7C3AED]/20 flex items-center justify-center">
                <ShieldCheck className="w-4.5 h-4.5 text-[#7C3AED]" size={18} />
              </div>
              <div>
                <h2 className="text-white font-semibold">Military &amp; First Responder Discount</h2>
                <p className="text-[#A1A1AA] text-xs">5% off every booking for verified members</p>
              </div>
            </div>

            {militaryStatus === "approved" && (
              <div className="flex items-start gap-3 bg-green-500/10 border border-green-500/25 rounded-xl px-4 py-3">
                <BadgeCheck className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-green-400 text-sm font-medium">Verified</p>
                  <p className="text-[#A1A1AA] text-xs mt-0.5">
                    Your 5% discount is applied automatically at checkout. Thank you for your service.
                  </p>
                </div>
              </div>
            )}

            {militaryStatus === "pending" && (
              <div className="flex items-start gap-3 bg-yellow-500/10 border border-yellow-500/25 rounded-xl px-4 py-3">
                <Clock className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-yellow-400 text-sm font-medium">Under review</p>
                  <p className="text-[#A1A1AA] text-xs mt-0.5">
                    We&apos;re verifying your ID. Once approved, the discount applies automatically — and
                    we&apos;ll refund the 5% on any booking you make in the meantime.
                  </p>
                </div>
              </div>
            )}

            {(militaryStatus === "none" || militaryStatus === "rejected") && (
              <>
                {militaryStatus === "rejected" && (
                  <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-red-400 text-sm">
                      We couldn&apos;t verify your last submission. You&apos;re welcome to upload a clearer ID.
                    </p>
                  </div>
                )}

                <div>
                  <Label className="text-[#A1A1AA] text-xs mb-1.5 block">I am a…</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {MILITARY_CATEGORIES.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => setMilCategory(c.value)}
                        className={`text-left rounded-xl border px-3 py-2 transition-colors ${
                          milCategory === c.value
                            ? "border-[#7C3AED] bg-[#7C3AED]/10"
                            : "border-white/10 hover:border-white/25"
                        }`}
                      >
                        <div className="text-white text-sm font-medium">{c.label}</div>
                        <div className="text-[#A1A1AA] text-[11px] leading-tight mt-0.5">{c.hint}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Proof of service / department ID</Label>
                  <label className="flex items-center gap-2 rounded-xl border border-dashed border-white/20 hover:border-[#7C3AED] px-3 py-3 cursor-pointer transition-colors">
                    <Upload className="w-4 h-4 text-[#7C3AED] flex-shrink-0" />
                    <span className="text-sm text-[#A1A1AA] truncate">
                      {milFile?.name || "Upload a photo or PDF (JPG, PNG, HEIC, PDF · max 10 MB)"}
                    </span>
                    <input
                      type="file"
                      accept={MILITARY_ID_ACCEPT}
                      onChange={(e) => handleMilitaryFile(e.target.files?.[0] ?? null)}
                      className="hidden"
                    />
                  </label>
                  <p className="text-[#A1A1AA] text-[11px] mt-1.5">
                    Your ID is stored privately and only used to verify eligibility.
                  </p>
                </div>

                {milError && (
                  <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-red-400 text-sm">{milError}</p>
                  </div>
                )}

                <Button
                  type="button"
                  onClick={handleMilitarySubmit}
                  disabled={milUploading}
                  className="w-full bg-[#7C3AED] hover:bg-[#9D5FF5] text-white font-semibold h-11 rounded-xl disabled:opacity-60"
                >
                  {milUploading
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting…</>
                    : "Submit for Verification"}
                </Button>
              </>
            )}
          </div>

          {/* Change password */}
          <form onSubmit={handlePasswordChange} className="glass rounded-2xl p-6 sm:p-7 space-y-5">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-full bg-[#7C3AED]/20 flex items-center justify-center">
                <KeyRound className="w-4.5 h-4.5 text-[#7C3AED]" size={18} />
              </div>
              <h2 className="text-white font-semibold">Change Password</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-[#A1A1AA] text-xs mb-1.5 block">New Password</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min. 8 characters"
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
              </div>
              <div>
                <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Confirm New Password</Label>
                <Input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat password"
                  className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 h-11 rounded-xl focus:border-[#7C3AED]"
                />
              </div>
            </div>

            {pwError && (
              <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-red-400 text-sm">{pwError}</p>
              </div>
            )}
            {pwSuccess && (
              <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
                <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                <p className="text-green-400 text-sm">Password updated.</p>
              </div>
            )}

            <Button
              type="submit"
              disabled={pwSaving || !newPassword}
              variant="outline"
              className="w-full border-white/15 text-white hover:bg-white/5 h-11 rounded-xl disabled:opacity-60"
            >
              {pwSaving
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Updating…</>
                : "Update Password"}
            </Button>
          </form>
        </div>
      </main>
      <Footer />
    </>
  );
}
