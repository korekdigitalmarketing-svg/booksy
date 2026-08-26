import Image from "next/image";
import { Link } from "@/i18n/navigation";

// Intrinsic size of public/brand/korek-booking-logo.png (2172×724) — files under
// public/ aren't processed by Next's static-import pipeline, so next/image
// needs explicit dimensions here rather than an imported module.
export function SiteHeader() {
  return (
    <header className="border-b border-border/60">
      <div className="mx-auto flex max-w-5xl items-center px-6 py-4">
        <Link href="/" className="flex items-center" aria-label="Korek Booking home">
          <Image
            src="/brand/korek-booking-logo.png"
            alt="Korek Booking"
            width={2172}
            height={724}
            className="h-10 w-auto sm:h-11"
            priority
          />
        </Link>
      </div>
    </header>
  );
}
