import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";

type SurfaceId = string;

type GetSurfaceElement = () => HTMLElement | null;

interface FocusManagerValue {
  registerSurface: (id: SurfaceId, getElement: GetSurfaceElement) => () => void;
  setActiveSurface: (id: SurfaceId | null) => void;
  focusSurface: (id: SurfaceId | null) => boolean;
  focusPreferredSurface: () => boolean;
  activateOverlay: (id: SurfaceId) => void;
  deactivateOverlay: (id: SurfaceId) => void;
}

const FocusManagerContext = createContext<FocusManagerValue | null>(null);

function hasDialogOverlay() {
  return !!document.querySelector("[data-slot='dialog-overlay']");
}

export function FocusManagerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const surfacesRef = useRef(new Map<SurfaceId, GetSurfaceElement>());
  const activeSurfaceRef = useRef<SurfaceId | null>(null);
  const lastNonOverlaySurfaceRef = useRef<SurfaceId | null>(null);
  const overlayStackRef = useRef<Array<{ id: SurfaceId; returnSurfaceId: SurfaceId | null }>>([]);

  const isOverlaySurface = useCallback((id: SurfaceId | null) => {
    if (!id) return false;
    return overlayStackRef.current.some((entry) => entry.id === id);
  }, []);

  const getSurfaceElement = useCallback((id: SurfaceId | null) => {
    if (!id) return null;
    return surfacesRef.current.get(id)?.() ?? null;
  }, []);

  const registerSurface = useCallback(
    (id: SurfaceId, getElement: GetSurfaceElement) => {
      surfacesRef.current.set(id, getElement);

      return () => {
        surfacesRef.current.delete(id);

        if (activeSurfaceRef.current === id) {
          activeSurfaceRef.current = null;
        }

        if (lastNonOverlaySurfaceRef.current === id) {
          lastNonOverlaySurfaceRef.current = null;
        }

        overlayStackRef.current = overlayStackRef.current.filter(
          (entry) => entry.id !== id,
        );
      };
    },
    [],
  );

  const setActiveSurface = useCallback(
    (id: SurfaceId | null) => {
      activeSurfaceRef.current = id;

      if (id && !isOverlaySurface(id)) {
        lastNonOverlaySurfaceRef.current = id;
      }
    },
    [isOverlaySurface],
  );

  const focusSurface = useCallback(
    (id: SurfaceId | null) => {
      const element = getSurfaceElement(id);
      if (!element) return false;

      element.focus({ preventScroll: true });
      activeSurfaceRef.current = id;

      if (id && !isOverlaySurface(id)) {
        lastNonOverlaySurfaceRef.current = id;
      }

      return true;
    },
    [getSurfaceElement, isOverlaySurface],
  );

  const focusPreferredSurface = useCallback(() => {
    const preferredId =
      overlayStackRef.current.at(-1)?.id ??
      activeSurfaceRef.current ??
      lastNonOverlaySurfaceRef.current;

    if (focusSurface(preferredId)) return true;

    if (
      preferredId !== lastNonOverlaySurfaceRef.current &&
      focusSurface(lastNonOverlaySurfaceRef.current)
    ) {
      return true;
    }

    return false;
  }, [focusSurface]);

  const activateOverlay = useCallback((id: SurfaceId) => {
    const existingEntry = overlayStackRef.current.find((entry) => entry.id === id);
    if (!existingEntry) {
      overlayStackRef.current.push({
        id,
        returnSurfaceId: lastNonOverlaySurfaceRef.current,
      });
    }
    activeSurfaceRef.current = id;
  }, []);

  const deactivateOverlay = useCallback((id: SurfaceId) => {
    let index = -1;
    for (let i = overlayStackRef.current.length - 1; i >= 0; i -= 1) {
      if (overlayStackRef.current[i]?.id === id) {
        index = i;
        break;
      }
    }
    if (index === -1) return;

    overlayStackRef.current.splice(index, 1);
    activeSurfaceRef.current =
      overlayStackRef.current.at(-1)?.id ?? lastNonOverlaySurfaceRef.current;
  }, []);

  useEffect(() => {
    let rafId = 0;

    const scheduleRestore = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const activeElement = document.activeElement;
        if (activeElement && activeElement !== document.body) return;
        if (hasDialogOverlay() && overlayStackRef.current.length === 0) return;
        focusPreferredSurface();
      });
    };

    const handleFocusIn = () => {
      if (document.activeElement === document.body) {
        scheduleRestore();
      }
    };

    const handleFocusOut = () => {
      scheduleRestore();
    };

    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);

    return () => {
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
      cancelAnimationFrame(rafId);
    };
  }, [focusPreferredSurface]);

  const value = useMemo<FocusManagerValue>(
    () => ({
      registerSurface,
      setActiveSurface,
      focusSurface,
      focusPreferredSurface,
      activateOverlay,
      deactivateOverlay,
    }),
    [
      activateOverlay,
      deactivateOverlay,
      focusPreferredSurface,
      focusSurface,
      registerSurface,
      setActiveSurface,
    ],
  );

  return (
    <FocusManagerContext.Provider value={value}>
      {children}
    </FocusManagerContext.Provider>
  );
}

export function useFocusManager() {
  const context = useContext(FocusManagerContext);
  if (!context) {
    throw new Error("useFocusManager must be used within FocusManagerProvider");
  }
  return context;
}
