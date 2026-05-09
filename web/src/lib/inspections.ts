import type { ProjectTypeId } from "@consentiq/shared";

export type InspectionStatus = "Upcoming" | "Not started";

export interface InspectionStage {
  id: string;
  title: string;
  category: string;
  status: InspectionStatus;
  timing: string;
  requirements: string[];
}

export interface InspectionSchedule {
  profile: string;
  summary: string;
  notes: string[];
  stages: InspectionStage[];
}

interface ProjectInspectionInput {
  project_type: ProjectTypeId;
  description?: string | null;
  address?: string | null;
}

type StageInput = Omit<InspectionStage, "id" | "status">;

function stage(input: StageInput): StageInput {
  return input;
}

const common = {
  drainageRoughIn: stage({
    title: "Drainage rough-in",
    category: "Drainage",
    timing: "Before backfill, with all drain runs exposed",
    requirements: ["Drain runs exposed", "Falls and bedding visible", "As-built changes documented"],
  }),
  plumbingRoughIn: stage({
    title: "Plumbing rough-in",
    category: "Plumbing",
    timing: "Before wall framing is closed or linings conceal pipework",
    requirements: ["Water supply visible", "Waste pipework visible", "Pressure or pre-cover checks ready"],
  }),
  frame: stage({
    title: "Frame",
    category: "Structure",
    timing: "After framing and bracing are complete, before insulation or lining",
    requirements: ["Framing complete", "Bracing installed", "Fixings and structural connections visible"],
  }),
  preLine: stage({
    title: "Pre-line",
    category: "Envelope and linings",
    timing: "After wrap, windows, insulation, and taped penetrations; before lining",
    requirements: ["Building wrap complete", "Insulation installed", "Windows and penetrations taped"],
  }),
  finalBuilding: stage({
    title: "Final building",
    category: "Completion",
    timing: "When all consented work is complete",
    requirements: ["All work complete", "Consent documents on site", "Required producer statements collected"],
  }),
};

const schedules = {
  newDwellingSlab: {
    profile: "New dwelling - timber frame, slab on ground",
    summary: "Full dwelling inspection schedule for a timber-framed house on a slab foundation.",
    notes: ["Assumes slab-on-ground unless the description mentions piles, pole foundations, or a subfloor."],
    stages: [
      stage({
        title: "Pre-pour foundation",
        category: "Foundations",
        timing: "After reinforcing is laid and formwork is set, before concrete is poured",
        requirements: ["Reinforcing laid", "Formwork set", "DPM and penetrations visible"],
      }),
      common.drainageRoughIn,
      common.plumbingRoughIn,
      common.frame,
      common.preLine,
      stage({
        title: "Drainage final",
        category: "Drainage",
        timing: "When all drainage work is complete",
        requirements: ["Drainage complete", "Drainlayer PS4 submitted", "As-built drainage records ready"],
      }),
      common.finalBuilding,
    ],
  },
  newDwellingPiles: {
    profile: "New dwelling - timber frame, pile foundations",
    summary: "Full dwelling inspection schedule where the foundation system includes piles and subfloor framing.",
    notes: [
      "Selected because the project description mentions piles, pole foundations, bearers, joists, or subfloor work.",
    ],
    stages: [
      stage({
        title: "Pile holes",
        category: "Foundations",
        timing: "After holes are excavated and before concrete is poured",
        requirements: ["Pile holes open", "Depths and locations visible", "Ground conditions available for inspection"],
      }),
      stage({
        title: "Pre-pour pile caps / ground beams",
        category: "Foundations",
        timing: "After reinforcing is set, before concrete is poured",
        requirements: ["Reinforcing set", "Formwork complete", "Structural details visible"],
      }),
      stage({
        title: "Subfloor",
        category: "Subfloor",
        timing: "After bearers, joists, and blocking are complete, before flooring goes down",
        requirements: ["Bearers and joists fixed", "Blocking installed", "Subfloor bracing visible"],
      }),
      common.drainageRoughIn,
      common.plumbingRoughIn,
      common.frame,
      common.preLine,
      common.finalBuilding,
    ],
  },
  extensionSlab: {
    profile: "Extension / addition - timber frame, slab",
    summary: "Focused addition schedule that inspects the new work and any structural opening into the existing house.",
    notes: ["Drainage rough-in is included only when the description indicates drainage changes."],
    stages: [
      stage({
        title: "Pre-pour foundation slab",
        category: "Foundations",
        timing: "After slab reinforcing and formwork are ready, before concrete is poured",
        requirements: ["Reinforcing laid", "Formwork set", "DPM and slab penetrations visible"],
      }),
      common.frame,
      common.preLine,
      common.finalBuilding,
    ],
  },
  deckDefault: {
    profile: "Deck",
    summary: "Typical deck hold points for footings and final safety barriers.",
    notes: [
      "Decks under 1m to ground may only require a final inspection. Decks over 1.5m may need a framing check.",
    ],
    stages: [
      stage({
        title: "Post holes / footings",
        category: "Foundations",
        timing: "After holes are excavated and before concrete is poured",
        requirements: ["Post holes open", "Depths and locations visible", "Ground clearances confirmable"],
      }),
      stage({
        title: "Final",
        category: "Completion",
        timing: "When deck framing, fixings, handrails, and balustrades are complete",
        requirements: ["Framing complete", "Handrails complete", "Balustrades and barriers complete"],
      }),
    ],
  },
  deckLow: {
    profile: "Deck under 1m",
    summary: "Low deck schedule where the BCO is most likely to inspect only completed work.",
    notes: ["Selected because the description indicates the deck is under 1m above ground."],
    stages: [
      stage({
        title: "Final",
        category: "Completion",
        timing: "When all deck work is complete",
        requirements: ["Framing complete", "Fixings visible where practical", "Steps, edges, and finishes complete"],
      }),
    ],
  },
  deckHigh: {
    profile: "Deck over 1.5m",
    summary: "Higher deck schedule with footing and intermediate structural checks before final safety inspection.",
    notes: ["Selected because the description indicates the deck is over 1.5m above ground."],
    stages: [
      stage({
        title: "Post holes / footings",
        category: "Foundations",
        timing: "After holes are excavated and before concrete is poured",
        requirements: ["Post holes open", "Depths and locations visible", "Engineer details available if required"],
      }),
      stage({
        title: "Intermediate framing",
        category: "Structure",
        timing: "After primary deck framing is fixed, before it is concealed or difficult to inspect",
        requirements: ["Bearers and joists fixed", "Bracing and connections visible", "Barrier support framing visible"],
      }),
      stage({
        title: "Final",
        category: "Completion",
        timing: "When framing, handrails, stairs, and balustrades are complete",
        requirements: ["Handrails complete", "Balustrades complete", "Falls and access safety checked"],
      }),
    ],
  },
  accessoryBase: {
    profile: "Garage / sleep-out - slab, no plumbing",
    summary: "Accessory building schedule for a slab and timber frame with no plumbing work.",
    notes: ["Pre-line is skipped when the description clearly says the garage is unlined."],
    stages: [
      stage({
        title: "Pre-pour foundation",
        category: "Foundations",
        timing: "After reinforcing and formwork are ready, before concrete is poured",
        requirements: ["Reinforcing laid", "Formwork set", "DPM and penetrations visible"],
      }),
      common.frame,
      common.preLine,
      common.finalBuilding,
    ],
  },
} satisfies Record<string, Omit<InspectionSchedule, "stages"> & { stages: StageInput[] }>;

