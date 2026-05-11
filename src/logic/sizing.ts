import type { CmosNetworkNode, CmosPlan, TransistorKind } from "./cmos";
import { ALL_VARIABLES, type LogicVariable } from "./types";

export type SkewMode = "balanced" | "fastRise" | "fastFall" | "lowPower";

export interface SizingOptions {
  nmosUnitWidth: number;
  pmosUnitWidth: number;
  mobilityRatio: number;
  fanout: number;
  skewMode: SkewMode;
}

export interface PathEstimate {
  name: string;
  stack: string;
  deviceCount: number;
  resistance: number;
}

export interface DeviceSizeEstimate {
  id: string;
  kind: TransistorKind;
  signal: string;
  label: string;
  occurrences: number;
  maxStack: number;
  recommendedWidth: number;
  unitResistance: number;
}

export interface InputCapEstimate {
  variable: LogicVariable;
  capacitance: number;
}

export interface SizingAnalysis {
  devices: DeviceSizeEstimate[];
  pullUpPaths: PathEstimate[];
  pullDownPaths: PathEstimate[];
  inputCaps: InputCapEstimate[];
  worstPullUpResistance: number;
  worstPullDownResistance: number;
  riseFallSkew: number;
  loadCapacitance: number;
  normalizedDelay: number;
  skewSummary: string;
  notes: string[];
}

const EXTERNAL_VARIABLES = new Set<string>(ALL_VARIABLES);

export function analyzeSizing(
  plan: CmosPlan,
  options: SizingOptions
): SizingAnalysis {
  const skew = skewFactors(options.skewMode);
  const pullUpPaths = plan.pullUp ? enumeratePaths(plan.pullUp) : [];
  const pullDownPaths = plan.pullDown ? enumeratePaths(plan.pullDown) : [];
  const allPaths = [...pullUpPaths, ...pullDownPaths];
  const physicalDevices = [
    ...(plan.pullUp ? collectDevices(plan.pullUp) : []),
    ...(plan.pullDown ? collectDevices(plan.pullDown) : [])
  ];
  const groupedDevices = groupDevices(physicalDevices, allPaths, options, skew);
  const widthByKey = new Map(
    groupedDevices.map((device) => [device.id, device.recommendedWidth])
  );
  const estimatedPullUp = pullUpPaths.map((path, index) =>
    estimatePath(`PUN ${index + 1}`, path, options, widthByKey)
  );
  const estimatedPullDown = pullDownPaths.map((path, index) =>
    estimatePath(`PDN ${index + 1}`, path, options, widthByKey)
  );
  const worstPullUpResistance = maxResistance(estimatedPullUp);
  const worstPullDownResistance = maxResistance(estimatedPullDown);
  const loadCapacitance =
    options.fanout * (options.nmosUnitWidth + options.pmosUnitWidth);
  const normalizedDelay =
    Math.max(worstPullUpResistance, worstPullDownResistance) * loadCapacitance;
  const inputCaps = estimateInputCaps(plan, groupedDevices, options);
  const riseFallSkew =
    worstPullDownResistance > 0
      ? worstPullUpResistance / worstPullDownResistance
      : 1;

  return {
    devices: groupedDevices,
    pullUpPaths: estimatedPullUp,
    pullDownPaths: estimatedPullDown,
    inputCaps,
    worstPullUpResistance,
    worstPullDownResistance,
    riseFallSkew,
    loadCapacitance,
    normalizedDelay,
    skewSummary: describeSkew(riseFallSkew),
    notes: buildNotes(plan, options)
  };
}

function enumeratePaths(node: CmosNetworkNode): PathDevice[][] {
  if (node.type === "transistor") {
    return [[node]];
  }

  if (node.type === "parallel") {
    return node.children.flatMap(enumeratePaths);
  }

  return node.children.reduce<PathDevice[][]>(
    (paths, child) => {
      const childPaths = enumeratePaths(child);
      return paths.flatMap((path) =>
        childPaths.map((childPath) => [...path, ...childPath])
      );
    },
    [[]]
  );
}

type PathDevice = Extract<CmosNetworkNode, { type: "transistor" }>;

function collectDevices(node: CmosNetworkNode): PathDevice[] {
  if (node.type === "transistor") {
    return [node];
  }

  return node.children.flatMap(collectDevices);
}

