import { mintermToBits } from "./kmap";
import { ALL_VARIABLES, MAX_VARIABLE_COUNT, MIN_VARIABLE_COUNT } from "./types";
import type { LogicVariable, OutputValue, VariableCount } from "./types";

type FormulaNode =
  | { type: "const"; value: boolean }
  | { type: "var"; name: LogicVariable }
  | { type: "not"; child: FormulaNode }
  | { type: "buffer"; child: FormulaNode }
  | { type: BinaryOperator; left: FormulaNode; right: FormulaNode };

type BinaryOperator = "and" | "nand" | "or" | "nor" | "xor" | "xnor";
type FormulaVariableLabels = Partial<Record<LogicVariable, string>>;

type Token =
  | { type: "var"; value: LogicVariable }
  | { type: "const"; value: boolean }
  | { type: "op"; value: BinaryOperator | "buffer" | "not" }
  | { type: "postfixNot" }
  | { type: "lparen" }
  | { type: "rparen" };

interface FormulaEvaluation {
  variableLabels: Record<LogicVariable, string>;
  variableCount: VariableCount;
  values: OutputValue[];
}

const LOGIC_VARIABLES: readonly LogicVariable[] = ALL_VARIABLES;
const RESERVED_WORDS = new Set([
  "AND",
  "BUF",
  "BUFFER",
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
  _currentVariableCount: VariableCount,
  variableLabels: FormulaVariableLabels = {}
): FormulaEvaluation {
  const variableResolver = new VariableResolver(variableLabels);
  const tokens = addImplicitAnds(tokenize(formula, variableResolver));
  const parser = new FormulaParser(tokens);
  const ast = parser.parse();
  const variableCount = pickVariableCount(ast);
  const values = Array.from({ length: 1 << variableCount }, (_, minterm) => {
    const bits = mintermToBits(minterm, variableCount);
    const context = new Map<LogicVariable, boolean>();

    LOGIC_VARIABLES
      .slice(0, variableCount)
      .forEach((variable, index) => {
        context.set(variable, bits[index] === 1);
      });

    return evaluateNode(ast, context) ? "1" : "0";
  });

  return {
    variableCount,
    variableLabels: variableResolver.getLabels(),
    values
  };
}

function normalizeVariableAlias(value: string | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, "").toUpperCase();
}

class VariableResolver {
  private readonly aliases = new Map<string, LogicVariable>();
  private readonly dynamicAliases = new Map<string, LogicVariable>();
  private readonly labels: Record<LogicVariable, string> = Object.fromEntries(
    LOGIC_VARIABLES.map((variable) => [variable, variable])
  ) as Record<LogicVariable, string>;
  private readonly usedVariables = new Set<LogicVariable>();

  constructor(variableLabels: FormulaVariableLabels) {
    LOGIC_VARIABLES.forEach((variable) => this.aliases.set(variable, variable));

    for (const variable of LOGIC_VARIABLES) {
      const label = sanitizeAutoVariableLabel(variableLabels[variable]) || variable;
      const alias = normalizeVariableAlias(label);
      this.labels[variable] = label;

      if (!alias || RESERVED_WORDS.has(alias)) {
        continue;
      }

      const existing = this.aliases.get(alias);
      if (existing && existing !== variable) {
        throw new Error("Variable names must be unique.");
      }

      this.aliases.set(alias, variable);
    }
  }

  getLabels(): Record<LogicVariable, string> {
    return { ...this.labels };
  }

  resolveAlias(word: string): LogicVariable | null {
    const alias = normalizeVariableAlias(word);
    const variable = this.aliases.get(alias) ?? this.dynamicAliases.get(alias);

    if (!variable) {
      return null;
    }

    this.usedVariables.add(variable);
    return variable;
  }

