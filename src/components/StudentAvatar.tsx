type StudentAvatarProps = { label: string };

export function StudentAvatar({ label }: StudentAvatarProps) {
  const initials = label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  return (
    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#16a34a]/10 text-xs font-semibold text-[#166534]">
      {initials || "?"}
    </span>
  );
}
