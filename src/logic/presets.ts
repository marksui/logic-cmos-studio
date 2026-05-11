import { mintermToBits } from "./kmap";
import type { OutputValue, VariableCount } from "./types";

export interface Preset {
  id: string;
  name: string;
  formula: string;
  variableCount: VariableCount;
  makeValues: () => OutputValue[];
}

function valuesFromPredicate(
  variableCount: VariableCount,
  predicate: (bits: number[]) => boolean
): OutputValue[] {
  return Array.from({ length: 1 << variableCount }, (_, minterm) =>
    predicate(mintermToBits(minterm, variableCount)) ? "1" : "0"
  );
}

export const PRESETS: Preset[] = [
  {
    id: "xor",
    name: "XOR",
    formula: "A xor B",
    variableCount: 2,
    makeValues: () =>
      valuesFromPredicate(2, ([a, b]) => (a === 1) !== (b === 1))
  },
  {
    id: "xnor",
    name: "XNOR",
    formula: "A xnor B",
    variableCount: 2,
    makeValues: () =>
      valuesFromPredicate(2, ([a, b]) => (a === 1) === (b === 1))
  },
  {
    id: "nand",
    name: "NAND",
    formula: "A nand B",
    variableCount: 2,
    makeValues: () =>
      valuesFromPredicate(2, ([a, b]) => !(a === 1 && b === 1))
  },
  {
    id: "nor",
    name: "NOR",
    formula: "A nor B",
    variableCount: 2,
    makeValues: () =>
      valuesFromPredicate(2, ([a, b]) => !(a === 1 || b === 1))
  },
  {
    id: "majority",
    name: "Majority",
    formula: "AB + AC + BC",
    variableCount: 3,
    makeValues: () =>
      valuesFromPredicate(3, (bits) => bits.filter(Boolean).length >= 2)
  },
  {
    id: "full-adder-sum",
    name: "Full-adder sum",
    formula: "A xor B xor C",
    variableCount: 3,
    makeValues: () =>
      valuesFromPredicate(3, (bits) => bits.filter(Boolean).length % 2 === 1)
  }
];
