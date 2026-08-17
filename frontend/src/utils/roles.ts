// Single source of truth for staff role display labels — shared by
// Layout.tsx (sidebar), Profile.tsx (own profile), and Employees.tsx
// (managing others), so the three tiers read the same way everywhere.
export const ROLE_LABELS: Record<string, string> = {
  hr: 'İK',
  hr_manager: 'İnsan Kaynakları Müdürü',
  admin: 'Sistem Yöneticisi',
}
