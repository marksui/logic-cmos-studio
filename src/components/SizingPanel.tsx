import { useMemo, useState } from "react";
import type { CmosPlan } from "../logic/cmos";
import {
  analyzeSizing,
  type PathEstimate,
  type SizingOptions,
  type SkewMode
} from "../logic/sizing";

interface SizingPanelProps {
  plan: CmosPlan;
}

const SKEW_OPTIONS: { id: SkewMode; label: string }[] = [
  { id: "balanced", label: "Balanced" },
  { id: "fastRise", label: "Fast rise" },
  { id: "fastFall", label: "Fast fall" },
  { id: "lowPower", label: "Low power" }
];

export function SizingPanel({ plan }: SizingPanelProps) {
  const [options, setOptions] = useState<SizingOptions>({
    nmosUnitWidth: 1,
    pmosUnitWidth: 2,
    mobilityRatio: 2,
    fanout: 4,
    skewMode: "balanced"
  });
  const analysis = useMemo(() => analyzeSizing(plan, options), [plan, options]);

  function updateOption<K extends keyof SizingOptions>(
    key: K,
    value: SizingOptions[K]
  ) {
    setOptions((current) => ({ ...current, [key]: value }));
  }

  return (
    <section className="mt-5 border-t border-slate-100 pt-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
            Device Sizing & Skew
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Normalized RC estimates for stack sizing, edge skew, and input load.
          </p>
        </div>
        <div className="inline-flex flex-wrap gap-1 rounded-md border border-slate-200 bg-slate-50 p-1">
          {SKEW_OPTIONS.map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => updateOption("skewMode", mode.id)}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30 ${
                options.skewMode === mode.id
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="grid gap-3">
          <Control
            label="Unit NMOS W"
            max={6}
            min={0.5}
            step={0.5}
            value={options.nmosUnitWidth}
            onChange={(value) => updateOption("nmosUnitWidth", value)}
          />
          <Control
            label="Unit PMOS W"
            max={12}
            min={0.5}
            step={0.5}
            value={options.pmosUnitWidth}
            onChange={(value) => updateOption("pmosUnitWidth", value)}
          />
          <Control
            label="Mobility ratio"
            max={4}
            min={1}
            step={0.25}
            value={options.mobilityRatio}
            onChange={(value) => updateOption("mobilityRatio", value)}
          />
          <Control
            label="Fanout load"
            max={12}
            min={1}
            step={1}
            value={options.fanout}
            onChange={(value) => updateOption("fanout", value)}
          />
        </div>

        <div className="grid gap-3">
          <div className="grid gap-3 md:grid-cols-4">
            <Metric label="Worst PUN R" value={format(analysis.worstPullUpResistance)} />
            <Metric label="Worst PDN R" value={format(analysis.worstPullDownResistance)} />
            <Metric label="Rise/fall skew" value={format(analysis.riseFallSkew)} />
            <Metric label="FO delay" value={format(analysis.normalizedDelay)} />
          </div>
          <p className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
            {analysis.skewSummary}
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <CriticalPath
              label="Worst rise path"
              path={worstPath(analysis.pullUpPaths)}
            />
            <CriticalPath
              label="Worst fall path"
              path={worstPath(analysis.pullDownPaths)}
            />
          </div>
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_280px]">
            <DeviceTable analysis={analysis} />
            <div className="grid content-start gap-3">
              <div className="rounded-md bg-slate-50 px-3 py-2">
                <span className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Input capacitance
                </span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {analysis.inputCaps.length > 0 ? (
                    analysis.inputCaps.map((entry) => (
                      <span
                        key={entry.variable}
                        className="rounded-md border border-slate-200 bg-white px-2.5 py-1 font-mono text-xs text-slate-700"
                      >
                        {entry.variable}: {format(entry.capacitance)}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-slate-500">none</span>
                  )}
                </div>
              </div>
              <div className="rounded-md bg-slate-50 px-3 py-2">
                <span className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Notes
                </span>
                <ul className="mt-2 grid gap-1 text-sm text-slate-600">
                  {analysis.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Control({
  label,
  max,
  min,
  onChange,
  step,
  value
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  value: number;
}) {
  return (
    <label className="rounded-md bg-slate-50 px-3 py-2">
      <span className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(clamp(Number(event.target.value), min, max))}
          className="w-16 rounded border border-slate-200 bg-white px-2 py-1 text-right text-xs font-semibold text-slate-700 outline-none focus:border-slate-900 focus:ring-2 focus:ring-sky-500/20"
        />
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-3 w-full accent-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30"
      />
    </label>
  );
}

function DeviceTable({
  analysis
}: {
  analysis: ReturnType<typeof analyzeSizing>;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Suggested device widths
      </div>
      <div className="max-h-72 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Type</th>
              <th className="px-3 py-2 text-left font-semibold">Gate</th>
              <th className="px-3 py-2 text-right font-semibold">Stack</th>
              <th className="px-3 py-2 text-right font-semibold">W</th>
              <th className="px-3 py-2 text-right font-semibold">R</th>
            </tr>
          </thead>
          <tbody>
            {analysis.devices.length > 0 ? (
              analysis.devices.map((device) => (
                <tr key={device.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-mono text-xs text-slate-600">
                    {device.kind.toUpperCase()}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-700">
                    {device.label}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-slate-600">
                    {device.maxStack}x
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-slate-800">
                    {format(device.recommendedWidth)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-slate-600">
                    {format(device.unitResistance)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-3 py-5 text-center text-slate-500">
                  No switching devices.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 px-3 py-2">
      <span className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <code className="mt-1 block text-slate-700">{value}</code>
    </div>
  );
}

function CriticalPath({
  label,
  path
}: {
  label: string;
  path: PathEstimate | null;
}) {
  return (
    <div className="rounded-md bg-slate-50 px-3 py-2">
      <span className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <code className="mt-1 block break-words text-xs text-slate-700">
        {path ? `${path.stack} / R=${format(path.resistance)}` : "none"}
      </code>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function format(value: number): string {
  if (!Number.isFinite(value)) return "n/a";
  return Number.isInteger(value) ? `${value}` : value.toFixed(2);
}

function worstPath(paths: PathEstimate[]): PathEstimate | null {
  if (paths.length === 0) return null;
  return paths.reduce((worst, path) =>
    path.resistance > worst.resistance ? path : worst
  );
}
