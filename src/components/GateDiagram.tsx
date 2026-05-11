import type { ReactNode } from "react";
import { getVariables } from "../logic/kmap";
import type { LogicVariable, ProductTerm, VariableCount } from "../logic/types";

export type GateWireStyle = "curved" | "straight";

interface GateDiagramProps {
  variableCount: VariableCount;
  terms: ProductTerm[];
  expression: string;
  wireStyle?: GateWireStyle;
  variableLabels?: Record<LogicVariable, string>;
}

const TERM_COLORS = [
  "#2563eb",
  "#059669",
  "#dc2626",
  "#7c3aed",
  "#d97706",
  "#0891b2",
  "#be123c",
  "#4f46e5"
];

const MIN_WIDTH = 900;
const LEGEND_COLUMNS = 3;

export function GateDiagram({
  variableCount,
  terms,
  expression,
  wireStyle = "curved",
  variableLabels
}: GateDiagramProps) {
  const variables = getVariables(variableCount);
  const title = formatDiagramTitle(expression, terms, variableLabels);

  if (terms.length === 0) {
    return (
      <DiagramFrame height={230} title={title} width={MIN_WIDTH}>
        <ConstantCircuit value="0" width={MIN_WIDTH} />
      </DiagramFrame>
    );
  }

  if (expression === "1") {
    return (
      <DiagramFrame height={230} title={title} width={MIN_WIDTH}>
        <ConstantCircuit value="1" width={MIN_WIDTH} />
      </DiagramFrame>
    );
  }

  const legendRows = Math.max(1, Math.ceil(terms.length / LEGEND_COLUMNS));
  const headerHeight = 84 + legendRows * 24;
  const inputSpacing = 48;
  const maxLiteralCount = Math.max(1, ...terms.map((term) => term.literals.length));
  const termSpacing = Math.max(106, maxLiteralCount * 24 + 50);
  const inputTop = headerHeight + 34;
  const termTop = headerHeight + 28;
  const inputRailStartX = 88;
  const branchStartX = 154;
  const termLaneSpacing = wireStyle === "straight" ? 28 : 36;
  const literalLaneSpacing = wireStyle === "straight" ? 8 : 12;
  const literalBranchX = new Map<string, number>();
  let maxBranchX = branchStartX;

  terms.forEach((term, termIndex) => {
    term.literals.forEach((literal, literalIndex) => {
      const branchX =
        branchStartX + termIndex * termLaneSpacing + literalIndex * literalLaneSpacing;
      literalBranchX.set(
        literalRouteKey(term.id, literal.variable, literalIndex),
        branchX
      );
      maxBranchX = Math.max(maxBranchX, branchX);
    });
  });

  const inputBusEndX = Math.max(maxBranchX + 24, inputRailStartX + 170);
  const gateX = inputBusEndX + 104;
  const gateOutputX = gateX + 98;
  const mergeX = gateOutputX + 48;
  const hasOrGate = terms.length > 1;
  const orX = hasOrGate ? mergeX + 92 : 0;
  const orOutputX = hasOrGate ? orX + 126 : 0;
  const outputX = hasOrGate ? orOutputX + 112 : mergeX + 160;
  const diagramWidth = Math.max(MIN_WIDTH, outputX + 96);
  const termYs = terms.map((_, index) => termTop + index * termSpacing);
  const orY = termYs.reduce((sum, y) => sum + y, 0) / termYs.length;
  const orPinYs = makePinYs(orY, terms.length, 28);
  const inputY = new Map<LogicVariable, number>(
    variables.map((variable, index) => [variable, inputTop + index * inputSpacing])
  );
  const height = Math.max(
    340,
    inputTop + variables.length * inputSpacing + 74,
    termTop + terms.length * termSpacing + 64
  );

  return (
    <DiagramFrame height={height} title={title} width={diagramWidth}>
      <TermLegend terms={terms} variableLabels={variableLabels} />

      <g>
        {variables.map((variable) => (
          <InputRail
            key={variable}
            label={variableLabels?.[variable] ?? variable}
            y={inputY.get(variable) ?? inputTop}
            x1={inputRailStartX}
            x2={inputBusEndX}
          />
        ))}
      </g>

      <g>
        {terms.map((term, termIndex) => {
          const termY = termYs[termIndex];
          const color = TERM_COLORS[termIndex % TERM_COLORS.length];
          const pinYs = makePinYs(termY, term.literals.length, 24);
          const gateHeight = Math.max(62, term.literals.length * 24 + 18);
          const outputStartX =
            term.literals.length > 1 ? gateOutputX : gateX + 36;

          return (
            <g key={term.id}>
              {term.literals.map((literal, literalIndex) => {
                const sourceY = inputY.get(literal.variable) ?? inputTop;
                const targetY = pinYs[literalIndex];
                const notX = gateX - 52;
                const inputEndX = literal.negated ? notX : gateX;
                const branchX =
                  literalBranchX.get(
                    literalRouteKey(term.id, literal.variable, literalIndex)
                  ) ?? inputBusEndX;

                return (
                  <g key={`${term.id}-${literal.variable}-${literalIndex}`}>
                    <path
                      d={makeManhattanPath({
                        endX: inputEndX,
                        endY: targetY,
                        routeX: branchX,
                        startX: branchX - 14,
                        startY: sourceY
                      })}
                      fill="none"
                      stroke={color}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2.25"
                      opacity="0.9"
                    />
                    <circle cx={branchX} cy={sourceY} r="3.45" fill={color} />
                    {literal.negated && (
                      <>
                        <NotGate x={notX} y={targetY} color={color} />
                        <line
                          x1={notX + 31}
                          y1={targetY}
                          x2={gateX}
                          y2={targetY}
                          stroke={color}
                          strokeLinecap="round"
                          strokeWidth="2.25"
                          opacity="0.9"
                        />
                      </>
                    )}
                  </g>
                );
              })}

              {term.literals.length > 1 ? (
                <AndGate
                  color={color}
                  fanIn={term.literals.length}
                  height={gateHeight}
                  x={gateX}
                  y={termY}
                />
              ) : (
                <LiteralTap color={color} x={gateX} y={termY} />
              )}

              {hasOrGate ? (
                <path
                  d={makeManhattanPath({
                    endX: orX + 8,
                    endY: orPinYs[termIndex],
                    routeX: mergeX,
                    startX: outputStartX,
                    startY: termY
                  })}
                  fill="none"
                  stroke={color}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.55"
                />
              ) : (
                <line
                  x1={outputStartX}
                  y1={termY}
                  x2={outputX}
                  y2={termY}
                  stroke={color}
                  strokeLinecap="round"
                  strokeWidth="2.55"
                />
              )}
              <circle
                cx={hasOrGate ? mergeX : outputStartX}
                cy={termY}
                r="3.6"
                fill={color}
              />
            </g>
          );
        })}
      </g>

      {hasOrGate ? (
        <g>
          <line
            x1={mergeX}
            y1={Math.min(...termYs)}
            x2={mergeX}
            y2={Math.max(...termYs)}
            stroke="#94a3b8"
            strokeLinecap="round"
            strokeWidth="2"
            opacity="0.65"
          />
          <OrGate fanIn={terms.length} inputYs={orPinYs} x={orX} y={orY} />
          <line
            x1={orOutputX}
            y1={orY}
            x2={outputX}
            y2={orY}
            stroke="#475569"
            strokeLinecap="round"
            strokeWidth="2.55"
          />
          <OutputTerminal x={outputX} y={orY} />
        </g>
      ) : (
        <OutputTerminal x={outputX} y={termYs[0]} />
      )}
    </DiagramFrame>
  );
}

