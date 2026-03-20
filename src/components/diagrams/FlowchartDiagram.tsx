import type { FlowchartData } from "@/types/question";

interface FlowchartDiagramProps {
  data: FlowchartData;
}

export function FlowchartDiagram({ data }: FlowchartDiagramProps) {
  const nodePositions = calculateNodePositions(data);

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

          const midX = (fromPos.x + toPos.x) / 2;
          const midY = (fromPos.y + toPos.y) / 2;

          return (
            <g key={index}>
              <line
                x1={fromPos.x}
                y1={fromPos.y + 20}
                x2={toPos.x}
                y2={toPos.y - 20}
                stroke="#000"
                strokeWidth="2"
                markerEnd="url(#arrowhead-bw)"
              />
              {edge.label && (
                <text
                  x={midX}
                  y={midY}
                  textAnchor="middle"
                  fontSize="12"
                  fill="#000"
                >
                  {edge.label}
                </text>
              )}
            </g>
          );
        })}

        {data.nodes.map((node) => {
          const pos = nodePositions[node.id];
          if (!pos) return null;

          return (
            <g key={node.id}>
              <rect
                x={pos.x - 60}
                y={pos.y - 20}
                width="120"
                height="40"
                rx="4"
                fill="white"
                stroke="#000"
                strokeWidth="2"
              />
              <text
                x={pos.x}
                y={pos.y + 5}
                textAnchor="middle"
                fontSize="12"
                fontWeight="500"
                fill="#000"
              >
                {node.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function calculateNodePositions(
  data: FlowchartData
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
  } else {
    const rowHeight = 280 / Math.max(nodeCount, 1);
    data.nodes.forEach((node, index) => {
      positions[node.id] = {
        x: 200,
        y: 30 + index * rowHeight,
      };
    });
  }

  return positions;
}
