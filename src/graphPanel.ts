import * as vscode from 'vscode';
import { CodebaseGraph } from './types';

export class GraphPanel {
  private static currentPanel: GraphPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private graph: CodebaseGraph;

  public static createOrShow(extensionUri: vscode.Uri, graph: CodebaseGraph) {
    // Debug: log received graph
    console.log('GraphPanel.createOrShow called with graph:', {
      hasGraph: !!graph,
      nodeCount: graph?.nodes?.length ?? 0,
      linkCount: graph?.links?.length ?? 0
    });

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

  private getHtmlContent(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Atlasic</title>
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

    #graphCanvas {
      width: 100vw;
      height: 100vh;
      display: block;
      cursor: grab;
    }

    #graphCanvas.dragging {
      cursor: grabbing;
    }

    #graphCanvas.pointer {
      cursor: pointer;
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
      max-width: 400px;
      word-wrap: break-word;
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
      width: 230px;
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
  <canvas id="graphCanvas"></canvas>
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

      <label style="display:flex; gap:8px; align-items:center; user-select:none;">
        <input type="radio" name="colorMode" id="modeHeat" value="heat" />
        Heatmap (In-degree)
      </label>
    </div>

    <div class="stat-line" id="heatLegend" style="display:none; margin-top:10px;">
      <div style="font-size:11px; color:#aaa; margin-bottom:4px;">Cold → Hot</div>
      <div style="height:10px; border-radius:6px; border:1px solid #444;
                  background: linear-gradient(to right, #2c7bb6, #ffffbf, #d7191c);"></div>
      <div style="display:flex; justify-content:space-between; font-size:10px; color:#999; margin-top:4px;">
        <span>0</span><span id="heatMax">0</span>
      </div>
    </div>
  </div>

  <div class="legend" id="typesLegend">
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
    
    // Parse graph data with safety checks
    const rawGraph = ${JSON.stringify(this.graph || { nodes: [], links: [], timestamp: Date.now() })};
    const graphData = {
      nodes: Array.isArray(rawGraph.nodes) ? rawGraph.nodes : [],
      links: Array.isArray(rawGraph.links) ? rawGraph.links : [],
      timestamp: rawGraph.timestamp || Date.now()
    };

    // Debug logging
    console.log('Atlasic: Loaded graph data', { 
      nodeCount: graphData.nodes.length, 
      linkCount: graphData.links.length,
      rawGraph: rawGraph
    });

    // ========== CANVAS SETUP ==========
    const canvas = document.getElementById('graphCanvas');
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    let width = window.innerWidth;
    let height = window.innerHeight;

    // NOTE: resizeCanvas() is called at the end after all variables are initialized
    function resizeCanvas() {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (typeof render === 'function') render();
    }
    window.addEventListener('resize', resizeCanvas);

    // Update stats
    document.getElementById('nodeCount').textContent = graphData.nodes.length;
    document.getElementById('linkCount').textContent = graphData.links.length;

    // ========== DATA PREPARATION ==========
    // Build node map for O(1) lookup
    const nodeMap = new Map();
    
    // For massive graphs, spread nodes out more initially
    const spreadFactor = Math.max(1, Math.sqrt(graphData.nodes.length / 100));
    graphData.nodes.forEach(n => {
      n.x = width / 2 + (Math.random() - 0.5) * 400 * spreadFactor;
      n.y = height / 2 + (Math.random() - 0.5) * 400 * spreadFactor;
      n.vx = 0;
      n.vy = 0;
      nodeMap.set(n.id, n);
    });

    // Resolve link references to node objects
    graphData.links.forEach(l => {
      if (typeof l.source === 'string') l.source = nodeMap.get(l.source);
      if (typeof l.target === 'string') l.target = nodeMap.get(l.target);
    });

    // Filter out invalid links
    const validLinks = graphData.links.filter(l => l.source && l.target);
    
    console.log('Atlasic: Processed data', {
      validLinkCount: validLinks.length,
      nodeMapSize: nodeMap.size
    });

    // Compute in-degree
    const inDegree = new Map();
    graphData.nodes.forEach(n => inDegree.set(n.id, 0));
    validLinks.forEach(l => {
      inDegree.set(l.target.id, (inDegree.get(l.target.id) || 0) + 1);
    });
    graphData.nodes.forEach(n => {
      n.inDegree = inDegree.get(n.id) || 0;
    });

    const maxInDegree = Math.max(1, ...graphData.nodes.map(n => n.inDegree));
    document.getElementById('heatMax').textContent = String(maxInDegree);

    // ========== COLOR FUNCTIONS ==========
    const categoryColors = {
      component: '#61dafb',
      utility: '#ffd700',
      api: '#ff6b6b',
      test: '#4ecdc4',
      config: '#95a5a6',
      model: '#9b59b6',
      other: '#95a5a6'
    };

    // Turbo colormap approximation for heatmap
    function turboColormap(t) {
      t = Math.max(0, Math.min(1, t));
      const r = Math.max(0, Math.min(255, Math.round(34.61 + t * (1172.33 - t * (10793.56 - t * (33300.12 - t * (38394.49 - t * 14825.05)))))));
      const g = Math.max(0, Math.min(255, Math.round(23.31 + t * (557.33 + t * (1225.33 - t * (3574.96 - t * (1073.77 + t * 707.56)))))));
      const b = Math.max(0, Math.min(255, Math.round(27.2 + t * (3211.1 - t * (15327.97 - t * (27814 - t * (22569.18 - t * 6838.66)))))));
      return 'rgb(' + r + ',' + g + ',' + b + ')';
    }

    function heatColor(v) {
      const t = v / maxInDegree;
      const t2 = 0.15 + 0.85 * t;
      return turboColormap(t2);
    }

    let colorMode = 'types';

    function getNodeColor(node) {
      if (colorMode === 'heat') {
        return heatColor(node.inDegree);
      }
      return categoryColors[node.category] || categoryColors.other;
    }

    // ========== TRANSFORM STATE (zoom/pan) ==========
    let transform = { x: 0, y: 0, k: 1 };

    function screenToWorld(sx, sy) {
      return {
        x: (sx - transform.x) / transform.k,
        y: (sy - transform.y) / transform.k
      };
    }

    function worldToScreen(wx, wy) {
      return {
        x: wx * transform.k + transform.x,
        y: wy * transform.k + transform.k
      };
    }

    // ========== QUADTREE FOR HIT DETECTION ==========
    class Quadtree {
      constructor(bounds, capacity = 4) {
        this.bounds = bounds;
        this.capacity = capacity;
        this.points = [];
        this.divided = false;
      }

      contains(bounds, x, y) {
        return x >= bounds.x && x < bounds.x + bounds.w &&
               y >= bounds.y && y < bounds.y + bounds.h;
      }

      intersects(a, b) {
        return !(a.x + a.w < b.x || b.x + b.w < a.x ||
                 a.y + a.h < b.y || b.y + b.h < a.y);
      }

      subdivide() {
        const { x, y, w, h } = this.bounds;
        const hw = w / 2, hh = h / 2;
        this.nw = new Quadtree({ x, y, w: hw, h: hh }, this.capacity);
        this.ne = new Quadtree({ x: x + hw, y, w: hw, h: hh }, this.capacity);
        this.sw = new Quadtree({ x, y: y + hh, w: hw, h: hh }, this.capacity);
        this.se = new Quadtree({ x: x + hw, y: y + hh, w: hw, h: hh }, this.capacity);
        this.divided = true;
      }

      insert(point) {
        if (!this.contains(this.bounds, point.x, point.y)) return false;
        if (this.points.length < this.capacity) {
          this.points.push(point);
          return true;
        }
        if (!this.divided) this.subdivide();
        return this.nw.insert(point) || this.ne.insert(point) ||
               this.sw.insert(point) || this.se.insert(point);
      }

      query(range, found = []) {
        if (!this.intersects(this.bounds, range)) return found;
        for (const p of this.points) {
          if (this.contains(range, p.x, p.y)) found.push(p);
        }
        if (this.divided) {
          this.nw.query(range, found);
          this.ne.query(range, found);
          this.sw.query(range, found);
          this.se.query(range, found);
        }
        return found;
      }
    }

    let quadtree = null;

    function rebuildQuadtree() {
      const padding = 1000;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const n of graphData.nodes) {
        if (n.x < minX) minX = n.x;
        if (n.y < minY) minY = n.y;
        if (n.x > maxX) maxX = n.x;
        if (n.y > maxY) maxY = n.y;
      }
      quadtree = new Quadtree({
        x: minX - padding,
        y: minY - padding,
        w: (maxX - minX) + padding * 2,
        h: (maxY - minY) + padding * 2
      }, 8);
      for (const n of graphData.nodes) {
        quadtree.insert(n);
      }
    }

