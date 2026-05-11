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

type FormulaInput =
  | {
      kind: "expression";
      expression: string;
      explicitVariableLabels: string[] | null;
    }
  | {
      kind: "minterms";
      dontCares: number[];
      minterms: number[];
      explicitVariableLabels: string[] | null;
    };

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
  const input = normalizeFormulaInput(formula);

  if (input.kind === "minterms") {
    return evaluateMintermInput(input);
  }

  const variableResolver = new VariableResolver(variableLabels, {
    explicitVariableLabels: input.explicitVariableLabels,
    protectedVariables: input.explicitVariableLabels
      ? undefined
      : collectProtectedBuiltIns(input.expression)
  });
  const tokens = addImplicitAnds(tokenize(input.expression, variableResolver));
  const parser = new FormulaParser(tokens);
  const ast = parser.parse();
  const variableCount = input.explicitVariableLabels
    ? validateVariableCount(input.explicitVariableLabels.length)
    : pickVariableCount(ast);
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

function normalizeFormulaInput(formula: string): FormulaInput {
  const trimmed = formula.trim();
  const assignmentIndex = trimmed.indexOf("=");
  const lhs = assignmentIndex >= 0 ? trimmed.slice(0, assignmentIndex).trim() : "";
  const rhs = assignmentIndex >= 0 ? trimmed.slice(assignmentIndex + 1).trim() : trimmed;
  const explicitVariableLabels = parseFunctionHeader(lhs);
  const mintermInput = parseMintermInput(rhs, explicitVariableLabels);

  if (mintermInput) {
    return mintermInput;
  }

  return {
    kind: "expression",
    expression: rhs,
    explicitVariableLabels
  };
}

function parseFunctionHeader(lhs: string): string[] | null {
  if (!lhs) return null;

  const match = lhs.match(/^[A-Za-z][A-Za-z0-9_]*\s*(?:\(([^)]*)\))?$/);
  if (!match) {
    throw new Error("Use a header like F = ... or F(A,B,C,D) = ...");
  }

  if (!match[1]) return null;

  const labels = match[1]
    .split(",")
    .map((label) => sanitizeAutoVariableLabel(label))
    .filter(Boolean);

  if (labels.length === 0) {
    throw new Error("Function headers need at least one variable.");
  }

  return labels;
}

function parseMintermInput(
  expression: string,
  explicitVariableLabels: string[] | null
): Extract<FormulaInput, { kind: "minterms" }> | null {
  const mintermMatch = expression.match(/(?:\u03a3|sigma|sum)?\s*m\s*\(([^)]*)\)/i);
  if (!mintermMatch) {
    return null;
  }

  const dontCareMatch = expression.match(/(?:d|dc|x)\s*\(([^)]*)\)/i);

  return {
    kind: "minterms",
    minterms: parseTermIndexes(mintermMatch[1], "minterm"),
    dontCares: dontCareMatch ? parseTermIndexes(dontCareMatch[1], "don't-care") : [],
    explicitVariableLabels
  };
}

function parseTermIndexes(source: string, label: string): number[] {
  if (!source.trim()) return [];

  const indexes = source
    .split(/[,\s]+/)
    .filter(Boolean)
    .flatMap((part) => {
      const range = part.match(/^(\d+)-(\d+)$/);
      if (!range) {
        const value = Number(part);
        if (!Number.isInteger(value) || value < 0) {
          throw new Error(`Invalid ${label} index "${part}".`);
        }
        return [value];
      }

      const start = Number(range[1]);
      const end = Number(range[2]);
      if (end < start) {
        throw new Error(`Invalid ${label} range "${part}".`);
      }

      return Array.from({ length: end - start + 1 }, (_, index) => start + index);
    });

  return [...new Set(indexes)].sort((left, right) => left - right);
}

function evaluateMintermInput(
  input: Extract<FormulaInput, { kind: "minterms" }>
): FormulaEvaluation {
  const highestIndex = Math.max(0, ...input.minterms, ...input.dontCares);
  const inferredVariableCount = Math.max(
    MIN_VARIABLE_COUNT,
    Math.ceil(Math.log2(highestIndex + 1))
  );
  const variableCount = validateVariableCount(
    input.explicitVariableLabels?.length ?? inferredVariableCount
  );
  const rowCount = 1 << variableCount;
  const values: OutputValue[] = Array.from({ length: rowCount }, () => "0");

  for (const index of input.dontCares) {
    validateTermIndex(index, rowCount, "don't-care");
    values[index] = "X";
  }

  for (const index of input.minterms) {
    validateTermIndex(index, rowCount, "minterm");
    values[index] = "1";
  }

  return {
    variableCount,
    variableLabels: labelsFromExplicitHeader(input.explicitVariableLabels),
    values
  };
}

