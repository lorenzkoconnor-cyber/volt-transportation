// ─── Volt Transportation — Supabase Database Types ───────────────────────────
// Auto-generate in production with: npx supabase gen types typescript --linked

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type EmployeeRole = "owner" | "manager" | "office_staff" | "driver";
export type ReservationStatus = "pending" | "confirmed" | "cancelled" | "no_show" | "completed";
export type PaymentMethod = "stripe" | "cash" | "comp";
export type PaymentStatus = "pending" | "paid" | "refunded" | "failed";
export type VehicleStatus = "active" | "maintenance" | "retired";
export type NotificationType = "sms" | "email";
export type TripStatus = "scheduled" | "boarding" | "in_progress" | "completed" | "cancelled";

export interface Database {
  public: {
    Tables: {
      // ── Routes ──────────────────────────────────────────────────────────────
      routes: {
        Row: {
          id: string;
          name: string;                    // "Columbus → ATL"
          origin_label: string;            // "Columbus, GA"
          origin_key: string;              // "columbus"
          destination_label: string;       // "ATL Airport"
          destination_key: string;         // "atl"
          duration_minutes: number;        // ~150
          is_active: boolean;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["routes"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["routes"]["Insert"]>;
      };

      // ── Trips (scheduled departures) ─────────────────────────────────────
      trips: {
        Row: {
          id: string;
          route_id: string;
          departure_date: string;          // "2026-07-10"
          departure_time: string;          // "08:00"
          total_capacity: number;          // 8 (per vehicle)
          seats_booked: number;
          status: TripStatus;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["trips"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["trips"]["Insert"]>;
      };

      // ── Vehicles ─────────────────────────────────────────────────────────
      vehicles: {
        Row: {
          id: string;
          name: string;                    // "Sprinter 01"
          license_plate: string;
          make: string;                    // "Mercedes"
          model: string;                   // "Sprinter"
          year: number;
          capacity: number;                // 8
          status: VehicleStatus;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["vehicles"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["vehicles"]["Insert"]>;
      };

      // ── Trip ↔ Vehicle assignments ────────────────────────────────────────
      trip_vehicles: {
        Row: {
          id: string;
          trip_id: string;
          vehicle_id: string;
          driver_id: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["trip_vehicles"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["trip_vehicles"]["Insert"]>;
      };

      // ── Drivers ──────────────────────────────────────────────────────────
      drivers: {
        Row: {
          id: string;
          employee_id: string | null;      // links to employees table if they have a login
          first_name: string;
          last_name: string;
          phone: string;
          email: string | null;
          license_number: string;
          is_active: boolean;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["drivers"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["drivers"]["Insert"]>;
      };

      // ── Employee accounts ─────────────────────────────────────────────────
      employees: {
        Row: {
          id: string;
          user_id: string;                 // references auth.users
          role: EmployeeRole;
          first_name: string;
          last_name: string;
          email: string;
          phone: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["employees"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["employees"]["Insert"]>;
      };

      // ── Customer profiles (optional accounts) ─────────────────────────────
      customers: {
        Row: {
          id: string;
          user_id: string | null;          // null = guest booking
          first_name: string;
          last_name: string;
          email: string;
          phone: string;
          is_military: boolean;
          stripe_customer_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["customers"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["customers"]["Insert"]>;
      };

      // ── Reservations ─────────────────────────────────────────────────────
      reservations: {
        Row: {
          id: string;
          confirmation_number: string;     // "VOLT-ABC123"
          customer_id: string;
          trip_id: string;
          return_trip_id: string | null;   // for round trips
          status: ReservationStatus;
          adults: number;
          children: number;
          pets: number;
          extra_bags: number;
          is_round_trip: boolean;
          special_notes: string | null;
          discount_id: string | null;
          subtotal_cents: number;          // stored in cents to avoid float issues
          discount_cents: number;
          total_cents: number;
          created_at: string;
          updated_at: string;
          cancelled_at: string | null;
          created_by_employee_id: string | null; // null = self-booked online
        };
        Insert: Omit<Database["public"]["Tables"]["reservations"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["reservations"]["Insert"]>;
      };

      // ── Passengers (manifest entries per reservation) ─────────────────────
      reservation_passengers: {
        Row: {
          id: string;
          reservation_id: string;
          name: string;
          is_primary: boolean;
          is_boarded: boolean;
          is_no_show: boolean;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["reservation_passengers"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["reservation_passengers"]["Insert"]>;
      };

      // ── Payments ─────────────────────────────────────────────────────────
      payments: {
        Row: {
          id: string;
          reservation_id: string;
          method: PaymentMethod;
          status: PaymentStatus;
          amount_cents: number;
          stripe_payment_intent_id: string | null;
          stripe_charge_id: string | null;
          refund_amount_cents: number;
          refunded_at: string | null;
          refunded_by_employee_id: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["payments"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["payments"]["Insert"]>;
      };

      // ── Discounts ────────────────────────────────────────────────────────
      discounts: {
        Row: {
          id: string;
          code: string | null;             // null = staff-applied only
          name: string;                    // "Military Discount"
          type: "percent" | "fixed";
          value: number;                   // 10 = 10% or $10
          is_active: boolean;
          usage_count: number;
          max_usage: number | null;
          expires_at: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["discounts"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["discounts"]["Insert"]>;
      };

      // ── Notifications log ─────────────────────────────────────────────────
      notifications: {
        Row: {
          id: string;
          reservation_id: string;
          type: NotificationType;
          recipient: string;               // phone or email
          message: string;
          sent_at: string;
          status: "sent" | "failed" | "pending";
          provider_id: string | null;      // Twilio SID or SendGrid ID
        };
        Insert: Omit<Database["public"]["Tables"]["notifications"]["Row"], "id">;
        Update: Partial<Database["public"]["Tables"]["notifications"]["Insert"]>;
      };

      // ── Audit log ────────────────────────────────────────────────────────
      audit_logs: {
        Row: {
          id: string;
          actor_id: string | null;         // employee user_id or "system"
          actor_role: string | null;
          action: string;                  // "reservation.cancelled", "payment.refunded" etc.
          table_name: string;
          record_id: string;
          old_data: Json | null;
          new_data: Json | null;
          ip_address: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["audit_logs"]["Row"], "id" | "created_at">;
        Update: never;                     // audit logs are immutable
      };
    };

    Views: {
      // Convenient view joining reservations with trip, customer, and payment
      reservation_details: {
        Row: {
          id: string;
          confirmation_number: string;
          status: ReservationStatus;
          customer_first_name: string;
          customer_last_name: string;
          customer_email: string;
          customer_phone: string;
          trip_date: string;
          trip_time: string;
          route_name: string;
          origin_label: string;
          destination_label: string;
          adults: number;
          children: number;
          pets: number;
          extra_bags: number;
          total_cents: number;
          payment_status: PaymentStatus | null;
          is_round_trip: boolean;
          created_at: string;
        };
      };
    };

    Functions: {
      get_trip_availability: {
        Args: { p_route_id: string; p_date: string };
        Returns: Array<{
          trip_id: string;
          departure_time: string;
          seats_available: number;
          total_capacity: number;
        }>;
      };
    };
  };
}

// ── Convenience type aliases ───────────────────────────────────────────────
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type Route = Tables<"routes">;
export type Trip = Tables<"trips">;
export type Vehicle = Tables<"vehicles">;
export type Driver = Tables<"drivers">;
export type Employee = Tables<"employees">;
export type Customer = Tables<"customers">;
export type Reservation = Tables<"reservations">;
export type ReservationPassenger = Tables<"reservation_passengers">;
export type Payment = Tables<"payments">;
export type Discount = Tables<"discounts">;
export type Notification = Tables<"notifications">;
export type AuditLog = Tables<"audit_logs">;
