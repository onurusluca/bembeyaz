let stylesInjected = false

export function ensureStyles(): void {
  if (stylesInjected) return
  const style = document.createElement('style')
  style.textContent = `
    .bembeyaz-app-host, .bembeyaz-app-host * { box-sizing: border-box; }
    .bembeyaz-app-host {
      --bbz-panel: rgba(255, 255, 255, 0.94);
      --bbz-border: #dbe2ea;
      --bbz-text: #122130;
      --bbz-muted: #5f7288;
      --bbz-btn-bg: #ffffff;
      --bbz-btn-border: #d7e0ea;
      --bbz-btn-hover: #f4f8fd;
      --bbz-btn-active-bg: #e9f3ff;
      --bbz-btn-active-border: #3a91f7;
      --bbz-danger: #d03b3b;
      height: 100%;
      min-height: 0;
      background: radial-gradient(circle at 15% 10%, #ffffff 0%, #eef3f8 50%, #e8eef5 100%);
      color: var(--bbz-text);
      font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    }
    .bbz-wrap { position: relative; height: 100%; min-height: 0; }
    .bbz-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding-top: 0;
    }
    .bbz-menu {
      position: absolute;
      left: 12px;
      top: 12px;
      z-index: 8;
    }
    .bbz-menu-btn {
      width: 38px;
      height: 38px;
      border-radius: 10px;
      border: 1px solid var(--bbz-border);
      background: var(--bbz-panel);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--bbz-text);
      backdrop-filter: blur(8px);
    }
    .bbz-menu-btn .bbz-icon {
      width: 20px;
      height: 20px;
    }
    .bbz-menu-panel {
      display: none;
      margin-top: 8px;
      min-width: 160px;
      border-radius: 10px;
      border: 1px solid var(--bbz-border);
      background: var(--bbz-panel);
      box-shadow: 0 8px 20px rgba(22, 34, 50, 0.12);
      padding: 6px;
      backdrop-filter: blur(8px);
    }
    .bbz-menu.open .bbz-menu-panel { display: block; }
    .bbz-menu-item {
      width: 100%;
      border: 0;
      background: transparent;
      border-radius: 8px;
      padding: 8px;
      color: var(--bbz-text);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      justify-content: space-between;
      text-align: left;
      font-size: 12px;
    }
    .bbz-menu-item:hover { background: #f4f8fd; }
    .bbz-menu-item--action { justify-content: flex-start; }
    .bbz-menu-sep {
      height: 1px;
      margin: 6px 4px;
      background: var(--bbz-border);
    }
    .bbz-menu-item--option {
      padding-left: 12px;
      justify-content: space-between;
    }
    .bbz-menu-check {
      font-size: 12px;
      width: 18px;
      text-align: center;
      color: var(--bbz-btn-active-border);
      flex-shrink: 0;
    }
    .bbz-check {
      font-size: 11px;
      color: var(--bbz-muted);
      text-transform: uppercase;
    }
    .bbz-menu-item.active {
      background: #e9f3ff;
      color: #155ea8;
    }
    .bbz-menu-item kbd {
      font-size: 9px;
      border: 1px solid var(--bbz-border);
      border-radius: 4px;
      padding: 1px 4px;
      background: #fff;
      margin-left: auto;
    }
    .bbz-menu-label {
      padding: 8px 8px 5px;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      color: var(--bbz-muted);
    }
    .bbz-dock-sep {
      height: 1px;
      margin: 4px 2px;
      background: var(--bbz-border);
      flex-shrink: 0;
    }
    .bbz-dock {
      position: absolute;
      left: 16px;
      top: 50%;
      transform: translateY(-50%);
      z-index: 5;
      width: 56px;
      max-height: calc(100vh - 48px);
      overflow-y: auto;
      border: 1px solid var(--bbz-border);
      border-radius: 14px;
      background: var(--bbz-panel);
      backdrop-filter: blur(8px);
      box-shadow: 0 10px 24px rgba(22, 34, 50, 0.14);
      padding: 8px 6px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .bbz-btn {
      height: 42px;
      width: 100%;
      box-sizing: border-box;
      padding: 0;
      border: none;
      border-radius: 12px;
      background: var(--bbz-btn-bg);
      color: var(--bbz-text);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 140ms ease, border-color 140ms ease, transform 120ms ease, box-shadow 140ms ease;
      position: relative;
      isolation: isolate;
    }
    .bbz-btn:hover { background: var(--bbz-btn-hover); border-color: #bfd2e7; }
    .bbz-btn:active { transform: translateY(1px); }
    .bbz-btn.active {
      background: var(--bbz-btn-active-bg);
      border-color: var(--bbz-btn-active-border);
      box-shadow: 0 0 0 2px rgba(58, 145, 247, 0.15);
    }
    .bbz-btn-danger { color: var(--bbz-danger); }
    .bbz-btn-laser.active {
      background: #fff3f4;
      border-color: #ff3c52;
      box-shadow: 0 0 0 2px rgba(255,60,82,0.15);
      color: #d63050;
    }
    .bbz-icon {
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      flex-shrink: 0;
    }
    .bbz-icon svg {
      width: 100%;
      height: 100%;
      display: block;
    }
    .bbz-btn kbd {
      position: absolute;
      left: 4px;
      bottom: 4px;
      top: auto;
      right: auto;
      margin: 0;
      padding: 0;
      font-size: 9px;
      font-weight: 700;
      color: var(--bbz-muted);
      background: transparent;
      border: none;
      border-radius: 0;
      box-shadow: none;
      font-family: inherit;
      line-height: 1;
      min-width: 0;
      text-align: left;
      z-index: 2;
      pointer-events: none;
    }
    .bbz-stage {
      height: 100%;
      min-height: 0;
      background: #edf2f7;
    }
    @media (max-width: 880px) {
      .bbz-dock {
        left: 10px;
        width: 52px;
        padding: 7px 5px;
      }
      .bbz-style-panel {
        left: 70px;
      }
    }

    /* ── Style panel ─────────────────────────────────────────────────────── */
    .bbz-style-panel {
      position: absolute;
      left: 80px;
      top: 50%;
      transform: translateY(-50%);
      z-index: 6;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 12px 14px;
      border-radius: 14px;
      border: 1px solid var(--bbz-border);
      background: var(--bbz-panel);
      backdrop-filter: blur(8px);
      box-shadow: 0 8px 24px rgba(22, 34, 50, 0.13);
      transition: opacity 180ms ease, transform 180ms ease;
    }
    .bbz-style-panel--hidden {
      opacity: 0;
      pointer-events: none;
      transform: translateY(-50%) translateX(-6px);
    }
    .bbz-style-panel-title {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--bbz-muted);
      margin: 0 0 6px 0;
      padding: 0 2px;
      line-height: 1.2;
    }
    .bbz-style-panel-title[hidden] {
      display: none !important;
    }
    .bbz-style-section {
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .bbz-style-section-steps {
      gap: 5px;
    }
    .bbz-style-section-dash {
      gap: 5px;
    }
    .bbz-style-section-colors {
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: stretch;
    }
    .bbz-style-selection-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: stretch;
      justify-content: stretch;
    }
    .bbz-action-btn {
      flex: 1 1 0;
      min-width: 0;
      height: 26px;
      padding: 0 6px;
      border-radius: 7px;
      border: 1px solid var(--bbz-btn-border);
      background: var(--bbz-btn-bg);
      cursor: pointer;
      color: var(--bbz-text);
      font-size: 10px;
      font-weight: 600;
      font-family: inherit;
    }
    .bbz-action-btn:hover { background: var(--bbz-btn-hover); }
    .bbz-action-btn:first-child {
      color: var(--bbz-danger);
    }
    .bbz-action-btn:first-child:hover {
      background: rgba(208, 59, 59, 0.08);
    }
    .bbz-swatch-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .bbz-swatch-caption {
      flex: 0 0 46px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.02em;
      color: var(--bbz-muted);
      line-height: 1.2;
    }
    .bbz-style-sep {
      width: 100%;
      height: 1px;
      background: var(--bbz-border);
      flex-shrink: 0;
      margin: 0;
    }
    .bbz-style-block { display: flex; flex-direction: column; gap: 10px; }
    .bbz-style-width-wrap { display: flex; flex-direction: column; gap: 8px; }
    .bbz-style-text-typo {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .bbz-style-align .bbz-step-btn { min-width: 32px; padding: 0 4px; }

    /* ── Swatches ────────────────────────────────────────────────────────── */
    .bbz-swatch {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: 2px solid var(--bbz-border);
      cursor: pointer;
      position: relative;
      flex-shrink: 0;
      overflow: hidden;
      padding: 0;
      background-color: var(--swatch-color, #111111);
      transition: border-color 140ms ease, box-shadow 140ms ease;
    }
    .bbz-swatch:hover {
      border-color: #93b4d4;
      box-shadow: 0 0 0 2px rgba(58, 145, 247, 0.2);
    }
    .bbz-swatch-stroke { background-color: var(--swatch-color, #111111); }
    .bbz-swatch-fill   { background-color: var(--swatch-color, transparent); }
    .bbz-fill-group {
      display: flex;
      align-items: center;
      gap: 3px;
    }
    .bbz-fill-clear {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      border: 1px solid var(--bbz-border);
      background: var(--bbz-btn-bg);
      cursor: pointer;
      font-size: 11px;
      color: var(--bbz-muted);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      line-height: 1;
      flex-shrink: 0;
      transition: background 120ms ease;
    }
    .bbz-fill-clear:hover { background: #fee2e2; color: #dc2626; }
    /* ── Color popover ───────────────────────────────────────────────────── */
    .bbz-color-pop {
      position: fixed;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      align-content: flex-start;
      gap: 7px;
      max-width: 220px;
      padding: 8px 12px;
      border-radius: 12px;
      border: 1px solid var(--bbz-border);
      background: rgba(255, 255, 255, 0.97);
      box-shadow: 0 8px 24px rgba(22, 34, 50, 0.16);
      backdrop-filter: blur(10px);
      transform: translate(-50%, -100%) translateY(-6px);
      z-index: 9999;
      opacity: 0;
      pointer-events: none;
      scale: 0.88;
      transition: opacity 130ms ease, scale 130ms ease;
    }
    .bbz-color-pop--open {
      opacity: 1;
      pointer-events: auto;
      scale: 1;
    }
    .bbz-color-pop-btn {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      border: 2px solid transparent;
      background-color: var(--c);
      cursor: pointer;
      padding: 0;
      flex-shrink: 0;
      transition: transform 100ms ease, border-color 100ms ease, box-shadow 100ms ease;
    }
    .bbz-color-pop-btn:hover {
      transform: scale(1.2);
      border-color: rgba(0, 0, 0, 0.18);
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
    }
    .bbz-color-pop-nofill {
      flex: 1 1 100%;
      margin: 2px 0 0 0;
      padding: 7px 10px;
      border-radius: 8px;
      border: 1px dashed var(--bbz-border);
      background: var(--bbz-btn-bg);
      font-size: 11px;
      font-weight: 600;
      color: var(--bbz-muted);
      cursor: pointer;
      font-family: inherit;
    }
    .bbz-color-pop-nofill:hover {
      background: #f4f8fd;
      color: var(--bbz-text);
    }

    /* ── Step buttons (width & opacity) ─────────────────────────────────── */
    .bbz-step-btn {
      height: 26px;
      min-width: 28px;
      padding: 0 5px;
      border-radius: 7px;
      border: 1px solid var(--bbz-btn-border);
      background: var(--bbz-btn-bg);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--bbz-muted);
      font-size: 10px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      font-family: inherit;
      transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
    }
    .bbz-step-btn svg { width: 20px; height: 14px; display: block; }
    .bbz-step-btn:hover { background: var(--bbz-btn-hover); color: var(--bbz-text); }
    .bbz-step-btn.active {
      background: var(--bbz-btn-active-bg);
      border-color: var(--bbz-btn-active-border);
      color: #155ea8;
    }

    /* ── Dash buttons ────────────────────────────────────────────────────── */
    .bbz-dash-btn {
      width: 36px;
      height: 26px;
      border-radius: 7px;
      border: 1px solid var(--bbz-btn-border);
      background: var(--bbz-btn-bg);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--bbz-muted);
      padding: 0 4px;
      transition: background 120ms ease, border-color 120ms ease;
    }
    .bbz-dash-btn svg { width: 24px; height: 12px; display: block; }
    .bbz-dash-btn:hover { background: var(--bbz-btn-hover); color: var(--bbz-text); }
    .bbz-dash-btn.active {
      background: var(--bbz-btn-active-bg);
      border-color: var(--bbz-btn-active-border);
      color: #155ea8;
    }

  `
  document.head.appendChild(style)
  stylesInjected = true
}
