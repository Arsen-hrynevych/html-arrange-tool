import type { Slide } from "./slide";

export type CompiledPresentationSlide = Pick<Slide, "name" | "originalHtml">;

function escapeHtml(str: string) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildCompiledPresentationHtml(slides: CompiledPresentationSlide[]) {
  if (slides.length === 0) {
    throw new Error("At least one slide is required to build a presentation.");
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Compiled Presentation</title>
<style>
  :root {
    --shell-bg:         #0E1410;
    --shell-panel:      #181F1A;
    --shell-panel-2:    #222B25;
    --shell-border:     #2A3530;
    --shell-text:       #E8EAD8;
    --shell-text-dim:   #98A099;
    --shell-accent:     #5A8A6B;
    --shell-accent-hi:  #7BAE89;
  }

  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    width: 100%; height: 100%;
    background: var(--shell-bg);
    color: var(--shell-text);
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    overflow: hidden;
  }

  button { font: inherit; color: inherit; background: none; border: none; cursor: pointer; }
  button:focus-visible { outline: 2px solid var(--shell-accent-hi); outline-offset: 2px; }

  #stage {
    position: absolute;
    inset: 0;
    background: var(--shell-bg);
  }
  #stage iframe {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: 0;
    display: none;
    background: var(--shell-bg);
  }
  #stage iframe.active { display: block; }

  #hud {
    position: fixed;
    bottom: 14px;
    right: 14px;
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(14, 20, 16, 0.75);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border: 1px solid var(--shell-border);
    border-radius: 999px;
    padding: 4px 6px 4px 14px;
    z-index: 100;
    transition: opacity 0.4s ease;
    user-select: none;
  }
  #hud.idle { opacity: 0.18; }
  #hud:hover { opacity: 1; }
  #counter {
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.02em;
    color: var(--shell-text);
    font-variant-numeric: tabular-nums;
    padding-right: 8px;
    border-right: 1px solid var(--shell-border);
    margin-right: 4px;
  }
  #hud button {
    width: 34px; height: 34px;
    border-radius: 50%;
    color: var(--shell-text-dim);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    transition: background 0.15s, color 0.15s;
  }
  #hud button:hover { background: var(--shell-panel-2); color: var(--shell-text); }

  .nav-arrow {
    position: fixed;
    top: 50%;
    transform: translateY(-50%);
    width: 56px;
    height: 96px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 32px;
    color: var(--shell-text-dim);
    background: rgba(14, 20, 16, 0.0);
    border: 0;
    transition: background 0.2s, color 0.2s, opacity 0.4s;
    z-index: 90;
    opacity: 0;
  }
  body:hover .nav-arrow { opacity: 0.7; }
  .nav-arrow:hover { background: rgba(14, 20, 16, 0.65); color: var(--shell-text); opacity: 1; }
  .nav-arrow.prev { left: 0; border-radius: 0 6px 6px 0; }
  .nav-arrow.next { right: 0; border-radius: 6px 0 0 6px; }
  .nav-arrow:disabled { opacity: 0.15; cursor: default; }

  #help {
    position: fixed;
    inset: 0;
    background: rgba(14, 20, 16, 0.85);
    backdrop-filter: blur(6px);
    display: none;
    align-items: center;
    justify-content: center;
    z-index: 250;
  }
  #help.show { display: flex; }
  .help-card {
    background: var(--shell-panel);
    border: 1px solid var(--shell-border);
    border-radius: 14px;
    padding: 28px 32px;
    max-width: 460px;
    width: calc(100% - 40px);
  }
  .help-card h2 { margin: 0 0 16px; font-size: 16px; font-weight: 600; color: var(--shell-text); }
  .help-card dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 10px 18px; font-size: 13px; }
  .help-card dt { color: var(--shell-text-dim); text-align: right; }
  .help-card dt kbd { background: var(--shell-bg); border: 1px solid var(--shell-border); border-radius: 4px; padding: 2px 6px; font-family: inherit; font-size: 11px; color: var(--shell-text); margin: 0 2px; }
  .help-card dd { margin: 0; color: var(--shell-text); }
  .help-close { margin-top: 18px; padding: 8px 16px; background: var(--shell-panel-2); border: 1px solid var(--shell-border); border-radius: 6px; color: var(--shell-text); font-size: 12px; cursor: pointer; }
