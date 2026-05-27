import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/Header';
import { getAdminRole } from '../../lib/adminService';
import { supabase } from '../../lib/supabase';
import styles from './AdminParticipationTargetsPage.module.css';

interface CampusTargetRow {
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

interface TeamGroup {
  key: string;
  district: string;
  team: string;
  campuses: CampusTargetRow[];
  total: number;
  missingCount: number;
}

interface DistrictGroup {
  district: string;
  teams: TeamGroup[];
  total: number;
  campusCount: number;
  missingCount: number;
}

const PARTICIPATION_TARGETS_STORAGE_KEY =
  'admin_ticket_participation_targets';

const getCampusKey = (district: string, team: string, campus: string) =>
  `campus|${district}|${team}|${campus}`;

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
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [campuses, setCampuses] = useState<CampusTargetRow[]>([]);
  const [searchText, setSearchText] = useState('');
  const [showMissingOnly, setShowMissingOnly] = useState(false);
  const [expandedDistricts, setExpandedDistricts] = useState<
    Record<string, boolean>
  >({});
  const [expandedTeams, setExpandedTeams] = useState<Record<string, boolean>>(
    {}
  );
  const [bulkText, setBulkText] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [participationTargets, setParticipationTargets] = useState<
    Record<string, number>
  >(() => {
    const saved = localStorage.getItem(PARTICIPATION_TARGETS_STORAGE_KEY);

    if (!saved) return {};

    try {
      return JSON.parse(saved);
    } catch {
      return {};
    }
  });

