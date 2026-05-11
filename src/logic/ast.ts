import type { LogicVariable, ProductLiteral, ProductTerm, SumTerm } from "./types";

export type BooleanAst =
  | { type: "VAR"; name: LogicVariable }
  | { type: "NOT"; input: BooleanAst }
  | { type: "AND"; inputs: BooleanAst[] }
  | { type: "OR"; inputs: BooleanAst[] };

export type LiteralAst =
  | { type: "VAR"; name: LogicVariable }
  | { type: "NOT"; input: { type: "VAR"; name: LogicVariable } };

export type BooleanExpressionAst =
  | { kind: "CONST"; value: boolean }
  | { kind: "AST"; ast: BooleanAst };

export function buildAstFromSopTerms(
  expression: string,
  terms: ProductTerm[]
): BooleanExpressionAst {
  if (expression === "0" || terms.length === 0) {
    return { kind: "CONST", value: false };
  }

  if (expression === "1" || terms.some((term) => term.literals.length === 0)) {
    return { kind: "CONST", value: true };
  }

  return {
    kind: "AST",
    ast: normalizeAst(factorSopTerms(terms))
  };
}

export function buildAstFromPosTerms(
  expression: string,
  terms: SumTerm[]
): BooleanExpressionAst {
  if (expression === "1" || terms.length === 0) {
    return { kind: "CONST", value: true };
  }

  if (expression === "0" || terms.some((term) => term.literals.length === 0)) {
    return { kind: "CONST", value: false };
  }

  return {
    kind: "AST",
    ast: normalizeAst({
      type: "AND",
      inputs: terms.map((term) =>
        normalizeAst({
          type: "OR",
          inputs: term.literals.map(literalToAst)
        })
      )
    })
  };
}

export function astToString(ast: BooleanAst): string {
  if (ast.type === "VAR") return ast.name;
  if (ast.type === "NOT") {
    return isVariable(ast.input) ? `${ast.input.name}'` : `(${astToString(ast.input)})'`;
  }

  const operator = ast.type === "AND" ? "" : " + ";
  const parts = ast.inputs.map((input) => {
    if (ast.type === "AND" && input.type === "OR") {
      return `(${astToString(input)})`;
    }

    if (ast.type === "OR" && input.type === "AND") {
      return astToString(input);
    }

    return astToString(input);
  });

  return parts.join(operator);
}

export function normalizeAst(ast: BooleanAst): BooleanAst {
  if (ast.type === "VAR") return ast;
  if (ast.type === "NOT") {
    const input = normalizeAst(ast.input);
    return input.type === "NOT" ? input.input : { type: "NOT", input };
  }

  const inputs = ast.inputs.flatMap((input) => {
    const normalized = normalizeAst(input);
    return normalized.type === ast.type ? normalized.inputs : [normalized];
  });

  if (inputs.length === 1) {
    return inputs[0];
  }

  return { type: ast.type, inputs };
}

export function toNnf(ast: BooleanAst, inverted = false): BooleanAst {
  if (ast.type === "VAR") {
    return inverted ? { type: "NOT", input: ast } : ast;
  }

  if (ast.type === "NOT") {
    return toNnf(ast.input, !inverted);
  }

  if (ast.type === "AND") {
    return normalizeAst({
      type: inverted ? "OR" : "AND",
      inputs: ast.inputs.map((input) => toNnf(input, inverted))
    });
  }

  return normalizeAst({
    type: inverted ? "AND" : "OR",
    inputs: ast.inputs.map((input) => toNnf(input, inverted))
  });
}

export function isLiteral(ast: BooleanAst): ast is LiteralAst {
  return ast.type === "VAR" || (ast.type === "NOT" && ast.input.type === "VAR");
}

export function literalLabel(ast: LiteralAst): string {
  if (ast.type === "VAR") return ast.name;
  return `${ast.input.name}'`;
}

function factorSopTerms(terms: ProductTerm[]): BooleanAst {
  const termKeys = terms.map((term) =>
    term.literals.map(literalKey).sort((left, right) => left.localeCompare(right))
  );
  const literalByKey = new Map<string, ProductLiteral>();

  terms.forEach((term) => {
    term.literals.forEach((literal) => {
      literalByKey.set(literalKey(literal), literal);
    });
  });

  const oai22 = tryFactorOai22(termKeys, literalByKey);
  if (oai22) return oai22;

  const commonFactor = tryFactorCommonLiteral(termKeys, literalByKey);
  if (commonFactor) return commonFactor;

  return normalizeAst({
    type: "OR",
    inputs: terms.map((term) => productTermToAst(term.literals))
  });
}

function tryFactorCommonLiteral(
  termKeys: string[][],
  literalByKey: Map<string, ProductLiteral>
): BooleanAst | null {
  if (termKeys.length < 2) return null;

  const common = termKeys[0].filter((key) =>
    termKeys.every((keys) => keys.includes(key))
  );

  if (common.length === 0) return null;

  const remainders = termKeys.map((keys) =>
    keys.filter((key) => !common.includes(key))
  );

  if (remainders.some((keys) => keys.length === 0)) return null;

  return normalizeAst({
    type: "AND",
    inputs: [
      ...common.map((key) => literalToAst(literalByKey.get(key)!)),
      {
        type: "OR",
        inputs: remainders.map((keys) =>
          normalizeAst({
            type: "AND",
            inputs: keys.map((key) => literalToAst(literalByKey.get(key)!))
          })
        )
      }
    ]
  });
}

function tryFactorOai22(
  termKeys: string[][],
  literalByKey: Map<string, ProductLiteral>
): BooleanAst | null {
  if (termKeys.length !== 4 || termKeys.some((keys) => keys.length !== 2)) {
    return null;
  }

  const unique = [...new Set(termKeys.flat())].sort();
  if (unique.length !== 4) return null;

  const partitions = [
    [
      [unique[0], unique[1]],
      [unique[2], unique[3]]
    ],
    [
      [unique[0], unique[2]],
      [unique[1], unique[3]]
    ],
    [
      [unique[0], unique[3]],
      [unique[1], unique[2]]
    ]
  ];
  const actual = new Set(termKeys.map((keys) => keys.join("*")));

  for (const [left, right] of partitions) {
    const expected = new Set(
      left.flatMap((leftKey) =>
        right.map((rightKey) => [leftKey, rightKey].sort().join("*"))
      )
    );

    if (setsEqual(actual, expected)) {
      return {
        type: "AND",
        inputs: [
          {
            type: "OR",
            inputs: left.map((key) => literalToAst(literalByKey.get(key)!))
          },
          {
            type: "OR",
            inputs: right.map((key) => literalToAst(literalByKey.get(key)!))
          }
        ]
      };
    }
  }

  return null;
}

function productTermToAst(literals: ProductLiteral[]): BooleanAst {
  return normalizeAst({
    type: "AND",
    inputs: literals.map(literalToAst)
  });
}

function literalToAst(literal: ProductLiteral): BooleanAst {
  const variable: BooleanAst = { type: "VAR", name: literal.variable };
  return literal.negated ? { type: "NOT", input: variable } : variable;
}

function literalKey(literal: ProductLiteral): string {
  return `${literal.variable}${literal.negated ? "'" : ""}`;
}

function isVariable(ast: BooleanAst): ast is { type: "VAR"; name: LogicVariable } {
  return ast.type === "VAR";
}

function setsEqual<T>(left: Set<T>, right: Set<T>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value));
}