    function findNodeAt(wx, wy, radius = 12) {
      if (!quadtree) return null;
      const candidates = quadtree.query({
        x: wx - radius, y: wy - radius,
        w: radius * 2, h: radius * 2
      });
      let closest = null;
      let closestDist = radius * radius;
      for (const n of candidates) {
        const dx = n.x - wx, dy = n.y - wy;
        const d2 = dx * dx + dy * dy;
        if (d2 < closestDist) {
          closestDist = d2;
          closest = n;
        }
      }
      return closest;
    }

    // ========== FORCE SIMULATION ==========
    const NODE_R = 8;
    const LINK_DISTANCE = 80;
    const LINK_STRENGTH = 0.5;
    const CHARGE_STRENGTH = -400;
    const COLLISION_RADIUS = 35;
    const THETA = 0.9; // Barnes-Hut threshold (higher = faster but less accurate)

    let alpha = 1;
    let alphaDecay = 0.02;
    let alphaMin = 0.001;
    let alphaTarget = 0;

    // Determine graph size tier for optimizations
    const nodeCount = graphData.nodes.length;
    const isLargeGraph = nodeCount > 200;
    const isHugeGraph = nodeCount > 5000;
    const isMassiveGraph = nodeCount > 20000;
    
    // Adjust parameters based on graph size
    if (isMassiveGraph) {
      alphaDecay = 0.15; // Very fast settling
      alpha = 0.5; // Start lower
      console.log('Atlasic: MASSIVE graph mode (' + nodeCount + ' nodes) - using aggressive optimizations');
    } else if (isHugeGraph) {
      alphaDecay = 0.08;
      console.log('Atlasic: Huge graph mode (' + nodeCount + ' nodes)');
    } else if (isLargeGraph) {
      alphaDecay = 0.05;
      console.log('Atlasic: Large graph mode (' + nodeCount + ' nodes)');
    }

