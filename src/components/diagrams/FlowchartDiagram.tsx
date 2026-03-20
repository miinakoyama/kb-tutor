import type { FlowchartData } from "@/types/question";

interface FlowchartDiagramProps {
  data: FlowchartData;
}

const NODE_WIDTH = 140;
const NODE_MIN_HEIGHT = 40;
const NODE_LINE_HEIGHT = 14;
const MAX_LABEL_LINES = 3;
const MAX_CHARS_PER_LINE = 18;
const EDGE_LABEL_BG_HEIGHT = 16;

function getOffsetEdgeLabelPosition(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): { x: number; y: number } {
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  return { x: midX, y: midY };
}

function wrapLabel(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [""];

  const words = trimmed.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    // Break very long single words to avoid overflow.
    const chunks =
      word.length > MAX_CHARS_PER_LINE
        ? word.match(new RegExp(`.{1,${MAX_CHARS_PER_LINE}}`, "g")) || [word]
        : [word];

    for (const chunk of chunks) {
      const candidate = current ? `${current} ${chunk}` : chunk;
      if (candidate.length <= MAX_CHARS_PER_LINE) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = chunk;
      }
    }
  }

  if (current) lines.push(current);
  if (lines.length <= MAX_LABEL_LINES) return lines;

  const truncated = lines.slice(0, MAX_LABEL_LINES);
  truncated[MAX_LABEL_LINES - 1] = `${truncated[MAX_LABEL_LINES - 1].replace(/\.*$/, "")}...`;
  return truncated;
}

export function FlowchartDiagram({ data }: FlowchartDiagramProps) {
  const nodeLabelLines = Object.fromEntries(
    data.nodes.map((node) => [node.id, wrapLabel(node.label)])
  );
  const nodeHeights = Object.fromEntries(
    data.nodes.map((node) => [
      node.id,
      Math.max(
        NODE_MIN_HEIGHT,
        nodeLabelLines[node.id].length * NODE_LINE_HEIGHT + 20
      ),
    ])
  );
  const nodePositions = calculateNodePositions(data, nodeHeights);

  return (
    <div className="w-full bg-white p-4 border border-gray-300 rounded">
      {data.title && (
        <h3 className="text-center text-sm font-bold text-black mb-2">
          {data.title}
        </h3>
      )}
      <svg
        viewBox="0 0 400 300"
        className="w-full h-auto max-h-[300px]"
        style={{ minHeight: "200px" }}
      >
        <defs>
          <marker
            id="arrowhead-bw"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#000" />
          </marker>
        </defs>

        {data.edges.map((edge, index) => {
          const fromPos = nodePositions[edge.from];
          const toPos = nodePositions[edge.to];
          if (!fromPos || !toPos) return null;
          const fromHeight = nodeHeights[edge.from] ?? NODE_MIN_HEIGHT;
          const toHeight = nodeHeights[edge.to] ?? NODE_MIN_HEIGHT;
          const startX = fromPos.x;
          const startY = fromPos.y + fromHeight / 2;
          const endX = toPos.x;
          const endY = toPos.y - toHeight / 2;
          const labelText = edge.label ?? "";
          const labelPos = getOffsetEdgeLabelPosition(startX, startY, endX, endY);
          const labelBgWidth = Math.min(150, Math.max(24, labelText.length * 6.6 + 8));

          return (
            <g key={index}>
              <line
                x1={startX}
                y1={startY}
                x2={endX}
                y2={endY}
                stroke="#000"
                strokeWidth="2"
                markerEnd="url(#arrowhead-bw)"
              />
              {edge.label && (
                <g>
                  <rect
                    x={labelPos.x - labelBgWidth / 2}
                    y={labelPos.y - EDGE_LABEL_BG_HEIGHT / 2}
                    width={labelBgWidth}
                    height={EDGE_LABEL_BG_HEIGHT}
                    rx="3"
                    fill="white"
                  />
                  <text
                    x={labelPos.x}
                    y={labelPos.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="12"
                    fill="#000"
                  >
                    {edge.label}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {data.nodes.map((node) => {
          const pos = nodePositions[node.id];
          if (!pos) return null;
          const lines = nodeLabelLines[node.id] ?? [node.label];
          const nodeHeight = nodeHeights[node.id] ?? NODE_MIN_HEIGHT;
          const textStartY = pos.y - ((lines.length - 1) * NODE_LINE_HEIGHT) / 2;

          return (
            <g key={node.id}>
              <rect
                x={pos.x - NODE_WIDTH / 2}
                y={pos.y - nodeHeight / 2}
                width={NODE_WIDTH}
                height={nodeHeight}
                rx="4"
                fill="white"
                stroke="#000"
                strokeWidth="2"
              />
              <text
                x={pos.x}
                y={textStartY}
                textAnchor="middle"
                fontSize="12"
                fontWeight="500"
                fill="#000"
              >
                {lines.map((line, index) => (
                  <tspan
                    key={`${node.id}-${index}`}
                    x={pos.x}
                    dy={index === 0 ? 0 : NODE_LINE_HEIGHT}
                  >
                    {line}
                  </tspan>
                ))}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function calculateNodePositions(
  data: FlowchartData,
  nodeHeights: Record<string, number>
): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};
  const nodeCount = data.nodes.length;

  if (nodeCount === 0) return positions;

  const hasExplicitPositions = data.nodes.some(
    (n) => n.x !== undefined && n.y !== undefined
  );

  if (hasExplicitPositions) {
    data.nodes.forEach((node) => {
      positions[node.id] = {
        x: node.x ?? 200,
        y: node.y ?? 150,
      };
    });

    // If explicit y-positions are too compressed, stretch them vertically
    // so arrow segments remain readable.
    const ys = data.nodes
      .map((node) => positions[node.id]?.y)
      .filter((y): y is number => typeof y === "number");
    if (ys.length >= 2) {
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const range = maxY - minY;

      if (range > 0 && range < 210) {
        const targetRange = 240;
        const scale = targetRange / range;
        const centerY = (minY + maxY) / 2;

        data.nodes.forEach((node) => {
          const current = positions[node.id];
          const stretchedY = centerY + (current.y - centerY) * scale;
          current.y = Math.max(24, Math.min(276, stretchedY));
        });
      }
    }
  } else {
    const topPadding = 18;
    const bottomPadding = 18;
    const availableHeight = 300 - topPadding - bottomPadding;
    const heights = data.nodes.map((node) => nodeHeights[node.id] ?? NODE_MIN_HEIGHT);
    const totalNodeHeight = heights.reduce((sum, height) => sum + height, 0);

    const gapCount = Math.max(nodeCount - 1, 1);
    const computedGap = Math.floor((availableHeight - totalNodeHeight) / gapCount);
    const gap = Math.max(16, computedGap);

    let cursorY = topPadding;
    data.nodes.forEach((node, index) => {
      const nodeHeight = heights[index];
      positions[node.id] = {
        x: 200,
        y: cursorY + nodeHeight / 2,
      };
      cursorY += nodeHeight + gap;
    });
  }

  return positions;
}
