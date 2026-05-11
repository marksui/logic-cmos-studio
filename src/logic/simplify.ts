import { buildKMap, getVariables } from "./kmap";
import type {
  KMapCell,
  OutputValue,
  PosSimplificationResult,
  ProductLiteral,
  ProductTerm,
  SimplificationResult,
  SumTerm,
  VariableCount
} from "./types";

interface CandidateGroup {
  id: string;
  literals: ProductLiteral[];
  expression: string;
  verilog: string;
  allCells: Set<number>;
  coveredMinterms: Set<number>;
  literalCount: number;
}

export function normalizeValues(
  variableCount: VariableCount,
  values: OutputValue[] = []
): OutputValue[] {
  const rowCount = 1 << variableCount;
  return Array.from({ length: rowCount }, (_, index) => values[index] ?? "0");
}

export function nextOutputValue(value: OutputValue): OutputValue {
  if (value === "0") return "1";
  if (value === "1") return "X";
  return "0";
}

export function simplifySop(
  variableCount: VariableCount,
  rawValues: OutputValue[]
): SimplificationResult {
  const values = normalizeValues(variableCount, rawValues);
  const kmap = buildKMap(variableCount, values);
  const minterms = values
    .map((value, index) => (value === "1" ? index : -1))
    .filter((index) => index >= 0);
  const dontCares = values
    .map((value, index) => (value === "X" ? index : -1))
    .filter((index) => index >= 0);

  if (minterms.length === 0) {
    return {
      expression: "0",
      verilogExpression: "1'b0",
      verilogAssign: "assign F = 1'b0;",
      terms: [],
      essentialPrimeImplicants: [],
      minterms,
      dontCares,
      kmap
    };
  }

  const candidates = findPrimeGroups(variableCount, values, "1");
  const selected = chooseMinimumCover(candidates, new Set(minterms));
  const terms = selected
    .map(candidateToProductTerm)
    .sort((left, right) => left.expression.localeCompare(right.expression));
  const essentialPrimeImplicants = findEssentialPrimeGroups(
    candidates,
    new Set(minterms)
  )
    .map(candidateToProductTerm)
    .sort((left, right) => left.expression.localeCompare(right.expression));
  const expression = terms.map((term) => term.expression).join(" + ");
  const verilogExpression = terms.map((term) => parenthesizeTerm(term.verilog)).join(" | ");

  return {
    expression,
    verilogExpression,
    verilogAssign: `assign F = ${verilogExpression};`,
    terms,
    essentialPrimeImplicants,
    minterms,
    dontCares,
    kmap
  };
}

export function simplifyPos(
  variableCount: VariableCount,
  rawValues: OutputValue[]
): PosSimplificationResult {
  const values = normalizeValues(variableCount, rawValues);
  const maxterms = values
    .map((value, index) => (value === "0" ? index : -1))
    .filter((index) => index >= 0);
  const dontCares = values
    .map((value, index) => (value === "X" ? index : -1))
    .filter((index) => index >= 0);

  if (maxterms.length === 0) {
    return {
      expression: "1",
      verilogExpression: "1'b1",
      terms: [],
      maxterms,
      dontCares
    };
  }

  const candidates = findPrimeGroups(variableCount, values, "0");
  const selected = chooseMinimumCover(candidates, new Set(maxterms));
  const terms = selected
    .map(candidateToSumTerm)
    .sort((left, right) => left.expression.localeCompare(right.expression));
  const expression = terms.map((term) => term.expression).join("");
  const verilogExpression = terms
    .map((term) => parenthesizeSumTerm(term.verilog))
    .join(" & ");

  return {
    expression,
    verilogExpression,
    terms,
    maxterms,
    dontCares
  };
}

