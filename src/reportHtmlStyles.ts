export const HTML_REPORT_CSS = `
    :root {
      --bg: #090d16;
      --card-bg: rgba(17, 24, 39, 0.7);
      --card-border: rgba(255, 255, 255, 0.08);
      --text: #f8fafc;
      --text-dim: #94a3b8;
      --accent: #06b6d4;
      --accent-grad: linear-gradient(135deg, #06b6d4, #3b82f6);
      --green: #10b981;
      --yellow: #eab308;
      --red: #ef4444;
      --radius: 12px;
    }

    [data-theme="light"] {
      --bg: #f8fafc;
      --card-bg: rgba(255, 255, 255, 0.9);
      --card-border: rgba(0, 0, 0, 0.08);
      --text: #0f172a;
      --text-dim: #64748b;
      --accent: #0284c7;
      --accent-grad: linear-gradient(135deg, #0284c7, #2563eb);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 32px 16px;
      min-height: 100vh;
      transition: background 0.2s ease, color 0.2s ease;
    }

    .container {
      max-width: 1080px;
      margin: 0 auto;
    }

    /* Top Nav */
    .top-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 28px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .logo-badge {
      background: var(--accent-grad);
      color: #fff;
      font-weight: 800;
      font-size: 14px;
      padding: 6px 12px;
      border-radius: 8px;
      letter-spacing: 1px;
      box-shadow: 0 4px 14px rgba(6, 182, 212, 0.35);
    }
    .repo-path {
      color: var(--text-dim);
      font-size: 14px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .theme-btn {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      color: var(--text);
      padding: 8px 14px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.15s ease;
    }
    .theme-btn:hover {
      border-color: var(--accent);
    }

    /* Hero Scorecard */
    .hero-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: var(--radius);
      padding: 28px;
      margin-bottom: 28px;
      backdrop-filter: blur(12px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
    }
    .hero-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 24px;
      align-items: center;
    }
    .metric-box {
      border-right: 1px solid var(--card-border);
      padding-right: 16px;
    }
    .metric-box:last-child {
      border-right: none;
    }
    .metric-label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: var(--text-dim);
      margin-bottom: 8px;
      font-weight: 600;
    }
    .metric-val {
      font-size: 32px;
      font-weight: 800;
      display: flex;
      align-items: baseline;
      gap: 8px;
    }
    .metric-sub {
      font-size: 14px;
      font-weight: 400;
      color: var(--text-dim);
    }
    .grade-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 52px;
      height: 52px;
      border-radius: 12px;
      font-size: 26px;
      font-weight: 800;
      color: #fff;
      box-shadow: 0 4px 16px rgba(16, 185, 129, 0.3);
    }
    .bottleneck-banner {
      margin-top: 24px;
      padding-top: 18px;
      border-top: 1px solid var(--card-border);
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 14px;
    }
    .bottleneck-icon {
      color: var(--yellow);
      font-size: 18px;
    }

    /* Radar Section */
    .radar-section {
      display: grid;
      grid-template-columns: 340px 1fr;
      gap: 28px;
      margin-bottom: 28px;
    }
    @media (max-width: 840px) {
      .radar-section { grid-template-columns: 1fr; }
    }
    .radar-box {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: var(--radius);
      padding: 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    /* Simulator Section */
    .sim-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: var(--radius);
      padding: 24px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .sim-title {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .sim-desc {
      font-size: 13px;
      color: var(--text-dim);
      margin-bottom: 18px;
    }
    .sim-controls {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 18px;
    }
    .control-group label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-dim);
      margin-bottom: 6px;
    }
    .control-group select, .control-group input[type="range"] {
      width: 100%;
      background: rgba(0,0,0,0.2);
      border: 1px solid var(--card-border);
      color: var(--text);
      padding: 8px;
      border-radius: 6px;
    }
    .sim-results {
      background: rgba(0, 0, 0, 0.25);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 14px 18px;
      display: flex;
      justify-content: space-around;
      align-items: center;
      text-align: center;
    }
    .sim-res-val {
      font-size: 20px;
      font-weight: 800;
      color: var(--green);
    }
    .sim-res-lbl {
      font-size: 11px;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* Dimension List */
    .dimensions-grid {
      display: flex;
      flex-direction: column;
      gap: 16px;
      margin-bottom: 32px;
    }
    .dim-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: var(--radius);
      padding: 20px 24px;
      transition: transform 0.15s ease, border-color 0.15s ease;
    }
    .dim-card:hover {
      border-color: rgba(6, 182, 212, 0.4);
    }
    .dim-bottleneck {
      border-color: rgba(234, 179, 8, 0.4);
      background: linear-gradient(180deg, rgba(234, 179, 8, 0.05), var(--card-bg));
    }
    .dim-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 14px;
      flex-wrap: wrap;
      gap: 12px;
    }
    .dim-title-group {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .dim-title {
      font-size: 16px;
      font-weight: 700;
    }
    .dim-score-badge {
      font-size: 12px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 6px;
      border: 1px solid;
    }
    .dim-blocking-badge {
      font-size: 10px;
      font-weight: 800;
      background: var(--yellow);
      color: #000;
      padding: 2px 6px;
      border-radius: 4px;
      letter-spacing: 0.5px;
    }
    .dim-ceiling-badge {
      font-size: 10px;
      font-weight: 800;
      background: rgba(234, 179, 8, 0.2);
      color: var(--yellow);
      border: 1px solid rgba(234, 179, 8, 0.4);
      padding: 2px 6px;
      border-radius: 4px;
    }
    .meter-bar {
      width: 140px;
      height: 8px;
      background: rgba(255,255,255,0.08);
      border-radius: 4px;
      overflow: hidden;
    }
    .meter-fill {
      height: 100%;
      border-radius: 4px;
    }
    .evidence-list {
      list-style: none;
      font-size: 13.5px;
      color: var(--text);
      margin-bottom: 12px;
    }
    .evidence-list li {
      margin-bottom: 6px;
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }
    .bullet {
      color: var(--accent);
      font-weight: bold;
    }
    .tips-container {
      margin-top: 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .tip-card {
      background: rgba(6, 182, 212, 0.08);
      border: 1px solid rgba(6, 182, 212, 0.2);
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--accent);
    }

    /* Footer */
    .footer {
      text-align: center;
      font-size: 13px;
      color: var(--text-dim);
      padding-top: 24px;
      border-top: 1px solid var(--card-border);
    }
    .footer a {
      color: var(--accent);
      text-decoration: none;
    }

    @media print {
      body { background: #fff !important; color: #000 !important; padding: 0; }
      .theme-btn, .sim-controls { display: none !important; }
      .hero-card, .dim-card, .sim-card, .radar-box { border: 1px solid #ccc !important; box-shadow: none !important; }
    }
`;

