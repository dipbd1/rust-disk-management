import { useCallback, useEffect, useRef, useState } from "react";
import { diskUsedRatio, formatBytes } from "../../lib/format";
import { SATELLITE_CHILDREN, SATELLITE_PARENTS } from "../../lib/limits";
import { isDriveRoot, isRemovedPath } from "../../lib/paths";
import { getNodeVisualTheme, type NodeVisualTheme } from "../../lib/nodeColors";
import { getChildren } from "../../services/tauriBridge";
import { useFileStore } from "../../store/useFileStore";
import { useVisualizerStore } from "./visualizerState";
import { claimSlot, liveScanScene, moonBirth, moonMap, moonTravel } from "./scanBalls";
import type { FileNode, GraphView } from "../../types/filesystem";
import type { ChildPage } from "../../store/types";

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

interface TransitionState {
  fromPos: { x: number; y: number; radius: number };
  toNode: FileNode;
  toTheme: NodeVisualTheme;
  startTime: number;
  duration: number;
  oldHub: RenderNode | null;
  oldChildren: RenderNode[];
  panStart: { x: number; y: number };
  panEnd: { x: number; y: number };
}

interface BallAnimState {
  currentRadius: number;
  targetRadius: number;
  currentFill: number;
  targetFill: number;
  pulseIntensity: number;
  lastSize: number;
  isGrowing: boolean;
}

function updateBallAnim(
  map: Map<string, BallAnimState>,
  key: string,
  targetRadius: number,
  targetFill: number,
  sizeBytes: number,
  isScanning: boolean
): { radius: number; fill: number; pulse: number; isFilling: boolean } {
  let state = map.get(key);
  if (!state) {
    state = {
      currentRadius: Math.max(3, targetRadius * 0.15),
      targetRadius,
      currentFill: 0.04,
      targetFill,
      pulseIntensity: 0.9,
      lastSize: sizeBytes,
      isGrowing: true,
    };
    map.set(key, state);
  } else {
    // If size grew noticeably (scanning discovering items)
    if (sizeBytes > state.lastSize * 1.05) {
      state.pulseIntensity = Math.min(1.0, state.pulseIntensity + 0.7);
      state.lastSize = sizeBytes;
    }
    state.targetRadius = targetRadius;
    state.targetFill = targetFill;
  }

  // Smooth spring easing for radius & fill
  const rDiff = state.targetRadius - state.currentRadius;
  state.currentRadius += rDiff * 0.09;

  const fDiff = state.targetFill - state.currentFill;
  state.currentFill += fDiff * 0.06;

  state.pulseIntensity *= 0.94;
  state.isGrowing = Math.abs(rDiff) > 1.0 || Math.abs(fDiff) > 0.03 || isScanning;

  return {
    radius: Math.max(3, state.currentRadius),
    fill: Math.min(0.95, Math.max(0.04, state.currentFill)),
    pulse: state.pulseIntensity,
    isFilling: state.isGrowing,
  };
}

// Easing functions for organic fluid motion
function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function easeOutCubic(x: number): number {
  return 1 - Math.pow(1 - x, 3);
}

