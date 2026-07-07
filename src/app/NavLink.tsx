"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link
      href={href}
      className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
        active ? "bg-panel2 text-accent" : "text-muted hover:text-white hover:bg-panel2"
      }`}
    >
      {label}
    </Link>
  );
}
