import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { Color, DoubleSide, ShaderMaterial, Vector3, type Group, type Object3D } from "three";
import liquidVert from "../../shaders/liquid.vert.glsl?raw";
import liquidFrag from "../../shaders/liquid.frag.glsl?raw";
import { liquidColors } from "../../lib/colors";
import { liquidFill } from "../../lib/scale";
import type { FileNode } from "../../types/filesystem";
import { useFileStore } from "../../store/useFileStore";
import { useGraphResources } from "./GraphResources";

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
  groups: RefObject<Map<string, Object3D>>;
}

const noopRaycast = () => {};

export function LiquidSphere({ node, radius, x, y, z, diskUsed, groups }: LiquidSphereProps) {
  const { geometry, glass } = useGraphResources();
  const group = useRef<Group>(null);
  const target = useRef(new Vector3(x, y, z));
  const [hovered, setHovered] = useState(false);
  const focused = useFileStore((state) => state.focusedNodeId === node.id || state.focusedNodeId === node.path);
  const colors = liquidColors(node);
  const restFill = liquidFill(node.percentOfParent, diskUsed);
  const restFillRef = useRef(restFill);
  restFillRef.current = restFill;
  target.current.set(x, y, z);
  const motion = useRef<Motion>({
    fill: restFill,
    scale: 1,
    x: 0.12,
    z: -0.08,
    vx: 0,
    vz: 0,
    fired: false,
    ready: false,
  });

  const uniforms = useMemo(() => {
    const next: Record<string, { value: number | Color }> = {
      uFillLevel: { value: restFill },
      uWobbleX: { value: 0 },
      uWobbleZ: { value: 0 },
      uTime: { value: 0 },
      uColorA: { value: new Color(colors.a) },
      uColorB: { value: new Color(colors.b) },
    };
    return next;
  }, [colors.a, colors.b, restFill]);
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
    const selected = store.selectedNodeId === node.id || store.selectedNodeId === node.path;
    const draining = store.drainingId === node.path || store.drainingId === node.id;
    const body = motion.current;
    if (!body.ready) {
      mesh.position.copy(target.current);
      body.ready = true;
    } else {
      mesh.position.lerp(target.current, 0.12);
    }
    body.vx += -4.2 * body.x * step;
    body.vz += -4.2 * body.z * step;
    const damp = Math.exp(-1.8 * step);
    body.vx *= damp;
    body.vz *= damp;
    body.x += body.vx * step;
    body.z += body.vz * step;
    if (selected) body.vx += Math.sin(state.clock.elapsedTime * 6) * 0.35 * step;
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
      body.scale += (1 - body.scale) * Math.min(1, step * 4);
    }
    const pulse = selected && !draining ? 1 + Math.sin(state.clock.elapsedTime * 5) * 0.045 : 1;
    mesh.scale.setScalar(radius * Math.max(body.scale, 0.001) * pulse);
    uniforms.uFillLevel.value = body.fill;
    uniforms.uWobbleX.value = body.x + Math.sin(state.clock.elapsedTime * 1.3) * 0.02;
    uniforms.uWobbleZ.value = body.z + Math.cos(state.clock.elapsedTime * 1.1) * 0.02;
    uniforms.uTime.value = state.clock.elapsedTime;
  });

  const showLabel = hovered || focused;
  return (
    <group ref={group}>
      <mesh
        geometry={geometry}
        material={glass}
        dispose={null}
        renderOrder={2}
        onPointerOver={(event) => {
          event.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
        onClick={(event) => {
          event.stopPropagation();
          const store = useFileStore.getState();
          if (store.drainingId) return;
          if (node.kind === "folder") void store.focusNode(node.id);
          else store.selectNode(node.id);
        }}
      />
      <mesh geometry={geometry} material={material} dispose={null} scale={0.9} raycast={noopRaycast} renderOrder={1} />
      {showLabel ? (
        <Html position={[0, 1.2, 0]} center distanceFactor={10} pointerEvents="none">
          <div className="max-w-40 truncate rounded bg-slate-950/80 px-1.5 py-0.5 text-[10px] text-slate-100">
            {node.name}
          </div>
        </Html>
      ) : null}
    </group>
  );
}
