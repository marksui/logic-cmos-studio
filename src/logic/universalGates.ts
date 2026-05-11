import {
  buildAstFromPosTerms,
  buildAstFromSopTerms,
  normalizeAst,
  type BooleanAst,
  type BooleanExpressionAst
} from "./ast";
import type {
  PosSimplificationResult,
  SimplificationResult
} from "./types";

export type UniversalFamily = "nand" | "nor";
export type UniversalGateKind = "INV" | "NAND" | "NOR";

export type UniversalGateAst =
  | { type: "VAR"; label: string }
  | { type: "INV"; input: UniversalGateAst }
  | { type: "NAND" | "NOR"; inputs: UniversalGateAst[] };

export interface UniversalGateConversion {
  family: UniversalFamily;
  title: string;
  sourceForm: "SOP" | "POS";
  sourceExpression: string;
  expression: string;
  verilogExpression: string;
  verilogAssign: string;
  gateCount: number;
  depth: number;
  primitiveCounts: Record<UniversalGateKind, number>;
}

export interface UniversalGateConversions {
  nand: UniversalGateConversion;
  nor: UniversalGateConversion;
}

export function buildUniversalGateConversions(
  sopResult: SimplificationResult,
  posResult: PosSimplificationResult
): UniversalGateConversions {
  const sopAst = buildAstFromSopTerms(sopResult.expression, sopResult.terms);
  const posAst = buildAstFromPosTerms(posResult.expression, posResult.terms);

  return {
    nand: buildConversion({
      ast: sopAst,
      family: "nand",
      sourceExpression: sopResult.expression,
      sourceForm: "SOP",
      title: "NAND + INV"
    }),
    nor: buildConversion({
      ast: posAst,
      family: "nor",
      sourceExpression: posResult.expression,
      sourceForm: "POS",
      title: "NOR + INV"
    })
  };
}

function buildConversion({
  ast,
  family,
  sourceExpression,
  sourceForm,
  title
}: {
  ast: BooleanExpressionAst;
  family: UniversalFamily;
  sourceExpression: string;
  sourceForm: "SOP" | "POS";
  title: string;
}): UniversalGateConversion {
  if (ast.kind === "CONST") {
    const constant = ast.value ? "1'b1" : "1'b0";
    return {
      family,
      title,
      sourceForm,
      sourceExpression,
      expression: ast.value ? "1" : "0",
      verilogExpression: constant,
      verilogAssign: `assign F_${family} = ${constant};`,
      gateCount: 0,
      depth: 0,
      primitiveCounts: { INV: 0, NAND: 0, NOR: 0 }
    };
  }

  const universalAst =
    family === "nand"
      ? toNandInv(normalizeAst(ast.ast))
      : toNorInv(normalizeAst(ast.ast));
  const primitiveCounts = countPrimitives(universalAst);
  const verilogExpression = universalToVerilog(universalAst);

  return {
    family,
    title,
    sourceForm,
    sourceExpression,
    expression: universalToString(universalAst),
    verilogExpression,
    verilogAssign: `assign F_${family} = ${verilogExpression};`,
    gateCount:
      primitiveCounts.INV + primitiveCounts.NAND + primitiveCounts.NOR,
    depth: gateDepth(universalAst),
    primitiveCounts
  };
}

function toNandInv(ast: BooleanAst): UniversalGateAst {
  if (ast.type === "VAR") {
    return { type: "VAR", label: ast.name };
  }

  if (ast.type === "NOT") {
    return makeInv(toNandInv(ast.input));
  }

  if (ast.type === "AND") {
    return makeInv({
      type: "NAND",
      inputs: ast.inputs.map(toNandInv)
    });
  }

  // De Morgan conversion for OR:
  // A + B = NAND(INV(A), INV(B)). This keeps the network in NAND/INV only.
  return {
    type: "NAND",
    inputs: ast.inputs.map((input) => makeInv(toNandInv(input)))
  };
}

function toNorInv(ast: BooleanAst): UniversalGateAst {
  if (ast.type === "VAR") {
    return { type: "VAR", label: ast.name };
  }

  if (ast.type === "NOT") {
    return makeInv(toNorInv(ast.input));
  }

  if (ast.type === "OR") {
    return makeInv({
      type: "NOR",
      inputs: ast.inputs.map(toNorInv)
    });
  }

  // Dual De Morgan conversion for AND:
  // AB = NOR(INV(A), INV(B)). This is the NOR-side mirror of the NAND rule.
  return {
    type: "NOR",
    inputs: ast.inputs.map((input) => makeInv(toNorInv(input)))
  };
}

function makeInv(input: UniversalGateAst): UniversalGateAst {
  return input.type === "INV" ? input.input : { type: "INV", input };
}

function universalToString(ast: UniversalGateAst): string {
  if (ast.type === "VAR") return ast.label;
  if (ast.type === "INV") return `INV(${universalToString(ast.input)})`;

  return `${ast.type}(${ast.inputs.map(universalToString).join(", ")})`;
}

function universalToVerilog(ast: UniversalGateAst): string {
  if (ast.type === "VAR") return ast.label;
  if (ast.type === "INV") return `~${wrapVerilog(universalToVerilog(ast.input))}`;

  const operator = ast.type === "NAND" ? " & " : " | ";
  return `~(${ast.inputs.map(universalToVerilog).join(operator)})`;
}

function wrapVerilog(expression: string): string {
  return /^[A-H]$/.test(expression) ? expression : `(${expression})`;
}

function countPrimitives(ast: UniversalGateAst): Record<UniversalGateKind, number> {
  const counts: Record<UniversalGateKind, number> = { INV: 0, NAND: 0, NOR: 0 };

  function visit(node: UniversalGateAst) {
    if (node.type === "VAR") return;
    counts[node.type] += 1;

    if (node.type === "INV") {
      visit(node.input);
      return;
    }

    node.inputs.forEach(visit);
  }

  visit(ast);
  return counts;
}

function gateDepth(ast: UniversalGateAst): number {
  if (ast.type === "VAR") return 0;
  if (ast.type === "INV") return 1 + gateDepth(ast.input);

  return 1 + Math.max(0, ...ast.inputs.map(gateDepth));
}
