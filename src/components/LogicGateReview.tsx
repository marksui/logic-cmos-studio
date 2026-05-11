type GateKind =
  | "and"
  | "buffer"
  | "nand"
  | "nor"
  | "not"
  | "or"
  | "xnor"
  | "xor";

interface GateDefinition {
  description: string;
  expression: string;
  id: GateKind;
  inputs: 1 | 2;
  name: string;
  operator: string;
}

const GATES: GateDefinition[] = [
  {
    description: "Passes the input through unchanged.",
    expression: "Y = A",
    id: "buffer",
    inputs: 1,
    name: "Buffer",
    operator: "buffer A"
  },
  {
    description: "Inverts the input.",
    expression: "Y = ~A",
    id: "not",
    inputs: 1,
    name: "NOT",
    operator: "not A"
  },
  {
    description: "Outputs 1 only when both inputs are 1.",
    expression: "Y = A * B",
    id: "and",
    inputs: 2,
    name: "AND",
    operator: "A and B"
  },
  {
    description: "Inverted AND.",
    expression: "Y = ~(A * B)",
    id: "nand",
    inputs: 2,
    name: "NAND",
    operator: "A nand B"
  },
  {
    description: "Outputs 1 when at least one input is 1.",
    expression: "Y = A + B",
    id: "or",
    inputs: 2,
    name: "OR",
    operator: "A or B"
  },
  {
    description: "Inverted OR.",
    expression: "Y = ~(A + B)",
    id: "nor",
    inputs: 2,
    name: "NOR",
    operator: "A nor B"
  },
  {
    description: "Outputs 1 when inputs are different.",
    expression: "Y = A xor B",
    id: "xor",
    inputs: 2,
    name: "XOR",
    operator: "A xor B"
  },
  {
    description: "Outputs 1 when inputs are the same.",
    expression: "Y = A xnor B",
    id: "xnor",
    inputs: 2,
    name: "XNOR",
    operator: "A xnor B"
  }
];

export function LogicGateReview() {
  return (
    <section className="grid gap-5">
      <div className="surface-card p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
              Gate Review
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Symbols, formulas, supported input words, and truth tables for common logic gates.
            </p>
          </div>
          <span className="w-fit rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-xs font-semibold text-slate-600">
            {GATES.length} gates
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {GATES.map((gate) => (
          <article key={gate.id} className="surface-card overflow-hidden">
            <div className="grid gap-4 p-4 md:grid-cols-[220px_minmax(0,1fr)]">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <GateSymbol gate={gate.id} />
              </div>
              <div className="grid content-start gap-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-bold text-slate-950">{gate.name}</h3>
                    <p className="mt-1 text-sm text-slate-500">{gate.description}</p>
                  </div>
                  <span className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700">
                    {gate.inputs} input{gate.inputs > 1 ? "s" : ""}
                  </span>
                </div>
                <div className="grid gap-2 text-sm">
                  <ReviewMetric label="Expression" value={gate.expression} />
                  <ReviewMetric label="Formula input" value={gate.operator} />
                </div>
              </div>
            </div>
            <TruthTableMini gate={gate} />
          </article>
        ))}
      </div>
    </section>
  );
}

function ReviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 px-3 py-2">
      <span className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <code className="mt-1 block text-slate-700">{value}</code>
    </div>
  );
}