function findPrimeGroups(
  variableCount: VariableCount,
  values: OutputValue[],
  targetValue: "0" | "1"
): CandidateGroup[] {
  const kmap = buildKMap(variableCount, values);
  const candidatesByCells = new Map<string, CandidateGroup>();
  const rowSizes = powersOfTwoUpTo(kmap.rows);
  const colSizes = powersOfTwoUpTo(kmap.cols);
  const blockingValue = targetValue === "1" ? "0" : "1";

  // K-map simplification is based on rectangular power-of-two groups. The
  // modulo arithmetic below makes every rectangle wrap around each map edge,
  // so corner groups and edge-spanning groups are considered automatically.
  for (const height of rowSizes) {
    for (const width of colSizes) {
      for (let row = 0; row < kmap.rows; row += 1) {
        for (let col = 0; col < kmap.cols; col += 1) {
          const cells: KMapCell[] = [];

          for (let rowOffset = 0; rowOffset < height; rowOffset += 1) {
            for (let colOffset = 0; colOffset < width; colOffset += 1) {
              const wrappedRow = (row + rowOffset) % kmap.rows;
              const wrappedCol = (col + colOffset) % kmap.cols;
              cells.push(kmap.cells[wrappedRow][wrappedCol]);
            }
          }

          const allCells = new Set(cells.map((cell) => cell.minterm));
          const coveredMinterms = new Set(
            cells
              .filter((cell) => cell.value === targetValue)
              .map((cell) => cell.minterm)
          );
          const hasOnlyUsableCells = cells.every(
            (cell) => cell.value !== blockingValue
          );

          if (!hasOnlyUsableCells || coveredMinterms.size === 0) {
            continue;
          }

          const literals = deriveLiterals(variableCount, cells);
          if (!isCompleteCube(variableCount, allCells, literals)) {
            continue;
          }

          const key = setKey(allCells);
          if (!candidatesByCells.has(key)) {
            candidatesByCells.set(key, {
              id: key,
              literals,
              expression: formatProductExpression(literals),
              verilog: formatProductVerilog(literals),
              allCells,
              coveredMinterms,
              literalCount: literals.length
            });
          }
        }
      }
    }
  }

  const candidates = [...candidatesByCells.values()];

  // A non-prime group is fully contained by a larger legal group. Keeping only
  // prime groups mirrors hand K-map work and keeps the exact cover search tiny.
  return candidates.filter(
    (candidate) =>
      !candidates.some(
        (other) =>
          other !== candidate &&
          other.allCells.size > candidate.allCells.size &&
          isSubset(candidate.allCells, other.allCells)
      )
  );
}

function chooseMinimumCover(
  candidates: CandidateGroup[],
  targetMinterms: Set<number>
): CandidateGroup[] {
  const byMinterm = new Map<number, CandidateGroup[]>();
  for (const minterm of targetMinterms) {
    byMinterm.set(
      minterm,
      candidates.filter((candidate) => candidate.coveredMinterms.has(minterm))
    );
  }

  let best: CandidateGroup[] | null = null;

  // The K-map groups are candidate implicants. This recursive exact-cover
  // search chooses a set that covers every required minterm, preferring fewer
  // product terms first and fewer literals second.
  function search(selected: CandidateGroup[], uncovered: Set<number>) {
    if (uncovered.size === 0) {
      if (!best || isBetterCover(selected, best)) {
        best = selected;
      }
      return;
    }

    if (best && selected.length >= best.length) {
      return;
    }

    const selectedIds = new Set(selected.map((candidate) => candidate.id));
    const pivot = [...uncovered].sort((left, right) => {
      const leftOptions = byMinterm.get(left)?.length ?? 0;
      const rightOptions = byMinterm.get(right)?.length ?? 0;
      return leftOptions - rightOptions;
    })[0];

    const options = (byMinterm.get(pivot) ?? [])
      .filter((candidate) => !selectedIds.has(candidate.id))
      .map((candidate) => ({
        candidate,
        newlyCovered: [...candidate.coveredMinterms].filter((minterm) =>
          uncovered.has(minterm)
        ).length
      }))
      .filter((option) => option.newlyCovered > 0)
      .sort(
        (left, right) =>
          right.newlyCovered - left.newlyCovered ||
          left.candidate.literalCount - right.candidate.literalCount ||
          left.candidate.expression.localeCompare(right.candidate.expression)
      );

    for (const { candidate } of options) {
      const nextUncovered = new Set(
        [...uncovered].filter(
          (minterm) => !candidate.coveredMinterms.has(minterm)
        )
      );
      search([...selected, candidate], nextUncovered);
    }
  }

  search([], targetMinterms);
  return best ?? [];
}

function findEssentialPrimeGroups(
  candidates: CandidateGroup[],
  targetMinterms: Set<number>
): CandidateGroup[] {
  const essential = new Map<string, CandidateGroup>();

  for (const minterm of targetMinterms) {
    const covering = candidates.filter((candidate) =>
      candidate.coveredMinterms.has(minterm)
    );

    if (covering.length === 1) {
      essential.set(covering[0].id, covering[0]);
    }
  }

  return [...essential.values()];
}

