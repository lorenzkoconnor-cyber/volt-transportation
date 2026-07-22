"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Shield, Plus, Mail, Phone, CheckCircle2, XCircle,
  Crown, X, Loader2, UserPlus, Eye, EyeOff, KeyRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import { createClient } from "@/lib/supabase/client";

const ROLE_STYLES: Record<string, { label: string; class: string; icon: React.ComponentType<{ className?: string }> }> = {
  owner:        { label: "Owner",        class: "bg-[#7C3AED]/20 text-[#7C3AED] border border-[#7C3AED]/30", icon: Crown },
  manager:      { label: "Manager",      class: "bg-blue-500/15 text-blue-400",   icon: Shield },
  office_staff: { label: "Office Staff", class: "bg-cyan-500/15 text-cyan-400",   icon: Shield },
  driver:       { label: "Driver",       class: "bg-green-500/15 text-green-400", icon: Shield },
};

type Employee = {
  id: string;
  user_id: string;
  role: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  is_active: boolean;
  created_at: string;
};

function EmployeesContent() {
  const { isOwner } = useAuth();
  const params = useSearchParams();
  const isPreview = params.get("preview") === "true";

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);

  // Add employee form state
  const [inviteEmail, setInviteEmail]         = useState("");
  const [inviteFirst, setInviteFirst]         = useState("");
  const [inviteLast, setInviteLast]           = useState("");
  const [invitePhone, setInvitePhone]         = useState("");
  const [inviteRole, setInviteRole]           = useState("driver");
  const [invitePassword, setInvitePassword]   = useState("");
  const [showPassword, setShowPassword]       = useState(false);
  const [inviteLoading, setInviteLoading]     = useState(false);
  const [inviteError, setInviteError]         = useState("");
  const [inviteSuccess, setInviteSuccess]     = useState("");

  // Reset password modal state
  const [resetTarget, setResetTarget]         = useState<Employee | null>(null);
  const [resetPassword, setResetPassword]     = useState("");
  const [showResetPw, setShowResetPw]         = useState(false);
  const [resetLoading, setResetLoading]       = useState(false);
  const [resetError, setResetError]           = useState("");
  const [resetSuccess, setResetSuccess]       = useState("");

  const supabase = createClient();

  // Load employees from Supabase
  useEffect(() => {
    if (!isPreview && !isOwner) return;
    fetchEmployees();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner, isPreview]);

  const fetchEmployees = async () => {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("employees")
      .select("*")
      .order("created_at", { ascending: true });

    if (!error && data) setEmployees(data);
    setLoading(false);
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteLoading(true);
    setInviteError("");
    setInviteSuccess("");

    const res = await fetch("/api/employees/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: inviteEmail,
        firstName: inviteFirst,
        lastName: inviteLast,
        phone: invitePhone,
        role: inviteRole,
        password: invitePassword,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setInviteError(data.error ?? "Failed to create account");
    } else {
      setInviteSuccess(data.linkedExisting
        ? `${inviteFirst} ${inviteLast} already had a Volt account (from booking a ride), so we gave that account ${inviteRole} access and set the password you entered. They sign in at /emp-login.`
        : `Account created for ${inviteFirst} ${inviteLast}. They can sign in at /emp-login right away.`);
      setInviteEmail(""); setInviteFirst(""); setInviteLast("");
      setInvitePhone(""); setInviteRole("driver"); setInvitePassword("");
      fetchEmployees();
    }
    setInviteLoading(false);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    setResetLoading(true);
    setResetError("");
    setResetSuccess("");

    const res = await fetch("/api/employees/invite", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: resetTarget.user_id, newPassword: resetPassword }),
    });

    const data = await res.json();
    if (!res.ok) {
      setResetError(data.error ?? "Failed to reset password");
    } else {
      setResetSuccess(`Password updated for ${resetTarget.first_name}.`);
      setResetPassword("");
    }
    setResetLoading(false);
  };

  const toggleActive = async (emp: Employee) => {
    const res = await fetch("/api/employees/invite", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId: emp.id, isActive: !emp.is_active }),
    });
    if (res.ok) fetchEmployees();
  };

  const changeRole = async (emp: Employee, newRole: string) => {
    const res = await fetch("/api/employees/invite", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId: emp.id, role: newRole }),
    });
    if (res.ok) fetchEmployees();
  };

  if (!isOwner && !isPreview) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Shield className="w-12 h-12 text-[#A1A1AA]" />
        <p className="text-white font-semibold">Owner Access Required</p>
        <p className="text-[#A1A1AA] text-sm">Only the owner can manage employee accounts.</p>
      </div>
    );
  }

  const activeCount = employees.filter((e) => e.is_active).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Employees</h1>
          <p className="text-[#A1A1AA] text-sm mt-0.5">
            {activeCount} active · {employees.length} total
          </p>
        </div>
        <Button
          onClick={() => { setShowModal(true); setInviteSuccess(""); setInviteError(""); }}
          className="bg-[#7C3AED] hover:bg-[#9D5FF5] text-white font-semibold"
        >
          <Plus className="w-4 h-4 mr-1.5" /> Add Employee
        </Button>
      </div>

      {/* Role breakdown */}
      <div className="grid grid-cols-4 gap-3">
        {Object.entries(ROLE_STYLES).map(([role, info]) => {
          const Icon = info.icon;
          const count = employees.filter((e) => e.role === role && e.is_active).length;
          return (
            <div key={role} className={`glass rounded-xl p-4 ${count === 0 ? "opacity-40" : ""}`}>
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-3.5 h-3.5 text-[#7C3AED]" />
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${info.class}`}>
                  {info.label}
                </span>
              </div>
              <div className="text-white font-bold text-2xl mt-1">{count}</div>
            </div>
          );
        })}
      </div>

      {/* Employee table */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="grid grid-cols-12 gap-4 px-5 py-3 border-b border-white/8 text-[#A1A1AA] text-xs font-medium uppercase tracking-wider">
          <div className="col-span-3">Name</div>
          <div className="col-span-3">Contact</div>
          <div className="col-span-2">Role</div>
          <div className="col-span-2 text-center">Status</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-[#7C3AED] animate-spin" />
          </div>
        ) : employees.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <Shield className="w-8 h-8 text-[#A1A1AA]" />
            <p className="text-[#A1A1AA] text-sm">No employees yet — invite your first team member above.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {employees.map((emp) => {
              const roleInfo = ROLE_STYLES[emp.role] ?? ROLE_STYLES.driver;
              const RoleIcon = roleInfo.icon;
              return (
                <div key={emp.id} className="grid grid-cols-12 gap-4 px-5 py-4 hover:bg-white/3 transition-colors items-center">
                  <div className="col-span-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#7C3AED]/20 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {emp.first_name[0]}{emp.last_name[0]}
                    </div>
                    <span className="text-white font-medium text-sm truncate">
                      {emp.first_name} {emp.last_name}
                    </span>
                  </div>
                  <div className="col-span-3 min-w-0">
                    <div className="flex items-center gap-1 text-[#A1A1AA] text-xs mb-0.5 truncate">
                      <Mail className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{emp.email}</span>
                    </div>
                    {emp.phone && (
                      <div className="flex items-center gap-1 text-[#A1A1AA] text-xs">
                        <Phone className="w-3 h-3" />{emp.phone}
                      </div>
                    )}
                  </div>
                  <div className="col-span-2">
                    {emp.role === "owner" ? (
                      <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium w-fit ${roleInfo.class}`}>
                        <RoleIcon className="w-3 h-3" />{roleInfo.label}
                      </span>
                    ) : (
                      <select
                        value={emp.role}
                        onChange={(e) => changeRole(emp, e.target.value)}
                        className="bg-[#171717] border border-white/10 text-white text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#7C3AED]"
                      >
                        <option value="manager">Manager</option>
                        <option value="office_staff">Office Staff</option>
                        <option value="driver">Driver</option>
                      </select>
                    )}
                  </div>
                  <div className="col-span-2 flex justify-center">
                    <span className={`flex items-center gap-1 text-xs font-medium ${emp.is_active ? "text-green-400" : "text-red-400"}`}>
                      {emp.is_active
                        ? <><CheckCircle2 className="w-3.5 h-3.5" />Active</>
                        : <><XCircle className="w-3.5 h-3.5" />Inactive</>
                      }
                    </span>
                  </div>
                  <div className="col-span-2 flex justify-end gap-3">
                    <button
                      onClick={() => { setResetTarget(emp); setResetPassword(""); setResetError(""); setResetSuccess(""); }}
                      className="text-xs text-[#A1A1AA] hover:text-[#7C3AED] transition-colors"
                      title="Reset password"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                    </button>
                    {emp.role !== "owner" && (
                      <button
                        onClick={() => toggleActive(emp)}
                        className={`text-xs transition-colors ${
                          emp.is_active
                            ? "text-[#A1A1AA] hover:text-red-400"
                            : "text-[#A1A1AA] hover:text-green-400"
                        }`}
                      >
                        {emp.is_active ? "Deactivate" : "Reactivate"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* How it works note */}
      <div className="glass rounded-xl p-4 flex items-start gap-3">
        <UserPlus className="w-4 h-4 text-[#7C3AED] flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-white text-sm font-medium">How employee accounts work</p>
          <p className="text-[#A1A1AA] text-xs mt-0.5">
            You create each employee&apos;s account directly with a starting password — no email required.
            They sign in immediately at <span className="text-[#7C3AED]">/emp-login</span> and see only what their role allows.
            Use the key icon (<KeyRound className="w-3 h-3 inline" />) next to any employee to reset their password at any time.
          </p>
        </div>
      </div>

      {/* Add Employee Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative w-full max-w-md glass rounded-2xl p-7 border border-white/10 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-white font-bold text-lg">Add Employee</h2>
                <p className="text-[#A1A1AA] text-xs mt-0.5">Create their account — they can sign in immediately.</p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-[#A1A1AA] hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {inviteSuccess ? (
              <div className="text-center py-6">
                <div className="w-14 h-14 rounded-full bg-[#7C3AED]/15 flex items-center justify-center mx-auto mb-4">
                  <UserPlus className="w-7 h-7 text-[#7C3AED]" />
                </div>
                <p className="text-white font-semibold mb-2">Account Created!</p>
                <p className="text-[#A1A1AA] text-sm">{inviteSuccess}</p>
                <div className="flex gap-3 mt-5">
                  <Button onClick={() => setInviteSuccess("")} variant="outline" className="flex-1 border-white/15 text-white hover:bg-white/5">
                    Add Another
                  </Button>
                  <Button onClick={() => setShowModal(false)} className="flex-1 bg-[#7C3AED] hover:bg-[#9D5FF5] text-white">
                    Done
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleInvite} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[#A1A1AA] text-xs mb-1.5 block">First Name *</Label>
                    <Input required value={inviteFirst} onChange={(e) => setInviteFirst(e.target.value)}
                      placeholder="Marcus" className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 h-10 rounded-xl focus:border-[#7C3AED]" />
                  </div>
                  <div>
                    <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Last Name *</Label>
                    <Input required value={inviteLast} onChange={(e) => setInviteLast(e.target.value)}
                      placeholder="Johnson" className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 h-10 rounded-xl focus:border-[#7C3AED]" />
                  </div>
                </div>
                <div>
                  <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Work Email *</Label>
                  <Input required type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="employee@email.com" className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 h-10 rounded-xl focus:border-[#7C3AED]" />
                </div>
                <div>
                  <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Phone (optional)</Label>
                  <Input type="tel" value={invitePhone} onChange={(e) => setInvitePhone(e.target.value)}
                    placeholder="(706) 555-0000" className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 h-10 rounded-xl focus:border-[#7C3AED]" />
                </div>
                <div>
                  <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Role *</Label>
                  <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}
                    className="w-full h-10 bg-white/5 border border-white/10 text-white rounded-xl px-3 text-sm focus:outline-none focus:border-[#7C3AED]">
                    <option value="owner">Owner — full access, including employee management</option>
                    <option value="manager">Manager — full access except owner settings</option>
                    <option value="office_staff">Office Staff — bookings, check-in, payments</option>
                    <option value="driver">Driver — assigned trips and manifest only</option>
                  </select>
                  {inviteRole === "owner" && (
                    <p className="text-yellow-400/90 text-xs mt-1.5">
                      Owners have full control, including creating and removing other employees. Only add someone you fully trust.
                    </p>
                  )}
                </div>
                <div>
                  <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Starting Password *</Label>
                  <div className="relative">
                    <Input required type={showPassword ? "text" : "password"} value={invitePassword}
                      onChange={(e) => setInvitePassword(e.target.value)}
                      placeholder="Min. 8 characters"
                      minLength={8}
                      className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 h-10 rounded-xl focus:border-[#7C3AED] pr-10" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A1A1AA] hover:text-white transition-colors">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {inviteError && (
                  <p className="text-red-400 text-xs bg-red-500/10 rounded-lg px-3 py-2">{inviteError}</p>
                )}

                <Button type="submit" disabled={inviteLoading}
                  className="w-full bg-[#7C3AED] hover:bg-[#9D5FF5] text-white font-semibold h-11 rounded-xl disabled:opacity-60">
                  {inviteLoading
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating account…</>
                    : <><UserPlus className="w-4 h-4 mr-2" />Create Account</>
                  }
                </Button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => { setResetTarget(null); setResetSuccess(""); setResetError(""); }} />
          <div className="relative w-full max-w-sm glass rounded-2xl p-7 border border-white/10 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-white font-bold text-lg">Reset Password</h2>
                <p className="text-[#A1A1AA] text-xs mt-0.5">{resetTarget.first_name} {resetTarget.last_name}</p>
              </div>
              <button onClick={() => { setResetTarget(null); setResetSuccess(""); setResetError(""); }} className="text-[#A1A1AA] hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {resetSuccess ? (
              <div className="text-center py-4">
                <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-3" />
                <p className="text-white font-semibold mb-1">Password Updated</p>
                <p className="text-[#A1A1AA] text-sm mb-5">{resetSuccess}</p>
                <Button onClick={() => { setResetTarget(null); setResetSuccess(""); }} className="bg-[#7C3AED] hover:bg-[#9D5FF5] text-white w-full">Done</Button>
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <Label className="text-[#A1A1AA] text-xs mb-1.5 block">New Password *</Label>
                  <div className="relative">
                    <Input required type={showResetPw ? "text" : "password"} value={resetPassword}
                      onChange={(e) => setResetPassword(e.target.value)}
                      placeholder="Min. 8 characters"
                      minLength={8}
                      className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 h-10 rounded-xl focus:border-[#7C3AED] pr-10" />
                    <button type="button" onClick={() => setShowResetPw(!showResetPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A1A1AA] hover:text-white transition-colors">
                      {showResetPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                {resetError && <p className="text-red-400 text-xs bg-red-500/10 rounded-lg px-3 py-2">{resetError}</p>}
                <Button type="submit" disabled={resetLoading}
                  className="w-full bg-[#7C3AED] hover:bg-[#9D5FF5] text-white font-semibold h-11 rounded-xl disabled:opacity-60">
                  {resetLoading
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Updating…</>
                    : <><KeyRound className="w-4 h-4 mr-2" />Set New Password</>
                  }
                </Button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function EmployeesPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><Loader2 className="w-6 h-6 text-[#7C3AED] animate-spin" /></div>}>
      <EmployeesContent />
    </Suspense>
  );
}
