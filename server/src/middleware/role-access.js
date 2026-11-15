export function hasRoleAccess(user, roles) { return Boolean(user && Array.isArray(roles) && roles.includes(user.role)); }
