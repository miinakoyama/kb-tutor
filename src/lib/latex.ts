export function stripLatexDelimiters(text: string): string {
  return text
    .replace(/\$\$([\s\S]+?)\$\$/g, "$1")
    .replace(/\$([^$\n]+?)\$/g, "$1");
}

export function stripLatexDelimitersOptional(
  value?: string
): string | undefined {
  if (typeof value !== "string") return value;
  return stripLatexDelimiters(value);
}
