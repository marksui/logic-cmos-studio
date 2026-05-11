import { useMemo, useState } from "react";
import { CMOSPanel } from "./components/CMOSPanel";
import { GateDiagram, type GateWireStyle } from "./components/GateDiagram";
import { KMapPanel } from "./components/KMapPanel";
import { TruthTable } from "./components/TruthTable";
import { UniversalGatesPanel } from "./components/UniversalGatesPanel";
import { buildCmosPlan } from "./logic/cmos";
import { evaluateFormula } from "./logic/formula";
import { getVariables, makeTruthRows } from "./logic/kmap";
import { PRESETS, type Preset } from "./logic/presets";
import {
  nextOutputValue,
  normalizeValues,
  simplifyPos,
  simplifySop
} from "./logic/simplify";
import { buildUniversalGateConversions } from "./logic/universalGates";
import type {
  LogicVariable,
  OutputValue,
  PosSimplificationResult,
  ProductLiteral,
  SimplificationResult,
  VariableCount
} from "./logic/types";

const VARIABLE_COUNTS: VariableCount[] = [2, 3, 4];
const DEFAULT_PRESET = PRESETS.find((preset) => preset.id === "majority")!;
type Workspace = "logic" | "cmos";

const DEFAULT_INPUT_LABELS: Record<LogicVariable, string> = {
  A: "A",
  B: "B",
  C: "C",
  D: "D"
};