function easeOutBack(x: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

// Clamp panning so the visualizer cannot be dragged infinitely into empty space.
// Keeps the scene comfortably bounded within view while allowing full inspection.
function clampPan(
  pan: { x: number; y: number },
  zoom: number,
  canvasWidth: number,
  canvasHeight: number,
  boundaryRadius: number
): { x: number; y: number } {
  const centerX = canvasWidth / 2;
  const centerY = canvasHeight / 2;

  // The visual radius of the scene in screen pixels
  const visualRadius = boundaryRadius * zoom;

  // Limit panning so the scene cannot be dragged away indefinitely.
  // At zoom=1, maxDistance from center ensures the arena remains largely in view.
  // At higher zoom, maxDistance expands to allow inspecting edge nodes.
  const maxDistanceX = Math.max(canvasWidth * 0.45, visualRadius * 0.75);
  const maxDistanceY = Math.max(canvasHeight * 0.45, visualRadius * 0.75);

  const minX = centerX - maxDistanceX;
  const maxX = centerX + maxDistanceX;
  const minY = centerY - maxDistanceY;
  const maxY = centerY + maxDistanceY;

  return {
    x: Math.min(maxX, Math.max(minX, pan.x)),
    y: Math.min(maxY, Math.max(minY, pan.y)),
  };
}

export function OrganicGraph2D() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Store state
  const graphView = useFileStore((state) => state.graphView);
  const drives = useFileStore((state) => state.drives);
  const activeDrive = useFileStore((state) => state.activeDrive);
  const selectedNodeId = useFileStore((state) => state.selectedNodeId);
  const drainingId = useFileStore((state) => state.drainingId);
  useEffect(() => {
    if (!drainingId) return;
    let fired = false;
    const finish = () => {
      if (fired) return;
      const state = useFileStore.getState();
      if (state.drainingId !== drainingId) return;
      fired = true;
      state.finishDrain(drainingId);
    };
    const timer = window.setTimeout(finish, 650);
    return () => {
      window.clearTimeout(timer);
      finish();
    };
  }, [drainingId]);
  const selectNode = useFileStore((state) => state.selectNode);
  const focusNode = useFileStore((state) => state.focusNode);
  const childPages = useFileStore((state) => state.childPages);
  const scanStatus = useFileStore((state) => state.scanStatus);
  const progress = useFileStore((state) => state.progress);
  const scanStatusRef = useRef(scanStatus);
  scanStatusRef.current = scanStatus;
  const progressRef = useRef(progress);
  progressRef.current = progress;

  const autoOrbit = useVisualizerStore((state) => state.autoOrbit);
  const categoryFilter = useVisualizerStore((state) => state.categoryFilter);
  const setHoveredNodeId = useVisualizerStore((state) => state.setHoveredNodeId);
  const resetCameraTrigger = useVisualizerStore((state) => state.resetCameraTrigger);
  const triggerTreeReveal = useVisualizerStore((state) => state.triggerTreeReveal);

  // Pan & Zoom
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const panRef = useRef(pan);
  panRef.current = pan;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  // Orbit angle for continuous rotation
  const orbitAngleRef = useRef(0);

  // Dynamic animated states for balls (radius growth & liquid rising)
  const ballAnimMapRef = useRef<Map<string, BallAnimState>>(new Map());

  // Level-2 moons. A ref so filling it does not restart the frame loop.
  const moonRef = useRef<Record<string, FileNode[]>>({});
  const moonBornRef = useRef<Map<string, number>>(new Map());
  const slotFocusRef = useRef<string | null>(null);
  const scanChromeRef = useRef({ fade: 0, count: 0, path: "" });
  const lastFrameRef = useRef(0);

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

  // Transition animation management
  const prevFocusIdRef = useRef<string | null>(null);
  const transitionRef = useRef<TransitionState | null>(null);
  const ballPositionsRef = useRef<Map<string, { x: number; y: number; radius: number }>>(new Map());
  const slotAnglesRef = useRef<Map<string, number>>(new Map());
  const boundaryRadiusRef = useRef(380);
  const prevSizeRef = useRef({ width: 0, height: 0 });

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

  // Refresh moons for the settled graph. Parents already filled from scan progress are left alone.
  useEffect(() => {
    if (!graphView?.children) return;
    const foldersToFetch = graphView.children
      .filter((c) => c.kind === "folder" && c.childCount > 0)
      .slice(0, SATELLITE_PARENTS);

    for (const folder of foldersToFetch) {
      if (moonRef.current[folder.path]?.length) continue;
      const existingPage = childPages[folder.path];
      if (existingPage && existingPage.nodes.length > 0) {
        moonRef.current[folder.path] = existingPage.nodes.slice(0, SATELLITE_CHILDREN);
        continue;
      }
      void getChildren(folder.path, 0, SATELLITE_CHILDREN, null)
        .then((page) => {
          if (page && page.nodes.length > 0 && !moonRef.current[folder.path]?.length) {
            moonRef.current[folder.path] = page.nodes.slice(0, SATELLITE_CHILDREN);
          }
        })
        .catch(() => {});
    }
  }, [graphView, childPages]);

  // Recenter camera and auto-fit scene boundary
  // Recenter camera
  const resetView = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = canvas.clientWidth || 800;
    const height = canvas.clientHeight || 700;
    setPan({ x: width / 2, y: height / 2 });
    const fitZoom = Math.min(1.0, Math.max(0.65, (Math.min(width, height) - 50) / 1060));
    setZoom(fitZoom);
    setZoom(1.0);
  }, []);

  useEffect(() => {
    resetView();
  }, [resetCameraTrigger, resetView]);

  // Trigger smooth transition when focus changes to another ball
  useEffect(() => {
    if (!graphView?.focus) return;
    const newFocusId = graphView.focus.id;
    const newFocusPath = graphView.focus.path;
    const hubAlreadyOnScreen =
      slotFocusRef.current === newFocusId || slotFocusRef.current === newFocusPath;

    if (prevFocusIdRef.current && prevFocusIdRef.current !== newFocusId && !hubAlreadyOnScreen) {
      // Find where this node was currently located in the visualizer layout
      const prevPos =
        ballPositionsRef.current.get(newFocusId) ||
        ballPositionsRef.current.get(newFocusPath);

      const canvas = canvasRef.current;
      const width = canvas ? canvas.clientWidth : 800;
      const height = canvas ? canvas.clientHeight : 700;
      const navigatingUp = !prevPos && isRemovedPath(prevFocusIdRef.current, newFocusPath);

      transitionRef.current = {
        fromPos: prevPos
          ? { ...prevPos }
          : navigatingUp
            ? { x: 0, y: 0, radius: 135 }
            : { x: 0, y: 170, radius: 46 },
        toNode: graphView.focus,
        toTheme: getNodeVisualTheme(graphView.focus, 0, true),
        startTime: performance.now(),
        duration: 780, // 780ms smooth morphing animation
        oldHub: hubRef.current ? { ...hubRef.current } : null,
        oldChildren: [...renderNodesRef.current],
        panStart: { ...panRef.current },
        panEnd: { x: width / 2, y: height / 2 },
      };
    }

    prevFocusIdRef.current = newFocusId;
  }, [graphView]);

  // Compute Layout of Nodes
  const renderNodesRef = useRef<RenderNode[]>([]);
  const hubRef = useRef<RenderNode | null>(null);

  // Resize canvas to match display size and adjust elements dynamically
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const updateSize = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(100, Math.round(rect.width));
      const height = Math.max(100, Math.round(rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);

      const minDim = Math.min(width, height);
      const newBoundaryRadius = Math.max(180, Math.min(520, Math.round(minDim / 2 - 24)));
      boundaryRadiusRef.current = newBoundaryRadius;

      const prevWidth = prevSizeRef.current.width;
      const prevHeight = prevSizeRef.current.height;

      if (prevWidth === 0 && prevHeight === 0) {
        setPan({ x: width / 2, y: height / 2 });
      } else if (prevWidth !== width || prevHeight !== height) {
        // When window or split pane resizes, shift pan to follow viewport center
        const deltaX = (width - prevWidth) / 2;
        const deltaY = (height - prevHeight) / 2;
        setPan((prevPan) => {
          const nextPan = { x: prevPan.x + deltaX, y: prevPan.y + deltaY };
          return clampPan(nextPan, zoomRef.current, width, height, newBoundaryRadius);
        });
      }

      prevSizeRef.current = { width, height };
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
      const now = performance.now();
      const time = now * 0.001;

      // Auto-orbit increment
      if (autoOrbit) {
        orbitAngleRef.current += 0.0016;
      }

      const minDim = Math.min(width, height);
      const baseDim = 850;
      const responsiveScale = Math.max(0.55, Math.min(1.3, minDim / baseDim));

      const boundaryRadius = Math.max(180, Math.min(520, Math.round(minDim / 2 - 24)));
      boundaryRadiusRef.current = boundaryRadius;

      // Check transition progress
      const trans = transitionRef.current;
      let transitionProgress = 1.0;
      if (trans) {
        const elapsed = now - trans.startTime;
        transitionProgress = Math.min(1.0, Math.max(0.0, elapsed / trans.duration));

        // Smoothly glide camera pan to center during transition
        if (!isDraggingRef.current) {
          const panE = easeInOutCubic(transitionProgress);
          panRef.current.x = trans.panStart.x + (trans.panEnd.x - trans.panStart.x) * panE;
          panRef.current.y = trans.panStart.y + (trans.panEnd.y - trans.panStart.y) * panE;
          const rawInterp = {
            x: trans.panStart.x + (trans.panEnd.x - trans.panStart.x) * panE,
            y: trans.panStart.y + (trans.panEnd.y - trans.panStart.y) * panE,
          };
          const clamped = clampPan(rawInterp, zoomRef.current, width, height, boundaryRadius);
          panRef.current.x = clamped.x;
          panRef.current.y = clamped.y;
        }

        if (transitionProgress >= 1.0) {
          transitionRef.current = null;
        }
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

      const isScanning = scanStatusRef.current === "scanning";
      const scannedCount = progressRef.current?.scannedCount || 0;
      const currentScanPath = progressRef.current?.currentPath || "";
      const frameNow = performance.now();
      const frameDt = lastFrameRef.current === 0 ? 16 : Math.min(64, frameNow - lastFrameRef.current);
      lastFrameRef.current = frameNow;
      const chrome = scanChromeRef.current;
      if (isScanning) {
        chrome.fade = 1;
        chrome.count = scannedCount;
        chrome.path = currentScanPath;
      } else if (chrome.fade > 0) {
        chrome.fade = Math.max(0, chrome.fade - frameDt / 700);
      }
      const placeholder = (() => {
        const state = useFileStore.getState();
        return state.rootId ? state.nodes[state.rootId] ?? null : null;
      })();
      const liveScene = !graphView?.focus
        ? liveScanScene(progressRef.current, isScanning ? placeholder : null)
        : null;
      const sceneFocus = liveScene?.focus ?? graphView?.focus ?? null;
      const sceneChildren = liveScene?.children ?? graphView?.children ?? [];
      if (sceneFocus && slotFocusRef.current !== sceneFocus.id) {
        if (slotFocusRef.current) {
          slotAnglesRef.current.clear();
          moonBornRef.current.clear();
        }
        slotFocusRef.current = sceneFocus.id;
      }
      const progressRoot = progressRef.current?.root?.path;
      if (progressRoot && sceneFocus?.path === progressRoot) {
        const incoming = moonMap(progressRef.current?.satellites);
        for (const path of Object.keys(incoming)) moonRef.current[path] = incoming[path];
      }

      // 1. Draw Sci-Fi Scene Boundary, Arena Floor, Radar Sweeps & Perimeter
      drawSceneBoundary(
        ctx,
        boundaryRadius,
        time,
        chrome.fade,
        chrome.count,
        chrome.path,
      );

      // 2. Cosmic Stardust Particles
      drawCosmicDust(ctx, particlesRef.current, time, Math.max(boundaryRadius * 1.5, 700));

      // Prepare target nodes data
      if (sceneFocus) {
        const animMap = ballAnimMapRef.current;
        const drive = drives.find((item) => item.mount === activeDrive);
        const used = diskUsedRatio(drive);
        const isRoot = isDriveRoot(sceneFocus.path);

        const hubFill = isRoot && used > 0 ? used : 0.79;
        const targetHubRadius = Math.max(45, Math.min(100, Math.round(88 * responsiveScale)));
        const hubTheme = getNodeVisualTheme(sceneFocus, 0, true);

        // Update animated growth state for Hub (spring radius & liquid filling)
        const hubAnim = updateBallAnim(
          animMap,
          `hub:${sceneFocus.id}`,
          targetHubRadius + (isScanning ? Math.sin(time * 5) * 2.5 : 0),
          hubFill,
          sceneFocus.sizeBytes,
          isScanning
        );

        const hubNode: RenderNode = {
          node: sceneFocus,
          x: 0,
          y: 0,
          radius: hubAnim.radius,
          fill: hubAnim.fill,
          theme: hubTheme,
          isHub: true,
          satellites: [],
          angle: 0,
          targetX: 0,
          targetY: 0,
        };
        hubRef.current = hubNode;

        // Level 1 Children
        const rawChildren = sceneChildren.slice(0, 16);
        const maxChildSize = rawChildren.reduce((max, c) => Math.max(max, c.sizeBytes), 1);
        const childCount = rawChildren.length;

        // Orbital radius scales with boundary radius to fit all screen sizes
        const orbitRadius = Math.round(boundaryRadius * (childCount > 8 ? 0.62 : 0.56));

        // Concentric Orbital Track Rings
        drawOrbitalTracks(ctx, orbitRadius);

        const minChildRadius = Math.round(22 * responsiveScale);
        const maxChildBonus = Math.round(26 * responsiveScale);

        const childPaths = rawChildren.map((item) => item.path);
        const childNodes: RenderNode[] = rawChildren.map((child, idx) => {
          const baseAngle = claimSlot(slotAnglesRef.current, child.path, childPaths);
          const currentAngle = baseAngle + orbitAngleRef.current;

          const sizeRatio = Math.max(0, child.sizeBytes) / maxChildSize;
          const targetChildRadius = minChildRadius + maxChildBonus * Math.pow(sizeRatio, 0.42);

          const x = Math.cos(currentAngle) * orbitRadius;
          const y = Math.sin(currentAngle) * orbitRadius;

          const targetChildFill = 0.18 + 0.62 * Math.pow(sizeRatio, 0.5);
          const theme = getNodeVisualTheme(child, idx);

          // Update animated state for child ball
          const childAnim = updateBallAnim(
            animMap,
            child.path,
            targetChildRadius,
            targetChildFill,
            child.sizeBytes,
            isScanning
          );

          // Level 2 Satellites for this child
          const subNodes = moonRef.current[child.path] ?? [];
          const maxSubSize = subNodes.reduce((m, s) => Math.max(m, s.sizeBytes), 1);

          const satSpread = Math.PI * 0.48;
          const satSpacingBase = Math.round((20 + (idx % 2 === 0 ? 6 : 14)) * responsiveScale);
          const satellites: SatelliteNode[] = [];
          subNodes.forEach((sub, sIdx) => {
            const bornAt = moonBirth(moonBornRef.current, sub.path, sIdx, frameNow);
            const travel = moonTravel(bornAt, frameNow);
            if (travel <= 0) return;
            const span = Math.max(subNodes.length - 1, 1);
            const subAngleOffset = (sIdx / span - 0.5) * satSpread;
            const satAngle = currentAngle + subAngleOffset;
            const satDist = (childAnim.radius + satSpacingBase + (sIdx % 2 === 0 ? 6 : 14) * responsiveScale) * travel;

            const satRatio = Math.max(0, sub.sizeBytes) / maxSubSize;
            const minSatRadius = Math.round(8 * responsiveScale);
            const maxSatBonus = Math.round(8 * responsiveScale);
            const targetSatRadius = minSatRadius + maxSatBonus * Math.pow(satRatio, 0.5);
            const targetSatFill = 0.2 + 0.65 * satRatio;

            const satAnim = updateBallAnim(
              animMap,
              sub.path,
              targetSatRadius,
              targetSatFill,
              sub.sizeBytes,
              isScanning
            );

            satellites.push({
              node: sub,
              parentPath: child.path,
              x: x + Math.cos(satAngle) * satDist,
              y: y + Math.sin(satAngle) * satDist,
              radius: satAnim.radius * Math.min(1, travel),
              fill: satAnim.fill,
              theme: getNodeVisualTheme(sub, sIdx),
            });
          });

          return {
            node: child,
            x,
            y,
            radius: childAnim.radius,
            fill: childAnim.fill,
            theme,
            isHub: false,
            satellites,
            angle: currentAngle,
            targetX: x,
            targetY: y,
          };
        });

        // Periodic cleanup of ballAnimMapRef to prevent unbounded growth
        if (animMap.size > 260) {
          const activeKeys = new Set<string>();
          activeKeys.add(`hub:${sceneFocus.id}`);
          for (const c of childNodes) {
            activeKeys.add(c.node.path);
            for (const s of c.satellites) {
              activeKeys.add(s.node.path);
            }
          }
          for (const k of animMap.keys()) {
            if (!activeKeys.has(k)) animMap.delete(k);
          }
        }

        renderNodesRef.current = childNodes;

        // -------------------------------------------------------------
        // ANIMATED TRANSITION RENDERING (when focus changes)
        // -------------------------------------------------------------
        if (trans && transitionProgress < 1.0) {
          const t = transitionProgress;

          // Phase 1: Old balls fade out and disperse away
          if (t < 0.48) {
            const oldFade = Math.max(0, 1 - t / 0.42);
            const oldShrink = Math.max(0, 1 - easeOutCubic(t / 0.48));

            if (oldShrink > 0.05 && oldFade > 0.01) {
              // Old Hub dispersing
              if (trans.oldHub && trans.oldHub.radius * oldShrink >= 3) {
                const driftX = -trans.fromPos.x * 0.28 * easeOutCubic(t);
                const driftY = -trans.fromPos.y * 0.28 * easeOutCubic(t);
                drawLiquidBall(ctx, {
                  x: driftX,
                  y: driftY,
                  radius: trans.oldHub.radius * oldShrink,
                  fill: trans.oldHub.fill,
                  theme: trans.oldHub.theme,
                  time,
                  opacity: oldFade * 0.75,
                  isHub: true,
                  name: trans.oldHub.node.name,
                });
              }

              // Old Children dispersing
              for (const oldChild of trans.oldChildren) {
                // Don't draw the one that was selected (it's moving to center)
                if (oldChild.node.id === trans.toNode.id || oldChild.node.path === trans.toNode.path) {
                  continue;
                }
                if (oldChild.radius * oldShrink < 3) continue;

                drawConnectorLine(ctx, 0, 0, oldChild.x, oldChild.y, oldChild.theme.primary, time, oldFade * 0.25);
                drawLiquidBall(ctx, {
                  x: oldChild.x,
                  y: oldChild.y,
                  radius: oldChild.radius * oldShrink,
                  fill: oldChild.fill,
                  theme: oldChild.theme,
                  time,
                  opacity: oldFade * 0.7,
                  isHub: false,
                  name: oldChild.node.name,
                });
              }
            }
          }

          // Phase 2: The Selected Ball Glides from its old position to Center
          const glide = easeInOutCubic(t);
          const movingHubX = trans.fromPos.x * (1 - glide);
          const movingHubY = trans.fromPos.y * (1 - glide);
          const movingHubRadius = trans.fromPos.radius + (targetHubRadius - trans.fromPos.radius) * glide;
          const movingHubFill = 0.5 + (hubNode.fill - 0.5) * glide;

          // Record moving hub position
          ballPositionsRef.current.set(trans.toNode.id, {
            x: movingHubX,
            y: movingHubY,
            radius: movingHubRadius,
          });
          ballPositionsRef.current.set(trans.toNode.path, {
            x: movingHubX,
            y: movingHubY,
            radius: movingHubRadius,
          });

          // Draw the new Selected Ball coming to middle
          drawLiquidBall(ctx, {
            x: movingHubX,
            y: movingHubY,
            radius: movingHubRadius,
            fill: movingHubFill,
            theme: trans.toTheme,
            time,
            opacity: 1.0,
            isSelected: true,
            isHub: true,
            name: trans.toNode.name || activeDrive || "C:",
            sizeFormatted: `(${formatBytes(trans.toNode.sizeBytes)})`,
            percentFormatted: `${Math.round(movingHubFill * 100)}%`,
            icon: trans.toTheme.icon,
            growthPulse: 0.65,
            isFilling: true,
            isScanning,
          });

          // Phase 3: The New Children Pop In and Establish Connector Lines with Center Ball
          const currentNodesList: RenderNode[] = [];
          for (let i = 0; i < childNodes.length; i++) {
            const child = childNodes[i];
            const staggerStart = 0.22 + (i / childNodes.length) * 0.3;
            const childP = Math.min(1.0, Math.max(0.0, (t - staggerStart) / (1.0 - staggerStart)));

            if (childP > 0) {
              const childEase = easeOutBack(childP);
              const lineProgress = Math.min(1.0, childP * 1.35);

              // Position interpolating outward from moving center ball to target orbit position
              const curChildX = movingHubX + (child.x - movingHubX) * easeOutCubic(childP);
              const curChildY = movingHubY + (child.y - movingHubY) * easeOutCubic(childP);
              const curChildRadius = child.radius * Math.max(0, Math.min(1.15, childEase));
              const curChildOpacity = Math.min(1.0, childP * 2.8);

              // Line endpoint growing from center ball toward child position
              const lineEndX = movingHubX + (child.x - movingHubX) * lineProgress;
              const lineEndY = movingHubY + (child.y - movingHubY) * lineProgress;

              // Establish connection line
              drawConnectorLine(
                ctx,
                movingHubX,
                movingHubY,
                lineEndX,
                lineEndY,
                child.theme.primary,
                time,
                curChildOpacity,
                lineProgress < 0.98, // Show energy spark at tip while establishing connection
                isScanning,
              );

              // Draw pop-in child ball
              if (curChildRadius >= 3) {
                const animState = animMap.get(child.node.path);
                drawLiquidBall(ctx, {
                  x: curChildX,
                  y: curChildY,
                  radius: curChildRadius,
                  fill: child.fill,
                  theme: child.theme,
                  time,
                  isSelected: selectedNodeId === child.node.id,
                  isHovered: hoveredTarget?.node.id === child.node.id,
                  opacity: curChildOpacity,
                  name: child.node.name,
                  sizeFormatted: formatBytes(child.node.sizeBytes),
                  percentFormatted: `~${Math.round(child.fill * 100)}%`,
                  icon: child.theme.icon,
                  isHub: false,
                  growthPulse: animState?.pulseIntensity,
                  isFilling: animState?.isGrowing,
                  isScanning,
                });
              }

              // Level 2 Satellites pop in outward from child
              if (childP > 0.6) {
                const satP = Math.min(1.0, Math.max(0.0, (childP - 0.6) / 0.4));
                for (const sat of child.satellites) {
                  const satCurX = curChildX + (sat.x - child.x) * easeOutCubic(satP);
                  const satCurY = curChildY + (sat.y - child.y) * easeOutCubic(satP);
                  const satRadius = sat.radius * Math.max(0, Math.min(1.2, easeOutBack(satP)));

                  if (satRadius >= 3 && satP > 0.05) {
                    drawSatelliteConnector(ctx, curChildX, curChildY, satCurX, satCurY, sat.theme.primary, satP * 0.7);
                    const satAnimState = animMap.get(sat.node.path);
                    drawLiquidBall(ctx, {
                      x: satCurX,
                      y: satCurY,
                      radius: satRadius,
                      fill: sat.fill,
                      theme: sat.theme,
                      time,
                      isSelected: selectedNodeId === sat.node.id,
                      isHovered: hoveredTarget?.node.id === sat.node.id,
                      opacity: satP,
                      isSatellite: true,
                      sizeFormatted: formatBytes(sat.node.sizeBytes),
                      growthPulse: satAnimState?.pulseIntensity,
                      isFilling: satAnimState?.isGrowing,
                      isScanning,
                    });
                  }
                }
              }

              // Record ball position for future hit-tests and transitions
              ballPositionsRef.current.set(child.node.id, { x: curChildX, y: curChildY, radius: curChildRadius });
              ballPositionsRef.current.set(child.node.path, { x: curChildX, y: curChildY, radius: curChildRadius });
              currentNodesList.push({ ...child, x: curChildX, y: curChildY, radius: curChildRadius });
            }
          }
          renderNodesRef.current = currentNodesList;
        } else {
          // -------------------------------------------------------------
          // NORMAL STABLE RENDERING (No focus transition active)
          // -------------------------------------------------------------
          // Record current node positions
          ballPositionsRef.current.set(hubNode.node.id, { x: hubNode.x, y: hubNode.y, radius: hubNode.radius });
          ballPositionsRef.current.set(hubNode.node.path, { x: hubNode.x, y: hubNode.y, radius: hubNode.radius });

          // 3. Draw Connector Lines: Hub -> Children
          for (const child of childNodes) {
            const isFilterMatch =
              categoryFilter === "all" ||
              child.node.category === categoryFilter ||
              (categoryFilter === "heavy" && child.node.sizeBytes >= 5 * 1024 * 1024 * 1024);
            drawConnectorLine(ctx, 0, 0, child.x, child.y, child.theme.primary, time, isFilterMatch ? 1.0 : 0.2, false, isScanning);

            // 4. Draw Satellite Connector Lines: Child -> Satellites
            for (const sat of child.satellites) {
              drawSatelliteConnector(ctx, child.x, child.y, sat.x, sat.y, sat.theme.primary, isFilterMatch ? 0.7 : 0.15);
            }
          }

          // 5. Draw Level 2 Satellites
          for (const child of childNodes) {
            for (const sat of child.satellites) {
              ballPositionsRef.current.set(sat.node.id, { x: sat.x, y: sat.y, radius: sat.radius });
              ballPositionsRef.current.set(sat.node.path, { x: sat.x, y: sat.y, radius: sat.radius });

              const isSelected = selectedNodeId === sat.node.id || selectedNodeId === sat.node.path;
              const isHovered = hoveredTarget?.node.id === sat.node.id;
              const isFilterMatch =
                categoryFilter === "all" ||
                sat.node.category === categoryFilter ||
                (categoryFilter === "heavy" && sat.node.sizeBytes >= 5 * 1024 * 1024 * 1024);

              const satAnimState = animMap.get(sat.node.path);
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
                growthPulse: satAnimState?.pulseIntensity,
                isFilling: satAnimState?.isGrowing,
                isScanning,
              });
            }
          }

          // 6. Draw Level 1 Children
          for (const child of childNodes) {
            ballPositionsRef.current.set(child.node.id, { x: child.x, y: child.y, radius: child.radius });
            ballPositionsRef.current.set(child.node.path, { x: child.x, y: child.y, radius: child.radius });

            const isSelected = selectedNodeId === child.node.id || selectedNodeId === child.node.path;
            const isHovered = hoveredTarget?.node.id === child.node.id;
            const isDraining = drainingId === child.node.id || drainingId === child.node.path;
            const isFilterMatch =
              categoryFilter === "all" ||
              child.node.category === categoryFilter ||
              (categoryFilter === "heavy" && child.node.sizeBytes >= 5 * 1024 * 1024 * 1024);

            const childAnimState = animMap.get(child.node.path);
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
              growthPulse: childAnimState?.pulseIntensity,
              isFilling: childAnimState?.isGrowing,
              isScanning,
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
            icon: hubNode.theme.icon,
            growthPulse: hubAnim.pulse,
            isFilling: hubAnim.isFilling,
            isScanning,
          });
        }
      }

      ctx.restore(); // Restore world transform

      // 8. Render Holographic Hover Tooltip if hovering over any node
      if (hoveredTarget) {
        drawTooltip(ctx, hoveredTarget, panRef.current, zoomRef.current, moonRef.current, childPages, graphView);
      }

      ctx.restore(); // Restore DPR scale
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [graphView, drives, activeDrive, selectedNodeId, drainingId, autoOrbit, categoryFilter, hoveredTarget]);

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
      const rawPan = {
        x: dragStartRef.current.panX + dx,
        y: dragStartRef.current.panY + dy,
      };
      const clamped = clampPan(
        rawPan,
        zoomRef.current,
        canvas.clientWidth,
        canvas.clientHeight,
        boundaryRadiusRef.current
      );
      setPan(clamped);
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

    // Check satellites first
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
        triggerTreeReveal();
        if (clickedNode.kind === "folder" && scanStatusRef.current !== "scanning") {
          void focusNode(clickedNode.id);
        }
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

    if (targetFolder && scanStatusRef.current !== "scanning") {
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

    const clampedPan = clampPan(
      { x: newPanX, y: newPanY },
      newZoom,
      canvas.clientWidth,
      canvas.clientHeight,
      boundaryRadiusRef.current
    );

    setZoom(newZoom);
    setPan(clampedPan);
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
// Canvas Helper Functions: Boundary, Tracks, Dust, Lines, Balls
// -------------------------------------------------------------

function drawSceneBoundary(
  ctx: CanvasRenderingContext2D,
  boundaryRadius: number,
  time: number,
  scanFade: number,
  scannedCount: number,
  currentPath: string,
) {
  const isScanning = scanFade > 0.02;
  ctx.save();

  // 1. Chamber Floor Atmosphere
  // 1. Chamber Floor Atmosphere - smooth dark circular backdrop
  const floorGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, boundaryRadius);
  floorGrad.addColorStop(0, "rgba(13, 27, 56, 0.45)");
  floorGrad.addColorStop(0.55, "rgba(9, 17, 34, 0.70)");
  floorGrad.addColorStop(0.85, "rgba(5, 9, 20, 0.90)");
  floorGrad.addColorStop(1, "rgba(3, 5, 12, 0.98)");

  ctx.beginPath();
  ctx.arc(0, 0, boundaryRadius, 0, Math.PI * 2);
  ctx.fillStyle = floorGrad;
  ctx.fill();

  // 2. Contained Matrix Grid with radial soft mask
  // 2. Subtle Arena Grid (Clean & faint, no radar range rings, crosshairs, or sweep cones)
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, boundaryRadius - 2, 0, Math.PI * 2);
  ctx.clip(); // Keep grid cleanly inside boundary!
  ctx.clip(); // Keep grid cleanly inside boundary

  const gridSize = 65;
  ctx.strokeStyle = "rgba(14, 165, 233, 0.07)";
  ctx.strokeStyle = "rgba(14, 165, 233, 0.05)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = -boundaryRadius; x <= boundaryRadius; x += gridSize) {
    ctx.moveTo(x, -boundaryRadius);
    ctx.lineTo(x, boundaryRadius);
  }
  for (let y = -boundaryRadius; y <= boundaryRadius; y += gridSize) {
    ctx.moveTo(-boundaryRadius, y);
    ctx.lineTo(boundaryRadius, y);
  }
  ctx.stroke();

  // Plus '+' cross markers at grid intersections
  ctx.strokeStyle = "rgba(56, 189, 248, 0.22)";
  ctx.lineWidth = 1;
  const crossSize = 3;
  ctx.beginPath();
  for (let x = -boundaryRadius + gridSize; x < boundaryRadius; x += gridSize * 2) {
    for (let y = -boundaryRadius + gridSize; y < boundaryRadius; y += gridSize * 2) {
      if (Math.hypot(x, y) < boundaryRadius - 30) {
        ctx.moveTo(x - crossSize, y);
        ctx.lineTo(x + crossSize, y);
        ctx.moveTo(x, y - crossSize);
        ctx.lineTo(x, y + crossSize);
      }
    }
  }
  ctx.stroke();

  // Concentric Radial Range Rings inside the arena
  const rangeRings = [150, 275, 390];
  ctx.setLineDash([3, 7]);
  ctx.strokeStyle = "rgba(0, 240, 255, 0.10)";
  for (const r of rangeRings) {
    if (r < boundaryRadius) {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();

      // Range ring label along the 45-degree ray
      ctx.save();
      ctx.setLineDash([]);
      ctx.font = "9px system-ui, sans-serif";
      ctx.fillStyle = "rgba(56, 189, 248, 0.35)";
      ctx.fillText(`${r}R`, r * 0.707 + 4, -r * 0.707 - 4);
      ctx.restore();
    }
  }
  ctx.setLineDash([]);

  // 3. Sonar Radar Pulse Waves. Fades out for about 700ms after the scan ends.
  if (scanFade > 0.02) {
    ctx.save();
    ctx.globalAlpha = scanFade;
    // Sonar ripples
    for (let i = 0; i < 3; i++) {
      const pulseT = (time * 0.4 + i * 0.33) % 1;
      const pr = pulseT * (boundaryRadius - 6);
      const pAlpha = (1 - pulseT) * 0.38;
      ctx.strokeStyle = `rgba(0, 240, 255, ${pAlpha})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 0, pr, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Rotating Radar Sweep Cone
    const sweepAngle = (time * 1.5) % (Math.PI * 2);
    const sweepArc = Math.PI * 0.28; // ~50 degrees
    const sweepGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, boundaryRadius);
    sweepGrad.addColorStop(0, "rgba(0, 240, 255, 0.22)");
    sweepGrad.addColorStop(0.7, "rgba(0, 240, 255, 0.08)");
    sweepGrad.addColorStop(1, "rgba(0, 240, 255, 0.0)");

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, boundaryRadius - 2, sweepAngle - sweepArc, sweepAngle);
    ctx.closePath();
    ctx.fillStyle = sweepGrad;
    ctx.fill();

    // Leading glowing edge line of the sweep
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(
      Math.cos(sweepAngle) * (boundaryRadius - 2),
      Math.sin(sweepAngle) * (boundaryRadius - 2)
    );
    ctx.strokeStyle = "rgba(0, 240, 255, 0.65)";
    ctx.lineWidth = 2.0;
    ctx.shadowColor = "#00F0FF";
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.restore();
    ctx.restore();
  }

  ctx.restore(); // end clip

  // 4. Perimeter Boundary Rings
  // Outer Neon Shield Ring
  ctx.save();
  // 3. Perimeter Boundary Ring - clean glowing circular edge
  ctx.beginPath();
  ctx.arc(0, 0, boundaryRadius, 0, Math.PI * 2);
  ctx.strokeStyle = isScanning ? "rgba(0, 240, 255, 0.55)" : "rgba(0, 240, 255, 0.32)";
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = isScanning ? "rgba(0, 240, 255, 0.45)" : "rgba(0, 240, 255, 0.22)";
  ctx.lineWidth = 1.8;
  ctx.shadowColor = "#00F0FF";
  ctx.shadowBlur = isScanning ? 18 : 12;
  ctx.shadowBlur = isScanning ? 14 : 8;
  ctx.stroke();

  // Secondary dashed ring
  // Secondary faint concentric ring
  ctx.setLineDash([4, 8]);
  ctx.beginPath();
  ctx.arc(0, 0, boundaryRadius - 12, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(0, 240, 255, 0.16)";
  ctx.lineWidth = 1.2;
  ctx.arc(0, 0, boundaryRadius - 8, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(0, 240, 255, 0.10)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // 5. Perimeter Compass / Azimuth Ticks
  ctx.save();
  ctx.strokeStyle = "rgba(56, 189, 248, 0.35)";
  ctx.lineWidth = 1;
  const numTicks = 72; // every 5 degrees
  for (let i = 0; i < numTicks; i++) {
    const angle = (i / numTicks) * Math.PI * 2;
    const isMajor = i % 6 === 0; // every 30 degrees
    const tickLen = isMajor ? 8 : 4;
    const innerR = boundaryRadius - tickLen;
    const outerR = boundaryRadius;

    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    ctx.beginPath();
    ctx.moveTo(cos * innerR, sin * innerR);
    ctx.lineTo(cos * outerR, sin * outerR);
    ctx.strokeStyle = isMajor ? "rgba(0, 240, 255, 0.65)" : "rgba(56, 189, 248, 0.25)";
    ctx.stroke();
  }
  ctx.restore();

  if (scanFade > 0.02) {
    const labelY = boundaryRadius + 26;
    ctx.save();
    ctx.globalAlpha = scanFade;
    ctx.font = "bold 10px monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#38BDF8";
    ctx.shadowColor = "#00F0FF";
    ctx.shadowBlur = 8;
    ctx.fillText(`SCANNING: ${scannedCount.toLocaleString()} NODES`, -boundaryRadius, labelY);
    ctx.restore();

    if (currentPath) {
      const maxLen = 42;
      const displayPath = currentPath.length > maxLen ? "…" + currentPath.slice(-maxLen) : currentPath;
      ctx.save();
      ctx.globalAlpha = scanFade;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.font = "9px monospace";
      ctx.fillStyle = "rgba(56, 189, 248, 0.75)";
      ctx.fillText(`SCAN PATH: ${displayPath}`, 0, labelY + 14);
      ctx.restore();
    }
  }

  ctx.restore();
}

function drawOrbitalTracks(ctx: CanvasRenderingContext2D, orbitRadius: number) {
  ctx.save();
  ctx.setLineDash([4, 10]);
  ctx.setLineDash([4, 8]);
  ctx.lineWidth = 1.2;

  // Inner faint orbit
  ctx.strokeStyle = "rgba(0, 240, 255, 0.12)";
  // Single clean orbit track where child nodes travel
  ctx.strokeStyle = "rgba(0, 240, 255, 0.16)";
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

function drawCosmicDust(ctx: CanvasRenderingContext2D, particles: Particle[], time: number, extent = 900) {
  ctx.save();
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    if (p.x < -extent) p.x = extent;
    if (p.x > extent) p.x = -extent;
    if (p.y < -extent) p.y = extent;
    if (p.y > extent) p.y = -extent;

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
  showSpark = false,
  isScanning = false,
) {
  if (opacity <= 0.02) return;
  const dist = Math.hypot(x2 - x1, y2 - y1);
  if (dist < 3) return;

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, opacity));

  // Subtle filament line
  const grad = ctx.createLinearGradient(x1, y1, x2, y2);
  grad.addColorStop(0, "rgba(0, 240, 255, 0.45)");
  grad.addColorStop(1, `${color}99`);

  ctx.strokeStyle = grad;
  ctx.lineWidth = isScanning ? 1.8 : 1.5;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  if (showSpark) {
    // Establishing Connection Energy Spark at the end of the line
    ctx.fillStyle = "#FFFFFF";
    ctx.shadowColor = "#00F0FF";
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(x2, y2, 3.2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Traveling energy pulse (higher frequency during scanning)
    const pulseSpeed = isScanning ? 0.9 : 0.45;
    const t = (time * pulseSpeed + (x2 * 0.01)) % 1;
    const px = x1 + (x2 - x1) * t;
    const py = y1 + (y2 - y1) * t;

    ctx.fillStyle = isScanning ? "#FFFFFF" : "#A5F3FC";
    ctx.shadowColor = "#00F0FF";
    ctx.shadowBlur = isScanning ? 10 : 6;
    ctx.beginPath();
    ctx.arc(px, py, isScanning ? 2.4 : 1.8, 0, Math.PI * 2);
    ctx.fill();
  }

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
  if (opacity <= 0.02) return;
  const dist = Math.hypot(x2 - x1, y2 - y1);
  if (dist < 3) return;

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
  ctx.strokeStyle = `${color}88`;
  ctx.lineWidth = 1.1;
  ctx.setLineDash([2, 4]);

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.restore();
}

function verticalBandsOverlap(topA: number, bottomA: number, topB: number, bottomB: number): boolean {
  return topA < bottomB && topB < bottomA;
}

function fitIconName(
  ctx: CanvasRenderingContext2D,
  icon: string | undefined,
  name: string,
  maxWidth: number,
): string {
  const prefix = icon ? `${icon}  ` : "";
  const full = `${prefix}${name}`;
  if (ctx.measureText(full).width <= maxWidth) return full;

  const ellipsis = "…";
  let best = "";
  let low = 0;
  let high = name.length;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const candidate = `${prefix}${name.slice(0, mid)}${ellipsis}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      best = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  if (best) return best;
  if (icon && ctx.measureText(icon).width <= maxWidth) return icon;
  return ellipsis;
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
  growthPulse?: number;
  isFilling?: boolean;
  isScanning?: boolean;
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
    growthPulse = 0,
    isFilling = false,
    isScanning = false,
  } = opts;

  if (!Number.isFinite(radius) || radius < 3 || opacity <= 0.01) return;

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, opacity));

  // Scale bounce when hovered or selected
  const activeScale = isHovered ? 1.08 : isSelected ? 1.04 : 1.0;
  const r = Math.max(3, radius * activeScale);

  // 0. Growth Pulse Shockwave Ring (When node swells or fills)
  if (growthPulse > 0.04) {
    ctx.save();
    const pulseR = r + (1 - growthPulse) * (isHub ? 24 : 14);
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1, pulseR), 0, Math.PI * 2);
    ctx.strokeStyle = theme.primary;
    ctx.lineWidth = Math.max(0.8, 2.2 * growthPulse);
    ctx.shadowColor = theme.primary;
    ctx.shadowBlur = 12 * growthPulse;
    ctx.globalAlpha = Math.min(1, opacity * growthPulse * 0.85);
    ctx.stroke();
    ctx.restore();
  }

  // 1. Dark Translucent Glass Base
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);

  const glassGrad = ctx.createRadialGradient(
    x - r * 0.3,
    y - r * 0.3,
    Math.max(0.1, r * 0.1),
    x,
    y,
    Math.max(0.5, r)
  );
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

  const clampedFill = Math.min(0.95, Math.max(0.04, fill));
  const waterLevel = y + r - 2 * r * clampedFill;
  const agitation = isFilling ? 1.45 : isScanning ? 1.25 : 1.0;
  const waveAmp = Math.max(1.8, r * (isHub ? 0.08 : 0.065) * agitation);
  const waveSpeed = isFilling ? 4.8 : isScanning ? 4.0 : 3.2;
  const waveFreq = isHub ? 0.04 : 0.06;

  ctx.beginPath();
  ctx.moveTo(x - r, y + r);

  const wavePoints: { u: number; wy: number }[] = [];
  const step = 3;
  for (let u = -r; u <= r; u += step) {
    const wy =
      waterLevel +
      Math.sin(u * waveFreq + time * waveSpeed + x * 0.02) * waveAmp +
      Math.cos(u * waveFreq * 1.6 - time * (waveSpeed * 0.75)) * (waveAmp * 0.45);
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

  // Micro-Bubbles Floating Inside Liquid (extra during filling or scanning)
  if (r > 7) {
    const bubbleCount = isFilling
      ? (isHub ? 18 : isSatellite ? 5 : 10)
      : isScanning
      ? (isHub ? 15 : isSatellite ? 4 : 8)
      : (isHub ? 12 : isSatellite ? 3 : 6);

    ctx.shadowBlur = 0;
    for (let b = 0; b < bubbleCount; b++) {
      const seed = (b + 1) * 31.7 + x * 0.3;
      const bSpeed = (isFilling ? 0.6 : 0.4) + (b % 3) * 0.25;
      const bProgress = (time * bSpeed + seed) % 1;
      const by = y + r - bProgress * (2 * r * clampedFill - 4);
      const bx = x + Math.sin(time * 3 + seed) * (r * 0.55);

      const bAlpha = Math.sin(bProgress * Math.PI) * 0.65;
      ctx.fillStyle = `rgba(255, 255, 255, ${bAlpha})`;
      ctx.beginPath();
      ctx.arc(bx, by, isHub ? 2.2 : 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Hub label anchors are known before the percentage so a high fill
  // can keep "82%" near the liquid surface while icon+name sit at center.
  let hubNameFontSize = 12;
  let hubSizeFontSize = 9;
  let hubNameY = y;
  let hubSizeY = y;
  if (isHub) {
    const hubScale = Math.max(0.55, Math.min(1.25, r / 88));
    hubNameFontSize = Math.max(12, Math.round(21 * hubScale));
    hubSizeFontSize = Math.max(9, Math.round(12 * hubScale));
    hubNameY = y;
    hubSizeY =
      hubNameY +
      hubNameFontSize / 2 +
      Math.max(4, Math.round(hubNameFontSize * 0.22)) +
      hubSizeFontSize / 2;
  }

  let drawnPercentY: number | null = null;
  let drawnPercentHalf = 0;

  // Inside-liquid percentage badge
  if (!isSatellite && percentFormatted && clampedFill > 0.25 && r > 16) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    const pctFontSize = isHub
      ? Math.max(10, Math.round(13 * (r / 88)))
      : Math.max(8, Math.round(11 * (r / 45)));
    ctx.font = `bold ${pctFontSize}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0, 0, 0, 0.7)";
    ctx.shadowBlur = 4;
    const pctHalf = pctFontSize / 2;
    let textY = waterLevel + Math.round(r * (isHub ? 0.3 : 0.35));
    if (isHub) {
      const nameTop = hubNameY - hubNameFontSize / 2;
      const nameBottom = hubNameY + hubNameFontSize / 2;
      const sizeTop = hubSizeY - hubSizeFontSize / 2;
      const sizeBottom = hubSizeY + hubSizeFontSize / 2;
      const gap = 4;
      for (let guard = 0; guard < 3; guard++) {
        const pctTop = textY - pctHalf;
        const pctBottom = textY + pctHalf;
        const hitsName = verticalBandsOverlap(pctTop, pctBottom, nameTop, nameBottom);
        const hitsSize =
          Boolean(sizeFormatted) && verticalBandsOverlap(pctTop, pctBottom, sizeTop, sizeBottom);
        if (!hitsName && !hitsSize) break;
        const obstacleBottom = hitsSize ? sizeBottom : nameBottom;
        const pushed = obstacleBottom + gap + pctHalf;
        if (pushed <= textY) break;
        textY = pushed;
      }
    }
    if (textY < y + r - 8) {
      drawnPercentY = textY;
      drawnPercentHalf = pctHalf;
      ctx.fillText(percentFormatted, x, textY);
    }
  }

  // Central Hub scanning pulse in core
  if (isHub && isScanning) {
    const coreR = Math.max(4, r * 0.26 + Math.sin(time * 6) * 3.5);
    const coreGrad = ctx.createRadialGradient(x, y, 0, x, y, coreR);
    coreGrad.addColorStop(0, "rgba(255, 255, 255, 0.5)");
    coreGrad.addColorStop(0.5, "rgba(0, 240, 255, 0.25)");
    coreGrad.addColorStop(1, "rgba(0, 240, 255, 0)");
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(x, y, coreR, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore(); // Restore clip

  // 3. Circular Glass Rim Border
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = theme.rim;
  ctx.lineWidth = isHub ? 3.2 : isSelected ? 2.8 : isSatellite ? 1.4 : 2.0;
  ctx.stroke();

  // 4. Top-Left Specular Reflection Arc
  if (r >= 7) {
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1, r - 2), -Math.PI * 0.72, -Math.PI * 0.28);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
    ctx.lineWidth = isHub ? 2.5 : 1.5;
    ctx.stroke();
  }

  // 5. Selected Reticle (Segmented Glowing Circular Brackets)
  if (isSelected && r >= 4) {
    ctx.save();
    const reticleR = Math.max(2, r + 9);
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

  // 6. Hub Center Label — icon and name share one middle-aligned line
  if (isHub) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.font = `bold ${hubNameFontSize}px system-ui, sans-serif`;
    ctx.fillStyle = "#FFFFFF";
    ctx.shadowColor = "rgba(0, 0, 0, 0.88)";
    ctx.shadowBlur = 6;
    const hubLabel = fitIconName(ctx, icon, name || "C:", r * 1.35);
    ctx.fillText(hubLabel, x, hubNameY);

    if (sizeFormatted) {
      ctx.fillStyle = "rgba(224, 242, 254, 0.9)";
      ctx.font = `${hubSizeFontSize}px system-ui, sans-serif`;
      ctx.shadowColor = "rgba(0, 0, 0, 0.88)";
      ctx.shadowBlur = 4;
      ctx.fillText(sizeFormatted, x, hubSizeY);
    }
    ctx.restore();
  }

  // 7. Level 1 Labels (Size Above, Icon + Name Below)
  if (!isHub && !isSatellite) {
    ctx.save();
    ctx.textAlign = "center";

    const childScale = Math.max(0.65, Math.min(1.3, r / 45));
    const sizeFontSize = Math.max(9, Math.round(11 * childScale));
    const nameFontSize = Math.max(10, Math.round(12 * childScale));

    if (sizeFormatted) {
      ctx.textBaseline = "alphabetic";
      ctx.font = `bold ${sizeFontSize}px system-ui, sans-serif`;
      const pillY = y - r - Math.max(8, Math.round(12 * childScale));
      ctx.fillStyle = "rgba(226, 232, 240, 0.95)";
      ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
      ctx.shadowBlur = 4;
      ctx.fillText(sizeFormatted, x, pillY);
    }

    if (name) {
      ctx.textBaseline = "middle";
      ctx.font = `500 ${nameFontSize}px system-ui, sans-serif`;
      const captionHalf = nameFontSize / 2;
      let nameY = y + r + Math.max(12, Math.round(18 * childScale));
      if (drawnPercentY !== null) {
        const pctBottom = drawnPercentY + drawnPercentHalf;
        if (nameY - captionHalf < pctBottom + 4) {
          nameY = pctBottom + 4 + captionHalf;
        }
      }
      ctx.fillStyle = isSelected ? "#38BDF8" : isHovered ? "#FFFFFF" : "#E2E8F0";
      ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
      ctx.shadowBlur = 5;
      const displayLabel = fitIconName(ctx, icon, name, Math.max(r * 2.4, nameFontSize * 6));
      ctx.fillText(displayLabel, x, nameY);
    }
    ctx.restore();
  }

  // 8. Satellite Tiny Size Tag
  if (isSatellite && sizeFormatted) {
    ctx.save();
    ctx.font = "9px system-ui, sans-serif";
    const satScale = Math.max(0.65, Math.min(1.2, r / 14));
    const satFontSize = Math.max(8, Math.round(9 * satScale));
    ctx.font = `${satFontSize}px system-ui, sans-serif`;
    ctx.fillStyle = "rgba(203, 213, 225, 0.85)";
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
    ctx.shadowBlur = 4;
    ctx.fillText(sizeFormatted, x, y - r - Math.max(4, Math.round(6 * satScale)));
    ctx.restore();
  }

  ctx.restore();
}

// Draw Floating Holographic Tooltip above hovered node with Folder & File counts
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
  subChildrenMap: Record<string, FileNode[]>,
  childPages: Record<string, ChildPage>,
  graphView: GraphView | null,
) {
  const { node, theme, x, y, radius } = target;

  const dpr = window.devicePixelRatio || 1;
  const canvasDisplayWidth = ctx.canvas.width / Math.min(dpr, 2);

  const screenX = pan.x + x * zoom;
  const screenY = pan.y + (y - radius) * zoom - 18;

  const title = node.name || (node.kind === "folder" ? "Folder" : "File");
  const typeLabel = theme.label;
  const sizeLabel = formatBytes(node.sizeBytes);

  let folderCount = node.folderCount;
  let fileCount = node.fileCount;

  if (node.kind === "folder") {
    if (folderCount === undefined || fileCount === undefined) {
      if (graphView && (graphView.focus.id === node.id || graphView.focus.path === node.path)) {
        folderCount = graphView.children.filter((c) => c.kind === "folder").length;
        fileCount = graphView.children.filter((c) => c.kind !== "folder").length;
      } else {
        const cached = childPages[node.path]?.nodes || subChildrenMap[node.path];
        if (cached && cached.length > 0) {
          folderCount = cached.filter((c) => c.kind === "folder").length;
          fileCount = cached.filter((c) => c.kind !== "folder").length;
        } else if (node.childCount === 0) {
          folderCount = 0;
          fileCount = 0;
        } else {
          // If childCount is known
          folderCount = Math.round(node.childCount * 0.35);
          fileCount = node.childCount - folderCount;
        }
      }
    }
  }

  const countRowText =
    node.kind === "folder"
      ? `📁 ${folderCount ?? 0} folders  •  📄 ${fileCount ?? 0} files`
      : `📄 1 file  •  ${node.category.toUpperCase()}`;

  ctx.save();
  ctx.font = "bold 12px system-ui, sans-serif";
  const titleWidth = ctx.measureText(title).width;
  ctx.font = "11px system-ui, sans-serif";
  const subWidth = ctx.measureText(`${typeLabel}  •  ${sizeLabel}`).width;
  ctx.font = "10.5px system-ui, sans-serif";
  const countWidth = ctx.measureText(countRowText).width;

  const cardWidth = Math.max(165, Math.max(titleWidth, subWidth, countWidth) + 30);
  const cardHeight = 68;

  let cardX = screenX - cardWidth / 2;
  let cardY = screenY - cardHeight;

  // Boundary clamping
  if (cardX < 12) cardX = 12;
  if (cardX + cardWidth > canvasDisplayWidth - 12) {
    cardX = canvasDisplayWidth - cardWidth - 12;
  }
  if (cardY < 12) {
    cardY = screenY + radius * 2 * zoom + 32;
  }

  // Background Box with glow
  ctx.fillStyle = "rgba(10, 15, 30, 0.94)";
  ctx.strokeStyle = theme.rim;
  ctx.lineWidth = 1.4;
  ctx.shadowColor = theme.glow;
  ctx.shadowBlur = 14;

  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardWidth, cardHeight, 10);
  ctx.fill();
  ctx.stroke();

  // Reset shadow for text rendering
  ctx.shadowBlur = 0;
  ctx.textAlign = "left";

  // Row 1: Icon + Name
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 12px system-ui, sans-serif";
  const truncatedTitle = title.length > 24 ? `${title.slice(0, 22)}…` : title;
  ctx.fillText(`${theme.icon} ${truncatedTitle}`, cardX + 12, cardY + 20);

  // Row 2: Type • Size
  ctx.fillStyle = theme.badgeText;
  ctx.font = "11px system-ui, sans-serif";
  ctx.fillText(`${typeLabel}  •  ${sizeLabel}`, cardX + 12, cardY + 38);

  // Row 3: Folders & Files Count
  ctx.fillStyle = "#94A3B8";
  ctx.font = "10.5px system-ui, sans-serif";
  ctx.fillText(countRowText, cardX + 12, cardY + 55);

  ctx.restore();
}
