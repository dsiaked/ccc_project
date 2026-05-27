import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/Header';
import { supabase } from '../../lib/supabase';
import { getAdminRole } from '../../lib/adminService';
import type { ReturnBusReservation } from '../../types/reservation';
import styles from './AdminTicketPage.module.css';

interface ReservationWithUser extends ReturnBusReservation {
  userId: string;
}

type ParticipationScope = 'district' | 'team' | 'campus';
type CoverageScopeFilter = 'all' | ParticipationScope;

interface CoverageRow {
  key: string;
  scope: ParticipationScope;
  district: string;
  team: string;
  campus: string;
  label: string;
  reservationCount: number;
  confirmedCount: number;
  cancelledCount: number;
  participantTarget: number;
  reservationRate: number | null;
  reservationGap: number | null;
}

interface ReservationRow {
  id: string;
  user_id: string;
  name: string | null;
  phone: string | null;
  district: string | null;
  team: string | null;
  campus: string | null;
  station_preferences: ReturnBusReservation['stationPreferences'] | null;
  status: ReturnBusReservation['status'] | null;
  confirmed_ticket: ReturnBusReservation['confirmedTicket'] | null;
  data: Partial<ReturnBusReservation> | null;
  created_at: string | null;
  updated_at: string | null;
}

interface OrganizationUnit {
  district: string;
  team: string;
  campus: string;
}

interface CampusOptionRow {
  district: string | null;
  team: string | null;
  campus: string | null;
}

const PARTICIPATION_TARGETS_STORAGE_KEY =
  'admin_ticket_participation_targets';

const normalizeName = (value: string) => value.replace(/\s/g, '').trim();

const getRateStatus = (rate: number | null) => {
  if (rate === null) return 'unset';
  if (rate >= 100) return 'complete';
  if (rate >= 70) return 'healthy';
  if (rate >= 50) return 'watch';
  return 'low';
};

