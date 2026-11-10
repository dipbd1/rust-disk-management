import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  LineBasicMaterial,
  LineSegments,
  RingGeometry,
  MeshBasicMaterial,
  type Group,
} from "three";

export function SpatialGrid() {
  const rotatingRing = useRef<Group>(null);

  // Concentric range rings and radial guides
  const linesGeometry = useMemo(() => {
    const points: number[] = [];
    const radii = [3.5, 6.5, 9.5, 12.5];
    const segments = 64;

    // Concentric circles
    for (const r of radii) {
      for (let i = 0; i < segments; i++) {
        const a1 = (i / segments) * Math.PI * 2;
        const a2 = ((i + 1) / segments) * Math.PI * 2;
        points.push(Math.cos(a1) * r, 0, Math.sin(a1) * r);
        points.push(Math.cos(a2) * r, 0, Math.sin(a2) * r);
      }
    }

    // 8 radial spoke lines
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      points.push(Math.cos(a) * 2.5, 0, Math.sin(a) * 2.5);
      points.push(Math.cos(a) * 13.0, 0, Math.sin(a) * 13.0);
    }

    const geom = new BufferGeometry();
    geom.setAttribute("position", new BufferAttribute(new Float32Array(points), 3));
    return geom;
  }, []);

  const linesMaterial = useMemo(
    () =>
      new LineBasicMaterial({
        color: new Color("#38bdf8"),
        transparent: true,
        opacity: 0.16,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    [],
  );

  const subtlePlateMaterial = useMemo(
    () =>
      new MeshBasicMaterial({
        color: new Color("#0284c7"),
        transparent: true,
        opacity: 0.04,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    [],
  );

  const ringGeom = useMemo(() => new RingGeometry(3.4, 3.5, 48), []);

  useFrame((state) => {
    if (rotatingRing.current) {
      rotatingRing.current.rotation.y = -state.clock.elapsedTime * 0.04;
    }
  });

  return (
    <group position={[0, -4.5, 0]}>
      {/* Static grid */}
      <primitive object={new LineSegments(linesGeometry, linesMaterial)} dispose={null} />

      {/* Subtle floor plate disc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={subtlePlateMaterial}>
        <circleGeometry args={[13.0, 36]} />
      </mesh>

      {/* Rotating azimuth compass ring */}
      <group ref={rotatingRing}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} geometry={ringGeom} material={linesMaterial} />
      </group>
    </group>
  );
}
