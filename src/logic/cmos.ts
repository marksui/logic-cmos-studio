import {
  astToString,
  buildAstFromSopTerms,
  isLiteral,
  literalLabel,
  normalizeAst,
  toNnf,
  type BooleanAst
} from "./ast";
import type { LogicVariable, SimplificationResult } from "./types";

export type TransistorKind = "nmos" | "pmos";
export type CmosNetworkMode = "series" | "parallel";

export interface CmosTransistorNode {
  type: "transistor";
  id: string;
  kind: TransistorKind;
  gate: string;
  label: string;
}

export interface CmosNetworkGroup {
  type: CmosNetworkMode;
  children: CmosNetworkNode[];
}

export type CmosNetworkNode = CmosTransistorNode | CmosNetworkGroup;

export interface CmosPlan {
  functionExpression: string;
  cmosFriendlyExpression: string;
  coreExpression: string;
  coreGateName: string;
  requiresOutputInverter: boolean;
  outputInverterAvailable: boolean;
  outputInverterIncluded: boolean;
  coreOutputNode: "Y" | "nY";
  transistorCount: number;
  inputInverters: LogicVariable[];
  pullDown: CmosNetworkNode | null;
  pullUp: CmosNetworkNode | null;
  pullDownDescription: string;
  pullUpDescription: string;
  netlist: string;
}

interface NetlistState {
  deviceIndex: number;
  nodeIndex: number;
  lines: string[];
}

interface CmosBuildOptions {
  includeOutputInverter?: boolean;
}

export function buildCmosPlan(
  result: SimplificationResult,
  options: CmosBuildOptions = {}
): CmosPlan {
  const expressionAst = buildAstFromSopTerms(result.expression, result.terms);

  if (expressionAst.kind === "CONST") {
    return buildConstantPlan(expressionAst.value, result.expression);
  }

  const simplifiedAst = toNnf(normalizeAst(expressionAst.ast));
  const isInvertedLiteral =
    simplifiedAst.type === "NOT" && simplifiedAst.input.type === "VAR";
  const coreAst = isInvertedLiteral
    ? simplifiedAst.input
    : simplifiedAst;
  const outputInverterAvailable = !isInvertedLiteral;
  const outputInverterIncluded =
    outputInverterAvailable && options.includeOutputInverter !== false;
  const requiresOutputInverter = outputInverterIncluded;
  const coreOutputNode = outputInverterAvailable ? "nY" : "Y";
  const normalizedCoreAst = toNnf(normalizeAst(coreAst));
  const pullDown = buildNetwork(normalizedCoreAst, "nmos");
  const pullUp = buildNetwork(normalizedCoreAst, "pmos");
  const inputInverters = [...collectComplementedInputs(normalizedCoreAst)].sort();
  const coreExpression = astToString(normalizedCoreAst);
  const coreGateName = classifyStaticGate(normalizedCoreAst, outputInverterIncluded);
  const coreTransistorCount = 2 * countLiteralOccurrences(normalizedCoreAst);
  const inputInverterCount = inputInverters.length * 2;
  const outputInverterCount = requiresOutputInverter ? 2 : 0;
  const cmosFriendlyExpression = formatCmosFriendlyExpression({
    coreExpression,
    outputInverterAvailable,
    outputInverterIncluded
  });

  return {
    functionExpression: outputInverterIncluded || !outputInverterAvailable
      ? `Y = ${result.expression}`
      : `nY = ~(${result.expression})`,
    cmosFriendlyExpression,
    coreExpression,
    coreGateName,
    requiresOutputInverter,
    outputInverterAvailable,
    outputInverterIncluded,
    coreOutputNode,
    transistorCount: coreTransistorCount + inputInverterCount + outputInverterCount,
    inputInverters,
    pullDown,
    pullUp,
    pullDownDescription: `NMOS PDN: ${describeNetwork(pullDown)}.`,
    pullUpDescription: `PMOS PUN: ${describeNetwork(pullUp)}.`,
    netlist: buildNetlist({
      pullDown,
      pullUp,
      inputInverters,
      coreOutputNode,
      outputInverterAvailable,
      requiresOutputInverter
    })
  };
}