    // For massive graphs, sample links for force calculation
    let sampledLinks = validLinks;
    if (isMassiveGraph && validLinks.length > 10000) {
      // Sample ~10000 links for force calculation
      const sampleRate = 10000 / validLinks.length;
      sampledLinks = validLinks.filter(() => Math.random() < sampleRate);
      console.log('Atlasic: Sampled ' + sampledLinks.length + ' links for simulation');
    }

    // Barnes-Hut quadtree for O(N log N) charge calculation
    class BHQuadtree {
      constructor(x, y, w, h) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.body = null;
        this.mass = 0;
        this.cx = 0;
        this.cy = 0;
        this.children = null;
      }

      insert(node) {
        if (this.mass === 0) {
          this.body = node;
          this.mass = 1;
          this.cx = node.x;
          this.cy = node.y;
          return;
        }

        const totalMass = this.mass + 1;
        this.cx = (this.cx * this.mass + node.x) / totalMass;
        this.cy = (this.cy * this.mass + node.y) / totalMass;
        this.mass = totalMass;

        if (!this.children) {
          this.children = this.subdivide();
          if (this.body) {
            this.insertIntoChildren(this.body);
            this.body = null;
          }
        }
        this.insertIntoChildren(node);
      }

      subdivide() {
        const hw = this.w / 2;
        const hh = this.h / 2;
        return [
          new BHQuadtree(this.x, this.y, hw, hh),
          new BHQuadtree(this.x + hw, this.y, hw, hh),
          new BHQuadtree(this.x, this.y + hh, hw, hh),
          new BHQuadtree(this.x + hw, this.y + hh, hw, hh)
        ];
      }

      insertIntoChildren(node) {
        const midX = this.x + this.w / 2;
        const midY = this.y + this.h / 2;
        const i = (node.x >= midX ? 1 : 0) + (node.y >= midY ? 2 : 0);
        this.children[i].insert(node);
      }

