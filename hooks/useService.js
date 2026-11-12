import { useCallback, useEffect, useRef, useState } from "react";
import { messageFor } from "../shared/errors";
import { subscribeLive } from "../utils/live";

/**
 * Small data-loading hook so every page does not repeat loading/error state.
 *
 * `loader` must be a stable function (wrap it in useCallback). Whenever its
 * identity changes — because a filter, search term or page changed — the data
 * is fetched again. Stale responses from an older request are ignored.
 *
 * With `live` (the default) the hook also listens to the app-wide update bus,
 * so an officer's status change refreshes a citizen's open complaint page
 * without a manual reload. Live refreshes are silent: no loading flash.
 */
export function useService(loader, { live = true } = {}) {
  const mounted = useRef(false);
  const request = useRef(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const run = useCallback(
    async (silent) => {
      const id = request.current + 1;
      request.current = id;

      if (!silent) {
        setLoading(true);
        setError("");
      }

      try {
        const result = await loader();
        if (mounted.current && id === request.current) {
          setData(result);
          setError("");
        }
      } catch (requestError) {
        if (mounted.current && id === request.current) setError(messageFor(requestError));
      } finally {
        if (mounted.current && id === request.current) setLoading(false);
      }
    },
    [loader]
  );

  const reload = useCallback(async () => run(false), [run]);
  const refresh = useCallback(async () => run(true), [run]);

  useEffect(() => {
    mounted.current = true;
    reload();

    return () => {
      mounted.current = false;
      request.current += 1;
    };
  }, [reload]);

  // Keep the newest refresh callback in a ref so subscribing once is enough.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!live) return undefined;

    let timer = null;
    const unsubscribe = subscribeLive(() => {
      // Coalesce bursts (a routed complaint writes several records at once).
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        refreshRef.current();
      }, 180);
    });

    return () => {
      if (timer) window.clearTimeout(timer);
      unsubscribe();
    };
  }, [live]);

  return { data, loading, error, reload, refresh, setData };
}
