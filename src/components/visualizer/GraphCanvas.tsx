import { Canvas } from "@react-three/fiber";
import { Environment, OrbitControls } from "@react-three/drei";
import { BackSide } from "three";
import { CameraRig } from "./CameraRig";
import { ForceGraph3D } from "./ForceGraph3D";
import { GraphResourcesProvider } from "./GraphResources";
import { ViewerBreadcrumbs } from "./ViewerBreadcrumbs";
import { ViewerControls } from "./ViewerControls";
import { CategoryFilterBar } from "./CategoryFilterBar";
import { ViewerInspector } from "./ViewerInspector";

export function GraphCanvas() {
  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden select-none bg-[#070A12]">
      <Canvas
        className="h-full w-full"
        dpr={[1, 1.75]}
        camera={{ position: [5.5, 3.2, 8.6], fov: 42, near: 0.1, far: 100 }}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      >
        <color attach="background" args={["#070A12"]} />
        <ambientLight intensity={0.4} />
        <directionalLight position={[7, 10, 5]} intensity={1.7} color="#f8fafc" />
        <directionalLight position={[-6, -3, -5]} intensity={0.7} color="#38bdf8" />
        <directionalLight position={[-3, 6, -6]} intensity={0.5} color="#818cf8" />
        <pointLight position={[0, 0, 0]} intensity={18} distance={15} color="#00F0FF" />

        <Environment resolution={64} frames={1}>
          <mesh scale={16}>
            <sphereGeometry args={[1, 24, 24]} />
            <meshBasicMaterial color="#0f172a" side={BackSide} />
          </mesh>
          <pointLight position={[5, 7, 4]} intensity={35} color="#e0f2fe" />
          <pointLight position={[-5, -4, -3]} intensity={20} color="#38bdf8" />
        </Environment>

        <GraphResourcesProvider>
          <ForceGraph3D />
        </GraphResourcesProvider>

        <CameraRig />

        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.1}
          minDistance={2.0}
          maxDistance={36}
          target={[0, 0, 0]}
        />
      </Canvas>

      {/* Floating HUD suite following Top 150 UI/UX Best Practices */}
      <ViewerBreadcrumbs />
      <ViewerControls />
      <CategoryFilterBar />
      <ViewerInspector />
    </div>
  );
}
