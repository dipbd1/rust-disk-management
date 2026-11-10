import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Vector3,
  type Object3D,
} from "three";
import { useVisualizerStore } from "./visualizerState";
import type { FileCategory } from "../../types/filesystem";

const SEGMENTS = 24;

interface NodeLinkLineProps {
  fromId: string;
  toId: string;
  category: FileCategory;
  colorHex: string;
  groups: RefObject<Map<string, Object3D>>;
}

function cubic(a: Vector3, b: Vector3, c: Vector3, d: Vector3, t: number, out: Vector3): void {
  const inv = 1 - t;
  const inv2 = inv * inv;
  const t2 = t * t;
  out.set(0, 0, 0);
  out.addScaledVector(a, inv2 * inv);
  out.addScaledVector(b, 3 * inv2 * t);
  out.addScaledVector(c, 3 * inv * t2);
  out.addScaledVector(d, t2 * t);
}

export function NodeLinkLine({ fromId, toId, category, colorHex, groups }: NodeLinkLineProps) {
  const pulseMesh = useRef<Mesh>(null);
  const from = useRef(new Vector3());
  const to = useRef(new Vector3());
  const midA = useRef(new Vector3());
  const midB = useRef(new Vector3());
  const point = useRef(new Vector3());
  const speedSeed = useRef(0.4 + Math.random() * 0.35);

  const filter = useVisualizerStore((s) => s.categoryFilter);
  const isDimmed = filter !== "all" && filter !== category;

  const line = useMemo(() => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(SEGMENTS * 3), 3));
    const material = new LineBasicMaterial({
      color: new Color(colorHex),
      transparent: true,
      opacity: isDimmed ? 0.08 : 0.38,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    const curve = new Line(geometry, material);
    curve.frustumCulled = false;
    curve.renderOrder = 0;
    return curve;
  }, [colorHex, isDimmed]);

  const pulseMat = useMemo(
    () =>
      new MeshBasicMaterial({
        color: new Color(colorHex),
        transparent: true,
        opacity: isDimmed ? 0 : 0.9,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    [colorHex, isDimmed],
  );

  const pulseGeom = useMemo(() => new SphereGeometry(0.06, 8, 8), []);

  useEffect(() => {
    return () => {
      line.geometry.dispose();
      if (!Array.isArray(line.material)) line.material.dispose();
      pulseMat.dispose();
      pulseGeom.dispose();
    };
  }, [line, pulseMat, pulseGeom]);

  useFrame((state) => {
    const start = groups.current.get(fromId);
    const end = groups.current.get(toId);
    if (!start || !end) return;

    from.current.copy(start.position);
    to.current.copy(end.position);
    midA.current.lerpVectors(from.current, to.current, 0.35);
    midB.current.lerpVectors(from.current, to.current, 0.7);

    const dist = from.current.distanceTo(to.current);
    const lift = Math.min(1.4, dist * 0.18);
    midA.current.y += lift;
    midB.current.y += lift * 0.35;

    const attribute = line.geometry.getAttribute("position");
    if (!(attribute instanceof BufferAttribute)) return;

    for (let index = 0; index < SEGMENTS; index += 1) {
      cubic(from.current, midA.current, midB.current, to.current, index / (SEGMENTS - 1), point.current);
      attribute.setXYZ(index, point.current.x, point.current.y, point.current.z);
    }
    attribute.needsUpdate = true;

    // Animate traveling photon pulse along the bezier curve
    if (pulseMesh.current && !isDimmed) {
      const t = (state.clock.elapsedTime * speedSeed.current) % 1.0;
      cubic(from.current, midA.current, midB.current, to.current, t, point.current);
      pulseMesh.current.position.copy(point.current);
      // Soft fade in near start, fade out near end
      const alpha = Math.sin(t * Math.PI);
      pulseMesh.current.scale.setScalar(0.7 + alpha * 0.6);
    }
  });

  return (
    <>
      <primitive object={line} />
      {!isDimmed && <mesh ref={pulseMesh} geometry={pulseGeom} material={pulseMat} />}
    </>
  );
}
