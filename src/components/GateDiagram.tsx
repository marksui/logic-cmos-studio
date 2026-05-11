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

const INPUT_COLORS = ["#2563eb", "#059669", "#dc2626", "#7c3aed"];
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

export function GateDiagram({
  variableCount,
  terms,
  expression,
  wireStyle = "curved",
  variableLabels
}: GateDiagramProps) {
  const variables = getVariables(variableCount);
  const width = 860;
  const topPadding = 70;
  const inputSpacing = 52;
  const termSpacing = 92;
  const height = Math.max(
    300,
    topPadding + variables.length * inputSpacing + 64,
    76 + terms.length * termSpacing + 16
  );
  const inputY = new Map<LogicVariable, number>(
    variables.map((variable, index) => [variable, topPadding + index * inputSpacing])
  );

  if (terms.length === 0) {
    return (
      <DiagramFrame height={220} width={width}>
        <ConstantCircuit value="0" width={width} />
      </DiagramFrame>
    );
  }

  if (expression === "1") {
    return (
      <DiagramFrame height={220} width={width}>
        <ConstantCircuit value="1" width={width} />
      </DiagramFrame>
    );
  }

  const termYs = terms.map((_, index) => 92 + index * termSpacing);
  const orY = termYs.reduce((sum, y) => sum + y, 0) / termYs.length;
  const hasOrGate = terms.length > 1;
  const inputRailStartX = 76;
  const branchStartX = 150;
  const termBranchSpacing = 30;
  const literalBranchSpacing = 9;
  const literalBranchX = new Map<string, number>();
  let maxBranchX = branchStartX;
  terms.forEach((term, termIndex) => {
    term.literals.forEach((literal, literalIndex) => {
      const branchX =
        branchStartX + termIndex * termBranchSpacing + literalIndex * literalBranchSpacing;
      literalBranchX.set(
        literalRouteKey(term.id, literal.variable, literalIndex),
        branchX
      );
      maxBranchX = Math.max(maxBranchX, branchX);
    });
  });
  const inputBusEndX = Math.max(maxBranchX + 22, inputRailStartX + 140);
  const gateX = Math.max(342, inputBusEndX + 88);
  const collectorX = gateX + 186;
  const orX = collectorX + 72;
  const outputX = orX + 200;
  const diagramWidth = Math.max(width, outputX + 70);

  return (
    <DiagramFrame height={height} width={diagramWidth}>
      <g>
        {variables.map((variable, index) => (
          <InputRail
            key={variable}
            color={INPUT_COLORS[index % INPUT_COLORS.length]}
            label={variableLabels?.[variable] ?? variable}
            y={inputY.get(variable) ?? topPadding}
            x1={inputRailStartX}
            x2={inputBusEndX}
          />
        ))}
      </g>

      <g>
        {terms.map((term, termIndex) => {
          const termY = termYs[termIndex];
          const color = TERM_COLORS[termIndex % TERM_COLORS.length];
          const literalYs = term.literals.map(
            (_, literalIndex) =>
              termY - ((term.literals.length - 1) * 18) / 2 + literalIndex * 18
          );
          const outputStartX = term.literals.length > 1 ? gateX + 86 : gateX + 36;

          return (
            <g key={term.id}>
              {term.literals.map((literal, literalIndex) => {
                const sourceY = inputY.get(literal.variable) ?? topPadding;
                const targetY = literalYs[literalIndex];
                const notX = gateX - 72;
                const inputEndX = literal.negated ? notX - 18 : gateX;
                const branchX =
                  literalBranchX.get(
                    literalRouteKey(term.id, literal.variable, literalIndex)
                  ) ?? inputBusEndX;
                const routeX =
                  wireStyle === "straight" ? branchX : (branchX + inputEndX) / 2;

                return (
                  <g key={`${term.id}-${literal.variable}`}>
                    <path
                      d={makeWirePath({
                        endX: inputEndX,
                        endY: targetY,
                        routeX,
                        startX: branchX,
                        startY: sourceY,
                        wireStyle
                      })}
                      fill="none"
                      stroke={color}
                      strokeLinecap="round"
                      strokeWidth="2.25"
                      opacity="0.82"
                    />
                    <circle cx={branchX} cy={sourceY} r="3.35" fill={color} />
                    {literal.negated && (
                      <>
                        <NotGate x={notX} y={targetY} color={color} />
                        <line
                          x1={notX + 28}
                          y1={targetY}
                          x2={gateX}
                          y2={targetY}
                          stroke={color}
                          strokeLinecap="round"
                          strokeWidth="2.25"
                          opacity="0.82"
                        />
                      </>
                    )}
                  </g>
                );
              })}

              {term.literals.length > 1 ? (
                <AndGate color={color} x={gateX} y={termY} />
              ) : (
                <LiteralTap color={color} x={gateX} y={termY} />
              )}

              <TermBadge
                color={color}
                label={formatTermLabel(term, variableLabels)}
                x={gateX + 8}
                y={termY + 34}
              />

              {hasOrGate ? (
                <>
                  <line
                    x1={outputStartX}
                    y1={termY}
                    x2={collectorX}
                    y2={termY}
                    stroke={color}
                    strokeLinecap="round"
                    strokeWidth="2.5"
                  />
                  <circle cx={collectorX} cy={termY} r="3.5" fill={color} />
                </>
              ) : (
                <>
                  <path
                    d={`M${outputStartX} ${termY} H${outputX}`}
                    fill="none"
                    stroke={color}
                    strokeLinecap="round"
                    strokeWidth="2.5"
                  />
                  <OutputPort x={outputX} y={termY} />
                </>
              )}
            </g>
          );
        })}
      </g>

      {hasOrGate && (
        <g>
          <line
            x1={collectorX}
            y1={Math.min(...termYs)}
            x2={collectorX}
            y2={Math.max(...termYs)}
            stroke="#94a3b8"
            strokeLinecap="round"
            strokeWidth="2"
            opacity="0.7"
          />
          <path
            d={`M${collectorX} ${orY} H${orX}`}
            fill="none"
            stroke="#475569"
            strokeLinecap="round"
            strokeWidth="2.5"
          />
          <OrGate x={orX} y={orY} />
          <line
            x1={orX + 108}
            y1={orY}
            x2={outputX}
            y2={orY}
            stroke="#475569"
            strokeLinecap="round"
            strokeWidth="2.5"
          />
          <OutputPort x={outputX} y={orY} />
        </g>
      )}
    </DiagramFrame>
  );
}

