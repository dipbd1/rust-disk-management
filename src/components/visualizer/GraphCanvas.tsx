import { Canvas } from "@react-three/fiber";
import { Environment, OrbitControls } from "@react-three/drei";
import { BackSide } from "three";
import { CameraRig } from "./CameraRig";
import { ForceGraph3D } from "./ForceGraph3D";
import { GraphHud } from "./GraphHud";
import { GraphResourcesProvider } from "./GraphResources";

export function GraphCanvas() {
  return (
    <div className="relative h-full min-h-0">
      <Canvas
        className="h-full w-full"
        dpr={[1, 1.75]}
        camera={{ position: [5.2, 3.1, 8.4], fov: 42, near: 0.1, far: 80 }}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      >
        <color attach="background" args={["#0B0F17"]} />
        <ambientLight intensity={0.35} />
        <directionalLight position={[6, 8, 4]} intensity={1.5} />
        <directionalLight position={[-5, -2, -4]} intensity={0.35} color="#93c5fd" />
        <Environment resolution={64} frames={1}>
          <mesh scale={12}>
            <sphereGeometry args={[1, 24, 24]} />
            <meshBasicMaterial color="#1e3a8a" side={BackSide} />
          </mesh>
          <pointLight position={[4, 6, 3]} intensity={40} color="#e0f2fe" />
          <pointLight position={[-4, -3, -2]} intensity={18} color="#38bdf8" />
        </Environment>
        <GraphResourcesProvider>
          <ForceGraph3D />
        </GraphResourcesProvider>
        <CameraRig />
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.12}
          minDistance={2.5}
          maxDistance={28}
          target={[0, 0, 0]}
        />
      </Canvas>
      <GraphHud />
    </div>
  );
}
