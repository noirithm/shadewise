import type { CSSProperties } from "react";

/**
 * The widget exactly as a brand would add it: one script tag and one element.
 * The script is a plain tag in the page, so this page needs a full page load to run it (the shop uses ordinary links).
 */
export function Widget({ productId, compare, style }: { productId: string; compare?: string; style?: CSSProperties }) {
  return (
    <>
      <shadewise-widget product-id={productId} catalogue-src="/api/catalogue" compare={compare} style={style} />
      <script type="module" src="/widget/index.js" defer />
    </>
  );
}
