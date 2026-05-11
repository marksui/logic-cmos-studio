import { mintermToBits } from "./kmap";
import type { LogicVariable, OutputValue, VariableCount } from "./types";

type FormulaNode =
  | { type: "const"; value: boolean }
  | { type: "var"; name: LogicVariable }
  | { type: "not"; child: FormulaNode }
  | { type: BinaryOperator; left: FormulaNode; right: FormulaNode };

type BinaryOperator = "and" | "nand" | "or" | "nor" | "xor" | "xnor";
type FormulaVariableLabels = Partial<Record<LogicVariable, string>>;

type Token =
  | { type: "var"; value: LogicVariable }
  | { type: "const"; value: boolean }
  | { type: "op"; value: BinaryOperator | "not" }
  | { type: "postfixNot" }
  | { type: "lparen" }
  | { type: "rparen" };

interface FormulaEvaluation {
  variableCount: VariableCount;
  values: OutputValue[];
}

const LOGIC_VARIABLES: LogicVariable[] = ["A", "B", "C", "D"];
const RESERVED_WORDS = new Set([
  "AND",
  "FALSE",
  "INV",
  "NAND",
  "NOR",
  "NOT",
  "NXOR",
  "OR",
  "TRUE",
  "XNOR",
  "XOR"
]);

export function evaluateFormula(
  formula: string,
  currentVariableCount: VariableCount,
  variableLabels: FormulaVariableLabels = {}
): FormulaEvaluation {
  const tokens = addImplicitAnds(
    tokenize(formula, buildVariableAliasLookup(variableLabels))
  );
  const parser = new FormulaParser(tokens);
  const ast = parser.parse();
  const variableCount = pickVariableCount(ast, currentVariableCount);
  const values = Array.from({ length: 1 << variableCount }, (_, minterm) => {
    const bits = mintermToBits(minterm, variableCount);
    const context = new Map<LogicVariable, boolean>();

    (["A", "B", "C", "D"] as LogicVariable[])
      .slice(0, variableCount)
      .forEach((variable, index) => {
        context.set(variable, bits[index] === 1);
      });

    return evaluateNode(ast, context) ? "1" : "0";
  });

  return { variableCount, values };
}

function buildVariableAliasLookup(
  variableLabels: FormulaVariableLabels
): Map<string, LogicVariable> {
  const aliases = new Map<string, LogicVariable>();

  LOGIC_VARIABLES.forEach((variable) => aliases.set(variable, variable));

  for (const variable of LOGIC_VARIABLES) {
    const alias = normalizeVariableAlias(variableLabels[variable]);
    if (!alias || RESERVED_WORDS.has(alias)) {
      continue;
    }

    const existing = aliases.get(alias);
    if (existing && existing !== variable) {
      throw new Error("Variable names must be unique.");
    }

    aliases.set(alias, variable);
  }

  return aliases;
}

function normalizeVariableAlias(value: string | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, "").toUpperCase();
}

