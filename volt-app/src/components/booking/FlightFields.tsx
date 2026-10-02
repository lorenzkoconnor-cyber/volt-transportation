"use client";

import { useId, useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Check, ChevronDown, PlaneTakeoff, PlaneLanding } from "lucide-react";
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
  "w-full h-11 rounded-xl bg-white/5 border border-white/10 text-white px-3 text-sm placeholder:text-[#A1A1AA]/40 focus:outline-none focus:border-[#FCC300] transition-colors [color-scheme:dark]";

export default function FlightFields({ title, direction, flight, minDate, onChange }: Props) {
  const set = (key: keyof FlightInfo, value: string) => onChange({ ...flight, [key]: value });

  // Picking a known airline pre-fills its usual ATL terminal (still editable).
  const setAirline = (airline: string) => {
    const known = ATL_AIRLINES.find((a) => a.name.toLowerCase() === airline.trim().toLowerCase());
    onChange({ ...flight, airline, terminal: known ? known.terminal : flight.terminal });
  };

  const Icon = direction === "departing" ? PlaneTakeoff : PlaneLanding;

  return (
    <div className="glass rounded-2xl p-4 sm:p-5 space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-[#FCC300] flex items-center justify-center flex-shrink-0">
          <Icon className="w-3 h-3 text-[#0A0A0A]" />
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
          <AirlinePicker value={flight.airline} onChange={setAirline} />
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

// Airline field: opening it always shows every airline (alphabetical), even
// after one is picked, so a rider can switch. Typing narrows the list; an
// airline that isn't listed can still be typed in.
function AirlinePicker({ value, onChange }: { value: string; onChange: (airline: string) => void }) {
  const [open, setOpen] = useState(false);
  const [filtering, setFiltering] = useState(false);   // true once the rider types
  const [highlight, setHighlight] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const query = value.trim().toLowerCase();
  const options = filtering && query
    ? ATL_AIRLINES.filter((a) => a.name.toLowerCase().includes(query))
    : ATL_AIRLINES;

  const show = () => { setOpen(true); setFiltering(false); setHighlight(-1); };
  const choose = (name: string) => {
    onChange(name);
    setOpen(false);
    setFiltering(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) { show(); return; }
      const step = e.key === "ArrowDown" ? 1 : -1;
      setHighlight((h) => (options.length ? (h + step + options.length) % options.length : -1));
    } else if (e.key === "Enter" && open && highlight >= 0 && options[highlight]) {
      e.preventDefault();
      choose(options[highlight].name);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        required
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        value={value}
        onFocus={show}
        onClick={() => { if (!open) show(); }}
        onBlur={() => setOpen(false)}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setFiltering(true); setHighlight(-1); }}
        onKeyDown={onKeyDown}
        placeholder="Select airline"
        maxLength={60}
        className={`${inputClass} pr-9`}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Show all airlines"
        // Keep focus in the input so blur doesn't close the list first.
        onMouseDown={(e) => {
          e.preventDefault();
          if (open) setOpen(false);
          else { inputRef.current?.focus(); show(); }
        }}
        className="absolute right-0 top-0 h-11 w-9 flex items-center justify-center text-[#A1A1AA] hover:text-white"
      >
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-xl bg-[#171717] border border-white/10 py-1 shadow-xl"
        >
          {options.length === 0 ? (
            <li className="px-3 py-2 text-xs text-[#A1A1AA]">Not listed — keep typing your airline</li>
          ) : (
            options.map((a, i) => {
              const selected = a.name.toLowerCase() === query;
              return (
                <li
                  key={a.name}
                  role="option"
                  aria-selected={selected}
                  onMouseDown={(e) => { e.preventDefault(); choose(a.name); }}
                  onMouseEnter={() => setHighlight(i)}
                  className={`flex items-center justify-between px-3 py-2 text-sm cursor-pointer ${
                    i === highlight ? "bg-white/10 text-white" : "text-white/90"
                  }`}
                >
                  {a.name}
                  {selected && <Check className="w-3.5 h-3.5 text-[#FCC300]" />}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