      calculateForce(node, theta, strength) {
        if (this.mass === 0) return { fx: 0, fy: 0 };

        const dx = this.cx - node.x;
        const dy = this.cy - node.y;
        const distSq = dx * dx + dy * dy;

        if (this.body) {
          if (this.body === node) return { fx: 0, fy: 0 };
          const dist = Math.sqrt(distSq) || 1;
          const force = strength / distSq;
          return { fx: (dx / dist) * force, fy: (dy / dist) * force };
        }

        const dist = Math.sqrt(distSq) || 1;
        if (this.w / dist < theta) {
          const force = strength * this.mass / distSq;
          return { fx: (dx / dist) * force, fy: (dy / dist) * force };
        }

        let fx = 0, fy = 0;
        if (this.children) {
          for (const child of this.children) {
            const f = child.calculateForce(node, theta, strength);
            fx += f.fx;
            fy += f.fy;
          }
        }
        return { fx, fy };
      }
    }

    // For massive graphs, sample nodes for charge calculation
    let chargeNodes = graphData.nodes;
    if (isMassiveGraph) {
      // Only calculate charge for a subset of nodes each tick
      const chargeSampleSize = Math.min(5000, nodeCount);
      chargeNodes = graphData.nodes.slice(0, chargeSampleSize);
    }

    function tick() {
      alpha += (alphaTarget - alpha) * alphaDecay;
      if (alpha < alphaMin) {
        alpha = 0;
        return;
      }

      // Link force - use sampled links for massive graphs
      for (const link of sampledLinks) {
        const source = link.source;
        const target = link.target;
        let dx = target.x - source.x;
        let dy = target.y - source.y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 1;
        let force = (dist - LINK_DISTANCE) * LINK_STRENGTH * alpha;
        dx = (dx / dist) * force;
        dy = (dy / dist) * force;
        target.vx -= dx;
        target.vy -= dy;
        source.vx += dx;
        source.vy += dy;
      }

      // Charge force using Barnes-Hut - O(N log N)
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const node of graphData.nodes) {
        if (node.x < minX) minX = node.x;
        if (node.y < minY) minY = node.y;
        if (node.x > maxX) maxX = node.x;
        if (node.y > maxY) maxY = node.y;
      }
      const padding = 100;
      const bhTree = new BHQuadtree(
        minX - padding, minY - padding,
        (maxX - minX) + padding * 2 || 1,
        (maxY - minY) + padding * 2 || 1
      );
      for (const node of graphData.nodes) {
        bhTree.insert(node);
      }
      
      // Apply charge to sampled nodes for massive graphs
      const theta = isMassiveGraph ? 1.5 : THETA; // More aggressive approximation
      for (const node of chargeNodes) {
        const f = bhTree.calculateForce(node, theta, CHARGE_STRENGTH * alpha);
        node.vx += f.fx;
        node.vy += f.fy;
      }

      // Center force
      const cx = width / 2, cy = height / 2;
      const centerStrength = isMassiveGraph ? 0.005 : 0.01;
      for (const node of graphData.nodes) {
        node.vx += (cx - node.x) * centerStrength * alpha;
        node.vy += (cy - node.y) * centerStrength * alpha;
      }

      // Skip collision for massive graphs entirely
      if (!isMassiveGraph && nodeCount < 500) {
        for (let i = 0; i < nodeCount; i++) {
          for (let j = i + 1; j < nodeCount; j++) {
            const a = graphData.nodes[i];
            const b = graphData.nodes[j];
            let dx = b.x - a.x;
            let dy = b.y - a.y;
            let dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const minDist = COLLISION_RADIUS * 2;
            if (dist < minDist) {
              const force = (minDist - dist) * 0.5 * alpha;
              const fx = (dx / dist) * force;
              const fy = (dy / dist) * force;
              a.vx -= fx;
              a.vy -= fy;
              b.vx += fx;
              b.vy += fy;
            }
          }
        }
      }

      // Apply velocities
      const velocityDecay = isMassiveGraph ? 0.4 : 0.6;
      for (const node of graphData.nodes) {
        if (node.fx != null) {
          node.x = node.fx;
          node.vx = 0;
        } else {
          node.vx *= velocityDecay;
          node.x += node.vx;
        }
        if (node.fy != null) {
          node.y = node.fy;
          node.vy = 0;
        } else {
          node.vy *= velocityDecay;
          node.y += node.vy;
        }
      }
    }

    // ========== RENDERING WITH VIEWPORT CULLING ==========
    let highlightedNode = null;
    let hoveredNode = null;
    const highlightedLinks = new Set();

    function updateHighlightedLinks() {
      highlightedLinks.clear();
      if (highlightedNode) {
        for (const link of validLinks) {
          if (link.source.id === highlightedNode.id || link.target.id === highlightedNode.id) {
            highlightedLinks.add(link);
          }
        }
      }
    }

    // Get visible bounds in world coordinates
    function getVisibleBounds() {
      const x1 = -transform.x / transform.k;
      const y1 = -transform.y / transform.k;
      const x2 = (width - transform.x) / transform.k;
      const y2 = (height - transform.y) / transform.k;
      return { x1, y1, x2, y2 };
    }

    function render() {
      ctx.save();
      ctx.clearRect(0, 0, width, height);

      // Apply transform
      ctx.translate(transform.x, transform.y);
      ctx.scale(transform.k, transform.k);

      const bounds = getVisibleBounds();
      const padding = 50 / transform.k;
      
      // Determine detail level based on zoom and graph size
      const showLabels = transform.k > 0.3 && (!isMassiveGraph || transform.k > 1);
      const showArrows = transform.k > 0.2 && !isMassiveGraph;
      const simplifiedNodes = isMassiveGraph && transform.k < 0.5;

      // Draw links - with viewport culling
      ctx.lineWidth = Math.max(0.5, 1 / transform.k);
      
      if (isMassiveGraph && !highlightedNode) {
        // For massive graphs without highlight, draw simplified links
        ctx.strokeStyle = 'rgba(153, 153, 153, 0.3)';
        ctx.beginPath();
        let drawnLinks = 0;
        const maxLinks = 50000;
        for (const link of validLinks) {
          if (drawnLinks >= maxLinks) break;
          const sx = link.source.x, sy = link.source.y;
          const tx = link.target.x, ty = link.target.y;
          
          // Quick bounds check
          if ((sx < bounds.x1 - padding && tx < bounds.x1 - padding) ||
              (sx > bounds.x2 + padding && tx > bounds.x2 + padding) ||
              (sy < bounds.y1 - padding && ty < bounds.y1 - padding) ||
              (sy > bounds.y2 + padding && ty > bounds.y2 + padding)) continue;
          
          ctx.moveTo(sx, sy);
          ctx.lineTo(tx, ty);
          drawnLinks++;
        }
        ctx.stroke();
      } else {
        // Normal link rendering with highlights
        for (const link of validLinks) {
          const sx = link.source.x, sy = link.source.y;
          const tx = link.target.x, ty = link.target.y;
          
          // Viewport culling
          if ((sx < bounds.x1 - padding && tx < bounds.x1 - padding) ||
              (sx > bounds.x2 + padding && tx > bounds.x2 + padding) ||
              (sy < bounds.y1 - padding && ty < bounds.y1 - padding) ||
              (sy > bounds.y2 + padding && ty > bounds.y2 + padding)) continue;

          const isHighlighted = highlightedLinks.has(link);
          ctx.strokeStyle = isHighlighted ? '#61dafb' : 'rgba(153, 153, 153, 0.6)';

          const dx = tx - sx;
          const dy = ty - sy;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const pad = NODE_R + 2;
          const ex = tx - (dx / dist) * pad;
          const ey = ty - (dy / dist) * pad;

          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(ex, ey);
          ctx.stroke();

          // Draw arrowhead only if enabled
          if (showArrows || isHighlighted) {
            const arrowSize = 8 / transform.k;
            const angle = Math.atan2(dy, dx);
            ctx.fillStyle = ctx.strokeStyle;
            ctx.beginPath();
            ctx.moveTo(ex, ey);
            ctx.lineTo(ex - arrowSize * Math.cos(angle - Math.PI / 6), ey - arrowSize * Math.sin(angle - Math.PI / 6));
            ctx.lineTo(ex - arrowSize * Math.cos(angle + Math.PI / 6), ey - arrowSize * Math.sin(angle + Math.PI / 6));
            ctx.closePath();
            ctx.fill();
          }
        }
      }

      // Draw nodes with viewport culling
      if (simplifiedNodes) {
        // Ultra-simplified rendering for massive graphs zoomed out
        for (const node of graphData.nodes) {
          if (node.x < bounds.x1 - padding || node.x > bounds.x2 + padding ||
              node.y < bounds.y1 - padding || node.y > bounds.y2 + padding) continue;
          
          ctx.fillStyle = getNodeColor(node);
          ctx.fillRect(node.x - 2, node.y - 2, 4, 4);
        }
      } else {
        for (const node of graphData.nodes) {
          if (node.x < bounds.x1 - padding || node.x > bounds.x2 + padding ||
              node.y < bounds.y1 - padding || node.y > bounds.y2 + padding) continue;

          const isHighlighted = highlightedNode && node.id === highlightedNode.id;
          const isHovered = hoveredNode && node.id === hoveredNode.id;
          const r = (isHighlighted || isHovered) ? 12 : NODE_R;

          if (isHighlighted) {
            ctx.shadowColor = 'rgba(97, 218, 251, 0.8)';
            ctx.shadowBlur = 12 / transform.k;
          } else if (isHovered) {
            ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
            ctx.shadowBlur = 8 / transform.k;
          }

          ctx.beginPath();
          ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
          ctx.fillStyle = getNodeColor(node);
          ctx.fill();

          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
          ctx.strokeStyle = isHighlighted ? '#61dafb' : '#fff';
          ctx.lineWidth = isHighlighted ? 3 / transform.k : 1.5 / transform.k;
          ctx.stroke();
        }
      }

      // Draw labels only when zoomed in enough
      if (showLabels) {
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const fontSize = Math.max(10, 10 / transform.k);
        ctx.font = fontSize + 'px sans-serif';

        for (const node of graphData.nodes) {
          if (node.x < bounds.x1 - padding || node.x > bounds.x2 + padding ||
              node.y < bounds.y1 - padding || node.y > bounds.y2 + padding) continue;
          ctx.fillText(node.label, node.x, node.y + 14);
        }
      }

      ctx.restore();
    }

    // ========== ANIMATION LOOP WITH FRAME SKIPPING ==========
    let animating = true;
    let frameCount = 0;
    const renderEveryN = isMassiveGraph ? 3 : 1; // Skip frames for massive graphs

    function animate() {
      if (alpha > 0) {
        tick();
        if (!isMassiveGraph) rebuildQuadtree();
      }
      
      frameCount++;
      if (frameCount % renderEveryN === 0 || alpha === 0) {
        if (isMassiveGraph && alpha > 0) rebuildQuadtree();
        render();
      }
      
      if (animating) {
        requestAnimationFrame(animate);
      }
    }

    // ========== INTERACTION ==========
    const tooltip = document.getElementById('tooltip');
    let isDragging = false;
    let isPanning = false;
    let dragNode = null;
    let lastMouse = { x: 0, y: 0 };
    let clickCount = 0;
    let clickTimer = null;

    function showTooltip(node, screenX, screenY) {
      tooltip.style.display = 'block';
      tooltip.style.left = (screenX + 15) + 'px';
      tooltip.style.top = (screenY + 15) + 'px';
      tooltip.innerHTML =
        '<div class="tooltip-title">' + node.label + '</div>' +
        '<div class="tooltip-line"><span class="tooltip-label">Path:</span><span>' + node.id + '</span></div>' +
        '<div class="tooltip-line"><span class="tooltip-label">Category:</span><span>' + node.category + '</span></div>' +
        '<div class="tooltip-line"><span class="tooltip-label">In-degree:</span><span>' + (node.inDegree || 0) + '</span></div>' +
        (node.language ? '<div class="tooltip-line"><span class="tooltip-label">Language:</span><span>' + node.language + '</span></div>' : '');
    }

    function hideTooltip() {
      tooltip.style.display = 'none';
    }

    function highlightNode(node) {
      highlightedNode = node;
      updateHighlightedLinks();
      render();
    }

    function clearHighlights() {
      highlightedNode = null;
      highlightedLinks.clear();
      render();
    }

    function zoomToNode(node) {
      const targetScale = 2;
      const targetX = width / 2 - node.x * targetScale;
      const targetY = height / 2 - node.y * targetScale;

      // Animate zoom
      const startTransform = { ...transform };
      const startTime = performance.now();
      const duration = 750;

      function animateZoom(time) {
        const elapsed = time - startTime;
        const t = Math.min(1, elapsed / duration);
        const ease = t * (2 - t); // ease out quad

        transform.k = startTransform.k + (targetScale - startTransform.k) * ease;
        transform.x = startTransform.x + (targetX - startTransform.x) * ease;
        transform.y = startTransform.y + (targetY - startTransform.y) * ease;

        render();

        if (t < 1) {
          requestAnimationFrame(animateZoom);
        }
      }
      requestAnimationFrame(animateZoom);
    }

    canvas.addEventListener('mousedown', (e) => {
      if (e.target !== canvas) return;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const world = screenToWorld(sx, sy);
      const node = findNodeAt(world.x, world.y);

      lastMouse = { x: e.clientX, y: e.clientY };

      if (node) {
        isDragging = true;
        dragNode = node;
        node.fx = node.x;
        node.fy = node.y;
        alpha = 0.3;
        alphaTarget = 0.3;
        canvas.classList.add('dragging');
      } else {
        isPanning = true;
        canvas.classList.add('dragging');
      }
    });

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      if (isDragging && dragNode) {
        const world = screenToWorld(sx, sy);
        dragNode.fx = world.x;
        dragNode.fy = world.y;
        render();
      } else if (isPanning) {
        const dx = e.clientX - lastMouse.x;
        const dy = e.clientY - lastMouse.y;
        transform.x += dx;
        transform.y += dy;
        lastMouse = { x: e.clientX, y: e.clientY };
        render();
      } else {
        // Hover detection
        const world = screenToWorld(sx, sy);
        const node = findNodeAt(world.x, world.y);

        if (node !== hoveredNode) {
          hoveredNode = node;
          if (node) {
            canvas.classList.add('pointer');
            showTooltip(node, e.clientX, e.clientY);
          } else {
            canvas.classList.remove('pointer');
            hideTooltip();
          }
          render();
        } else if (node) {
          // Update tooltip position
          showTooltip(node, e.clientX, e.clientY);
        }
      }
    });

    canvas.addEventListener('mouseup', (e) => {
      if (isDragging && dragNode) {
        dragNode.fx = null;
        dragNode.fy = null;
        alphaTarget = 0;
      }
      isDragging = false;
      isPanning = false;
      dragNode = null;
      canvas.classList.remove('dragging');
    });

    canvas.addEventListener('mouseleave', () => {
      hoveredNode = null;
      hideTooltip();
      canvas.classList.remove('pointer');
      render();
    });

    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const world = screenToWorld(sx, sy);
      const node = findNodeAt(world.x, world.y);

      if (!node) {
        clearHighlights();
        return;
      }

      clickCount++;

      if (clickCount === 1) {
        highlightNode(node);
        zoomToNode(node);

        clickTimer = setTimeout(() => {
          clickCount = 0;
        }, 350);
      } else if (clickCount === 2) {
        clearTimeout(clickTimer);
        clickCount = 0;
        vscode.postMessage({
          command: 'openFile',
          path: node.id
        });
      }
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      const zoom = e.deltaY < 0 ? 1.1 : 0.9;
      const newK = Math.max(0.1, Math.min(10, transform.k * zoom));

      // Zoom toward mouse position
      transform.x = sx - (sx - transform.x) * (newK / transform.k);
      transform.y = sy - (sy - transform.y) * (newK / transform.k);
      transform.k = newK;

      render();
    }, { passive: false });

    // ========== SEARCH FUNCTIONALITY ==========
    const searchInput = document.getElementById('searchInput');
    const searchSuggestions = document.getElementById('searchSuggestions');
    let selectedSuggestionIndex = -1;
    let searchDebounceTimer = null;

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

      searchSuggestions.innerHTML = matches.map((match, index) =>
        '<div class="suggestion-item" data-index="' + index + '" data-id="' + match.id + '">' +
          '<strong>' + match.label + '</strong>' +
          '<div style="font-size: 10px; color: #999; margin-top: 2px;">' + match.id + '</div>' +
        '</div>'
      ).join('');

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
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        updateSuggestions(e.target.value);
      }, 150);
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

    // ========== COLOR MODE TOGGLE ==========
    const typesLegend = document.getElementById('typesLegend');
    const heatLegend = document.getElementById('heatLegend');

    function applyColorMode(mode) {
      colorMode = mode;
      typesLegend.style.display = (mode === 'types') ? 'block' : 'none';
      heatLegend.style.display = (mode === 'heat') ? 'block' : 'none';
      render();
    }

    document.getElementById('modeTypes').addEventListener('change', (e) => {
      if (e.target.checked) applyColorMode('types');
    });

    document.getElementById('modeHeat').addEventListener('change', (e) => {
      if (e.target.checked) applyColorMode('heat');
    });

    // ========== INITIALIZATION ==========
    // Set up canvas dimensions (must happen after all variables are defined)
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Initialize color mode, quadtree, and start animation
    applyColorMode('types');
    rebuildQuadtree();
    animate();
  </script>
</body>
</html>`;
  }
}

