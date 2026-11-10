import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import { useFileStore } from "../../store/useFileStore";
import { useVisualizerStore } from "./visualizerState";

const HOME_PERSPECTIVE = new Vector3(5.5, 3.2, 8.6);
const HOME_TOP = new Vector3(0.001, 14.5, 0);

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
  const viewMode = useVisualizerStore((state) => state.viewMode);
  const autoOrbit = useVisualizerStore((state) => state.autoOrbit);
  const resetTrigger = useVisualizerStore((state) => state.resetCameraTrigger);

  const anim = useRef<{ from: Vector3; to: Vector3; t: number } | null>(null);

  // Transition to target position when focus changes, reset triggered, or viewMode toggles
  useEffect(() => {
    const target = viewMode === "top" ? HOME_TOP : HOME_PERSPECTIVE;
    anim.current = { from: camera.position.clone(), to: target.clone(), t: 0 };
  }, [camera, focusedNodeId, viewMode, resetTrigger]);

  useFrame((_, delta) => {
    const orbit = isOrbit(controls) ? controls : null;
    const current = anim.current;

    if (current) {
      if (orbit) orbit.enabled = false;
      current.t = Math.min(1, current.t + delta / 0.7);
      const eased = 1 - (1 - current.t) ** 3;
      camera.position.lerpVectors(current.from, current.to, eased);
      if (orbit) orbit.target.set(0, 0, 0);
      camera.lookAt(0, 0, 0);
      if (current.t >= 1) {
        anim.current = null;
        if (orbit) orbit.enabled = true;
      }
      return;
    }

    if (orbit) orbit.enabled = true;

    // Ambient cinematic auto-orbit
    if (autoOrbit && !current) {
      const angle = delta * 0.22;
      const x = camera.position.x;
      const z = camera.position.z;
      camera.position.x = x * Math.cos(angle) - z * Math.sin(angle);
      camera.position.z = x * Math.sin(angle) + z * Math.cos(angle);
      camera.lookAt(0, 0, 0);
      if (orbit) orbit.target.set(0, 0, 0);
    }
  });

  return null;
}
