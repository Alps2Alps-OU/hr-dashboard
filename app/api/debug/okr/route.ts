import { NextResponse } from 'next/server';
import { readOkrSheet, parseOkrLatestWeek, parseOkrAllWeeks } from '@/lib/sheets';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const raw = await readOkrSheet();

    // Find week header rows
    const headers: Array<{ rowIdx: number; cell: string }> = [];
    for (let i = 0; i < raw.length; i++) {
      const cell = raw[i]?.[0] ?? '';
      if (/^\d{1,2}\/\d{1,2}\/\d{4}[-–]/.test(cell.trim())) {
        headers.push({ rowIdx: i, cell: cell.split('\n')[0].trim() });
      }
    }

    // Get the last week block raw rows (for inspection)
    const lastHeaderIdx = headers.at(-1)?.rowIdx ?? 0;
    const rawLastWeekRows = raw.slice(lastHeaderIdx, lastHeaderIdx + 30).map((row, i) => ({
      rowNum: lastHeaderIdx + i + 1,
      col0: row[0] ?? '',
      col1: row[1] ?? '',
      col2: row[2] ?? '',
      col3: row[3] ?? '',
      col4: row[4] ?? '',
      col5: row[5] ?? '',
    }));

    const currentWeek = parseOkrLatestWeek(raw);
    const allWeeks = parseOkrAllWeeks(raw);

    return NextResponse.json({
      totalRows: raw.length,
      weekHeaders: headers,
      rawLastWeekRows,
      currentWeekParsed: currentWeek,
      allWeeksSummary: allWeeks.map((w) => ({
        weekRange: w.weekRange,
        totalDeclared: w.totalDeclared,
        vacancyCount: w.vacancies.length,
        statuses: w.vacancies.map((v) => ({ pos: v.position, raw: v.rawStatus, group: v.statusGroup })),
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
