import ExcelJS from 'exceljs';

// sheets: [{ name, columns: [[header, key, width]], rows: [{...}] }]
export async function sendWorkbook(res, filename, sheets) {
  const wb = new ExcelJS.Workbook();
  wb.creator = process.env.APP_NAME || 'Nashmi Studio';
  wb.created = new Date();

  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name, { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
    ws.columns = sheet.columns.map(([header, key, width]) => ({ header, key, width: width || 16 }));
    ws.addRows(sheet.rows);

    const head = ws.getRow(1);
    head.height = 24;
    head.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Arial' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    ws.eachRow((row, i) => {
      if (i === 1) return;
      row.alignment = { vertical: 'middle', horizontal: 'right' };
      if (i % 2 === 0) row.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF6F3EC' } }; });
    });
    if (sheet.rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
}
