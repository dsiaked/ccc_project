import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.106.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_REQUEST_TIMEOUT_MS = 15_000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

type BoardingStatus = 'unchecked' | 'boarded' | 'no_show';

interface BoardingBus {
  label: string;
  destination: string;
  departureTime: string;
  boardingPlace: string;
  departedAt?: string | null;
}

interface BoardingPassenger {
  name: string;
  phone: string;
  district: string;
  team: string;
  campus: string;
  busNumber: string;
  seatNumber: string;
  boardingStatus: BoardingStatus;
  boardingNote?: string | null;
}

interface BoardingSnapshot {
  allocationName: string;
  buses: BoardingBus[];
  passengers: BoardingPassenger[];
}

interface AllocationRow {
  id: string;
  allocation_name: string;
  allocation_data: {
    status?: string;
    buses?: Array<BoardingBus & { id: string }>;
  };
}

interface ReservationRow {
  name: string;
  phone: string;
  district: string;
  team: string;
  campus: string;
  confirmed_ticket: {
    busNumber?: string;
    seatNumber?: string;
  };
  boarding_status: BoardingStatus;
  boarding_note?: string | null;
}

interface SheetProperties {
  sheetId: number;
  title: string;
  gridProperties?: {
    rowCount?: number;
    columnCount?: number;
  };
}

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

const statusLabels: Record<BoardingStatus, string> = {
  unchecked: '확인 대기',
  boarded: '탑승',
  no_show: '미탑승',
};

const columnWidths = [70, 82, 90, 130, 100, 90, 120, 140, 150, 180, 100, 260];

const colors = {
  white: { red: 1, green: 1, blue: 1 },
  header: { red: 0.09, green: 0.15, blue: 0.33 },
  unchecked: { red: 1, green: 0.95, blue: 0.72 },
  departedUnchecked: { red: 1, green: 0.82, blue: 0.61 },
  noShow: { red: 1, green: 0.8, blue: 0.8 },
  note: { red: 0.84, green: 0.91, blue: 1 },
};

const base64Url = (value: Uint8Array | string) => {
  const bytes =
    typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
};