  useEffect(() => {
    const checkAdminAndLoadCampuses = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          navigate('/login');
          return;
        }

        const adminRole = await getAdminRole(session.user.id);

        if (!adminRole || adminRole.role !== 'global_admin') {
          alert('전체 관리자만 접근할 수 있습니다.');
          navigate('/');
          return;
        }

        setIsAdmin(true);

        const { data, error: campusError } = await supabase
          .from('campus_options')
          .select('district, team, campus')
          .order('district', { ascending: true })
          .order('team', { ascending: true })
          .order('campus', { ascending: true });

        if (campusError) throw campusError;

        const formattedCampuses = (data || [])
          .map((item: CampusOptionRow) => {
            const district = item.district || '미등록 지구';
            const team = item.team || '미등록 팀';
            const campus = item.campus || '미등록 캠퍼스';
            const key = getCampusKey(district, team, campus);

            return {
              key,
              district,
              team,
              campus,
            };
          })
          .filter(
            (item, index, array) =>
              array.findIndex((target) => target.key === item.key) === index
          );

        setCampuses(formattedCampuses);
      } catch (loadError) {
        console.error('Failed to load campuses:', loadError);
        alert('캠퍼스 정보를 로드할 수 없습니다.');
      } finally {
        setLoading(false);
      }
    };

    checkAdminAndLoadCampuses();
  }, [navigate]);

  const saveParticipationTargets = (next: Record<string, number>) => {
    localStorage.setItem(
      PARTICIPATION_TARGETS_STORAGE_KEY,
      JSON.stringify(next)
    );
    setParticipationTargets(next);
  };

  const handleTargetChange = (key: string, value: string) => {
    const nextValue = Math.max(0, Number(value) || 0);

    saveParticipationTargets({
      ...participationTargets,
      [key]: nextValue,
    });
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

    const rows = parseDelimitedText(text);

    if (rows.length === 0) {
      setError('가져올 내용이 없습니다.');
      return;
    }

    const headers = rows[0].map(normalizeHeader);
    const hasHeader = headers.some((header) =>
      ['지구', '팀', '캠퍼스', '참여인원', '인원'].includes(header)
    );
    const bodyRows = hasHeader ? rows.slice(1) : rows;
    const findColumnIndex = (names: string[], fallbackIndex: number) => {
      if (!hasHeader) return fallbackIndex;

      const index = headers.findIndex((header) => names.includes(header));

      return index >= 0 ? index : fallbackIndex;
    };
    const districtIndex = findColumnIndex(['지구'], 0);
    const teamIndex = findColumnIndex(['팀'], 1);
    const campusIndex = findColumnIndex(['캠퍼스'], 2);
    const peopleIndex = findColumnIndex(['참여인원', '전체인원', '인원'], 3);
    const importedTargets: Record<string, number> = {};
    let skippedCount = 0;

    bodyRows.forEach((row) => {
      const rowPeopleIndex = !hasHeader && row.length === 2 ? 1 : peopleIndex;
      const rowForMatch =
        !hasHeader && row.length === 2
          ? [row[0] || '', '', row[0] || '']
          : [
              row[districtIndex] || '',
              row[teamIndex] || '',
              row[campusIndex] || '',
            ];
      const participantCount = Number(
        String(row[rowPeopleIndex] ?? '').replace(/[^0-9.-]/g, '')
      );

      if (!Number.isFinite(participantCount) || participantCount < 0) {
        skippedCount += 1;
        return;
      }

      const campusRow = findCampusRow(rowForMatch);

      if (!campusRow) {
        skippedCount += 1;
        return;
      }

      importedTargets[campusRow.key] = Math.round(participantCount);
    });

    const importedCount = Object.keys(importedTargets).length;

    if (importedCount === 0) {
      setError('해석된 캠퍼스가 없습니다. 지구, 팀, 캠퍼스, 참여인원 형식으로 붙여넣어 주세요.');
      return;
    }

    saveParticipationTargets({
      ...participationTargets,
      ...importedTargets,
    });
    setMessage(
      `${importedCount}개 캠퍼스 참여 인원을 반영했습니다.${
        skippedCount > 0 ? ` ${skippedCount}개 행은 건너뛰었습니다.` : ''
      }`
    );
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (file.name.toLowerCase().endsWith('.xlsx')) {
      setError('엑셀에서 표 범위를 복사해 붙여넣거나 CSV/TSV로 저장해 업로드해 주세요.');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const text = String(reader.result || '');
      setBulkText(text);
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

  const filteredCampuses = useMemo(() => {
    const searchValue = normalizeName(searchText);

    return campuses.filter((row) => {
      const matchesMissing =
        !showMissingOnly || (participationTargets[row.key] || 0) === 0;
      const matchesSearch =
        !searchValue ||
        [row.district, row.team, row.campus].some((value) =>
          normalizeName(value).includes(searchValue)
        );

      return matchesMissing && matchesSearch;
    });
  }, [campuses, participationTargets, searchText, showMissingOnly]);

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

  const totalParticipants = campuses.reduce(
    (sum, row) => sum + (participationTargets[row.key] || 0),
    0
  );
  const missingCampusCount = campuses.filter(
    (row) => (participationTargets[row.key] || 0) === 0
  ).length;

  const districtGroups = useMemo<DistrictGroup[]>(() => {
    const districtMap = new Map<string, Map<string, CampusTargetRow[]>>();

    filteredCampuses.forEach((campus) => {
      const teamMap =
        districtMap.get(campus.district) ||
        new Map<string, CampusTargetRow[]>();
      const teamCampuses = teamMap.get(campus.team) || [];

      teamCampuses.push(campus);
      teamMap.set(campus.team, teamCampuses);
      districtMap.set(campus.district, teamMap);
    });

    return Array.from(districtMap.entries()).map(([district, teamMap]) => {
      const teams = Array.from(teamMap.entries()).map(([team, teamCampuses]) => {
        const key = `${district}|${team}`;
        const total = teamCampuses.reduce(
          (sum, campus) => sum + (participationTargets[campus.key] || 0),
          0
        );
        const missingCount = teamCampuses.filter(
          (campus) => (participationTargets[campus.key] || 0) === 0
        ).length;

        return {
          key,
          district,
          team,
          campuses: teamCampuses,
          total,
          missingCount,
        };
      });

      return {
        district,
        teams,
        total: teams.reduce((sum, team) => sum + team.total, 0),
        campusCount: teams.reduce(
          (sum, team) => sum + team.campuses.length,
          0
        ),
        missingCount: teams.reduce((sum, team) => sum + team.missingCount, 0),
      };
    });
  }, [filteredCampuses, participationTargets]);

  const isDistrictExpanded = (district: string) =>
    expandedDistricts[district] ?? true;
  const isTeamExpanded = (teamKey: string) => expandedTeams[teamKey] ?? true;

  const toggleDistrict = (district: string) => {
    setExpandedDistricts((prev) => ({
      ...prev,
      [district]: !(prev[district] ?? true),
    }));
  };

  const toggleTeam = (teamKey: string) => {
    setExpandedTeams((prev) => ({
      ...prev,
      [teamKey]: !(prev[teamKey] ?? true),
    }));
  };

  if (loading) {
    return (
      <div className={styles.pageContainer}>
        <Header />
        <main className={styles.main}>로딩 중...</main>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className={styles.pageContainer}>
        <Header />
        <main className={styles.main}>관리자만 접근할 수 있습니다.</main>
      </div>
    );
  }

  return (
    <div className={styles.pageContainer}>
      <Header />

      <main className={styles.main}>
        <div className={styles.header}>
          <div>
            <h1>참여 인원 입력</h1>
            <p>캠퍼스 값을 입력하면 팀과 지구 합계가 자동으로 계산됩니다.</p>
          </div>

          <button type="button" onClick={() => navigate('/admin/tickets')}>
            예매율 보기
          </button>
        </div>

        <div className={styles.guidePanel}>
          <h2>처음 사용하는 경우</h2>
          <ol>
            <li>CSV 또는 TSV 템플릿을 내려받습니다.</li>
            <li>템플릿의 참여인원 열에 캠퍼스별 전체 참여 인원을 입력합니다.</li>
            <li>엑셀 표를 복사해 붙여넣거나 CSV/TSV 파일을 불러옵니다.</li>
            <li>아래 목록에서 누락된 캠퍼스가 없는지 확인합니다.</li>
          </ol>
          <p>
            입력값은 이 브라우저에 저장되며, 예매율 보기 화면에서 자동으로
            캠퍼스 합계가 팀과 지구 합계로 반영됩니다.
          </p>
        </div>

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
            <span>미입력 캠퍼스</span>
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
              많은 캠퍼스를 한 번에 입력할 때 사용합니다. 템플릿을 내려받아
              참여인원만 채운 뒤, 표 범위를 복사해 붙여넣으면 됩니다.
            </p>
          </div>

          <div className={styles.bulkPanel}>
            <textarea
              value={bulkText}
              onChange={(event) => setBulkText(event.target.value)}
              placeholder={`지구\t팀\t캠퍼스\t참여인원\n서울지구\t1팀\t연세대\t120\n서울지구\t2팀\t고려대\t95`}
              rows={4}
            />

            <div className={styles.actionRow}>
              <button type="button" onClick={() => applyBulkText(bulkText)}>
                붙여넣은 값 반영
              </button>
              <button type="button" onClick={downloadCsvTemplate}>
                CSV 템플릿 다운로드
              </button>
              <label>
                CSV/TSV 불러오기
                <input
                  type="file"
                  accept=".csv,.tsv,.txt,.xlsx"
                  onChange={handleFileChange}
                />
              </label>
            </div>

            <div className={styles.helpGrid}>
              <div>
                <strong>CSV 템플릿</strong>
                <span>엑셀에서 바로 열기 좋습니다.</span>
              </div>
              <div>
                <strong>TSV 템플릿</strong>
                <span>엑셀 복사/붙여넣기와 가장 비슷한 형식입니다.</span>
              </div>
              <div>
                <strong>파일 불러오기</strong>
                <span>CSV, TSV, TXT 파일을 읽어 참여 인원을 반영합니다.</span>
              </div>
            </div>

            {message && <p className={styles.successText}>{message}</p>}
            {error && <p className={styles.errorText}>{error}</p>}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.tableHeader}>
            <div className={styles.sectionTitleBlock}>
              <h2>캠퍼스별 참여 인원</h2>
              <p>
                지구와 팀을 펼쳐 캠퍼스별 인원을 직접 수정할 수 있습니다.
                팀/지구 합계는 캠퍼스 입력값을 기준으로 자동 계산됩니다.
              </p>
            </div>
            <div className={styles.filterControls}>
              <label className={styles.missingToggle}>
                <input
                  type="checkbox"
                  checked={showMissingOnly}
                  onChange={(event) => setShowMissingOnly(event.target.checked)}
                />
                미입력만
              </label>
              <input
                type="search"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="지구, 팀, 캠퍼스 검색"
              />
            </div>
          </div>

          <div className={styles.inlineGuide}>
            <span>▾ 버튼으로 지구와 팀을 접거나 펼칠 수 있습니다.</span>
            <span>미입력만을 켜면 아직 0명인 캠퍼스만 확인합니다.</span>
            <span>검색은 지구, 팀, 캠퍼스 이름 모두에 적용됩니다.</span>
          </div>

          <div className={styles.accordionList}>
            {districtGroups.length === 0 ? (
              <p className={styles.emptyText}>조건에 맞는 캠퍼스가 없습니다.</p>
            ) : (
              districtGroups.map((districtGroup) => {
                const districtOpen = isDistrictExpanded(districtGroup.district);

                return (
                  <div
                    key={districtGroup.district}
                    className={styles.districtPanel}
                  >
                    <button
                      type="button"
                      className={styles.districtHeader}
                      onClick={() => toggleDistrict(districtGroup.district)}
                    >
                      <span>{districtOpen ? '▾' : '▸'}</span>
                      <strong>{districtGroup.district}</strong>
                      <small>{districtGroup.campusCount}개 캠퍼스</small>
                      <small>미입력 {districtGroup.missingCount}개</small>
                      <b>{districtGroup.total.toLocaleString()}명</b>
                    </button>

                    {districtOpen && (
                      <div className={styles.teamList}>
                        {districtGroup.teams.map((teamGroup) => {
                          const teamOpen = isTeamExpanded(teamGroup.key);

                          return (
                            <div key={teamGroup.key} className={styles.teamPanel}>
                              <button
                                type="button"
                                className={styles.teamHeader}
                                onClick={() => toggleTeam(teamGroup.key)}
                              >
                                <span>{teamOpen ? '▾' : '▸'}</span>
                                <strong>{teamGroup.team}</strong>
                                <small>
                                  {teamGroup.campuses.length}개 캠퍼스
                                </small>
                                <small>미입력 {teamGroup.missingCount}개</small>
                                <b>{teamGroup.total.toLocaleString()}명</b>
                              </button>

                              {teamOpen && (
                                <div className={styles.campusGrid}>
                                  {teamGroup.campuses.map((campus) => (
                                    <div
                                      key={campus.key}
                                      className={styles.campusRow}
                                    >
                                      <span>{campus.campus}</span>
                                      <input
                                        type="number"
                                        min={0}
                                        value={
                                          participationTargets[campus.key] || ''
                                        }
                                        onChange={(event) =>
                                          handleTargetChange(
                                            campus.key,
                                            event.target.value
                                          )
                                        }
                                        placeholder="0"
                                      />
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

export default AdminParticipationTargetsPage;
