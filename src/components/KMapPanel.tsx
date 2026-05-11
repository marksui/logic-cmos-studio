import type {
  LogicVariable,
  OutputValue,
  SimplificationResult
} from "../logic/types";

interface KMapPanelProps {
  result: SimplificationResult;
  onToggle: (minterm: number) => void;
  variableLabels?: Record<LogicVariable, string>;
}

const GROUP_COLORS = [
  "#2563eb",
  "#059669",
  "#dc2626",
  "#7c3aed",
  "#d97706",
  "#0891b2",
  "#be123c",
  "#4f46e5"
];

export function KMapPanel({ result, onToggle, variableLabels }: KMapPanelProps) {
  const { kmap, terms } = result;
  const groupIndexesByMinterm = new Map<number, number[]>();

  terms.forEach((term, termIndex) => {
    term.allCells.forEach((minterm) => {
      const indexes = groupIndexesByMinterm.get(minterm) ?? [];
      indexes.push(termIndex);
      groupIndexesByMinterm.set(minterm, indexes);
    });
  });

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-soft">
      <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          Karnaugh Map
        </h2>
        <div className="flex flex-wrap gap-2 text-xs text-slate-500">
          <span>{formatVariableSet(kmap.rowVariables, variableLabels)} rows</span>
          <span className="text-slate-300">/</span>
          <span>{formatVariableSet(kmap.colVariables, variableLabels)} columns</span>
        </div>
      </div>
      <div className="overflow-x-auto p-4">
        <div
          className="grid min-w-0 gap-2"
          style={{
            gridTemplateColumns: `minmax(46px, 64px) repeat(${kmap.cols}, minmax(0, 1fr))`
          }}
        >
          <div className="flex h-12 items-end justify-end pr-2 text-xs font-semibold text-slate-400">
            {formatVariableSet(kmap.colVariables, variableLabels)}
          </div>
          {kmap.colLabels.map((label) => (
            <div
              key={label}
              className="flex h-12 items-center justify-center rounded-md bg-slate-100 font-mono text-sm font-semibold text-slate-600"
            >
              {label}
            </div>
          ))}

          {kmap.rowLabels.map((rowLabel, rowIndex) => (
            <KMapRow
              key={rowLabel}
              rowLabel={rowLabel}
              cells={kmap.cells[rowIndex]}
              groupIndexesByMinterm={groupIndexesByMinterm}
              onToggle={onToggle}
            />
          ))}
        </div>
      </div>
      {terms.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-slate-100 px-4 py-3">
          {terms.map((term, index) => (
            <span
              key={term.id}
              className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700"
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: GROUP_COLORS[index % GROUP_COLORS.length] }}
              />
              {term.expression}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

interface KMapRowProps {
  rowLabel: string;
  cells: SimplificationResult["kmap"]["cells"][number];
  groupIndexesByMinterm: Map<number, number[]>;
  onToggle: (minterm: number) => void;
}

function KMapRow({
  rowLabel,
  cells,
  groupIndexesByMinterm,
  onToggle
}: KMapRowProps) {
  return (
    <>
      <div className="flex h-20 items-center justify-center rounded-md bg-slate-100 font-mono text-sm font-semibold text-slate-600">
        {rowLabel}
      </div>
      {cells.map((cell) => {
        const groupIndexes = groupIndexesByMinterm.get(cell.minterm) ?? [];

        return (
          <button
            key={cell.minterm}
            type="button"
            onClick={() => onToggle(cell.minterm)}
            className={`relative h-20 overflow-hidden rounded-lg border p-2 text-left transition hover:-translate-y-px hover:shadow-md ${cellClass(
              cell.value
            )}`}
            aria-label={`Toggle K-map cell for minterm ${cell.minterm}`}
          >
            <span className="block text-xs font-medium opacity-70">
              m{cell.minterm}
            </span>
            <span className="mt-1 block text-center text-2xl font-bold">
              {cell.value}
            </span>
            {groupIndexes.length > 0 && (
              <span className="absolute inset-x-2 bottom-2 flex gap-1">
                {groupIndexes.map((groupIndex) => (
                  <span
                    key={groupIndex}
                    className="h-1.5 flex-1 rounded-full"
                    style={{
                      backgroundColor:
                        GROUP_COLORS[groupIndex % GROUP_COLORS.length]
                    }}
                  />
                ))}
              </span>
            )}
          </button>
        );
      })}
    </>
  );
}

function cellClass(value: OutputValue): string {
  if (value === "1") {
    return "border-emerald-300 bg-emerald-50 text-emerald-800";
  }

  if (value === "X") {
    return "border-amber-300 bg-amber-50 text-amber-800";
  }

  return "border-slate-200 bg-white text-slate-500";
}

function formatVariableSet(
  variables: LogicVariable[],
  labels?: Record<LogicVariable, string>
): string {
  const display = variables.map((variable) => labels?.[variable] ?? variable);
  const separator = display.every((label) => label.length === 1) ? "" : "·";
  return display.join(separator);
}