function buildConstantPlan(value: boolean, expression: string): CmosPlan {
  const node = value ? "VDD" : "0";

  return {
    functionExpression: `Y = ${expression}`,
    cmosFriendlyExpression: `Y tied to ${value ? "logic 1" : "logic 0"}`,
    coreExpression: value ? "1" : "0",
    coreGateName: value ? "CONST1" : "CONST0",
    requiresOutputInverter: false,
    outputInverterAvailable: false,
    outputInverterIncluded: false,
    coreOutputNode: "Y",
    transistorCount: 0,
    inputInverters: [],
    pullDown: null,
    pullUp: null,
    pullDownDescription: value
      ? "NMOS PDN: open circuit for constant logic 1."
      : "NMOS PDN: output is tied to GND for constant logic 0.",
    pullUpDescription: value
      ? "PMOS PUN: output is tied to VDD for constant logic 1."
      : "PMOS PUN: open circuit for constant logic 0.",
    netlist: [`* ${value ? "constant logic 1" : "constant logic 0"}`, `RY Y ${node} 1m`].join(
      "\n"
    )
  };
}

function buildNetwork(ast: BooleanAst, kind: TransistorKind): CmosNetworkNode {
  if (isLiteral(ast)) {
    return {
      type: "transistor",
      id: `${kind}_${literalSignal(ast)}`,
      kind,
      gate: literalSignal(ast),
      label: literalLabel(ast)
    };
  }

  if (ast.type === "NOT") {
    return buildNetwork(toNnf(ast), kind);
  }

  // Static CMOS uses complementary networks. The NMOS pull-down network
  // conducts when the core expression is true, so AND becomes series and OR
  // becomes parallel. The PMOS pull-up network is the dual: AND becomes
  // parallel and OR becomes series, which makes it conduct when the core
  // expression is false.
  const mode =
    kind === "nmos"
      ? ast.type === "AND"
        ? "series"
        : "parallel"
      : ast.type === "AND"
        ? "parallel"
        : "series";

  return {
    type: mode,
    children: ast.inputs.map((input) => buildNetwork(input, kind))
  };
}

function classifyStaticGate(
  ast: BooleanAst,
  requiresOutputInverter: boolean
): string {
  const suffix = requiresOutputInverter ? " + INV" : "";

  if (isLiteral(ast)) return `INV${suffix}`;

  if (ast.type === "AND" && ast.inputs.every(isLiteral)) {
    if (ast.inputs.length === 2) return `NAND2${suffix}`;
    if (ast.inputs.length === 3) return `NAND3${suffix}`;
  }

  if (ast.type === "OR" && ast.inputs.every(isLiteral)) {
    if (ast.inputs.length === 2) return `NOR2${suffix}`;
    if (ast.inputs.length === 3) return `NOR3${suffix}`;
  }

  if (ast.type === "OR") {
    const andGroups = ast.inputs.filter(
      (input) => input.type === "AND" && input.inputs.every(isLiteral)
    ) as Extract<BooleanAst, { type: "AND" }>[];
    const literals = ast.inputs.filter(isLiteral);

    if (andGroups.length === 1 && andGroups[0].inputs.length === 2 && literals.length === 1) {
      return `AOI21${suffix}`;
    }

    if (
      andGroups.length === 2 &&
      andGroups.every((group) => group.inputs.length === 2) &&
      literals.length === 0
    ) {
      return `AOI22${suffix}`;
    }
  }

  if (ast.type === "AND") {
    const orGroups = ast.inputs.filter(
      (input) => input.type === "OR" && input.inputs.every(isLiteral)
    ) as Extract<BooleanAst, { type: "OR" }>[];
    const literals = ast.inputs.filter(isLiteral);

    if (orGroups.length === 1 && orGroups[0].inputs.length === 2 && literals.length === 1) {
      return `OAI21${suffix}`;
    }

    if (
      orGroups.length === 2 &&
      orGroups.every((group) => group.inputs.length === 2) &&
      literals.length === 0
    ) {
      return `OAI22${suffix}`;
    }
  }

  return `COMPLEX CMOS${suffix}`;
}

