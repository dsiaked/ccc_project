/* eslint-disable react-hooks/preserve-manual-memoization */
import {
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AdminHeader from './AdminHeader';
import { supabase } from '../../lib/supabase';
import {
  getParticipationTargetsSetting,
  updateParticipationTargetsSetting,
  type ParticipationTargetsSetting,
} from '../../lib/participationTargetsService';
import styles from './AdminParticipationTargetsPage.module.css';

interface CampusTargetRow {
  rowId?: string;
  key: string;
  district: string;
  team: string;
  campus: string;
}

interface CampusOptionRow {
  district: string | null;
  team: string | null;
  campus: string | null;
}

type CampusTargetField = 'district' | 'team' | 'campus';
type SpreadsheetColumn = CampusTargetField | 'target';

type ColumnFilters = Record<SpreadsheetColumn, string[]>;

interface CellSelection {
  anchorRow: number;
  anchorColumn: number;
  focusRow: number;
  focusColumn: number;
}

interface ParticipationSnapshot {
  campuses: CampusTargetRow[];
  participationTargets: Record<string, number>;
}

type SaveStatus = 'saving' | 'saved' | 'error';
type RowDeletionMode = 'selected' | 'filtered';

const SPREADSHEET_COLUMNS: SpreadsheetColumn[] = [
  'district',
  'team',
  'campus',
  'target',
];
const SPREADSHEET_COLUMN_LABELS: Record<SpreadsheetColumn, string> = {
  district: '지구',
  team: '팀',
  campus: '캠퍼스',
  target: '참여 인원',
};

const getCampusKey = (district: string, team: string, campus: string) =>
  `campus|${district}|${team}|${campus}`;

const normalizeCampusRows = (rows: CampusTargetRow[]) =>
  rows.map((row, index, array) => {
      const district = row.district.trim();
      const team = row.team.trim();
      const campus = row.campus.trim();
      const baseKey = getCampusKey(district, team, campus);
      const duplicateIndex = array
        .slice(0, index)
        .filter(
          (target) =>
            target.district.trim() === district &&
            target.team.trim() === team &&
            target.campus.trim() === campus
        ).length;

      return {
        rowId: row.rowId || `${baseKey}|row|${index}`,
        key: duplicateIndex > 0 ? `${baseKey}|${duplicateIndex}` : baseKey,
        district,
        team,
        campus,
      };
    });

const splitDelimitedLine = (line: string, delimiter: string) => {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
};

const parseDelimitedText = (text: string) => {
  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const delimiter = text.includes('\t') ? '\t' : ',';

  return lines.map((line) => splitDelimitedLine(line, delimiter));
};

const normalizeHeader = (value: string) =>
  value.toLowerCase().replace(/\s/g, '').replace(/[()]/g, '');

const normalizeName = (value: string) => value.replace(/\s/g, '').trim();

const escapeDelimitedCell = (value: string | number, delimiter: string) => {
  const text = String(value);
  const shouldQuote =
    text.includes(delimiter) ||
    text.includes('"') ||
    text.includes('\n') ||
    text.includes('\r');

  if (!shouldQuote) return text;

  return `"${text.replace(/"/g, '""')}"`;
};

const AdminParticipationTargetsPage = () => {
  const navigate = useNavigate();
  const manualRowIdRef = useRef(0);
  const saveTimerRef = useRef<number | null>(null);
  const saveRevisionRef = useRef(0);
  const latestSettingRef = useRef<ParticipationTargetsSetting | null>(null);
  const [loading, setLoading] = useState(true);
  const [campuses, setCampuses] = useState<CampusTargetRow[]>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({
    district: [],
    team: [],
    campus: [],
    target: [],
  });
  const [openFilterColumn, setOpenFilterColumn] =
    useState<SpreadsheetColumn | null>(null);
  const [filterSearchText, setFilterSearchText] = useState('');
  const [cellSelection, setCellSelection] = useState<CellSelection | null>(
    null
  );
  const [isSelectingCells, setIsSelectingCells] = useState(false);
  const [, setUndoStack] = useState<ParticipationSnapshot[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [targetsLoaded, setTargetsLoaded] = useState(false);
  const [participationTargets, setParticipationTargets] = useState<
    Record<string, number>
  >({});
  const rowDeletionInFlightRef = useRef(false);
  const [pendingRowDeletion, setPendingRowDeletion] = useState<{
    mode: RowDeletionMode;
    rows: CampusTargetRow[];
  } | null>(null);

  useEffect(() => {
    const loadCampuses = async () => {
      try {
        const [campusResult, participationSetting] = await Promise.all([
          supabase
            .from('campus_options')
            .select('district, team, campus')
            .order('district', { ascending: true })
            .order('team', { ascending: true })
            .order('campus', { ascending: true }),
          getParticipationTargetsSetting(),
        ]);

        if (campusResult.error) throw campusResult.error;

        const dbCampuses = (campusResult.data || [])
          .map((item: CampusOptionRow) => {
            const district = item.district || '미등록 지구';
            const team = item.team || '미등록 팀';
            const campus = item.campus || '미등록 캠퍼스';
            const key = getCampusKey(district, team, campus);

            return {
              rowId: key,
              key,
              district,
              team,
              campus,
            };
          });
        const savedCampuses =
          participationSetting.isStored
            ? normalizeCampusRows(participationSetting.rows)
            : null;
        const formattedCampuses =
          savedCampuses && savedCampuses.length > 0
            ? savedCampuses
            : normalizeCampusRows(dbCampuses);
        const targets = participationSetting.targets;

        setCampuses(formattedCampuses);
        setParticipationTargets(targets);
        setTargetsLoaded(true);
      } catch (loadError) {
        console.error('Failed to load campuses:', loadError);
        alert('캠퍼스 정보를 로드할 수 없습니다.');
      } finally {
        setLoading(false);
      }
    };

    void loadCampuses();
  }, []);

  useEffect(() => {
    if (!isSelectingCells) return undefined;

    const stopSelecting = () => setIsSelectingCells(false);

    window.addEventListener('mouseup', stopSelecting);

    return () => window.removeEventListener('mouseup', stopSelecting);
  }, [isSelectingCells]);

  const persistParticipationTargets = useCallback(
    async (setting: ParticipationTargetsSetting, revision: number) => {
      try {
        await updateParticipationTargetsSetting(setting);
        if (saveRevisionRef.current === revision) {
          setSaveStatus('saved');
          setLastSavedAt(new Date());
          setError((current) =>
            current === '예상 참여 인원을 DB에 저장하지 못했습니다.'
              ? null
              : current
          );
        }
      } catch (saveError) {
        console.error('Failed to save participation targets:', saveError);
        if (saveRevisionRef.current === revision) {
          setSaveStatus('error');
          setError('예상 참여 인원을 DB에 저장하지 못했습니다.');
        }
      }
    },
    []
  );

  useEffect(() => {
    if (!targetsLoaded) return;

    const setting = {
      rows: campuses,
      targets: participationTargets,
    };
    latestSettingRef.current = setting;
    const revision = saveRevisionRef.current + 1;
    saveRevisionRef.current = revision;

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      setSaveStatus('saving');
      void persistParticipationTargets(setting, revision);
    }, 400);
  }, [
    campuses,
    participationTargets,
    persistParticipationTargets,
    targetsLoaded,
  ]);

  useEffect(
    () => () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }

      const setting = latestSettingRef.current;

      if (setting) {
        void updateParticipationTargetsSetting(setting)
          .catch((saveError) => {
            console.error('Failed to flush participation targets:', saveError);
          });
      }
    },
    []
  );

  const saveParticipationTargets = (next: Record<string, number>) => {
    setParticipationTargets(next);
  };

  const saveCampuses = (next: CampusTargetRow[]) => {
    const normalizedRows = normalizeCampusRows(next);

    setCampuses(normalizedRows);
  };

  const pushUndoSnapshot = () => {
    setUndoStack((prev) =>
      [
        ...prev,
        {
          campuses,
          participationTargets,
        },
      ].slice(-30)
    );
  };

  const restoreSnapshot = (snapshot: ParticipationSnapshot) => {
    setCampuses(snapshot.campuses);
    setParticipationTargets(snapshot.participationTargets);
    setMessage('마지막 작업을 되돌렸습니다.');
    setError(null);
  };

  const handleUndo = () => {
    setUndoStack((prev) => {
      const snapshot = prev.at(-1);

      if (!snapshot) return prev;

      restoreSnapshot(snapshot);
      return prev.slice(0, -1);
    });
  };

  const handleCampusFieldChange = (
    rowKey: string,
    field: CampusTargetField,
    value: string
  ) => {
    const sourceRow = campuses.find((row) => row.key === rowKey);

    if (!sourceRow) return;

    const nextRow = {
      ...sourceRow,
      [field]: value,
    };
    const normalizedRow = normalizeCampusRows([nextRow])[0];

    const isDuplicate = campuses.some(
      (row) =>
        row.key !== rowKey &&
        row.district.trim() === normalizedRow.district &&
        row.team.trim() === normalizedRow.team &&
        row.campus.trim() === normalizedRow.campus &&
        normalizedRow.district &&
        normalizedRow.team &&
        normalizedRow.campus
    );

    if (isDuplicate) {
      setError('같은 지구/팀/캠퍼스 조합이 이미 있습니다.');
      setMessage(null);
      return;
    }

    pushUndoSnapshot();

    const nextCampuses = campuses.map((row) =>
      row.key === rowKey ? normalizedRow : row
    );
    const nextTargets = { ...participationTargets };

    if (rowKey !== normalizedRow.key) {
      nextTargets[normalizedRow.key] = nextTargets[rowKey] || 0;
      delete nextTargets[rowKey];
      saveParticipationTargets(nextTargets);
    }

    saveCampuses(nextCampuses);
    setError(null);
  };

  const handleAddCampusRow = (position: 'above' | 'below' = 'below') => {
    const selectedRow =
      cellSelection && filteredCampuses[cellSelection.focusRow]
        ? filteredCampuses[cellSelection.focusRow]
        : null;
    const baseDistrict =
      selectedRow?.district || campuses.at(-1)?.district || '새 지구';
    const baseTeam = selectedRow?.team || campuses.at(-1)?.team || '새 팀';
    let index = campuses.length + 1;
    let campus = `새 캠퍼스 ${index}`;
    let key = getCampusKey(baseDistrict, baseTeam, campus);

    while (campuses.some((row) => row.key === key)) {
      index += 1;
      campus = `새 캠퍼스 ${index}`;
      key = getCampusKey(baseDistrict, baseTeam, campus);
    }

    pushUndoSnapshot();
    const newRow = {
      rowId: `manual|${(manualRowIdRef.current += 1)}|${index}`,
      key,
      district: baseDistrict,
      team: baseTeam,
      campus,
    };

    if (!selectedRow) {
      saveCampuses([...campuses, newRow]);
      setCellSelection({
        anchorRow: filteredCampuses.length,
        anchorColumn: 0,
        focusRow: filteredCampuses.length,
        focusColumn: 0,
      });
      setMessage('행을 추가했습니다. 지구, 팀, 캠퍼스명을 수정해주세요.');
      setError(null);
      return;
    }

    const insertIndex = campuses.findIndex((row) => row.key === selectedRow.key);
    const nextInsertIndex =
      position === 'above' ? Math.max(insertIndex, 0) : insertIndex + 1;
    const nextCampuses =
      insertIndex >= 0
        ? [
            ...campuses.slice(0, nextInsertIndex),
            newRow,
            ...campuses.slice(nextInsertIndex),
          ]
        : [...campuses, newRow];
    const nextSelectedRow = cellSelection
      ? position === 'above'
        ? cellSelection.focusRow
        : cellSelection.focusRow + 1
      : filteredCampuses.length;

    saveCampuses(nextCampuses);
    setCellSelection({
      anchorRow: nextSelectedRow,
      anchorColumn: 0,
      focusRow: nextSelectedRow,
      focusColumn: 0,
    });
    setMessage('행을 추가했습니다. 지구, 팀, 캠퍼스명을 수정해주세요.');
    setError(null);
  };

  const handleDeleteSelectedCampusRows = () => {
    const bounds = getSelectionBounds();

    if (!bounds) {
      setMessage('삭제할 행을 먼저 선택해주세요.');
      setError(null);
      return;
    }

    const targetRows = filteredCampuses.slice(bounds.minRow, bounds.maxRow + 1);

    if (targetRows.length === 0) {
      setMessage('삭제할 행이 없습니다.');
      setError(null);
      return;
    }

    setPendingRowDeletion({ mode: 'selected', rows: [...targetRows] });
  };

  const handleDeleteFilteredCampusRows = () => {
    const targetRows = filteredCampuses;

    if (targetRows.length === 0) {
      setMessage('삭제할 행이 없습니다.');
      setError(null);
      return;
    }

    setPendingRowDeletion({ mode: 'filtered', rows: [...targetRows] });
  };

  const confirmRowDeletion = () => {
    if (!pendingRowDeletion || rowDeletionInFlightRef.current) return;

    rowDeletionInFlightRef.current = true;
    const targetRows = pendingRowDeletion.rows;
    const targetKeys = new Set(targetRows.map((row) => row.key));
    const nextTargets = { ...participationTargets };

    targetKeys.forEach((key) => delete nextTargets[key]);
    pushUndoSnapshot();
    saveParticipationTargets(nextTargets);
    saveCampuses(campuses.filter((row) => !targetKeys.has(row.key)));
    setCellSelection(null);
    setPendingRowDeletion(null);
    setMessage(`${targetRows.length.toLocaleString()}개 행을 삭제했습니다.`);
    setError(null);
    rowDeletionInFlightRef.current = false;
  };

  const handleReloadCampusRows = async () => {
    try {
      const { data, error: campusError } = await supabase
        .from('campus_options')
        .select('district, team, campus')
        .order('district', { ascending: true })
        .order('team', { ascending: true })
        .order('campus', { ascending: true });

      if (campusError) throw campusError;

      const dbCampuses = ((data ?? []) as CampusOptionRow[]).map((item) => {
        const district = item.district || '미등록 지구';
        const team = item.team || '미등록 팀';
        const campus = item.campus || '미등록 캠퍼스';
        const key = getCampusKey(district, team, campus);

        return { rowId: key, key, district, team, campus };
      });

      pushUndoSnapshot();
      saveCampuses(dbCampuses);
      setMessage('DB 조직 구조에서 캠퍼스 행을 다시 불러왔습니다.');
      setError(null);
    } catch (reloadError) {
      console.error('Failed to reload campus rows:', reloadError);
      setError('DB 조직 구조를 다시 불러오지 못했습니다.');
    }
  };

  const handleTargetChange = (key: string, value: string) => {
    const nextValue = Math.max(0, Number(value) || 0);

    if ((participationTargets[key] || 0) === nextValue) return;

    pushUndoSnapshot();
    saveParticipationTargets({
      ...participationTargets,
      [key]: nextValue,
    });
  };

  const applySpreadsheetMatrix = (
    startRowIndex: number,
    startColumnIndex: number,
    values: string[][],
    rowsForPaste = filteredCampuses
  ) => {
    const rowUpdates = new Map<string, CampusTargetRow>();
    const targetUpdates = new Map<string, number>();

    values.forEach((rowValues, pastedRowIndex) => {
      const sourceRow = rowsForPaste[startRowIndex + pastedRowIndex];

      if (!sourceRow) return;

      rowValues.forEach((value, pastedColumnIndex) => {
        const column = SPREADSHEET_COLUMNS[startColumnIndex + pastedColumnIndex];

        if (!column) return;

        if (column === 'target') {
          const target = Number(String(value).replace(/[^0-9.-]/g, ''));
          targetUpdates.set(
            sourceRow.key,
            Number.isFinite(target) && target > 0 ? Math.round(target) : 0
          );
          return;
        }

        const currentRow = rowUpdates.get(sourceRow.key) || sourceRow;

        rowUpdates.set(sourceRow.key, {
          ...currentRow,
          [column]: value,
        });
      });
    });

    if (rowUpdates.size > 0) {
      const rowsWithUpdates = campuses.map((row) =>
        rowUpdates.get(row.key) || row
      );
      const normalizedRows = normalizeCampusRows(rowsWithUpdates);

      pushUndoSnapshot();

      const nextTargets: Record<string, number> = {};

      rowsWithUpdates.forEach((row) => {
        const normalizedRow = normalizeCampusRows([row])[0];

        if (!normalizedRow) return;

        nextTargets[normalizedRow.key] = targetUpdates.has(row.key)
          ? targetUpdates.get(row.key) || 0
          : participationTargets[row.key] || 0;
      });

      saveParticipationTargets(nextTargets);
      saveCampuses(normalizedRows);
      setError(null);
      return;
    }

    if (targetUpdates.size > 0) {
      const nextTargets = { ...participationTargets };

      pushUndoSnapshot();
      targetUpdates.forEach((value, key) => {
        nextTargets[key] = value;
      });
      saveParticipationTargets(nextTargets);
      setError(null);
    }
  };

  const handleSpreadsheetPaste = (
    event: ClipboardEvent<HTMLInputElement>,
    rowIndex: number,
    columnIndex: number,
    rowsForPaste = filteredCampuses
  ) => {
    const pastedText = event.clipboardData.getData('text');
    const rows = parseDelimitedText(pastedText);

    if (rows.length === 0) return;

    event.preventDefault();
    applySpreadsheetMatrix(rowIndex, columnIndex, rows, rowsForPaste);
    setMessage(`${rows.length}개 행을 표에 붙여넣었습니다.`);
    setError(null);
  };

  const findCampusRow = (row: string[]) => {
    const [district = '', team = '', campus = ''] = row.map((value) =>
      value.trim()
    );

    if (district && team && campus) {
      const key = getCampusKey(district, team, campus);
      const exactMatch = campuses.find((item) => item.key === key);

      if (exactMatch) return exactMatch;
    }

    const label = normalizeName(row[0] || campus);

    return campuses.find((item) => {
      return [
        item.campus,
        `${item.district}/${item.team}/${item.campus}`,
        `${item.district}${item.team}${item.campus}`,
      ].some((candidate) => normalizeName(candidate) === label);
    });
  };

  const applyBulkText = (text: string) => {
    setMessage(null);
    setError(null);
    setValidationErrors([]);

    const rows = parseDelimitedText(text);

    if (rows.length === 0) {
      setError('가져올 내용이 없습니다.');
      return;
    }

    const headers = rows[0].map(normalizeHeader);
    const hasHeader = headers.some((header) =>
      ['지구', '팀', '캠퍼스', '참여인원', '인원', '전체인원'].includes(header)
    );
    const bodyRows = hasHeader ? rows.slice(1) : rows;

    const findColumnIndex = (names: string[], fallbackIndex: number) => {
      if (!hasHeader) return fallbackIndex;
      const index = headers.findIndex((header) => names.includes(header));
      return index >= 0 ? index : -1;
    };

    const districtIndex = findColumnIndex(['지구'], 0);
    const teamIndex = findColumnIndex(['팀'], 1);
    const campusIndex = findColumnIndex(['캠퍼스'], 2);
    const peopleIndex = findColumnIndex(['참여인원', '전체인원', '인원'], 3);

    if (hasHeader) {
      const missingHeaders: string[] = [];
      if (districtIndex === -1) missingHeaders.push('지구');
      if (teamIndex === -1) missingHeaders.push('팀');
      if (campusIndex === -1) missingHeaders.push('캠퍼스');
      if (peopleIndex === -1) missingHeaders.push('참여인원(혹은 인원)');

      if (missingHeaders.length > 0) {
        setError(`필수 열 헤더가 누락되었습니다: [${missingHeaders.join(', ')}]. 템플릿의 컬럼 이름을 수정하지 마세요.`);
        return;
      }
    }

    const importedTargets: Record<string, number> = {};
    const errors: string[] = [];

    bodyRows.forEach((row, bodyIndex) => {
      const lineNum = hasHeader ? bodyIndex + 2 : bodyIndex + 1;

      if (row.length === 0 || (row.length === 1 && !row[0].trim())) {
        return;
      }

      const rowPeopleIndex = !hasHeader && row.length === 2 ? 1 : peopleIndex;
      const rowForMatch =
        !hasHeader && row.length === 2
          ? [row[0] || '', '', row[0] || '']
          : [
              row[districtIndex] || '',
              row[teamIndex] || '',
              row[campusIndex] || '',
            ];

      const rawPeopleVal = row[rowPeopleIndex] ?? '';
      const cleanPeopleVal = String(rawPeopleVal).replace(/[^0-9.-]/g, '');
      const participantCount = Number(cleanPeopleVal);

      const [rowDistrict = '', rowTeam = '', rowCampus = ''] = rowForMatch.map(val => val.trim());

      if (!rowDistrict && !rowTeam && !rowCampus) {
        errors.push(`${lineNum}번째 행: 모든 소속 정보(지구/팀/캠퍼스)가 비어 있습니다.`);
        return;
      }

      if (!rowCampus) {
        errors.push(`${lineNum}번째 행: 캠퍼스명이 누락되었습니다.`);
        return;
      }

      if (cleanPeopleVal === '' || !Number.isFinite(participantCount) || participantCount < 0) {
        errors.push(`${lineNum}번째 행 (${rowCampus}): 참여 인원 값 [${rawPeopleVal}]이 올바르지 않은 양의 정수입니다.`);
        return;
      }

      const campusRow = findCampusRow(rowForMatch);

      if (!campusRow) {
        const fullScope = [rowDistrict, rowTeam, rowCampus].filter(Boolean).join(' > ');
        errors.push(`${lineNum}번째 행: 시스템 내에 존재하지 않는 캠퍼스 [${fullScope}] 입니다. 철자나 공백을 확인해주세요.`);
        return;
      }

      importedTargets[campusRow.key] = Math.round(participantCount);
    });

    if (errors.length > 0) {
      setValidationErrors(errors);
      setError(`엑셀 파일 유효성 검사에 실패했습니다. 총 ${errors.length}개의 오류가 감지되어 업로드가 취소되었습니다. 하단의 에러 리포트를 수정 후 다시 시도해주세요.`);
      return;
    }

    const importedCount = Object.keys(importedTargets).length;

    if (importedCount === 0) {
      setError('해석된 캠퍼스가 없습니다. 지구, 팀, 캠퍼스, 참여인원 형식으로 붙여넣어주세요.');
      return;
    }

    saveParticipationTargets({
      ...participationTargets,
      ...importedTargets,
    });
    setValidationErrors([]);
    setMessage(`${importedCount}개 캠퍼스 참여 인원을 성공적으로 분석하여 모두 반영했습니다! 🎉`);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (file.name.toLowerCase().endsWith('.xlsx')) {
      setError('엑셀에서 표 범위를 복사해 붙여넣거나 CSV/TSV로 저장해 업로드해주세요.');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const text = String(reader.result || '');
      applyBulkText(text);
    };
    reader.onerror = () => setError('파일을 읽을 수 없습니다.');
    reader.readAsText(file, 'utf-8');
    event.target.value = '';
  };

  const downloadCsvTemplate = () => {
    const delimiter = ',';
    const rows = [
      ['지구', '팀', '캠퍼스', '참여인원'],
      ...campuses.map((row) => [
        row.district,
        row.team,
        row.campus,
        participationTargets[row.key] || '',
      ]),
    ];
    const content = rows
      .map((row) =>
        row.map((cell) => escapeDelimitedCell(cell, delimiter)).join(delimiter)
      )
      .join('\n');
    const blob = new Blob(['\uFEFF', content], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = 'participation-targets-template.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const getColumnDisplayValue = useCallback((
    row: CampusTargetRow,
    column: SpreadsheetColumn
  ) => {
    if (column === 'target') return String(participationTargets[row.key] || 0);

    return row[column];
  }, [participationTargets]);

  const columnFilterOptions = useMemo(() => {
    const next = {} as Record<SpreadsheetColumn, string[]>;

    SPREADSHEET_COLUMNS.forEach((column) => {
      next[column] = Array.from(
        new Set(campuses.map((row) => getColumnDisplayValue(row, column)))
      ).sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }));
    });

    return next;
  }, [campuses, getColumnDisplayValue]);

  const toggleFilterMenu = (column: SpreadsheetColumn) => {
    setOpenFilterColumn((prev) => (prev === column ? null : column));
    setFilterSearchText('');
  };

  const isFilterValueChecked = (column: SpreadsheetColumn, value: string) => {
    const selectedValues = columnFilters[column];

    return selectedValues.length === 0 || selectedValues.includes(value);
  };

  const toggleColumnFilterValue = (column: SpreadsheetColumn, value: string) => {
    const options = columnFilterOptions[column];
    const current =
      columnFilters[column].length === 0 ? options : columnFilters[column];
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];

    setColumnFilters((prev) => ({
      ...prev,
      [column]: next.length === options.length ? [] : next,
    }));
  };

  const resetColumnFilter = (column: SpreadsheetColumn) => {
    setColumnFilters((prev) => ({
      ...prev,
      [column]: [],
    }));
    setFilterSearchText('');
  };

  const filterOptionSearchValue = normalizeName(filterSearchText);

  const filteredCampuses = useMemo(() => {
    return campuses.filter((row) => {
      const matchesColumns = SPREADSHEET_COLUMNS.every((column) => {
        const selectedValues = columnFilters[column];

        return (
          selectedValues.length === 0 ||
          selectedValues.includes(getColumnDisplayValue(row, column))
        );
      });

      return matchesColumns;
    });
  }, [campuses, columnFilters, getColumnDisplayValue]);

  const teamTotals = useMemo(() => {
    const map = new Map<string, number>();

    campuses.forEach((row) => {
      const key = `${row.district}|${row.team}`;
      map.set(key, (map.get(key) || 0) + (participationTargets[row.key] || 0));
    });

    return map;
  }, [campuses, participationTargets]);

  const districtTotals = useMemo(() => {
    const map = new Map<string, number>();

    campuses.forEach((row) => {
      map.set(
        row.district,
        (map.get(row.district) || 0) + (participationTargets[row.key] || 0)
      );
    });

    return map;
  }, [campuses, participationTargets]);

  const totalParticipants = useMemo(
    () =>
      campuses.reduce(
        (sum, row) => sum + (participationTargets[row.key] || 0),
        0
      ),
    [campuses, participationTargets]
  );
  const missingCampusCount = useMemo(
    () =>
      campuses.filter((row) => (participationTargets[row.key] || 0) === 0)
        .length,
    [campuses, participationTargets]
  );
  const pendingDeletionTargetTotal = useMemo(
    () =>
      pendingRowDeletion?.rows.reduce(
        (sum, row) => sum + (participationTargets[row.key] || 0),
        0
      ) ?? 0,
    [participationTargets, pendingRowDeletion]
  );

  useEffect(() => {
    if (!pendingRowDeletion) return;

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !rowDeletionInFlightRef.current) {
        setPendingRowDeletion(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pendingRowDeletion]);

  const getSelectionBounds = () => {
    if (!cellSelection) return null;

    return {
      minRow: Math.min(cellSelection.anchorRow, cellSelection.focusRow),
      maxRow: Math.max(cellSelection.anchorRow, cellSelection.focusRow),
      minColumn: Math.min(
        cellSelection.anchorColumn,
        cellSelection.focusColumn
      ),
      maxColumn: Math.max(
        cellSelection.anchorColumn,
        cellSelection.focusColumn
      ),
    };
  };

  const isCellSelected = (rowIndex: number, columnIndex: number) => {
    const bounds = getSelectionBounds();

    if (!bounds) return false;

    return (
      rowIndex >= bounds.minRow &&
      rowIndex <= bounds.maxRow &&
      columnIndex >= bounds.minColumn &&
      columnIndex <= bounds.maxColumn
    );
  };

  const selectCell = (rowIndex: number, columnIndex: number) => {
    setCellSelection({
      anchorRow: rowIndex,
      anchorColumn: columnIndex,
      focusRow: rowIndex,
      focusColumn: columnIndex,
    });
  };

  const extendCellSelection = (rowIndex: number, columnIndex: number) => {
    if (!isSelectingCells) return;

    setCellSelection((prev) =>
      prev
        ? {
            ...prev,
            focusRow: rowIndex,
            focusColumn: columnIndex,
          }
        : {
            anchorRow: rowIndex,
            anchorColumn: columnIndex,
            focusRow: rowIndex,
            focusColumn: columnIndex,
          }
    );
  };

  const getSpreadsheetCellValue = (
    row: CampusTargetRow,
    column: SpreadsheetColumn
  ) => {
    if (column === 'target') return String(participationTargets[row.key] || '');

    return row[column];
  };

  const getSelectedSpreadsheetText = () => {
    const bounds = getSelectionBounds();

    if (!bounds) return '';

    const rows: string[][] = [];

    for (let rowIndex = bounds.minRow; rowIndex <= bounds.maxRow; rowIndex += 1) {
      const row = filteredCampuses[rowIndex];

      if (!row) continue;

      const cells: string[] = [];

      for (
        let columnIndex = bounds.minColumn;
        columnIndex <= bounds.maxColumn;
        columnIndex += 1
      ) {
        const column = SPREADSHEET_COLUMNS[columnIndex];

        if (!column) continue;

        cells.push(getSpreadsheetCellValue(row, column));
      }

      rows.push(cells);
    }

    return rows.map((row) => row.join('\t')).join('\n');
  };

  const clearSelectedCells = () => {
    const bounds = getSelectionBounds();

    if (!bounds) return;

    const values: string[][] = [];

    for (let row = bounds.minRow; row <= bounds.maxRow; row += 1) {
      const rowValues: string[] = [];

      for (
        let column = bounds.minColumn;
        column <= bounds.maxColumn;
        column += 1
      ) {
        rowValues.push('');
      }

      values.push(rowValues);
    }

    applySpreadsheetMatrix(bounds.minRow, bounds.minColumn, values);
    setMessage('선택한 셀을 비웠습니다.');
    setError(null);
  };

  const handleSpreadsheetKeyDown = (
    event: KeyboardEvent<HTMLDivElement>
  ) => {
    if (!cellSelection) return;

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      void navigator.clipboard.writeText(getSelectedSpreadsheetText());
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      handleUndo();
      return;
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      const target = event.target as HTMLElement;
      const isSingleCell =
        cellSelection.anchorRow === cellSelection.focusRow &&
        cellSelection.anchorColumn === cellSelection.focusColumn;

      if (target.tagName === 'INPUT' && isSingleCell) return;

      event.preventDefault();
      clearSelectedCells();
    }
  };

  const getCellClassName = (rowIndex: number, columnIndex: number) =>
    isCellSelected(rowIndex, columnIndex) ? styles.selectedCell : undefined;

  if (loading) {
    return (
      <div className={styles.pageContainer}>
        <AdminHeader />
        <main className={styles.main}>로딩 중...</main>
      </div>
    );
  }

  return (
    <div className={styles.pageContainer}>
      <AdminHeader />

      <main className={styles.main}>
        <div className={styles.header}>
          <div>
            <div className={styles.titleRow}>
              <h1>예상 참여 인원 관리</h1>
              <span
                className={`${styles.saveStatus} ${styles[`saveStatus_${saveStatus}`]}`}
                role="status"
              >
                {saveStatus === 'saving'
                  ? '저장 중...'
                  : saveStatus === 'error'
                    ? '저장 실패'
                    : lastSavedAt
                      ? `저장됨 · ${lastSavedAt.toLocaleTimeString('ko-KR', {
                          hour: 'numeric',
                          minute: '2-digit',
                        })}`
                      : '자동 저장'}
              </span>
            </div>
            <p>
              캠퍼스별 예상 참여 인원을 입력하면 팀·지구 합계와 신청률이 자동으로 계산됩니다.
            </p>
          </div>

          <button type="button" onClick={() => navigate('/admin/applications')}>
            신청률 현황 보기
          </button>
        </div>

        <details className={styles.guidePanel}>
          <summary>
            <span>
              <strong>처음 사용하시나요?</strong>
              참여 인원 입력 방법을 확인하세요.
            </span>
            <b>사용 방법 보기</b>
          </summary>
          <div className={styles.guideContent}>
            <ol>
              <li>일괄 입력 표의 참여 인원 열에 숫자를 입력합니다.</li>
              <li>엑셀의 숫자 열을 복사해 첫 번째 입력칸에 붙여넣을 수 있습니다.</li>
              <li>기존 파일이 있다면 CSV/TSV 불러오기로 한 번에 반영합니다.</li>
              <li>참여 인원 열 필터에서 0명인 캠퍼스를 확인합니다.</li>
            </ol>
            <p>
              입력한 참여 인원은 DB에 자동 저장되며, 팀·지구 합계와 신청률 현황에
              반영됩니다.
            </p>
          </div>
        </details>

        <div className={styles.summaryGrid}>
          <div>
            <span>전체 참여 인원</span>
            <strong>{totalParticipants.toLocaleString()}명</strong>
          </div>
          <div>
            <span>캠퍼스</span>
            <strong>{campuses.length.toLocaleString()}개</strong>
          </div>
          <div>
            <span>0명 캠퍼스</span>
            <strong>{missingCampusCount.toLocaleString()}개</strong>
          </div>
          <div>
            <span>팀</span>
            <strong>{teamTotals.size.toLocaleString()}개</strong>
          </div>
          <div>
            <span>지구</span>
            <strong>{districtTotals.size.toLocaleString()}개</strong>
          </div>
        </div>

        <section className={styles.section}>
          <div className={styles.sectionTitleBlock}>
            <h2>일괄 입력</h2>
            <p>
              지구, 팀, 캠퍼스를 표로 불러온 뒤 참여 인원 칸만 채우면 됩니다.
              엑셀에서 숫자 열을 복사해 첫 입력칸에 붙여넣어도 아래로 반영됩니다.
            </p>
          </div>

          <div className={styles.bulkPanel}>
            <div className={styles.sheetToolbar}>
              <button type="button" onClick={() => handleAddCampusRow('above')}>
                위에 행 추가
              </button>
              <button type="button" onClick={() => handleAddCampusRow('below')}>
                아래에 행 추가
              </button>
              <button
                type="button"
                className={styles.dangerButton}
                onClick={handleDeleteSelectedCampusRows}
              >
                선택 행 삭제
              </button>
              <button
                type="button"
                className={styles.dangerButton}
                onClick={handleDeleteFilteredCampusRows}
              >
                필터 결과 삭제
              </button>
            </div>

            <div
              className={styles.bulkSheetWrap}
              tabIndex={0}
              onKeyDownCapture={handleSpreadsheetKeyDown}
            >
              <table className={styles.bulkSheet}>
                <thead>
                  <tr>
                    <th className={styles.rowNumberHeader}>#</th>
                    {SPREADSHEET_COLUMNS.map((column) => {
                      const options = columnFilterOptions[column];
                      const visibleOptions = options.filter((option) =>
                        normalizeName(option).includes(filterOptionSearchValue)
                      );
                      const isActive = columnFilters[column].length > 0;

                      return (
                        <th key={column}>
                          <div className={styles.headerFilterCell}>
                            <span>{SPREADSHEET_COLUMN_LABELS[column]}</span>
                            <button
                              type="button"
                              className={`${styles.filterButton} ${
                                isActive ? styles.filterButtonActive : ''
                              }`}
                              onClick={() => toggleFilterMenu(column)}
                              aria-label={`${SPREADSHEET_COLUMN_LABELS[column]} 필터`}
                            >
                              ▼
                            </button>
                          </div>

                          {openFilterColumn === column && (
                            <div className={styles.filterMenu}>
                              <input
                                type="search"
                                value={filterSearchText}
                                onChange={(event) =>
                                  setFilterSearchText(event.target.value)
                                }
                                placeholder="값 검색"
                              />
                              <div className={styles.filterMenuActions}>
                                <button
                                  type="button"
                                  onClick={() => resetColumnFilter(column)}
                                >
                                  전체
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setOpenFilterColumn(null)}
                                >
                                  닫기
                                </button>
                              </div>
                              <div className={styles.filterOptionList}>
                                {visibleOptions.map((option) => (
                                  <label key={option}>
                                    <input
                                      type="checkbox"
                                      checked={isFilterValueChecked(
                                        column,
                                        option
                                      )}
                                      onChange={() =>
                                        toggleColumnFilterValue(column, option)
                                      }
                                    />
                                    <span>{option || '(빈 값)'}</span>
                                  </label>
                                ))}
                                {visibleOptions.length === 0 && (
                                  <p>값이 없습니다.</p>
                                )}
                              </div>
                            </div>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {filteredCampuses.map((campus, index) => (
                    <tr key={campus.rowId || campus.key}>
                      <td className={styles.rowNumberCell}>
                        <button
                          type="button"
                          className={styles.rowNumberButton}
                          onClick={() =>
                            setCellSelection({
                              anchorRow: index,
                              anchorColumn: 0,
                              focusRow: index,
                              focusColumn: SPREADSHEET_COLUMNS.length - 1,
                            })
                          }
                        >
                          {index + 1}
                        </button>
                      </td>
                      {SPREADSHEET_COLUMNS.map((column, columnIndex) => (
                        <td
                          key={column}
                          className={getCellClassName(index, columnIndex)}
                          onMouseDown={() => {
                            selectCell(index, columnIndex);
                            setIsSelectingCells(true);
                          }}
                          onMouseEnter={() =>
                            extendCellSelection(index, columnIndex)
                          }
                        >
                          <input
                            type={column === 'target' ? 'number' : 'text'}
                            min={column === 'target' ? 0 : undefined}
                            value={getSpreadsheetCellValue(campus, column)}
                            onChange={(event) => {
                              if (column === 'target') {
                                handleTargetChange(
                                  campus.key,
                                  event.target.value
                                );
                                return;
                              }

                              handleCampusFieldChange(
                                campus.key,
                                column,
                                event.target.value
                              );
                            }}
                            onFocus={() => selectCell(index, columnIndex)}
                            onPaste={(event) =>
                              handleSpreadsheetPaste(
                                event,
                                index,
                                columnIndex,
                                filteredCampuses
                              )
                            }
                            placeholder={column === 'target' ? '0' : ''}
                            aria-label={`${campus.campus} ${column}`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={styles.actionRow}>
              <label className={styles.primaryAction}>
                CSV/TSV 불러오기
                <input
                  type="file"
                  accept=".csv,.tsv,.txt,.xlsx"
                  onChange={handleFileChange}
                />
              </label>
              <button type="button" onClick={downloadCsvTemplate}>
                CSV 템플릿 다운로드
              </button>
              <button
                type="button"
                className={styles.tertiaryAction}
                onClick={handleReloadCampusRows}
              >
                조직 목록 새로고침
              </button>
            </div>

            <div className={styles.helpGrid}>
              <div>
                <strong>표 입력</strong>
                <span>참여 인원 칸에 입력하면 DB에 자동 저장됩니다.</span>
              </div>
              <div>
                <strong>엑셀 붙여넣기</strong>
                <span>숫자 열을 복사해 첫 입력칸에 붙여넣으면 아래로 채워집니다.</span>
              </div>
              <div>
                <strong>파일 불러오기</strong>
                <span>CSV, TSV, TXT 파일을 읽어 참여 인원을 반영합니다.</span>
              </div>
            </div>

            {message && <p className={styles.successText}>{message}</p>}
            {error && <p className={styles.errorText}>{error}</p>}

            {validationErrors.length > 0 && (
              <div className={styles.validationErrorReport}>
                <h3>데이터 입력 양식 오류 ({validationErrors.length}건)</h3>
                <ul>
                  {validationErrors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>

      </main>
      {pendingRowDeletion && (
        <div
          className={styles.deletionBackdrop}
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !rowDeletionInFlightRef.current
            ) {
              setPendingRowDeletion(null);
            }
          }}
        >
          <section
            className={styles.deletionDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="row-deletion-dialog-title"
            aria-describedby="row-deletion-dialog-description"
          >
            <span className={styles.deletionDialogIcon} aria-hidden="true">
              <Trash2 size={25} />
            </span>
            <p className={styles.deletionDialogEyebrow}>
              {pendingRowDeletion.mode === 'selected'
                ? '선택 행 삭제'
                : '필터 결과 전체 삭제'}
            </p>
            <h2 id="row-deletion-dialog-title">
              {pendingRowDeletion.rows.length.toLocaleString()}개 설정 행을
              삭제할까요?
            </h2>
            <p id="row-deletion-dialog-description">
              이 설정표에서 행과 연결된 참여 목표값을 제거하고 자동 저장합니다.
              DB의 실제 지구·팀·캠퍼스 조직 구조는 삭제되지 않습니다.
            </p>
            <div className={styles.deletionSummary}>
              <div>
                <span>삭제 대상</span>
                <strong>
                  {pendingRowDeletion.rows.length.toLocaleString()}개 행
                </strong>
              </div>
              <div>
                <span>제거되는 참여 목표 합계</span>
                <strong>{pendingDeletionTargetTotal.toLocaleString()}명</strong>
              </div>
            </div>
            <div className={styles.deletionPreview}>
              {pendingRowDeletion.rows.slice(0, 5).map((row) => (
                <div key={row.rowId || row.key}>
                  <strong>{row.campus}</strong>
                  <span>
                    {row.district} · {row.team} ·{' '}
                    {(participationTargets[row.key] || 0).toLocaleString()}명
                  </span>
                </div>
              ))}
              {pendingRowDeletion.rows.length > 5 && (
                <p>
                  외 {(pendingRowDeletion.rows.length - 5).toLocaleString()}개
                  행
                </p>
              )}
            </div>
            <div className={styles.deletionNotice}>
              <AlertTriangle size={18} aria-hidden="true" />
              <span>
                삭제 직후 실행 취소로 되돌릴 수 있습니다. 필터 결과 삭제는 현재
                화면에 표시된 행만 대상으로 고정되어 있습니다.
              </span>
            </div>
            <footer className={styles.deletionDialogActions}>
              <button
                type="button"
                autoFocus
                onClick={() => setPendingRowDeletion(null)}
              >
                설정 행 유지
              </button>
              <button
                type="button"
                className={styles.deletionSubmit}
                onClick={confirmRowDeletion}
              >
                {pendingRowDeletion.mode === 'selected'
                  ? '선택 행 삭제'
                  : '필터 결과 삭제'}
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
};

export default AdminParticipationTargetsPage;
