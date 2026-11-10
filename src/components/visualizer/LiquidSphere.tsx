import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { Color, DoubleSide, ShaderMaterial, Vector3, type Group, type Object3D } from "three";
import liquidVert from "../../shaders/liquid.vert.glsl?raw";
import liquidFrag from "../../shaders/liquid.frag.glsl?raw";
import { liquidColors, nodeGlyph } from "../../lib/colors";
import { formatBytes } from "../../lib/format";
import { liquidFill, sharePercent } from "../../lib/scale";
import type { FileNode } from "../../types/filesystem";
import { useFileStore } from "../../store/useFileStore";
import { useGraphResources } from "./GraphResources";
import { useVisualizerStore } from "./visualizerState";
import { OrbitalRings } from "./OrbitalRings";
import { SelectionReticle } from "./SelectionReticle";

interface Motion {
  fill: number;
  scale: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  fired: boolean;
  ready: boolean;
}

interface LiquidSphereProps {
  node: FileNode;
  radius: number;
  x: number;
  y: number;
  z: number;
  diskUsed: number | null;
  isHub: boolean;
  isLarge: boolean;
  groups: RefObject<Map<string, Object3D>>;
}

const noopRaycast = () => {};

export function LiquidSphere({ node, radius, x, y, z, diskUsed, isHub, isLarge, groups }: LiquidSphereProps) {
  const { geometry, glass } = useGraphResources();
  const group = useRef<Group>(null);
  const target = useRef(new Vector3(x, y, z));
  const [hovered, setHovered] = useState(false);
  const labelMode = useVisualizerStore((state) => state.labelMode);

  const colors = liquidColors(node);
  const restFill = liquidFill(node.percentOfParent, diskUsed);
  const restFillRef = useRef(restFill);
  restFillRef.current = restFill;
  target.current.set(x, y, z);

  const motion = useRef<Motion>({
    fill: restFill,
    scale: 1,
    x: 0.1,
    z: -0.06,
    vx: 0,
    vz: 0,
    fired: false,
    ready: false,
  });

  const uniforms = useMemo(() => {
    return {
      uFillLevel: { value: restFill },
      uWobbleX: { value: 0 },
      uWobbleZ: { value: 0 },
      uTime: { value: 0 },
      uColorA: { value: new Color(colors.a) },
      uColorB: { value: new Color(colors.b) },
      uSelected: { value: 0 },
      uHovered: { value: 0 },
      uOpacity: { value: 1.0 },
      uIsHub: { value: isHub ? 1.0 : 0.0 },
    };
  }, [colors.a, colors.b, restFill, isHub]);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms,
        vertexShader: liquidVert,
        fragmentShader: liquidFrag,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        toneMapped: false,
      }),
    [uniforms],
  );

  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    const body = motion.current;
    const path = node.path;
    return () => {
      const draining = useFileStore.getState().drainingId;
      if ((draining === path || draining === node.id) && !body.fired) {
        body.fired = true;
        useFileStore.getState().finishDrain(path);
      }
    };
  }, [node.id, node.path]);

  useLayoutEffect(() => {
    const mesh = group.current;
    if (!mesh) return;
    groups.current.set(node.id, mesh);
    return () => {
      if (groups.current.get(node.id) === mesh) groups.current.delete(node.id);
    };
  }, [groups, node.id]);

  useFrame((state, delta) => {
    const mesh = group.current;
    if (!mesh) return;
    const step = Math.min(delta, 0.05);
    const store = useFileStore.getState();
    const vizStore = useVisualizerStore.getState();
    const selected = store.selectedNodeId === node.id || store.selectedNodeId === node.path;
    const draining = store.drainingId === node.path || store.drainingId === node.id;
    const body = motion.current;

    if (!body.ready) {
      mesh.position.copy(target.current);
      body.ready = true;
    } else {
      mesh.position.lerp(target.current, 0.12);
    }

    // Wobble physics
    body.vx += -4.8 * body.x * step;
    body.vz += -4.8 * body.z * step;
    const damp = Math.exp(-2.2 * step);
    body.vx *= damp;
    body.vz *= damp;
    body.x += body.vx * step;
    body.z += body.vz * step;

    if (selected) body.vx += Math.sin(state.clock.elapsedTime * 6) * 0.28 * step;

    if (draining) {
      body.fill = Math.max(0, body.fill - step * 0.9);
      body.scale = Math.max(0, body.scale - step * 1.15);
      if (body.fill <= 0.001 && body.scale <= 0.001 && !body.fired) {
        body.fill = 0;
        body.scale = 0;
        body.fired = true;
        store.finishDrain(node.path);
      }
    } else {
      body.fired = false;
      body.fill += (restFillRef.current - body.fill) * Math.min(1, step * 4);
      const targetScale = hovered ? 1.14 : 1.0;
      body.scale += (targetScale - body.scale) * Math.min(1, step * 6);
    }

    const pulse = selected && !draining ? 1 + Math.sin(state.clock.elapsedTime * 4.5) * 0.035 : 1;
    mesh.scale.setScalar(radius * Math.max(body.scale, 0.001) * pulse);

    // Uniform updates
    uniforms.uFillLevel.value = body.fill;
    uniforms.uWobbleX.value = body.x + Math.sin(state.clock.elapsedTime * 1.3) * 0.02;
    uniforms.uWobbleZ.value = body.z + Math.cos(state.clock.elapsedTime * 1.1) * 0.02;
    uniforms.uTime.value = state.clock.elapsedTime;
    uniforms.uSelected.value = selected ? 1.0 : 0.0;
    uniforms.uHovered.value = hovered ? 1.0 : 0.0;

    // Filter dimming
    const isGhosted = vizStore.categoryFilter !== "all" && vizStore.categoryFilter !== node.category;
    uniforms.uOpacity.value = isGhosted ? 0.22 : 1.0;
  });

  const isSelected = useFileStore((state) => state.selectedNodeId === node.id || state.selectedNodeId === node.path);
  const showLabel =
    hovered ||
    isSelected ||
    labelMode === "all" ||
    (labelMode === "smart" && (isHub || isLarge));

  return (
    <group ref={group}>
      {/* Outer physical glass sphere */}
      <mesh
        geometry={geometry}
        material={glass}
        dispose={null}
        renderOrder={2}
        onPointerOver={(event) => {
          event.stopPropagation();
          setHovered(true);
          useVisualizerStore.getState().setHoveredNodeId(node.id);
        }}
        onPointerOut={() => {
          setHovered(false);
          useVisualizerStore.getState().setHoveredNodeId(null);
        }}
        onClick={(event) => {
          event.stopPropagation();
          const store = useFileStore.getState();
          if (store.drainingId) return;
          store.selectNode(node.id);
        }}
        onDoubleClick={(event) => {
          event.stopPropagation();
          const store = useFileStore.getState();
          if (store.drainingId) return;
          if (node.kind === "folder") void store.focusNode(node.id);
        }}
      />

      {/* Inner glowing fluid core */}
      <mesh geometry={geometry} material={material} dispose={null} scale={0.91} raycast={noopRaycast} renderOrder={1} />

      {/* Central hero orbital gyro rings */}
      {isHub && <OrbitalRings radius={1.0} color={colors.a} isHub={true} />}

      {/* Selected satellite reticle */}
      {isSelected && !isHub && <SelectionReticle radius={1.0} color={colors.a} />}

      {/* Floating 3D holographic badge */}
      {showLabel ? (
        <Html position={[0, 1.25, 0]} center distanceFactor={11} pointerEvents="none">
          <div
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs shadow-2xl backdrop-blur-md transition-all duration-200 ${
              isSelected
                ? "border-cyan-400 bg-slate-950/90 text-cyan-200 ring-2 ring-cyan-400/40"
                : hovered
                  ? "border-white/30 bg-slate-900/90 text-white"
                  : "border-white/10 bg-slate-950/70 text-slate-300"
            }`}
          >
            <span style={{ color: colors.a }} className="text-xs font-bold">
              {nodeGlyph(node)}
            </span>
            <span className="max-w-32 truncate font-medium">{node.name}</span>
            <span className="font-mono text-[10px] text-slate-400">{formatBytes(node.sizeBytes)}</span>
            {node.percentOfParent > 0 && (
              <span className="rounded bg-white/10 px-1 text-[9px] font-semibold text-cyan-300">
                {Math.round(sharePercent(node.percentOfParent))}%
              </span>
            )}
          </div>
        </Html>
      ) : null}
    </group>
  );
}