function deriveLiterals(
  variableCount: VariableCount,
  cells: KMapCell[]
): ProductLiteral[] {
  const variables = getVariables(variableCount);

  return variables.flatMap((variable, bitIndex) => {
    const firstBit = cells[0].bits[bitIndex];
    const isConstant = cells.every((cell) => cell.bits[bitIndex] === firstBit);

    return isConstant
      ? [
          {
            variable,
            negated: firstBit === 0
          }
        ]
      : [];
  });
}

function candidateToProductTerm(candidate: CandidateGroup): ProductTerm {
  return {
    id: candidate.id,
    literals: candidate.literals,
    expression: candidate.expression,
    verilog: candidate.verilog,
    minterms: [...candidate.coveredMinterms].sort((a, b) => a - b),
    allCells: [...candidate.allCells].sort((a, b) => a - b)
  };
}

function candidateToSumTerm(candidate: CandidateGroup): SumTerm {
  const literals = candidate.literals.map((literal) => ({
    variable: literal.variable,
    negated: !literal.negated
  }));

  return {
    id: candidate.id,
    literals,
    expression: formatSumExpression(literals),
    verilog: formatSumVerilog(literals),
    maxterms: [...candidate.coveredMinterms].sort((a, b) => a - b),
    allCells: [...candidate.allCells].sort((a, b) => a - b)
  };
}

function formatProductExpression(literals: ProductLiteral[]): string {
  if (literals.length === 0) return "1";
  return literals
    .map((literal) => `${literal.variable}${literal.negated ? "'" : ""}`)
    .join("");
}

function formatProductVerilog(literals: ProductLiteral[]): string {
  if (literals.length === 0) return "1'b1";
  return literals
    .map((literal) => `${literal.negated ? "~" : ""}${literal.variable}`)
    .join(" & ");
}

function formatSumExpression(literals: ProductLiteral[]): string {
  if (literals.length === 0) return "0";
  return `(${literals
    .map((literal) => `${literal.variable}${literal.negated ? "'" : ""}`)
    .join(" + ")})`;
}

function formatSumVerilog(literals: ProductLiteral[]): string {
  if (literals.length === 0) return "1'b0";
  return literals
    .map((literal) => `${literal.negated ? "~" : ""}${literal.variable}`)
    .join(" | ");
}

function parenthesizeTerm(verilogTerm: string): string {
  if (verilogTerm === "1'b1" || !verilogTerm.includes(" & ")) {
    return verilogTerm;
  }

  return `(${verilogTerm})`;
}

function parenthesizeSumTerm(verilogTerm: string): string {
  if (verilogTerm === "1'b0" || !verilogTerm.includes(" | ")) {
    return verilogTerm;
  }

  return `(${verilogTerm})`;
}

function isBetterCover(candidate: CandidateGroup[], currentBest: CandidateGroup[]) {
  const candidateLiteralCount = literalCount(candidate);
  const bestLiteralCount = literalCount(currentBest);
  const candidateCells = totalGroupedCells(candidate);
  const bestCells = totalGroupedCells(currentBest);

  return (
    candidate.length < currentBest.length ||
    (candidate.length === currentBest.length &&
      (candidateLiteralCount < bestLiteralCount ||
        (candidateLiteralCount === bestLiteralCount && candidateCells > bestCells)))
  );
}

function literalCount(groups: CandidateGroup[]): number {
  return groups.reduce((count, group) => count + group.literalCount, 0);
}

function totalGroupedCells(groups: CandidateGroup[]): number {
  return groups.reduce((count, group) => count + group.allCells.size, 0);
}

function setKey(values: Set<number>): string {
  return [...values].sort((a, b) => a - b).join(",");
}

function isSubset<T>(subset: Set<T>, superset: Set<T>): boolean {
  return [...subset].every((value) => superset.has(value));
}

function isCompleteCube(
  variableCount: VariableCount,
  cells: Set<number>,
  literals: ProductLiteral[]
): boolean {
  return cells.size === 1 << (variableCount - literals.length);
}

function powersOfTwoUpTo(limit: number): number[] {
  const values: number[] = [];
  for (let value = 1; value <= limit; value *= 2) {
    values.push(value);
  }
  return values;
}
