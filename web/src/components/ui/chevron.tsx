export function ChevronIcon({
  direction = "down",
  className = "h-5 w-5",
}: {
  direction?: "up" | "down";
  className?: string;
}) {
  const d = direction === "up" ? "m18 15-6-6-6 6" : "m6 9 6 6 6-6";
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d={d} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
