import type { ProjectTypeId } from "@atlas/shared";

export type InspectionStatus = "Upcoming" | "Not started";

export interface InspectionStage {
  id: string;
  inspectionTypeId: string;
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

export interface InspectionTypeDefinition {
  id: string;
  title: string;
  category: string;
  timing: string;
  requirements: string[];
}

interface ProjectInspectionInput {
  project_type: ProjectTypeId;
  description?: string | null;
  address?: string | null;
  estimated_floor_area_m2?: number | string | null;
  estimated_construction_value_nzd?: number | string | null;
  involves_structural_work?: boolean | null;
  involves_earthworks?: boolean | null;
  existing_structure_demolished?: boolean | null;
  new_road_access?: boolean | null;
  service_connection_water?: boolean | null;
  service_connection_wastewater?: boolean | null;
  service_connection_stormwater?: boolean | null;
}

export const MANUAL_INSPECTION_TYPE_ID = "manual";

const commonSedimentRequirement = "Sediment control measures are in place where site works are exposed";

export const inspectionTypes = [
  {
    id: "site-meeting-monitoring",
    title: "Site meeting monitoring",
    category: "Pre-start",
    timing: "Before work starts on complex or higher-risk projects",
    requirements: [
      "Construction hazards and excavations discussed on site",
      "Erosion and sediment controls agreed before site works",
      "Construction monitoring and documentation requirements confirmed",
      "Staged consent or certificate for public use requirements identified",
    ],
  },
  {
    id: "erosion-sediment-control",
    title: "Erosion and sediment control",
    category: "Earthworks",
    timing: "Before excavations or site clearance on earthworks or high-risk sites",
    requirements: [
      "Stabilised entranceway installed",
      "Clean water and dirty water diversions installed where required",
      "Silt fences, filter socks, inlet protection, or bunds installed as per ESC plan",
      "Stockpiles and dewatering controls are managed",
      "Approved consent documents and ESC plan are on site",
    ],
  },
  {
    id: "foundation-slab",
    title: "Foundation or slab",
    category: "Foundations",
    timing: "After setout, formwork, DPM, drainage penetrations, and reinforcing are ready; before concrete pour",
    requirements: [
      commonSedimentRequirement,
      "Building dimensions, setbacks, and finished floor level match the consented documents",
      "Ground conditions, geotechnical confirmation, or engineer reports are available where required",
      "DPM is lapped, taped, and installed correctly",
      "Reinforcing, cover, chairs, slab thickenings, and point loads are installed as designed",
      "Waste, drain, and soil pipes have not been displaced and gradients remain compliant",
      "Building location certificate or setout certificate is available where required",
    ],
  },
  {
    id: "subfloor-framing",
    title: "Subfloor framing",
    category: "Subfloor",
    timing: "After bearers, joists, blocking, subfloor plumbing, and insulation are ready; before flooring or baseboards close the area",
    requirements: [
      commonSedimentRequirement,
      "Subfloor connections, joist sizing, and required blocking match the consented design",
      "Suspended plumbing pipework is complete",
      "Subfloor insulation is installed",
      "Adequate subfloor ventilation is provided",
    ],
  },
  {
    id: "pre-roof",
    title: "Pre roof",
    category: "Structure",
    timing: "Before building wrap or roof cladding is fixed",
    requirements: [
      commonSedimentRequirement,
      "Previous site instructions have been completed or resolved",
      "Roof framing, trusses, purlins, bracing, restraints, and fixings match the consented design",
      "Wall framing, lintels, studs, plates, bracing elements, and hold-downs match the consented design",
      "Floor framing, steel beams, post-to-beam connections, and specific engineered design items are installed",
      "Building location certificate for recession planes or height is available where required",
      "As-built truss layout is available for the inspector",
    ],
  },
  {
    id: "pre-cladding",
    title: "Pre cladding",
    category: "Envelope",
    timing: "Before exterior cladding is fixed",
    requirements: [
      commonSedimentRequirement,
      "Previous site instructions have been completed or resolved",
      "Wrap type and fixing match the consented plans and manufacturer instructions",
      "Cavity battens, strapping, supports, and control joint support are installed where required",
      "Window and door fixings, sill flashings, jamb flashings, falls, and upstands are installed",
      "Penetrations are fixed and sealed as specified",
      "Brick veneer rebates and cladding flashings are waterproofed or completed where required",
    ],
  },
  {
    id: "half-high-masonry",
    title: "Half high masonry",
    category: "Masonry",
    timing: "When brick veneer reaches half height",
    requirements: [
      commonSedimentRequirement,
      "Previous site instructions have been completed or resolved",
      "Cavities are clean and free from obstructions",
      "Brick dimensions, bed joints, perpends, and brick type match the consented system",
      "Brick ties, weep holes, lintels, and flashings are installed as designed",
      "Services are not installed in the cavity",
      "Control joints and cavity width meet consented or manufacturer requirements",
    ],
  },
  {
    id: "pre-plaster-exterior",
    title: "Pre plaster exterior",
    category: "Envelope",
    timing: "Before plaster finish is applied to monolithic cladding",
    requirements: [
      commonSedimentRequirement,
      "Previous site instructions have been completed or resolved",
      "Cladding is installed to manufacturer instructions and consented documents",
      "Sheet layout, fixings, control joints, overlaps, and clearances are correct",
      "Flashings around openings, penetrations, and junctions are installed",
      "Sheet edges are primed or sealed",
      "Vermin proofing, sealed penetrations, and sill slopes are complete",
    ],
  },
  {
    id: "pre-line",
    title: "Pre line",
    category: "Pre-line",
    timing: "After exterior envelope, services, insulation, and pre-line plumbing are complete; before interior linings",
    requirements: [
      commonSedimentRequirement,
      "Previous site instructions have been completed or resolved",
      "Building is weathertight and no interior linings are fixed in place",
      "Services, cabling, ducting, and plumbing fit-outs are complete",
      "Framing moisture content is within NZS 3602 guidance or manufacturer requirements",
      "Insulation is installed as consented and does not encroach into cavities",
      "Window safety glass, restrictor stays, fixings, labels, and air seals are complete",
      "Waste and soil pipes are supported, correctly sized, durable, and installed to fall",
      "Water supply pipes are on pressure test, supported, protected, and have isolation valves",
      "B-084 plumber test documentation and engineer site reports are available where required",
    ],
  },
  {
    id: "pre-stop",
    title: "Pre stop",
    category: "Fire",
    timing: "Before stopping where fire resistant linings are required",
    requirements: [
      commonSedimentRequirement,
      "Fire and smoke elements and linings are complete and correctly fastened",
      "Fire rated electrical flush boxes are installed where required",
      "Back-to-back electrical installations have been avoided where required",
      "Penetrations are sealed with approved rated product",
      "Solid fixings are in place for fire collars",
      "Fire rated roof space or ceiling areas are ready for inspection before enclosure",
    ],
  },
  {
    id: "concrete-construction",
    title: "Concrete construction",
    category: "Structure",
    timing: "During concrete construction monitoring before concrete elements are closed or poured",
    requirements: [
      commonSedimentRequirement,
      "Reinforcing placement matches the consented or engineered design",
      "Tilt panels and connections are installed as designed",
      "Engineer construction monitoring report is available where required",
    ],
  },
  {
    id: "steel-construction",
    title: "Steel construction",
    category: "Structure",
    timing: "After structural steel placement and before it is concealed",
    requirements: [
      commonSedimentRequirement,
      "Beam sizes match the consented or engineered design",
      "Steel placement and support locations match the consented design",
      "Connections, fixings, and welds or bolts are ready for review",
      "Engineer construction monitoring report is available where required",
    ],
  },
  {
    id: "fire-resistant-lining",
    title: "Fire resistant lining",
    category: "Fire",
    timing: "Before plaster stopping, skirting, or scotia where fire resistant lining is required",
    requirements: [
      commonSedimentRequirement,
      "Building elements stop the spread of smoke, heat, and fire as consented",
      "Fire and smoke elements and linings are complete and correctly fixed",
      "Fire resistant filler and sealant are installed",
      "Fire resistant electrical fittings and fire collars are installed at wall penetrations",
    ],
  },
  {
    id: "interior-tanking",
    title: "Interior tanking",
    category: "Waterproofing",
    timing: "Before tiling or covering wet area waterproofing",
    requirements: [
      commonSedimentRequirement,
      "Substrate is clean, dry, suitable, and installed to manufacturer specifications",
      "Wet floor membrane covers the substrate with specified film thickness and bandaging",
      "Membrane is turned down into floor plumbing waste outlets",
      "Wet wall membrane extends around showers, baths, and adjacent surfaces as required",
      "PS3 from the licensed installer is on site for review",
    ],
  },
  {
    id: "blockwork",
    title: "Blockwork",
    category: "Masonry",
    timing: "During blockwork construction before grout or closure prevents inspection",
    requirements: [
      commonSedimentRequirement,
      "Block sizes match the consented or engineered design",
      "Blockwork is complete to the inspection stage with reinforcing in place",
      "Wash-outs and clean-outs are open to allow inspection of reinforcing",
      "Engineer construction monitoring report is available where required",
    ],
  },
  {
    id: "shelf-angles",
    title: "Shelf angles",
    category: "Masonry",
    timing: "Before brick veneer is laid on two-storey or specifically designed masonry work",
    requirements: [
      commonSedimentRequirement,
      "Shelf angles, slip joints, and associated fixings are installed",
      "Flashings are installed as designed",
      "Lintels over windows and doors are installed as designed",
      "Engineer review is available where required",
    ],
  },
  {
    id: "drainage",
    title: "Drainage",
    category: "Drainage",
    timing: "Before stormwater, foulwater, or retaining wall drainage pipework is enclosed",
    requirements: [
      commonSedimentRequirement,
      "Previous site instructions have been completed or resolved",
      "Pipework is installed as per the consented system or a variation has been sought",
      "Pipework is under test and ready for inspection",
      "Grade, fall, pipe sizing, venting, jointing, bends, gullies, and inspection points are correct",
      "Pipe run locations match the consented plans",
      "As-built drainage plan is complete and on site",
      "Retaining wall drainage, filter cloth, tanking protection, and PS3 are available where applicable",
    ],
  },
  {
    id: "heating-unit-final",
    title: "Heating unit final",
    category: "Heating",
    timing: "Before any solid or liquid fuel heating unit is used",
    requirements: [
      "Heating unit matches the consent",
      "Installation matches manufacturer instructions, consented design, and NZS 2918",
      "Seismic restraints and combustible clearances are correct",
      "Smoke alarms, penetrations, and flashings are complete",
      "Hearth type and measurements protect combustible surfaces",
      "Access is available to view the flue system",
      "B-083 is complete and on site for review",
    ],
  },
  {
    id: "final",
    title: "Final inspection",
    category: "Completion",
    timing: "When all consented work and all other required inspections are complete",
    requirements: [
      commonSedimentRequirement,
      "All work described in the building consent is complete",
      "Painting, decorating, floor coverings, landscaping, paving, and stormwater controls are complete",
      "Consent conditions are met and amendments are approved and uplifted where required",
      "Energy work certificates, gas/oil documentation, and smoke alarms are complete where required",
      "Interior linings, wet areas, plumbing fixtures, gullies, and overflow relief gullies are complete",
      "Vehicle crossing is reinstated and footpath or berm damage has been addressed where required",
      "PS4, site reports, B-082, B-083, barrier PS3, and CCC documents are on site where required",
    ],
  },
] satisfies InspectionTypeDefinition[];

export const manualInspectionTypeOptions = [
  ...inspectionTypes.map((item) => ({ id: item.id, label: item.title })),
  { id: MANUAL_INSPECTION_TYPE_ID, label: "Manual / custom" },
];

const inspectionTypeById = Object.fromEntries(inspectionTypes.map((item) => [item.id, item]));

export function getInspectionTypeDefinition(id: string): InspectionTypeDefinition | undefined {
  return inspectionTypeById[id];
}

export function getInspectionSchedule(project: ProjectInspectionInput): InspectionSchedule {
  const traits = getProjectTraits(project);
  const stages = getStageIdsForProject(project.project_type, traits);
  const notes = getScheduleNotes(project, traits);

  return withStatuses({
    profile: getProfile(project.project_type, traits),
    summary: getSummary(project.project_type, traits),
    notes,
    stages: stages.map(getStage).filter(Boolean),
  });
}

function getStage(id: string) {
  return inspectionTypeById[id];
}

function getStageIdsForProject(projectType: ProjectTypeId, traits: ReturnType<typeof getProjectTraits>) {
  const ids: string[] = [];

  if (traits.complex || traits.highValue || traits.largeArea) ids.push("site-meeting-monitoring");
  if (traits.earthworks || traits.demolition) ids.push("erosion-sediment-control");

  if (projectType === "deck") {
    ids.push("foundation-slab");
    if (traits.structural || traits.highDeck) ids.push("pre-roof");
    ids.push("final");
    return ids;
  }

  if (projectType === "accessory") {
    ids.push("foundation-slab");
    if (traits.pilesOrSubfloor) ids.push("subfloor-framing");
    if (traits.services) ids.push("drainage");
    ids.push("pre-roof", "pre-cladding");
    if (!traits.unlined || traits.habitable) ids.push("pre-line");
    if (traits.wetAreas) ids.push("interior-tanking");
    ids.push("final");
    return ids;
  }

  ids.push("foundation-slab");
  if (traits.pilesOrSubfloor) ids.push("subfloor-framing");
  if (traits.services) ids.push("drainage");
  if (traits.structural || projectType === "new_dwelling" || projectType === "extension") {
    ids.push("pre-roof");
  }
  ids.push("pre-cladding");
  if (traits.brick) ids.push("half-high-masonry");
  if (traits.monolithic) ids.push("pre-plaster-exterior");
  ids.push("pre-line");
  if (traits.fireRated) ids.push("pre-stop", "fire-resistant-lining");
  if (traits.wetAreas || projectType === "new_dwelling") ids.push("interior-tanking");
  if (traits.concreteStructure) ids.push("concrete-construction");
  if (traits.steelStructure) ids.push("steel-construction");
  if (traits.blockwork) ids.push("blockwork");
  if (traits.shelfAngles) ids.push("shelf-angles");
  if (traits.heatingUnit) ids.push("heating-unit-final");
  ids.push("final");

  return dedupe(ids);
}

function getProjectTraits(project: ProjectInspectionInput) {
  const text = [project.project_type, project.description, project.address]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const floorArea = toNumber(project.estimated_floor_area_m2);
  const constructionValue = toNumber(project.estimated_construction_value_nzd);
  const water = Boolean(project.service_connection_water) || hasAny(text, ["water connection", "new water", "potable water"]);
  const wastewater = Boolean(project.service_connection_wastewater) || hasAny(text, ["wastewater", "foulwater", "sewer", "septic"]);
  const stormwater = Boolean(project.service_connection_stormwater) || hasAny(text, ["stormwater", "surface water", "soak pit"]);

  return {
    text,
    floorArea,
    constructionValue,
    largeArea: Boolean(floorArea && floorArea >= 300),
    highValue: Boolean(constructionValue && constructionValue >= 1_000_000),
    structural: Boolean(project.involves_structural_work) || hasAny(text, ["structural", "beam", "lintel", "bracing", "load-bearing", "load bearing"]),
    earthworks: Boolean(project.involves_earthworks) || hasAny(text, ["earthwork", "excavat", "cut", "fill", "retaining"]),
    demolition: Boolean(project.existing_structure_demolished) || hasAny(text, ["demolish", "demolition", "remove existing"]),
    roadAccess: Boolean(project.new_road_access) || hasAny(text, ["vehicle crossing", "driveway", "road access", "new access"]),
    water,
    wastewater,
    stormwater,
    services: water || wastewater || stormwater,
    wetAreas: water || wastewater || hasAny(text, ["bathroom", "ensuite", "laundry", "kitchen", "shower", "wet area"]),
    pilesOrSubfloor: hasAny(text, ["pile", "piles", "pole", "subfloor", "bearer", "joist", "suspended floor"]),
    highDeck: mentionsOverOnePointFiveMetres(text),
    habitable: hasAny(text, ["sleep", "habitable", "studio", "minor dwelling"]),
    unlined: hasAny(text, ["unlined", "no lining", "not lined"]),
    brick: hasAny(text, ["brick", "masonry veneer"]),
    monolithic: hasAny(text, ["plaster", "monolithic", "aac panel", "solid plaster"]),
    fireRated: hasAny(text, ["fire rated", "fire-rated", "fire wall", "fire separation", "smoke separation"]),
    concreteStructure: hasAny(text, ["tilt panel", "concrete wall", "concrete construction"]),
    steelStructure: hasAny(text, ["steel beam", "structural steel", "portal frame"]),
    blockwork: hasAny(text, ["blockwork", "block work", "concrete block"]),
    shelfAngles: hasAny(text, ["shelf angle", "two-storey brick", "2 storey brick"]),
    heatingUnit: hasAny(text, ["solid fuel", "wood burner", "fireplace", "heater", "heating unit"]),
    complex: Boolean(floorArea && floorArea >= 300) || Boolean(constructionValue && constructionValue >= 1_000_000),
  };
}

function getScheduleNotes(project: ProjectInspectionInput, traits: ReturnType<typeof getProjectTraits>) {
  const notes = [
    "Inspection set estimated from project initializer fields and Christchurch City Council residential inspection guidance B-306.",
  ];

  if (traits.services) notes.push("Drainage is included because new water, wastewater, or stormwater connections are indicated.");
  if (traits.earthworks || traits.demolition) notes.push("Erosion and sediment control is included because earthworks or demolition are indicated.");
  if (traits.roadAccess) notes.push("New road access is handled at final inspection through the vehicle crossing reinstatement check.");
  if (project.project_type === "deck" && !traits.highDeck) notes.push("Deck schedule is estimated; decks over 1.5m may require additional structural checks.");
  if (!traits.services && !traits.wetAreas && project.project_type !== "deck") {
    notes.push("Confirm whether any water, wastewater, stormwater, kitchen, bathroom, laundry, or wet-area work is included.");
  }
  if (!traits.structural && project.project_type !== "deck") {
    notes.push("Confirm whether any structural beams, bracing, lintels, retaining walls, or load-bearing changes are included.");
  }

  return notes;
}

function getProfile(projectType: ProjectTypeId, traits: ReturnType<typeof getProjectTraits>) {
  const suffix = traits.services ? " with service connections" : "";
  if (projectType === "new_dwelling") return `New dwelling${suffix}`;
  if (projectType === "extension") return `Extension / addition${suffix}`;
  if (projectType === "accessory") return `Accessory building${traits.habitable ? " / sleep-out" : ""}${suffix}`;
  return `Deck${traits.highDeck ? " over 1.5m" : ""}`;
}

function getSummary(projectType: ProjectTypeId, traits: ReturnType<typeof getProjectTraits>) {
  if (projectType === "deck") {
    return traits.highDeck
      ? "Deck inspection schedule with footing, structural framing, and final completion checks."
      : "Deck inspection schedule with footing and final completion checks.";
  }

  if (projectType === "accessory") {
    return traits.services
      ? "Accessory building schedule with foundation, structure, envelope, service, and final checks."
      : "Accessory building schedule with foundation, structure, envelope, and final checks.";
  }

  return traits.services
    ? "Residential schedule with foundation, structure, envelope, pre-line, service, and final checks."
    : "Residential schedule with foundation, structure, envelope, pre-line, and final checks.";
}

function withStatuses(schedule: Omit<InspectionSchedule, "stages"> & { stages: InspectionTypeDefinition[] }): InspectionSchedule {
  return {
    ...schedule,
    stages: schedule.stages.map((item, index) => ({
      ...item,
      id: slugifyInspection(`${index + 1}-${item.title}`),
      inspectionTypeId: item.id,
      status: index === 0 ? "Upcoming" : "Not started",
    })),
  };
}

function hasAny(value: string, needles: string[]) {
  return needles.some((needle) => value.includes(needle));
}

function mentionsOverOnePointFiveMetres(value: string) {
  return /over\s*1\.5\s*m|above\s*1\.5\s*m|more than\s*1\.5\s*m|>\s*1\.5\s*m/.test(value);
}

function toNumber(value: number | string | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (!value) return null;
  const parsed = Number(String(value).replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function dedupe(values: string[]) {
  return [...new Set(values)];
}

function slugifyInspection(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
