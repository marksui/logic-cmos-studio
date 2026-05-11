import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { build } from "esbuild";

const bundle = await build({
  bundle: true,
  format: "esm",
  stdin: {
    contents: `
      export { buildCmosPlan } from "./src/logic/cmos.ts";
      export { evaluateFormula } from "./src/logic/formula.ts";
      export { PRESETS } from "./src/logic/presets.ts";
      export { simplifyPos, simplifySop } from "./src/logic/simplify.ts";
    `,
    loader: "ts",
    resolveDir: process.cwd(),
    sourcefile: "verify-formulas-entry.ts"
  },
  logLevel: "silent",
  platform: "node",
  write: false
});

const source = bundle.outputFiles[0].text;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const { buildCmosPlan, evaluateFormula, PRESETS, simplifyPos, simplifySop } =
  await import(moduleUrl);

const DEFAULT_LABELS = {
  A: "A",
  B: "B",
  C: "C",
  D: "D",
  E: "E",
  F: "F",
  G: "G",
  H: "H"
};

function bitsFor(minterm, variableCount) {
  return Array.from({ length: variableCount }, (_, bitIndex) => {
    const shift = variableCount - bitIndex - 1;
    return (minterm >> shift) & 1;
  });
}

function expectedValues(variableCount, evaluate) {
  return Array.from({ length: 1 << variableCount }, (_, minterm) =>
    evaluate(bitsFor(minterm, variableCount).map(Boolean)) ? "1" : "0"
  );
}

function pickLabels(labels, variables) {
  return Object.fromEntries(variables.map((variable) => [variable, labels[variable]]));
}

function verifyFormula({
  currentVariableCount = 2,
  expectedLabels,
  expectedVariableCount,
  expectedValues: values,
  formula,
  labels = DEFAULT_LABELS,
  name
}) {
  const evaluation = evaluateFormula(formula, currentVariableCount, labels);

  assert.equal(
    evaluation.variableCount,
    expectedVariableCount,
    `${name}: variable count`
  );
  assert.deepEqual(
    pickLabels(evaluation.variableLabels, Object.keys(expectedLabels)),
    expectedLabels,
    `${name}: variable labels`
  );

  if (values) {
    assert.deepEqual(evaluation.values, values, `${name}: truth table`);
  }

  const sop = simplifySop(evaluation.variableCount, evaluation.values);
  assert.deepEqual(
    evaluateSop(evaluation.variableCount, sop.terms),
    evaluation.values,
    `${name}: SOP equivalent truth table`
  );

  const pos = simplifyPos(evaluation.variableCount, evaluation.values);
  assert.deepEqual(
    evaluatePos(evaluation.variableCount, pos.terms),
    evaluation.values,
    `${name}: POS equivalent truth table`
  );
}

function evaluateSop(variableCount, terms) {
  if (terms.length === 0) {
    return Array.from({ length: 1 << variableCount }, () => "0");
  }

  return expectedValues(variableCount, (bits) =>
    terms.some((term) =>
      term.literals.every((literal) => literalMatches(bits, literal))
    )
  );
}

function evaluatePos(variableCount, terms) {
  if (terms.length === 0) {
    return Array.from({ length: 1 << variableCount }, () => "1");
  }

  return expectedValues(variableCount, (bits) =>
    terms.every((term) =>
      term.literals.some((literal) => literalMatches(bits, literal))
    )
  );
}

function literalMatches(bits, literal) {
  const index = DEFAULT_LABELS[literal.variable].charCodeAt(0) - "A".charCodeAt(0);
  return literal.negated ? !bits[index] : bits[index];
}

verifyFormula({
  currentVariableCount: 3,
  expectedLabels: { A: "SA", B: "SB" },
  expectedValues: expectedValues(2, ([sa, sb]) => sa || sb),
  expectedVariableCount: 2,
  formula: "SA + SB",
  name: "two-letter uppercase custom variables"
});

verifyFormula({
  expectedLabels: { A: "SA", B: "SB" },
  expectedValues: expectedValues(2, ([sa, sb]) => !(sa && sb)),
  expectedVariableCount: 2,
  formula: "SA nand SB",
  name: "custom variables with gate words"
});

verifyFormula({
  expectedLabels: { A: "A", B: "B", C: "C", D: "S" },
  expectedVariableCount: 4,
  formula: "AB xor AC nor BCA nand B and S",
  name: "single-letter implicit AND remains available"
});

verifyFormula({
  expectedLabels: { A: "SA", B: "SB", C: "SC", D: "SD", E: "SE" },
  expectedValues: expectedValues(5, ([sa, sb, sc, sd, se]) =>
    sa || sb || sc || sd || se
  ),
  expectedVariableCount: 5,
  formula: "SA + SB + SC + SD + SE",
  name: "more than four custom variables"
});

