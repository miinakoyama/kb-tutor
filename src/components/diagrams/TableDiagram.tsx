import type { TableData } from "@/types/question";

interface TableDiagramProps {
  data: TableData;
}

export function TableDiagram({ data }: TableDiagramProps) {
  return (
    <div className="w-full overflow-x-auto bg-white p-4">
      {data.title && (
        <h3 className="text-center text-sm font-bold text-black mb-2">
          {data.title}
        </h3>
      )}
      <table className="w-full border-collapse border-2 border-black text-sm">
        <thead>
          <tr className="bg-gray-100">
            {data.headers.map((header, index) => (
              <th
                key={index}
                className="border border-black px-3 py-2 text-left font-bold text-black"
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
                  className="border border-black px-3 py-2 text-black"
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
