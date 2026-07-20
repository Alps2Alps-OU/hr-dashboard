import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  const [empCount, activeCount, termCount, inactiveEmployees] = await Promise.all([
    prisma.employee.count(),
    prisma.employee.count({ where: { isActive: true } }),
    prisma.termination.count(),
    // Show inactive employees so we can verify status handling
    prisma.employee.findMany({ where: { isActive: false }, select: { id: true, name: true, department: true } }),
  ]);

  return NextResponse.json({
    db: {
      totalEmployees: empCount,
      activeEmployees: activeCount,
      inactiveEmployees: empCount - activeCount,
      terminations: termCount,
    },
    inactiveList: inactiveEmployees,
    note: '62 in PeopleForce − 4 filtered (Alveda/Ayurveda) = 58 expected in DB. Active should be 58 minus any truly terminated.',
  });
}
