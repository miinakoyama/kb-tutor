import type { TableData } from "@/types/question";

interface TableDiagramProps {
  data: TableData;
}

export function TableDiagram({ data }: TableDiagramProps) {
  return (
    <div className="w-full overflow-x-auto bg-surface p-4">
      {data.title && (
        <h3 className="text-center text-sm font-bold text-foreground mb-2">
          {data.title}
        </h3>
      )}
      <table className="table-auto w-max min-w-[240px] sm:min-w-[320px] mx-auto border-collapse border-2 border-border-default text-sm">
        <thead>
          <tr className="bg-surface-muted">
            {data.headers.map((header, index) => (
              <th
                key={index}
                className="border border-border-default px-3 py-2 text-left font-bold text-foreground whitespace-nowrap"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className="border border-border-default px-3 py-2 text-foreground whitespace-nowrap"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
