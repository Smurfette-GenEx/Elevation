import type { Role } from "@prisma/client";

/**
 * Permission matrix. Permissions say WHAT a role may do; the scope engine (scope.ts)
 * says ON WHICH part of the organisation. Note the deliberate segregation of duties:
 * SYSTEM_ADMIN manages users and settings but has no access to financial data.
 */
export const PERMISSIONS = {
  "report:create": ["EMPLOYEE"],
  "team:read": ["LINE_MANAGER", "DEPARTMENT_MANAGER"],
  "department:read": ["DEPARTMENT_MANAGER"],
  "finance:read": ["FINANCE_CONTROLLER", "LOCAL_FINANCE", "GROUP_FINANCE", "CFO"],
  "exception:decide": ["FINANCE_CONTROLLER", "LOCAL_FINANCE", "GROUP_FINANCE"],
  "payment:manage": ["LOCAL_FINANCE"],
  "advance:approve": ["LINE_MANAGER", "LOCAL_FINANCE", "FINANCE_CONTROLLER"],
  "accounting:export": ["LOCAL_FINANCE"],
  "accounting:configure": ["LOCAL_FINANCE", "GROUP_FINANCE"],
  "budget:read": ["DEPARTMENT_MANAGER", "FINANCE_CONTROLLER", "LOCAL_FINANCE", "GROUP_FINANCE", "CFO"],
  "budget:manage": ["FINANCE_CONTROLLER", "GROUP_FINANCE"],
  "dashboard:team": ["LINE_MANAGER", "DEPARTMENT_MANAGER"],
  "dashboard:finance": ["FINANCE_CONTROLLER", "LOCAL_FINANCE", "GROUP_FINANCE", "CFO"],
  "dashboard:executive": ["GROUP_FINANCE", "CFO"],
  "policy:manage": ["GROUP_FINANCE"],
  "workflow:manage": ["GROUP_FINANCE", "SYSTEM_ADMIN"],
  "fx:manage": ["GROUP_FINANCE"],
  "fx:override": ["FINANCE_CONTROLLER", "LOCAL_FINANCE", "GROUP_FINANCE"],
  "user:manage": ["SYSTEM_ADMIN"],
  "org:manage": ["SYSTEM_ADMIN"],
  "audit:read": ["SYSTEM_ADMIN", "GROUP_FINANCE", "CFO"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function rolesFor(permission: Permission): readonly Role[] {
  return PERMISSIONS[permission];
}

export const ROLE_LABELS: Record<Role, string> = {
  EMPLOYEE: "Employee",
  LINE_MANAGER: "Line Manager",
  DEPARTMENT_MANAGER: "Department Manager",
  FINANCE_CONTROLLER: "Finance Controller",
  LOCAL_FINANCE: "Local Finance",
  GROUP_FINANCE: "Group Finance",
  CFO: "CFO / Finance Director",
  SYSTEM_ADMIN: "System Administrator",
};
