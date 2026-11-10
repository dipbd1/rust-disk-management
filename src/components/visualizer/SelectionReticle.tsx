import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  LineBasicMaterial,
  LineSegments,
  type Group,
} from "three";

interface SelectionReticleProps {
  radius: number;
  color?: string;
}

export function SelectionReticle({ radius, color = "#00F0FF" }: SelectionReticleProps) {
  const group = useRef<Group>(null);
  const r = radius * 1.45;

  const reticleGeom = useMemo(() => {
    const points: number[] = [];
    const corners = 4;
    const arcLen = 0.35; // radian length of corner brackets

    for (let i = 0; i < corners; i++) {
      const base = (i / corners) * Math.PI * 2;
      const a1 = base - arcLen * 0.5;
      const a2 = base + arcLen * 0.5;
      const steps = 8;
      for (let s = 0; s < steps; s++) {
        const t1 = a1 + ((a2 - a1) * s) / steps;
        const t2 = a1 + ((a2 - a1) * (s + 1)) / steps;
        points.push(Math.cos(t1) * r, Math.sin(t1) * r, 0);
        points.push(Math.cos(t2) * r, Math.sin(t2) * r, 0);
      }
    }

    const geom = new BufferGeometry();
    geom.setAttribute("position", new BufferAttribute(new Float32Array(points), 3));
    return geom;
  }, [r]);

  const mat = useMemo(
    () =>
      new LineBasicMaterial({
        color: new Color(color),
        transparent: true,
        opacity: 0.85,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    [color],
  );

  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime;
    group.current.rotation.z = t * 0.5;
    const pulse = 1.0 + Math.sin(t * 5.0) * 0.06;
    group.current.scale.setScalar(pulse);
  });

  return (
    <group ref={group}>
      <primitive object={new LineSegments(reticleGeom, mat)} dispose={null} />
    </group>
  );
}
