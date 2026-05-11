import { useMemo, useState, type ReactNode } from "react";
import { CMOSPanel } from "./components/CMOSPanel";
import { GateDiagram, type GateWireStyle } from "./components/GateDiagram";
import { KMapPanel } from "./components/KMapPanel";
import { LogicGateReview } from "./components/LogicGateReview";
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
type Workspace = "logic" | "cmos" | "review";
type CopyState = "idle" | "copied" | "failed";
type LogicPanelId =
  | "diagram"
  | "kmap"
  | "forms"
  | "verilog"
  | "universal"
  | "truth";
type CmosPanelId = "overview" | "networks" | "sizing" | "schematic" | "netlist";
type PanelVisibility<T extends string> = Record<T, boolean>;

const FORMULA_EXAMPLES = [
  "buffer A",
  "not A",
  "A and B",
  "A or B",
  "A xor B",
  "A xnor B",
  "A nand B",
  "A nor B",
  "SA + SB"
];
const DEFAULT_LOGIC_PANELS: PanelVisibility<LogicPanelId> = {
  diagram: true,
  forms: true,
  kmap: true,
  truth: false,
  universal: false,
  verilog: false
};
const DEFAULT_CMOS_PANELS: PanelVisibility<CmosPanelId> = {
  netlist: false,
  networks: false,
  overview: true,
  schematic: true,
  sizing: false
};
const LOGIC_PANEL_OPTIONS: { id: LogicPanelId; label: string }[] = [
  { id: "diagram", label: "Gate diagram" },
  { id: "kmap", label: "K-map" },
  { id: "forms", label: "SOP / POS" },
  { id: "verilog", label: "Verilog" },
  { id: "universal", label: "Universal gates" },
  { id: "truth", label: "Truth table" }
];
const CMOS_PANEL_OPTIONS: { id: CmosPanelId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "networks", label: "Pull networks" },
  { id: "sizing", label: "Sizing" },
  { id: "schematic", label: "Schematic" },
  { id: "netlist", label: "Netlist" }
];

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
  const [displayOpen, setDisplayOpen] = useState(false);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace>("logic");
  const [logicPanels, setLogicPanels] =
    useState<PanelVisibility<LogicPanelId>>(DEFAULT_LOGIC_PANELS);
  const [cmosPanels, setCmosPanels] =
    useState<PanelVisibility<CmosPanelId>>(DEFAULT_CMOS_PANELS);
  const [inputLabels, setInputLabels] =
    useState<Record<LogicVariable, string>>(DEFAULT_INPUT_LABELS);
  const [gateWireStyle, setGateWireStyle] = useState<GateWireStyle>("straight");
  const [includeOutputInverter, setIncludeOutputInverter] = useState(false);
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
  const showLogicMiddleRow = logicPanels.kmap || logicPanels.forms || logicPanels.verilog;
  const showLogicSideColumn = logicPanels.forms || logicPanels.verilog;
  const hasLogicContent =
    logicPanels.diagram ||
    showLogicMiddleRow ||
    logicPanels.universal ||
    logicPanels.truth;
  const hasCmosContent = Object.values(cmosPanels).some(Boolean);

  function toggleLogicPanel(panel: LogicPanelId) {
    setLogicPanels((current) => ({ ...current, [panel]: !current[panel] }));
  }

  function toggleCmosPanel(panel: CmosPanelId) {
    setCmosPanels((current) => ({ ...current, [panel]: !current[panel] }));
  }

  function resetDisplay() {
    if (activeWorkspace === "logic") {
      setLogicPanels(DEFAULT_LOGIC_PANELS);
    } else {
      setCmosPanels(DEFAULT_CMOS_PANELS);
    }
  }

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
      setInputLabels(evaluation.variableLabels);
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
        <div className="mx-auto flex max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
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
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <WorkspaceTabs
          activeWorkspace={activeWorkspace}
          cmosPanels={cmosPanels}
          displayOpen={displayOpen}
          logicPanels={logicPanels}
          onChange={setActiveWorkspace}
          onDisplayOpenChange={setDisplayOpen}
          onResetDisplay={resetDisplay}
          onToggleCmosPanel={toggleCmosPanel}
          onToggleLogicPanel={toggleLogicPanel}
        />

        {activeWorkspace !== "review" && (
        <section className="surface-card relative mb-5 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
              Formula
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setGuideOpen(true);
                  setPresetsOpen(false);
                }}
                className="control-button py-1.5 text-xs"
              >
                Guide
              </button>
              <button
                type="button"
                onClick={() => setPresetsOpen((open) => !open)}
                className="control-button py-1.5 text-xs"
                aria-expanded={presetsOpen}
              >
                Presets
              </button>
            </div>
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
                  Use these names or type new ones in formulas. A-D still work too.
                </p>
              </div>
              <div className="my-3 h-px bg-slate-100" />
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Examples
              </span>
              <div className="flex flex-wrap gap-2">
                {FORMULA_EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => {
                      setFormulaInput(example);
                      setFormulaError("");
                      setPresetsOpen(false);
                    }}
                    className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-600 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30"
                  >
                    {example}
                  </button>
                ))}
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
            <p className="text-xs font-medium text-slate-500">
              Use variables:{" "}
              <code className="text-slate-700">{activeDisplayLabels.join(", ")}</code>
              <span className="ml-1 text-slate-400">
                or new names, up to 4 inputs
              </span>
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
        )}

        {guideOpen && <FormulaGuideDialog onClose={() => setGuideOpen(false)} />}

        {activeWorkspace === "logic" ? (
          <>
            {!hasLogicContent && <EmptyView workspace="Logic" />}

            {logicPanels.diagram && (
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
            )}

            {showLogicMiddleRow && (
              <div
                className={`mt-5 grid min-w-0 gap-5 ${
                  logicPanels.kmap && showLogicSideColumn
                    ? "xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]"
                    : ""
                }`}
              >
                {logicPanels.kmap && (
                  <section className="min-w-0">
                    <KMapPanel
                      result={result}
                      onToggle={handleToggle}
                      variableLabels={displayLabels}
                    />
                  </section>
                )}

                {showLogicSideColumn && (
                  <div className="grid min-w-0 gap-5">
                    {logicPanels.forms && (
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
                    )}

                    {logicPanels.verilog && (
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
                    )}
                  </div>
                )}
              </div>
            )}

            {logicPanels.universal && (
              <div className="mt-5">
                <UniversalGatesPanel
                  conversions={gateConversions}
                  variableLabels={displayLabels}
                />
              </div>
            )}

            {logicPanels.truth && (
              <div className="mt-5">
                <TruthTable
                  variables={variables}
                  labels={activeDisplayLabels}
                  rows={truthRows}
                  onToggle={handleToggle}
                />
              </div>
            )}
          </>
        ) : activeWorkspace === "cmos" ? (
          <div className="space-y-5">
            {!hasCmosContent ? (
              <EmptyView workspace="CMOS" />
            ) : (
              <CMOSPanel
                includeOutputInverter={includeOutputInverter}
                onIncludeOutputInverterChange={setIncludeOutputInverter}
                plan={cmosPlan}
                visibleSections={cmosPanels}
              />
            )}
          </div>
        ) : (
          <LogicGateReview />
        )}
      </div>
    </main>
  );
}
function EmptyView({ workspace }: { workspace: Workspace | "Logic" | "CMOS" }) {
  return (
    <section className="surface-card p-6 text-center">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        No {workspace} panels selected
      </h2>
      <p className="mt-2 text-sm text-slate-500">
        Open Display to choose what appears here.
      </p>
    </section>
  );
}

