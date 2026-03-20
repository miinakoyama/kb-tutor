import type { SvgDiagramData } from "@/types/question";

interface SvgDiagramProps {
  data: SvgDiagramData;
}

export function SvgDiagram({ data }: SvgDiagramProps) {
  return (
    <div className="w-full bg-white p-4 border border-gray-300 rounded">
      {data.title && (
        <h3 className="text-center text-sm font-bold text-black mb-2">
          {data.title}
        </h3>
      )}
      <div className="flex justify-center items-center">
        <div
          className="w-[50%] max-w-[460px] min-w-[220px] [&_svg]:!w-full [&_svg]:!h-auto [&_svg]:!max-w-full [&_svg]:block"
          dangerouslySetInnerHTML={{ __html: data.svg }}
        />
      </div>
    </div>
  );
}
