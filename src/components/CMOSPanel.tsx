import { useState } from "react";
import type { CmosNetworkNode, CmosPlan, TransistorKind } from "../logic/cmos";
import { CMOSSchematic, type CmosSymbolStyle } from "./CMOSSchematic";
import { SizingPanel } from "./SizingPanel";

interface CMOSPanelProps {
  includeOutputInverter: boolean;
  onIncludeOutputInverterChange: (include: boolean) => void;
  plan: CmosPlan;
}

export function CMOSPanel({
  includeOutputInverter,
  onIncludeOutputInverterChange,
  plan
}: CMOSPanelProps) {
  const [styleOpen, setStyleOpen] = useState(false);
  const [symbolStyle, setSymbolStyle] = useState<CmosSymbolStyle>("compact");

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
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
                  className={`rounded px-2.5 py-1 text-xs font-semibold transition ${
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
          <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
            {plan.coreGateName}
          </span>
          <button
            type="button"
            onClick={() => setStyleOpen((open) => !open)}
            className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-white"
            aria-expanded={styleOpen}
          >
            Style
          </button>
        </div>
        {styleOpen && (
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
                    className={`rounded-md border px-3 py-2 text-left transition hover:bg-slate-50 ${
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
      </div>

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

      <SizingPanel plan={plan} />

      <div className="mt-4">
        <CMOSSchematic plan={plan} symbolStyle={symbolStyle} />
      </div>

      <div className="mt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          SPICE-like Netlist
        </h3>
        <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-slate-950 p-4 text-xs leading-5 text-cyan-100">
          <code>{plan.netlist}</code>
        </pre>
      </div>
    </section>
  );
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
