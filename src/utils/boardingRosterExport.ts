import type {
  BoardingBus,
  BoardingPassenger,
  BoardingSnapshot,
  BoardingStatus,
} from '../lib/admin/boardingManagementService';
import { formatBusLabel } from './busLabel';

const statusLabels: Record<BoardingStatus, string> = {
  unchecked: '탑승 미확인',
  boarded: '탑승 확인',
  no_show: '미탑승',
};

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const rosterFileName = (allocationName: string, extension: string) => {
  const date = new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date())
    .replaceAll('. ', '-')
    .replace('.', '');
  const safeName = allocationName.replace(/[\\/:*?"<>|]/g, '_').trim();
  return `${safeName || '확정_배차'}_전체_탑승_명단_${date}.${extension}`;
};

const sortPassengers = (passengers: BoardingPassenger[]) =>
  [...passengers].sort(
    (a, b) =>
      a.busNumber.localeCompare(b.busNumber, 'ko', { numeric: true }) ||
      a.seatNumber.localeCompare(b.seatNumber, 'ko', { numeric: true }) ||
      a.campus.localeCompare(b.campus, 'ko') ||
      a.name.localeCompare(b.name, 'ko')
  );

const getBus = (buses: BoardingBus[], busNumber: string) =>
  buses.find((bus) => bus.label === busNumber);

const getCounts = (passengers: BoardingPassenger[]) =>
  passengers.reduce(
    (counts, passenger) => {
      counts.total += 1;
      counts[passenger.boardingStatus] += 1;
      return counts;
    },
    { total: 0, unchecked: 0, boarded: 0, no_show: 0 }
  );

const passengerCells = (passenger: BoardingPassenger, buses: BoardingBus[]) => {
  const bus = getBus(buses, passenger.busNumber);
  return [
    formatBusLabel(passenger.busNumber),
    passenger.seatNumber || '',
    passenger.name,
    passenger.phone,
    passenger.district,
    passenger.team,
    passenger.campus,
    bus?.destination ?? '',
    bus?.departureTime ?? '',
    bus?.boardingPlace ?? '',
    statusLabels[passenger.boardingStatus],
    passenger.boardingNote ?? '',
  ];
};

const getPassengerHighlightClass = (
  passenger: BoardingPassenger,
  buses: BoardingBus[]
) => {
  if (passenger.boardingStatus === 'no_show') return 'exception-no-show';
  if (
    passenger.boardingStatus === 'unchecked' &&
    getBus(buses, passenger.busNumber)?.departedAt
  ) {
    return 'exception-departed-unchecked';
  }
  if (passenger.boardingStatus === 'unchecked') return 'exception-unchecked';
  if (passenger.boardingNote?.trim()) return 'exception-note';
  return '';
};

const exceptionLegend = `
  <div class="legend">
    <span class="exception-unchecked">탑승 미확인</span>
    <span class="exception-departed-unchecked">출발 후 탑승 미확인</span>
    <span class="exception-no-show">미탑승</span>
    <span class="exception-note">비고 있음</span>
  </div>`;

const excelStyleIds: Record<string, string> = {
  '': 'Default',
  'exception-unchecked': 'Unchecked',
  'exception-departed-unchecked': 'DepartedUnchecked',
  'exception-no-show': 'NoShow',
  'exception-note': 'Note',
};

const headers = [
  '호차',
  '명단 번호',
  '이름',
  '연락처',
  '대지역',
  '팀',
  '캠퍼스',
  '행선지',
  '출발 일시',
  '탑승장소',
  '탑승 상태',
  '비고',
];

const PDF_ROWS_PER_PAGE = 38;

const chunkPassengersForPdf = (passengers: BoardingPassenger[]) => {
  if (passengers.length === 0) return [[]];

  return Array.from(
    { length: Math.ceil(passengers.length / PDF_ROWS_PER_PAGE) },
    (_, pageIndex) =>
      passengers.slice(
        pageIndex * PDF_ROWS_PER_PAGE,
        (pageIndex + 1) * PDF_ROWS_PER_PAGE
      )
  );
};

const getUniqueWorksheetName = (name: string, usedNames: Set<string>) => {
  const baseName = name.replace(/[\\/?*[\]:]/g, '_').trim().slice(0, 31) || '명단';
  let worksheetName = baseName;
  let suffix = 2;

  while (usedNames.has(worksheetName)) {
    const suffixText = ` (${suffix})`;
    worksheetName = `${baseName.slice(0, 31 - suffixText.length)}${suffixText}`;
    suffix += 1;
  }
  usedNames.add(worksheetName);
  return worksheetName;
};

const excelCell = (value: unknown, styleId?: string) =>
  `<Cell${styleId ? ` ss:StyleID="${styleId}"` : ''}><Data ss:Type="String">${escapeHtml(value)}</Data></Cell>`;

const excelWorksheet = (
  name: string,
  passengers: BoardingPassenger[],
  buses: BoardingBus[]
) => `
  <Worksheet ss:Name="${escapeHtml(name)}">
    <Table>
      ${[48, 52, 60, 92, 68, 68, 78, 84, 70, 100, 74, 180]
        .map((width) => `<Column ss:Width="${width}"/>`)
        .join('')}
      <Row>${headers.map((header) => excelCell(header, 'Header')).join('')}</Row>
      ${passengers
        .map((passenger) => {
          const styleId = excelStyleIds[getPassengerHighlightClass(passenger, buses)];
          return `<Row>${passengerCells(passenger, buses)
            .map((cell) => excelCell(cell, styleId))
            .join('')}</Row>`;
        })
        .join('')}
    </Table>
    <AutoFilter x:Range="R1C1:R${passengers.length + 1}C${headers.length}" xmlns="urn:schemas-microsoft-com:office:excel"/>
    <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
      <FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane>
    </WorksheetOptions>
  </Worksheet>`;

export const downloadFullBoardingRosterExcel = (snapshot: BoardingSnapshot) => {
  const sortedPassengers = sortPassengers(snapshot.passengers);
  const usedNames = new Set<string>();
  const worksheets = [
    excelWorksheet(
      getUniqueWorksheetName('전체 명단', usedNames),
      sortedPassengers,
      snapshot.buses
    ),
    ...snapshot.buses.map((bus) =>
      excelWorksheet(
        getUniqueWorksheetName(formatBusLabel(bus.label), usedNames),
        sortedPassengers.filter((passenger) => passenger.busNumber === bus.label),
        snapshot.buses
      )
    ),
  ];
  const workbook = `<?xml version="1.0" encoding="UTF-8"?>
    <?mso-application progid="Excel.Sheet"?>
    <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
      xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
      <Styles>
        <Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Font ss:FontName="맑은 고딕" ss:Size="10"/></Style>
        <Style ss:ID="Header"><Alignment ss:Vertical="Center"/><Font ss:FontName="맑은 고딕" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#334155" ss:Pattern="Solid"/></Style>
        <Style ss:ID="Unchecked"><Font ss:FontName="맑은 고딕" ss:Size="10" ss:Color="#78350F"/><Interior ss:Color="#FEF3C7" ss:Pattern="Solid"/></Style>
        <Style ss:ID="DepartedUnchecked"><Font ss:FontName="맑은 고딕" ss:Size="10" ss:Bold="1" ss:Color="#9A3412"/><Interior ss:Color="#FED7AA" ss:Pattern="Solid"/></Style>
        <Style ss:ID="NoShow"><Font ss:FontName="맑은 고딕" ss:Size="10" ss:Bold="1" ss:Color="#991B1B"/><Interior ss:Color="#FECACA" ss:Pattern="Solid"/></Style>
        <Style ss:ID="Note"><Font ss:FontName="맑은 고딕" ss:Size="10" ss:Color="#1E3A8A"/><Interior ss:Color="#DBEAFE" ss:Pattern="Solid"/></Style>
      </Styles>
      ${worksheets.join('')}
    </Workbook>`;
  const blob = new Blob(['\uFEFF', workbook], {
    type: 'application/vnd.ms-excel',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = rosterFileName(snapshot.allocationName, 'xls');
  link.click();
  URL.revokeObjectURL(url);
};

export const printFullBoardingRosterPdf = (snapshot: BoardingSnapshot) => {
  const printWindow = window.open('', '_blank', 'width=1200,height=800');
  if (!printWindow) {
    throw new Error('PDF 창을 열지 못했습니다. 브라우저 팝업 차단을 해제해주세요.');
  }
  printWindow.opener = null;

  const sections = snapshot.buses.flatMap((bus) => {
    const passengers = sortPassengers(
      snapshot.passengers.filter((passenger) => passenger.busNumber === bus.label)
    );
    const counts = getCounts(passengers);
    const passengerPages = chunkPassengersForPdf(passengers);

    return passengerPages.map(
      (pagePassengers, pageIndex) => `
      <section class="a4-page">
        <div class="bus-header">
          <div>
            <p class="allocation-name">${escapeHtml(snapshot.allocationName)} 전체 탑승 명단</p>
            <h2>${escapeHtml(formatBusLabel(bus.label))} · ${escapeHtml(bus.destination)}</h2>
            <p>${escapeHtml(bus.departureTime)} · ${escapeHtml(bus.boardingPlace)}</p>
          </div>
          <p class="counts">총 ${counts.total}명 · 탑승 확인 ${counts.boarded} · 탑승 미확인 ${counts.unchecked} · 미탑승 ${counts.no_show}</p>
        </div>
        <p class="page-count">${pageIndex + 1} / ${passengerPages.length}</p>
        ${exceptionLegend}
        <table>
          <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>
          <tbody>${pagePassengers
            .map(
              (passenger) =>
                `<tr class="${getPassengerHighlightClass(passenger, snapshot.buses)}">${passengerCells(passenger, snapshot.buses)
                  .map((cell) => `<td>${escapeHtml(cell)}</td>`)
                  .join('')}</tr>`
            )
            .join('')}</tbody>
        </table>
      </section>`
    );
  });

  printWindow.document.write(`<!doctype html>
    <html lang="ko">
      <head>
        <meta charset="utf-8">
        <title>${escapeHtml(rosterFileName(snapshot.allocationName, 'pdf'))}</title>
        <style>
          @page { size: A4 landscape; margin: 8mm; }
          * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          html, body { margin: 0; padding: 0; }
          body { color: #172554; font-family: Arial, "Malgun Gothic", sans-serif; }
          .a4-page { width: 281mm; height: 194mm; overflow: hidden; break-after: page; page-break-after: always; }
          .a4-page:last-child { break-after: auto; page-break-after: auto; }
          .bus-header { display: flex; align-items: end; justify-content: space-between; gap: 12px; margin: 0 0 6px; border-bottom: 2px solid #172554; }
          .bus-header p { margin: 0 0 5px; color: #475569; font-size: 9px; }
          .bus-header .allocation-name { margin-bottom: 2px; color: #1d4ed8; font-size: 8px; font-weight: 700; }
          h2 { margin: 0 0 2px; font-size: 14px; }
          .counts { font-weight: 700; text-align: right; }
          .page-count { margin: -3px 0 3px; color: #64748b; font-size: 7px; font-weight: 700; text-align: right; }
          .legend { display: flex; gap: 4px; margin: 0 0 4px; font-size: 7px; }
          .legend span { padding: 2px 4px; border: 1px solid rgba(15, 23, 42, .15); border-radius: 3px; font-weight: 700; }
          table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 7.5px; line-height: 1.08; }
          thead { display: table-header-group; }
          tr { break-inside: avoid; page-break-inside: avoid; }
          th, td { height: 3.8mm; overflow: hidden; padding: 1.5px 2px; border: 1px solid #cbd5e1; text-align: left; text-overflow: ellipsis; vertical-align: middle; white-space: nowrap; }
          th { background: #e2e8f0; }
          th:nth-child(1), td:nth-child(1) { width: 5%; }
          th:nth-child(2), td:nth-child(2) { width: 5%; }
          th:nth-child(3), td:nth-child(3) { width: 6%; }
          th:nth-child(4), td:nth-child(4) { width: 9%; }
          th:nth-child(5), td:nth-child(5) { width: 7%; }
          th:nth-child(6), td:nth-child(6) { width: 7%; }
          th:nth-child(7), td:nth-child(7) { width: 8%; }
          th:nth-child(8), td:nth-child(8) { width: 9%; }
          th:nth-child(9), td:nth-child(9) { width: 7%; }
          th:nth-child(10), td:nth-child(10) { width: 10%; }
          th:nth-child(11), td:nth-child(11) { width: 7%; }
          th:nth-child(12), td:nth-child(12) { width: 20%; }
          tr.exception-unchecked td, .legend .exception-unchecked { background: #fef3c7; color: #78350f; }
          tr.exception-departed-unchecked td, .legend .exception-departed-unchecked { background: #fed7aa; color: #9a3412; font-weight: 700; }
          tr.exception-no-show td, .legend .exception-no-show { background: #fecaca; color: #991b1b; font-weight: 700; }
          tr.exception-note td, .legend .exception-note { background: #dbeafe; color: #1e3a8a; }
          @media screen {
            body { padding: 12px; background: #e2e8f0; }
            .a4-page { margin: 0 auto 12px; background: white; box-shadow: 0 2px 12px rgba(15, 23, 42, .18); }
          }
        </style>
      </head>
      <body>
        ${sections.join('')}
      </body>
    </html>`);
  printWindow.document.close();
  printWindow.focus();
  printWindow.setTimeout(() => printWindow.print(), 250);
};
