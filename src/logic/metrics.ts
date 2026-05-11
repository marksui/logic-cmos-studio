import type {
  LogicVariable,
  ProductTerm,
  SimplificationResult,
  VariableCount
} from "./types";

export interface LogicMetrics {
  estimatedGateCount: number;
  estimatedLogicDepth: number;
  estimatedTransistorCount: number;
  originalLiteralCount: number;
  simplifiedLiteralCount: number;
}

export function estimateLogicMetrics({
  cmosTransistorCount,
  formula,
  result,
  variableCount
}: {
  cmosTransistorCount: number;
  formula: string;
  result: SimplificationResult;
  variableCount: VariableCount;
}): LogicMetrics {
  return {
    estimatedGateCount: estimateSopGateCount(result.terms),
    estimatedLogicDepth: estimateSopDepth(result.terms),
    estimatedTransistorCount: cmosTransistorCount,
    originalLiteralCount: estimateOriginalLiteralCount(formula, variableCount),
    simplifiedLiteralCount: countTermLiterals(result.terms)
  };
}

function estimateOriginalLiteralCount(
  formula: string,
  variableCount: VariableCount
): number {
  const headerLabels = parseHeaderLabels(formula);
  const expression = stripFunctionHeader(formula);
  const mintermMatch = expression.match(/(?:\u03a3|sigma|sum)?\s*m\s*\(([^)]*)\)/i);

  if (mintermMatch) {
    return parseIndexes(mintermMatch[1]).length * variableCount;
  }

  const words = expression.match(/[A-Za-z][A-Za-z0-9_]*/g) ?? [];
  return words.reduce((count, word) => {
    const upper = word.toUpperCase();
    if (RESERVED_WORDS.has(upper)) return count;
    const segmentedCount = countKnownLabelSegments(word, headerLabels);
    if (segmentedCount !== null) return count + segmentedCount;
    if ([...upper].every((char) => LOGIC_VARIABLES.has(char as LogicVariable))) {
      return count + word.length;
    }
    return count + 1;
  }, 0);
}

function parseHeaderLabels(formula: string): string[] {
  const assignmentIndex = formula.indexOf("=");
  if (assignmentIndex < 0) return [];

  const lhs = formula.slice(0, assignmentIndex);
  const match = lhs.match(/^[A-Za-z][A-Za-z0-9_]*\s*\(([^)]*)\)/);
  if (!match) return [];

  return match[1]
    .split(",")
    .map((label) => label.trim().toUpperCase())
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);
}

function countKnownLabelSegments(word: string, labels: string[]): number | null {
  if (labels.length === 0) return null;

  const upperWord = word.toUpperCase();
  const memo = new Map<number, number | null>();

  function search(index: number): number | null {
    if (index === upperWord.length) return 0;
    if (memo.has(index)) return memo.get(index) ?? null;

    for (const label of labels) {
      if (upperWord.startsWith(label, index)) {
        const rest = search(index + label.length);
        if (rest !== null) {
          const result = 1 + rest;
          memo.set(index, result);
          return result;
        }
      }
    }

    memo.set(index, null);
    return null;
  }

  return search(0);
}

function stripFunctionHeader(formula: string): string {
  const assignmentIndex = formula.indexOf("=");
  return assignmentIndex >= 0 ? formula.slice(assignmentIndex + 1) : formula;
}

function parseIndexes(source: string): number[] {
  return source
    .split(/[,\s]+/)
    .filter(Boolean)
    .flatMap((part) => {
      const range = part.match(/^(\d+)-(\d+)$/);
      if (!range) return [Number(part)].filter(Number.isFinite);
      const start = Number(range[1]);
      const end = Number(range[2]);
      return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
    });
}

function countTermLiterals(terms: ProductTerm[]): number {
  return terms.reduce((count, term) => count + term.literals.length, 0);
}

function estimateSopGateCount(terms: ProductTerm[]): number {
  if (terms.length === 0) return 0;

  const invertedInputs = new Set<string>();
  terms.forEach((term) => {
    term.literals.forEach((literal) => {
      if (literal.negated) invertedInputs.add(literal.variable);
    });
  });

  const productGates = terms.filter((term) => term.literals.length > 1).length;
  const sumGate = terms.length > 1 ? 1 : 0;
  return invertedInputs.size + productGates + sumGate;
}

function estimateSopDepth(terms: ProductTerm[]): number {
  if (terms.length === 0) return 0;

  const hasInversion = terms.some((term) =>
    term.literals.some((literal) => literal.negated)
  );
  const productDepth = terms.some((term) => term.literals.length > 1) ? 1 : 0;
  const sumDepth = terms.length > 1 ? 1 : 0;

  return Number(hasInversion) + productDepth + sumDepth;
}

const LOGIC_VARIABLES = new Set<LogicVariable>([
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H"
]);

const RESERVED_WORDS = new Set([
  "AND",
  "BUF",
  "BUFFER",
  "D",
  "DC",
  "FALSE",
  "INV",
  "M",
  "NAND",
  "NOR",
  "NOT",
  "NXOR",
  "OR",
  "SIGMA",
  "SUM",
  "TRUE",
  "X",
  "XNOR",
  "XOR"
]);
