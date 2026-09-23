"use client";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { ChevronDown, PlaneTakeoff, PlaneLanding } from "lucide-react";
import {
  type FlightInfo,
  type FlightDirection,
  ATL_AIRLINES,
  ATL_TERMINALS,
} from "@/lib/booking";

interface Props {
  title: string;                 // "Outbound flight" / "Return flight"
  direction: FlightDirection;
  flight: FlightInfo;
  minDate: string;
  onChange: (flight: FlightInfo) => void;
}

const inputClass =
  "w-full h-11 rounded-xl bg-white/5 border border-white/10 text-white px-3 text-sm placeholder:text-[#A1A1AA]/40 focus:outline-none focus:border-[#7C3AED] transition-colors [color-scheme:dark]";

export default function FlightFields({ title, direction, flight, minDate, onChange }: Props) {
  const set = (key: keyof FlightInfo, value: string) => onChange({ ...flight, [key]: value });

  // Picking a known airline pre-fills its usual ATL terminal (still editable).
  const setAirline = (airline: string) => {
    const known = ATL_AIRLINES.find((a) => a.name.toLowerCase() === airline.trim().toLowerCase());
    onChange({ ...flight, airline, terminal: known ? known.terminal : flight.terminal });
  };

  const Icon = direction === "departing" ? PlaneTakeoff : PlaneLanding;
  const listId = `atl-airlines-${title.replace(/\W+/g, "-").toLowerCase()}`;

  return (
    <div className="glass rounded-2xl p-4 sm:p-5 space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-[#7C3AED] flex items-center justify-center flex-shrink-0">
          <Icon className="w-3 h-3 text-white" />
        </div>
        <h3 className="text-white font-semibold text-sm">{title}</h3>
        <span className="text-[#A1A1AA] text-xs">
          {direction === "departing" ? "(flying out of ATL)" : "(landing at ATL)"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-[#A1A1AA] text-xs mb-2 block">Flight Date</Label>
          <input
            type="date"
            required
            value={flight.date}
            min={minDate}
            onChange={(e) => set("date", e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <Label className="text-[#A1A1AA] text-xs mb-2 block">
            {direction === "departing" ? "Departure Time" : "Arrival Time"}
          </Label>
          <input
            type="time"
            required
            value={flight.time}
            onChange={(e) => set("time", e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-[#A1A1AA] text-xs mb-2 block">Airline</Label>
          <input
            required
            list={listId}
            value={flight.airline}
            onChange={(e) => setAirline(e.target.value)}
            placeholder="Delta"
            maxLength={60}
            className={inputClass}
          />
          <datalist id={listId}>
            {ATL_AIRLINES.map((a) => <option key={a.name} value={a.name} />)}
          </datalist>
        </div>
        <div>
          <Label className="text-[#A1A1AA] text-xs mb-2 block">Flight Number</Label>
          <input
            required
            value={flight.flightNumber}
            onChange={(e) => set("flightNumber", e.target.value.toUpperCase())}
            placeholder="DL 1234"
            maxLength={10}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <Label className="text-[#A1A1AA] text-xs mb-2 block">ATL Terminal</Label>
        <Select value={flight.terminal || null} onValueChange={(v) => v && set("terminal", v as string)}>
          <SelectTrigger className="w-full bg-white/5 border-white/10 text-white h-11 rounded-xl text-sm">
            <span className={`flex-1 text-left ${flight.terminal ? "" : "text-[#A1A1AA]/60"}`}>
              {flight.terminal || "Select terminal"}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-[#A1A1AA] flex-shrink-0" />
          </SelectTrigger>
          <SelectContent className="bg-[#171717] border-white/10">
            {ATL_TERMINALS.map((t) => (
              <SelectItem key={t} value={t} className="text-white focus:bg-white/10">{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