export function getInspectionSchedule(project: ProjectInspectionInput): InspectionSchedule {
  const text = [project.project_type, project.description, project.address]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (project.project_type === "new_dwelling") {
    return withStatuses(
      hasAny(text, ["pile", "piles", "pole", "subfloor", "bearer", "joist"])
        ? schedules.newDwellingPiles
        : schedules.newDwellingSlab,
    );
  }

  if (project.project_type === "extension") {
    const stages = hasAny(text, ["drain", "drainage", "stormwater", "sewer", "wastewater"])
      ? [schedules.extensionSlab.stages[0], common.drainageRoughIn, ...schedules.extensionSlab.stages.slice(1)]
      : schedules.extensionSlab.stages;
    return withStatuses({ ...schedules.extensionSlab, stages });
  }

  if (project.project_type === "deck") {
    if (mentionsUnderOneMetre(text)) return withStatuses(schedules.deckLow);
    if (mentionsOverOnePointFiveMetres(text)) return withStatuses(schedules.deckHigh);
    return withStatuses(schedules.deckDefault);
  }

  if (project.project_type === "accessory") {
    const hasPlumbing = hasAny(text, ["plumb", "bathroom", "toilet", "wc", "kitchen", "laundry", "sink", "waste"]);
    const isSleepout = hasAny(text, ["sleep", "habitable", "studio", "minor dwelling"]);
    const isUnlined = hasAny(text, ["unlined", "no lining", "not lined"]);
    const stages = schedules.accessoryBase.stages.filter(
      (item) => item.title !== "Pre-line" || !isUnlined || isSleepout,
    );
    const plumbingStages = hasPlumbing ? [common.drainageRoughIn, common.plumbingRoughIn] : [];
    return withStatuses({
      ...schedules.accessoryBase,
      profile: hasPlumbing ? "Garage / sleep-out - with plumbing" : schedules.accessoryBase.profile,
      summary: hasPlumbing
        ? "Accessory building schedule with drainage and plumbing rough-in hold points."
        : schedules.accessoryBase.summary,
      notes: [
        ...schedules.accessoryBase.notes,
        ...(isSleepout
          ? [
              "Sleeping accommodation is treated closer to a dwelling, so frame and pre-line are firm hold points.",
            ]
          : []),
      ],
      stages: [stages[0], ...plumbingStages, ...stages.slice(1)],
    });
  }

  return withStatuses(schedules.extensionSlab);
}

function withStatuses(schedule: Omit<InspectionSchedule, "stages"> & { stages: StageInput[] }): InspectionSchedule {
  return {
    ...schedule,
    stages: schedule.stages.map((item, index) => ({
      ...item,
      id: slugifyInspection(`${index + 1}-${item.title}`),
      status: index === 0 ? "Upcoming" : "Not started",
    })),
  };
}

function hasAny(value: string, needles: string[]) {
  return needles.some((needle) => value.includes(needle));
}

function mentionsUnderOneMetre(value: string) {
  return /under\s*1(?:\.0)?\s*m|below\s*1(?:\.0)?\s*m|less than\s*1(?:\.0)?\s*m/.test(value);
}

function mentionsOverOnePointFiveMetres(value: string) {
  return /over\s*1\.5\s*m|above\s*1\.5\s*m|more than\s*1\.5\s*m|>\s*1\.5\s*m/.test(value);
}

function slugifyInspection(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