function FormulaGuideDialog({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 px-4 py-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="formula-guide-title"
        aria-modal="true"
        className="w-full max-w-2xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-soft"
        role="dialog"
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <h2
            id="formula-guide-title"
            className="text-sm font-semibold uppercase tracking-wide text-slate-600"
          >
            Formula Guide
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30"
          >
            Close
          </button>
        </div>
        <div className="max-h-[calc(100vh-112px)] overflow-y-auto px-4 py-4 text-sm leading-6 text-slate-600">
          <div className="grid gap-3">
            <GuideRow
              label="Basic form"
              value={
                <>
                  Try <code>buffer A</code>, <code>not A</code>,{" "}
                  <code>A xor B</code>, <code>A xnor B</code>,{" "}
                  <code>A nand B</code>, or <code>A nor B</code>.
                </>
              }
            />
            <GuideRow
              label="Gate words"
              value={
                <>
                  Use <code>buffer</code>, <code>and</code>, <code>or</code>,{" "}
                  <code>nand</code>, <code>nor</code>, <code>xor</code>, and{" "}
                  <code>xnor</code>.
                </>
              }
            />
            <GuideRow
              label="NOT"
              value={
                <>
                  Write <code>~A</code>, <code>not A</code>, or{" "}
                  <code>A&apos;</code>.
                </>
              }
            />
            <GuideRow
              label="Custom inputs"
              value={
                <>
                  Type names directly, for example <code>SA + SB</code>,{" "}
                  <code>S xor A</code>, or <code>Cin xor Sum</code>. New names
                  map to the next free input, up to 4 total.
                </>
              }
            />
            <GuideRow
              label="Don't-care"
              value={
                <>
                  Click output cells in the K-map or truth table to cycle 0, 1,
                  and X. X is treated as a don&apos;t-care.
                </>
              }
            />
            <GuideRow
              label="Display"
              value="Use Display to keep only the panels you need on screen."
            />
            <GuideRow
              label="Review"
              value="Open Review to see every supported gate symbol with its truth table."
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function GuideRow({
  label,
  value
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <span className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <div className="mt-1 text-slate-600">{value}</div>
    </div>
  );
}

function WorkspaceTabs({
  activeWorkspace,
  cmosPanels,
  displayOpen,
  logicPanels,
  onChange,
  onDisplayOpenChange,
  onResetDisplay,
  onToggleCmosPanel,
  onToggleLogicPanel
}: {
  activeWorkspace: Workspace;
  cmosPanels: PanelVisibility<CmosPanelId>;
  displayOpen: boolean;
  logicPanels: PanelVisibility<LogicPanelId>;
  onChange: (workspace: Workspace) => void;
  onDisplayOpenChange: (open: boolean) => void;
  onResetDisplay: () => void;
  onToggleCmosPanel: (panel: CmosPanelId) => void;
  onToggleLogicPanel: (panel: LogicPanelId) => void;
}) {
  const hasDisplayControls = activeWorkspace !== "review";
  const activeOptions =
    activeWorkspace === "logic"
      ? LOGIC_PANEL_OPTIONS
      : activeWorkspace === "cmos"
        ? CMOS_PANEL_OPTIONS
        : [];
  const activePanels = activeWorkspace === "logic" ? logicPanels : cmosPanels;
  const selectedCount = hasDisplayControls
    ? Object.values(activePanels).filter(Boolean).length
    : 0;

  return (
    <div className="sticky top-3 z-10 mb-5 rounded-lg border border-slate-200 bg-white/90 p-1 shadow-soft backdrop-blur">
      <div
        className={`grid gap-2 ${
          hasDisplayControls ? "sm:grid-cols-[minmax(0,1fr)_132px]" : ""
        }`}
      >
        <div className="grid gap-2 sm:grid-cols-3">
          {(["logic", "cmos", "review"] as Workspace[]).map((workspace) => {
            const active = workspace === activeWorkspace;
            const label =
              workspace === "logic"
                ? "Logic"
                : workspace === "cmos"
                  ? "CMOS"
                  : "Review";

            return (
              <button
                key={workspace}
                type="button"
                onClick={() => {
                  onChange(workspace);
                  onDisplayOpenChange(false);
                }}
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

        {hasDisplayControls && (
        <div className="relative">
          <button
            type="button"
            onClick={() => onDisplayOpenChange(!displayOpen)}
            className="h-full w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30"
            aria-expanded={displayOpen}
          >
            Display {selectedCount}
          </button>
          {displayOpen && (
            <div className="absolute right-0 top-12 z-30 w-[min(320px,calc(100vw-32px))] rounded-lg border border-slate-200 bg-white p-3 shadow-soft">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Visible Panels
                </span>
                <button
                  type="button"
                  onClick={onResetDisplay}
                  className="rounded px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30"
                >
                  Reset
                </button>
              </div>
              <div className="grid gap-2">
                {activeOptions.map((option) => {
                  const checked =
                    activeWorkspace === "logic"
                      ? logicPanels[option.id as LogicPanelId]
                      : cmosPanels[option.id as CmosPanelId];

                  return (
                    <label
                      key={option.id}
                      className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-white"
                    >
                      <span>{option.label}</span>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          if (activeWorkspace === "logic") {
                            onToggleLogicPanel(option.id as LogicPanelId);
                          } else {
                            onToggleCmosPanel(option.id as CmosPanelId);
                          }
                        }}
                        className="h-4 w-4 accent-slate-950"
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        )}
      </div>
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
