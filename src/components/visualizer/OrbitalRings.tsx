import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  Color,
  LineBasicMaterial,
  RingGeometry,
  MeshBasicMaterial,
  type Group,
  BufferGeometry,
  BufferAttribute,
  LineSegments,
} from "three";

interface OrbitalRingsProps {
  radius: number;
  color?: string;
  isHub?: boolean;
}

export function OrbitalRings({ radius, color = "#00F0FF", isHub = false }: OrbitalRingsProps) {
  const innerRing = useRef<Group>(null);
  const outerRing = useRef<Group>(null);

  const ringRadius = radius * 1.35;
  const outerRadius = radius * 1.6;

  // Segmented outer ring geometry
  const dashedGeometry = useMemo(() => {
    const points: number[] = [];
    const segments = 48;
    for (let i = 0; i < segments; i += 2) {
      const a1 = (i / segments) * Math.PI * 2;
      const a2 = ((i + 1) / segments) * Math.PI * 2;
      points.push(Math.cos(a1) * outerRadius, 0, Math.sin(a1) * outerRadius);
      points.push(Math.cos(a2) * outerRadius, 0, Math.sin(a2) * outerRadius);
    }
    const geom = new BufferGeometry();
    geom.setAttribute("position", new BufferAttribute(new Float32Array(points), 3));
    return geom;
  }, [outerRadius]);

  const ringGeom = useMemo(() => new RingGeometry(ringRadius - 0.03, ringRadius + 0.03, 64), [ringRadius]);

  const ringMat = useMemo(
    () =>
      new MeshBasicMaterial({
        color: new Color(color),
        transparent: true,
        opacity: isHub ? 0.45 : 0.65,
        blending: AdditiveBlending,
        depthWrite: false,
        side: 2, // DoubleSide
      }),
    [color, isHub],
  );

  const dashedMat = useMemo(
    () =>
      new LineBasicMaterial({
        color: new Color(color),
        transparent: true,
        opacity: isHub ? 0.3 : 0.5,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    [color, isHub],
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (innerRing.current) {
      innerRing.current.rotation.z = t * 0.25;
      innerRing.current.rotation.y = t * 0.15;
    }
    if (outerRing.current) {
      outerRing.current.rotation.y = -t * 0.18;
    }
  });

  return (
    <group>
      {/* Tilted gyro ring */}
      <group ref={innerRing} rotation={[0.45, 0.2, 0]}>
        <mesh geometry={ringGeom} material={ringMat} />
      </group>

      {/* Outer segmented equator ring */}
      <group ref={outerRing}>
        <primitive object={new LineSegments(dashedGeometry, dashedMat)} dispose={null} />
      </group>
    </group>
  );
}
