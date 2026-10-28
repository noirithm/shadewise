import type { DetailedHTMLProps, HTMLAttributes } from "react";

// Lets JSX use the <shadewise-widget> custom element with its attributes type-checked.
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "shadewise-widget": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        "product-id"?: string;
        swatch?: string;
        "catalogue-src"?: string;
        compare?: string;
      };
    }
  }
}
