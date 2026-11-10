import { useCallback, useEffect, useRef, useState } from "react";
import { diskUsedRatio, formatBytes } from "../../lib/format";
import { isDriveRoot } from "../../lib/paths";
import { getNodeVisualTheme, type NodeVisualTheme } from "../../lib/nodeColors";
import { getChildren } from "../../services/tauriBridge";
import { useFileStore } from "../../store/useFileStore";
import { useVisualizerStore } from "./visualizerState";
import type { FileNode } from "../../types/filesystem";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  baseAlpha: number;
}

interface SatelliteNode {
  node: FileNode;
  parentPath: string;
  x: number;
  y: number;
  radius: number;
  fill: number;
  theme: NodeVisualTheme;
}

interface RenderNode {
  node: FileNode;
  x: number;
  y: number;
  radius: number;
  fill: number;
  theme: NodeVisualTheme;
  isHub: boolean;
  satellites: SatelliteNode[];
  angle: number;
  targetX: number;
  targetY: number;
}

export function OrganicGraph2D() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Store state
  const graphView = useFileStore((state) => state.graphView);
  const drives = useFileStore((state) => state.drives);
  const activeDrive = useFileStore((state) => state.activeDrive);
  const selectedNodeId = useFileStore((state) => state.selectedNodeId);
  const focusedNodeId = useFileStore((state) => state.focusedNodeId);
  const drainingId = useFileStore((state) => state.drainingId);
  const selectNode = useFileStore((state) => state.selectNode);
  const focusNode = useFileStore((state) => state.focusNode);
  const childPages = useFileStore((state) => state.childPages);

  const autoOrbit = useVisualizerStore((state) => state.autoOrbit);
  const categoryFilter = useVisualizerStore((state) => state.categoryFilter);
  const setHoveredNodeId = useVisualizerStore((state) => state.setHoveredNodeId);
  const resetCameraTrigger = useVisualizerStore((state) => state.resetCameraTrigger);

  // Pan & Zoom
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const panRef = useRef(pan);
  panRef.current = pan;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  // Orbit angle for continuous rotation
  const orbitAngleRef = useRef(0);

  // Cache for level-2 children (satellites)
  const [subChildrenMap, setSubChildrenMap] = useState<Record<string, FileNode[]>>({});

  // Hover state
  const [hoveredTarget, setHoveredTarget] = useState<{
    node: FileNode;
    theme: NodeVisualTheme;
    x: number;
    y: number;
    radius: number;
  } | null>(null);

  // Drag interaction
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const hasMovedRef = useRef(false);

  // Cosmic Dust Background Particles
  const particlesRef = useRef<Particle[]>([]);
  if (particlesRef.current.length === 0) {
    for (let i = 0; i < 70; i++) {
      particlesRef.current.push({
        x: (Math.random() - 0.5) * 1800,
        y: (Math.random() - 0.5) * 1800,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.15,
        size: Math.random() * 2.2 + 0.8,
        alpha: Math.random() * 0.5 + 0.2,
        baseAlpha: Math.random() * 0.5 + 0.2,
      });
    }
  }

  // Pre-fetch Level-2 children (satellites) for direct child folders
  useEffect(() => {
    if (!graphView?.children) return;
    const foldersToFetch = graphView.children
      .filter((c) => c.kind === "folder" && c.childCount > 0)
      .slice(0, 12);

    for (const folder of foldersToFetch) {
      if (subChildrenMap[folder.path]) continue;
      // Check if already in childPages
      const existingPage = childPages[folder.path];
      if (existingPage && existingPage.nodes.length > 0) {
        setSubChildrenMap((prev) => ({ ...prev, [folder.path]: existingPage.nodes.slice(0, 5) }));
        continue;
      }
      // Otherwise fetch in background
      void getChildren(folder.path, 0, 5, null)
        .then((page) => {
          if (page && page.nodes.length > 0) {
            setSubChildrenMap((prev) => ({ ...prev, [folder.path]: page.nodes.slice(0, 5) }));
          }
        })
        .catch(() => {});
    }
  }, [graphView, childPages, subChildrenMap]);

  // Recenter when resetCameraTrigger fires or focused folder changes
  const resetView = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = canvas.clientWidth || 800;
    const height = canvas.clientHeight || 700;
    setPan({ x: width / 2, y: height / 2 });
    setZoom(1);
  }, []);

  useEffect(() => {
    resetView();
  }, [focusedNodeId, resetCameraTrigger, resetView]);

  // Compute Layout of Nodes
  const renderNodesRef = useRef<RenderNode[]>([]);
  const hubRef = useRef<RenderNode | null>(null);

  // Resize canvas to match display size
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const updateSize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      if (panRef.current.x === 0 && panRef.current.y === 0) {
        setPan({ x: rect.width / 2, y: rect.height / 2 });
      }
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  // Main 60fps render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;

    const render = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;
      const time = performance.now() * 0.001;

      // Auto-orbit increment
      if (autoOrbit) {
        orbitAngleRef.current += 0.0016;
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      // Deep dark futuristic background
      ctx.fillStyle = "#070A12";
      ctx.fillRect(0, 0, width, height);

      // World matrix transform
      ctx.save();
      ctx.translate(panRef.current.x, panRef.current.y);
      ctx.scale(zoomRef.current, zoomRef.current);

      // 1. Draw Cosmic Floor Grid
      drawGrid(ctx, time);

      // 2. Cosmic Stardust Particles
      drawCosmicDust(ctx, particlesRef.current, time);

      // Prepare nodes data
      if (graphView?.focus) {
        const drive = drives.find((item) => item.mount === activeDrive);
        const used = diskUsedRatio(drive);
        const isRoot = isDriveRoot(graphView.focus.path);

        const hubFill = isRoot && used > 0 ? used : 0.79; // Match reference ~79%
        const hubRadius = 100;
        const hubTheme = getNodeVisualTheme(graphView.focus, 0, true);

        const hubNode: RenderNode = {
          node: graphView.focus,
          x: 0,
          y: 0,
          radius: hubRadius,
          fill: Math.min(0.92, Math.max(0.1, hubFill)),
          theme: hubTheme,
          isHub: true,
          satellites: [],
          angle: 0,
          targetX: 0,
          targetY: 0,
        };
        hubRef.current = hubNode;

        // Level 1 Children
        const rawChildren = graphView.children.slice(0, 16);
        const maxChildSize = rawChildren.reduce((max, c) => Math.max(max, c.sizeBytes), 1);
        const childCount = rawChildren.length;

        // Orbital radius
        const orbitRadius = childCount > 8 ? 330 : 290;

        // Concentric Orbital Track Rings
        drawOrbitalTracks(ctx, orbitRadius);

        const childNodes: RenderNode[] = rawChildren.map((child, idx) => {
          // Angle spacing along orbit
          const baseAngle = (idx / childCount) * Math.PI * 2 - Math.PI / 2;
          const currentAngle = baseAngle + orbitAngleRef.current;

          // Sizing proportional to storage
          const sizeRatio = Math.max(0, child.sizeBytes) / maxChildSize;
          const radius = 34 + 32 * Math.pow(sizeRatio, 0.42);

          // Position along orbit
          const x = Math.cos(currentAngle) * orbitRadius;
          const y = Math.sin(currentAngle) * orbitRadius;

          // Liquid fill ratio
          const fill = 0.18 + 0.62 * Math.pow(sizeRatio, 0.5);

          const theme = getNodeVisualTheme(child, idx);

          // Level 2 Satellites for this child
          const subNodes = subChildrenMap[child.path] || [];
          const maxSubSize = subNodes.reduce((m, s) => Math.max(m, s.sizeBytes), 1);

          // Fan out satellites outward away from the hub
          const satSpread = Math.PI * 0.48;
          const satellites: SatelliteNode[] = subNodes.map((sub, sIdx) => {
            const span = Math.max(subNodes.length - 1, 1);
            const subAngleOffset = (sIdx / span - 0.5) * satSpread;
            const satAngle = currentAngle + subAngleOffset;
            const satDist = radius + 32 + (sIdx % 2 === 0 ? 12 : 24);

            const satRatio = Math.max(0, sub.sizeBytes) / maxSubSize;
            const satRadius = 13 + 10 * Math.pow(satRatio, 0.5);
            const satFill = 0.2 + 0.65 * satRatio;

            return {
              node: sub,
              parentPath: child.path,
              x: x + Math.cos(satAngle) * satDist,
              y: y + Math.sin(satAngle) * satDist,
              radius: satRadius,
              fill: satFill,
              theme: getNodeVisualTheme(sub, sIdx),
            };
          });

          return {
            node: child,
            x,
            y,
            radius,
            fill,
            theme,
            isHub: false,
            satellites,
            angle: currentAngle,
            targetX: x,
            targetY: y,
          };
        });

        renderNodesRef.current = childNodes;

        // 3. Draw Connector Lines: Hub -> Children
        for (const child of childNodes) {
          const isFilterMatch =
            categoryFilter === "all" ||
            child.node.category === categoryFilter ||
            (categoryFilter === "heavy" && child.node.sizeBytes >= 5 * 1024 * 1024 * 1024);
          drawConnectorLine(ctx, 0, 0, child.x, child.y, child.theme.primary, time, isFilterMatch ? 1.0 : 0.2);

          // 4. Draw Satellite Connector Lines: Child -> Satellites
          for (const sat of child.satellites) {
            drawSatelliteConnector(ctx, child.x, child.y, sat.x, sat.y, sat.theme.primary, isFilterMatch ? 0.7 : 0.15);
          }
        }

        // 5. Draw Level 2 Satellites
        for (const child of childNodes) {
          for (const sat of child.satellites) {
            const isSelected = selectedNodeId === sat.node.id || selectedNodeId === sat.node.path;
            const isHovered = hoveredTarget?.node.id === sat.node.id;
            const isFilterMatch =
              categoryFilter === "all" ||
              sat.node.category === categoryFilter ||
              (categoryFilter === "heavy" && sat.node.sizeBytes >= 5 * 1024 * 1024 * 1024);

            drawLiquidBall(ctx, {
              x: sat.x,
              y: sat.y,
              radius: sat.radius,
              fill: sat.fill,
              theme: sat.theme,
              time,
              isSelected,
              isHovered,
              opacity: isFilterMatch ? 1.0 : 0.22,
              isSatellite: true,
              sizeFormatted: formatBytes(sat.node.sizeBytes),
            });
          }
        }

        // 6. Draw Level 1 Children
        for (const child of childNodes) {
          const isSelected = selectedNodeId === child.node.id || selectedNodeId === child.node.path;
          const isHovered = hoveredTarget?.node.id === child.node.id;
          const isDraining = drainingId === child.node.id || drainingId === child.node.path;
          const isFilterMatch =
            categoryFilter === "all" ||
            child.node.category === categoryFilter ||
            (categoryFilter === "heavy" && child.node.sizeBytes >= 5 * 1024 * 1024 * 1024);

          drawLiquidBall(ctx, {
            x: child.x,
            y: child.y,
            radius: child.radius,
            fill: isDraining ? Math.max(0, child.fill - 0.5) : child.fill,
            theme: child.theme,
            time,
            isSelected,
            isHovered,
            opacity: isFilterMatch ? 1.0 : 0.22,
            name: child.node.name,
            sizeFormatted: formatBytes(child.node.sizeBytes),
            percentFormatted: `~${Math.round(child.fill * 100)}%`,
            icon: child.theme.icon,
            isHub: false,
          });
        }

        // 7. Draw Central Hub
        const isHubSelected = selectedNodeId === hubNode.node.id || selectedNodeId === hubNode.node.path;
        const isHubHovered = hoveredTarget?.node.id === hubNode.node.id;

        drawLiquidBall(ctx, {
          x: hubNode.x,
          y: hubNode.y,
          radius: hubNode.radius,
          fill: hubNode.fill,
          theme: hubNode.theme,
          time,
          isSelected: isHubSelected,
          isHovered: isHubHovered,
          opacity: 1.0,
          name: hubNode.node.name || activeDrive || "C:",
          sizeFormatted: `(${formatBytes(hubNode.node.sizeBytes)})`,
          percentFormatted: `${Math.round(hubNode.fill * 100)}%`,
          isHub: true,
          icon: "📁",
        });
      }

      ctx.restore(); // Restore world transform

      // 8. Render Holographic Hover Tooltip if hovering over any node
      if (hoveredTarget) {
        drawTooltip(ctx, hoveredTarget, panRef.current, zoomRef.current);
      }

      ctx.restore(); // Restore DPR scale
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [graphView, drives, activeDrive, selectedNodeId, drainingId, autoOrbit, categoryFilter, hoveredTarget, subChildrenMap]);

  // Pointer Interaction Handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = true;
    hasMovedRef.current = false;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: panRef.current.x,
      panY: panRef.current.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (isDraggingRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      if (Math.hypot(dx, dy) > 4) {
        hasMovedRef.current = true;
      }
      setPan({
        x: dragStartRef.current.panX + dx,
        y: dragStartRef.current.panY + dy,
      });
      return;
    }

    // Hit Testing for hover
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Convert screen coordinates to world coordinates
    const worldX = (mouseX - panRef.current.x) / zoomRef.current;
    const worldY = (mouseY - panRef.current.y) / zoomRef.current;

    let hit: {
      node: FileNode;
      theme: NodeVisualTheme;
      x: number;
      y: number;
      radius: number;
    } | null = null;

    // Check satellites first (top of hierarchy)
    for (const child of renderNodesRef.current) {
      for (const sat of child.satellites) {
        const dist = Math.hypot(worldX - sat.x, worldY - sat.y);
        if (dist <= sat.radius + 4) {
          hit = {
            node: sat.node,
            theme: sat.theme,
            x: sat.x,
            y: sat.y,
            radius: sat.radius,
          };
          break;
        }
      }
      if (hit) break;
    }

    // Check Level 1 children
    if (!hit) {
      for (const child of renderNodesRef.current) {
        const dist = Math.hypot(worldX - child.x, worldY - child.y);
        if (dist <= child.radius + 6) {
          hit = {
            node: child.node,
            theme: child.theme,
            x: child.x,
            y: child.y,
            radius: child.radius,
          };
          break;
        }
      }
    }

    // Check Hub
    if (!hit && hubRef.current) {
      const dist = Math.hypot(worldX - hubRef.current.x, worldY - hubRef.current.y);
      if (dist <= hubRef.current.radius + 6) {
        hit = {
          node: hubRef.current.node,
          theme: hubRef.current.theme,
          x: hubRef.current.x,
          y: hubRef.current.y,
          radius: hubRef.current.radius,
        };
      }
    }

    setHoveredTarget(hit);
    setHoveredNodeId(hit ? hit.node.id : null);
    canvas.style.cursor = hit ? "pointer" : isDraggingRef.current ? "grabbing" : "default";
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}

    // If it was a click without dragging
    if (!hasMovedRef.current) {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const worldX = (mouseX - panRef.current.x) / zoomRef.current;
      const worldY = (mouseY - panRef.current.y) / zoomRef.current;

      // Check hit
      let clickedNode: FileNode | null = null;

      // Check satellites
      for (const child of renderNodesRef.current) {
        for (const sat of child.satellites) {
          if (Math.hypot(worldX - sat.x, worldY - sat.y) <= sat.radius + 6) {
            clickedNode = sat.node;
            break;
          }
        }
        if (clickedNode) break;
      }

      // Check children
      if (!clickedNode) {
        for (const child of renderNodesRef.current) {
          if (Math.hypot(worldX - child.x, worldY - child.y) <= child.radius + 6) {
            clickedNode = child.node;
            break;
          }
        }
      }

      // Check hub
      if (!clickedNode && hubRef.current) {
        if (Math.hypot(worldX - hubRef.current.x, worldY - hubRef.current.y) <= hubRef.current.radius + 6) {
          clickedNode = hubRef.current.node;
        }
      }

      if (clickedNode) {
        selectNode(clickedNode.id);
      }
    }
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const worldX = (mouseX - panRef.current.x) / zoomRef.current;
    const worldY = (mouseY - panRef.current.y) / zoomRef.current;

    // Check if clicked a folder
    let targetFolder: FileNode | null = null;

    for (const child of renderNodesRef.current) {
      for (const sat of child.satellites) {
        if (sat.node.kind === "folder" && Math.hypot(worldX - sat.x, worldY - sat.y) <= sat.radius + 6) {
          targetFolder = sat.node;
          break;
        }
      }
      if (targetFolder) break;
    }

    if (!targetFolder) {
      for (const child of renderNodesRef.current) {
        if (child.node.kind === "folder" && Math.hypot(worldX - child.x, worldY - child.y) <= child.radius + 6) {
          targetFolder = child.node;
          break;
        }
      }
    }

    if (targetFolder) {
      void focusNode(targetFolder.id);
    }
  };

  // Smooth Zoom Centered at Cursor
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const currentZoom = zoomRef.current;
    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
    const newZoom = Math.min(3.2, Math.max(0.35, currentZoom * zoomFactor));

    const newPanX = mouseX - (mouseX - panRef.current.x) * (newZoom / currentZoom);
    const newPanY = mouseY - (mouseY - panRef.current.y) * (newZoom / currentZoom);

    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
  };

  return (
    <div className="relative h-full w-full select-none overflow-hidden bg-[#070A12]">
      <canvas
        ref={canvasRef}
        className="h-full w-full touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
      />
    </div>
  );
}