</style>
</head>
<body>
  <main id="stage">
    ${slides
      .map((slide, index) => {
        return `<iframe class="${index === 0 ? 'active' : ''}" srcdoc="${escapeHtml(slide.originalHtml)}"></iframe>`;
      })
      .join("\n")}
  </main>

  <button class="nav-arrow prev" id="btn-prev" aria-label="Previous slide">‹</button>
  <button class="nav-arrow next" id="btn-next" aria-label="Next slide">›</button>

  <div id="hud">
    <span id="counter">1 / ${slides.length}</span>
    <button id="btn-fullscreen" title="Fullscreen (F)" aria-label="Toggle fullscreen">⛶</button>
    <button id="btn-help" title="Help (?)" aria-label="Show keyboard shortcuts">?</button>
  </div>

  <div id="help">
    <div class="help-card">
      <h2>Keyboard shortcuts</h2>
      <dl>
        <dt><kbd>→</kbd> <kbd>Space</kbd></dt><dd>Next slide</dd>
        <dt><kbd>←</kbd></dt><dd>Previous slide</dd>
        <dt><kbd>Home</kbd></dt><dd>First slide</dd>
        <dt><kbd>End</kbd></dt><dd>Last slide</dd>
        <dt><kbd>F</kbd></dt><dd>Toggle fullscreen</dd>
        <dt><kbd>?</kbd></dt><dd>This help</dd>
      </dl>
      <button class="help-close" id="btn-help-close">Got it</button>
    </div>
  </div>

<script>
const state = {
  index: 0,
  iframes: Array.from(document.querySelectorAll('#stage iframe')),
  total: ${slides.length},
  hudIdleTimer: null,
};

function goTo(i) {
  if (i < 0 || i >= state.total) return;
  state.iframes[state.index].classList.remove('active');
  state.index = i;
  state.iframes[state.index].classList.add('active');
  updateUI();
}

function updateUI() {
  document.getElementById('counter').textContent = (state.index + 1) + ' / ' + state.total;
  document.getElementById('btn-prev').disabled = state.index === 0;
  document.getElementById('btn-next').disabled = state.index === state.total - 1;
}

document.getElementById('btn-prev').addEventListener('click', () => goTo(state.index - 1));
document.getElementById('btn-next').addEventListener('click', () => goTo(state.index + 1));
document.getElementById('btn-fullscreen').addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.();
  }
});
document.getElementById('btn-help').addEventListener('click', () => document.getElementById('help').classList.add('show'));
document.getElementById('btn-help-close').addEventListener('click', () => document.getElementById('help').classList.remove('show'));

document.addEventListener('keydown', e => {
  if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); goTo(state.index + 1); }
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); goTo(state.index - 1); }
  else if (e.key === 'Home') { e.preventDefault(); goTo(0); }
  else if (e.key === 'End') { e.preventDefault(); goTo(state.total - 1); }
  else if (e.key.toLowerCase() === 'f') { e.preventDefault(); document.getElementById('btn-fullscreen').click(); }
  else if (e.key === '?') { e.preventDefault(); document.getElementById('btn-help').click(); }
  else if (e.key === 'Escape') { document.getElementById('help').classList.remove('show'); }
});

const hud = document.getElementById('hud');
const resetHud = () => {
  hud.classList.remove('idle');
  clearTimeout(state.hudIdleTimer);
  state.hudIdleTimer = setTimeout(() => hud.classList.add('idle'), 2500);
};
['mousemove', 'keydown', 'touchstart'].forEach(ev => window.addEventListener(ev, resetHud, { passive: true }));
resetHud();
updateUI();
</script>
</body>
</html>`;
}