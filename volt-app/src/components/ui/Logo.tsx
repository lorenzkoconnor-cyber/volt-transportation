import Image from "next/image";

// Official Volt Transportation logo (white wordmark + yellow bolt, transparent bg).
// Source aspect ratio is 1200x383.
export default function Logo({
  className = "h-9 w-auto",
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/images/volt-logo.png"
      alt="Volt Transportation"
      width={1200}
      height={383}
      sizes="200px"
      priority={priority}
      className={className}
    />
  );
}