const importPrivateKey = async (pem: string) => {
  const encoded = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replaceAll(/\s/g, '');
  const binary = Uint8Array.from(atob(encoded), (character) =>
    character.charCodeAt(0)
  );
  return crypto.subtle.importKey(
    'pkcs8',
    binary,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
};

const getGoogleAccessToken = async (serviceAccountJson: string) => {
  const serviceAccount = JSON.parse(serviceAccountJson) as {
    client_email?: string;
    private_key?: string;
  };
  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error('Google 서비스 계정 비밀키가 올바르지 않습니다.');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${claims}`;
  const key = await importPrivateKey(serviceAccount.private_key);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned),
  );
  const assertion = `${unsigned}.${base64Url(new Uint8Array(signature))}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    signal: AbortSignal.timeout(GOOGLE_REQUEST_TIMEOUT_MS),
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const body = await response.json() as {
    access_token?: string;
    error_description?: string;
  };
  if (!response.ok || !body.access_token) {
    throw new Error(
      body.error_description || 'Google 인증 토큰을 발급받지 못했습니다.',
    );
  }
  return body.access_token;
};

const googleRequest = async (
  accessToken: string,
  url: string,
  init?: RequestInit,
) => {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(GOOGLE_REQUEST_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof body?.error?.message === 'string'
        ? body.error.message
        : 'Google Sheets API 요청에 실패했습니다.';
    throw new Error(message);
  }
  return body;
};

const formatBusLabel = (value: string) => {
  const label = value.trim();
  const legacy = label.match(/^(?:bus[\s_-]*)?(\d+)(?:[\s_-]*bus)?$/i);
  return legacy ? `${Number(legacy[1])}호차` : label;
};

const uniqueSheetTitle = (value: string, used: Set<string>) => {
  const base = value.replace(/[\\/?*[\]:]/g, '_').trim().slice(0, 90) || '명단';
  let title = base;
  let suffix = 2;
  while (used.has(title)) {
    title = `${base.slice(0, 90)} (${suffix})`;
    suffix += 1;
  }
  used.add(title);
  return title;
};

const quoteSheetTitle = (title: string) => `'${title.replaceAll("'", "''")}'`;

const sortPassengers = (passengers: BoardingPassenger[]) =>
  [...passengers].sort(
    (a, b) =>
      a.busNumber.localeCompare(b.busNumber, 'ko', { numeric: true }) ||
      a.seatNumber.localeCompare(b.seatNumber, 'ko', { numeric: true }) ||
      a.campus.localeCompare(b.campus, 'ko') ||
      a.name.localeCompare(b.name, 'ko'),
  );

const passengerRow = (
  passenger: BoardingPassenger,
  busesByLabel: Map<string, BoardingBus>,
) => {
  const bus = busesByLabel.get(passenger.busNumber);
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

const rowColor = (
  passenger: BoardingPassenger,
  busesByLabel: Map<string, BoardingBus>,
) => {
  if (passenger.boardingStatus === 'no_show') return colors.noShow;
  if (
    passenger.boardingStatus === 'unchecked' &&
    busesByLabel.get(passenger.busNumber)?.departedAt
  ) {
    return colors.departedUnchecked;
  }
  if (passenger.boardingStatus === 'unchecked') return colors.unchecked;
  if (passenger.boardingNote?.trim()) return colors.note;
  return null;
};

const getServiceRoleSnapshot = async (
  serviceClient: ReturnType<typeof createClient>,
) => {
  const { data: allocation, error: allocationError } = await serviceClient
    .from('bus_allocations')
    .select('id, allocation_name, allocation_data')
    .eq('allocation_data->>status', 'confirmed')
    .limit(1)
    .maybeSingle();
  if (allocationError) throw allocationError;
  if (!allocation) return null;

  const allocationRow = allocation as AllocationRow;
  const { data: reservations, error: reservationError } = await serviceClient
    .from('reservations')
    .select(
      'name, phone, district, team, campus, confirmed_ticket, boarding_status, boarding_note',
    )
    .eq('status', 'confirmed')
    .not('confirmed_ticket', 'is', null);
  if (reservationError) throw reservationError;

  const { data: departures, error: departureError } = await serviceClient
    .from('boarding_bus_departures')
    .select('bus_id, departed_at')
    .eq('allocation_id', allocationRow.id)
    .is('cancelled_at', null);
  if (departureError) throw departureError;

  const departedAtByBusId = new Map(
    (departures ?? []).map((departure) => [
      String(departure.bus_id),
      departure.departed_at as string | null,
    ]),
  );

  return {
    allocationName: allocationRow.allocation_name,
    buses: (allocationRow.allocation_data.buses ?? []).map((bus) => ({
      ...bus,
      departedAt: departedAtByBusId.get(bus.id) ?? null,
    })),
    passengers: ((reservations ?? []) as ReservationRow[]).map((reservation) => ({
      name: reservation.name,
      phone: reservation.phone,
      district: reservation.district,
      team: reservation.team,
      campus: reservation.campus,
      busNumber: reservation.confirmed_ticket.busNumber ?? '',
      seatNumber: reservation.confirmed_ticket.seatNumber ?? '',
      boardingStatus: reservation.boarding_status,
      boardingNote: reservation.boarding_note ?? null,
    })),
  } satisfies BoardingSnapshot;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return json({ error: 'POST 요청만 지원합니다.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const serviceAccountJson =
    Deno.env.get('GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON') ?? '';
  const spreadsheetId = Deno.env.get('BOARDING_ROSTER_SPREADSHEET_ID') ?? '';
  const authorization = request.headers.get('Authorization') ?? '';
  const isServiceRoleRequest = authorization === `Bearer ${serviceRoleKey}`;

  if (
    !supabaseUrl ||
    !anonKey ||
    !serviceRoleKey ||
    !serviceAccountJson ||
    !spreadsheetId ||
    !authorization
  ) {
    return json(
      { error: 'Google Sheet 동기화 서버 설정이 완료되지 않았습니다.' },
      500,
    );
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  if (!isServiceRoleRequest) {
    const {
      data: { user: actor },
      error: actorError,
    } = await userClient.auth.getUser();
    if (actorError || !actor) {
      return json({ error: '로그인이 필요합니다.' }, 401);
    }

    const { count: globalAdminCount, error: roleError } = await serviceClient
      .from('admin_roles')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', actor.id)
      .eq('role', 'global_admin');
    if (roleError || !globalAdminCount) {
      return json({ error: '전체 관리자만 Google Sheet를 동기화할 수 있습니다.' }, 403);
    }
  }

  let snapshot: BoardingSnapshot | null;
  if (isServiceRoleRequest) {
    try {
      snapshot = await getServiceRoleSnapshot(serviceClient);
    } catch (snapshotError) {
      console.error('Failed to load the boarding snapshot:', snapshotError);
      return json({ error: '확정 배차 명단을 불러오지 못했습니다.' }, 500);
    }
  } else {
    const { data, error: snapshotError } = await userClient.rpc(
      'get_boarding_management_snapshot',
    );
    if (snapshotError) {
      console.error('Failed to load the boarding snapshot:', snapshotError);
      return json({ error: '확정 배차 명단을 불러오지 못했습니다.' }, 500);
    }
    snapshot = data as BoardingSnapshot | null;
  }
  if (!snapshot) {
    return json({ error: '동기화할 확정 배차 명단이 없습니다.' }, 409);
  }

  const sortedPassengers = sortPassengers(snapshot.passengers);
  const busesByLabel = new Map(snapshot.buses.map((bus) => [bus.label, bus]));
  const usedTitles = new Set<string>();
  const tabData = [
    {
      title: uniqueSheetTitle('전체 명단', usedTitles),
      passengers: sortedPassengers,
    },
    ...snapshot.buses.map((bus) => ({
      title: uniqueSheetTitle(formatBusLabel(bus.label), usedTitles),
      passengers: sortedPassengers.filter(
        (passenger) => passenger.busNumber === bus.label,
      ),
    })),
  ];

  try {
    const accessToken = await getGoogleAccessToken(serviceAccountJson);
    const baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
    const metadata = await googleRequest(
      accessToken,
      `${baseUrl}?fields=sheets.properties`,
    ) as { sheets?: Array<{ properties: SheetProperties }> };
    const existing = new Map(
      (metadata.sheets ?? []).map(({ properties }) => [properties.title, properties]),
    );
    const missing = tabData.filter(({ title }) => !existing.has(title));

    if (missing.length) {
      await googleRequest(accessToken, `${baseUrl}:batchUpdate`, {
        method: 'POST',
        body: JSON.stringify({
          requests: missing.map(({ title }) => ({
            addSheet: {
              properties: {
                title,
                gridProperties: { rowCount: 1000, columnCount: headers.length },
              },
            },
          })),
        }),
      });
    }

    const refreshed = await googleRequest(
      accessToken,
      `${baseUrl}?fields=sheets.properties`,
    ) as { sheets?: Array<{ properties: SheetProperties }> };
    const propertiesByTitle = new Map(
      (refreshed.sheets ?? []).map(({ properties }) => [properties.title, properties]),
    );

    await googleRequest(
      accessToken,
      `${baseUrl}/values:batchUpdate`,
      {
        method: 'POST',
        body: JSON.stringify({
          valueInputOption: 'RAW',
          data: tabData.map(({ title, passengers }) => ({
            range: `${quoteSheetTitle(title)}!A1`,
            majorDimension: 'ROWS',
            values: [
              headers,
              ...passengers.map((passenger) => passengerRow(passenger, busesByLabel)),
            ],
          })),
        }),
      },
    );

    const staleRanges = tabData.flatMap(({ title, passengers }) => {
      const properties = propertiesByTitle.get(title);
      const rowCount = properties?.gridProperties?.rowCount ?? 0;
      const firstStaleRow = passengers.length + 2;
      return firstStaleRow <= rowCount
        ? [`${quoteSheetTitle(title)}!A${firstStaleRow}:L${rowCount}`]
        : [];
    });
    if (staleRanges.length) {
      await googleRequest(accessToken, `${baseUrl}/values:batchClear`, {
        method: 'POST',
        body: JSON.stringify({ ranges: staleRanges }),
      });
    }

    const formatRequests: Record<string, unknown>[] = [];
    tabData.forEach(({ title, passengers }) => {
      const properties = propertiesByTitle.get(title);
      if (!properties) return;
      const sheetId = properties.sheetId;
      const requiredRows = Math.max(passengers.length + 1, 2);
      if ((properties.gridProperties?.rowCount ?? 0) < requiredRows) {
        formatRequests.push({
          updateSheetProperties: {
            properties: {
              sheetId,
              gridProperties: { rowCount: requiredRows },
            },
            fields: 'gridProperties.rowCount',
          },
        });
      }
      formatRequests.push(
        {
          updateSheetProperties: {
            properties: {
              sheetId,
              gridProperties: { frozenRowCount: 1 },
            },
            fields: 'gridProperties.frozenRowCount',
          },
        },
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 0,
              endRowIndex: requiredRows,
              startColumnIndex: 0,
              endColumnIndex: headers.length,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: colors.white,
                verticalAlignment: 'MIDDLE',
                wrapStrategy: 'WRAP',
                textFormat: { foregroundColor: { red: 0.1, green: 0.15, blue: 0.25 } },
              },
            },
            fields:
              'userEnteredFormat.backgroundColor,userEnteredFormat.verticalAlignment,userEnteredFormat.wrapStrategy,userEnteredFormat.textFormat.foregroundColor',
          },
        },
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: headers.length,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: colors.header,
                horizontalAlignment: 'CENTER',
                textFormat: {
                  bold: true,
                  foregroundColor: colors.white,
                },
              },
            },
            fields: 'userEnteredFormat',
          },
        },
        {
          setBasicFilter: {
            filter: {
              range: {
                sheetId,
                startRowIndex: 0,
                endRowIndex: requiredRows,
                startColumnIndex: 0,
                endColumnIndex: headers.length,
              },
            },
          },
        },
        ...columnWidths.map((pixelSize, columnIndex) => ({
          updateDimensionProperties: {
            range: {
              sheetId,
              dimension: 'COLUMNS',
              startIndex: columnIndex,
              endIndex: columnIndex + 1,
            },
            properties: { pixelSize },
            fields: 'pixelSize',
          },
        })),
        {
          autoResizeDimensions: {
            dimensions: {
              sheetId,
              dimension: 'ROWS',
              startIndex: 0,
              endIndex: requiredRows,
            },
          },
        },
      );

      passengers.forEach((passenger, index) => {
        const backgroundColor = rowColor(passenger, busesByLabel);
        if (!backgroundColor) return;
        formatRequests.push({
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: index + 1,
              endRowIndex: index + 2,
              startColumnIndex: 0,
              endColumnIndex: headers.length,
            },
            cell: { userEnteredFormat: { backgroundColor } },
            fields: 'userEnteredFormat.backgroundColor',
          },
        });
      });
    });

    for (let index = 0; index < formatRequests.length; index += 500) {
      await googleRequest(accessToken, `${baseUrl}:batchUpdate`, {
        method: 'POST',
        body: JSON.stringify({ requests: formatRequests.slice(index, index + 500) }),
      });
    }

    const syncedAt = new Date().toISOString();
    return json({
      spreadsheetId,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
      allocationName: snapshot.allocationName,
      passengerCount: snapshot.passengers.length,
      busCount: snapshot.buses.length,
      syncedAt,
    });
  } catch (syncError) {
    console.error('Failed to sync the boarding roster to Google Sheets:', syncError);
    return json({ error: 'Google Sheet 동기화에 실패했습니다.' }, 500);
  }
});
