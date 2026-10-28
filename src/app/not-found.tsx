import type { Metadata } from "next";
import Link from "next/link";
import { StoreShell } from "./_components/StoreShell";

export const metadata: Metadata = { title: "Page not found · ShadeWise demo store" };

export default function NotFound() {
  return (
    <StoreShell>
      <h1 style={{ marginTop: 0 }}>We couldn&apos;t find that page</h1>
      <p>This product isn&apos;t in the demo catalogue.</p>
      <p>
        <Link href="/">Back to the shop</Link>
      </p>
    </StoreShell>
  );
}