function tokenize(
  input: string,
  variableAliases: Map<string, LogicVariable>
): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < input.length) {
    const char = input[index];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (char === "(") {
      tokens.push({ type: "lparen" });
      index += 1;
      continue;
    }

    if (char === ")") {
      tokens.push({ type: "rparen" });
      index += 1;
      continue;
    }

    if (["'", "’", "′", "`"].includes(char)) {
      tokens.push({ type: "postfixNot" });
      index += 1;
      continue;
    }

    if (char === "!" || char === "~" || char === "¬") {
      tokens.push({ type: "op", value: "not" });
      index += 1;
      continue;
    }

    if (
      char === "&" ||
      char === "*" ||
      char === "." ||
      char === "\u00b7" ||
      char === "\u22c5"
    ) {
      tokens.push({ type: "op", value: "and" });
      index += 1;
      continue;
    }

    if (char === "+" || char === "|" || char === "∨") {
      tokens.push({ type: "op", value: "or" });
      index += 1;
      continue;
    }

    if (char === "^" || char === "⊕") {
      tokens.push({ type: "op", value: "xor" });
      index += 1;
      continue;
    }

    if (char === "⊙" || char === "≡" || char === "↔") {
      tokens.push({ type: "op", value: "xnor" });
      index += 1;
      continue;
    }

    if (char === "↑") {
      tokens.push({ type: "op", value: "nand" });
      index += 1;
      continue;
    }

    if (char === "↓") {
      tokens.push({ type: "op", value: "nor" });
      index += 1;
      continue;
    }

    if (char === "0" || char === "1") {
      tokens.push({ type: "const", value: char === "1" });
      index += 1;
      continue;
    }

    if (/[A-Za-z]/.test(char)) {
      const start = index;
      while (index < input.length && /[A-Za-z]/.test(input[index])) {
        index += 1;
      }

      const word = input.slice(start, index).toUpperCase();
      if (word === "AND") {
        tokens.push({ type: "op", value: "and" });
      } else if (word === "NAND") {
        tokens.push({ type: "op", value: "nand" });
      } else if (word === "OR") {
        tokens.push({ type: "op", value: "or" });
      } else if (word === "NOR") {
        tokens.push({ type: "op", value: "nor" });
      } else if (word === "XOR") {
        tokens.push({ type: "op", value: "xor" });
      } else if (word === "XNOR" || word === "NXOR") {
        tokens.push({ type: "op", value: "xnor" });
      } else if (word === "NOT" || word === "INV") {
        tokens.push({ type: "op", value: "not" });
      } else if (word === "TRUE") {
        tokens.push({ type: "const", value: true });
      } else if (word === "FALSE") {
        tokens.push({ type: "const", value: false });
      } else if (variableAliases.has(word)) {
        tokens.push({ type: "var", value: variableAliases.get(word)! });
      } else if (/^[ABCD]+$/.test(word)) {
        for (const variable of word) {
          tokens.push({ type: "var", value: variable as LogicVariable });
        }
      } else {
        throw new Error(
          "Use your variable names or A, B, C, D with operators AND, OR, NOT, NAND, NOR, XOR, XNOR."
        );
      }
      continue;
    }

    throw new Error(
      `Unexpected character "${char}". Use A-D plus words like nand, nor, xor, xnor, or the symbols shown in Guide.`
    );
  }

  if (tokens.length === 0) {
    throw new Error("Enter a Boolean formula.");
  }

  return tokens;
}

function addImplicitAnds(tokens: Token[]): Token[] {
  const result: Token[] = [];

  tokens.forEach((token, index) => {
    const previous = tokens[index - 1];

    if (previous && canEndExpression(previous) && canStartExpression(token)) {
      result.push({ type: "op", value: "and" });
    }

    result.push(token);
  });

  return result;
}

function canEndExpression(token: Token): boolean {
  return (
    token.type === "var" ||
    token.type === "const" ||
    token.type === "rparen" ||
    token.type === "postfixNot"
  );
}

function canStartExpression(token: Token): boolean {
  return (
    token.type === "var" ||
    token.type === "const" ||
    token.type === "lparen" ||
    (token.type === "op" && token.value === "not")
  );
}

class FormulaParser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): FormulaNode {
    const expression = this.parseOrLike();

    if (!this.isAtEnd()) {
      throw new Error("Unexpected token after the formula.");
    }