function groupDevices(
  devices: PathDevice[],
  paths: PathDevice[][],
  options: SizingOptions,
  skew: { pmos: number; nmos: number }
): DeviceSizeEstimate[] {
  const groups = new Map<
    string,
    {
      kind: TransistorKind;
      signal: string;
      label: string;
      occurrences: number;
      maxStack: number;
    }
  >();

  devices.forEach((device) => {
    const id = deviceKey(device);
    const current =
      groups.get(id) ?? {
        kind: device.kind,
        signal: device.gate,
        label: device.label,
        occurrences: 0,
        maxStack: 1
      };

    current.occurrences += 1;
    groups.set(id, current);
  });

  paths.forEach((path) => {
    path.forEach((device) => {
      const id = deviceKey(device);
      const current = groups.get(id);
      if (!current) return;
      current.maxStack = Math.max(current.maxStack, path.length);
      groups.set(id, current);
    });
  });

  return [...groups.entries()]
    .map(([id, group]) => {
      const base =
        group.kind === "pmos" ? options.pmosUnitWidth : options.nmosUnitWidth;
      const skewFactor = group.kind === "pmos" ? skew.pmos : skew.nmos;
      const recommendedWidth = round(base * group.maxStack * skewFactor);

      return {
        id,
        kind: group.kind,
        signal: group.signal,
        label: group.label,
        occurrences: group.occurrences,
        maxStack: group.maxStack,
        recommendedWidth,
        unitResistance: round(
          resistanceFor(group.kind, recommendedWidth, options.mobilityRatio)
        )
      };
    })
    .sort(
      (left, right) =>
        left.kind.localeCompare(right.kind) ||
        left.signal.localeCompare(right.signal) ||
        left.label.localeCompare(right.label)
    );
}

function estimatePath(
  name: string,
  path: PathDevice[],
  options: SizingOptions,
  widthByKey: Map<string, number>
): PathEstimate {
  const resistance = path.reduce((sum, device) => {
    const width = widthByKey.get(deviceKey(device)) ?? 1;
    return sum + resistanceFor(device.kind, width, options.mobilityRatio);
  }, 0);

  return {
    name,
    stack: path.map((device) => device.label).join(" series "),
    deviceCount: path.length,
    resistance: round(resistance)
  };
}

function estimateInputCaps(
  plan: CmosPlan,
  devices: DeviceSizeEstimate[],
  options: SizingOptions
): InputCapEstimate[] {
  const caps = new Map<LogicVariable, number>(
    ALL_VARIABLES.map((variable) => [variable, 0])
  );

  devices.forEach((device) => {
    if (EXTERNAL_VARIABLES.has(device.signal)) {
      const variable = device.signal as LogicVariable;
      caps.set(
        variable,
        (caps.get(variable) ?? 0) +
          device.recommendedWidth * device.occurrences
      );
    }
  });

  plan.inputInverters.forEach((variable) => {
    caps.set(
      variable,
      (caps.get(variable) ?? 0) + options.nmosUnitWidth + options.pmosUnitWidth
    );
  });

  return ALL_VARIABLES.map((variable) => ({
    variable,
    capacitance: round(caps.get(variable) ?? 0)
  })).filter((entry) => entry.capacitance > 0);
}

function skewFactors(mode: SkewMode): { pmos: number; nmos: number } {
  if (mode === "fastRise") return { pmos: 1.45, nmos: 0.9 };
  if (mode === "fastFall") return { pmos: 0.9, nmos: 1.45 };
  if (mode === "lowPower") return { pmos: 0.75, nmos: 0.75 };
  return { pmos: 1, nmos: 1 };
}

function maxResistance(paths: PathEstimate[]): number {
  if (paths.length === 0) return 0;
  return Math.max(...paths.map((path) => path.resistance));
}

function resistanceFor(
  kind: TransistorKind,
  width: number,
  mobilityRatio: number
): number {
  const resistanceScale = kind === "pmos" ? mobilityRatio : 1;
  return resistanceScale / Math.max(width, 0.1);
}

function describeSkew(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio <= 0) return "No switching path.";
  if (ratio > 1.15) return "Rise edge is slower than fall edge.";
  if (ratio < 0.87) return "Fall edge is slower than rise edge.";
  return "Rise and fall drive are roughly balanced.";
}

function buildNotes(plan: CmosPlan, options: SizingOptions): string[] {
  if (!plan.pullDown || !plan.pullUp) {
    return ["Constant outputs do not need a switching CMOS network."];
  }

  return [
    "Series stacks are widened to keep stack resistance near a unit inverter.",
    `PMOS resistance uses a mobility ratio of ${formatNumber(options.mobilityRatio)} relative to NMOS.`,
    "Numbers are normalized educational estimates, not physical layout sizing."
  ];
}

function deviceKey(device: PathDevice): string {
  return `${device.kind}:${device.gate}:${device.label}`;
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(2);
}