const AdminTicketPage = () => {
  const navigate = useNavigate();
  const [reservations, setReservations] = useState<ReservationWithUser[]>([]);
  const [organizationUnits, setOrganizationUnits] = useState<
    OrganizationUnit[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [coverageScopeFilter, setCoverageScopeFilter] =
    useState<CoverageScopeFilter>('campus');
  const [coverageSearchText, setCoverageSearchText] = useState('');
  const [participationTargets] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem(PARTICIPATION_TARGETS_STORAGE_KEY);

    if (!saved) return {};

    try {
      return JSON.parse(saved);
    } catch {
      return {};
    }
  });
  useEffect(() => {
    const checkAdminAndLoadReservations = async () => {
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

        const [
          { data: reservationData, error: reservationError },
          { data: campusOptionData, error: campusOptionError },
        ] = await Promise.all([
          supabase
            .from('reservations')
            .select(
              'id, user_id, name, phone, district, team, campus, station_preferences, status, confirmed_ticket, data, created_at, updated_at'
            )
            .order('created_at', { ascending: false }),
          supabase
            .from('campus_options')
            .select('district, team, campus')
            .order('district', { ascending: true })
            .order('team', { ascending: true })
            .order('campus', { ascending: true }),
        ]);

        if (reservationError) {
          throw reservationError;
        }

        if (campusOptionError) {
          throw campusOptionError;
        }

        const formattedReservations: ReservationWithUser[] = (
          reservationData || []
        ).map((item: ReservationRow) => {
          const savedData = item.data || {};

          return {
            id: savedData.id || item.id,
            name: savedData.name || item.name || '',
            phone: savedData.phone || item.phone || '',
            district: savedData.district || item.district || '서울지구',
            team: savedData.team || item.team || '',
            campus: savedData.campus || item.campus || '',
            stationPreferences:
              savedData.stationPreferences || item.station_preferences || [],
            status: savedData.status || item.status || 'requested',
            confirmedTicket:
              savedData.confirmedTicket || item.confirmed_ticket || undefined,
            requestedAt:
              savedData.requestedAt ||
              item.created_at ||
              new Date().toISOString(),
            updatedAt: savedData.updatedAt || item.updated_at || undefined,
            userId: item.user_id,
          } as ReservationWithUser;
        });

        const formattedOrganizationUnits: OrganizationUnit[] = (
          campusOptionData || []
        )
          .map((item: CampusOptionRow) => ({
            district: item.district || '미등록 지구',
            team: item.team || '미등록 팀',
            campus: item.campus || '미등록 캠퍼스',
          }))
          .filter(
            (item, index, array) =>
              array.findIndex(
                (target) =>
                  target.district === item.district &&
                  target.team === item.team &&
                  target.campus === item.campus
              ) === index
          );

        setReservations(formattedReservations);
        setOrganizationUnits(formattedOrganizationUnits);
      } catch (error) {
        console.error('Failed to load reservations:', error);
        alert('예약 정보를 로드할 수 없습니다.');
      } finally {
        setLoading(false);
      }
    };

    checkAdminAndLoadReservations();
  }, [navigate]);

  const getCoverageKey = (
    scope: ParticipationScope,
    district: string,
    team = '',
    campus = ''
  ) => `${scope}|${district}|${team}|${campus}`;

  const coverageRows = useMemo(() => {
    const rowMap = new Map<
      string,
      Omit<CoverageRow, 'participantTarget' | 'reservationRate' | 'reservationGap'>
    >();

    const ensureRow = (
      scope: ParticipationScope,
      district: string,
      team = '',
      campus = ''
    ) => {
      const key = getCoverageKey(scope, district, team, campus);
      const existing = rowMap.get(key);

      if (existing) return existing;

      const label =
        scope === 'district'
          ? district
          : scope === 'team'
            ? `${district} / ${team}`
            : `${district} / ${team} / ${campus}`;

      const next = {
        key,
        scope,
        district,
        team,
        campus,
        label,
        reservationCount: 0,
        confirmedCount: 0,
        cancelledCount: 0,
      };

      rowMap.set(key, next);
      return next;
    };

    organizationUnits.forEach((unit) => {
      ensureRow('district', unit.district);
      ensureRow('team', unit.district, unit.team);
      ensureRow('campus', unit.district, unit.team, unit.campus);
    });

    reservations.forEach((reservation) => {
      const district = reservation.district || '미등록 지구';
      const team = reservation.team || '미등록 팀';
      const campus = reservation.campus || '미등록 캠퍼스';
      const rows = [
        ensureRow('district', district),
        ensureRow('team', district, team),
        ensureRow('campus', district, team, campus),
      ];

      rows.forEach((row) => {
        if (reservation.status === 'cancelled') {
          row.cancelledCount += 1;
          return;
        }

        row.reservationCount += 1;

        if (reservation.status === 'confirmed') {
          row.confirmedCount += 1;
        }
      });
    });

    const baseRows = Array.from(rowMap.values());
    const getParticipantTarget = (
      row: Omit<
        CoverageRow,
        'participantTarget' | 'reservationRate' | 'reservationGap'
      >
    ) => {
      if (row.scope === 'campus') {
        return participationTargets[row.key] || 0;
      }

      return baseRows
        .filter((candidate) => {
          if (candidate.scope !== 'campus') return false;
          if (candidate.district !== row.district) return false;

          return row.scope === 'district' || candidate.team === row.team;
        })
        .reduce((sum, candidate) => {
          return sum + (participationTargets[candidate.key] || 0);
        }, 0);
    };

    return baseRows
      .map((row) => {
        const participantTarget = getParticipantTarget(row);
        const reservationGap =
          participantTarget > 0 ? participantTarget - row.reservationCount : null;

        return {
          ...row,
          participantTarget,
          reservationGap,
          reservationRate:
            participantTarget > 0
              ? (row.reservationCount / participantTarget) * 100
              : null,
        };
      })
      .sort((a, b) => {
        const scopeOrder = { district: 0, team: 1, campus: 2 };

        return (
          scopeOrder[a.scope] - scopeOrder[b.scope] ||
          a.district.localeCompare(b.district, 'ko') ||
          a.team.localeCompare(b.team, 'ko') ||
          a.campus.localeCompare(b.campus, 'ko')
        );
      });
  }, [organizationUnits, participationTargets, reservations]);

  const getTargetTotalByScope = (scope: ParticipationScope) =>
    coverageRows
      .filter((row) => row.scope === scope)
      .reduce((sum, row) => sum + row.participantTarget, 0);

  const districtParticipantTarget = getTargetTotalByScope('district');
  const teamParticipantTarget = getTargetTotalByScope('team');
  const campusParticipantTarget = getTargetTotalByScope('campus');
  const totalParticipantTarget =
    campusParticipantTarget ||
    teamParticipantTarget ||
    districtParticipantTarget ||
    0;

  const activeReservationCount = reservations.filter(
    (reservation) => reservation.status !== 'cancelled'
  ).length;
  const totalReservationRate =
    totalParticipantTarget > 0
      ? (activeReservationCount / totalParticipantTarget) * 100
      : null;

  const filteredCoverageRows = coverageRows.filter((row) => {
    const matchesScope =
      coverageScopeFilter === 'all' || row.scope === coverageScopeFilter;
    const searchValue = normalizeName(coverageSearchText);

    if (!matchesScope) return false;
    if (!searchValue) return true;

    return [row.label, row.district, row.team, row.campus].some((value) =>
      normalizeName(value).includes(searchValue)
    );
  });

  const campusCoverageRows = coverageRows.filter(
    (row) => row.scope === 'campus'
  );
  const lowReservationRateCampusCount = campusCoverageRows.filter(
    (row) => row.reservationRate !== null && row.reservationRate < 50
  ).length;

  if (loading) {
    return (
      <div className={styles.pageContainer}>
        <Header />
        <main className={styles.main}>
          <p>로딩 중...</p>
        </main>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className={styles.pageContainer}>
        <Header />
        <main className={styles.main}>
          <p>관리자만 접근할 수 있습니다.</p>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.pageContainer}>
      <Header />

      <main className={styles.main}>
        <div className={styles.topBar}>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => navigate('/admin/global')}
          >
            <ArrowLeft size={16} />
            전체 관리자
          </button>
        </div>

        <div className={styles.header}>
          <div>
            <p className={styles.eyebrow}>버스표 운영 현황</p>
            <h1>참여 기준 대비 신청률</h1>
            <p>
              캠퍼스별 참여 기준과 신청 현황을 비교해 배차 전 확인이 필요한
              조직을 점검합니다.
            </p>
          </div>
        </div>

        <div className={styles.statsBar}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>예매율</span>
            <span className={styles.statValue}>
              {totalReservationRate === null
                ? '-'
                : `${totalReservationRate.toFixed(1)}%`}
            </span>
            <span className={styles.statHint}>
              신청 {activeReservationCount.toLocaleString()}명 / 기준{' '}
              {totalParticipantTarget.toLocaleString()}명
            </span>
          </div>
        </div>

        <div className={styles.coverageSection}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>조직별 신청률</h2>
              <p>
                캠퍼스 참여 기준을 바탕으로 팀과 지구 신청률을 자동 합산합니다.
                기준 미입력 조직은 먼저 참여 기준을 설정해주세요.
              </p>
            </div>

          </div>

          <div className={styles.coverageToolbar}>
            <div className={styles.scopeTabs}>
              {[
                ['campus', '캠퍼스'],
                ['team', '팀'],
                ['district', '지구'],
                ['all', '전체'],
              ].map(([scope, label]) => (
                <button
                  key={scope}
                  type="button"
                  className={
                    coverageScopeFilter === scope ? styles.scopeTabActive : ''
                  }
                  onClick={() =>
                    setCoverageScopeFilter(scope as CoverageScopeFilter)
                  }
                >
                  {label}
                </button>
              ))}
            </div>

            <input
              className={styles.coverageSearchInput}
              type="search"
              value={coverageSearchText}
              onChange={(event) => setCoverageSearchText(event.target.value)}
              placeholder="지구, 팀, 캠퍼스 검색"
            />
          </div>

          <div className={styles.coverageInsightGrid}>
            <div className={styles.coverageInsight}>
              <span>예매율 50% 미만 캠퍼스 / 전체 캠퍼스</span>
              <strong>
                {lowReservationRateCampusCount.toLocaleString()} /{' '}
                {campusCoverageRows.length.toLocaleString()}개
              </strong>
            </div>
          </div>

          <div className={styles.coverageTableWrap}>
            <table className={styles.coverageTable}>
              <thead>
                <tr>
                  <th>단위</th>
                  <th>조직</th>
                  <th>예매/참여</th>
                  <th>예매율</th>
                  <th>확정</th>
                  <th>취소</th>
                </tr>
              </thead>

              <tbody>
                {filteredCoverageRows.length === 0 ? (
                  <tr>
                    <td className={styles.emptyCoverageCell} colSpan={6}>
                      조건에 맞는 예매 현황이 없습니다.
                    </td>
                  </tr>
                ) : (
                  filteredCoverageRows.map((row) => {
                    const isLowRate =
                      row.reservationRate !== null && row.reservationRate < 50;

                    return (
                      <tr
                        key={row.key}
                        className={isLowRate ? styles.coverageRowLow : ''}
                      >
                        <td>
                          <span
                            className={`${styles.scopeBadge} ${
                              styles[`scope_${row.scope}`]
                            }`}
                          >
                            {row.scope === 'district'
                              ? '지구'
                              : row.scope === 'team'
                                ? '팀'
                                : '캠퍼스'}
                          </span>
                        </td>
                        <td className={styles.coverageLabel}>{row.label}</td>
                        <td className={styles.peopleRatioCell}>
                          <strong>
                            {row.reservationCount.toLocaleString()}명 /{' '}
                            {row.participantTarget > 0
                              ? `${row.participantTarget.toLocaleString()}명`
                              : '-'}
                          </strong>
                          <span>예매 / 참여</span>
                        </td>
                        <td>
                          <div
                            className={`${styles.rateCell} ${
                              isLowRate ? styles.rateCellLow : ''
                            }`}
                          >
                            <div className={styles.rateBarTrack}>
                              <div
                                className={`${styles.rateBarFill} ${
                                  styles[
                                    `rate_${getRateStatus(row.reservationRate)}`
                                  ]
                                }`}
                                style={{
                                  width: `${
                                    row.reservationRate === null
                                      ? 0
                                      : Math.min(row.reservationRate, 100)
                                  }%`,
                                }}
                              />
                            </div>
                            <span>
                              {row.reservationRate === null
                                ? '-'
                                : `${row.reservationRate.toFixed(1)}%`}
                            </span>
                          </div>
                        </td>
                        <td>{row.confirmedCount.toLocaleString()}명</td>
                        <td>{row.cancelledCount.toLocaleString()}명</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminTicketPage;
