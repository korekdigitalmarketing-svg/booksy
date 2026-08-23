import Image from "next/image";
import { Link } from "@/i18n/navigation";

// Intrinsic size of public/brand/booksy-logo.png (1699×926) — files under
// public/ aren't processed by Next's static-import pipeline, so next/image
// needs explicit dimensions here rather than an imported module.
export function SiteHeader() {
  return (
    <header className="border-b border-border/60">
      <div className="mx-auto flex max-w-5xl items-center px-6 py-4">
        <Link href="/" className="flex items-center" aria-label="Booksy">
          <Image
            src="/brand/booksy-logo.png"
            alt="Booksy"
            width={1699}
            height={926}
            className="h-9 w-auto sm:h-10"
            priority
          />
        </Link>
      </div>
    </header>
  );
}
