import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, BufferAttribute, BufferGeometry, Line, LineBasicMaterial, Vector3, type Object3D } from "three";

const SEGMENTS = 20;

interface NodeLinkLineProps {
  fromId: string;
  toId: string;
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

export function NodeLinkLine({ fromId, toId, groups }: NodeLinkLineProps) {
  const line = useMemo(() => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(SEGMENTS * 3), 3));
    const material = new LineBasicMaterial({
      color: "#67e8f9",
      transparent: true,
      opacity: 0.55,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    const curve = new Line(geometry, material);
    curve.frustumCulled = false;
    curve.renderOrder = 0;
    return curve;
  }, []);
  const from = useRef(new Vector3());
  const to = useRef(new Vector3());
  const midA = useRef(new Vector3());
  const midB = useRef(new Vector3());
  const point = useRef(new Vector3());

  useEffect(() => {
    return () => {
      line.geometry.dispose();
      const material = line.material;
      if (!Array.isArray(material)) material.dispose();
    };
  }, [line]);

  useFrame(() => {
    const start = groups.current.get(fromId);
    const end = groups.current.get(toId);
    if (!start || !end) return;
    from.current.copy(start.position);
    to.current.copy(end.position);
    midA.current.lerpVectors(from.current, to.current, 0.35);
    midB.current.lerpVectors(from.current, to.current, 0.7);
    const lift = Math.min(1.4, from.current.distanceTo(to.current) * 0.18);
    midA.current.y += lift;
    midB.current.y += lift * 0.35;
    const attribute = line.geometry.getAttribute("position");
    if (!(attribute instanceof BufferAttribute)) return;
    for (let index = 0; index < SEGMENTS; index += 1) {
      cubic(from.current, midA.current, midB.current, to.current, index / (SEGMENTS - 1), point.current);
      attribute.setXYZ(index, point.current.x, point.current.y, point.current.z);
    }
    attribute.needsUpdate = true;
  });

  return <primitive object={line} />;
}
