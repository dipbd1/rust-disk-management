import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { Color, MeshPhysicalMaterial, SphereGeometry } from "three";

export interface GraphResources {
  geometry: SphereGeometry;
  glass: MeshPhysicalMaterial;
}

const ResourcesContext = createContext<GraphResources | null>(null);

export function GraphResourcesProvider({ children }: { children: ReactNode }) {
  const geometry = useMemo(() => new SphereGeometry(1, 48, 32), []);
  const glass = useMemo(
    () =>
      new MeshPhysicalMaterial({
        color: new Color("#e8f1ff"),
        transmission: 0.9,
        roughness: 0.1,
        ior: 1.5,
        thickness: 1.5,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.12,
        attenuationColor: new Color("#ffffff"),
        attenuationDistance: 4,
        envMapIntensity: 1.15,
      }),
    [],
  );

  useEffect(() => {
    return () => {
      geometry.dispose();
      glass.dispose();
    };
  }, [geometry, glass]);

  const value = useMemo(() => ({ geometry, glass }), [geometry, glass]);
  return <ResourcesContext.Provider value={value}>{children}</ResourcesContext.Provider>;
}

export function useGraphResources(): GraphResources {
  const resources = useContext(ResourcesContext);
  if (!resources) throw new Error("Liquid spheres must render inside the graph");
  return resources;
}