// -------------------------------------------------------------
// Canvas Helper Functions: Grid, Tracks, Dust, Lines, Balls
// -------------------------------------------------------------

function drawGrid(ctx: CanvasRenderingContext2D, _time: number) {
  const gridSize = 70;
  const extent = 1800;

  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(14, 165, 233, 0.05)";

  ctx.beginPath();
  for (let x = -extent; x <= extent; x += gridSize) {
    ctx.moveTo(x, -extent);
    ctx.lineTo(x, extent);
  }
  for (let y = -extent; y <= extent; y += gridSize) {
    ctx.moveTo(-extent, y);
    ctx.lineTo(extent, y);
  }
  ctx.stroke();

  // Grid Intersection Plus '+' markers
  ctx.strokeStyle = "rgba(56, 189, 248, 0.16)";
  ctx.lineWidth = 1;
  const crossSize = 3;
  ctx.beginPath();
  for (let x = -extent; x <= extent; x += gridSize * 2) {
    for (let y = -extent; y <= extent; y += gridSize * 2) {
      ctx.moveTo(x - crossSize, y);
      ctx.lineTo(x + crossSize, y);
      ctx.moveTo(x, y - crossSize);
      ctx.lineTo(x, y + crossSize);
    }
  }
  ctx.stroke();
  ctx.restore();
}

