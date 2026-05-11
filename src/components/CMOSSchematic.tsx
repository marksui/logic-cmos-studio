import type { CmosNetworkNode, CmosPlan, TransistorKind } from "../logic/cmos";

export type CmosSymbolStyle = "compact" | "textbook";

interface CMOSSchematicProps {
  plan: CmosPlan;
  symbolStyle: CmosSymbolStyle;
}

interface NetworkLayout {
  width: number;
  height: number;
}

export function CMOSSchematic({ plan, symbolStyle }: CMOSSchematicProps) {
  if (!plan.pullDown || !plan.pullUp) {
    return <ConstantSchematic value={plan.coreGateName === "CONST1"} />;
  }

  const metrics = getSymbolMetrics(symbolStyle);
  const punLayout = measureNetwork(plan.pullUp, symbolStyle);
  const pdnLayout = measureNetwork(plan.pullDown, symbolStyle);
  const networkWidth = Math.max(punLayout.width, pdnLayout.width, 260);
  const left = 58;
  const rightExtra = plan.requiresOutputInverter ? 270 : 150;
  const width = Math.max(760, left + networkWidth + rightExtra);
  const vddY = 34;
  const punY = 72;
  const coreY = punY + punLayout.height + 42;
  const pdnY = coreY + 42;
  const gndY = pdnY + pdnLayout.height + 42;
  const height = gndY + 44;
  const rootX = left + networkWidth / 2;
  const punX = left + (networkWidth - punLayout.width) / 2;
  const pdnX = left + (networkWidth - pdnLayout.width) / 2;
  const coreWireEndX = plan.requiresOutputInverter
    ? left + networkWidth + 66
    : width - 96;

  return (
    <div className="max-w-full overflow-x-auto rounded-md border border-slate-200 bg-white">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block w-full min-w-[720px]"
        role="img"
        aria-label="Static CMOS transistor schematic"
      >
        <defs>
          <pattern id="cmosGrid" width="22" height="22" patternUnits="userSpaceOnUse">
            <path d="M22 0H0V22" fill="none" stroke="#e2e8f0" strokeWidth="0.7" />
          </pattern>
        </defs>
        <rect width={width} height={height} rx="8" fill="#f8fafc" />
        <rect width={width} height={height} rx="8" fill="url(#cmosGrid)" opacity="0.56" />

        <Rail label="VDD" x1={28} x2={width - 28} y={vddY} color="#dc2626" />
        <Rail label="GND" x1={28} x2={width - 28} y={gndY} color="#475569" />

        <line x1={rootX} y1={vddY} x2={rootX} y2={punY} className="stroke-rose-500" strokeWidth="2.4" />
        <NetworkView
          node={plan.pullUp}
          x={punX}
          y={punY}
          layout={punLayout}
          symbolStyle={symbolStyle}
        />
        <line
          x1={rootX}
          y1={punY + punLayout.height}
          x2={rootX}
          y2={coreY}
          className="stroke-slate-500"
          strokeWidth="2.4"
        />

        <circle cx={rootX} cy={coreY} r="5.5" className="fill-white stroke-slate-700" strokeWidth="2.2" />
        <text x={rootX + 12} y={coreY - 9} className="fill-slate-700 text-xs font-bold">
          {plan.coreOutputNode}
        </text>

        <line
          x1={rootX}
          y1={coreY}
          x2={coreWireEndX}
          y2={coreY}
          className="stroke-slate-500"
          strokeLinecap="round"
          strokeWidth="2.4"
        />

        <line
          x1={rootX}
          y1={coreY}
          x2={rootX}
          y2={pdnY}
          className="stroke-slate-500"
          strokeWidth="2.4"
        />
        <NetworkView
          node={plan.pullDown}
          x={pdnX}
          y={pdnY}
          layout={pdnLayout}
          symbolStyle={symbolStyle}
        />
        <line
          x1={rootX}
          y1={pdnY + pdnLayout.height}
          x2={rootX}
          y2={gndY}
          className="stroke-slate-500"
          strokeWidth="2.4"
        />

        {plan.requiresOutputInverter ? (
          <OutputInverter
            inputX={coreWireEndX}
            inputY={coreY}
            outputX={width - 86}
            symbolStyle={symbolStyle}
            vddY={vddY}
            gndY={gndY}
          />
        ) : (
          <OutputLabel x={coreWireEndX} y={coreY} label={plan.coreOutputNode} />
        )}

        {plan.inputInverters.length > 0 && (
          <g>
            <rect
              x={width - 222}
              y={gndY - Math.max(24, metrics.height / 3)}
              width="168"
              height="28"
              rx="6"
              className="fill-white stroke-amber-200"
            />
            <text x={width - 210} y={gndY - 6} className="fill-amber-700 text-xs font-semibold">
              input inverters: {plan.inputInverters.map((variable) => `${variable}'`).join(", ")}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

function ConstantSchematic({ value }: { value: boolean }) {
  const width = 760;
  const height = 220;
  const y = 110;
  const railY = value ? 36 : 184;
  const color = value ? "#dc2626" : "#475569";

  return (
    <div className="max-w-full overflow-x-auto rounded-md border border-slate-200 bg-white">
      <svg viewBox={`0 0 ${width} ${height}`} className="block w-full min-w-[640px]">
        <rect width={width} height={height} rx="8" fill="#f8fafc" />
        <Rail label="VDD" x1={28} x2={width - 28} y={36} color="#dc2626" />
        <Rail label="GND" x1={28} x2={width - 28} y={184} color="#475569" />
        <line x1="120" y1={railY} x2="120" y2={y} stroke={color} strokeWidth="2.6" />
        <line x1="120" y1={y} x2="665" y2={y} stroke={color} strokeWidth="2.6" />
        <OutputLabel x={665} y={y} />
      </svg>
    </div>
  );
}

function NetworkView({
  layout,
  node,
  symbolStyle,
  x,
  y
}: {
  layout: NetworkLayout;
  node: CmosNetworkNode;
  symbolStyle: CmosSymbolStyle;
  x: number;
  y: number;
}) {
  if (node.type === "transistor") {
    return (
      <TransistorSymbol
        node={node}
        x={x}
        y={y}
        width={layout.width}
        height={layout.height}
        symbolStyle={symbolStyle}
      />
    );
  }

  if (node.type === "series") {
    const metrics = getSymbolMetrics(symbolStyle);
    let cursorY = y;
    const children = node.children.map((child, index) => {
      const childLayout = measureNetwork(child, symbolStyle);
      const childX = x + (layout.width - childLayout.width) / 2;
      const previousY = cursorY;
      cursorY += childLayout.height + metrics.seriesGap;

      return { child, childLayout, childX, childY: previousY, index };
    });

    return (
      <g>
        {children.map(({ child, childLayout, childX, childY, index }) => (
          <g key={`${childY}-${index}`}>
            {index > 0 && (
              <line
                x1={x + layout.width / 2}
                y1={childY - metrics.seriesGap}
                x2={x + layout.width / 2}
                y2={childY}
                className="stroke-slate-500"
                strokeWidth="2.2"
              />
            )}
            <NetworkView
              node={child}
              x={childX}
              y={childY}
              layout={childLayout}
              symbolStyle={symbolStyle}
            />
          </g>
        ))}
      </g>
    );
  }

  const topY = y;
  const bottomY = y + layout.height;
  let cursorX = x;
  const childYPad = 26;
  const metrics = getSymbolMetrics(symbolStyle);
  const children = node.children.map((child, index) => {
    const childLayout = measureNetwork(child, symbolStyle);
    const childY = y + childYPad + (layout.height - childYPad * 2 - childLayout.height) / 2;
    const childX = cursorX;
    cursorX += childLayout.width + metrics.parallelGap;

    return { child, childLayout, childX, childY, index };
  });
  const firstCenter = children[0].childX + children[0].childLayout.width / 2;
  const last = children[children.length - 1];
  const lastCenter = last.childX + last.childLayout.width / 2;

  return (
    <g>
      <line x1={firstCenter} y1={topY} x2={lastCenter} y2={topY} className="stroke-slate-500" strokeWidth="2.2" />
      <line x1={firstCenter} y1={bottomY} x2={lastCenter} y2={bottomY} className="stroke-slate-500" strokeWidth="2.2" />
      {children.map(({ child, childLayout, childX, childY, index }) => {
        const center = childX + childLayout.width / 2;

        return (
          <g key={`${childX}-${index}`}>
            <line x1={center} y1={topY} x2={center} y2={childY} className="stroke-slate-500" strokeWidth="2.2" />
            <NetworkView
              node={child}
              x={childX}
              y={childY}
              layout={childLayout}
              symbolStyle={symbolStyle}
            />
            <line
              x1={center}
              y1={childY + childLayout.height}
              x2={center}
              y2={bottomY}
              className="stroke-slate-500"
              strokeWidth="2.2"
            />
          </g>
        );
      })}
    </g>
  );
}

function TransistorSymbol({
  height,
  node,
  symbolStyle,
  width,
  x,
  y
}: {
  height: number;
  node: Extract<CmosNetworkNode, { type: "transistor" }>;
  symbolStyle: CmosSymbolStyle;
  width: number;
  x: number;
  y: number;
}) {
  if (symbolStyle === "textbook") {
    return (
      <TextbookTransistorSymbol
        height={height}
        node={node}
        width={width}
        x={x}
        y={y}
      />
    );
  }

  const cx = x + width / 2;
  const top = y;
  const bottom = y + height;
  const channelTop = y + 14;
  const channelBottom = y + height - 14;
  const gateX = cx - 22;
  const gateY = (channelTop + channelBottom) / 2;
  const color = node.kind === "pmos" ? "#dc2626" : "#2563eb";

  return (
    <g>
      <line x1={cx} y1={top} x2={cx} y2={channelTop} className="stroke-slate-500" strokeWidth="2.2" />
      <line x1={cx} y1={channelBottom} x2={cx} y2={bottom} className="stroke-slate-500" strokeWidth="2.2" />
      <line x1={cx} y1={channelTop} x2={cx} y2={channelBottom} stroke={color} strokeWidth="3" />
      <line x1={gateX} y1={channelTop + 4} x2={gateX} y2={channelBottom - 4} stroke={color} strokeWidth="2.4" />
      <line x1={gateX - 18} y1={gateY} x2={gateX} y2={gateY} stroke={color} strokeWidth="2.1" />
      {node.kind === "pmos" && (
        <circle
          cx={gateX - 23}
          cy={gateY}
          r="4.2"
          className="fill-white"
          stroke={color}
          strokeWidth="2"
        />
      )}
      <rect
        x={gateX - 55}
        y={gateY - 12}
        width="30"
        height="24"
        rx="6"
        className="fill-white stroke-slate-200"
      />
      <text x={gateX - 40} y={gateY + 4} textAnchor="middle" className="fill-slate-700 text-xs font-bold">
        {node.label}
      </text>
    </g>
  );
}

function TextbookTransistorSymbol({
  height,
  node,
  width,
  x,
  y
}: {
  height: number;
  node: Extract<CmosNetworkNode, { type: "transistor" }>;
  width: number;
  x: number;
  y: number;
}) {
  const cx = x + width / 2 + 10;
  const color = node.kind === "pmos" ? "#dc2626" : "#2563eb";
  const channelTop = y + 18;
  const channelBottom = y + height - 18;
  const gateX = cx - 24;
  const gateY = (channelTop + channelBottom) / 2;
  const bubbleCx = gateX - 8;
  const gateLineStart = node.kind === "pmos" ? bubbleCx - 22 : gateX - 32;
  const gateLineEnd = node.kind === "pmos" ? bubbleCx - 4 : gateX;

  return (
    <g>
      <TerminalLabel label="D" x={cx + 13} y={channelTop - 7} />
      <TerminalLabel label="S" x={cx + 13} y={channelBottom + 11} />
      <text
        x={gateLineStart - 8}
        y={gateY + 4}
        textAnchor="end"
        className="fill-slate-600 text-[11px] font-bold"
      >
        {node.label}
      </text>

      <line x1={cx} y1={y} x2={cx} y2={channelTop} className="stroke-slate-600" strokeWidth="2.1" />
      <line x1={cx} y1={channelBottom} x2={cx} y2={y + height} className="stroke-slate-600" strokeWidth="2.1" />
      <line x1={cx} y1={channelTop} x2={cx} y2={channelBottom} stroke={color} strokeWidth="2.8" />
      <line x1={gateX} y1={channelTop + 3} x2={gateX} y2={channelBottom - 3} stroke={color} strokeWidth="2.1" />
      <line x1={gateLineStart} y1={gateY} x2={gateLineEnd} y2={gateY} stroke={color} strokeWidth="2.1" />
      {node.kind === "pmos" && (
        <circle cx={bubbleCx} cy={gateY} r="4.2" fill="#fff" stroke={color} strokeWidth="2" />
      )}
      <path
        d={
          node.kind === "nmos"
            ? `M${gateX - 6} ${gateY} l-9 -5 v10 z`
            : `M${gateX - 4} ${gateY} l9 -5 v10 z`
        }
        fill={color}
        opacity="0.9"
      />
    </g>
  );
}

function TerminalLabel({
  label,
  x,
  y
}: {
  label: "D" | "S";
  x: number;
  y: number;
}) {
  return (
    <g>
      <rect
        x={x - 7}
        y={y - 9}
        width="14"
        height="14"
        rx="3"
        className="fill-white/90 stroke-slate-200"
      />
      <text
        x={x}
        y={y + 2}
        textAnchor="middle"
        className="fill-slate-500 text-[8px] font-bold"
      >
        {label}
      </text>
    </g>
  );
}

function OutputInverter({
  gndY,
  inputX,
  inputY,
  outputX,
  symbolStyle,
  vddY
}: {
  gndY: number;
  inputX: number;
  inputY: number;
  outputX: number;
  symbolStyle: CmosSymbolStyle;
  vddY: number;
}) {
  const invX = inputX + 48;
  const outNodeX = invX + 70;
  const pY = inputY - 58;
  const nY = inputY + 58;

  return (
    <g>
      <text x={invX - 6} y={inputY - 80} className="fill-slate-500 text-xs font-bold">
        output inverter
      </text>
      <line x1={inputX} y1={inputY} x2={invX - 10} y2={inputY} className="stroke-slate-500" strokeWidth="2.4" />
      <line x1={invX - 10} y1={pY} x2={invX - 10} y2={nY} className="stroke-slate-500" strokeWidth="2.1" />
      <SmallTransistor
        kind="pmos"
        gateX={invX - 10}
        x={invX + 10}
        y={pY}
        label="nY"
        symbolStyle={symbolStyle}
      />
      <SmallTransistor
        kind="nmos"
        gateX={invX - 10}
        x={invX + 10}
        y={nY}
        label="nY"
        symbolStyle={symbolStyle}
      />
      <line x1={invX + 42} y1={vddY} x2={invX + 42} y2={pY - 20} className="stroke-rose-500" strokeWidth="2.2" />
      <line x1={invX + 42} y1={pY + 20} x2={outNodeX} y2={inputY} className="stroke-slate-500" strokeWidth="2.2" />
      <line x1={invX + 42} y1={nY - 20} x2={outNodeX} y2={inputY} className="stroke-slate-500" strokeWidth="2.2" />
      <line x1={invX + 42} y1={nY + 20} x2={invX + 42} y2={gndY} className="stroke-slate-500" strokeWidth="2.2" />
      <line x1={outNodeX} y1={inputY} x2={outputX} y2={inputY} className="stroke-slate-500" strokeWidth="2.4" />
      <OutputLabel x={outputX} y={inputY} />
    </g>
  );
}

function SmallTransistor({
  gateX,
  kind,
  label,
  symbolStyle,
  x,
  y
}: {
  gateX: number;
  kind: TransistorKind;
  label: string;
  symbolStyle: CmosSymbolStyle;
  x: number;
  y: number;
}) {
  const color = kind === "pmos" ? "#dc2626" : "#2563eb";

  if (symbolStyle === "textbook") {
    return (
      <g>
        <line x1={x + 32} y1={y - 22} x2={x + 32} y2={y + 22} stroke={color} strokeWidth="3" />
        <line x1={x + 8} y1={y - 16} x2={x + 8} y2={y + 16} stroke={color} strokeWidth="2.2" />
        <line x1={gateX} y1={y} x2={kind === "pmos" ? x : x + 8} y2={y} stroke={color} strokeWidth="2.1" />
        {kind === "pmos" && <circle cx={x + 2} cy={y} r="4" fill="#fff" stroke={color} strokeWidth="2" />}
        <text x={x + 44} y={y + 4} className="fill-slate-600 text-[11px] font-bold">
          {label}
        </text>
      </g>
    );
  }

  return (
    <g>
      <line x1={x + 32} y1={y - 20} x2={x + 32} y2={y + 20} stroke={color} strokeWidth="3" />
      <line x1={x + 8} y1={y - 16} x2={x + 8} y2={y + 16} stroke={color} strokeWidth="2.2" />
      <line x1={gateX} y1={y} x2={x + 8} y2={y} stroke={color} strokeWidth="2.1" />
      {kind === "pmos" && <circle cx={x + 2} cy={y} r="4" fill="#fff" stroke={color} strokeWidth="2" />}
      <text x={x + 44} y={y + 4} className="fill-slate-600 text-[11px] font-bold">
        {label}
      </text>
    </g>
  );
}

function Rail({
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
      <line x1={x1} y1={y} x2={x2} y2={y} stroke={color} strokeWidth="3" strokeLinecap="round" />
      <text x={x1} y={y - 9} className="fill-slate-700 text-xs font-bold">
        {label}
      </text>
    </g>
  );
}

function OutputLabel({
  label = "Y",
  x,
  y
}: {
  label?: "Y" | "nY";
  x: number;
  y: number;
}) {
  return (
    <g>
      <circle cx={x} cy={y} r="5.4" className="fill-white stroke-slate-700" strokeWidth="2.2" />
      <text x={x + 18} y={y + 5} className="fill-slate-800 text-sm font-bold">
        {label}
      </text>
    </g>
  );
}

function measureNetwork(node: CmosNetworkNode, symbolStyle: CmosSymbolStyle): NetworkLayout {
  const metrics = getSymbolMetrics(symbolStyle);

  if (node.type === "transistor") {
    return { width: metrics.width, height: metrics.height };
  }

  const childLayouts = node.children.map((child) => measureNetwork(child, symbolStyle));

  if (node.type === "series") {
    return {
      width: Math.max(...childLayouts.map((layout) => layout.width)),
      height:
        childLayouts.reduce((height, layout) => height + layout.height, 0) +
        metrics.seriesGap * (childLayouts.length - 1)
    };
  }

  return {
    width:
      childLayouts.reduce((width, layout) => width + layout.width, 0) +
      metrics.parallelGap * (childLayouts.length - 1),
    height: Math.max(...childLayouts.map((layout) => layout.height)) + 52
  };
}

function getSymbolMetrics(symbolStyle: CmosSymbolStyle) {
  if (symbolStyle === "textbook") {
    return {
      width: 116,
      height: 72,
      seriesGap: 20,
      parallelGap: 38
    };
  }

  return {
    width: 92,
    height: 62,
    seriesGap: 24,
    parallelGap: 34
  };
}
