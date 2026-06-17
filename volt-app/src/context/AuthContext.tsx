"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { User, Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { EmployeeRole } from "@/lib/supabase/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmployeeProfile {
  id: string;
  role: EmployeeRole;
  firstName: string;
  lastName: string;
  email: string;
}

interface CustomerProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  isMilitary: boolean;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  employee: EmployeeProfile | null;     // set if user is an employee
  customer: CustomerProfile | null;     // set if user is a customer
  isEmployee: boolean;
  isOwner: boolean;
  isManager: boolean;
  isOfficeStaff: boolean;
  isDriver: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, firstName: string, lastName: string, phone: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = createClient();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [employee, setEmployee] = useState<EmployeeProfile | null>(null);
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchEmployee = useCallback(async (userId: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("employees")
      .select("id, role, first_name, last_name, email")
      .eq("user_id", userId)
      .eq("is_active", true)
      .single();

    if (data) {
      setEmployee({
        id: data.id,
        role: data.role as EmployeeRole,
        firstName: data.first_name,
        lastName: data.last_name,
        email: data.email,
      });
    } else {
      setEmployee(null);
    }
  }, [supabase]);

  const fetchCustomer = useCallback(async (userId: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("customers")
      .select("id, first_name, last_name, email, phone, is_military")
      .eq("user_id", userId)
      .single();

    if (data) {
      setCustomer({
        id: data.id,
        firstName: data.first_name,
        lastName: data.last_name,
        email: data.email,
        phone: data.phone,
        isMilitary: data.is_military,
      });
    } else {
      setCustomer(null);
    }
  }, [supabase]);

  const refreshProfile = useCallback(async () => {
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) return;
    await Promise.all([
      fetchEmployee(currentUser.id),
      fetchCustomer(currentUser.id),
    ]);
  }, [supabase, fetchEmployee, fetchCustomer]);

  useEffect(() => {
    // Initial session load
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        Promise.all([
          fetchEmployee(s.user.id),
          fetchCustomer(s.user.id),
        ]).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, s) => {
        if (event === "PASSWORD_RECOVERY") {
          window.location.replace("/auth/set-password");
          return;
        }
        setSession(s);
        setUser(s?.user ?? null);
        if (s?.user) {
          await Promise.all([
            fetchEmployee(s.user.id),
            fetchCustomer(s.user.id),
          ]);
        } else {
          setEmployee(null);
          setCustomer(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [supabase, fetchEmployee, fetchCustomer]);

  // ── Auth actions ────────────────────────────────────────────────────────────

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signUp = async (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    phone: string
  ) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${(process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "")}/auth/callback`,
        data: { first_name: firstName, last_name: lastName },
      },
    });

    if (error) return { error: error.message };

    // Create customer record linked to the new user
    if (data.user) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: customerError } = await (supabase as any).from("customers").insert({
        user_id: data.user.id,
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        is_military: false,
      });
      if (customerError) return { error: "Account created but profile setup failed. Please contact support." };
    }

    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setEmployee(null);
    setCustomer(null);
  };

  // ── Derived permissions ────────────────────────────────────────────────────

  const isEmployeeUser = !!employee;
  const isOwner = employee?.role === "owner";
  const isManager = employee?.role === "manager";
  const isOfficeStaff = employee?.role === "office_staff";
  const isDriver = employee?.role === "driver";

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        employee,
        customer,
        isEmployee: isEmployeeUser,
        isOwner,
        isManager,
        isOfficeStaff,
        isDriver,
        loading,
        signIn,
        signUp,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

// Role guard hooks
export function useRequireEmployee() {
  const auth = useAuth();
  return { ...auth, hasAccess: auth.isEmployee };
}

export function useRequireRole(roles: EmployeeRole[]) {
  const auth = useAuth();
  const hasAccess = !!auth.employee && roles.includes(auth.employee.role);
  return { ...auth, hasAccess };
}
