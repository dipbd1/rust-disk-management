import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, PointsMaterial, type Group } from "three";

const PARTICLE_COUNT = 900;
const RADIUS_SPREAD = 32;

export function CosmicDust() {
  const group = useRef<Group>(null);

  const { positions, colors } = useMemo(() => {
    const pos = new Float32Array(PARTICLE_COUNT * 3);
    const col = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = Math.cbrt(Math.random()) * RADIUS_SPREAD + 5.0;

      const sinPhi = Math.sin(phi);
      pos[i * 3] = r * sinPhi * Math.cos(theta);
      pos[i * 3 + 1] = (r * Math.cos(phi)) * 0.6; // slightly flattened disk
      pos[i * 3 + 2] = r * sinPhi * Math.sin(theta);

      // Subtle cyan to azure to violet hues
      const pick = Math.random();
      if (pick < 0.45) {
        col[i * 3] = 0.2; // Cyan
        col[i * 3 + 1] = 0.8;
        col[i * 3 + 2] = 1.0;
      } else if (pick < 0.8) {
        col[i * 3] = 0.45; // Azure / Lavender
        col[i * 3 + 1] = 0.5;
        col[i * 3 + 2] = 1.0;
      } else {
        col[i * 3] = 0.15; // Emerald tint
        col[i * 3 + 1] = 0.95;
        col[i * 3 + 2] = 0.75;
      }
    }
    return { positions: pos, colors: col };
  }, []);

  const geometry = useMemo(() => {
    const geom = new BufferGeometry();
    geom.setAttribute("position", new BufferAttribute(positions, 3));
    geom.setAttribute("color", new BufferAttribute(colors, 3));
    return geom;
  }, [positions, colors]);

  const material = useMemo(
    () =>
      new PointsMaterial({
        size: 0.12,
        vertexColors: true,
        transparent: true,
        opacity: 0.5,
        blending: AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    [],
  );

  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime;
    group.current.rotation.y = t * 0.015;
    group.current.rotation.x = Math.sin(t * 0.008) * 0.04;
  });

  return (
    <group ref={group}>
      <primitive object={new Points(geometry, material)} dispose={null} />
    </group>
  );
}