    return expression;
  }

  private parseOrLike(): FormulaNode {
    let expression = this.parseXorLike();

    while (this.matchAnyOperator(["or", "nor"])) {
      const operator = this.previousOperator();
      expression = {
        type: operator,
        left: expression,
        right: this.parseXorLike()
      };
    }

    return expression;
  }

  private parseXorLike(): FormulaNode {
    let expression = this.parseAndLike();

    while (this.matchAnyOperator(["xor", "xnor"])) {
      const operator = this.previousOperator();
      expression = {
        type: operator,
        left: expression,
        right: this.parseAndLike()
      };
    }

    return expression;
  }

  private parseAndLike(): FormulaNode {
    let expression = this.parseUnary();

    while (this.matchAnyOperator(["and", "nand"])) {
      const operator = this.previousOperator();
      expression = {
        type: operator,
        left: expression,
        right: this.parseUnary()
      };
    }

    return expression;
  }

  private parseUnary(): FormulaNode {
    if (this.matchOperator("not")) {
      return {
        type: "not",
        child: this.parseUnary()
      };
    }

    return this.parsePostfix();
  }

  private parsePostfix(): FormulaNode {
    let expression = this.parsePrimary();

    while (this.match("postfixNot")) {
      expression = {
        type: "not",
        child: expression
      };
    }

    return expression;
  }

  private parsePrimary(): FormulaNode {
    const token = this.advance();

    if (!token) {
      throw new Error("The formula ended too early.");
    }

    if (token.type === "var") {
      return { type: "var", name: token.value };
    }

    if (token.type === "const") {
      return { type: "const", value: token.value };
    }

    if (token.type === "lparen") {
      const expression = this.parseOrLike();
      if (!this.match("rparen")) {
        throw new Error("Missing closing parenthesis.");
      }

      return expression;
    }

    throw new Error("Expected a variable, constant, or parenthesized expression.");
  }

  private match(type: Token["type"]): boolean {
    if (this.peek()?.type !== type) {
      return false;
    }

    this.index += 1;
    return true;
  }

  private matchOperator(operator: BinaryOperator | "not"): boolean {
    const token = this.peek();
    if (token?.type !== "op" || token.value !== operator) {
      return false;
    }

    this.index += 1;
    return true;
  }

  private matchAnyOperator(operators: BinaryOperator[]): boolean {
    const token = this.peek();
    if (token?.type !== "op" || !operators.includes(token.value as BinaryOperator)) {
      return false;
    }

    this.index += 1;
    return true;
  }

  private previousOperator(): BinaryOperator {
    const token = this.tokens[this.index - 1];
    if (token?.type !== "op" || token.value === "not") {
      throw new Error("Internal parser error.");
    }

    return token.value;
  }

  private advance(): Token | undefined {
    const token = this.peek();
    if (token) {
      this.index += 1;
    }

    return token;
  }

  private peek(): Token | undefined {
    return this.tokens[this.index];
  }

  private isAtEnd(): boolean {
    return this.index >= this.tokens.length;
  }
}

function pickVariableCount(
  ast: FormulaNode,
  currentVariableCount: VariableCount
): VariableCount {
  const requiredCount = Math.max(2, ...collectVariables(ast).map(variableRank));
  return Math.max(requiredCount, currentVariableCount) as VariableCount;
}

function collectVariables(ast: FormulaNode): LogicVariable[] {
  if (ast.type === "var") return [ast.name];
  if (ast.type === "const") return [];
  if (ast.type === "not") return collectVariables(ast.child);

  return [...collectVariables(ast.left), ...collectVariables(ast.right)];
}

function variableRank(variable: LogicVariable): number {
  return ["A", "B", "C", "D"].indexOf(variable) + 1;
}

function evaluateNode(
  node: FormulaNode,
  context: Map<LogicVariable, boolean>
): boolean {
  if (node.type === "const") return node.value;
  if (node.type === "var") return context.get(node.name) ?? false;
  if (node.type === "not") return !evaluateNode(node.child, context);

  const left = evaluateNode(node.left, context);
  const right = evaluateNode(node.right, context);

  if (node.type === "and") return left && right;
  if (node.type === "nand") return !(left && right);
  if (node.type === "or") return left || right;
  if (node.type === "nor") return !(left || right);
  if (node.type === "xor") return left !== right;

  return left === right;
}
