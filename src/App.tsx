import { useEffect, useMemo, useState } from "react";
import { CMOSPanel } from "./components/CMOSPanel";
import { GateDiagram, type GateWireStyle } from "./components/GateDiagram";
import { KMapPanel } from "./components/KMapPanel";
import { LogicGateReview } from "./components/LogicGateReview";
import { TruthTable } from "./components/TruthTable";
import { UniversalGatesPanel } from "./components/UniversalGatesPanel";
import { buildCmosPlan } from "./logic/cmos";
import { evaluateFormula } from "./logic/formula";
import { getVariables, makeTruthRows } from "./logic/kmap";
import { estimateLogicMetrics } from "./logic/metrics";
import { PRESET_CATEGORIES, PRESETS, type Preset } from "./logic/presets";
import { APP_VERSION } from "./version";
import {
  nextOutputValue,
  normalizeValues,
  simplifyPos,
  simplifySop
} from "./logic/simplify";
import { buildUniversalGateConversions } from "./logic/universalGates";
import { ALL_VARIABLES, MAX_VARIABLE_COUNT, MIN_VARIABLE_COUNT } from "./logic/types";
import type {
  LogicVariable,
  OutputValue,
  PosSimplificationResult,
  ProductLiteral,
  ProductTerm,
  SimplificationResult,
  VariableCount
} from "./logic/types";

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
type ViewPreset<T extends string> = {
  description: string;
  label: string;
  panels: PanelVisibility<T>;
};

