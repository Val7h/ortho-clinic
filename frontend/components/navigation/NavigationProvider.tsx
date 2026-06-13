"use client";

/**
 * NavigationProvider
 *
 * Context global de navegação mobile:
 * - Controla estado do drawer (aberto/fechado)
 * - Expõe openDrawer / closeDrawer / toggleDrawer
 * - Fecha o drawer automaticamente ao mudar de rota
 * - Renderiza o MobileDrawer e BottomTabBar uma única vez no layout raiz
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";

// Carregamento lazy do Drawer (não está no critical path)
const MobileDrawer = dynamic(() => import("./MobileDrawer"), { ssr: false });
const BottomTabBar = dynamic(() => import("./BottomTabBar"), { ssr: false });

interface NavigationContextType {
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
}

const NavigationContext = createContext<NavigationContextType | null>(null);

export function useNavigation(): NavigationContextType {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error("useNavigation must be used inside NavigationProvider");
  return ctx;
}

interface NavigationProviderProps {
  children: ReactNode;
}

export function NavigationProvider({ children }: NavigationProviderProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  // Fecha drawer ao navegar
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const openDrawer = () => setDrawerOpen(true);
  const closeDrawer = () => setDrawerOpen(false);
  const toggleDrawer = () => setDrawerOpen((v) => !v);

  return (
    <NavigationContext.Provider value={{ drawerOpen, openDrawer, closeDrawer, toggleDrawer }}>
      {children}
      {/* Drawer lateral (mobile) */}
      <MobileDrawer open={drawerOpen} onClose={closeDrawer} />
      {/* Tab bar inferior (mobile) */}
      <BottomTabBar />
    </NavigationContext.Provider>
  );
}
