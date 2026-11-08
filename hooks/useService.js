import { useCallback, useEffect, useRef, useState } from "react";
import { messageFor } from "../shared/errors";

/**
 * Small data-loading hook so every page does not repeat loading/error state.
 *
 * `loader` must be a stable function (wrap it in useCallback). Whenever its
 * identity changes — because a filter, search term or page changed — the data
 * is fetched again. Stale responses from an older request are ignored.
 */
export function useService(loader) {
  const mounted = useRef(false);
  const request = useRef(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    const id = request.current + 1;
    request.current = id;
    setLoading(true);
    setError("");

    try {
      const result = await loader();
      if (mounted.current && id === request.current) setData(result);
    } catch (requestError) {
      if (mounted.current && id === request.current) setError(messageFor(requestError));
    } finally {
      if (mounted.current && id === request.current) setLoading(false);
    }
  }, [loader]);

  useEffect(() => {
    mounted.current = true;
    reload();

    return () => {
      mounted.current = false;
      request.current += 1;
    };
  }, [reload]);

  return { data, loading, error, reload, setData };
}
