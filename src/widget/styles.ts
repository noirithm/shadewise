export const STYLES = `
:host{all:initial;display:block;font:1rem/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--sw-text,#1a1a1a)}
*{box-sizing:border-box}
.card{max-width:28rem;padding:1.25rem;border:1px solid var(--sw-border,#d4d4d8);border-radius:12px;background:var(--sw-bg,#fff)}
h2{margin:0 0 .75rem;font-size:1.25rem;line-height:1.3}
h2:focus{outline:none}
p{margin:0 0 .75rem}
ul{margin:0 0 .75rem;padding-left:1.25rem}
li{margin-bottom:.5rem}
.note{color:#52525b;font-size:.875rem}
.row{display:flex;flex-wrap:wrap;gap:.75rem;margin-top:1rem}
.btn{min-height:44px;padding:.625rem 1.125rem;border-radius:8px;border:2px solid var(--sw-accent,#1f6f5c);font:inherit;font-weight:600;cursor:pointer;background:transparent;color:var(--sw-accent,#1f6f5c)}
.btn.primary{background:var(--sw-accent,#1f6f5c);color:#fff}
.btn:focus-visible,.link:focus-visible{outline:3px solid #1d4ed8;outline-offset:2px}
.foot{margin-top:1rem;padding-top:.75rem;border-top:1px solid var(--sw-border,#e4e4e7);display:flex;gap:1rem;flex-wrap:wrap}
.link{min-height:44px;padding:0 .25rem;background:none;border:0;font:inherit;color:#1d4ed8;text-decoration:underline;cursor:pointer}
.live{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.stage{aspect-ratio:3/4;max-height:60vh;background:#111;border-radius:8px;overflow:hidden;margin:0 0 .75rem}.stage video{width:100%;height:100%;object-fit:cover;transform:scaleX(-1)}.preview{display:block;max-width:100%;max-height:60vh;border-radius:8px;margin:0 0 .75rem}.err{min-height:1.5em;color:#b91c1c;font-weight:600}.btn[disabled]{opacity:.5;cursor:not-allowed}
.debug{font:.75rem/1.4 ui-monospace,monospace;white-space:pre-wrap;background:#f4f4f5;padding:.5rem;border-radius:6px;max-height:14rem;overflow:auto}
.chiprow{display:flex;align-items:center;gap:.75rem;margin:0 0 .75rem}.chip{width:44px;height:44px;border-radius:8px;border:1px solid #71717a;forced-color-adjust:none}.fig{margin:0 0 .75rem}.fig figcaption{font-size:.875rem;color:#52525b}
.badge{display:inline-block;padding:.25rem .75rem;border-radius:999px;border:2px solid #b45309;background:#fef3c7;color:#78350f;font-weight:700;font-size:.875rem}
@media (forced-colors:active){.btn,.card{border:2px solid ButtonText}.btn.primary{border-color:Highlight}}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
`;
