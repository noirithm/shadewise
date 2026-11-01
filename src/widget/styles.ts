export const STYLES = `
:host{all:initial;display:block;--ac:var(--sw-accent,#1f6f5c);--soft:color-mix(in srgb,var(--ac) 8%,var(--sw-bg,#fff));--muted:#57534e;font:400 1rem/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--sw-text,#1a1a1a);-webkit-font-smoothing:antialiased}
*,*::before,*::after{box-sizing:border-box}
.card{max-width:30rem;padding:1.5rem;border:1px solid var(--sw-border,#e7e2dc);border-radius:24px;background:var(--sw-bg,#fff);box-shadow:0 1px 2px rgba(0,0,0,.04),0 16px 36px -16px rgba(0,0,0,.18)}
h2{margin:0 0 .75rem;font-size:1.375rem;line-height:1.25;font-weight:650;letter-spacing:-.02em}
h2:focus{outline:none}
p{margin:0 0 .75rem}
ul{margin:0 0 .75rem;padding-left:1.25rem}
li{margin-bottom:.5rem}
li::marker{color:var(--ac)}
.note{color:var(--muted);font-size:.875rem}
.row{display:flex;flex-wrap:wrap;gap:.625rem;margin-top:1.25rem}
.btn{min-height:48px;padding:.65rem 1.25rem;border-radius:14px;border:1.5px solid var(--sw-border,#e0dad3);font:inherit;font-weight:600;cursor:pointer;background:transparent;color:var(--sw-text,#1a1a1a);transition:background .2s,border-color .2s,transform .15s,box-shadow .2s}
.btn:hover{border-color:var(--ac);background:var(--soft)}
.btn:active{transform:scale(.98)}
.btn.primary{background:var(--ac);border-color:var(--ac);color:#fff;box-shadow:0 8px 18px -8px color-mix(in srgb,var(--ac) 75%,transparent)}
.btn.primary:hover{background:color-mix(in srgb,var(--ac) 88%,#000)}
.btn:focus-visible,.link:focus-visible{outline:3px solid #1d4ed8;outline-offset:2px}
.foot{margin-top:1.25rem;padding-top:.5rem;border-top:1px solid var(--sw-border,#ece8e3);display:flex;gap:1rem;flex-wrap:wrap}
.link{min-height:44px;padding:0 .25rem;background:none;border:0;font:inherit;font-size:.9rem;color:var(--muted);text-decoration:underline;text-underline-offset:3px;cursor:pointer}
.link:hover{color:var(--sw-text,#1a1a1a)}
.live{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.stage{position:relative;aspect-ratio:3/4;max-height:60vh;background:#111;border-radius:20px;overflow:hidden;margin:0 0 .75rem}
.stage video{width:100%;height:100%;object-fit:cover;transform:scaleX(-1)}
.stage::after{content:"";position:absolute;inset:12% 20%;border:2px dashed rgba(255,255,255,.8);border-radius:50%;pointer-events:none}
.preview{display:block;max-width:100%;max-height:60vh;border-radius:18px;margin:0 0 .75rem}
.err{min-height:1.5em;color:#b91c1c;font-weight:600}
.btn[disabled]{opacity:.5;cursor:not-allowed}
.debug{font:.75rem/1.4 ui-monospace,monospace;white-space:pre-wrap;background:#f4f4f5;padding:.5rem;border-radius:10px;max-height:14rem;overflow:auto}
.chiprow{display:flex;align-items:center;gap:.75rem;margin:0 0 .75rem}
.chip{flex:none;width:48px;height:48px;border-radius:50%;border:1px solid rgba(0,0,0,.2);box-shadow:0 4px 10px -4px rgba(0,0,0,.3);forced-color-adjust:none}
.fig{margin:0 0 .75rem}.fig figcaption{font-size:.875rem;color:var(--muted)}
.badge{display:inline-block;padding:.25rem .75rem;border-radius:999px;border:1.5px solid #b45309;background:#fef3c7;color:#78350f;font-weight:700;font-size:.8125rem}
.h3{margin:1.25rem 0 .5rem;font-size:1.125rem;line-height:1.3;font-weight:650;letter-spacing:-.01em}
.h4{margin:1rem 0 .375rem;font-size:.8125rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.price{font-weight:400;color:var(--muted)}
.verdict{display:inline-flex;align-items:center;gap:.5rem;margin:0;padding:.4rem 1rem;border-radius:999px;border:1.5px solid;font-weight:700}
.v-good{background:#dcfce7;border-color:#166534;color:#14532d}.v-close{background:#fef3c7;border-color:#b45309;color:#78350f}
.v-poor{background:#fee2e2;border-color:#b91c1c;color:#7f1d1d}.v-cant{background:#f4f4f5;border-color:#52525b;color:#27272a}
.swatches{display:grid;grid-template-columns:repeat(auto-fit,minmax(9.5rem,1fr));gap:.625rem;margin:.75rem 0 1rem}
.sw{display:flex;align-items:center;gap:.75rem;padding:.75rem;border:1px solid var(--sw-border,#ece8e3);border-radius:16px;background:var(--soft);font-size:.875rem;line-height:1.35}
.sw code{font:.75rem ui-monospace,monospace;color:var(--muted)}
.rank{list-style:none;margin:0 0 .75rem;padding:0}
.rank li{border:1px solid var(--sw-border,#ece8e3);border-radius:16px;padding:.875rem;margin-bottom:.625rem;background:var(--soft)}
.rank p{margin:0 0 .4rem}
.rec{display:inline-block;padding:.05rem .6rem;border-radius:8px;border:1.5px solid;font-weight:700;font-size:.8125rem}
.rec-buy{background:#dcfce7;border-color:#166534;color:#14532d}.rec-consider{background:#fef3c7;border-color:#b45309;color:#78350f}.rec-skip{background:#f4f4f5;border-color:#52525b;color:#27272a}
.btn.small{min-height:44px;padding:.4rem .9rem;font-size:.9rem}.btn[aria-disabled=true]{opacity:.6;cursor:progress}
.thumb{display:block;max-width:9rem;max-height:12rem;border-radius:12px;margin:.4rem 0}
[role=status]::before{content:"";display:inline-block;width:.55rem;height:.55rem;margin-right:.5rem;border-radius:50%;background:var(--ac);animation:sw-pulse 1.2s ease-in-out infinite}
@keyframes sw-pulse{0%,100%{opacity:.35;transform:scale(.85)}50%{opacity:1;transform:scale(1)}}
@media (forced-colors:active){.btn,.card{border:2px solid ButtonText}.btn.primary{border-color:Highlight}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{transition:none!important;animation:none!important}}
`;