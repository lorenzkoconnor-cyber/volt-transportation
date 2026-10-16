"use client";

// Live app settings (prices, business info, Military Discount, …) for client
// components. The root layout loads them on the server and passes them in, so
// pages render with the current values — no flash of old prices.

import { createContext, useContext } from "react";
import { DEFAULT_SETTINGS, type AppSettings } from "@/lib/settings";

const SettingsContext = createContext<AppSettings>(DEFAULT_SETTINGS);

export function SettingsProvider({ value, children }: { value: AppSettings; children: React.ReactNode }) {
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useAppSettings(): AppSettings {
  return useContext(SettingsContext);
}
