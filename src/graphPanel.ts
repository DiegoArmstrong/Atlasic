import * as vscode from 'vscode';
import { CodebaseGraph } from './types';

export class GraphPanel {
  public static currentPanel: GraphPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private graph: CodebaseGraph;

  public static createOrShow(extensionUri: vscode.Uri, graph: CodebaseGraph) {
    if (GraphPanel.currentPanel) {
      GraphPanel.currentPanel.graph = graph;
      GraphPanel.currentPanel.panel.reveal();
      GraphPanel.currentPanel.update();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'atlasicVisualizer',
      'Atlasic - Dependency Graph',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri]
      }
    );

    GraphPanel.currentPanel = new GraphPanel(panel, extensionUri, graph);
  }

  public static refresh(graph: CodebaseGraph) {
    if (GraphPanel.currentPanel) {
      GraphPanel.currentPanel.graph = graph;
      GraphPanel.currentPanel.update();
    }
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, graph: CodebaseGraph) {
    this.panel = panel;
    this.graph = graph;

    this.update();

    this.panel.onDidDispose(() => {
      GraphPanel.currentPanel = undefined;
    });

    this.panel.webview.onDidReceiveMessage(message => {
      switch (message.command) {
        case 'openFile':
          this.openFile(message.path);
          break;
      }
    });
  }

  private update() {
    this.panel.webview.html = this.getHtmlContent();
  }

  private openFile(filePath: string) {
    vscode.window.showTextDocument(vscode.Uri.file(filePath));
  }

  /**
   * Send git heat results into the existing webview without rebuilding the HTML.
   * The webview listens for { command: 'gitHeat', scoresByAbsPath, maxScore }.
   */
  public postGitHeat(payload: { scoresByAbsPath: Record<string, number>; maxScore: number }) {
    this.panel.webview.postMessage({
      command: 'gitHeat',
      scoresByAbsPath: payload.scoresByAbsPath,
      maxScore: payload.maxScore
    });
  }

  private getHtmlContent(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Atlasic</title>
  <script src="https://d3js.org/d3.v7.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      overflow: hidden;
      background: #1e1e1e;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    #graph { width: 100vw; height: 100vh; display: block; }

    .node { cursor: pointer; }

    .node circle {
      stroke: #fff;
      stroke-width: 1.5px;
      transition: r 0.2s, filter 0.2s;
    }

    .node circle:hover {
      r: 12;
      filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.5));
    }

    .node.highlighted circle {
      r: 12;
      filter: drop-shadow(0 0 12px rgba(97, 218, 251, 0.8));
      stroke-width: 3px;
      stroke: #61dafb;
    }

    .link {
      stroke: #999;
      stroke-opacity: 0.6;
      transition: stroke 0.2s, stroke-opacity 0.2s;
    }

    .link.highlighted {
      stroke: #61dafb;
      stroke-opacity: 1;
      stroke-width: 1;
    }

    .node text {
      font: 10px sans-serif;
      fill: #fff;
      pointer-events: none;
      text-anchor: middle;
    }

    .tooltip {
      position: absolute;
      padding: 12px;
      background: rgba(0, 0, 0, 0.95);
      color: #fff;
      border-radius: 6px;
      border: 1px solid #444;
      pointer-events: none;
      display: none;
      font-size: 12px;
      z-index: 1000;
    }

    .tooltip-title { font-weight: bold; margin-bottom: 6px; color: #61dafb; }
    .tooltip-line { margin: 2px 0; }
    .tooltip-label { color: #aaa; display: inline-block; width: 80px; }

    .search-container {
      position: absolute;
      top: 20px;
      right: 20px;
      background: rgba(0, 0, 0, 0.8);
      border: 1px solid #444;
      border-radius: 6px;
      padding: 12px;
      color: #fff;
      font-size: 12px;
      z-index: 200;
      width: 280px;
    }

    .search-title { font-weight: bold; margin-bottom: 8px; color: #61dafb; }
    .search-box { position: relative; width: 100%; }

    .search-input {
      width: 100%;
      padding: 8px;
      background: #2d2d2d;
      border: 1px solid #555;
      border-radius: 4px;
      color: #fff;
      font-size: 12px;
    }

    .search-input:focus {
      outline: none;
      border-color: #61dafb;
      box-shadow: 0 0 8px rgba(97, 218, 251, 0.3);
    }

    .search-suggestions {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      background: #2d2d2d;
      border: 1px solid #555;
      border-top: none;
      border-radius: 0 0 4px 4px;
      max-height: 200px;
      overflow-y: auto;
      display: none;
      z-index: 201;
    }

    .search-suggestions.active { display: block; }

    .suggestion-item {
      padding: 8px;
      cursor: pointer;
      border-bottom: 1px solid #444;
      font-size: 11px;
      transition: background 0.2s;
    }

    .suggestion-item:hover { background: #444; }
    .suggestion-item.selected { background: #61dafb; color: #1e1e1e; }

    .search-hint { font-size: 10px; color: #999; margin-top: 6px; }

    .controls {
      position: absolute;
      top: 20px;
      left: 20px;
      background: rgba(0, 0, 0, 0.8);
      border: 1px solid #444;
      border-radius: 6px;
      padding: 15px;
      color: #fff;
      font-size: 12px;
      z-index: 100;
      width: 240px;
    }

    .control-title { font-weight: bold; margin-bottom: 10px; color: #61dafb; }
    .stat-line { margin: 4px 0; }

    .legend {
      position: absolute;
      bottom: 20px;
      left: 20px;
      background: rgba(0, 0, 0, 0.8);
      border: 1px solid #444;
      border-radius: 6px;
      padding: 15px;
      color: #fff;
      font-size: 11px;
      z-index: 100;
    }

    .legend-title { font-weight: bold; margin-bottom: 10px; color: #61dafb; }
    .legend-item { display: flex; align-items: center; margin: 4px 0; }
    .legend-color { width: 12px; height: 12px; border-radius: 50%; margin-right: 8px; }

    /* Optional tiny status line for git heat */
    .status {
      margin-top: 8px;
      font-size: 10px;
      color: #aaa;
      line-height: 1.3;
    }
    .status strong { color: #fff; }
  </style>
</head>
<body>
  <div id="graph"></div>
  <div class="tooltip" id="tooltip"></div>

  <div class="search-container">
    <div class="search-title">🔍 Search Files</div>
    <div class="search-box">
      <input
        type="text"
        class="search-input"
        id="searchInput"
        placeholder="Type to search..."
        autocomplete="off"
      />
      <div class="search-suggestions" id="searchSuggestions"></div>
    </div>
    <div class="search-hint">Click suggestion or press Enter</div>
  </div>

  <div class="controls">
    <div class="control-title">📊 Graph Stats</div>
    <div class="stat-line">Nodes: <strong id="nodeCount">0</strong></div>
    <div class="stat-line">Links: <strong id="linkCount">0</strong></div>

    <div class="stat-line" style="margin-top:10px;">
      <div style="font-size:11px; color:#aaa; margin-bottom:6px;">Color mode</div>

      <label style="display:flex; gap:8px; align-items:center; user-select:none; margin-bottom:4px;">
        <input type="radio" name="colorMode" id="modeTypes" value="types" checked />
        File Types
      </label>

      <label style="display:flex; gap:8px; align-items:center; user-select:none; margin-bottom:4px;">
        <input type="radio" name="colorMode" id="modeHeat" value="heat" />
        Heatmap (In-degree)
      </label>

      <label style="display:flex; gap:8px; align-items:center; user-select:none;">
        <input type="radio" name="colorMode" id="modeCombined" value="combined" />
        Heatmap (Combined)
      </label>

      <div class="status" id="gitStatus">
        Git heat: <strong id="gitStatusValue">loading…</strong><br/>
        Max git score: <strong id="gitMax">0</strong>
      </div>
    </div>

    <div class="stat-line" id="heatLegend" style="display:none; margin-top:10px;">
      <div style="font-size:11px; color:#aaa; margin-bottom:4px;">Cold → Hot</div>
      <div style="height:10px; border-radius:6px; border:1px solid #444;
                  background: linear-gradient(to right, #2c7bb6, #ffffbf, #d7191c);"></div>
      <div style="display:flex; justify-content:space-between; font-size:10px; color:#999; margin-top:4px;">
        <span>0</span><span id="heatMax">0</span>
      </div>
      <div style="font-size:10px; color:#999; margin-top:6px;" id="heatModeLabel"></div>
    </div>
  </div>

  <div class="legend" id="typesLegend">
    <div class="legend-title">📁 File Categories</div>
    <div class="legend-item"><div class="legend-color" style="background: #61dafb;"></div><span>Component</span></div>
    <div class="legend-item"><div class="legend-color" style="background: #ffd700;"></div><span>Utility</span></div>
    <div class="legend-item"><div class="legend-color" style="background: #ff6b6b;"></div><span>API/Service</span></div>
    <div class="legend-item"><div class="legend-color" style="background: #4ecdc4;"></div><span>Test</span></div>
    <div class="legend-item"><div class="legend-color" style="background: #95a5a6;"></div><span>Config</span></div>
    <div class="legend-item"><div class="legend-color" style="background: #9b59b6;"></div><span>Model</span></div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const graphData = ${JSON.stringify(this.graph)};

    const width = window.innerWidth;
    const height = window.innerHeight;

    // Update stats
    document.getElementById('nodeCount').textContent = graphData.nodes.length;
    document.getElementById('linkCount').textContent = graphData.links.length;

    // ---- Heatmap: compute in-degree (dependencies) ----
    const inDegree = new Map();
    graphData.nodes.forEach(n => inDegree.set(n.id, 0));

    graphData.links.forEach(l => {
      const targetId = (typeof l.target === 'string') ? l.target : l.target.id;
      inDegree.set(targetId, (inDegree.get(targetId) || 0) + 1);
    });

    graphData.nodes.forEach(n => {
      n.inDegree = inDegree.get(n.id) || 0;
      n.gitScore = 0; // default until we receive gitHeat message
    });

    const maxInDegree = d3.max(graphData.nodes, d => d.inDegree) || 0;
    document.getElementById('heatMax').textContent = String(maxInDegree);

    // ---- Git heat payload (arrives later) ----
    let maxGit = 0;
    document.getElementById('gitMax').textContent = '0';
    document.getElementById('gitStatusValue').textContent = 'loading…';

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (!msg || msg.command !== 'gitHeat') return;

      const scores = msg.scoresByAbsPath || {};
      maxGit = msg.maxScore || 0;

      graphData.nodes.forEach(n => {
        n.gitScore = scores[n.id] || 0;
      });

      document.getElementById('gitMax').textContent = String(maxGit);
      document.getElementById('gitStatusValue').textContent = 'ready';
      applyNodeColors();
    });

    // Heat scale (0 -> max), visually nice floor
    const heatTMin = 0.15;
    const heatTMax = 1.0;

    function heatColorFrom01(t01) {
      const t2 = heatTMin + (heatTMax - heatTMin) * t01;
      return d3.interpolateTurbo(t2);
    }

    function heatColor(v) {
      const denom = Math.max(1, maxInDegree);
      return heatColorFrom01(v / denom);
    }

    // Combined:
    function normDep(v) {
      return (Math.max(0, v) / Math.max(1, maxInDegree));
    }

    function normGit(v) {
      if (!maxGit) return 0;
      // log compression helps huge repos a lot
      return Math.log1p(Math.max(0, v)) / Math.log1p(maxGit);
    }

    function combinedT01(d) {
      const a = 0.5; // weight: dependencies vs git
      return a * normDep(d.inDegree || 0) + (1 - a) * normGit(d.gitScore || 0);
    }

    // Color scale by category
    const color = d3.scaleOrdinal()
      .domain(['component', 'utility', 'api', 'test', 'config', 'model', 'other'])
      .range(['#61dafb', '#ffd700', '#ff6b6b', '#4ecdc4', '#95a5a6', '#9b59b6', '#95a5a6']);

    // Color mode toggle
    let colorMode = 'types'; // 'types' | 'heat' | 'combined'

    function nodeFill(d) {
      if (colorMode === 'types') return color(d.category);
      if (colorMode === 'heat') return heatColor(d.inDegree || 0);
      // combined
      return heatColorFrom01(combinedT01(d));
    }

    const svg = d3.select('#graph')
      .append('svg')
      .attr('width', width)
      .attr('height', height);

    // ---- Arrow marker definition ----
    const defs = svg.append('defs');

    defs.append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 9)
      .attr('refY', 0)
      .attr('markerWidth', 8)
      .attr('markerHeight', 8)
      .attr('orient', 'auto')
      .attr('markerUnits', 'userSpaceOnUse')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', 'context-stroke')
      .attr('stroke', 'none');

    const g = svg.append('g');

    const zoom = d3.zoom()
      .scaleExtent([0.1, 10])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    const simulation = d3.forceSimulation(graphData.nodes)
      .force('link', d3.forceLink(graphData.links)
        .id(d => d.id)
        .distance(80)
        .strength(0.5))
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(35))
      .alpha(1)
      .alphaDecay(0.03);

    const link = g.append('g')
      .selectAll('line')
      .data(graphData.links)
      .enter().append('line')
      .attr('class', 'link')
      .attr('stroke-width', 1)
      .attr('marker-end', 'url(#arrowhead)');

    const node = g.append('g')
      .selectAll('g')
      .data(graphData.nodes)
      .enter().append('g')
      .attr('class', 'node')
      .call(d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended));

    const NODE_R = 8;

    node.append('circle')
      .attr('r', NODE_R)
      .attr('fill', d => nodeFill(d));

    node.append('text')
      .attr('dy', 22)
      .text(d => d.label);

    function applyNodeColors() {
      node.select('circle').attr('fill', d => nodeFill(d));
      // update the legend label text
      const heatModeLabel = document.getElementById('heatModeLabel');
      if (colorMode === 'heat') heatModeLabel.textContent = 'Heat = in-degree (dependencies)';
      else if (colorMode === 'combined') heatModeLabel.textContent = 'Heat = 50% in-degree + 50% git touches';
      else heatModeLabel.textContent = '';
    }

    const typesLegend = document.getElementById('typesLegend');
    const heatLegend = document.getElementById('heatLegend');

    function applyColorMode(mode) {
      colorMode = mode;

      // show/hide legends
      const isHeatish = (mode === 'heat' || mode === 'combined');
      typesLegend.style.display = (mode === 'types') ? 'block' : 'none';
      heatLegend.style.display = isHeatish ? 'block' : 'none';

      applyNodeColors();
    }

    document.getElementById('modeTypes').addEventListener('change', (e) => {
      if (e.target.checked) applyColorMode('types');
    });

    document.getElementById('modeHeat').addEventListener('change', (e) => {
      if (e.target.checked) applyColorMode('heat');
    });

    document.getElementById('modeCombined').addEventListener('change', (e) => {
      if (e.target.checked) applyColorMode('combined');
    });

    // initialize
    applyColorMode('types');

    // Tooltips
    const tooltip = d3.select('#tooltip');

    // Highlighting
    function clearHighlights() {
      node.classed('highlighted', false);
      link.classed('highlighted', false);
    }

    function highlightNode(d) {
      clearHighlights();

      node.classed('highlighted', n => n.id === d.id);

      link.classed('highlighted', l =>
        l.source.id === d.id || l.target.id === d.id
      );
    }

    function zoomToNode(d) {
      const scale = 2;

      svg.transition()
        .duration(750)
        .call(
          zoom.transform,
          d3.zoomIdentity.translate(width / 2, height / 2).scale(scale).translate(-d.x, -d.y)
        );
    }

    let clickTimer;
    let clickCount = 0;

    node.on('mouseover', (event, d) => {
      tooltip
        .style('display', 'block')
        .style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY + 10) + 'px')
        .html(\`
          <div class="tooltip-title">\${d.label}</div>
          <div class="tooltip-line"><span class="tooltip-label">Path:</span><span>\${d.id}</span></div>
          <div class="tooltip-line"><span class="tooltip-label">Category:</span><span>\${d.category}</span></div>
          <div class="tooltip-line"><span class="tooltip-label">In-degree:</span><span>\${d.inDegree ?? 0}</span></div>
          <div class="tooltip-line"><span class="tooltip-label">Git:</span><span>\${d.gitScore ?? 0}</span></div>
          \${d.language ? '<div class="tooltip-line"><span class="tooltip-label">Language:</span><span>' + d.language + '</span></div>' : ''}
        \`);
    })
    .on('mouseout', () => {
      tooltip.style('display', 'none');
    })
    .on('click', (event, d) => {
      clickCount++;

      if (clickCount === 1) {
        highlightNode(d);
        zoomToNode(d);

        clickTimer = setTimeout(() => {
          clickCount = 0;
        }, 350);
      } else if (clickCount === 2) {
        clearTimeout(clickTimer);
        clickCount = 0;
        vscode.postMessage({ command: 'openFile', path: d.id });
      }
    });

    // Search functionality
    const searchInput = document.getElementById('searchInput');
    const searchSuggestions = document.getElementById('searchSuggestions');
    let selectedSuggestionIndex = -1;

    function updateSuggestions(query) {
      selectedSuggestionIndex = -1;

      if (!query.trim()) {
        searchSuggestions.classList.remove('active');
        return;
      }

      const lowerQuery = query.toLowerCase();
      const matches = graphData.nodes.filter(node =>
        node.label.toLowerCase().includes(lowerQuery) ||
        node.id.toLowerCase().includes(lowerQuery)
      ).slice(0, 10);

      if (matches.length === 0) {
        searchSuggestions.classList.remove('active');
        return;
      }

      searchSuggestions.innerHTML = matches.map((match, index) => \`
        <div class="suggestion-item" data-index="\${index}" data-id="\${match.id}">
          <strong>\${match.label}</strong>
          <div style="font-size: 10px; color: #999; margin-top: 2px;">\${match.id}</div>
        </div>
      \`).join('');

      searchSuggestions.classList.add('active');

      document.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('click', () => {
          const nodeId = item.getAttribute('data-id');
          const selectedNode = graphData.nodes.find(n => n.id === nodeId);
          if (selectedNode) {
            searchInput.value = selectedNode.label;
            searchSuggestions.classList.remove('active');
            highlightNode(selectedNode);
            zoomToNode(selectedNode);
          }
        });
      });
    }

    searchInput.addEventListener('input', (e) => {
      updateSuggestions(e.target.value);
    });

    searchInput.addEventListener('keydown', (e) => {
      const items = document.querySelectorAll('.suggestion-item');

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedSuggestionIndex = Math.min(selectedSuggestionIndex + 1, items.length - 1);
        updateSuggestionSelection(items);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedSuggestionIndex = Math.max(selectedSuggestionIndex - 1, -1);
        updateSuggestionSelection(items);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (selectedSuggestionIndex >= 0 && items[selectedSuggestionIndex]) {
          items[selectedSuggestionIndex].click();
        } else if (searchInput.value.trim()) {
          const query = searchInput.value.toLowerCase();
          const match = graphData.nodes.find(n =>
            n.label.toLowerCase() === query || n.id.toLowerCase() === query
          );
          if (match) {
            searchSuggestions.classList.remove('active');
            highlightNode(match);
            zoomToNode(match);
          }
        }
      }
    });

    function updateSuggestionSelection(items) {
      items.forEach((item, index) => {
        if (index === selectedSuggestionIndex) item.classList.add('selected');
        else item.classList.remove('selected');
      });
    }

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-container')) {
        searchSuggestions.classList.remove('active');
      }
    });

    // ----- Tick update: shorten lines so arrows stop near node edge -----
    function shortenLine(sx, sy, tx, ty, targetPad) {
      const dx = tx - sx;
      const dy = ty - sy;
      const dist = Math.sqrt(dx*dx + dy*dy) || 1;
      const ux = dx / dist;
      const uy = dy / dist;
      return { x1: sx, y1: sy, x2: tx - ux * targetPad, y2: ty - uy * targetPad };
    }

    simulation.on('tick', () => {
      link.each(function(d) {
        const sx = d.source.x;
        const sy = d.source.y;
        const tx = d.target.x;
        const ty = d.target.y;

        const targetPad = NODE_R + 2;
        const p = shortenLine(sx, sy, tx, ty, targetPad);

        d3.select(this)
          .attr('x1', p.x1)
          .attr('y1', p.y1)
          .attr('x2', p.x2)
          .attr('y2', p.y2);
      });

      node.attr('transform', d => \`translate(\${d.x},\${d.y})\`);
    });

    function dragstarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }
  </script>
</body>
</html>`;
  }
}

