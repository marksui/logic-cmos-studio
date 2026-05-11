import {
  ALL_VARIABLES,
  type KMapData,
  type LogicVariable,
  type OutputValue,
  type TruthRow,
  type VariableCount
} from "./types";

const GRAY_CODES: Record<number, string[]> = {
  1: ["0", "1"],
  2: ["00", "01", "11", "10"]
};

export function getVariables(variableCount: VariableCount): LogicVariable[] {
  return ALL_VARIABLES.slice(0, variableCount);
}

export function mintermToBits(minterm: number, variableCount: VariableCount): number[] {
  return Array.from({ length: variableCount }, (_, bitIndex) => {
    const shift = variableCount - bitIndex - 1;
    return (minterm >> shift) & 1;
  });
}

export function bitsToMinterm(bits: number[]): number {
  return bits.reduce((value, bit) => (value << 1) | bit, 0);
}

export function makeTruthRows(
  variableCount: VariableCount,
  values: OutputValue[]
): TruthRow[] {
  const rowCount = 1 << variableCount;
  return Array.from({ length: rowCount }, (_, index) => ({
    index,
    bits: mintermToBits(index, variableCount),
    value: values[index] ?? "0"
  }));
}

function splitVariables(variableCount: VariableCount) {
  const rowBitCount = variableCount === 4 ? 2 : 1;
  const colBitCount = variableCount - rowBitCount;
  const variables = getVariables(variableCount);

  return {
    rowBitCount,
    colBitCount,
    rowVariables: variables.slice(0, rowBitCount),
    colVariables: variables.slice(rowBitCount)
  };
}

export function buildKMap(
  variableCount: VariableCount,
  values: OutputValue[]
): KMapData {
  const { rowBitCount, colBitCount, rowVariables, colVariables } =
    splitVariables(variableCount);
  const rowLabels = GRAY_CODES[rowBitCount];
  const colLabels = GRAY_CODES[colBitCount];

  const cells = rowLabels.map((rowCode, row) =>
    colLabels.map((colCode, col) => {
      const bits = [...rowCode, ...colCode].map(Number);
      const minterm = bitsToMinterm(bits);

      return {
        row,
        col,
        minterm,
        bits,
        value: values[minterm] ?? "0"
      };
    })
  );

  return {
    rows: rowLabels.length,
    cols: colLabels.length,
    rowVariables,
    colVariables,
    rowLabels,
    colLabels,
    cells
  };
}