const FORMULA_EXAMPLES = [
  "buffer A",
  "not A",
  "A and B",
  "A or B",
  "A xor B",
  "A xnor B",
  "A nand B",
  "A nor B",
  "SA + SB",
  "F(A,B,C) = Σm(1,3,7)"
];
const GUIDE_EXAMPLES = [
  {
    label: "SOP starter",
    formula: "A'B + AC",
    note: "Classic sum-of-products with postfix NOT."
  },
  {
    label: "Custom names",
    formula: "SA + SB",
    note: "Variable labels are detected from the formula."
  },
  {
    label: "Parity",
    formula: "A xor B xor C",
    note: "XOR chains are parsed left to right."
  },
  {
    label: "OAI21",
    formula: "not ((A or B) and C)",
    note: "OR-AND-Invert complex CMOS form."
  },
  {
    label: "Minterms",
    formula: "F(A,B,C,D) = Σm(1,3,7,11,15) d(0,2)",
    note: "Truth-vector input with optional don't-care terms."
  },
  {
    label: "AOI22",
    formula: "not ((A and B) or (C and D))",
    note: "AND-OR-Invert with four inputs."
  },
  {
    label: "Named carry",
    formula: "CarryIn xor Sum",
    note: "Names can use letters, numbers, and underscores."
  }
];
const GUIDE_OPERATORS = [
  {
    label: "NOT",
    aliases: ["not A", "~A", "!A", "A'"],
    description: "Invert a signal before or after the variable."
  },
  {
    label: "AND",
    aliases: ["A and B", "AB", "A * B", "A & B"],
    description: "Adjacent variables imply AND, so AB is valid."
  },
  {
    label: "OR",
    aliases: ["A or B", "A + B", "A | B"],
    description: "Use words or symbols for sum terms."
  },
  {
    label: "XOR / XNOR",
    aliases: ["A xor B", "A xnor B", "A ^ B"],
    description: "Use for parity and equality logic."
  },
  {
    label: "NAND / NOR",
    aliases: ["A nand B", "A nor B"],
    description: "Universal gates can be typed directly."
  },
  {
    label: "BUFFER",
    aliases: ["buffer A", "buf A"],
    description: "Keep a signal non-inverted."
  }
];
const GUIDE_COMPLEX_CMOS = [
  { label: "AOI21", formula: "not ((A and B) or C)" },
  { label: "AOI22", formula: "not ((A and B) or (C and D))" },
  { label: "OAI21", formula: "not ((A or B) and C)" },
  { label: "OAI22", formula: "not ((A or B) and (C or D))" }
];
const GUIDE_RULES = [
  {
    label: "1",
    title: "Group with parentheses",
    text: "Use parentheses for AOI/OAI and any expression where the gate order matters."
  },
  {
    label: "2",
    title: "Variables auto-map",
    text: `New names map to the next free input, up to ${MAX_VARIABLE_COUNT} inputs.`
  },
  {
    label: "3",
    title: "Minterms are accepted",
    text: "Use F(A,B,C,D) = Σm(1,3,7) d(0,2) when you want truth-table input."
  },
  {
    label: "4",
    title: "Review everything",
    text: "Open Review when you want every supported gate, symbol, and truth table in one page."
  }
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
const LOGIC_VIEW_PRESETS: ViewPreset<LogicPanelId>[] = [
  {
    description: "diagram, K-map, SOP/POS",
    label: "Learn",
    panels: {
      diagram: true,
      forms: true,
      kmap: true,
      truth: false,
      universal: false,
      verilog: false
    }
  },
  {
    description: "truth table + K-map",
    label: "Truth",
    panels: {
      diagram: false,
      forms: true,
      kmap: true,
      truth: true,
      universal: false,
      verilog: false
    }
  },
  {
    description: "equations, gates, Verilog",
    label: "Export",
    panels: {
      diagram: false,
      forms: true,
      kmap: false,
      truth: false,
      universal: true,
      verilog: true
    }
  }
];
const CMOS_VIEW_PRESETS: ViewPreset<CmosPanelId>[] = [
  {
    description: "summary + schematic",
    label: "Study",
    panels: {
      netlist: false,
      networks: false,
      overview: true,
      schematic: true,
      sizing: false
    }
  },
  {
    description: "PUN/PDN + sizing",
    label: "Network",
    panels: {
      netlist: false,
      networks: true,
      overview: true,
      schematic: true,
      sizing: true
    }
  },
  {
    description: "schematic + netlist",
    label: "SPICE",
    panels: {
      netlist: true,
      networks: false,
      overview: true,
      schematic: true,
      sizing: false
    }
  }
];

const DEFAULT_INPUT_LABELS = Object.fromEntries(
  ALL_VARIABLES.map((variable) => [variable, variable])
) as Record<LogicVariable, string>;

const STUDIO_SESSION_KEY = "logic-cmos-studio.session.v1";

interface StudioSessionState {
  activeWorkspace: Workspace;
  cmosPanels: PanelVisibility<CmosPanelId>;
  formulaInput: string;
  gateWireStyle: GateWireStyle;
  includeOutputInverter: boolean;
  inputLabels: Record<LogicVariable, string>;
  logicPanels: PanelVisibility<LogicPanelId>;
  rawValues: OutputValue[];
  variableCount: VariableCount;
}

export default function App() {
  const initialSession = useMemo(loadInitialStudioSession, []);
  const [variableCount, setVariableCount] = useState<VariableCount>(
    initialSession.variableCount
  );
  const [rawValues, setRawValues] = useState<OutputValue[]>(
    initialSession.rawValues
  );
  const [formulaInput, setFormulaInput] = useState(() =>
    initialSession.formulaInput
  );
  const [formulaError, setFormulaError] = useState("");
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [displayOpen, setDisplayOpen] = useState(false);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace>(
    initialSession.activeWorkspace
  );
  const [logicPanels, setLogicPanels] =
    useState<PanelVisibility<LogicPanelId>>(initialSession.logicPanels);
  const [cmosPanels, setCmosPanels] =
    useState<PanelVisibility<CmosPanelId>>(initialSession.cmosPanels);
  const [inputLabels, setInputLabels] =
    useState<Record<LogicVariable, string>>(initialSession.inputLabels);
  const [gateWireStyle, setGateWireStyle] = useState<GateWireStyle>(
    initialSession.gateWireStyle
  );
  const [includeOutputInverter, setIncludeOutputInverter] = useState(
    initialSession.includeOutputInverter
  );
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [expressionCopyState, setExpressionCopyState] =
    useState<CopyState>("idle");
  const [shareCopyState, setShareCopyState] = useState<CopyState>("idle");

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
  const logicMetrics = useMemo(
    () =>
      estimateLogicMetrics({
        cmosTransistorCount: cmosPlan.transistorCount,
        formula: formulaInput,
        result,
        variableCount
      }),
    [cmosPlan.transistorCount, formulaInput, result, variableCount]
  );
  const verilogBundle = useMemo(
    () => buildVerilogModule(result, displayLabels),
    [displayLabels, result]
  );
  const simplifiedExpressionText = useMemo(
    () => `F = ${displaySopExpression}`,
    [displaySopExpression]
  );
  const showLogicSideColumn = logicPanels.forms || logicPanels.verilog;
  const hasLogicCanvasContent =
    logicPanels.diagram ||
    logicPanels.kmap ||
    logicPanels.universal ||
    logicPanels.truth;
  const hasCmosContent = Object.values(cmosPanels).some(Boolean);

  useEffect(() => {
    writeStoredStudioSession({
      activeWorkspace,
      cmosPanels,
      formulaInput,
      gateWireStyle,
      includeOutputInverter,
      inputLabels,
      logicPanels,
      rawValues: values,
      variableCount
    });
  }, [
    activeWorkspace,
    cmosPanels,
    formulaInput,
    gateWireStyle,
    includeOutputInverter,
    inputLabels,
    logicPanels,
    values,
    variableCount
  ]);

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

  function applyLogicViewPreset(panels: PanelVisibility<LogicPanelId>) {
    setLogicPanels({ ...panels });
    setDisplayOpen(false);
  }

  function applyCmosViewPreset(panels: PanelVisibility<CmosPanelId>) {
    setCmosPanels({ ...panels });
    setDisplayOpen(false);
  }

  function resetWorkspace() {
    const defaultCount = DEFAULT_PRESET.variableCount;
    setActiveWorkspace("logic");
    setCmosPanels(DEFAULT_CMOS_PANELS);
    setDisplayOpen(false);
    setFormulaError("");
    setFormulaInput("");
    setGateWireStyle("straight");
    setGuideOpen(false);
    setIncludeOutputInverter(false);
    setInputLabels(DEFAULT_INPUT_LABELS);
    setLogicPanels(DEFAULT_LOGIC_PANELS);
    setPresetsOpen(false);
    setRawValues(makeClearedValues(defaultCount));
    setVariableCount(defaultCount);
    clearStoredStudioSession();
    clearExpressionFromUrl();
  }

  function handleToggle(minterm: number) {
    setRawValues((current) => {
      const next = normalizeValues(variableCount, current);
      next[minterm] = nextOutputValue(next[minterm]);
      return next;
    });
  }

  function fillOutputs(value: OutputValue) {
    setRawValues(Array.from({ length: 1 << variableCount }, () => value));
    setFormulaError("");
    setPresetsOpen(false);
  }

  function applyFormulaText(
    nextFormula: string,
    options: {
      currentVariableCount?: VariableCount;
      labels?: Partial<Record<LogicVariable, string>>;
      syncUrl?: boolean;
    } = {}
  ) {
    try {
      const evaluation = evaluateFormula(
        nextFormula,
        options.currentVariableCount ?? variableCount,
        options.labels ?? displayLabels
      );
      setVariableCount(evaluation.variableCount);
      setInputLabels(evaluation.variableLabels);
      setRawValues(evaluation.values);
      setFormulaInput(nextFormula);
      setFormulaError("");
      setPresetsOpen(false);
      if (options.syncUrl !== false) {
        syncExpressionToUrl(nextFormula);
      }
    } catch (error) {
      setFormulaInput(nextFormula);
      setFormulaError(
        error instanceof Error ? error.message : "Could not parse the formula."
      );
    }
  }

  function applyPreset(preset: Preset) {
    applyFormulaText(preset.formula, {
      currentVariableCount: preset.variableCount,
      labels: DEFAULT_INPUT_LABELS
    });
  }

  function applyFormula() {
    applyFormulaText(formulaInput);
  }

  function useGuideFormula(formula: string) {
    applyFormulaText(formula, { labels: DEFAULT_INPUT_LABELS });
    setGuideOpen(false);
    setPresetsOpen(false);
  }

  async function copyVerilog() {
    await copyText(verilogBundle, setCopyState);
  }

  async function copySimplifiedExpression() {
    await copyText(simplifiedExpressionText, setExpressionCopyState);
  }

  async function copyShareUrl() {
    await copyText(buildShareUrl(formulaInput), setShareCopyState);
  }

  async function copyText(
    value: string,
    setState: (state: CopyState) => void
  ) {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
    window.setTimeout(() => setState("idle"), 1400);
  }

  const formulaPanel =
    activeWorkspace !== "review" ? (
      <section className="surface-card relative p-4">
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
              Formula
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              Type once, then use the center canvas and result rail to inspect it.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => {
                setGuideOpen(true);
                setPresetsOpen(false);
              }}
              className="control-button min-h-11 py-2 text-xs"
              aria-label="Open formula guide"
            >
              Guide
            </button>
            <button
              type="button"
              onClick={copyShareUrl}
              className="control-button min-h-11 py-2 text-xs"
              aria-label="Copy shareable URL"
            >
              {shareCopyState === "copied"
                ? "URL copied"
                : shareCopyState === "failed"
                  ? "Copy failed"
                  : "Share"}
            </button>
            <button
              type="button"
              onClick={() => setPresetsOpen((open) => !open)}
              className="control-button min-h-11 py-2 text-xs"
              aria-expanded={presetsOpen}
              aria-label="Open formula presets"
            >
              Presets
            </button>
          </div>
        </div>
        {presetsOpen && (
          <div className="z-20 mt-3 max-h-[min(62vh,560px)] w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 shadow-soft">
            <div>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Detected inputs
              </span>
              <div className="flex flex-wrap gap-2">
                {variables.map((variable, index) => (
                  <span
                    key={variable}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600"
                  >
                    <span className="font-mono text-slate-400">{variable}</span>
                    <span className="text-slate-300">{"->"}</span>
                    <code className="text-slate-700">
                      {activeDisplayLabels[index] ?? variable}
                    </code>
                  </span>
                ))}
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-400">
                Inputs are detected from the formula after Generate or preset selection.
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
                    applyFormulaText(example, { labels: DEFAULT_INPUT_LABELS });
                    setPresetsOpen(false);
                  }}
                  className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-600 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30"
                >
                  {example}
                </button>
              ))}
            </div>
            <div className="my-3 h-px bg-slate-100" />
            <div className="grid gap-3">
              {PRESET_CATEGORIES.map((category) => {
                const presets = PRESETS.filter(
                  (preset) => preset.category === category
                );

                return (
                  <div key={category}>
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {category}
                    </span>
                    <div className="grid gap-2">
                      {presets.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => applyPreset(preset)}
                          className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-left transition hover:border-slate-300 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30"
                        >
                          <span className="block text-sm font-semibold text-slate-800">
                            {preset.name}
                          </span>
                          <code className="mt-1 block break-words text-xs leading-5 text-slate-500">
                            {preset.formula}
                          </code>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
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
          <div className="grid gap-2">
            <label htmlFor="formula-input" className="sr-only">
              Boolean formula
            </label>
            <input
              id="formula-input"
              value={formulaInput}
              onChange={(event) => setFormulaInput(event.target.value)}
              className={`w-full rounded-md border bg-white px-3 py-2.5 font-mono text-sm text-slate-800 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-sky-500/20 ${
                formulaError ? "border-rose-300" : "border-slate-200"
              }`}
              placeholder="F = A'B + AC or F(A,B,C)=m(1,3,7)"
              aria-label="Boolean formula"
              aria-invalid={Boolean(formulaError)}
            />
            <button type="submit" className="control-button-dark">
              Generate
            </button>
          </div>
          <p className="text-xs font-medium text-slate-500">
            Detected variables:{" "}
            <code className="text-slate-700">{activeDisplayLabels.join(", ")}</code>
            <span className="ml-1 text-slate-400">
              from the formula, up to {MAX_VARIABLE_COUNT} inputs
            </span>
          </p>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
            <button
              type="button"
              onClick={() => setIncludeOutputInverter((include) => !include)}
              className={`w-full rounded-md border px-3 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30 ${
                includeOutputInverter
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              }`}
              aria-pressed={includeOutputInverter}
            >
              CMOS output {includeOutputInverter ? "+ INV" : "core"}
            </button>
            <span className="mt-2 block text-xs leading-5 text-slate-400">
              Toggle the CMOS output stage without switching pages.
            </span>
          </div>
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
    ) : null;

  const logicCanvasPanels = (
    <section className="min-w-0 space-y-5">
      {!hasLogicCanvasContent && (
        <EmptyView
          workspace="Logic"
          onOpenDisplay={() => setDisplayOpen(true)}
        />
      )}

      {logicPanels.diagram && (
        <section className="surface-card p-4">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                Gate Diagram
              </h2>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                Clean term-level view with local input labels and a single output stage.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Routing
              </span>
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
                    aria-pressed={gateWireStyle === style}
                  >
                    {label}
                  </button>
                ))}
              </div>
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

      {logicPanels.kmap && (
        <KMapPanel
          result={result}
          onToggle={handleToggle}
          variableLabels={displayLabels}
        />
      )}

      {logicPanels.universal && (
        <UniversalGatesPanel
          conversions={gateConversions}
          variableLabels={displayLabels}
        />
      )}

      {logicPanels.truth && (
        <TruthTable
          variables={variables}
          labels={activeDisplayLabels}
          rows={truthRows}
          onFillOutputs={fillOutputs}
          onToggle={handleToggle}
        />
      )}
    </section>
  );

  const logicResultPanels = showLogicSideColumn ? (
    <aside className="min-w-0 space-y-5 min-[1500px]:sticky min-[1500px]:top-5 min-[1500px]:self-start">
      {logicPanels.forms && (
        <section className="surface-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
              SOP / POS Forms
            </h2>
            <button
              type="button"
              onClick={copySimplifiedExpression}
              className="control-button py-1.5 text-xs"
            >
              {expressionCopyState === "copied"
                ? "Copied"
                : expressionCopyState === "failed"
                  ? "Copy failed"
                  : "Copy SOP"}
            </button>
          </div>
          <div className="mt-4 grid gap-3">
            <ExpressionBlock label="Minimized SOP" value={simplifiedExpressionText} />
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
            <Metric
              label="Essential prime implicants"
              value={formatEssentialPrimeImplicants(
                result.essentialPrimeImplicants,
                displayLabels
              )}
            />
          </div>
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Educational Estimates
              </h3>
              <span className="rounded-md bg-white px-2 py-1 text-[11px] font-semibold text-slate-500">
                approximate
              </span>
            </div>
            <div className="mt-3 grid gap-2 text-sm text-slate-600">
              <Metric
                label="Original literals"
                value={`${logicMetrics.originalLiteralCount}`}
              />
              <Metric
                label="Simplified literals"
                value={`${logicMetrics.simplifiedLiteralCount}`}
              />
              <Metric
                label="Gate count"
                value={`${logicMetrics.estimatedGateCount}`}
              />
              <Metric
                label="Logic depth"
                value={`${logicMetrics.estimatedLogicDepth}`}
              />
              <Metric
                label="CMOS transistors"
                value={`${logicMetrics.estimatedTransistorCount}`}
              />
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              Estimates assume a simple SOP implementation plus static CMOS
              transistor counts from the schematic model.
            </p>
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
          <pre className="mt-4 max-h-[480px] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950 p-4 text-sm leading-6 text-emerald-100">
            <code>{verilogBundle}</code>
          </pre>
        </section>
      )}
    </aside>
  ) : null;

  const workspaceHeading =
    activeWorkspace === "logic"
      ? "Logic Workspace"
      : activeWorkspace === "cmos"
        ? "CMOS Workspace"
        : "Gate Review";
  const workspaceDescription =
    activeWorkspace === "logic"
      ? "Build, simplify, and inspect Boolean logic with the diagram and K-map centered on the screen."
      : activeWorkspace === "cmos"
        ? "Inspect pull-up / pull-down networks, transistor estimates, and teaching-level CMOS schematics."
        : "Compare every supported logic gate, expression form, symbol, and truth table in a wide review grid.";

  return (
    <main className="app-shell min-h-screen overflow-x-hidden text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-[1920px] flex-col lg:flex-row">
        <aside className="z-20 border-b border-white/70 bg-white/90 px-4 py-4 shadow-soft backdrop-blur sm:px-6 lg:sticky lg:top-0 lg:h-screen lg:w-[360px] lg:shrink-0 lg:overflow-y-auto lg:border-b-0 lg:border-r lg:border-slate-200/80 lg:px-5">
          <div className="mb-4 flex min-w-0 items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-slate-950 text-sm font-bold text-white shadow-soft">
              LC
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold tracking-normal text-slate-950">
                  Logic & CMOS Studio
                </h1>
                <span className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 font-mono text-xs font-bold text-sky-700">
                  {APP_VERSION}
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Boolean logic, K-maps, Verilog, and static CMOS in one desktop workspace.
              </p>
            </div>
          </div>

          <WorkspaceTabs
            activeWorkspace={activeWorkspace}
            cmosPanels={cmosPanels}
            displayOpen={displayOpen}
            logicPanels={logicPanels}
            onApplyCmosPreset={applyCmosViewPreset}
            onApplyLogicPreset={applyLogicViewPreset}
            onChange={setActiveWorkspace}
            onDisplayOpenChange={setDisplayOpen}
            onResetDisplay={resetDisplay}
            onResetWorkspace={resetWorkspace}
            onToggleCmosPanel={toggleCmosPanel}
            onToggleLogicPanel={toggleLogicPanel}
          />

          {formulaPanel && <div className="mt-4">{formulaPanel}</div>}

          <a
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-soft transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30 focus-visible:ring-offset-2"
            href="https://marksui.github.io/Hardware_Interview_Trainer/"
            rel="noreferrer"
            target="_blank"
          >
            Hardware Interview Trainer
          </a>
        </aside>

        <section className="min-w-0 flex-1 px-4 py-4 sm:px-6 lg:px-6 xl:px-8">
          {guideOpen && (
            <FormulaGuideDialog
              onClose={() => setGuideOpen(false)}
              onUseFormula={useGuideFormula}
            />
          )}

          <div className="mb-5 flex flex-col gap-3 rounded-lg border border-white/70 bg-white/70 px-4 py-3 shadow-soft backdrop-blur sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-400">
                {activeWorkspace}
              </span>
              <h2 className="mt-1 text-2xl font-bold tracking-normal text-slate-950">
                {workspaceHeading}
              </h2>
              <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-500">
                {workspaceDescription}
              </p>
            </div>
            {activeWorkspace !== "review" && (
              <span className="w-fit rounded-md border border-slate-200 bg-white px-2.5 py-1 font-mono text-xs font-semibold text-slate-600">
                F = {displaySopExpression}
              </span>
            )}
          </div>

          {activeWorkspace === "logic" ? (
            <div
              className={`grid min-w-0 gap-5 ${
                showLogicSideColumn
                  ? "min-[1500px]:grid-cols-[minmax(0,1fr)_390px]"
                  : ""
              }`}
            >
              {logicCanvasPanels}
              {logicResultPanels}
            </div>
          ) : activeWorkspace === "cmos" ? (
            <section className="min-w-0 space-y-5">
              {!hasCmosContent ? (
                <EmptyView
                  workspace="CMOS"
                  onOpenDisplay={() => setDisplayOpen(true)}
                />
              ) : (
                <CMOSPanel
                  includeOutputInverter={includeOutputInverter}
                  onIncludeOutputInverterChange={setIncludeOutputInverter}
                  plan={cmosPlan}
                  visibleSections={cmosPanels}
                />
              )}
            </section>
          ) : (
            <LogicGateReview />
          )}
        </section>
      </div>
    </main>
  );
}
function EmptyView({
  onOpenDisplay,
  workspace
}: {
  onOpenDisplay?: () => void;
  workspace: "Logic" | "CMOS";
}) {
  return (
    <section className="surface-card p-6 text-center">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        No {workspace} panels selected
      </h2>
      <p className="mt-2 text-sm text-slate-500">
        Open Display to choose what appears here.
      </p>
      {onOpenDisplay && (
        <button
          type="button"
          onClick={onOpenDisplay}
          className="control-button mt-4 min-h-11 px-4 text-sm"
        >
          Open Display
        </button>
      )}
    </section>
  );
}

function FormulaGuideDialog({
  onClose,
  onUseFormula
}: {
  onClose: () => void;
  onUseFormula: (formula: string) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 px-3 py-4 backdrop-blur-sm sm:px-5"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="formula-guide-title"
        aria-modal="true"
        className="flex max-h-[calc(100vh-32px)] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-soft"
        role="dialog"
      >
        <div className="border-b border-slate-100 bg-white px-4 py-3 sm:px-5">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h2
                id="formula-guide-title"
                className="text-sm font-semibold uppercase tracking-wide text-slate-600"
              >
                Formula Guide
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
                Type gate words, symbols, custom variable names, and AOI/OAI
                forms. The workspace detects labels and input count from the
                expression.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30"
              aria-label="Close Formula Guide"
            >
              Close
            </button>
          </div>
        </div>
        <div className="grid gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3 sm:grid-cols-3 sm:px-5">
          <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
            <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-400">
              Variables
            </span>
            <span className="mt-1 block text-sm font-semibold text-slate-700">
              Auto-detect up to {MAX_VARIABLE_COUNT}
            </span>
          </div>
          <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
            <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-400">
              Gates
            </span>
            <span className="mt-1 block text-sm font-semibold text-slate-700">
              AND, OR, NOT, XOR, NAND, NOR
            </span>
          </div>
          <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
            <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-400">
              Complex CMOS
            </span>
            <span className="mt-1 block text-sm font-semibold text-slate-700">
              AOI and OAI patterns included
            </span>
          </div>
        </div>
        <div className="overflow-y-auto bg-white px-4 py-4 text-sm text-slate-600 sm:px-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.08fr)_minmax(300px,0.92fr)]">
            <section className="rounded-md border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                    Try A Formula
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Click a sample to run it and update the workspace.
                  </p>
                </div>
                <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-500">
                  live examples
                </span>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {GUIDE_EXAMPLES.map((example) => (
                  <button
                    key={example.formula}
                    type="button"
                    onClick={() => onUseFormula(example.formula)}
                    className="min-h-[112px] rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-left transition hover:border-slate-300 hover:bg-white hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="min-w-0 text-sm font-semibold text-slate-800">
                        {example.label}
                      </span>
                      <span className="shrink-0 rounded bg-white px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                        Run
                      </span>
                    </span>
                    <code className="mt-2 block break-words rounded bg-white px-2 py-1.5 text-xs leading-5 text-slate-700">
                      {example.formula}
                    </code>
                    <span className="mt-2 block text-xs leading-5 text-slate-500">
                      {example.note}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-md border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                Read Order
              </h3>
              <div className="mt-3 space-y-3">
                {GUIDE_RULES.map((rule) => (
                  <GuideRule key={rule.label} {...rule} />
                ))}
              </div>
              <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
                <span className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                  Custom Variable Names
                </span>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  Use names like <code>SA</code>, <code>SB</code>,{" "}
                  <code>CarryIn</code>, or <code>req_0</code>. Names are
                  cleaned for display and mapped automatically.
                </p>
              </div>
              <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
                <span className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                  Don't-care
                </span>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  Click K-map or truth-table outputs to cycle 0, 1, and X. X is
                  treated as a simplification don't-care.
                </p>
              </div>
            </section>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <section className="rounded-md border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                Operator Cheat Sheet
              </h3>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {GUIDE_OPERATORS.map((operator) => (
                  <GuideOperator key={operator.label} {...operator} />
                ))}
              </div>
            </section>

            <section className="rounded-md border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                    AOI / OAI Map
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Pick one when you want complex CMOS without rewriting it by
                    hand.
                  </p>
                </div>
                <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-500">
                  presets
                </span>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {GUIDE_COMPLEX_CMOS.map((gate) => (
                  <button
                    key={gate.label}
                    type="button"
                    onClick={() => onUseFormula(gate.formula)}
                    className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-left transition hover:border-slate-300 hover:bg-white hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30"
                  >
                    <span className="block text-sm font-semibold text-slate-800">
                      {gate.label}
                    </span>
                    <code className="mt-2 block break-words text-xs leading-5 text-slate-600">
                      {gate.formula}
                    </code>
                  </button>
                ))}
              </div>
              <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
                <span className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                  Display Control
                </span>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  Use Display to keep the main screen quiet, then open Review
                  for the full gate symbol and truth-table reference.
                </p>
              </div>
            </section>
          </div>
        </div>
      </section>
    </div>
  );
}

function GuideRule({
  label,
  title,
  text
}: {
  label: string;
  title: string;
  text: string;
}) {
  return (
    <div className="flex gap-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-slate-200 bg-white text-xs font-bold text-slate-600">
        {label}
      </span>
      <div className="min-w-0">
        <span className="block text-sm font-semibold text-slate-800">
          {title}
        </span>
        <p className="mt-0.5 text-xs leading-5 text-slate-500">{text}</p>
      </div>
    </div>
  );
}

function GuideOperator({
  label,
  aliases,
  description
}: {
  label: string;
  aliases: string[];
  description: string;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
      <span className="block text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {aliases.map((alias) => (
          <code
            key={alias}
            className="rounded border border-slate-200 bg-white px-1.5 py-1 text-[11px] leading-none text-slate-700"
          >
            {alias}
          </code>
        ))}
      </div>
    </div>
  );
}

function WorkspaceTabs({
  activeWorkspace,
  cmosPanels,
  displayOpen,
  logicPanels,
  onApplyCmosPreset,
  onApplyLogicPreset,
  onChange,
  onDisplayOpenChange,
  onResetDisplay,
  onResetWorkspace,
  onToggleCmosPanel,
  onToggleLogicPanel
}: {
  activeWorkspace: Workspace;
  cmosPanels: PanelVisibility<CmosPanelId>;
  displayOpen: boolean;
  logicPanels: PanelVisibility<LogicPanelId>;
  onApplyCmosPreset: (panels: PanelVisibility<CmosPanelId>) => void;
  onApplyLogicPreset: (panels: PanelVisibility<LogicPanelId>) => void;
  onChange: (workspace: Workspace) => void;
  onDisplayOpenChange: (open: boolean) => void;
  onResetDisplay: () => void;
  onResetWorkspace: () => void;
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
  const activePresets =
    activeWorkspace === "logic"
      ? LOGIC_VIEW_PRESETS
      : activeWorkspace === "cmos"
        ? CMOS_VIEW_PRESETS
        : [];
  const selectedCount = hasDisplayControls
    ? Object.values(activePanels).filter(Boolean).length
    : 0;
  const activeViewLabel =
    activeWorkspace === "logic"
      ? LOGIC_VIEW_PRESETS.find((preset) =>
          panelSetsMatch(logicPanels, preset.panels)
        )?.label
      : activeWorkspace === "cmos"
        ? CMOS_VIEW_PRESETS.find((preset) =>
            panelSetsMatch(cmosPanels, preset.panels)
          )?.label
        : undefined;
  const displayPrimary = activeViewLabel ?? "Custom";
  const displaySecondary = `${selectedCount} panel${
    selectedCount === 1 ? "" : "s"
  } visible`;
  const workspaceDescriptions: Record<Workspace, string> = {
    cmos: "Transistors and networks",
    logic: "Equation, K-map, diagram",
    review: "Symbols and truth tables"
  };

  return (
    <div className="surface-card p-3">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
        Pages
      </span>
      <div className="grid gap-2">
        <div className="grid gap-2">
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
                className={`rounded-md px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30 ${
                  active
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
                aria-pressed={active}
              >
                <span className="block text-sm font-semibold">{label}</span>
                <span
                  className={`mt-0.5 block text-xs ${
                    active ? "text-slate-200" : "text-slate-400"
                  }`}
                >
                  {workspaceDescriptions[workspace]}
                </span>
              </button>
            );
          })}
        </div>

        {hasDisplayControls && (
          <div className="mt-1">
            <button
              type="button"
              onClick={() => onDisplayOpenChange(!displayOpen)}
              className="h-full w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-left transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30"
              aria-expanded={displayOpen}
              aria-label={`Display options, ${displayPrimary} view, ${displaySecondary}`}
            >
              <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-400">
                Display
              </span>
              <span className="block truncate text-sm font-semibold text-slate-800">
                {displayPrimary}
              </span>
              <span className="block text-[11px] font-medium text-slate-500">
                {displaySecondary}
              </span>
            </button>
            {displayOpen && (
              <div
                className="mt-3 rounded-lg border border-slate-200 bg-white p-3 shadow-soft"
                role="dialog"
                aria-label="Display panel controls"
              >
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Quick Views
                </span>
                <div className="mb-3 grid gap-2">
                  {activePresets.map((preset) => {
                    const presetActive =
                      activeWorkspace === "logic"
                        ? panelSetsMatch(
                            logicPanels,
                            preset.panels as PanelVisibility<LogicPanelId>
                          )
                        : activeWorkspace === "cmos"
                          ? panelSetsMatch(
                              cmosPanels,
                              preset.panels as PanelVisibility<CmosPanelId>
                            )
                          : false;

                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => {
                          if (activeWorkspace === "logic") {
                            onApplyLogicPreset(
                              preset.panels as PanelVisibility<LogicPanelId>
                            );
                          } else if (activeWorkspace === "cmos") {
                            onApplyCmosPreset(
                              preset.panels as PanelVisibility<CmosPanelId>
                            );
                          }
                        }}
                        className={`rounded-md border px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30 ${
                          presetActive
                            ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                            : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-white hover:shadow-sm"
                        }`}
                        aria-pressed={presetActive}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span
                            className={`block text-sm font-semibold ${
                              presetActive ? "text-white" : "text-slate-800"
                            }`}
                          >
                            {preset.label}
                          </span>
                          {presetActive && (
                            <span className="rounded bg-white/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                              Active
                            </span>
                          )}
                        </span>
                        <span
                          className={`mt-0.5 block text-xs ${
                            presetActive ? "text-slate-200" : "text-slate-500"
                          }`}
                        >
                          {preset.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
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
                <button
                  type="button"
                  onClick={onResetWorkspace}
                  className="mt-3 w-full rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/30"
                >
                  Reset workspace
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function panelSetsMatch<T extends string>(
  panels: PanelVisibility<T>,
  preset: PanelVisibility<T>
): boolean {
  return (Object.keys(preset) as T[]).every(
    (panel) => panels[panel] === preset[panel]
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

function buildVerilogModule(
  result: SimplificationResult,
  labels: Record<LogicVariable, string>
): string {
  const usedVariables = getUsedVariables(result);
  const ports = [
    ...usedVariables.map((variable) => `    input ${labels[variable]},`),
    "    output F"
  ];

  return [
    "module logic_func (",
    ports.join("\n"),
    ");",
    `    assign F = ${replaceVerilogVariables(result.verilogExpression, labels)};`,
    "endmodule"
  ].join("\n");
}

function getUsedVariables(result: SimplificationResult): LogicVariable[] {
  const used = new Set<LogicVariable>();
  result.terms.forEach((term) => {
    term.literals.forEach((literal) => used.add(literal.variable));
  });

  return ALL_VARIABLES.filter((variable) => used.has(variable));
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

function formatEssentialPrimeImplicants(
  terms: ProductTerm[],
  labels: Record<LogicVariable, string>
): string {
  return (
    terms.map((term) => formatProductTerm(term.literals, labels)).join(", ") ||
    "none"
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
  return expression.replace(/\b[A-H]\b/g, (variable) => {
    const logicVariable = variable as LogicVariable;
    return labels[logicVariable] ?? variable;
  });
}

function normalizeInputLabels(
  labels: Record<LogicVariable, string>
): Record<LogicVariable, string> {
  return Object.fromEntries(
    ALL_VARIABLES.map((variable) => [
      variable,
      sanitizeVariableLabel(labels[variable]) || variable
    ])
  ) as Record<LogicVariable, string>;
}

function getUrlExpression(): string | null {
  if (typeof window === "undefined") return null;

  const expression = new URLSearchParams(window.location.search).get("expr");
  return expression?.trim() || null;
}

function syncExpressionToUrl(expression: string) {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  url.searchParams.set("expr", expression);
  window.history.replaceState(null, "", url);
}

function clearExpressionFromUrl() {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  url.searchParams.delete("expr");
  window.history.replaceState(null, "", url);
}

function buildShareUrl(expression: string): string {
  if (typeof window === "undefined") return `?expr=${encodeURIComponent(expression)}`;

  const url = new URL(window.location.href);
  url.searchParams.set("expr", expression);
  return url.toString();
}

function loadInitialStudioSession(): StudioSessionState {
  const fallback = makeDefaultStudioSession();
  const urlExpression = getUrlExpression();

  if (urlExpression) {
    return makeSessionFromFormula(urlExpression, fallback);
  }

  const stored = readStoredStudioSession();
  if (!stored) return fallback;

  const formulaInput =
    typeof stored.formulaInput === "string"
      ? stored.formulaInput
      : fallback.formulaInput;
  const variableCount = normalizeStoredVariableCount(
    stored.variableCount,
    fallback.variableCount
  );

  return {
    activeWorkspace: normalizeStoredWorkspace(
      stored.activeWorkspace,
      fallback.activeWorkspace
    ),
    cmosPanels: normalizeStoredPanels(stored.cmosPanels, DEFAULT_CMOS_PANELS),
    formulaInput,
    gateWireStyle: stored.gateWireStyle === "curved" ? "curved" : "straight",
    includeOutputInverter:
      typeof stored.includeOutputInverter === "boolean"
        ? stored.includeOutputInverter
        : fallback.includeOutputInverter,
    inputLabels: normalizeStoredInputLabels(stored.inputLabels),
    logicPanels: normalizeStoredPanels(stored.logicPanels, DEFAULT_LOGIC_PANELS),
    rawValues: normalizeStoredOutputValues(stored.rawValues, variableCount),
    variableCount
  };
}

function makeDefaultStudioSession(): StudioSessionState {
  return {
    activeWorkspace: "logic",
    cmosPanels: DEFAULT_CMOS_PANELS,
    formulaInput: DEFAULT_PRESET.formula,
    gateWireStyle: "straight",
    includeOutputInverter: false,
    inputLabels: DEFAULT_INPUT_LABELS,
    logicPanels: DEFAULT_LOGIC_PANELS,
    rawValues: DEFAULT_PRESET.makeValues(),
    variableCount: DEFAULT_PRESET.variableCount
  };
}

function makeSessionFromFormula(
  formula: string,
  fallback: StudioSessionState
): StudioSessionState {
  try {
    const evaluation = evaluateFormula(
      formula,
      DEFAULT_PRESET.variableCount,
      DEFAULT_INPUT_LABELS
    );

    return {
      ...fallback,
      formulaInput: formula,
      inputLabels: evaluation.variableLabels,
      rawValues: evaluation.values,
      variableCount: evaluation.variableCount
    };
  } catch {
    return { ...fallback, formulaInput: formula };
  }
}

function readStoredStudioSession(): Partial<StudioSessionState> | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(STUDIO_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isPlainRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredStudioSession(session: StudioSessionState) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(STUDIO_SESSION_KEY, JSON.stringify(session));
  } catch {
    // Storage can be unavailable in private browsing; the app still works.
  }
}

function clearStoredStudioSession() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(STUDIO_SESSION_KEY);
  } catch {
    // Ignore storage failures during reset.
  }
}

function normalizeStoredWorkspace(
  value: unknown,
  fallback: Workspace
): Workspace {
  return value === "logic" || value === "cmos" || value === "review"
    ? value
    : fallback;
}

function normalizeStoredVariableCount(
  value: unknown,
  fallback: VariableCount
): VariableCount {
  const count = Number(value);
  return Number.isInteger(count) &&
    count >= MIN_VARIABLE_COUNT &&
    count <= MAX_VARIABLE_COUNT
    ? count
    : fallback;
}

function normalizeStoredInputLabels(
  value: unknown
): Record<LogicVariable, string> {
  const source = isPlainRecord(value) ? value : {};
  const labels = Object.fromEntries(
    ALL_VARIABLES.map((variable) => [
      variable,
      typeof source[variable] === "string"
        ? source[variable]
        : DEFAULT_INPUT_LABELS[variable]
    ])
  ) as Record<LogicVariable, string>;

  return normalizeInputLabels(labels);
}

function normalizeStoredOutputValues(
  value: unknown,
  variableCount: VariableCount
): OutputValue[] {
  const rawValues = Array.isArray(value)
    ? value.map((entry) => (isOutputValue(entry) ? entry : "0"))
    : [];

  return normalizeValues(variableCount, rawValues);
}

function normalizeStoredPanels<T extends string>(
  value: unknown,
  defaults: PanelVisibility<T>
): PanelVisibility<T> {
  const source = isPlainRecord(value) ? value : {};
  return Object.fromEntries(
    Object.entries(defaults).map(([key, defaultValue]) => [
      key,
      typeof source[key] === "boolean" ? source[key] : defaultValue
    ])
  ) as PanelVisibility<T>;
}

function isOutputValue(value: unknown): value is OutputValue {
  return value === "0" || value === "1" || value === "X";
}

function makeClearedValues(variableCount: VariableCount): OutputValue[] {
  return Array.from({ length: 1 << variableCount }, () => "0");
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
