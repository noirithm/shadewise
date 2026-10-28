import type { Metadata } from "next";
import Link from "next/link";
import { CATALOGUE, CATALOGUE_LABEL } from "@/config/catalogue";
import { inr } from "@/shared/money";
import { StoreShell } from "../../_components/StoreShell";
import { Widget } from "../../_components/Widget";

type Props = { params: Promise<{ id: string }> };

export function generateStaticParams() {
  return CATALOGUE.map((p) => ({ id: p.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const p = CATALOGUE.find((x) => x.id === id);
  if (!p) return { title: "Product not found · ShadeWise demo store", robots: { index: false } };
  return { title: `${p.shade} · ${p.name} · ShadeWise demo store` };
}

/** Two neighbouring shades to compare with, so every product page shows the comparison. */
function neighbours(index: number): string {
  const ids = CATALOGUE.map((p) => p.id);
  const pick = [index - 1, index + 1].filter((i) => i >= 0 && i < ids.length);
  for (const extra of [index + 2, index - 2]) if (pick.length < 2 && extra >= 0 && extra < ids.length) pick.push(extra);
  return pick.slice(0, 2).map((i) => ids[i]).join(",");
}

export default async function ProductPage({ params }: Props) {
  const { id } = await params;
  const index = CATALOGUE.findIndex((x) => x.id === id);
  if (index < 0) {
    return (
      <StoreShell>
        <h1 style={{ marginTop: 0 }}>We couldn&apos;t find that product</h1>
        <p>It isn&apos;t in the demo catalogue.</p>
        <p>
          <Link href="/">Back to the shop</Link>
        </p>
      </StoreShell>
    );
  }
  const p = CATALOGUE[index];

  return (
    <StoreShell>
      <p className="crumbs">
        <Link href="/">Shop</Link> / {p.shade}
      </p>
      <div className="product">
        <section aria-labelledby="product-title">
          <div className="big-swatch" style={{ background: p.hex }} role="img" aria-label={`${p.shade} swatch colour ${p.hex}`} />
          <h1 id="product-title" style={{ margin: "0 0 .25rem" }}>
            {p.name}
          </h1>
          <p style={{ margin: 0 }}>
            Shade: <strong>{p.shade}</strong> <span className="tag">{CATALOGUE_LABEL}</span>
          </p>
          <p className="price">{inr(p.priceInr)}</p>
          <p className="small">
            This is a made-up product in a demo catalogue. The colour above is the swatch ShadeWise compares with your measured skin colour ({p.hex}).
          </p>
        </section>
        <section className="panel" aria-labelledby="match-title">
          <h2 id="match-title">Will this shade suit you?</h2>
          <p className="small" style={{ marginTop: 0 }}>
            One selfie, an explainable answer. Nothing is stored by this app.
          </p>
          <Widget productId={p.id} compare={neighbours(index)} />
        </section>
      </div>
    </StoreShell>
  );
}
