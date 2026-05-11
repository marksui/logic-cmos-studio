export type VariableCount = 2 | 3 | 4;
export type OutputValue = "0" | "1" | "X";

export const ALL_VARIABLES = ["A", "B", "C", "D"] as const;
export type LogicVariable = (typeof ALL_VARIABLES)[number];

export interface TruthRow {
  index: number;
  bits: number[];
  value: OutputValue;
}

export interface KMapCell {
  row: number;
  col: number;
  minterm: number;
  bits: number[];
  value: OutputValue;
}

export interface KMapData {
  rows: number;
  cols: number;
  rowVariables: LogicVariable[];
  colVariables: LogicVariable[];
  rowLabels: string[];
  colLabels: string[];
  cells: KMapCell[][];
}

export interface ProductLiteral {
  variable: LogicVariable;
  negated: boolean;
}

export interface ProductTerm {
  id: string;
  literals: ProductLiteral[];
  expression: string;
  verilog: string;
  minterms: number[];
  allCells: number[];
}

export interface SumTerm {
  id: string;
  literals: ProductLiteral[];
  expression: string;
  verilog: string;
  maxterms: number[];
  allCells: number[];
}

export interface PosSimplificationResult {
  expression: string;
  verilogExpression: string;
  terms: SumTerm[];
  maxterms: number[];
  dontCares: number[];
}

export interface SimplificationResult {
  expression: string;
  verilogExpression: string;
  verilogAssign: string;
  terms: ProductTerm[];
  minterms: number[];
  dontCares: number[];
  kmap: KMapData;
}
