import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, RefreshCw, RotateCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AdminHeader from './AdminHeader';
import { supabase } from '../../lib/supabase';
import { getParticipationTargetsSetting } from '../../lib/participationTargetsService';
import type { ReturnBusReservation } from '../../types/reservation';
import styles from './AdminTicketPage.module.css';

interface ReservationWithUser extends ReturnBusReservation {
  userId: string;
}

type ParticipationScope = 'district' | 'team' | 'campus';
type CoverageScopeFilter = 'all' | 'individual' | ParticipationScope;
type AttentionFilter = 'all' | 'low-reservation' | 'low-subscriber';
type CoverageSortOption =
  | 'organization'
  | 'rate-desc'
  | 'rate-asc'
  | 'subscriber-rate-desc'
  | 'subscriber-rate-asc';

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
  participantTarget: number;
  allocationRate: number | null;
  reservationRate: number | null;
  subscriberRate: number | null;
  reservationGap: number | null;
  campusAdminName: string | null;
  campusAdminPhone: string | null;
  campusAdminManagedCount: number;
  personPhone: string | null;
}

type CoverageBaseRow = Omit<
  CoverageRow,
  | 'participantTarget'
  | 'allocationRate'
  | 'reservationRate'
  | 'subscriberRate'
  | 'reservationGap'
  | 'campusAdminName'
  | 'campusAdminPhone'
  | 'campusAdminManagedCount'
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
  managedCampusCount?: number;
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
  name: string | null;
  phone: string | null;
  district: string | null;
  team: string | null;
  campus: string | null;
}

const RESERVATION_PAGE_SIZE = 1000;
const SEOUL_DISTRICT = '서울지구';

