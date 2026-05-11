import type { LogicVariable, OutputValue, TruthRow } from "../logic/types";

interface TruthTableProps {
  variables: LogicVariable[];
  labels?: string[];
  rows: TruthRow[];
  onToggle: (minterm: number) => void;
}

export function TruthTable({
  variables,
  labels = variables,
  rows,
  onToggle
}: TruthTableProps) {
  return (
    <div className="surface-card overflow-hidden">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          Truth Table
        </h2>
      </div>
      <div className="max-h-[560px] overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500">
            <tr>
              <th className="border-b border-slate-200 px-3 py-2 text-left font-medium">
                m
              </th>
              {variables.map((variable, index) => (
                <th
                  key={variable}
                  className="border-b border-slate-200 px-3 py-2 text-center font-medium"
                >
                  {labels[index] ?? variable}
                </th>
              ))}
              <th className="border-b border-slate-200 px-3 py-2 text-center font-medium">
                F
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.index} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2 font-mono text-xs text-slate-500">
                  {row.index}
                </td>
                {row.bits.map((bit, index) => (
                  <td
                    key={`${row.index}-${variables[index]}`}
                    className="px-3 py-2 text-center font-mono text-slate-700"
                  >
                    {bit}
                  </td>
                ))}
                <td className="px-3 py-2 text-center">
                  <button
                    type="button"
                    onClick={() => onToggle(row.index)}
                    className={`h-8 w-12 rounded-md border text-sm font-semibold transition hover:-translate-y-px hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30 ${outputClass(
                      row.value
                    )}`}
                    aria-label={`Toggle output for minterm ${row.index}`}
                  >
                    {row.value}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function outputClass(value: OutputValue): string {
  if (value === "1") {
    return "border-emerald-300 bg-emerald-50 text-emerald-700";
  }

  if (value === "X") {
    return "border-amber-300 bg-amber-50 text-amber-700";
  }

  return "border-slate-200 bg-white text-slate-500";
}