interface DiagramFrameProps {
  width: number;
  height: number;
  children: ReactNode;
}

function DiagramFrame({ width, height, children }: DiagramFrameProps) {
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
        {children}
      </svg>
    </div>
  );
}

function InputRail({
  color,
  label,
  x1,
  x2,
  y
}: {
  color: string;
  label: string;
  x1: number;
  x2: number;
  y: number;
}) {
  return (
    <g>
      <text
        x="46"
        y={y + 6}
        textAnchor="end"
        className="fill-slate-900 text-base font-bold"
      >
        {label}
      </text>
      <line
        x1={x1}
        y1={y}
        x2={x2}
        y2={y}
        stroke={color}
        strokeLinecap="round"
        strokeWidth="2.6"
      />
    </g>
  );
}

function ConstantCircuit({ value, width }: { value: "0" | "1"; width: number }) {
  const y = 110;
  const color = value === "1" ? "#059669" : "#64748b";

  return (
    <g>
      <rect
        x="34"
        y={y - 20}
        width="46"
        height="40"
        rx="8"
        fill="#ffffff"
        stroke={color}
        strokeWidth="2"
      />
      <text
        x="57"
        y={y + 6}
        textAnchor="middle"
        className="fill-slate-800 text-lg font-bold"
      >
        {value}
      </text>
      <line
        x1="80"
        y1={y}
        x2={width - 72}
        y2={y}
        stroke={color}
        strokeLinecap="round"
        strokeWidth="2.5"
      />
      <OutputPort x={width - 72} y={y} />
    </g>
  );
}

function AndGate({ color, x, y }: { color: string; x: number; y: number }) {
  return (
    <g filter="url(#gateShadow)">
      <path
        d={`M${x} ${y - 29} H${x + 38} C${x + 82} ${y - 29}, ${x + 82} ${
          y + 29
        }, ${x + 38} ${y + 29} H${x} Z`}
        fill="#ffffff"
        stroke={color}
        strokeWidth="2.25"
      />
      <text
        x={x + 37}
        y={y + 5}
        textAnchor="middle"
        className="fill-slate-700 text-[11px] font-bold"
      >
        AND
      </text>
    </g>
  );
}

function OrGate({ x, y }: { x: number; y: number }) {
  return (
    <g filter="url(#gateShadow)">
      <path
        d={`M${x} ${y - 40} C${x + 38} ${y - 34}, ${x + 84} ${
          y - 18
        }, ${x + 108} ${y} C${x + 84} ${y + 18}, ${x + 38} ${
          y + 34
        }, ${x} ${y + 40} C${x + 20} ${y + 14}, ${x + 20} ${
          y - 14
        }, ${x} ${y - 40} Z`}
        fill="#ffffff"
        stroke="#475569"
        strokeWidth="2.25"
      />
      <text
        x={x + 56}
        y={y + 5}
        textAnchor="middle"
        className="fill-slate-700 text-[11px] font-bold"
      >
        OR
      </text>
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
      <circle cx={x + 18} cy={y} r="8.5" fill="#ffffff" stroke={color} strokeWidth="2.25" />
      <line
        x1={x + 26}
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

function TermBadge({
  color,
  label,
  x,
  y
}: {
  color: string;
  label: string;
  x: number;
  y: number;
}) {
  const width = Math.max(44, label.length * 8 + 18);

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height="24"
        rx="6"
        fill="#ffffff"
        stroke="#e2e8f0"
      />
      <circle cx={x + 12} cy={y + 12} r="3.5" fill={color} />
      <text x={x + 22} y={y + 16} className="fill-slate-600 text-xs font-semibold">
        {label}
      </text>
    </g>
  );
}

function OutputPort({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r="5" fill="#ffffff" stroke="#475569" strokeWidth="2.25" />
      <text x={x + 20} y={y + 5} className="fill-slate-800 text-sm font-bold">
        F
      </text>
    </g>
  );
}

function makeWirePath({
  endX,
  endY,
  routeX,
  startX,
  startY,
  wireStyle
}: {
  endX: number;
  endY: number;
  routeX: number;
  startX: number;
  startY: number;
  wireStyle: GateWireStyle;
}) {
  if (wireStyle === "straight") {
    return `M${startX} ${startY} V${endY} H${endX}`;
  }

  return `M${startX} ${startY} C${routeX} ${startY}, ${routeX} ${endY}, ${endX} ${endY}`;
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
