# StrictMode-safe Viewer lifecycle

The Viewer and every Cesium object live in refs. React state and the Zustand store hold only plain values (region id, date index, map mode). Effects read those values and push them into Cesium, then call `requestRender()`.

```tsx
import { useEffect, useRef } from 'react';
import { Viewer } from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { createViewer } from './createViewer';      // options from reference.md
import { useAppStore } from '@/state/store';

export function Globe() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);

  // Create once. StrictMode runs this twice in dev: the guard plus the cleanup make that safe.
  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;
    const viewer = createViewer(containerRef.current);
    viewerRef.current = viewer;
    return () => {
      if (!viewer.isDestroyed()) viewer.destroy();
      viewerRef.current = null;
    };
  }, []);

  // Push plain state into Cesium.
  const dateIndex = useAppStore((s) => s.dateIndex);
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    dataLayer.setFrame(dateIndex);       // updates uniforms only
    viewer.scene.requestRender();
  }, [dateIndex]);

  return <div ref={containerRef} className="fixed inset-0" />;
}
```

Rules:
- Wrap the Globe in `react-error-boundary` with a static image fallback if WebGL fails.
- Never pass `viewer`, entities, primitives or materials through props, context or state. Expose a small imperative API from a module (`dataLayer.setFrame`, `camera.flyToRegion`) that holds its own refs.
- Remove primitives and data sources you add when their layer is turned off (`scene.primitives.remove`, `dataSources.remove(ds, true)`), then `requestRender()`.
- Resize is handled by Cesium; if the container size changes without a window resize, call `viewer.resize()` then `requestRender()`.