function TruthTableMini({ gate }: { gate: GateDefinition }) {
  const rows = gate.inputs === 1 ? [[0], [1]] : [[0, 0], [0, 1], [1, 0], [1, 1]];

  return (
    <div className="border-t border-slate-100 px-4 pb-4">
      <div className="mt-3 overflow-hidden rounded-md border border-slate-200">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="border-b border-slate-200 px-3 py-2 text-center font-semibold">
                A
              </th>
              {gate.inputs === 2 && (
                <th className="border-b border-slate-200 px-3 py-2 text-center font-semibold">
                  B
                </th>
              )}
              <th className="border-b border-slate-200 px-3 py-2 text-center font-semibold">
                Y
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((bits) => (
              <tr key={bits.join("")} className="border-t border-slate-100">
                <td className="px-3 py-2 text-center font-mono text-slate-700">
                  {bits[0]}
                </td>
                {gate.inputs === 2 && (
                  <td className="px-3 py-2 text-center font-mono text-slate-700">
                    {bits[1]}
                  </td>
                )}
                <td className="px-3 py-2 text-center">
                  <span
                    className={`inline-grid h-7 w-10 place-items-center rounded-md border font-mono font-semibold ${outputClass(
                      evaluateGate(gate.id, bits)
                    )}`}
                  >
                    {evaluateGate(gate.id, bits)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function outputClass(value: 0 | 1): string {
  return value === 1
    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
    : "border-slate-200 bg-white text-slate-500";
}

function evaluateGate(gate: GateKind, bits: number[]): 0 | 1 {
  const a = bits[0] === 1;
  const b = bits[1] === 1;

  if (gate === "buffer") return a ? 1 : 0;
  if (gate === "not") return a ? 0 : 1;
  if (gate === "and") return a && b ? 1 : 0;
  if (gate === "nand") return a && b ? 0 : 1;
  if (gate === "or") return a || b ? 1 : 0;
  if (gate === "nor") return a || b ? 0 : 1;
  if (gate === "xor") return a !== b ? 1 : 0;
  return a === b ? 1 : 0;
}

function GateSymbol({ gate }: { gate: GateKind }) {
  return (
    <svg
      aria-label={`${gate.toUpperCase()} logic gate symbol`}
      className="h-32 w-full"
      role="img"
      viewBox="0 0 220 120"
    >
      <g
        fill="none"
        stroke="#0f172a"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="7"
      >
        {gate === "buffer" && <BufferGate inverted={false} />}
        {gate === "not" && <BufferGate inverted />}
        {gate === "and" && <AndGate inverted={false} />}
        {gate === "nand" && <AndGate inverted />}
        {gate === "or" && <OrGate inverted={false} xor={false} />}
        {gate === "nor" && <OrGate inverted xor={false} />}
        {gate === "xor" && <OrGate inverted={false} xor />}
        {gate === "xnor" && <OrGate inverted xor />}
      </g>
    </svg>
  );
}

function AndGate({ inverted }: { inverted: boolean }) {
  const outStart = inverted ? 158 : 144;
  return (
    <>
      <line x1="18" x2="82" y1="42" y2="42" />
      <line x1="18" x2="82" y1="78" y2="78" />
      <path d="M82 24 H122 C154 24 154 96 122 96 H82 Z" />
      {inverted && <circle cx="164" cy="60" fill="#fff" r="10" />}
      <line x1={outStart} x2="202" y1="60" y2="60" />
    </>
  );
}

function BufferGate({ inverted }: { inverted: boolean }) {
  const outStart = inverted ? 158 : 144;
  return (
    <>
      <line x1="28" x2="82" y1="60" y2="60" />
      <path d="M82 26 L82 94 L146 60 Z" />
      {inverted && <circle cx="164" cy="60" fill="#fff" r="10" />}
      <line x1={outStart} x2="202" y1="60" y2="60" />
    </>
  );
}

function OrGate({ inverted, xor }: { inverted: boolean; xor: boolean }) {
  const outStart = inverted ? 160 : 146;
  return (
    <>
      <line x1="18" x2="76" y1="42" y2="42" />
      <line x1="18" x2="76" y1="78" y2="78" />
      {xor && <path d="M54 24 C74 48 74 72 54 96" />}
      <path d="M70 24 C104 27 135 39 154 60 C135 81 104 93 70 96 C90 74 90 46 70 24 Z" />
      {inverted && <circle cx="166" cy="60" fill="#fff" r="10" />}
      <line x1={outStart} x2="202" y1="60" y2="60" />
    </>
  );
}
