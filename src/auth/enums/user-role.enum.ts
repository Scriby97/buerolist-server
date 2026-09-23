export enum UserRole {
  ADMINISTRATOR = 'administrator', // System-wide admin - can see all organizations
  USER = 'user', // Normal user - access controlled by organization_members table
}

export enum OrganizationRole {
  EMPLOYEE = 'employee', // Read-only access to organization
  ADMIN = 'admin', // Can manage organization (except delete)
  OWNER = 'owner', // Full access (can delete organization)
}