function buildNetlist({
  pullDown,
  pullUp,
  inputInverters,
  coreOutputNode,
  outputInverterAvailable,
  requiresOutputInverter
}: {
  pullDown: CmosNetworkNode | null;
  pullUp: CmosNetworkNode | null;
  inputInverters: LogicVariable[];
  coreOutputNode: "Y" | "nY";
  outputInverterAvailable: boolean;
  requiresOutputInverter: boolean;
}): string {
  const state: NetlistState = {
    deviceIndex: 1,
    nodeIndex: 1,
    lines: ["* Static CMOS schematic generated from simplified logic"]
  };

  inputInverters.forEach((variable) => {
    const complement = complementSignal(variable);
    state.lines.push(`* Input complement for ${variable}'`);
    state.lines.push(`MP${state.deviceIndex++} ${complement} ${variable} VDD VDD PMOS`);
    state.lines.push(`MN${state.deviceIndex++} ${complement} ${variable} 0 0 NMOS`);
  });

  if (pullUp) {
    state.lines.push("* Pull-up network");
    emitNetworkNetlist(pullUp, "VDD", coreOutputNode, state);
  }

  if (pullDown) {
    state.lines.push("* Pull-down network");
    emitNetworkNetlist(pullDown, coreOutputNode, "0", state);
  }

  if (requiresOutputInverter) {
    state.lines.push("* Output restoring inverter");
    state.lines.push(`MP${state.deviceIndex++} Y nY VDD VDD PMOS`);
    state.lines.push(`MN${state.deviceIndex++} Y nY 0 0 NMOS`);
  } else if (outputInverterAvailable) {
    state.lines.push("* Output inverter omitted: nY is the complement of the requested function");
  }

  return state.lines.join("\n");
}

function formatCmosFriendlyExpression({
  coreExpression,
  outputInverterAvailable,
  outputInverterIncluded
}: {
  coreExpression: string;
  outputInverterAvailable: boolean;
  outputInverterIncluded: boolean;
}): string {
  if (outputInverterIncluded) {
    return `nY = ~(${coreExpression}); Y = ~nY`;
  }

  if (outputInverterAvailable) {
    return `nY = ~(${coreExpression})`;
  }

  return `Y = ~(${coreExpression})`;
}

function emitNetworkNetlist(
  node: CmosNetworkNode,
  topNode: string,
  bottomNode: string,
  state: NetlistState
) {
  if (node.type === "transistor") {
    const prefix = node.kind === "pmos" ? "MP" : "MN";
    const bulk = node.kind === "pmos" ? "VDD" : "0";
    state.lines.push(
      `${prefix}${state.deviceIndex++} ${bottomNode} ${node.gate} ${topNode} ${bulk} ${node.kind.toUpperCase()}`
    );
    return;
  }

  if (node.type === "parallel") {
    node.children.forEach((child) => {
      emitNetworkNetlist(child, topNode, bottomNode, state);
    });
    return;
  }

  let currentTop = topNode;
  node.children.forEach((child, index) => {
    const childBottom =
      index === node.children.length - 1 ? bottomNode : `n${state.nodeIndex++}`;
    emitNetworkNetlist(child, currentTop, childBottom, state);
    currentTop = childBottom;
  });
}

function describeNetwork(node: CmosNetworkNode | null): string {
  if (!node) return "no transistor network";
  if (node.type === "transistor") {
    return `${node.kind.toUpperCase()}(${node.label})`;
  }

  const joiner = node.type === "series" ? " series " : " parallel ";
  return node.children
    .map((child) =>
      child.type === "transistor" ? describeNetwork(child) : `(${describeNetwork(child)})`
    )
    .join(joiner);
}

function countLiteralOccurrences(ast: BooleanAst): number {
  if (isLiteral(ast)) return 1;
  if (ast.type === "NOT") return countLiteralOccurrences(toNnf(ast));
  return ast.inputs.reduce((count, input) => count + countLiteralOccurrences(input), 0);
}

function collectComplementedInputs(ast: BooleanAst): Set<LogicVariable> {
  if (ast.type === "VAR") return new Set();
  if (ast.type === "NOT" && ast.input.type === "VAR") return new Set([ast.input.name]);
  if (ast.type === "NOT") return collectComplementedInputs(toNnf(ast));

  return ast.inputs.reduce((set, input) => {
    collectComplementedInputs(input).forEach((variable) => set.add(variable));
    return set;
  }, new Set<LogicVariable>());
}

function literalSignal(ast: BooleanAst): string {
  if (ast.type === "VAR") return ast.name;
  if (ast.type === "NOT" && ast.input.type === "VAR") {
    return complementSignal(ast.input.name);
  }

  return astToString(ast);
}

function complementSignal(variable: LogicVariable): string {
  return `n${variable}`;
}
