import { useCallback, useEffect, useState } from "react";

export type View = "case" | "deadlines" | "bench";
export type Route = { view: View; selectedId: string | undefined };

// note: the hash holds the view and the open case, so a link or a video cut lands on one screen
export function readRoute(hash: string): Route {
  const [view, ...rest] = hash.replace(/^#\/?/, "").split("/");
  if (view === "deadlines" || view === "bench") return { view, selectedId: undefined };
  const selectedId = view === "case" && rest.length > 0 ? decodeURIComponent(rest.join("/")) : undefined;
  return { view: "case", selectedId };
}

export function writeRoute(route: Route): string {
  if (route.view !== "case") return `#${route.view}`;
  return route.selectedId === undefined ? "#" : `#case/${encodeURIComponent(route.selectedId)}`;
}

export function useRoute(): [Route, (next: Route) => void] {
  const [route, setRoute] = useState(() => readRoute(window.location.hash));
  useEffect(() => {
    const onHash = () => setRoute(readRoute(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const go = useCallback((next: Route) => {
    window.location.hash = writeRoute(next);
    setRoute(next);
  }, []);
  return [route, go];
}