  resolveDynamic(word: string): LogicVariable {
    const alias = normalizeVariableAlias(word);
    const existing = this.dynamicAliases.get(alias);

    if (existing) {
      this.usedVariables.add(existing);
      return existing;
    }

    const nextVariable = LOGIC_VARIABLES.find(
      (variable) => !this.usedVariables.has(variable)
    );

    if (!nextVariable) {
      throw new Error(`This workspace supports up to ${MAX_VARIABLE_COUNT} variables.`);
    }

    const label = sanitizeAutoVariableLabel(word);
    if (!label || RESERVED_WORDS.has(alias)) {
      throw new Error(`"${word}" is reserved and cannot be used as a variable.`);
    }

    this.dynamicAliases.set(alias, nextVariable);
    this.aliases.set(alias, nextVariable);
    this.labels[nextVariable] = label;
    this.usedVariables.add(nextVariable);
    return nextVariable;
  }
}

function sanitizeAutoVariableLabel(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^A-Za-z0-9_]/g, "")
    .replace(/^[^A-Za-z_]+/, "")
    .slice(0, 8);
}

function tokenize(
  input: string,
  variableResolver: VariableResolver
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
      while (index < input.length && /[A-Za-z0-9_]/.test(input[index])) {
        index += 1;
      }

      const rawWord = input.slice(start, index);
      const word = rawWord.toUpperCase();
      const existingVariable = variableResolver.resolveAlias(rawWord);

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
      } else if (word === "BUFFER" || word === "BUF") {
        tokens.push({ type: "op", value: "buffer" });
      } else if (word === "TRUE") {
        tokens.push({ type: "const", value: true });
      } else if (word === "FALSE") {
        tokens.push({ type: "const", value: false });
      } else if (existingVariable) {
        tokens.push({ type: "var", value: existingVariable });
      } else if (shouldSplitImplicitVariables(rawWord)) {
        for (const variableName of rawWord) {
          tokens.push({
            type: "var",
            value:
              variableResolver.resolveAlias(variableName) ??
              variableResolver.resolveDynamic(variableName)
          });
        }
      } else {
        tokens.push({
          type: "var",
          value: variableResolver.resolveDynamic(rawWord)
        });
      }
      continue;
    }

    throw new Error(
      `Unexpected character "${char}". Use up to ${MAX_VARIABLE_COUNT} variable names plus words like buffer, nand, nor, xor, xnor, or the symbols shown in Guide.`
    );
  }

  if (tokens.length === 0) {
    throw new Error("Enter a Boolean formula.");
  }

  return tokens;
}

function shouldSplitImplicitVariables(word: string): boolean {
  return (
    word.length > 1 &&
    [...word].every((char) => LOGIC_VARIABLES.includes(char as LogicVariable))
  );
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
    (token.type === "op" && (token.value === "buffer" || token.value === "not"))
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

    if (this.matchOperator("buffer")) {
      return {
        type: "buffer",
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

  private matchOperator(operator: BinaryOperator | "buffer" | "not"): boolean {
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
    if (token?.type !== "op" || token.value === "buffer" || token.value === "not") {
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
  ast: FormulaNode
): VariableCount {
  const requiredCount = Math.max(
    MIN_VARIABLE_COUNT,
    ...collectVariables(ast).map(variableRank)
  );
  return requiredCount as VariableCount;
}

function collectVariables(ast: FormulaNode): LogicVariable[] {
  if (ast.type === "var") return [ast.name];
  if (ast.type === "const") return [];
  if (ast.type === "buffer" || ast.type === "not") return collectVariables(ast.child);

  return [...collectVariables(ast.left), ...collectVariables(ast.right)];
}

function variableRank(variable: LogicVariable): number {
  return LOGIC_VARIABLES.indexOf(variable) + 1;
}

function evaluateNode(
  node: FormulaNode,
  context: Map<LogicVariable, boolean>
): boolean {
  if (node.type === "const") return node.value;
  if (node.type === "var") return context.get(node.name) ?? false;
  if (node.type === "buffer") return evaluateNode(node.child, context);
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
