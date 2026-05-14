import type { CSSProperties } from "react";
import type { SpecifiedSystemOption, Status } from "./types";
import type { Tone } from "@/components/ui/status-pill";

export const statusWeight: Record<Status, number> = {
  complete: 0,
  in_progress: 1,
  not_started: 2,
  action_required: 3,
};

export const statusTone: Record<Status, Tone> = {
  not_started: "neutral",
  in_progress: "warning",
  complete: "success",
  action_required: "danger",
};

export const SPECIFIED_SYSTEM_OPTIONS: SpecifiedSystemOption[] = [
  { code: "SS1", description: "Automatic systems for fire suppression" },
  { code: "SS2", description: "Emergency warning systems" },
  { code: "SS3/1", description: "Automatic door" },
  { code: "SS3/2", description: "Access controlled doors" },
  { code: "SS3/3", description: "Interfaced fire or smoke doors or windows" },
  { code: "SS4", description: "Emergency lighting systems" },
  { code: "SS5", description: "Escape route pressurisation systems" },
  { code: "SS6", description: "Riser mains" },
  { code: "SS7", description: "Automatic back-flow preventers" },
  { code: "SS8/1", description: "Passenger carrying lifts" },
  { code: "SS8/2", description: "Service lifts" },
  { code: "SS8/3", description: "Escalator and moving walks" },
  { code: "SS9", description: "Mechanical ventilation or air conditioning systems" },
  { code: "SS10", description: "Building maintenance units" },
  { code: "SS11", description: "Laboratory fume cupboards" },
  { code: "SS12/1", description: "Audio loops" },
  { code: "SS12/2", description: "FM radio and infrared beam transmission systems" },
  { code: "SS13/1", description: "Mechanical smoke control" },
  { code: "SS13/2", description: "Natural smoke control" },
  { code: "SS13/3", description: "Smoke curtains" },
  { code: "SS14/1", description: "Emergency power systems" },
  { code: "SS14/2", description: "Signs for SS1-13" },
  { code: "SS15/1", description: "Spoken information to facilitate evacuation" },
  { code: "SS15/2", description: "Final exits" },
  { code: "SS15/3", description: "Fire separations" },
  { code: "SS15/4", description: "Signs for facilitating evacuation" },
  { code: "SS15/5", description: "Smoke separations" },
  { code: "SS16", description: "Cable cars" },
];

export const modernSelectClassName =
  "w-full min-w-0 appearance-none rounded border border-ink-200 bg-surface-raised px-2.5 py-2 pr-8 text-xs leading-tight";

export const modernSelectArrowStyle: CSSProperties = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none'%3E%3Cpath d='M5 7.5L10 12.5L15 7.5' stroke='%2364748b' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 0.55rem center",
  backgroundSize: "0.95rem 0.95rem",
};
