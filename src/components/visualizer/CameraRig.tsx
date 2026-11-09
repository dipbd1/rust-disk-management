import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import { useFileStore } from "../../store/useFileStore";

const HOME = new Vector3(5.2, 3.1, 8.4);

interface OrbitLike {
  enabled: boolean;
  target: { set: (x: number, y: number, z: number) => void };
}

function isOrbit(controls: unknown): controls is OrbitLike {
  if (!controls || typeof controls !== "object" || !("enabled" in controls) || !("target" in controls)) return false;
  const target = controls.target;
  return !!target && typeof target === "object" && "set" in target;
}

export function CameraRig() {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls);
  const focusedNodeId = useFileStore((state) => state.focusedNodeId);
  const anim = useRef<{ from: Vector3; to: Vector3; t: number } | null>(null);

  useEffect(() => {
    anim.current = { from: camera.position.clone(), to: HOME.clone(), t: 0 };
  }, [camera, focusedNodeId]);

  useFrame((_, delta) => {
    const orbit = isOrbit(controls) ? controls : null;
    const current = anim.current;
    if (!current) {
      if (orbit) orbit.enabled = true;
      return;
    }
    if (orbit) orbit.enabled = false;
    current.t = Math.min(1, current.t + delta / 0.75);
    const eased = 1 - (1 - current.t) ** 3;
    camera.position.lerpVectors(current.from, current.to, eased);
    if (orbit) orbit.target.set(0, 0, 0);
    camera.lookAt(0, 0, 0);
    if (current.t >= 1) anim.current = null;
  });

  return null;
}
