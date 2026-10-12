"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { queryWithValues } from "@/lib/query-state";

type QueryStateOptions<T extends string> = {
  /**
   * Used when the URL has no value, or the value fails `validate`. Setting this value removes
   * the key from the URL, so the address stays short.
   */
  default: T;
  validate?: (value: string) => boolean;
};

/**
 * Sets several URL keys in one navigation. Setting keys one after another would overwrite the
 * first change, because each write starts from the same search params. A null value removes the key.
 */
export function useQueryUpdate(): (updates: Record<string, string | null>) => void {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return useCallback(
    (updates: Record<string, string | null>) => {
      const query = queryWithValues(searchParams.toString(), updates);
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );
}

/**
 * A page value kept in the URL, so reloads and shared links restore it. Writes use
 * router.replace, so changing a tab or a date does not add a history entry. A component that
 * calls this must render inside a Suspense boundary, which Next requires for useSearchParams.
 */
export function useQueryState<T extends string>(
  key: string,
  { default: fallback, validate }: QueryStateOptions<T>
): [T, (next: T) => void] {
  const searchParams = useSearchParams();
  const update = useQueryUpdate();

  const raw = searchParams.get(key);
  const value = (raw !== null && (!validate || validate(raw)) ? raw : fallback) as T;

  const setValue = useCallback(
    (next: T) => update({ [key]: next === fallback ? null : next }),
    [fallback, key, update]
  );

  return [value, setValue];
}
