import type { RunAllResult } from './types';
import type { BenchmarkResult } from './benchmark/types';
import { HTML_REPORT_CSS, getHtmlReportScript } from './reportHtmlStyles';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderHTML(
  result: RunAllResult,
  targetPath: string,
  _benchmark?: BenchmarkResult,
): string {
  const repoName = escapeHtml(targetPath);
  const ceiling = result.ceiling;
  const indexScore = result.indexScore;
  const grade = escapeHtml(result.grade);
  const levelName = escapeHtml(result.level.name);

  const gradeColors: Record<string, string> = {
    'A+': '#10b981',
    A: '#10b981',
    B: '#06b6d4',
    C: '#eab308',
    D: '#f97316',
    F: '#ef4444',
  };
  const gradeColor = gradeColors[result.grade] || '#06b6d4';

  const bottlenecks = result.results.filter((r) => r.score === ceiling);
  const bottleneckText =
    bottlenecks.length > 0 && ceiling < 5
      ? bottlenecks.map((b) => escapeHtml(b.label)).join(', ')
      : 'None — All dimensions at maximum readiness';

  // Generate SVG radar chart coordinates for the 7 dimensions
  const center = 150;
  const radius = 100;
  const totalDims = result.results.length;
  const angleStep = (Math.PI * 2) / totalDims;

  // Radar grid rings (1 to 5)
  const gridRings = [1, 2, 3, 4, 5]
    .map((step) => {
      const r = (radius / 5) * step;
      const pts = Array.from({ length: totalDims })
        .map((_, i) => {
          const angle = i * angleStep - Math.PI / 2;
          const x = center + r * Math.cos(angle);
          const y = center + r * Math.sin(angle);
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' ');
      return `<polygon points="${pts}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1" />`;
    })
    .join('');

  // Radar score polygon
  const scorePoints = result.results
    .map((r, i) => {
      const rScore = (radius / 5) * r.score;
      const angle = i * angleStep - Math.PI / 2;
      const x = center + rScore * Math.cos(angle);
      const y = center + rScore * Math.sin(angle);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  // Radar labels & dots
  const radarLabelsAndDots = result.results
    .map((r, i) => {
      const angle = i * angleStep - Math.PI / 2;
      const rScore = (radius / 5) * r.score;
      const sx = center + rScore * Math.cos(angle);
      const sy = center + rScore * Math.sin(angle);

      // Label point outside
      const lx = center + (radius + 24) * Math.cos(angle);
      const ly = center + (radius + 24) * Math.sin(angle);
      const anchor =
        Math.abs(Math.cos(angle)) < 0.2 ? 'middle' : Math.cos(angle) > 0 ? 'start' : 'end';

      return `
        <circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="4" fill="${gradeColor}" />
        <text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" font-size="10" fill="#94a3b8" text-anchor="${anchor}" dominant-baseline="middle">${escapeHtml(
          r.label.split(' ')[0],
        )} (${r.score}/5)</text>
      `;
    })
    .join('');

  // Dimension cards
  const dimensionCards = result.results
    .map((dim) => {
      const isBottleneck = dim.score === ceiling && ceiling < 5;
      const scoreColor = dim.score >= 4 ? '#10b981' : dim.score === 3 ? '#eab308' : '#ef4444';
      const evidenceList = dim.evidence
        .map((ev) => `<li><span class="bullet">›</span> ${escapeHtml(ev)}</li>`)
        .join('');
      const tipsList = (dim.remediationTips || [])
        .map(
          (tip) => `
          <div class="tip-card">
            <span class="tip-icon">⚡</span>
            <span>${escapeHtml(tip)}</span>
          </div>`,
        )
        .join('');

      return `
        <div class="dim-card ${isBottleneck ? 'dim-bottleneck' : ''}">
          <div class="dim-header">
            <div class="dim-title-group">
              <span class="dim-score-badge" style="background:${scoreColor}22; color:${scoreColor}; border-color:${scoreColor}44;">
                ${dim.score}/5
              </span>
              <h3 class="dim-title">${escapeHtml(dim.label)}</h3>
              ${dim.blocking ? '<span class="dim-blocking-badge">BLOCKING</span>' : ''}
              ${isBottleneck ? '<span class="dim-ceiling-badge">CEILING BOTTLENECK</span>' : ''}
            </div>
            <div class="meter-bar">
              <div class="meter-fill" style="width: ${(dim.score / 5) * 100}%; background: ${scoreColor};"></div>
            </div>
          </div>
          <ul class="evidence-list">
            ${evidenceList}
          </ul>
          ${tipsList ? `<div class="tips-container">${tipsList}</div>` : ''}
        </div>
      `;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Repograder — Agent Readiness Scorecard: ${repoName}</title>
  <style>
${HTML_REPORT_CSS}
  </style>
</head>
<body>
  <div class="container">
    <div class="top-bar">
      <div class="brand">
        <span class="logo-badge">REPOGRADER</span>
        <span class="repo-path">${repoName}</span>
      </div>
      <button class="theme-btn" onclick="toggleTheme()">🌓 Switch Theme</button>
    </div>

    <div class="hero-card">
      <div class="hero-grid">
        <div class="metric-box">
          <div class="metric-label">Readiness Ceiling</div>
          <div class="metric-val" style="color:${gradeColor}">
            ${ceiling}/5
            <span class="metric-sub">${levelName}</span>
          </div>
        </div>
        <div class="metric-box">
          <div class="metric-label">Readiness Index</div>
          <div class="metric-val">
            ${indexScore}<span class="metric-sub">/100</span>
          </div>
        </div>
        <div class="metric-box" style="display:flex; align-items:center; gap:16px;">
          <div class="grade-badge" style="background:${gradeColor}">
            ${grade}
          </div>
          <div>
            <div class="metric-label">Overall Grade</div>
            <div style="font-size:14px; color:var(--text-dim);">Ceiling Governed (Weakest Link)</div>
          </div>
        </div>
      </div>
      <div class="bottleneck-banner">
        <span class="bottleneck-icon">${ceiling === 5 ? '✔' : '▲'}</span>
        <span><strong>Ceiling Bottleneck:</strong> ${bottleneckText}</span>
      </div>
    </div>

    <div class="radar-section">
      <div class="radar-box">
        <div class="metric-label" style="margin-bottom:12px;">7-Dimension Radar</div>
        <svg width="300" height="300" viewBox="0 0 300 300">
          ${gridRings}
          <polygon points="${scorePoints}" fill="${gradeColor}33" stroke="${gradeColor}" stroke-width="2" />
          ${radarLabelsAndDots}
        </svg>
      </div>

      <div class="sim-card">
        <div>
          <h3 class="sim-title">⚡ AI Cost & ROI Simulator</h3>
          <p class="sim-desc">Simulate bottom-line engineering savings from advancing this repository's agent readiness level.</p>

          <div class="sim-controls">
            <div class="control-group">
              <label for="modelSelect">Frontier Model Tier</label>
              <select id="modelSelect" onchange="recalculateSim()">
                <option value="sonnet" data-cost="11.76">Claude 3.5 Sonnet ($3 / $15)</option>
                <option value="flash" data-cost="0.38">Gemini 2.0 Flash ($0.10 / $0.40)</option>
                <option value="gpt4o" data-cost="9.80">GPT-4o ($2.50 / $10)</option>
                <option value="haiku" data-cost="3.14">Claude 3.5 Haiku ($0.80 / $4)</option>
                <option value="deepseek" data-cost="0.32">DeepSeek V3 ($0.14 / $0.28)</option>
                <option value="local" data-cost="0.00">Local / Ollama ($0.00)</option>
              </select>
            </div>
            <div class="control-group">
              <label for="teamSize">Team Size: <span id="teamSizeVal">10</span> engineers</label>
              <input type="range" id="teamSize" min="1" max="100" value="10" oninput="recalculateSim()" />
            </div>
          </div>
        </div>

        <div class="sim-results">
          <div>
            <div class="sim-res-val" id="annualCostVal">$1,411</div>
            <div class="sim-res-lbl">Projected Annual Spend</div>
          </div>
          <div style="border-left: 1px solid var(--card-border); height: 36px;"></div>
          <div>
            <div class="sim-res-val" id="annualSavingsVal">$890</div>
            <div class="sim-res-lbl">Annual Savings (at 5/5)</div>
          </div>
          <div style="border-left: 1px solid var(--card-border); height: 36px;"></div>
          <div>
            <div class="sim-res-val" id="hoursSavedVal">110h</div>
            <div class="sim-res-lbl">Dev Hours Reclaimed</div>
          </div>
        </div>
      </div>
    </div>

    <div class="metric-label" style="margin-bottom:12px;">Dimension Breakdown & Remediation</div>
    <div class="dimensions-grid">
      ${dimensionCards}
    </div>

    <div class="footer">
      Generated by <strong>Repograder</strong> — Score codebase readiness for AI coding agents • Zero runtime dependencies
    </div>
  </div>

  <script>
${getHtmlReportScript(ceiling)}
  </script>
</body>
</html>
`;
}
