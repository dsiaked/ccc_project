import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AdminHeader from './AdminHeader';
import { supabase } from '../../lib/supabase';
import { getAdminRole } from '../../lib/adminService';
import { getParticipationTargetsSetting } from '../../lib/participationTargetsService';
import type { ReturnBusReservation } from '../../types/reservation';
import styles from './AdminTicketPage.module.css';

interface ReservationWithUser extends ReturnBusReservation {
  userId: string;
}

type ParticipationScope = 'district' | 'team' | 'campus';
type CoverageScopeFilter = 'all' | ParticipationScope;
type CoverageSortOption = 'organization' | 'rate-desc' | 'rate-asc';

interface CoverageRow {
  key: string;
  scope: ParticipationScope;
  district: string;
  team: string;
  campus: string;
  label: string;
  reservationCount: number;
  subscriberCount: number;
  confirmedCount: number;
  cancelledCount: number;
  participantTarget: number;
  reservationRate: number | null;
  reservationGap: number | null;
  campusAdminName: string | null;
  campusAdminPhone: string | null;
}

type CoverageBaseRow = Omit<
  CoverageRow,
  | 'participantTarget'
  | 'reservationRate'
  | 'reservationGap'
  | 'campusAdminName'
  | 'campusAdminPhone'
>;

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

interface CampusAdminProfile {
  name: string | null;
  phone: string | null;
}

interface CampusAdminRow {
  user_id: string;
  district: string | null;
  team: string | null;
  campus: string | null;
  profile: CampusAdminProfile | null;
}

interface CampusAdminRoleRow {
  user_id: string;
  district: string | null;
  team: string | null;
  campus: string | null;
}

interface ProfileRow {
  id: string;
  name: string | null;
  phone: string | null;
}

interface SubscriberProfileRow {
  id: string;
  district: string | null;
  team: string | null;
  campus: string | null;
}

const RESERVATION_PAGE_SIZE = 1000;

const normalizeName = (value: string) => value.replace(/\s/g, '').trim();

const getRateStatus = (rate: number | null) => {
  if (rate === null) return 'unset';
  if (rate >= 100) return 'complete';
  if (rate >= 70) return 'healthy';
  if (rate >= 50) return 'watch';
  return 'low';
};

const getCoverageKey = (
  scope: ParticipationScope,
  district: string,
  team = '',
  campus = ''
) => `${scope}|${district}|${team}|${campus}`;

const getAllReservationRows = async (): Promise<ReservationRow[]> => {
  const rows: ReservationRow[] = [];
  let totalCount: number | null = null;

  while (true) {
    const from = rows.length;
    const { data, count, error } = await supabase
      .from('reservations')
      .select(
        'id, user_id, name, phone, district, team, campus, station_preferences, status, confirmed_ticket, data, created_at, updated_at',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + RESERVATION_PAGE_SIZE - 1);

    if (error) throw error;
    totalCount = count ?? totalCount;

    const page = (data || []) as ReservationRow[];
    rows.push(...page);

    if (
      page.length === 0 ||
      (totalCount !== null && rows.length >= totalCount) ||
      (totalCount === null && page.length < RESERVATION_PAGE_SIZE)
    ) {
      return rows;
    }
  }
};

const getAllSubscriberProfileRows = async (): Promise<
  SubscriberProfileRow[]
> => {
  const rows: SubscriberProfileRow[] = [];
  let totalCount: number | null = null;

  while (true) {
    const from = rows.length;
    const { data, count, error } = await supabase
      .from('profiles')
      .select('id, district, team, campus', { count: 'exact' })
      .order('id', { ascending: false })
      .range(from, from + RESERVATION_PAGE_SIZE - 1);

    if (error) throw error;
    totalCount = count ?? totalCount;

    const page = (data || []) as SubscriberProfileRow[];
    rows.push(...page);

    if (
      page.length === 0 ||
      (totalCount !== null && rows.length >= totalCount) ||
      (totalCount === null && page.length < RESERVATION_PAGE_SIZE)
    ) {
      return rows;
    }
  }
};

