"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Shield, Plus, Mail, Phone, CheckCircle2, XCircle, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";

const ROLE_STYLES: Record<string, { label: string; class: string; icon: React.ComponentType<{className?: string}> }> = {
  owner:        { label: "Owner",        class: "bg-[#7C3AED]/20 text-[#7C3AED] border border-[#7C3AED]/30", icon: Crown },
  manager:      { label: "Manager",      class: "bg-blue-500/15 text-blue-400",    icon: Shield },
  office_staff: { label: "Office Staff", class: "bg-cyan-500/15 text-cyan-400",    icon: Shield },
  driver:       { label: "Driver",       class: "bg-green-500/15 text-green-400",  icon: Shield },
};

const MOCK_EMPLOYEES = [
  { id: "e1", firstName: "Lorenzo", lastName: "Connor",  email: "lorenzo@volttransportation.com", phone: "(706) 555-9001", role: "owner",        isActive: true },
  { id: "e2", firstName: "Ashley",  lastName: "Reed",    email: "ashley@volttransportation.com",  phone: "(706) 555-9002", role: "manager",      isActive: true },
  { id: "e3", firstName: "Jordan",  lastName: "Price",   email: "jordan@volttransportation.com",  phone: "(706) 555-9003", role: "office_staff", isActive: true },
  { id: "e4", firstName: "Marcus",  lastName: "Johnson", email: "marcus@volttransportation.com",  phone: "(706) 555-1001", role: "driver",       isActive: true },
  { id: "e5", firstName: "Darnell", lastName: "Roberts", email: "darnell@volttransportation.com", phone: "(706) 555-1002", role: "driver",       isActive: true },
];

function EmployeesContent() {
  const { isOwner } = useAuth();
  const params = useSearchParams();
  const isPreview = params.get("preview") === "true";
  const [employees] = useState(MOCK_EMPLOYEES);

  if (!isOwner && !isPreview) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Shield className="w-12 h-12 text-[#A1A1AA]" />
        <p className="text-white font-semibold">Owner Access Required</p>
        <p className="text-[#A1A1AA] text-sm">Only the owner can manage employee accounts.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Employees</h1>
          <p className="text-[#A1A1AA] text-sm mt-0.5">{employees.filter(e=>e.isActive).length} active team members</p>
        </div>
        <Button className="bg-[#7C3AED] hover:bg-[#9D5FF5] text-white font-semibold">
          <Plus className="w-4 h-4 mr-1.5" /> Add Employee
        </Button>
      </div>

      {/* Role breakdown */}
      <div className="grid grid-cols-4 gap-3">
        {Object.entries(ROLE_STYLES).map(([role, info]) => {
          const Icon = info.icon;
          const count = employees.filter(e=>e.role===role).length;
          return (
            <div key={role} className={`glass rounded-xl p-4 ${count > 0 ? "" : "opacity-40"}`}>
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-3.5 h-3.5 text-[#7C3AED]" />
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${info.class}`}>{info.label}</span>
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
        <div className="divide-y divide-white/5">
          {employees.map((emp) => {
            const roleInfo = ROLE_STYLES[emp.role];
            const RoleIcon = roleInfo.icon;
            return (
              <div key={emp.id} className="grid grid-cols-12 gap-4 px-5 py-4 hover:bg-white/3 transition-colors items-center">
                <div className="col-span-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#7C3AED]/20 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {emp.firstName[0]}{emp.lastName[0]}
                  </div>
                  <span className="text-white font-medium text-sm">{emp.firstName} {emp.lastName}</span>
                </div>
                <div className="col-span-3">
                  <div className="flex items-center gap-1 text-[#A1A1AA] text-xs mb-0.5">
                    <Mail className="w-3 h-3" />
                    <span className="truncate">{emp.email}</span>
                  </div>
                  <div className="flex items-center gap-1 text-[#A1A1AA] text-xs">
                    <Phone className="w-3 h-3" />{emp.phone}
                  </div>
                </div>
                <div className="col-span-2">
                  <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium w-fit ${roleInfo.class}`}>
                    <RoleIcon className="w-3 h-3" />{roleInfo.label}
                  </span>
                </div>
                <div className="col-span-2 flex justify-center">
                  <span className={`flex items-center gap-1 text-xs font-medium ${emp.isActive ? "text-green-400" : "text-red-400"}`}>
                    {emp.isActive ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                    {emp.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="col-span-2 flex justify-end gap-2">
                  {emp.role !== "owner" && (
                    <>
                      <button className="text-[#A1A1AA] hover:text-white text-xs transition-colors">Edit</button>
                      <button className="text-[#A1A1AA] hover:text-red-400 text-xs transition-colors">
                        {emp.isActive ? "Deactivate" : "Activate"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[#A1A1AA] text-xs text-center">
        New employees receive a Supabase auth invite via email and can set their own password.
      </p>
    </div>
  );
}

export default function EmployeesPage() {
  return (
    <Suspense fallback={<div className="text-[#A1A1AA] p-8">Loading…</div>}>
      <EmployeesContent />
    </Suspense>
  );
}
