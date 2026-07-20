export type RoleLevel = 'A' | 'B' | 'C';
export type RAGStatus = 'green' | 'amber' | 'red';

const C_KEYWORDS = [
  'director', 'head of', 'chief', 'vp', 'vice president', 'c-level',
  'ceo', 'coo', 'cto', 'cfo', 'cpo',
];

const B_KEYWORDS = ['manager', 'team lead', 'team leader', 'lead'];

export function detectRoleLevel(title: string): RoleLevel {
  const t = title.toLowerCase();
  if (C_KEYWORDS.some((kw) => t.includes(kw))) return 'C';
  if (B_KEYWORDS.some((kw) => t.includes(kw))) return 'B';
  return 'A';
}

interface SLAThreshold {
  green: number;
  amber: number;
}

const SLA_THRESHOLDS: Record<RoleLevel, SLAThreshold> = {
  C: { green: 35, amber: 45 },
  B: { green: 25, amber: 30 },
  A: { green: 18, amber: 25 },
};

export function computeRAG(level: RoleLevel, daysOpen: number): RAGStatus {
  const t = SLA_THRESHOLDS[level];
  if (daysOpen < t.green) return 'green';
  if (daysOpen < t.amber) return 'amber';
  return 'red';
}

export function getSLALimit(level: RoleLevel): number {
  return SLA_THRESHOLDS[level].amber;
}

export function getDaysOpen(openedDate: Date): number {
  const now = new Date();
  return Math.floor((now.getTime() - new Date(openedDate).getTime()) / (1000 * 60 * 60 * 24));
}
