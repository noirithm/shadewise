import Link from "next/link";
import type { ReactNode } from "react";
import { CATALOGUE_LABEL } from "@/config/catalogue";
import "../store.css";

export function StoreShell({ children }: { children: ReactNode }) {
  return (
    <div className="store">
      <a className="skip" href="#main">
        Skip to main content
      </a>
      <header>
        <p className="demo-banner">
          <strong>{CATALOGUE_LABEL}.</strong> A made-up brand, products and prices to show how ShadeWise works on a product page. Not a real shop.
        </p>
        <div className="bar">
          <Link className="brand" href="/">
            Demo Brand store
          </Link>
          <nav className="nav" aria-label="Main">
            <Link href="/">Shop</Link>
            <a href="/embed">Add ShadeWise to your store</a>
          </nav>
        </div>
      </header>
      <main id="main" className="wrap">
        {children}
      </main>
      <footer className="foot">
        <p>ShadeWise gives cosmetic guidance only. It is not medical advice, and it cannot promise how a shade will look in person.</p>
        <p>Photos are sent to the YouCam API (Perfect Corp.) to measure skin tone and are not stored by this app.</p>
      </footer>
    </div>
  );
}