export function getHtmlReportScript(ceiling: number): string {
  return `
    function toggleTheme() {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('repograder-theme', next);
    }

    const savedTheme = localStorage.getItem('repograder-theme');
    if (savedTheme) {
      document.documentElement.setAttribute('data-theme', savedTheme);
    }

    function recalculateSim() {
      const select = document.getElementById('modelSelect');
      const costPer1k = parseFloat(select.options[select.selectedIndex].getAttribute('data-cost')) || 11.76;
      const teamSize = parseInt(document.getElementById('teamSize').value, 10);
      document.getElementById('teamSizeVal').innerText = teamSize;

      const totalIssues = teamSize * 600;
      const currentCeiling = ${ceiling};
      const multiplier = currentCeiling >= 5 ? 1.0 : currentCeiling === 4 ? 1.25 : currentCeiling === 3 ? 1.6 : 2.2;

      const baseSpend = (totalIssues / 1000) * costPer1k * multiplier;
      const optimizedSpend = (totalIssues / 1000) * costPer1k;
      const savings = Math.max(0, baseSpend - optimizedSpend);
      const hoursSaved = Math.round((totalIssues / 1000) * (multiplier - 1.0) * 15);

      document.getElementById('annualCostVal').innerText = '$' + Math.round(baseSpend).toLocaleString();
      document.getElementById('annualSavingsVal').innerText = '$' + Math.round(savings).toLocaleString();
      document.getElementById('hoursSavedVal').innerText = hoursSaved + 'h';
    }

    recalculateSim();
  `;
}
