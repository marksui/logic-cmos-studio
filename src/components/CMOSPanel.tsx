import { useRef, useState } from "react";
import type { CmosNetworkNode, CmosPlan, TransistorKind } from "../logic/cmos";
import { CMOSSchematic, type CmosSymbolStyle } from "./CMOSSchematic";
import { SizingPanel } from "./SizingPanel";

interface CMOSPanelProps {
  includeOutputInverter: boolean;
  onIncludeOutputInverterChange: (include: boolean) => void;
  plan: CmosPlan;
  visibleSections?: {
    netlist: boolean;
    networks: boolean;
    overview: boolean;
    schematic: boolean;
    sizing: boolean;
  };
}

export function CMOSPanel({
  includeOutputInverter,
  onIncludeOutputInverterChange,
  plan,
  visibleSections = {
    netlist: true,
    networks: true,
    overview: true,
    schematic: true,
    sizing: true
  }
}: CMOSPanelProps) {
  const [styleOpen, setStyleOpen] = useState(false);
  const [symbolStyle, setSymbolStyle] = useState<CmosSymbolStyle>("textbook");
  const panelRef = useRef<HTMLElement | null>(null);

  function exportSchematicSvg() {
    const svg = panelRef.current?.querySelector("svg");
    if (!svg) return;

    const source = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `logic-cmos-${plan.coreGateName.toLowerCase().replace(/\s+/g, "-")}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section ref={panelRef} className="surface-card p-4">
      <div className="relative flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          Static CMOS Schematic
        </h2>
        <div className="flex flex-wrap gap-2">
          {plan.outputInverterAvailable && (
            <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-1">
              {([
                [false, "Core only"],
                [true, "+ INV"]
              ] as [boolean, string][]).map(([include, label]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => onIncludeOutputInverterChange(include)}
                  className={`rounded px-2.5 py-1 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30 ${
                    includeOutputInverter === include
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                  aria-pressed={includeOutputInverter === include}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {visibleSections.schematic && (
            <>
              <button
                type="button"
                onClick={exportSchematicSvg}
                className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30"
              >
                Export SVG
              </button>
              <button
                type="button"
                onClick={() => setStyleOpen((open) => !open)}
                className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30"
                aria-expanded={styleOpen}
              >
                Style
              </button>
            </>
          )}
        </div>
        {visibleSections.schematic && styleOpen && (
          <div className="absolute right-0 top-12 z-20 w-[min(300px,calc(100vw-48px))] rounded-lg border border-slate-200 bg-white p-3 shadow-soft">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
              CMOS symbol style
            </span>
            <div className="grid gap-2">
              {([
                ["compact", "Compact", "Clean network labels for dense schematics"],
                ["textbook", "Textbook", "MOSFET symbol with Gate / Drain / Source cues"]
              ] as [CmosSymbolStyle, string, string][]).map(
                ([style, label, description]) => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => {
                      setSymbolStyle(style);
                      setStyleOpen(false);
                    }}
                    className={`rounded-md border px-3 py-2 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30 ${
                      symbolStyle === style
                        ? "border-slate-900 bg-slate-50"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <span className="block text-sm font-semibold text-slate-800">
                      {label}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {description}
                    </span>
                  </button>
                )
              )}
            </div>
          </div>
        )}
      </div>

      {visibleSections.overview && (
        <div className="mt-4 grid gap-3 text-sm text-slate-600 lg:grid-cols-2">
          <Metric label="Simplified" value={plan.functionExpression} />
          <Metric label="CMOS-friendly" value={plan.cmosFriendlyExpression} />
          <Metric label="Transistors" value={`${plan.transistorCount}`} />
          <Metric
            label="Output stage"
            value={plan.outputInverterIncluded ? "restoring inverter included" : "core output only"}
          />
          <Metric
            label="Input complements"
            value={
              plan.inputInverters.length > 0
                ? plan.inputInverters.map((variable) => `${variable}'`).join(", ")
                : "none"
            }
          />
          <div className="rounded-md border border-sky-100 bg-sky-50 px-3 py-2 lg:col-span-2">
            <span className="block text-xs font-semibold uppercase tracking-wide text-sky-700">
              Teaching note
            </span>
            <p className="mt-1 text-sm leading-6 text-sky-900">
              {cmosTeachingExplanation(plan)}
            </p>
          </div>
        </div>
      )}

      {visibleSections.networks && (
        <div className="mt-4 grid gap-3 text-sm text-slate-600 lg:grid-cols-2">
          <NetworkCard
            title="Pull-up network"
            badge="PMOS PUN"
            node={plan.pullUp}
            fallback={plan.pullUpDescription}
            tone="pmos"
          />
          <NetworkCard
            title="Pull-down network"
            badge="NMOS PDN"
            node={plan.pullDown}
            fallback={plan.pullDownDescription}
            tone="nmos"
          />
        </div>
      )}

      {visibleSections.sizing && <SizingPanel plan={plan} />}

      {visibleSections.schematic && (
        <div className="mt-4">
          <CMOSSchematic plan={plan} symbolStyle={symbolStyle} />
        </div>
      )}

      {visibleSections.netlist && (
        <div className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            SPICE-like Netlist
          </h3>
          <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-slate-950 p-4 text-xs leading-5 text-cyan-100">
            <code>{plan.netlist}</code>
          </pre>
        </div>
      )}
    </section>
  );
}

function cmosTeachingExplanation(plan: CmosPlan): string {
  if (plan.coreGateName.startsWith("NAND")) {
    return "For NAND, the NMOS pull-down network is series because the output should discharge only when every input is 1. The PMOS pull-up network is parallel because any 0 input can charge the output back to VDD.";
  }

  if (plan.coreGateName.startsWith("NOR")) {
    return "For NOR, the NMOS pull-down network is parallel because any 1 input can discharge the output. The PMOS pull-up network is series because the output charges only when every input is 0.";
  }

  if (plan.coreGateName.startsWith("AOI")) {
    return "AOI gates build an AND-OR core and use the static CMOS dual network to create the inverted output directly, which often saves transistors compared with separate AND, OR, and NOT stages.";
  }

  if (plan.coreGateName.startsWith("OAI")) {
    return "OAI gates build an OR-AND core and invert it at the CMOS output. The NMOS network follows the pull-down logic, while the PMOS network is the complementary dual.";
  }

  if (plan.coreGateName.startsWith("INV")) {
    return "An inverter uses one PMOS device to pull the output up when the input is 0 and one NMOS device to pull the output down when the input is 1.";
  }

  return "This schematic is a teaching-level static CMOS network generated from the simplified logic. Series devices model conditions that must all be true; parallel devices model alternate conducting paths.";
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 px-3 py-2">
      <span className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <code className="mt-1 block break-words text-slate-700">{value}</code>
    </div>
  );
}

function NetworkCard({
  badge,
  fallback,
  node,
  title,
  tone
}: {
  badge: string;
  fallback: string;
  node: CmosNetworkNode | null;
  title: string;
  tone: TransistorKind;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          {title}
        </span>
        <span
          className={`rounded-md border px-2 py-1 font-mono text-[11px] font-semibold ${
            tone === "pmos"
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-blue-200 bg-blue-50 text-blue-700"
          }`}
        >
          {badge}
        </span>
      </div>

      {node ? (
        <>
          <div className="mt-3 overflow-x-auto pb-1">
            <NetworkNodeView node={node} depth={0} />
          </div>
          <code className="mt-3 block rounded-md bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
            {compactNetworkExpression(node)}
          </code>
        </>
      ) : (
        <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-slate-600">
          {fallback}
        </p>
      )}
    </div>
  );
}

function NetworkNodeView({
  depth,
  node
}: {
  depth: number;
  node: CmosNetworkNode;
}) {
  if (node.type === "transistor") {
    return <TransistorChip kind={node.kind} label={node.label} />;
  }

  const isSeries = node.type === "series";
  const compactSeries =
    isSeries && node.children.every((child) => child.type === "transistor");
  const connector = isSeries ? "then" : "or";

  return (
    <div
      className={`min-w-max rounded-lg border px-3 py-2 ${
        isSeries
          ? "border-slate-300 bg-slate-50"
          : "border-emerald-200 bg-emerald-50/50"
      }`}
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`rounded px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide ${
            isSeries
              ? "bg-slate-800 text-white"
              : "bg-emerald-600 text-white"
          }`}
        >
          {node.type}
        </span>
        <span className="text-xs text-slate-500">
          {isSeries ? "current path" : "alternate paths"}
        </span>
      </div>
      <div
        className={`${
          compactSeries
            ? "flex flex-wrap items-center gap-2"
            : "grid min-w-[220px] gap-2"
        }`}
      >
        {node.children.map((child, index) => (
          <div
            key={`${node.type}-${depth}-${index}`}
            className={compactSeries ? "contents" : "flex flex-col items-start gap-2"}
          >
            <NetworkNodeView node={child} depth={depth + 1} />
            {index < node.children.length - 1 && (
              <span
                className={`w-fit rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                  isSeries
                    ? "bg-white text-slate-500"
                    : "bg-white text-emerald-700"
                }`}
              >
                {connector}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TransistorChip({
  kind,
  label
}: {
  kind: TransistorKind;
  label: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-md border bg-white px-2.5 py-1.5 font-mono text-xs font-semibold ${
        kind === "pmos"
          ? "border-rose-200 text-rose-700"
          : "border-blue-200 text-blue-700"
      }`}
    >
      <span
        className={`h-2 w-2 rounded-full ${
          kind === "pmos" ? "bg-rose-500" : "bg-blue-500"
        }`}
      />
      {kind.toUpperCase()}({label})
    </span>
  );
}

function compactNetworkExpression(node: CmosNetworkNode): string {
  if (node.type === "transistor") {
    return `${node.kind.toUpperCase()}(${node.label})`;
  }

  const joiner = node.type === "series" ? " series " : " parallel ";
  return `(${node.children.map(compactNetworkExpression).join(joiner)})`;
}