export default function App() {
  const [variableCount, setVariableCount] = useState<VariableCount>(
    DEFAULT_PRESET.variableCount
  );
  const [rawValues, setRawValues] = useState<OutputValue[]>(
    DEFAULT_PRESET.makeValues()
  );
  const [formulaInput, setFormulaInput] = useState(DEFAULT_PRESET.formula);
  const [formulaError, setFormulaError] = useState("");
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace>("logic");
  const [inputLabels, setInputLabels] =
    useState<Record<LogicVariable, string>>(DEFAULT_INPUT_LABELS);
  const [gateWireStyle, setGateWireStyle] = useState<GateWireStyle>("straight");
  const [includeOutputInverter, setIncludeOutputInverter] = useState(true);
  const [copied, setCopied] = useState(false);

  const values = useMemo(
    () => normalizeValues(variableCount, rawValues),
    [variableCount, rawValues]
  );
  const variables = useMemo(() => getVariables(variableCount), [variableCount]);
  const displayLabels = useMemo(
    () => normalizeInputLabels(inputLabels),
    [inputLabels]
  );
  const activeDisplayLabels = useMemo(
    () => variables.map((variable) => displayLabels[variable]),
    [displayLabels, variables]
  );
  const truthRows = useMemo(
    () => makeTruthRows(variableCount, values),
    [variableCount, values]
  );
  const result = useMemo(
    () => simplifySop(variableCount, values),
    [variableCount, values]
  );
  const posResult = useMemo(
    () => simplifyPos(variableCount, values),
    [variableCount, values]
  );
  const cmosPlan = useMemo(
    () => buildCmosPlan(result, { includeOutputInverter }),
    [includeOutputInverter, result]
  );
  const gateConversions = useMemo(
    () => buildUniversalGateConversions(result, posResult),
    [posResult, result]
  );
  const displaySopExpression = useMemo(
    () => formatSopExpression(result, displayLabels),
    [displayLabels, result]
  );
  const displayPosExpression = useMemo(
    () => formatPosExpression(posResult, displayLabels),
    [displayLabels, posResult]
  );
  const verilogBundle = useMemo(
    () =>
      [
        replaceVerilogVariables(result.verilogAssign, displayLabels),
        `assign F_pos = ${replaceVerilogVariables(
          posResult.verilogExpression,
          displayLabels
        )};`,
        replaceVerilogVariables(gateConversions.nand.verilogAssign, displayLabels),
        replaceVerilogVariables(gateConversions.nor.verilogAssign, displayLabels)
      ].join("\n"),
    [displayLabels, gateConversions, posResult.verilogExpression, result.verilogAssign]
  );

  function handleVariableCountChange(nextCount: VariableCount) {
    setVariableCount(nextCount);
    setRawValues((current) => normalizeValues(nextCount, current));
  }

  function handleToggle(minterm: number) {
    setRawValues((current) => {
      const next = normalizeValues(variableCount, current);
      next[minterm] = nextOutputValue(next[minterm]);
      return next;
    });
  }

  function handleInputLabelChange(variable: LogicVariable, value: string) {
    setInputLabels((current) => ({
      ...current,
      [variable]: sanitizeVariableLabel(value)
    }));
  }

  function resetInputLabels() {
    setInputLabels(DEFAULT_INPUT_LABELS);
  }

  function fillOutputs(value: OutputValue) {
    setRawValues(Array.from({ length: 1 << variableCount }, () => value));
    setFormulaError("");
    setPresetsOpen(false);
  }

  function applyPreset(preset: Preset) {
    setVariableCount(preset.variableCount);
    setRawValues(preset.makeValues());
    setFormulaInput(preset.formula);
    setFormulaError("");
    setPresetsOpen(false);
  }

  function applyFormula() {
    try {
      const evaluation = evaluateFormula(formulaInput, variableCount, displayLabels);
      setVariableCount(evaluation.variableCount);
      setRawValues(evaluation.values);
      setFormulaError("");
      setPresetsOpen(false);
    } catch (error) {
      setFormulaError(
        error instanceof Error ? error.message : "Could not parse the formula."
      );
    }
  }

  async function copyVerilog() {
    await navigator.clipboard.writeText(verilogBundle);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f5f7fb] text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-5 sm:px-6 lg:px-8">
          <div className="relative">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-normal text-slate-950">
                Logic & CMOS Studio
              </h1>
              <button
                type="button"
                onClick={() => setGuideOpen((open) => !open)}
                className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-white"
                aria-expanded={guideOpen}
              >
                Guide
              </button>
            </div>
            {guideOpen && (
              <div className="absolute left-0 top-12 z-30 w-[min(560px,calc(100vw-32px))] rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-soft">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                    Quick Guide
                  </h2>
                  <button
                    type="button"
                    onClick={() => setGuideOpen(false)}
                    className="rounded-md px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-50"
                  >
                    Close
                  </button>
                </div>
                <div className="mt-3 grid gap-2 leading-6">
                  <p>
                    Enter a Boolean formula such as <code>A&apos;B + AC</code> or{" "}
                    <code>A xor B</code>, <code>A xnor B</code>,{" "}
                    <code>A nand B</code>, or <code>A nor B</code>, then click
                    Generate.
                  </p>
                  <p>
                    No special keyboard symbols are needed. Type gate names as words:
                    <code> A and B</code>, <code>A or B</code>, <code>A nand B</code>,{" "}
                    <code>A nor B</code>, <code>A xor B</code>, and{" "}
                    <code>A xnor B</code>. For NOT, use <code>~A</code>,{" "}
                    <code>not A</code>, or <code>A&apos;</code>.
                  </p>
                  <p>
                    Pasted textbook symbols also work: <code>⊕</code> for XOR,{" "}
                    <code>⊙</code> for XNOR, <code>↑</code> for NAND,{" "}
                    <code>↓</code> for NOR, and <code>¬</code> for NOT.
                  </p>
                  <p>
                    Use Presets to choose 2, 3, or 4 variables, rename the variable
                    identifiers, load examples, or fill the truth table with 0, 1,
                    or X.
                  </p>
                  <p>
                    Click truth-table or K-map output cells to cycle 0 to 1 to X. X
                    means don&apos;t-care.
                  </p>
                  <p>
                    Logic view reports minimized SOP/POS plus NAND+INV and NOR+INV
                    conversions. CMOS view adds transistor sizing, skew, path
                    resistance, and input-capacitance estimates.
                  </p>
                  <p>
                    Custom variable names can be used directly in formulas, for example
                    rename C to Cin and enter <code>A xor B xor Cin</code>. A, B, C,
                    and D still work as internal aliases.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <section className="relative mb-5 rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
              Formula
            </h2>
            <button
              type="button"
              onClick={() => setPresetsOpen((open) => !open)}
              className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-white"
              aria-expanded={presetsOpen}
            >
              Presets
            </button>
          </div>
          {presetsOpen && (
            <div className="absolute right-4 top-12 z-20 w-[min(320px,calc(100vw-48px))] rounded-lg border border-slate-200 bg-white p-3 shadow-soft">
              <div>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Variables
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {VARIABLE_COUNTS.map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => {
                        handleVariableCountChange(count);
                        setPresetsOpen(false);
                      }}
                      className={`rounded-md border px-2 py-2 text-xs font-semibold transition hover:bg-slate-50 ${
                        count === variableCount
                          ? "border-slate-900 bg-slate-900 text-white hover:bg-slate-900"
                          : "border-slate-200 text-slate-600"
                      }`}
                    >
                      {count} vars
                    </button>
                  ))}
                </div>
              </div>
              <div className="my-3 h-px bg-slate-100" />
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Use variables
                  </span>
                  <button
                    type="button"
                    onClick={resetInputLabels}
                    className="rounded px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-50"
                  >
                    Reset
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {variables.map((variable) => (
                    <label
                      key={variable}
                      className="rounded-md border border-slate-200 bg-slate-50 px-2 py-2"
                    >
                      <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        {variable} name
                      </span>
                      <input
                        value={inputLabels[variable]}
                        onChange={(event) =>
                          handleInputLabelChange(variable, event.target.value)
                        }
                        maxLength={8}
                        className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm font-semibold text-slate-700 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                        aria-label={`${variable} variable name`}
                      />
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-400">
                  Use these names in formulas. A, B, C, and D still work too.
                </p>
              </div>
              <div className="my-3 h-px bg-slate-100" />
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Presets
              </span>
              <div className="grid gap-2">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-left transition hover:border-slate-300 hover:bg-white"
                  >
                    <span className="block text-sm font-semibold text-slate-800">
                      {preset.name}
                    </span>
                    <code className="mt-1 block text-xs text-slate-500">
                      {preset.formula}
                    </code>
                  </button>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => fillOutputs("0")}
                  className="rounded-md border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  Clear
                </button>
                {(["0", "1", "X"] as OutputValue[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => fillOutputs(value)}
                    className="rounded-md border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    All {value}
                  </button>
                ))}
              </div>
            </div>
          )}
          <form
            className="mt-3 grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              applyFormula();
            }}
          >
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_132px]">
              <input
                value={formulaInput}
                onChange={(event) => setFormulaInput(event.target.value)}
                className={`w-full rounded-md border bg-white px-3 py-2 font-mono text-sm text-slate-800 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 ${
                  formulaError ? "border-rose-300" : "border-slate-200"
                }`}
                placeholder="A'B + AC"
                aria-label="Boolean formula"
              />
              <button
                type="submit"
                className="rounded-md border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-px hover:shadow-sm"
              >
                Generate
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {["A'B + AC", "A xor B", "A xnor B", "A nand B", "A nor B"].map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => {
                    setFormulaInput(example);
                    setFormulaError("");
                  }}
                  className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-600 transition hover:bg-white"
                >
                  {example}
                </button>
              ))}
            </div>
            <p className="text-xs font-medium text-slate-500">
              Use variables:{" "}
              <code className="text-slate-700">{activeDisplayLabels.join(", ")}</code>
            </p>
            {formulaError && (
              <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
                {formulaError}
              </p>
            )}
          </form>
        </section>

        <WorkspaceTabs
          activeWorkspace={activeWorkspace}
          onChange={setActiveWorkspace}
        />

        {activeWorkspace === "logic" ? (
          <>
            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                  Gate Diagram
                </h2>
                <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-1">
                  {([
                    ["curved", "Curve"],
                    ["straight", "Straight"]
                  ] as [GateWireStyle, string][]).map(([style, label]) => (
                    <button
                      key={style}
                      type="button"
                      onClick={() => setGateWireStyle(style)}
                      className={`rounded px-2.5 py-1 text-xs font-semibold transition ${
                        gateWireStyle === style
                          ? "bg-white text-slate-900 shadow-sm"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <GateDiagram
                variableCount={variableCount}
                terms={result.terms}
                expression={result.expression}
                wireStyle={gateWireStyle}
                variableLabels={displayLabels}
              />
            </section>

            <div className="mt-5 grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
              <section className="min-w-0">
            <KMapPanel
              result={result}
              onToggle={handleToggle}
              variableLabels={displayLabels}
            />
              </section>

              <div className="grid min-w-0 gap-5">
              <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                  SOP / POS Forms
                </h2>
                <div className="mt-4 grid gap-3">
                  <ExpressionBlock label="Minimized SOP" value={`F = ${displaySopExpression}`} />
                  <ExpressionBlock label="Minimized POS" value={`F = ${displayPosExpression}`} />
                </div>
                <div className="mt-4 grid gap-2 text-sm text-slate-600">
                  <Metric label="Minterms" value={formatSet(result.minterms)} />
                  <Metric label="Maxterms" value={formatMaxterms(posResult.maxterms)} />
                  <Metric label="Don't cares" value={formatSet(result.dontCares)} />
                  <Metric
                    label="SOP terms"
                    value={
                      result.terms
                        .map((term) => formatProductTerm(term.literals, displayLabels))
                        .join(", ") || "none"
                    }
                  />
                  <Metric
                    label="POS clauses"
                    value={
                      posResult.terms
                        .map((term) => formatSumTerm(term.literals, displayLabels))
                        .join(" ") || "none"
                    }
                  />
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                    Verilog
                  </h2>
                  <button
                    type="button"
                    onClick={copyVerilog}
                    className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <pre className="mt-4 whitespace-pre-wrap break-words rounded-lg bg-slate-950 p-4 text-sm leading-6 text-emerald-100">
                  <code>{verilogBundle}</code>
                </pre>
              </section>
            </div>
            </div>

            <div className="mt-5">
            <UniversalGatesPanel
              conversions={gateConversions}
              variableLabels={displayLabels}
            />
            </div>

        <div className="mt-5">
          <TruthTable
            variables={variables}
            labels={activeDisplayLabels}
            rows={truthRows}
            onToggle={handleToggle}
          />
        </div>
          </>
        ) : (
          <div className="space-y-5">
            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                  Current Logic
                </h2>
              </div>
              <div className="mt-4 grid gap-3 text-sm text-slate-600 lg:grid-cols-4">
                <Metric label="Simplified" value={`F = ${displaySopExpression}`} />
                <Metric label="POS" value={`F = ${displayPosExpression}`} />
                <Metric label="Core gate" value={cmosPlan.coreGateName} />
                <Metric label="Transistors" value={`${cmosPlan.transistorCount}`} />
              </div>
            </section>

            <CMOSPanel
              includeOutputInverter={includeOutputInverter}
              onIncludeOutputInverterChange={setIncludeOutputInverter}
              plan={cmosPlan}
            />
          </div>
        )}
      </div>
    </main>
  );
}

function WorkspaceTabs({
  activeWorkspace,
  onChange
}: {
  activeWorkspace: Workspace;
  onChange: (workspace: Workspace) => void;
}) {
  return (
    <div className="mb-5 grid gap-2 rounded-lg border border-slate-200 bg-white p-1 shadow-soft sm:grid-cols-2">
      {(["logic", "cmos"] as Workspace[]).map((workspace) => {
        const active = workspace === activeWorkspace;
        const label = workspace === "logic" ? "Logic" : "CMOS";

        return (
          <button
            key={workspace}
            type="button"
            onClick={() => onChange(workspace)}
            className={`rounded-md px-4 py-3 text-sm font-semibold transition ${
              active
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
            aria-pressed={active}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md bg-slate-50 px-3 py-2">
      <span className="font-medium text-slate-500">{label}</span>
      <code className="text-right text-slate-700">{value}</code>
    </div>
  );
}

function ExpressionBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <div className="rounded-lg bg-slate-950 px-4 py-4 text-white">
        <code className="break-words text-lg font-semibold">{value}</code>
      </div>
    </div>
  );
}

function formatSet(values: number[]): string {
  return values.length > 0 ? `m(${values.join(", ")})` : "none";
}

function formatMaxterms(values: number[]): string {
  return values.length > 0 ? `M(${values.join(", ")})` : "none";
}

function sanitizeVariableLabel(value: string): string {
  return value
    .replace(/\s+/g, "")
    .replace(/[^A-Za-z0-9_]/g, "")
    .replace(/^[^A-Za-z_]+/, "")
    .slice(0, 8);
}

function formatSopExpression(
  result: SimplificationResult,
  labels: Record<LogicVariable, string>
): string {
  if (result.expression === "0" || result.expression === "1") {
    return result.expression;
  }

  return result.terms
    .map((term) => formatProductTerm(term.literals, labels))
    .join(" + ");
}

function formatPosExpression(
  result: PosSimplificationResult,
  labels: Record<LogicVariable, string>
): string {
  if (result.expression === "0" || result.expression === "1") {
    return result.expression;
  }

  return result.terms.map((term) => formatSumTerm(term.literals, labels)).join("");
}

function formatProductTerm(
  literals: ProductLiteral[],
  labels: Record<LogicVariable, string>
): string {
  if (literals.length === 0) return "1";
  const parts = literals.map((literal) => formatLiteral(literal, labels));
  const usesCustomName = literals.some(
    (literal) => labels[literal.variable].length > 1
  );

  return parts.join(usesCustomName ? "·" : "");
}

function formatSumTerm(
  literals: ProductLiteral[],
  labels: Record<LogicVariable, string>
): string {
  if (literals.length === 0) return "0";
  return `(${literals
    .map((literal) => formatLiteral(literal, labels))
    .join(" + ")})`;
}

function formatLiteral(
  literal: ProductLiteral,
  labels: Record<LogicVariable, string>
): string {
  return `${labels[literal.variable]}${literal.negated ? "'" : ""}`;
}

function replaceVerilogVariables(
  expression: string,
  labels: Record<LogicVariable, string>
): string {
  return expression.replace(/\b[A-D]\b/g, (variable) => {
    const logicVariable = variable as LogicVariable;
    return labels[logicVariable] ?? variable;
  });
}

function normalizeInputLabels(
  labels: Record<LogicVariable, string>
): Record<LogicVariable, string> {
  return {
    A: sanitizeVariableLabel(labels.A) || "A",
    B: sanitizeVariableLabel(labels.B) || "B",
    C: sanitizeVariableLabel(labels.C) || "C",
    D: sanitizeVariableLabel(labels.D) || "D"
  };
}