const AdminTicketPage = () => {
  const navigate = useNavigate();
  const [reservations, setReservations] = useState<ReservationWithUser[]>([]);
  const [organizationUnits, setOrganizationUnits] = useState<
    OrganizationUnit[]
  >([]);
  const [campusAdmins, setCampusAdmins] = useState<CampusAdminRow[]>([]);
  const [subscriberProfiles, setSubscriberProfiles] = useState<
    SubscriberProfileRow[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [coverageScopeFilter, setCoverageScopeFilter] =
    useState<CoverageScopeFilter>('campus');
  const [coverageSearchText, setCoverageSearchText] = useState('');
  const [coverageSortOption, setCoverageSortOption] =
    useState<CoverageSortOption>('organization');
  const [participationTargets, setParticipationTargets] = useState<
    Record<string, number>
  >({});
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
          reservationData,
          subscriberProfileData,
          { data: campusOptionData, error: campusOptionError },
          { data: campusAdminData, error: campusAdminError },
          participationSetting,
        ] = await Promise.all([
          getAllReservationRows(),
          getAllSubscriberProfileRows(),
          supabase
            .from('campus_options')
            .select('district, team, campus')
            .order('district', { ascending: true })
            .order('team', { ascending: true })
            .order('campus', { ascending: true }),
          supabase
            .from('admin_roles')
            .select('user_id, district, team, campus')
            .eq('role', 'campus_admin')
            .order('updated_at', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false, nullsFirst: false }),
          getParticipationTargetsSetting(),
        ]);

        if (campusOptionError) {
          throw campusOptionError;
        }

        if (campusAdminError) {
          console.warn('캠퍼스 관리자 정보 조회 실패:', campusAdminError);
        }

        const campusAdminRoles = campusAdminError
          ? []
          : ((campusAdminData || []) as CampusAdminRoleRow[]);
        const campusAdminUserIds = Array.from(
          new Set(campusAdminRoles.map((admin) => admin.user_id).filter(Boolean))
        );
        let profileMap = new Map<string, CampusAdminProfile>();

        if (campusAdminUserIds.length > 0) {
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('id, name, phone')
            .in('id', campusAdminUserIds);

          if (profileError) {
            console.warn('캠퍼스 관리자 프로필 조회 실패:', profileError);
          } else {
            profileMap = new Map(
              ((profileData || []) as ProfileRow[]).map((profile) => [
                profile.id,
                {
                  name: profile.name,
                  phone: profile.phone,
                },
              ])
            );
          }
        }

        const formattedCampusAdmins: CampusAdminRow[] = campusAdminRoles.map(
          (admin) => ({
            ...admin,
            profile: profileMap.get(admin.user_id) || null,
          })
        );

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

        const savedOrganizationUnits = participationSetting.rows
          .map((row) => ({
            district: row.district.trim(),
            team: row.team.trim(),
            campus: row.campus.trim(),
          }))
          .filter((row) => row.district && row.team && row.campus);
        const formattedOrganizationUnits: OrganizationUnit[] =
          (savedOrganizationUnits.length > 0
            ? savedOrganizationUnits
            : null) ??
          (campusOptionData || [])
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
        setSubscriberProfiles(subscriberProfileData);
        setOrganizationUnits(formattedOrganizationUnits);
        setCampusAdmins(formattedCampusAdmins);
        setParticipationTargets(participationSetting.targets);
      } catch (error) {
        console.error('Failed to load reservations:', error);
        alert('예약 정보를 로드할 수 없습니다.');
      } finally {
        setLoading(false);
      }
    };

    checkAdminAndLoadReservations();
  }, [navigate]);

  const campusAdminMap = useMemo(() => {
    const map = new Map<string, CampusAdminProfile>();

    campusAdmins.forEach((admin) => {
      if (!admin.district || !admin.team || !admin.campus) return;

      const key = getCoverageKey(
        'campus',
        admin.district,
        admin.team,
        admin.campus
      );

      if (map.has(key)) return;

      map.set(key, {
        name: admin.profile?.name || null,
        phone: admin.profile?.phone || null,
      });
    });

    return map;
  }, [campusAdmins]);

  const coverageRows = useMemo(() => {
    const rowMap = new Map<string, CoverageBaseRow>();

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
        subscriberCount: 0,
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

    subscriberProfiles.forEach((profile) => {
      if (!profile.district || !profile.team || !profile.campus) return;

      [
        ensureRow('district', profile.district),
        ensureRow('team', profile.district, profile.team),
        ensureRow('campus', profile.district, profile.team, profile.campus),
      ].forEach((row) => {
        row.subscriberCount += 1;
      });
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
      row: CoverageBaseRow
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
          campusAdminName:
            row.scope === 'campus'
              ? campusAdminMap.get(row.key)?.name || null
              : null,
          campusAdminPhone:
            row.scope === 'campus'
              ? campusAdminMap.get(row.key)?.phone || null
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
  }, [
    campusAdminMap,
    organizationUnits,
    participationTargets,
    reservations,
    subscriberProfiles,
  ]);

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
  const subscriberCount = subscriberProfiles.length;
  const filteredCoverageRows = useMemo(() => {
    const searchValue = normalizeName(coverageSearchText);
    const rows = coverageRows.filter((row) => {
      const matchesScope =
        coverageScopeFilter === 'all' || row.scope === coverageScopeFilter;

      if (!matchesScope) return false;
      if (!searchValue) return true;

      return [row.label, row.district, row.team, row.campus].some((value) =>
        normalizeName(value).includes(searchValue)
      );
    });

    if (coverageSortOption === 'organization') return rows;

    return [...rows].sort((a, b) => {
      if (a.reservationRate === null) return b.reservationRate === null ? 0 : 1;
      if (b.reservationRate === null) return -1;

      const rateDifference =
        coverageSortOption === 'rate-desc'
          ? b.reservationRate - a.reservationRate
          : a.reservationRate - b.reservationRate;

      return rateDifference || a.label.localeCompare(b.label, 'ko');
    });
  }, [
    coverageRows,
    coverageScopeFilter,
    coverageSearchText,
    coverageSortOption,
  ]);

  const campusCoverageRows = coverageRows.filter(
    (row) => row.scope === 'campus'
  );
  const lowReservationRateCampusCount = campusCoverageRows.filter(
    (row) => row.reservationRate !== null && row.reservationRate < 50
  ).length;

  if (loading) {
    return (
      <div className={styles.pageContainer}>
        <AdminHeader />
        <main className={styles.main}>
          <p>로딩 중...</p>
        </main>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className={styles.pageContainer}>
        <AdminHeader />
        <main className={styles.main}>
          <p>관리자만 접근할 수 있습니다.</p>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.pageContainer}>
      <AdminHeader />

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
          {[
            {
              label: '예매인원',
              value: activeReservationCount,
              description: '관리자 신청 취소 제외',
              tone: 'reservation',
            },
            {
              label: '가입인원',
              value: subscriberCount,
              description: '전체 가입 프로필',
              tone: 'subscriber',
            },
            {
              label: '수련회 참여인원',
              value: totalParticipantTarget,
              description: '등록된 참여 기준 합계',
              tone: 'participant',
            },
          ].map((item) => (
            <div
              key={item.label}
              className={`${styles.stat} ${styles[`stat_${item.tone}`]}`}
            >
              <span className={styles.statLabel}>{item.label}</span>
              <strong className={styles.statValue}>
                {item.value.toLocaleString()}
                <small>명</small>
              </strong>
              <span className={styles.statHint}>{item.description}</span>
            </div>
          ))}
        </div>

        <div className={styles.coverageSection}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>조직별 신청률</h2>
              <p>
                참여 인원은 수련회 등록 인원이며, 예매 인원은 실제 수련회 버스를
                예매한 인원입니다. 두 집계 기준이 달라 예매율은 100%를 초과하거나
                100%에 미달할 수 있습니다. 캠퍼스 참여 기준을 바탕으로 팀과 지구
                신청률을 자동 합산하며, 기준 미입력 조직은 먼저 참여 기준을
                설정해주세요.
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

            <div className={styles.coverageToolbarActions}>
              <select
                className={styles.coverageSortSelect}
                aria-label="예매 현황 정렬"
                value={coverageSortOption}
                onChange={(event) =>
                  setCoverageSortOption(event.target.value as CoverageSortOption)
                }
              >
                <option value="organization">조직 순</option>
                <option value="rate-desc">예매율 높은 순</option>
                <option value="rate-asc">예매율 낮은 순</option>
              </select>

              <input
                className={styles.coverageSearchInput}
                type="search"
                value={coverageSearchText}
                onChange={(event) => setCoverageSearchText(event.target.value)}
                placeholder="지구, 팀, 캠퍼스 검색"
              />
            </div>
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
                  <th className={styles.peopleHeader}>
                    예매인원 / 가입인원 / 수련회 참여인원
                  </th>
                  <th>예매율</th>
                  <th>관리자</th>
                  <th>확정</th>
                  <th>관리자에 의한 신청 취소</th>
                </tr>
              </thead>

              <tbody>
                {filteredCoverageRows.length === 0 ? (
                  <tr>
                    <td className={styles.emptyCoverageCell} colSpan={7}>
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
                          <span>
                            <em>예매</em>
                            <strong>{row.reservationCount.toLocaleString()}명</strong>
                          </span>
                          <span>
                            <em>가입</em>
                            <strong>{row.subscriberCount.toLocaleString()}명</strong>
                          </span>
                          <span>
                            <em>참여</em>
                            <strong>
                              {row.participantTarget > 0
                                ? `${row.participantTarget.toLocaleString()}명`
                                : '-'}
                            </strong>
                          </span>
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
                        <td className={styles.campusAdminCell}>
                          {row.scope !== 'campus' ? (
                            <span>-</span>
                          ) : row.campusAdminName || row.campusAdminPhone ? (
                            <>
                              <strong>{row.campusAdminName || '이름 없음'}</strong>
                              <span>{row.campusAdminPhone || '번호 없음'}</span>
                            </>
                          ) : (
                            <span>미등록</span>
                          )}
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
