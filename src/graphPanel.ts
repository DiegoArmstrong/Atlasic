import * as vscode from 'vscode';
import { CodebaseGraph } from './types';

export class GraphPanel {
  private static currentPanel: GraphPanel | undefined;
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

    this.panel.webview.onDidReceiveMessage(
      message => {
        switch (message.command) {
          case 'openFile':
            this.openFile(message.path);
            break;
        }
      }
    );
  }

  private update() {
    this.panel.webview.html = this.getHtmlContent();
  }

  private openFile(filePath: string) {
    vscode.window.showTextDocument(vscode.Uri.file(filePath));
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
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      overflow: hidden;
      background: #1e1e1e;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    
    #graph {
      width: 100vw;
      height: 100vh;
      display: block;
    }
    
    .node {
      cursor: pointer;
    }
    
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
      stroke-width: 3px;
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
    
    .tooltip-title {
      font-weight: bold;
      margin-bottom: 6px;
      color: #61dafb;
    }
    
    .tooltip-line {
      margin: 2px 0;
    }
    
    .tooltip-label {
      color: #aaa;
      display: inline-block;
      width: 80px;
    }
    
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
    
    .search-title {
      font-weight: bold;
      margin-bottom: 8px;
      color: #61dafb;
    }
    
    .search-box {
      position: relative;
      width: 100%;
    }
    
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
    
    .search-suggestions.active {
      display: block;
    }
    
    .suggestion-item {
      padding: 8px;
      cursor: pointer;
      border-bottom: 1px solid #444;
      font-size: 11px;
      transition: background 0.2s;
    }
    
    .suggestion-item:hover {
      background: #444;
    }
    
    .suggestion-item.selected {
      background: #61dafb;
      color: #1e1e1e;
    }
    
    .search-hint {
      font-size: 10px;
      color: #999;
      margin-top: 6px;
    }
    
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
    }
    
    .control-title {
      font-weight: bold;
      margin-bottom: 10px;
      color: #61dafb;
    }
    
    .stat-line {
      margin: 4px 0;
    }
    
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
    
    .legend-title {
      font-weight: bold;
      margin-bottom: 10px;
      color: #61dafb;
    }
    
    .legend-item {
      display: flex;
      align-items: center;
      margin: 4px 0;
    }
    
    .legend-color {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      margin-right: 8px;
    }
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

    <div class="stat-line">
      <label style="display:flex; gap:8px; align-items:center; user-select:none;">
        <input type="checkbox" id="heatToggle" />
        Heatmap (In-degree)
      </label>
    </div>

    <div class="stat-line" id="heatLegend" style="display:none; margin-top:8px;">
      <div style="font-size:11px; color:#aaa; margin-bottom:4px;">Cold → Hot</div>
      <div style="height:10px; border-radius:6px; border:1px solid #444;
                  background: linear-gradient(to right, #2c7bb6, #ffffbf, #d7191c);"></div>
      <div style="display:flex; justify-content:space-between; font-size:10px; color:#999; margin-top:4px;">
        <span>0</span><span id="heatMax">0</span>
      </div>
    </div>
  </div>

  <div class="legend">
    <div class="legend-title">📁 File Categories</div>
    <div class="legend-item">
      <div class="legend-color" style="background: #61dafb;"></div>
      <span>Component</span>
    </div>
    <div class="legend-item">
      <div class="legend-color" style="background: #ffd700;"></div>
      <span>Utility</span>
    </div>
    <div class="legend-item">
      <div class="legend-color" style="background: #ff6b6b;"></div>
      <span>API/Service</span>
    </div>
    <div class="legend-item">
      <div class="legend-color" style="background: #4ecdc4;"></div>
      <span>Test</span>
    </div>
    <div class="legend-item">
      <div class="legend-color" style="background: #95a5a6;"></div>
      <span>Config</span>
    </div>
    <div class="legend-item">
      <div class="legend-color" style="background: #9b59b6;"></div>
      <span>Model</span>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const graphData = ${JSON.stringify(this.graph)};
    
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    // Update stats
    document.getElementById('nodeCount').textContent = graphData.nodes.length;
    document.getElementById('linkCount').textContent = graphData.links.length;

    // ---- Heatmap: compute in-degree (how many files import this file) ----
    const inDegree = new Map();
    graphData.nodes.forEach(n => inDegree.set(n.id, 0));

    // IMPORTANT: links may be strings initially; D3 later mutates them to objects
    graphData.links.forEach(l => {
      const targetId = (typeof l.target === 'string') ? l.target : l.target.id;
      inDegree.set(targetId, (inDegree.get(targetId) || 0) + 1);
    });

    // Attach inDegree onto node objects for easy access
    graphData.nodes.forEach(n => {
      n.inDegree = inDegree.get(n.id) || 0;
    });

    const maxInDegree = d3.max(graphData.nodes, d => d.inDegree) || 0;
    document.getElementById('heatMax').textContent = String(maxInDegree);

    // Heat scale (0 -> max)
    const heatTMin = 0.15; // 0 maps here (blue-ish instead of black/purple)
    const heatTMax = 1.0;

    function heatColor(v) {
      const denom = Math.max(1, maxInDegree);
      const t = v / denom; // 0..1
      const t2 = heatTMin + (heatTMax - heatTMin) * t; // 0.15..1
      return d3.interpolateTurbo(t2);
    }

    let heatmapEnabled = false;

    const svg = d3.select('#graph')
      .append('svg')
      .attr('width', width)
      .attr('height', height);
    
    const g = svg.append('g');
    
    // Add zoom behavior
    const zoom = d3.zoom()
      .scaleExtent([0.1, 10])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });
    
    svg.call(zoom);
    
    // Color scale by category
    const color = d3.scaleOrdinal()
      .domain(['component', 'utility', 'api', 'test', 'config', 'model', 'other'])
      .range(['#61dafb', '#ffd700', '#ff6b6b', '#4ecdc4', '#95a5a6', '#9b59b6', '#95a5a6']);

    function nodeFill(d) {
      return heatmapEnabled ? heatColor(d.inDegree) : color(d.category);
    }
    
    // Create simulation with improved forces
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
    
    // Create links
    const link = g.append('g')
      .selectAll('line')
      .data(graphData.links)
      .enter().append('line')
      .attr('class', 'link')
      .attr('stroke-width', 1);
    
    // Create nodes
    const node = g.append('g')
      .selectAll('g')
      .data(graphData.nodes)
      .enter().append('g')
      .attr('class', 'node')
      .call(d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended));
    
    node.append('circle')
      .attr('r', 8)
      .attr('fill', d => nodeFill(d));
    
    node.append('text')
      .attr('dy', 22)
      .text(d => d.label);

    function applyNodeColors() {
      node.select('circle').attr('fill', d => nodeFill(d));
    }

    const heatToggle = document.getElementById('heatToggle');
    const heatLegend = document.getElementById('heatLegend');

    heatToggle.addEventListener('change', (e) => {
      heatmapEnabled = e.target.checked;
      heatLegend.style.display = heatmapEnabled ? 'block' : 'none';
      applyNodeColors();
    });
    
    // Tooltips
    const tooltip = d3.select('#tooltip');
    
    // Store highlighted state
    let highlightedNode = null;
    
    // Clear highlights function
    function clearHighlights() {
      node.classed('highlighted', false);
      link.classed('highlighted', false);
      highlightedNode = null;
    }
    
    // Highlight node and its links function
    function highlightNode(d) {
      clearHighlights();
      
      node.classed('highlighted', n => n.id === d.id);
      
      link.classed('highlighted', l => 
        l.source.id === d.id || l.target.id === d.id
      );
      
      highlightedNode = d;
    }
    
    // Zoom to node function
    function zoomToNode(d) {
      const scale = 2;
      
      svg.transition()
        .duration(750)
        .call(
          zoom.transform,
          d3.zoomIdentity.translate(width / 2, height / 2).scale(scale).translate(-d.x, -d.y)
        );
    }
    
    // Click counter for double click detection
    let clickTimer;
    let clickCount = 0;
    
    node.on('mouseover', (event, d) => {
      tooltip
        .style('display', 'block')
        .style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY + 10) + 'px')
        .html(\`
          <div class="tooltip-title">\${d.label}</div>
          <div class="tooltip-line">
            <span class="tooltip-label">Path:</span><span>\${d.id}</span>
          </div>
          <div class="tooltip-line">
            <span class="tooltip-label">Category:</span><span>\${d.category}</span>
          </div>
          <div class="tooltip-line">
            <span class="tooltip-label">In-degree:</span><span>\${d.inDegree ?? 0}</span>
          </div>
          \${d.language ? '<div class="tooltip-line"><span class="tooltip-label">Language:</span><span>' + d.language + '</span></div>' : ''}
        \`);
    })
    .on('mouseout', () => {
      tooltip.style('display', 'none');
    })
    .on('click', (event, d) => {
      clickCount++;
      
      if (clickCount === 1) {
        // Single click - highlight node and links, zoom to it
        highlightNode(d);
        zoomToNode(d);
        
        clickTimer = setTimeout(() => {
          clickCount = 0;
        }, 350);
      } else if (clickCount === 2) {
        // Double click - open file
        clearTimeout(clickTimer);
        clickCount = 0;
        vscode.postMessage({
          command: 'openFile',
          path: d.id
        });
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
      
      // Add click handlers to suggestions
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
          // Search by typing exact name
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
        if (index === selectedSuggestionIndex) {
          item.classList.add('selected');
        } else {
          item.classList.remove('selected');
        }
      });
    }
    
    // Close search suggestions when clicking elsewhere
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-container')) {
        searchSuggestions.classList.remove('active');
      }
    });
    
    // Update positions
    simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);
      
      node.attr('transform', d => \`translate(\${d.x},\${d.y})\`);
    });
    
    // Drag functions
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