function labelsFromExplicitHeader(
  explicitVariableLabels: string[] | null
): Record<LogicVariable, string> {
  const labels = Object.fromEntries(
    LOGIC_VARIABLES.map((variable) => [variable, variable])
  ) as Record<LogicVariable, string>;

  explicitVariableLabels?.forEach((label, index) => {
    labels[LOGIC_VARIABLES[index]] = label;
  });

  return labels;
}

function validateVariableCount(count: number): VariableCount {
  if (count < MIN_VARIABLE_COUNT || count > MAX_VARIABLE_COUNT) {
    throw new Error(
      `This workspace supports ${MIN_VARIABLE_COUNT} to ${MAX_VARIABLE_COUNT} variables.`
    );
  }

  return count as VariableCount;
}

function validateTermIndex(index: number, rowCount: number, label: string) {
  if (index >= rowCount) {
    throw new Error(
      `${label} index ${index} does not fit in ${Math.log2(rowCount)} variables.`
    );
  }
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
  private readonly explicitVariableCount: number | null;
  private readonly protectedVariables: Set<LogicVariable>;

  constructor(
    variableLabels: FormulaVariableLabels,
    options: {
      explicitVariableLabels?: string[] | null;
      protectedVariables?: Set<LogicVariable>;
    } = {}
  ) {
    this.explicitVariableCount = options.explicitVariableLabels?.length ?? null;
    this.protectedVariables = options.protectedVariables ?? new Set();

    if (options.explicitVariableLabels) {
      options.explicitVariableLabels.forEach((rawLabel, index) => {
        const variable = LOGIC_VARIABLES[index];
        const label = sanitizeAutoVariableLabel(rawLabel) || variable;
        const alias = normalizeVariableAlias(label);
        const existing = this.aliases.get(alias);

        if (existing && existing !== variable) {
          throw new Error("Variable names in the function header must be unique.");
        }

        this.labels[variable] = label;
        this.aliases.set(alias, variable);
      });
      return;
    }

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

  hasAlias(word: string): boolean {
    const alias = normalizeVariableAlias(word);
    return this.aliases.has(alias) || this.dynamicAliases.has(alias);
  }

  resolveDynamic(word: string): LogicVariable {
    if (this.explicitVariableCount !== null) {
      throw new Error(`"${word}" is not listed in the function header.`);
    }

    const alias = normalizeVariableAlias(word);
    const existing = this.dynamicAliases.get(alias);

    if (existing) {
      this.usedVariables.add(existing);
      return existing;
    }

    const nextVariable =
      LOGIC_VARIABLES.find(
        (variable) =>
          !this.usedVariables.has(variable) &&
          !this.protectedVariables.has(variable)
      ) ??
      LOGIC_VARIABLES.find((variable) => !this.usedVariables.has(variable));

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
      } else if (shouldSplitImplicitVariables(rawWord, variableResolver)) {
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

function collectProtectedBuiltIns(expression: string): Set<LogicVariable> {
  const protectedVariables = new Set<LogicVariable>();
  const words = expression.match(/[A-Za-z][A-Za-z0-9_]*/g) ?? [];
  const singleCustomWords = new Set(
    words
      .map((word) => word.toUpperCase())
      .filter(
        (word) =>
          word.length === 1 &&
          !RESERVED_WORDS.has(word) &&
          !LOGIC_VARIABLES.includes(word as LogicVariable)
      )
  );

  for (const word of words) {
    const upperWord = word.toUpperCase();
    if (RESERVED_WORDS.has(upperWord)) continue;

    if (word.length === 1 && LOGIC_VARIABLES.includes(upperWord as LogicVariable)) {
      protectedVariables.add(upperWord as LogicVariable);
      continue;
    }

    if (
      word.length > 1 &&
      [...upperWord].every((char) => LOGIC_VARIABLES.includes(char as LogicVariable))
    ) {
      [...upperWord].forEach((char) =>
        protectedVariables.add(char as LogicVariable)
      );
      continue;
    }

    if (
      word.length > 1 &&
      singleCustomWords.has(upperWord[0]) &&
      [...upperWord.slice(1)].every((char) =>
        LOGIC_VARIABLES.includes(char as LogicVariable)
      )
    ) {
      [...upperWord.slice(1)].forEach((char) =>
        protectedVariables.add(char as LogicVariable)
      );
    }
  }

  return protectedVariables;
}

function shouldSplitImplicitVariables(
  word: string,
  variableResolver: VariableResolver
): boolean {
  return (
    word.length > 1 &&
    [...word].every((char) => variableResolver.hasAlias(char))
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
