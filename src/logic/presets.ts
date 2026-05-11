import { mintermToBits } from "./kmap";
import type { OutputValue, VariableCount } from "./types";

export interface Preset {
  category: PresetCategory;
  id: string;
  name: string;
  formula: string;
  variableCount: VariableCount;
  makeValues: () => OutputValue[];
}

export type PresetCategory = "Basic gates" | "Complex CMOS" | "Arithmetic";
export const PRESET_CATEGORIES: PresetCategory[] = [
  "Basic gates",
  "Complex CMOS",
  "Arithmetic"
];

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
    category: "Basic gates",
    id: "xor",
    name: "XOR",
    formula: "A xor B",
    variableCount: 2,
    makeValues: () =>
      valuesFromPredicate(2, ([a, b]) => (a === 1) !== (b === 1))
  },
  {
    category: "Basic gates",
    id: "xnor",
    name: "XNOR",
    formula: "A xnor B",
    variableCount: 2,
    makeValues: () =>
      valuesFromPredicate(2, ([a, b]) => (a === 1) === (b === 1))
  },
  {
    category: "Basic gates",
    id: "nand",
    name: "NAND",
    formula: "A nand B",
    variableCount: 2,
    makeValues: () =>
      valuesFromPredicate(2, ([a, b]) => !(a === 1 && b === 1))
  },
  {
    category: "Basic gates",
    id: "nor",
    name: "NOR",
    formula: "A nor B",
    variableCount: 2,
    makeValues: () =>
      valuesFromPredicate(2, ([a, b]) => !(a === 1 || b === 1))
  },
  {
    category: "Complex CMOS",
    id: "aoi21",
    name: "AOI21",
    formula: "not ((A and B) or C)",
    variableCount: 3,
    makeValues: () =>
      valuesFromPredicate(3, ([a, b, c]) => !((a === 1 && b === 1) || c === 1))
  },
  {
    category: "Complex CMOS",
    id: "aoi22",
    name: "AOI22",
    formula: "not ((A and B) or (C and D))",
    variableCount: 4,
    makeValues: () =>
      valuesFromPredicate(
        4,
        ([a, b, c, d]) => !((a === 1 && b === 1) || (c === 1 && d === 1))
      )
  },
  {
    category: "Complex CMOS",
    id: "oai21",
    name: "OAI21",
    formula: "not ((A or B) and C)",
    variableCount: 3,
    makeValues: () =>
      valuesFromPredicate(3, ([a, b, c]) => !((a === 1 || b === 1) && c === 1))
  },
  {
    category: "Complex CMOS",
    id: "oai22",
    name: "OAI22",
    formula: "not ((A or B) and (C or D))",
    variableCount: 4,
    makeValues: () =>
      valuesFromPredicate(
        4,
        ([a, b, c, d]) => !((a === 1 || b === 1) && (c === 1 || d === 1))
      )
  },
  {
    category: "Arithmetic",
    id: "majority",
    name: "Majority",
    formula: "AB + AC + BC",
    variableCount: 3,
    makeValues: () =>
      valuesFromPredicate(3, (bits) => bits.filter(Boolean).length >= 2)
  },
  {
    category: "Arithmetic",
    id: "full-adder-sum",
    name: "Full-adder sum",
    formula: "A xor B xor C",
    variableCount: 3,
    makeValues: () =>
      valuesFromPredicate(3, (bits) => bits.filter(Boolean).length % 2 === 1)
  }
];
