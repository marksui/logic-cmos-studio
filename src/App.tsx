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
import { APP_VERSION } from "./version";
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
type CopyState = "idle" | "copied" | "failed";

const GITHUB_PAGES_URL = "https://marksui.github.io/logic-cmos-studio/";
const FORMULA_EXAMPLES = ["A'B + AC", "A xor B", "A xnor B", "A nand B", "A nor B"];

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
  const [copyState, setCopyState] = useState<CopyState>("idle");

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
  const outputSummary = useMemo(() => countOutputs(values), [values]);

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
    try {
      await navigator.clipboard.writeText(verilogBundle);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    window.setTimeout(() => setCopyState("idle"), 1400);
  }

  return (
    <main className="app-shell min-h-screen overflow-x-hidden text-slate-900">
      <header className="border-b border-white/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-slate-950 text-sm font-bold text-white shadow-soft">
              LC
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-normal text-slate-950">
                  Logic & CMOS Studio
                </h1>
                <span className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 font-mono text-xs font-bold text-sky-700">
                  {APP_VERSION}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Boolean logic, Karnaugh maps, universal gates, and CMOS sizing in one workspace.
              </p>
            </div>
          </div>

          <div className="relative flex flex-wrap items-center gap-2">
            <a
              href={GITHUB_PAGES_URL}
              target="_blank"
              rel="noreferrer"
              className="control-button py-1.5 text-xs"
            >
              GitHub Pages
            </a>
            <button
              type="button"
              onClick={() => setGuideOpen((open) => !open)}
              className="control-button py-1.5 text-xs"
              aria-expanded={guideOpen}
            >
              Guide
            </button>
            {guideOpen && (
              <div className="absolute right-0 top-11 z-30 w-[min(560px,calc(100vw-32px))] rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-soft">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                    Formula Guide
                  </h2>
                  <button
                    type="button"
                    onClick={() => setGuideOpen(false)}
                    className="rounded-md px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30"
                  >
                    Close
                  </button>
                </div>
                <div className="mt-3 grid gap-2 leading-6">
                  <p>
                    Try <code>A&apos;B + AC</code>, <code>A xor B</code>,{" "}
                    <code>A xnor B</code>, <code>A nand B</code>, or{" "}
                    <code>A nor B</code>.
                  </p>
                  <p>
                    Gate names can be typed as words: <code>A and B</code>,{" "}
                    <code>A or B</code>, <code>A nand B</code>, <code>A nor B</code>,{" "}
                    <code>A xor B</code>, and <code>A xnor B</code>. For NOT, use{" "}
                    <code>~A</code>, <code>not A</code>, or <code>A&apos;</code>.
                  </p>
                  <p>
                    Click output cells in the truth table or K-map to cycle 0, 1, and X.
                    X is treated as a don&apos;t-care.
                  </p>
                  <p>
                    Renamed inputs can be used directly in formulas, for example{" "}
                    <code>A xor B xor Cin</code>. A, B, C, and D stay available as aliases.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatusCard
            label="Inputs"
            value={`${variableCount} variables`}
            detail={activeDisplayLabels.join(", ")}
            tone="sky"
          />
          <StatusCard
            label="Truth rows"
            value={`${truthRows.length}`}
            detail={`${outputSummary.ones} one, ${outputSummary.zeros} zero, ${outputSummary.dontCares} X`}
            tone="emerald"
          />
          <StatusCard
            label="SOP terms"
            value={`${result.terms.length}`}
            detail={formatSet(result.minterms)}
            tone="amber"
          />
          <StatusCard
            label="CMOS devices"
            value={`${cmosPlan.transistorCount}`}
            detail={cmosPlan.coreGateName}
            tone="rose"
          />
        </section>

        <section className="surface-card relative mb-5 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
              Formula
            </h2>
            <button
              type="button"
              onClick={() => setPresetsOpen((open) => !open)}
              className="control-button py-1.5 text-xs"
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
                      className={`rounded-md border px-2 py-2 text-xs font-semibold transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30 ${
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
                    className="rounded px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30"
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
                        className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm font-semibold text-slate-700 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-sky-500/20"
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
                    className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-left transition hover:border-slate-300 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30"
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
                  className="rounded-md border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30"
                >
                  Clear
                </button>
                {(["0", "1", "X"] as OutputValue[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => fillOutputs(value)}
                    className="rounded-md border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30"
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
                className={`w-full rounded-md border bg-white px-3 py-2.5 font-mono text-sm text-slate-800 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-sky-500/20 ${
                  formulaError ? "border-rose-300" : "border-slate-200"
                }`}
                placeholder="A'B + AC"
                aria-label="Boolean formula"
                aria-invalid={Boolean(formulaError)}
              />
              <button
                type="submit"
                className="control-button-dark"
              >
                Generate
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {FORMULA_EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => {
                    setFormulaInput(example);
                    setFormulaError("");
                  }}
                  className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-600 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30"
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
              <p
                className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700"
                role="alert"
              >
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
            <section className="surface-card p-4">
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
                      className={`rounded px-2.5 py-1 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30 ${
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
                <section className="surface-card p-4">
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

                <section className="surface-card p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                      Verilog
                    </h2>
                    <button
                      type="button"
                      onClick={copyVerilog}
                      className="control-button py-1.5 text-xs"
                    >
                      {copyState === "copied"
                        ? "Copied"
                        : copyState === "failed"
                          ? "Copy failed"
                          : "Copy"}
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
            <section className="surface-card p-4">
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

function StatusCard({
  detail,
  label,
  tone,
  value
}: {
  detail: string;
  label: string;
  tone: "sky" | "emerald" | "amber" | "rose";
  value: string;
}) {
  const toneClass = {
    sky: "border-sky-200 bg-sky-50 text-sky-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    rose: "border-rose-200 bg-rose-50 text-rose-700"
  }[tone];

  return (
    <div className="surface-card p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          {label}
        </span>
        <span className={`h-2.5 w-2.5 rounded-full border ${toneClass}`} />
      </div>
      <div className="mt-2 truncate text-xl font-bold text-slate-950">{value}</div>
      <div className="mt-1 truncate font-mono text-xs text-slate-500">{detail}</div>
    </div>
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
    <div className="sticky top-3 z-10 mb-5 grid gap-2 rounded-lg border border-slate-200 bg-white/90 p-1 shadow-soft backdrop-blur sm:grid-cols-2">
      {(["logic", "cmos"] as Workspace[]).map((workspace) => {
        const active = workspace === activeWorkspace;
        const label = workspace === "logic" ? "Logic" : "CMOS";

        return (
          <button
            key={workspace}
            type="button"
            onClick={() => onChange(workspace)}
            className={`rounded-md px-4 py-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30 ${
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

function countOutputs(values: OutputValue[]) {
  return values.reduce(
    (counts, value) => {
      if (value === "1") counts.ones += 1;
      else if (value === "X") counts.dontCares += 1;
      else counts.zeros += 1;
      return counts;
    },
    { dontCares: 0, ones: 0, zeros: 0 }
  );
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

  return parts.join(usesCustomName ? "*" : "");
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
