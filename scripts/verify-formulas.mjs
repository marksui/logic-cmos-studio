import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { build } from "esbuild";

const bundle = await build({
  bundle: true,
  format: "esm",
  stdin: {
    contents: `
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
const { evaluateFormula, PRESETS, simplifyPos, simplifySop } = await import(moduleUrl);

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

for (const preset of PRESETS) {
  verifyFormula({
    currentVariableCount: preset.variableCount,
    expectedLabels: labelsForCount(preset.variableCount),
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
