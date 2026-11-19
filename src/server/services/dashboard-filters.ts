import type { Permission } from "../auth/rbac";
import type { DashboardFilters } from "./dashboard-service";

const ID = /^[\w-]{1,40}$/;

export function defaultPeriod(): { from: string; to: string } {
  const now = new Date();
  return { from: `${now.getUTCFullYear()}-01-01`, to: now.toISOString().slice(0, 10) };
}

export function filtersFromSearch(sp: URLSearchParams | Record<string, string | string[] | undefined>): DashboardFilters {
  const get = (k: string) => {
    const v = sp instanceof URLSearchParams ? sp.get(k) : sp[k];
    const s = Array.isArray(v) ? v[0] : v;
    return s && s.length ? s : undefined;
  };
  const def = defaultPeriod();
  const date = (v: string | undefined, fallback: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : fallback);
  const id = (v: string | undefined) => (v && ID.test(v) ? v : undefined);
  return {
    from: date(get("from"), def.from),
    to: date(get("to"), def.to),
    countryCode: get("country")?.match(/^[A-Z]{2}$/) ? get("country") : undefined,
    legalEntityId: id(get("entity")),
    departmentId: id(get("department")),
    costCenterId: id(get("costCenter")),
    categoryId: id(get("category")),
    currency: get("currency")?.match(/^[A-Z]{3}$/) ? get("currency") : undefined,
  };
}

export function permissionForView(view: string | null | undefined): Permission {
  if (view === "team") return "dashboard:team";
  if (view === "executive") return "dashboard:executive";
  return "dashboard:finance";
}