function drawOrbitalTracks(ctx: CanvasRenderingContext2D, orbitRadius: number) {
  ctx.save();
  ctx.setLineDash([4, 10]);
  ctx.lineWidth = 1.2;

  // Inner faint orbit
  ctx.strokeStyle = "rgba(0, 240, 255, 0.12)";
  ctx.beginPath();
  ctx.arc(0, 0, orbitRadius * 0.72, 0, Math.PI * 2);
  ctx.stroke();

  // Primary orbit track passing through Level 1 nodes
  ctx.strokeStyle = "rgba(0, 240, 255, 0.22)";
  ctx.beginPath();
  ctx.arc(0, 0, orbitRadius, 0, Math.PI * 2);
  ctx.stroke();

  // Outer satellite orbit track
  ctx.strokeStyle = "rgba(0, 240, 255, 0.1)";
  ctx.beginPath();
  ctx.arc(0, 0, orbitRadius + 95, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function drawCosmicDust(ctx: CanvasRenderingContext2D, particles: Particle[], time: number) {
  ctx.save();
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    if (p.x < -900) p.x = 900;
    if (p.x > 900) p.x = -900;
    if (p.y < -900) p.y = 900;
    if (p.y > 900) p.y = -900;

    const flicker = Math.sin(time * 2 + p.x) * 0.15;
    ctx.fillStyle = `rgba(56, 189, 248, ${Math.max(0.08, p.baseAlpha + flicker)})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawConnectorLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  time: number,
  opacity: number,
) {
  ctx.save();
  ctx.globalAlpha = opacity;

  // Subtle filament line
  const grad = ctx.createLinearGradient(x1, y1, x2, y2);
  grad.addColorStop(0, "rgba(0, 240, 255, 0.45)");
  grad.addColorStop(1, `${color}99`);

  ctx.strokeStyle = grad;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // Energy pulse particle traveling along line
  const t = (time * 0.45 + (x2 * 0.01)) % 1;
  const px = x1 + (x2 - x1) * t;
  const py = y1 + (y2 - y1) * t;

  ctx.fillStyle = "#A5F3FC";
  ctx.shadowColor = "#00F0FF";
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.arc(px, py, 1.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawSatelliteConnector(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  opacity: number,
) {
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = `${color}88`;
  ctx.lineWidth = 1.1;
  ctx.setLineDash([2, 4]);

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.restore();
}

interface LiquidBallDrawOptions {
  x: number;
  y: number;
  radius: number;
  fill: number;
  theme: NodeVisualTheme;
  time: number;
  isSelected?: boolean;
  isHovered?: boolean;
  opacity?: number;
  name?: string;
  sizeFormatted?: string;
  percentFormatted?: string;
  icon?: string;
  isHub?: boolean;
  isSatellite?: boolean;
}

function drawLiquidBall(ctx: CanvasRenderingContext2D, opts: LiquidBallDrawOptions) {
  const {
    x,
    y,
    radius,
    fill,
    theme,
    time,
    isSelected = false,
    isHovered = false,
    opacity = 1.0,
    name,
    sizeFormatted,
    percentFormatted,
    icon,
    isHub = false,
    isSatellite = false,
  } = opts;

  ctx.save();
  ctx.globalAlpha = opacity;

  // Scale bounce when hovered or selected
  const activeScale = isHovered ? 1.08 : isSelected ? 1.04 : 1.0;
  const r = radius * activeScale;

  // 1. Dark Translucent Glass Base
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);

  const glassGrad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  glassGrad.addColorStop(0, "rgba(15, 23, 42, 0.88)");
  glassGrad.addColorStop(1, "rgba(4, 7, 18, 0.96)");
  ctx.fillStyle = glassGrad;

  // Outer ambient glow
  ctx.shadowColor = isSelected ? theme.primary : isHovered ? theme.primary : theme.glow;
  ctx.shadowBlur = isSelected ? 24 : isHovered ? 18 : 10;
  ctx.fill();
  ctx.restore();

  // 2. Liquid Layer with Animated Meniscus Waves
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip(); // Clip to the circle

  const clampedFill = Math.min(0.95, Math.max(0.06, fill));
  const waterLevel = y + r - 2 * r * clampedFill;
  const waveAmp = Math.max(2.2, r * (isHub ? 0.08 : 0.065));
  const waveFreq = isHub ? 0.04 : 0.06;

  ctx.beginPath();
  ctx.moveTo(x - r, y + r);

  const wavePoints: { u: number; wy: number }[] = [];
  const step = 3;
  for (let u = -r; u <= r; u += step) {
    const wy =
      waterLevel +
      Math.sin(u * waveFreq + time * 3.2 + x * 0.02) * waveAmp +
      Math.cos(u * waveFreq * 1.6 - time * 2.4) * (waveAmp * 0.45);
    wavePoints.push({ u, wy });
  }

  // Draw wave surface
  ctx.lineTo(x + wavePoints[0].u, wavePoints[0].wy);
  for (let i = 1; i < wavePoints.length; i++) {
    ctx.lineTo(x + wavePoints[i].u, wavePoints[i].wy);
  }
  ctx.lineTo(x + r, y + r);
  ctx.lineTo(x - r, y + r);
  ctx.closePath();

  // Fluid vertical gradient fill
  const fluidGrad = ctx.createLinearGradient(x, waterLevel - waveAmp, x, y + r);
  fluidGrad.addColorStop(0, theme.primary);
  fluidGrad.addColorStop(0.35, `${theme.primary}DD`);
  fluidGrad.addColorStop(1, theme.secondary);

  ctx.fillStyle = fluidGrad;
  ctx.fill();

  // Wave Crest Glowing Meniscus Line
  ctx.beginPath();
  ctx.moveTo(x + wavePoints[0].u, wavePoints[0].wy);
  for (let i = 1; i < wavePoints.length; i++) {
    ctx.lineTo(x + wavePoints[i].u, wavePoints[i].wy);
  }
  ctx.strokeStyle = theme.crest;
  ctx.lineWidth = isHub ? 3.5 : isSatellite ? 1.5 : 2.4;
  ctx.shadowColor = theme.primary;
  ctx.shadowBlur = 10;
  ctx.stroke();

  // Micro-Bubbles Floating Inside Liquid
  const bubbleCount = isHub ? 12 : isSatellite ? 3 : 6;
  ctx.shadowBlur = 0;
  for (let b = 0; b < bubbleCount; b++) {
    const seed = (b + 1) * 31.7 + x * 0.3;
    const bSpeed = 0.4 + (b % 3) * 0.2;
    const bProgress = (time * bSpeed + seed) % 1;
    const by = y + r - bProgress * (2 * r * clampedFill - 4);
    const bx = x + Math.sin(time * 3 + seed) * (r * 0.55);

    const bAlpha = Math.sin(bProgress * Math.PI) * 0.6;
    ctx.fillStyle = `rgba(255, 255, 255, ${bAlpha})`;
    ctx.beginPath();
    ctx.arc(bx, by, isHub ? 2 : 1.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Inside-liquid percentage badge (matching the screenshot e.g. ~75%, ~59%)
  if (!isSatellite && percentFormatted && clampedFill > 0.25) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.font = isHub ? "bold 13px system-ui, sans-serif" : "bold 11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0, 0, 0, 0.7)";
    ctx.shadowBlur = 4;
    const textY = isHub ? waterLevel + 28 : waterLevel + 16;
    if (textY < y + r - 10) {
      ctx.fillText(percentFormatted, x, textY);
    }
  }

  ctx.restore(); // Restore clip

  // 3. Circular Glass Rim Border
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = theme.rim;
  ctx.lineWidth = isHub ? 3.2 : isSelected ? 2.8 : isSatellite ? 1.4 : 2.0;
  ctx.stroke();

  // 4. Top-Left Specular Reflection Arc
  ctx.beginPath();
  ctx.arc(x, y, r - 2, -Math.PI * 0.72, -Math.PI * 0.28);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
  ctx.lineWidth = isHub ? 2.5 : 1.5;
  ctx.stroke();

  // 5. Selected Reticle (Segmented Glowing Circular Brackets)
  if (isSelected) {
    ctx.save();
    const reticleR = r + 9;
    const rot = time * 1.5;
    ctx.strokeStyle = "#00F0FF";
    ctx.lineWidth = 2.2;
    ctx.shadowColor = "#00F0FF";
    ctx.shadowBlur = 12;

    for (let k = 0; k < 4; k++) {
      const startAngle = rot + (k * Math.PI) / 2 + 0.15;
      const endAngle = startAngle + (Math.PI / 2 - 0.3);
      ctx.beginPath();
      ctx.arc(x, y, reticleR, startAngle, endAngle);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 6. Hub Center Label
  if (isHub) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Hub Icon / Drive
    ctx.font = "20px system-ui, sans-serif";
    ctx.fillText("📁", x, y - 24);

    // Title (e.g. "C:")
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 22px system-ui, sans-serif";
    ctx.shadowColor = "rgba(0, 240, 255, 0.8)";
    ctx.shadowBlur = 8;
    ctx.fillText(name || "C:", x, y + 2);

    // Subtitle (e.g. "(396 GB)")
    if (sizeFormatted) {
      ctx.fillStyle = "rgba(224, 242, 254, 0.9)";
      ctx.font = "12px system-ui, sans-serif";
      ctx.shadowBlur = 4;
      ctx.fillText(sizeFormatted, x, y + 22);
    }
    ctx.restore();
  }

  // 7. Level 1 Labels (Size Above, Name Below)
  if (!isHub && !isSatellite) {
    ctx.save();
    ctx.textAlign = "center";

    // Size Pill Above (e.g. "151 GB")
    if (sizeFormatted) {
      ctx.font = "bold 11px system-ui, sans-serif";
      const pillY = y - r - 12;
      ctx.fillStyle = "rgba(226, 232, 240, 0.95)";
      ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
      ctx.shadowBlur = 4;
      ctx.fillText(sizeFormatted, x, pillY);
    }

    // Name + Icon Below (e.g. "Program Files (x86)")
    if (name) {
      const nameY = y + r + 18;
      ctx.font = "500 12px system-ui, sans-serif";
      ctx.fillStyle = isSelected ? "#38BDF8" : isHovered ? "#FFFFFF" : "#E2E8F0";
      ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
      ctx.shadowBlur = 5;

      const truncated = name.length > 20 ? `${name.substring(0, 18)}…` : name;
      const displayLabel = icon ? `${icon}  ${truncated}` : truncated;
      ctx.fillText(displayLabel, x, nameY);
    }
    ctx.restore();
  }

  // 8. Satellite Tiny Size Tag
  if (isSatellite && sizeFormatted) {
    ctx.save();
    ctx.font = "9px system-ui, sans-serif";
    ctx.fillStyle = "rgba(203, 213, 225, 0.85)";
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
    ctx.shadowBlur = 4;
    ctx.fillText(sizeFormatted, x, y - r - 6);
    ctx.restore();
  }

  ctx.restore();
}

// Draw Floating Holographic Tooltip above hovered node
function drawTooltip(
  ctx: CanvasRenderingContext2D,
  target: {
    node: FileNode;
    theme: NodeVisualTheme;
    x: number;
    y: number;
    radius: number;
  },
  pan: { x: number; y: number },
  zoom: number,
) {
  const { node, theme, x, y, radius } = target;

  // Convert node world coords to screen coords
  const screenX = pan.x + x * zoom;
  const screenY = pan.y + (y - radius) * zoom - 18;

  const title = node.name || "Folder";
  const typeLabel = theme.label;
  const sizeLabel = formatBytes(node.sizeBytes);
  const itemsLabel = node.kind === "folder" ? `${node.childCount} items` : "";

  ctx.save();
  ctx.font = "bold 12px system-ui, sans-serif";
  const titleWidth = ctx.measureText(title).width;
  ctx.font = "11px system-ui, sans-serif";
  const subWidth = ctx.measureText(`${typeLabel} • ${sizeLabel} ${itemsLabel}`).width;

  const cardWidth = Math.max(140, Math.max(titleWidth, subWidth) + 32);
  const cardHeight = 52;
  const cardX = screenX - cardWidth / 2;
  const cardY = screenY - cardHeight;

  // Background Box
  ctx.fillStyle = "rgba(10, 15, 30, 0.92)";
  ctx.strokeStyle = theme.rim;
  ctx.lineWidth = 1.4;
  ctx.shadowColor = theme.glow;
  ctx.shadowBlur = 12;

  // Rounded rectangle
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardWidth, cardHeight, 10);
  ctx.fill();
  ctx.stroke();

  // Tooltip Text
  ctx.shadowBlur = 0;
  ctx.textAlign = "left";

  // Icon + Name
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 12px system-ui, sans-serif";
  ctx.fillText(`${theme.icon} ${title.length > 22 ? `${title.slice(0, 20)}…` : title}`, cardX + 12, cardY + 20);

  // Type & Size
  ctx.fillStyle = theme.badgeText;
  ctx.font = "11px system-ui, sans-serif";
  ctx.fillText(`${typeLabel}  •  ${sizeLabel}`, cardX + 12, cardY + 38);

  ctx.restore();
}
