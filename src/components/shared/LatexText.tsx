import { Fragment } from "react";
import { BlockMath, InlineMath } from "react-katex";

interface LatexTextProps {
  text: string;
}

const LATEX_TOKEN_REGEX = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g;

export function LatexText({ text }: LatexTextProps) {
  const segments = text.split(LATEX_TOKEN_REGEX).filter(Boolean);

  return (
    <>
      {segments.map((segment, index) => {
        if (segment.startsWith("$$") && segment.endsWith("$$")) {
          return (
            <span key={`block-${index}`} className="block my-2">
              <BlockMath math={segment.slice(2, -2)} />
            </span>
          );
        }

        if (segment.startsWith("$") && segment.endsWith("$")) {
          return <InlineMath key={`inline-${index}`} math={segment.slice(1, -1)} />;
        }

        return <Fragment key={`text-${index}`}>{segment}</Fragment>;
      })}
    </>
  );
}