const normalizeName = (value: string) => value.replace(/\s/g, '').trim();
const isIndividualCoverageRow = (row: Pick<CoverageRow, 'scope' | 'district'>) =>
  row.scope === 'campus' && row.district !== SEOUL_DISTRICT;

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
  campus = '',
  identity = ''
) => `${scope}|${district}|${team}|${campus}${identity ? `|${identity}` : ''}`;

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
      .select('id, name, phone, district, team, campus', { count: 'exact' })
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
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [coverageScopeFilter, setCoverageScopeFilter] =
    useState<CoverageScopeFilter>('campus');
  const [attentionFilter, setAttentionFilter] =
    useState<AttentionFilter>('all');
  const [coverageSearchText, setCoverageSearchText] = useState('');
  const [coverageSortOption, setCoverageSortOption] =
    useState<CoverageSortOption>('organization');
  const [participationTargets, setParticipationTargets] = useState<
    Record<string, number>
  >({});
  useEffect(() => {
    const loadReservations = async () => {
      setRefreshing(true);
      setLoadError('');

      try {
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
          console.warn('캠퍼스 회계 순장님 정보 조회 실패:', campusAdminError);
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
            console.warn('캠퍼스 회계 순장님 프로필 조회 실패:', profileError);
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
            id: item.id,
            name: item.name || savedData.name || '',
            phone: item.phone || savedData.phone || '',
            district: item.district || savedData.district || '서울지구',
            team: item.team || savedData.team || '',
            campus: item.campus || savedData.campus || '',
            stationPreferences:
              item.station_preferences || savedData.stationPreferences || [],
            status: item.status || savedData.status || 'requested',
            confirmedTicket:
              item.confirmed_ticket || savedData.confirmedTicket || undefined,
            requestedAt:
              item.created_at ||
              savedData.requestedAt ||
              new Date().toISOString(),
            updatedAt: item.updated_at || savedData.updatedAt || undefined,
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
        setLastUpdatedAt(new Date());
      } catch (error) {
        console.error('Failed to load reservations:', error);
        setLoadError('신청 현황을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    };

    void loadReservations();
  }, [reloadKey]);

  const campusAdminMap = useMemo(() => {
    const map = new Map<string, CampusAdminProfile>();
    const managedCampusCounts = new Map<string, number>();

    campusAdmins.forEach((admin) => {
      managedCampusCounts.set(
        admin.user_id,
        (managedCampusCounts.get(admin.user_id) ?? 0) + 1
      );
    });

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
        managedCampusCount: managedCampusCounts.get(admin.user_id) ?? 1,
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
      campus = '',
      identity = '',
      labelOverride = '',
      personPhone: string | null = null
    ) => {
      const key = getCoverageKey(scope, district, team, campus, identity);
      const existing = rowMap.get(key);

      if (existing) {
        if (!existing.personPhone && personPhone) existing.personPhone = personPhone;
        return existing;
      }

      const label = labelOverride || (
        scope === 'district'
          ? district
          : scope === 'team'
            ? `${district} / ${team}`
            : `${district} / ${team} / ${campus}`
      );

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
        personPhone,
      };

      rowMap.set(key, next);
      return next;
    };

    organizationUnits.forEach((unit) => {
      if (unit.district !== SEOUL_DISTRICT) return;

      ensureRow('district', unit.district);
      ensureRow('team', unit.district, unit.team);
      ensureRow('campus', unit.district, unit.team, unit.campus);
    });

    subscriberProfiles.forEach((profile) => {
      if (!profile.district) return;
      const team = profile.team || '미등록 팀';
      const campus = profile.campus || '미등록 캠퍼스';

      const detailRow =
        profile.district === SEOUL_DISTRICT
          ? ensureRow('campus', profile.district, team, campus)
          : ensureRow(
              'campus',
              profile.district,
              team,
              campus,
              profile.id,
              `${profile.name || '이름 미등록'} · ${profile.district} / ${campus}`,
              profile.phone
            );

      const rows =
        profile.district === SEOUL_DISTRICT
          ? [
              ensureRow('district', profile.district),
              ensureRow('team', profile.district, team),
              detailRow,
            ]
          : [detailRow];

      rows.forEach((row) => {
        row.subscriberCount += 1;
      });
    });

    reservations.forEach((reservation) => {
      const district = reservation.district || '미등록 지구';
      const team = reservation.team || '미등록 팀';
      const campus = reservation.campus || '미등록 캠퍼스';
      const detailRow =
        district === SEOUL_DISTRICT
          ? ensureRow('campus', district, team, campus)
          : ensureRow(
              'campus',
              district,
              team,
              campus,
              reservation.userId,
              `${reservation.name || '이름 미등록'} · ${district} / ${campus}`,
              reservation.phone
            );
      const rows =
        district === SEOUL_DISTRICT
          ? [
              ensureRow('district', district),
              ensureRow('team', district, team),
              detailRow,
            ]
          : [detailRow];

      rows.forEach((row) => {
        if (reservation.status === 'cancelled') {
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
        const isIndividualUnit = isIndividualCoverageRow(row);
        const reservationGap =
          participantTarget > 0 ? participantTarget - row.reservationCount : null;

        return {
          ...row,
          participantTarget,
          reservationGap,
          allocationRate:
            row.reservationCount > 0
              ? (row.confirmedCount / row.reservationCount) * 100
              : null,
          reservationRate:
            !isIndividualUnit && row.subscriberCount > 0
              ? (row.reservationCount / row.subscriberCount) * 100
              : null,
          subscriberRate:
            !isIndividualUnit && participantTarget > 0
              ? (row.subscriberCount / participantTarget) * 100
              : null,
          campusAdminName:
            row.scope === 'campus'
              ? campusAdminMap.get(row.key)?.name || null
              : null,
          campusAdminPhone:
            row.scope === 'campus'
              ? campusAdminMap.get(row.key)?.phone || null
              : null,
          campusAdminManagedCount:
            row.scope === 'campus'
              ? campusAdminMap.get(row.key)?.managedCampusCount || 0
              : 0,
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
        coverageScopeFilter === 'all' ||
        (coverageScopeFilter === 'individual'
          ? isIndividualCoverageRow(row)
          : row.scope === coverageScopeFilter &&
            (coverageScopeFilter !== 'campus' || !isIndividualCoverageRow(row)));
      const matchesAttention =
        attentionFilter === 'all' ||
        (attentionFilter === 'low-reservation' &&
          row.reservationRate !== null &&
          row.reservationRate < 50) ||
        (attentionFilter === 'low-subscriber' &&
          row.subscriberRate !== null &&
          row.subscriberRate < 50);

      if (!matchesScope || !matchesAttention) return false;
      if (!searchValue) return true;

      return [
        row.label,
        row.district,
        row.team,
        row.campus,
        row.campusAdminName || '',
        row.campusAdminPhone || '',
        row.personPhone || '',
      ].some((value) => normalizeName(value).includes(searchValue));
    });

    if (coverageSortOption === 'organization') return rows;

    return [...rows].sort((a, b) => {
      const rateKey = coverageSortOption.startsWith('subscriber-rate')
        ? 'subscriberRate'
        : 'reservationRate';
      const aRate = a[rateKey];
      const bRate = b[rateKey];

      if (aRate === null) return bRate === null ? 0 : 1;
      if (bRate === null) return -1;

      const rateDifference =
        coverageSortOption.endsWith('-desc') ? bRate - aRate : aRate - bRate;

      return rateDifference || a.label.localeCompare(b.label, 'ko');
    });
  }, [
    coverageRows,
    attentionFilter,
    coverageScopeFilter,
    coverageSearchText,
    coverageSortOption,
  ]);

  const ratedCampusCoverageRows = coverageRows.filter(
    (row) => row.scope === 'campus' && !isIndividualCoverageRow(row)
  );
  const lowReservationRateCampusCount = ratedCampusCoverageRows.filter(
    (row) => row.reservationRate !== null && row.reservationRate < 50
  ).length;
  const lowSubscriberRateCampusCount = ratedCampusCoverageRows.filter(
    (row) => row.subscriberRate !== null && row.subscriberRate < 50
  ).length;
  const totalReservationRate =
    subscriberCount > 0 ? (activeReservationCount / subscriberCount) * 100 : null;
  const totalSubscriberRate =
    totalParticipantTarget > 0
      ? (subscriberCount / totalParticipantTarget) * 100
      : null;
  const hasActiveFilters =
    coverageScopeFilter !== 'campus' ||
    attentionFilter !== 'all' ||
    coverageSearchText.trim() !== '' ||
    coverageSortOption !== 'organization';

  const resetFilters = () => {
    setCoverageScopeFilter('campus');
    setAttentionFilter('all');
    setCoverageSearchText('');
    setCoverageSortOption('organization');
  };

  const applyAttentionFilter = (filter: AttentionFilter) => {
    const nextFilter = attentionFilter === filter ? 'all' : filter;

    setCoverageScopeFilter('campus');
    setAttentionFilter(nextFilter);
    setCoverageSortOption(
      nextFilter === 'all'
        ? 'organization'
        : filter === 'low-subscriber'
          ? 'subscriber-rate-asc'
          : 'rate-asc'
    );
  };

  if (loading) {
    return (
      <div className={styles.pageContainer}>
        <AdminHeader />
        <main className={styles.main}>
          <div className={styles.loadingCard} aria-live="polite">
            <RefreshCw size={20} />
            <strong>신청 현황을 불러오는 중입니다.</strong>
            <span>조직별 가입·신청 데이터를 집계하고 있습니다.</span>
          </div>
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
            onClick={() => navigate('/admin/dashboard')}
          >
            <ArrowLeft size={16} />
            전체 관리자 대시보드
          </button>
        </div>

        <div className={styles.header}>
          <div>
            <p className={styles.eyebrow}>버스표 운영 현황</p>
            <h1>가입·신청 현황</h1>
            <p>
              서울지구는 캠퍼스별로, 기타 지구는 개인 단위로 가입·신청 현황을
              비교해 배차 전 확인이 필요한 대상을 점검합니다.
            </p>
          </div>
          <div className={styles.refreshArea}>
            <span>
              {lastUpdatedAt
                ? `마지막 갱신 ${lastUpdatedAt.toLocaleTimeString('ko-KR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}`
                : '아직 갱신되지 않음'}
            </span>
            <button
              type="button"
              className={styles.refreshButton}
              disabled={refreshing}
              onClick={() => setReloadKey((value) => value + 1)}
            >
              <RefreshCw size={15} />
              {refreshing ? '갱신 중...' : '새로고침'}
            </button>
          </div>
        </div>

        {loadError && (
          <div className={styles.errorBanner} role="alert">
            <span>{loadError}</span>
            <button
              type="button"
              onClick={() => setReloadKey((value) => value + 1)}
            >
              다시 시도
            </button>
          </div>
        )}

        <div className={styles.statsBar}>
          {[
            {
              label: '신청 인원',
              value: activeReservationCount,
              description: '관리자 신청 취소 제외',
              tone: 'reservation',
            },
            {
              label: '가입 인원',
              value: subscriberCount,
              description: '전체 가입 프로필',
              tone: 'subscriber',
            },
            {
              label: '수련회 참여인원',
              value: totalParticipantTarget,
              description: '등록된 예상 참여 인원 합계',
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
              <h2>조직별 신청률 및 가입률</h2>
              <p>
                배차율은 신청 인원 중 배차가 확정된 비율(확정 인원 ÷ 신청 인원)입니다.
                신청률은 가입 인원 중 버스를 신청한 비율(신청 인원 ÷ 가입 인원)이며,
                가입률은 예상 참여 인원 중 가입을 완료한 비율(가입 인원 ÷ 참여 인원)입니다.
                서울지구 캠퍼스와 기타 지구 개인 데이터를 바탕으로 팀과 지구 비율도
                자동 합산합니다.
              </p>
            </div>

          </div>

          <div className={styles.coverageToolbar}>
            <div className={styles.scopeTabs}>
              {[
                ['campus', '캠퍼스'],
                ['individual', '개인-기타지구'],
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
                aria-label="신청 현황 정렬"
                value={coverageSortOption}
                onChange={(event) =>
                  setCoverageSortOption(event.target.value as CoverageSortOption)
                }
              >
                <option value="organization">조직 순</option>
                <option value="rate-desc">신청률 높은 순</option>
                <option value="rate-asc">신청률 낮은 순</option>
                <option value="subscriber-rate-desc">가입률 높은 순</option>
                <option value="subscriber-rate-asc">가입률 낮은 순</option>
              </select>

              <input
                className={styles.coverageSearchInput}
                type="search"
                value={coverageSearchText}
                onChange={(event) => setCoverageSearchText(event.target.value)}
                placeholder="조직, 관리자, 개인 연락처 검색"
              />
            </div>
          </div>

          <div className={styles.coverageInsightGrid}>
            <div className={styles.coverageInsight}>
              <span>전체 신청률 · 신청 인원 / 가입 인원</span>
              <strong>
                {totalReservationRate === null
                  ? '-'
                  : `${totalReservationRate.toFixed(1)}%`}
              </strong>
            </div>
            <div className={styles.coverageInsight}>
              <span>전체 가입률 · 가입 인원 / 참여 인원</span>
              <strong>
                {totalSubscriberRate === null ? '-' : `${totalSubscriberRate.toFixed(1)}%`}
              </strong>
            </div>
            <button
              type="button"
              className={`${styles.coverageInsight} ${styles.coverageInsightButton} ${
                attentionFilter === 'low-reservation'
                  ? styles.coverageInsightActive
                  : ''
              }`}
              aria-pressed={attentionFilter === 'low-reservation'}
              onClick={() => applyAttentionFilter('low-reservation')}
            >
              <span>신청률 50% 미만 캠퍼스 / 전체 캠퍼스</span>
              <strong>
                {lowReservationRateCampusCount.toLocaleString()} /{' '}
                {ratedCampusCoverageRows.length.toLocaleString()}개
              </strong>
              <em>클릭하여 목록 필터링</em>
            </button>
            <button
              type="button"
              className={`${styles.coverageInsight} ${styles.coverageInsightButton} ${
                attentionFilter === 'low-subscriber'
                  ? styles.coverageInsightActive
                  : ''
              }`}
              aria-pressed={attentionFilter === 'low-subscriber'}
              onClick={() => applyAttentionFilter('low-subscriber')}
            >
              <span>가입률 50% 미만 캠퍼스 / 전체 캠퍼스</span>
              <strong>
                {lowSubscriberRateCampusCount.toLocaleString()} /{' '}
                {ratedCampusCoverageRows.length.toLocaleString()}개
              </strong>
              <em>클릭하여 목록 필터링</em>
            </button>
          </div>

          <div className={styles.tableMeta}>
            <div className={styles.resultSummary} aria-live="polite">
              전체 {coverageRows.length.toLocaleString()}개 중{' '}
              <strong>{filteredCoverageRows.length.toLocaleString()}개</strong> 표시
              {attentionFilter !== 'all' && (
                <span className={styles.activeFilterChip}>
                  {attentionFilter === 'low-reservation'
                    ? '신청률 50% 미만'
                    : '가입률 50% 미만'}
                </span>
              )}
            </div>
            <div className={styles.rateLegend} aria-label="비율 상태 기준">
              <span><i className={styles.legendLow} />낮음 50% 미만</span>
              <span><i className={styles.legendWatch} />주의 50~69%</span>
              <span><i className={styles.legendHealthy} />양호 70~99%</span>
              <span><i className={styles.legendComplete} />완료 100% 이상</span>
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                className={styles.resetButton}
                onClick={resetFilters}
              >
                <RotateCcw size={14} />
                필터 초기화
              </button>
            )}
          </div>

          <p className={styles.tableScrollHint}>
            표를 좌우로 밀어 상세 항목을 확인할 수 있습니다.
          </p>

          <div
            className={styles.coverageTableWrap}
            role="region"
            aria-label="조직별 배차율, 신청률 및 가입률 표"
            tabIndex={0}
          >
            <table className={styles.coverageTable}>
              <thead>
                <tr>
                  <th>단위</th>
                  <th>조직</th>
                  <th className={styles.peopleHeader}>
                    확정 / 신청 / 가입 / 참여
                  </th>
                  <th>배차율 (확정/신청)</th>
                  <th>신청률 (신청/가입)</th>
                  <th>가입률 (가입/참여)</th>
                  <th>관리자 / 연락처</th>
                </tr>
              </thead>

              <tbody>
                {filteredCoverageRows.length === 0 ? (
                  <tr>
                    <td className={styles.emptyCoverageCell} colSpan={7}>
                      조건에 맞는 신청 현황이 없습니다.
                    </td>
                  </tr>
                ) : (
                  filteredCoverageRows.map((row) => {
                    const isIndividualUnit = isIndividualCoverageRow(row);
                    const isLowReservationRate =
                      row.reservationRate !== null && row.reservationRate < 50;
                    const isLowSubscriberRate =
                      row.subscriberRate !== null && row.subscriberRate < 50;
                    const isLowRate =
                      isLowReservationRate || isLowSubscriberRate;

                    return (
                      <tr
                        key={row.key}
                        className={isLowRate ? styles.coverageRowLow : ''}
                      >
                        <td>
                          <span
                            className={`${styles.scopeBadge} ${
                              styles[
                                `scope_${isIndividualUnit ? 'person' : row.scope}`
                              ]
                            }`}
                          >
                            {row.scope === 'district'
                              ? '지구'
                              : row.scope === 'team'
                                ? '팀'
                                : isIndividualUnit
                                  ? '개인 - 기타지구'
                                  : '캠퍼스'}
                          </span>
                        </td>
                        <td className={styles.coverageLabel}>{row.label}</td>
                        <td className={styles.peopleRatioCell}>
                          <span>
                            <em>확정</em>
                            <strong>{row.confirmedCount.toLocaleString()}명</strong>
                          </span>
                          <span>
                            <em>신청</em>
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
                          <div className={styles.rateCell}>
                            <div className={styles.rateBarTrack}>
                              <div
                                className={`${styles.rateBarFill} ${
                                  styles[`rate_${getRateStatus(row.allocationRate)}`]
                                }`}
                                style={{
                                  width: `${
                                    row.allocationRate === null
                                      ? 0
                                      : Math.min(row.allocationRate, 100)
                                  }%`,
                                }}
                              />
                            </div>
                            <span>
                              {row.allocationRate === null
                                ? '-'
                                : `${row.allocationRate.toFixed(1)}%`}
                            </span>
                          </div>
                        </td>
                        <td>
                          {isIndividualUnit ? (
                            <span className={styles.notApplicable}>-</span>
                          ) : (
                            <div
                              className={`${styles.rateCell} ${
                                isLowReservationRate ? styles.rateCellLow : ''
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
                          )}
                        </td>
                        <td>
                          {isIndividualUnit ? (
                            <span className={styles.notApplicable}>-</span>
                          ) : (
                            <div
                              className={`${styles.rateCell} ${
                                isLowSubscriberRate ? styles.rateCellLow : ''
                              }`}
                            >
                              <div className={styles.rateBarTrack}>
                                <div
                                  className={`${styles.rateBarFill} ${
                                    styles[`rate_${getRateStatus(row.subscriberRate)}`]
                                  }`}
                                  style={{
                                    width: `${
                                      row.subscriberRate === null
                                        ? 0
                                        : Math.min(row.subscriberRate, 100)
                                    }%`,
                                  }}
                                />
                              </div>
                              <span>
                                {row.subscriberRate === null
                                  ? '-'
                                  : `${row.subscriberRate.toFixed(1)}%`}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className={styles.campusAdminCell}>
                          <div className={styles.campusAdminContent}>
                            {isIndividualUnit ? (
                              row.personPhone ? (
                                <a
                                  className={styles.phoneLink}
                                  href={`tel:${row.personPhone.replace(/[^\d+]/g, '')}`}
                                >
                                  {row.personPhone}
                                </a>
                              ) : (
                                <span>번호 없음</span>
                              )
                            ) : row.scope !== 'campus' ? (
                              <span>-</span>
                            ) : row.campusAdminName || row.campusAdminPhone ? (
                              <>
                                <strong>{row.campusAdminName || '이름 없음'}</strong>
                                {row.campusAdminPhone ? (
                                  <a
                                    className={styles.phoneLink}
                                    href={`tel:${row.campusAdminPhone.replace(/[^\d+]/g, '')}`}
                                  >
                                    {row.campusAdminPhone}
                                  </a>
                                ) : (
                                  <span>번호 없음</span>
                                )}
                                {row.campusAdminManagedCount > 1 && (
                                  <span className={styles.multiCampusAdminBadge}>
                                    총 {row.campusAdminManagedCount}개 캠퍼스 관리
                                  </span>
                                )}
                              </>
                            ) : (
                              <span>미등록</span>
                            )}
                          </div>
                        </td>
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