verifyFormula({
  expectedLabels: {
    A: "A",
    B: "B",
    C: "C",
    D: "D",
    E: "E",
    F: "F",
    G: "G",
    H: "H"
  },
  expectedValues: expectedValues(8, ([a, b, c, d, e, f, g, h]) =>
    a && b && c && d && e && f && g && h
  ),
  expectedVariableCount: 8,
  formula: "A and B and C and D and E and F and G and H",
  name: "eight built-in variables"
});

verifyFormula({
  currentVariableCount: 4,
  expectedLabels: { A: "SA", B: "SB", C: "Cin", D: "D" },
  expectedValues: expectedValues(4, ([sa, sb, cin, d]) => {
    const left = !(sa && sb) !== !(cin || d);
    const right = !sa || d;
    return left === right;
  }),
  expectedVariableCount: 4,
  formula: "((SA nand SB) xor (Cin nor D)) xnor (~SA + buffer D)",
  name: "complex mixed custom-name formula"
});

const redundantAnd = evaluateFormula("F = A'B + AB", 2, DEFAULT_LABELS);
assert.equal(
  simplifySop(redundantAnd.variableCount, redundantAnd.values).expression,
  "B",
  "F = A'B + AB simplifies to B"
);

const majority = evaluateFormula("F = AB + AC + BC", 3, DEFAULT_LABELS);
assert.deepEqual(
  evaluateSop(3, simplifySop(majority.variableCount, majority.values).terms),
  majority.values,
  "majority simplification remains equivalent"
);

verifyFormula({
  expectedLabels: { A: "A", B: "B", C: "S" },
  expectedValues: expectedValues(3, ([a, b, s]) => (!s && a) || (s && b)),
  expectedVariableCount: 3,
  formula: "F = S'A + SB",
  name: "2:1 mux formula with selector S"
});

const mintermFormula = evaluateFormula(
  "F(A,B,C,D) = Σm(1,3,7,11,15) d(0,2)",
  4,
  DEFAULT_LABELS
);
assert.equal(mintermFormula.variableCount, 4, "explicit minterm header count");
assert.equal(mintermFormula.values[1], "1", "minterm 1 is set");
assert.equal(mintermFormula.values[3], "1", "minterm 3 is set");
assert.equal(mintermFormula.values[7], "1", "minterm 7 is set");
assert.equal(mintermFormula.values[11], "1", "minterm 11 is set");
assert.equal(mintermFormula.values[15], "1", "minterm 15 is set");
assert.equal(mintermFormula.values[0], "X", "don't-care 0 is set");
assert.equal(mintermFormula.values[2], "X", "don't-care 2 is set");

const compactMinterms = evaluateFormula("Σm(1,3,7)", 3, DEFAULT_LABELS);
assert.deepEqual(
  compactMinterms.values,
  expectedValues(3, ([a, b, c]) => (!a && c) || (b && c)),
  "Σm(1,3,7) generates the expected truth table"
);

const nandCore = simplifySop(
  2,
  evaluateFormula("A and B", 2, DEFAULT_LABELS).values
);
const nandPlan = buildCmosPlan(nandCore);
assert.equal(nandPlan.coreGateName, "NAND2", "AND core maps to NAND2 CMOS");
assert.equal(nandPlan.pullDown?.type, "series", "NAND2 NMOS is series");
assert.equal(nandPlan.pullUp?.type, "parallel", "NAND2 PMOS is parallel");

const norCore = simplifySop(
  2,
  evaluateFormula("A or B", 2, DEFAULT_LABELS).values
);
const norPlan = buildCmosPlan(norCore);
assert.equal(norPlan.coreGateName, "NOR2", "OR core maps to NOR2 CMOS");
assert.equal(norPlan.pullDown?.type, "parallel", "NOR2 NMOS is parallel");
assert.equal(norPlan.pullUp?.type, "series", "NOR2 PMOS is series");

for (const preset of PRESETS) {
  verifyFormula({
    currentVariableCount: preset.variableCount,
    expectedLabels:
      preset.id === "mux-2-1"
        ? { A: "S", B: "A", C: "B" }
        : labelsForCount(preset.variableCount),
    expectedValues: preset.makeValues(),
    expectedVariableCount: preset.variableCount,
    formula: preset.formula,
    name: `preset ${preset.name}`
  });
}

function labelsForCount(variableCount) {
  return Object.fromEntries(
    Object.keys(DEFAULT_LABELS)
      .slice(0, variableCount)
      .map((variable) => [variable, variable])
  );
}

console.log("Formula verification passed: custom variables and complex gates match expected truth tables.");
