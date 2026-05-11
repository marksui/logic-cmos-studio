import type {
  UniversalGateConversion,
  UniversalGateConversions
} from "../logic/universalGates";
import type { LogicVariable } from "../logic/types";

interface UniversalGatesPanelProps {
  conversions: UniversalGateConversions;
  variableLabels: Record<LogicVariable, string>;
}

export function UniversalGatesPanel({
  conversions,
  variableLabels
}: UniversalGatesPanelProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
        Universal Gate Conversion
      </h2>
      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        <ConversionCard
          conversion={conversions.nand}
          tone="blue"
          variableLabels={variableLabels}
        />
        <ConversionCard
          conversion={conversions.nor}
          tone="emerald"
          variableLabels={variableLabels}
        />
      </div>
    </section>
  );
}

function ConversionCard({
  conversion,
  tone,
  variableLabels
}: {
  conversion: UniversalGateConversion;
  tone: "blue" | "emerald";
  variableLabels: Record<LogicVariable, string>;
}) {
  const toneClass =
    tone === "blue"
      ? "border-blue-100 bg-blue-50/40 text-blue-700"
      : "border-emerald-100 bg-emerald-50/40 text-emerald-700";

  return (
    <article className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">
            {conversion.title}
          </h3>
          <p className="mt-1 text-xs font-medium text-slate-500">
            from minimized {conversion.sourceForm}
          </p>
        </div>
        <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${toneClass}`}>
          {conversion.gateCount} gates, depth {conversion.depth}
        </span>
      </div>

      <div className="mt-3 grid gap-2 text-sm">
        <Metric
          label="Source"
          value={`F = ${replaceBooleanVariables(
            conversion.sourceExpression,
            variableLabels
          )}`}
        />
        <Metric
          label="Implementation"
          value={`F = ${replaceStandaloneVariables(
            conversion.expression,
            variableLabels
          )}`}
        />
        <Metric label="Mix" value={formatPrimitiveMix(conversion)} />
      </div>

      <pre className="mt-3 whitespace-pre-wrap break-words rounded-md bg-slate-950 p-3 text-xs leading-5 text-emerald-100">
        <code>{replaceStandaloneVariables(conversion.verilogAssign, variableLabels)}</code>
      </pre>
    </article>
  );
}

function replaceBooleanVariables(
  expression: string,
  labels: Record<LogicVariable, string>
): string {
  return expression.replace(/[A-D]/g, (variable) => {
    const logicVariable = variable as LogicVariable;
    return labels[logicVariable] ?? variable;
  });
}

function replaceStandaloneVariables(
  expression: string,
  labels: Record<LogicVariable, string>
): string {
  return expression.replace(/\b[A-D]\b/g, (variable) => {
    const logicVariable = variable as LogicVariable;
    return labels[logicVariable] ?? variable;
  });
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 rounded-md bg-white px-3 py-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <code className="block break-words leading-6 text-slate-700">{value}</code>
    </div>
  );
}

function formatPrimitiveMix(conversion: UniversalGateConversion): string {
  return [
    `NAND ${conversion.primitiveCounts.NAND}`,
    `NOR ${conversion.primitiveCounts.NOR}`,
    `INV ${conversion.primitiveCounts.INV}`
  ].join(" / ");
}