interface DiagramFrameProps {
  width: number;
  height: number;
  title: string;
  children: ReactNode;
}

function DiagramFrame({ width, height, title, children }: DiagramFrameProps) {
  return (
    <div className="overflow-x-auto rounded-md bg-slate-50">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block max-w-none"
        style={{ height: "auto", minWidth: "660px", width: "100%" }}
        role="img"
        aria-label="Gate-level circuit diagram"
      >
        <defs>
          <pattern id="circuitGrid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M24 0H0V24" fill="none" stroke="#e2e8f0" strokeWidth="0.75" />
          </pattern>
          <filter id="gateShadow" x="-20%" y="-20%" width="140%" height="150%">
            <feDropShadow dx="0" dy="5" stdDeviation="5" floodColor="#0f172a" floodOpacity="0.12" />
          </filter>
        </defs>
        <rect width={width} height={height} rx="8" fill="#f8fafc" />
        <rect width={width} height={height} rx="8" fill="url(#circuitGrid)" opacity="0.62" />
        <text x="34" y="36" className="fill-slate-900 text-lg font-bold">
          {title}
        </text>
        {children}
      </svg>
    </div>
  );
}

function TermLegend({
  terms,
  variableLabels
}: {
  terms: ProductTerm[];
  variableLabels: Record<LogicVariable, string> | undefined;
}) {
  return (
    <g>
      {terms.map((term, index) => {
        const col = index % LEGEND_COLUMNS;
        const row = Math.floor(index / LEGEND_COLUMNS);
        const x = 36 + col * 190;
        const y = 62 + row * 24;
        const color = TERM_COLORS[index % TERM_COLORS.length];

        return (
          <g key={term.id}>
            <line
              x1={x}
              y1={y}
              x2={x + 22}
              y2={y}
              stroke={color}
              strokeLinecap="round"
              strokeWidth="3"
            />
            <circle cx={x + 11} cy={y} r="3.2" fill={color} />
            <text x={x + 32} y={y + 4} className="fill-slate-600 text-xs font-semibold">
              {`term ${index + 1}: ${formatTermLabel(term, variableLabels)}`}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function InputRail({
  label,
  x1,
  x2,
  y
}: {
  label: string;
  x1: number;
  x2: number;
  y: number;
}) {
  return (
    <g>
      <text
        x="64"
        y={y + 5}
        textAnchor="end"
        className="fill-slate-900 text-sm font-bold"
      >
        {label}
      </text>
      <line
        x1={x1}
        y1={y}
        x2={x2}
        y2={y}
        stroke="#64748b"
        strokeLinecap="round"
        strokeWidth="2.2"
      />
      <circle cx={x1} cy={y} r="3.1" fill="#ffffff" stroke="#64748b" strokeWidth="1.8" />
    </g>
  );
}

function ConstantCircuit({ value, width }: { value: "0" | "1"; width: number }) {
  const y = 122;
  const color = value === "1" ? "#059669" : "#64748b";
  const outputX = width - 92;

  return (
    <g>
      <rect
        x="54"
        y={y - 20}
        width="46"
        height="40"
        rx="8"
        fill="#ffffff"
        stroke={color}
        strokeWidth="2"
      />
      <text
        x="77"
        y={y + 6}
        textAnchor="middle"
        className="fill-slate-800 text-lg font-bold"
      >
        {value}
      </text>
      <line
        x1="100"
        y1={y}
        x2={outputX}
        y2={y}
        stroke={color}
        strokeLinecap="round"
        strokeWidth="2.5"
      />
      <OutputTerminal x={outputX} y={y} />
    </g>
  );
}

function AndGate({
  color,
  fanIn,
  height,
  x,
  y
}: {
  color: string;
  fanIn: number;
  height: number;
  x: number;
  y: number;
}) {
  const halfHeight = height / 2;
  const rightX = x + 96;
  const flatRight = x + 42;

  return (
    <g filter="url(#gateShadow)">
      <path
        d={`M${x} ${y - halfHeight} H${flatRight} C${rightX} ${
          y - halfHeight
        }, ${rightX} ${y + halfHeight}, ${flatRight} ${
          y + halfHeight
        } H${x} Z`}
        fill="#ffffff"
        stroke={color}
        strokeWidth="2.25"
      />
      <text
        x={x + 43}
        y={y + 5}
        textAnchor="middle"
        className="fill-slate-700 text-[11px] font-bold"
      >
        {fanIn > 2 ? `AND${fanIn}` : "AND"}
      </text>
    </g>
  );
}

function OrGate({
  fanIn,
  inputYs,
  x,
  y
}: {
  fanIn: number;
  inputYs: number[];
  x: number;
  y: number;
}) {
  const label = fanIn === 3 ? "OR3" : `OR${fanIn}`;
  const halfHeight = Math.max(46, ((fanIn - 1) * 28) / 2 + 22);

  return (
    <g filter="url(#gateShadow)">
      {inputYs.map((inputY, index) => (
        <line
          key={`${inputY}-${index}`}
          x1={x + 8}
          y1={inputY}
          x2={x + 24}
          y2={inputY}
          stroke="#475569"
          strokeLinecap="round"
          strokeWidth="2.25"
        />
      ))}
      <path
        d={`M${x} ${y - halfHeight} C${x + 40} ${y - halfHeight + 8}, ${x + 96} ${
          y - 20
        }, ${x + 126} ${y} C${x + 96} ${y + 20}, ${x + 40} ${
          y + halfHeight - 8
        }, ${x} ${y + halfHeight} C${x + 22} ${y + 16}, ${x + 22} ${
          y - 16
        }, ${x} ${y - halfHeight} Z`}
        fill="#ffffff"
        stroke="#475569"
        strokeWidth="2.25"
      />
      <text
        x={x + 65}
        y={y + 5}
        textAnchor="middle"
        className="fill-slate-700 text-[11px] font-bold"
      >
        {label}
      </text>
      {fanIn !== 3 && (
        <text
          x={x + 65}
          y={y + 22}
          textAnchor="middle"
          className="fill-slate-400 text-[9px] font-semibold"
        >
          fan-in {fanIn}
        </text>
      )}
    </g>
  );
}

function NotGate({ color, x, y }: { color: string; x: number; y: number }) {
  return (
    <g>
      <path
        d={`M${x} ${y - 11} L${x} ${y + 11} L${x + 20} ${y} Z`}
        fill="#ffffff"
        stroke={color}
        strokeWidth="2"
      />
      <circle cx={x + 25} cy={y} r="4.25" fill="#ffffff" stroke={color} strokeWidth="2" />
    </g>
  );
}

function LiteralTap({ color, x, y }: { color: string; x: number; y: number }) {
  return (
    <g>
      <rect
        x={x + 4}
        y={y - 10}
        width="28"
        height="20"
        rx="5"
        fill="#ffffff"
        stroke={color}
        strokeWidth="2"
      />
      <line
        x1={x + 32}
        y1={y}
        x2={x + 36}
        y2={y}
        stroke={color}
        strokeLinecap="round"
        strokeWidth="2.5"
      />
    </g>
  );
}

function OutputTerminal({ x, y }: { x: number; y: number }) {
  return (
    <text x={x + 12} y={y + 5} className="fill-slate-800 text-sm font-bold">
      F
    </text>
  );
}

function makePinYs(centerY: number, count: number, spacing: number): number[] {
  if (count <= 1) return [centerY];

  return Array.from(
    { length: count },
    (_, index) => centerY - ((count - 1) * spacing) / 2 + index * spacing
  );
}

function makeManhattanPath({
  endX,
  endY,
  routeX,
  startX,
  startY
}: {
  endX: number;
  endY: number;
  routeX: number;
  startX: number;
  startY: number;
}) {
  return `M${startX} ${startY} H${routeX} V${endY} H${endX}`;
}

function formatDiagramTitle(
  expression: string,
  terms: ProductTerm[],
  labels: Record<LogicVariable, string> | undefined
): string {
  if (expression === "0" || expression === "1") return `F = ${expression}`;

  const display = terms
    .map((term) => formatTermLabel(term, labels))
    .join(" + ");
  return `F = ${display || expression}`;
}

function formatTermLabel(
  term: ProductTerm,
  labels: Record<LogicVariable, string> | undefined
): string {
  if (term.literals.length === 0) return "1";
  const parts = term.literals.map((literal) => {
    const label = labels?.[literal.variable] ?? literal.variable;
    return `${label}${literal.negated ? "'" : ""}`;
  });
  const usesCustomName = parts.some((part) => part.replace("'", "").length > 1);

  return parts.join(usesCustomName ? "*" : "");
}

function literalRouteKey(
  termId: string,
  variable: LogicVariable,
  literalIndex: number
): string {
  return `${termId}-${variable}-${literalIndex}`;
}
