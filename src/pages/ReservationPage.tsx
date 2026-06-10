import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlertTriangle,
  Bus,
  Check,
  Coins,
  Copy,
  LoaderCircle,
  MapPin,
  Search,
  Trash2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import LoginRequiredModal from '../components/LoginRequiredModal';
import {
  getDistrictOptions,
  getTeamOptions,
  getCampusOptions,
  type DistrictOption,
  type TeamOption,
  type CampusOption,
} from '../lib/organizationService';
import type { StationOption } from '../types/station';
import { getStationOptions } from '../lib/stationService';

import type { ReturnBusReservation, StationPreference } from '../types/reservation';
import styles from './ReservationPage.module.css';

import { supabase } from '../lib/supabase';
import { createLoginRequiredRedirectState } from '../utils/redirect';
import {
  saveReservation,
  deleteReservation,
  getReservation,
} from '../lib/reservationService';
import {
  formatReservationDeadline,
  getReservationDeadline,
  type ReservationDeadlineSetting,
} from '../lib/reservationDeadlineService';
import { getBusTicketPrice } from '../lib/adminService';
import {
  getCampusPaymentAccount,
  type CampusPaymentAccount,
} from '../lib/campusPaymentAccountService';
import { getDistrictTransferAccountNumber } from '../lib/districtTransferAccountService';

import { calculateDistanceKm, formatDistance } from '../utils/distance';
import { loadKakaoMapSdk } from '../utils/kakaoMapSdk';

const createReservationId = () => {
  return `reservation-${Date.now()}`;
};

const reservationSteps = [
  '신청자 정보',
  '행선지 선택',
  '확인',
] as const;

const EXTERNAL_DISTRICT_ID = 'external';

const formatPhoneNumber = (value: string) => {
  const numbers = value.replace(/\D/g, '').slice(0, 11);

  if (numbers.length <= 3) return numbers;
  if (numbers.length <= 7) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
  return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7)}`;
};

const ReservationPage = () => {
  const navigate = useNavigate();
  const placeSearchRequestIdRef = useRef(0);

  const [dbReservation, setDbReservation] = useState<ReturnBusReservation | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isLoginRequiredModalOpen, setIsLoginRequiredModalOpen] =
    useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const reservationSubmitInFlightRef = useRef(false);
  const reservationDeletionInFlightRef = useRef(false);
  const [isDeleteConfirmModalOpen, setIsDeleteConfirmModalOpen] =
    useState(false);
  const [isDeletingReservation, setIsDeletingReservation] = useState(false);
  const [reservationDeleteError, setReservationDeleteError] = useState('');
  const [currentStep, setCurrentStep] = useState(0);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [formStatus, setFormStatus] = useState<{
    type: 'error' | 'success';
    message: string;
  } | null>(null);
  const [reservationDeadline, setReservationDeadline] =
    useState<ReservationDeadlineSetting>({
      deadlineAt: null,
      isClosed: false,
    });

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const [districtOptions, setDistrictOptions] = useState<DistrictOption[]>([]);
  const [teamOptions, setTeamOptions] = useState<TeamOption[]>([]);
  const [campusOptions, setCampusOptions] = useState<CampusOption[]>([]);

  const [, setDistrictSearch] = useState('');
  const [selectedDistrictId, setSelectedDistrictId] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState('');

  const [, setTeamSearch] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('');

  const [, setCampusSearch] = useState('');
  const [selectedCampusId, setSelectedCampusId] = useState('');
  const [selectedCampus, setSelectedCampus] = useState('');
  const [affiliationType, setAffiliationType] = useState<'seoul' | 'external'>(
    'seoul'
  );
  const [coordinatorName, setCoordinatorName] = useState('');
  const [coordinatorPhone, setCoordinatorPhone] = useState('');
  const isExternal = affiliationType === 'external';

  const [firstStationSearch, setFirstStationSearch] = useState('');
  const [secondStationSearch, setSecondStationSearch] = useState('');

  const [firstStation, setFirstStation] = useState<StationOption | null>(null);
  const [secondStation, setSecondStation] = useState<StationOption | null>(null);


const [isStationCandidateModalOpen, setIsStationCandidateModalOpen] =
  useState(false);
const [stationCandidateSearch, setStationCandidateSearch] = useState('');
const [candidateFirstStation, setCandidateFirstStation] =
  useState<StationOption | null>(null);
const [candidateSecondStation, setCandidateSecondStation] =
  useState<StationOption | null>(null);
const [isDepositConfirmModalOpen, setIsDepositConfirmModalOpen] =
  useState(false);
const [showDepositRequiredMessage, setShowDepositRequiredMessage] =
  useState(false);
const [busTicketPrice, setBusTicketPrice] = useState(0);
const [campusPaymentAccount, setCampusPaymentAccount] =
  useState<CampusPaymentAccount | null>(null);
const [isPaymentInfoLoading, setIsPaymentInfoLoading] = useState(false);
const [paymentInfoError, setPaymentInfoError] = useState('');
const [
  canConfirmWithAnnouncedPaymentInfo,
  setCanConfirmWithAnnouncedPaymentInfo,
] = useState(false);
const [copiedPaymentField, setCopiedPaymentField] = useState<
  'account' | null
>(null);

const [stationOptions, setStationOptions] = useState<StationOption[]>([]);
const [isStationLoading, setIsStationLoading] = useState(true);

  const savedReservation = dbReservation;
  const isEditMode = Boolean(savedReservation);
  const isConfirmed = savedReservation?.status === 'confirmed';
  const isReservationLocked = isConfirmed || reservationDeadline.isClosed;

 const [hasSearchedPlace, setHasSearchedPlace] = useState(false); 
interface PlaceCandidate {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

interface NearbyStationRecommendation {
  station: StationOption;
  distanceKm: number;
}

const [placeSearchInput, setPlaceSearchInput] = useState('');
const [placeCandidates, setPlaceCandidates] = useState<PlaceCandidate[]>([]);
const [selectedPlace, setSelectedPlace] = useState<PlaceCandidate | null>(null);
const [nearbyStations, setNearbyStations] = useState<
  NearbyStationRecommendation[]
>([]);
const [isSearchingPlace, setIsSearchingPlace] = useState(false);
const [isKakaoReady, setIsKakaoReady] = useState(false);
const [kakaoLoadAttempt, setKakaoLoadAttempt] = useState(0);
const [kakaoLoadError, setKakaoLoadError] = useState('');
const [stationSelectMode, setStationSelectMode] = useState<
  'recommend' | 'direct'
>('recommend');

useEffect(() => {
  if (currentStep !== 1 || stationSelectMode !== 'recommend' || isKakaoReady) {
    return;
  }

  let isMounted = true;

  loadKakaoMapSdk()
    .then(() => {
      if (!isMounted) return;

      setKakaoLoadError('');
      setIsKakaoReady(true);
    })
    .catch((error) => {
      if (!isMounted) return;

      console.error('카카오 지도 SDK 로드 실패:', error);
      setKakaoLoadError(
        error instanceof Error && error.message
          ? error.message
          : '지도 검색을 불러오지 못했습니다. Kakao JavaScript 키와 허용 도메인을 확인해주세요.'
      );
      setIsKakaoReady(false);
    });

  return () => {
    isMounted = false;
  };
}, [currentStep, isKakaoReady, kakaoLoadAttempt, stationSelectMode]);
  useEffect(() => {
    let isMounted = true;

    const checkLoginAndLoadData = async () => {
      try {
        const { data } = await supabase.auth.getSession();

        if (!isMounted) return;

        if (!data.session) {
          setIsLoginRequiredModalOpen(true);
          return;
        }

        const [reservation, deadline] = await Promise.all([
          getReservation(),
          getReservationDeadline(),
        ]);

        if (!isMounted) return;

        setReservationDeadline(deadline);
        setDbReservation(reservation);

        if (reservation) {
          setName(reservation.name || '');
          setPhone(reservation.phone || '');

          setDistrictSearch(reservation.district || '');
          setSelectedDistrict(reservation.district || '');

          setTeamSearch(reservation.team || '');
          setSelectedTeam(reservation.team || '');

          setCampusSearch(reservation.campus || '');
          setSelectedCampus(reservation.campus || '');
          setAffiliationType(reservation.affiliationType ?? 'seoul');
          setCoordinatorName(reservation.coordinatorName ?? '');
          setCoordinatorPhone(reservation.coordinatorPhone ?? '');
          if (reservation.affiliationType === 'external') {
            setSelectedDistrictId(EXTERNAL_DISTRICT_ID);
          }

          setFirstStationSearch(
            reservation.stationPreferences?.[0]?.station.name || ''
          );
          setSecondStationSearch(
            reservation.stationPreferences?.[1]?.station.name || ''
          );

          setFirstStation(reservation.stationPreferences?.[0]?.station || null);
          setSecondStation(reservation.stationPreferences?.[1]?.station || null);

          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select(
            'name, phone, district, team, campus, affiliation_type, coordinator_name, coordinator_phone'
          )
          .eq('id', data.session.user.id)
          .maybeSingle();

        if (!isMounted) return;

        if (profileError) {
          console.error('Failed to load profile:', profileError);
          return;
        }

        setName(profile?.name || '');
        setPhone(profile?.phone || '');

        if (profile?.district) {
          setDistrictSearch(profile.district);
          setSelectedDistrict(profile.district);
        }

        if (profile?.team) {
          setTeamSearch(profile.team);
          setSelectedTeam(profile.team);
        }

        if (profile?.campus) {
          setCampusSearch(profile.campus);
          setSelectedCampus(profile.campus);
        }
        setAffiliationType(
          profile?.affiliation_type === 'external' ? 'external' : 'seoul'
        );
        setCoordinatorName(profile?.coordinator_name || '');
        setCoordinatorPhone(profile?.coordinator_phone || '');
        if (profile?.affiliation_type === 'external') {
          setSelectedDistrictId(EXTERNAL_DISTRICT_ID);
        }
      } catch (error) {
        console.error('Failed to load reservation:', error);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    checkLoginAndLoadData();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadOrganizations = async () => {
      try {
        const districts = await getDistrictOptions();
        if (!isMounted) return;

        setDistrictOptions(districts);
      } catch (error) {
        if (!isMounted) return;

        console.error('조직 정보 로드 실패:', error);
        alert('지구 정보를 불러오지 못했습니다.');
      }
    };

    loadOrganizations();

    return () => {
      isMounted = false;
    };
  }, []);

useEffect(() => {
  let isMounted = true;

  const syncInitialOrganization = async () => {
    if (districtOptions.length === 0) return;
    if (!selectedDistrict) return;

    const matchedDistrict = districtOptions.find(
      (district) => district.name === selectedDistrict
    );

    if (!matchedDistrict) return;

    setSelectedDistrictId(matchedDistrict.id);
    setDistrictSearch(matchedDistrict.name);
    setSelectedDistrict(matchedDistrict.name);

    try {
      const teams = await getTeamOptions(matchedDistrict.id);
      if (!isMounted) return;

      setTeamOptions(teams);

      if (!selectedTeam) return;

      const matchedTeam = teams.find((team) => team.name === selectedTeam);

      if (!matchedTeam) return;

      setSelectedTeamId(matchedTeam.id);
      setTeamSearch(matchedTeam.name);
      setSelectedTeam(matchedTeam.name);

      const campuses = await getCampusOptions(matchedTeam.id);
      if (!isMounted) return;

      setCampusOptions(campuses);

      if (!selectedCampus) return;

      const matchedCampus = campuses.find(
        (campus) => campus.name === selectedCampus
      );

      if (!matchedCampus) return;

      setSelectedCampusId(matchedCampus.id);
      setCampusSearch(matchedCampus.name);
      setSelectedCampus(matchedCampus.name);
    } catch (error) {
      console.error('프로필/신청 조직 정보 동기화 실패:', error);
    }
  };

  syncInitialOrganization();

  return () => {
    isMounted = false;
  };
}, [districtOptions, selectedDistrict, selectedTeam, selectedCampus]);

useEffect(() => {
  if (!isDepositConfirmModalOpen || (!isExternal && !selectedCampusId)) return;

  let isMounted = true;

  const loadPaymentInfo = async () => {
    setIsPaymentInfoLoading(true);
    setPaymentInfoError('');
    setCanConfirmWithAnnouncedPaymentInfo(false);
    setBusTicketPrice(0);
    setCampusPaymentAccount(null);

    try {
      const [price, account] = await Promise.all([
        getBusTicketPrice(),
        isExternal
          ? getDistrictTransferAccountNumber().then(
              (accountNumber): CampusPaymentAccount | null =>
                accountNumber
                  ? {
                      campusId: EXTERNAL_DISTRICT_ID,
                      bankName: '서울지구',
                      accountNumber,
                      accountHolder: '서울지구',
                    }
                  : null
            )
          : getCampusPaymentAccount(selectedCampusId),
      ]);

      if (!isMounted) return;

      setBusTicketPrice(price);
      setCampusPaymentAccount(account);

      if (price <= 0 || !account) {
        setCanConfirmWithAnnouncedPaymentInfo(true);
        setPaymentInfoError(
          isExternal
            ? '서울지구 입금 정보가 아직 등록되지 않았습니다. 카카오톡 등으로 안내받은 계좌에 입금했다면 신청을 계속할 수 있습니다.'
            : '이 캠퍼스의 버스표 가격 또는 입금 계좌가 아직 등록되지 않았습니다. 카카오톡 등으로 안내받은 계좌에 입금했다면 신청을 계속할 수 있습니다.'
        );
      }
    } catch (error) {
      if (!isMounted) return;

      console.error('입금 정보 로드 실패:', error);
      setPaymentInfoError(
        '입금 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.'
      );
    } finally {
      if (isMounted) setIsPaymentInfoLoading(false);
    }
  };

  void loadPaymentInfo();

  return () => {
    isMounted = false;
  };
}, [isDepositConfirmModalOpen, isExternal, selectedCampusId]);

const handleCopyAccountNumber = async () => {
  if (!campusPaymentAccount?.accountNumber) return;

  try {
    await navigator.clipboard.writeText(campusPaymentAccount.accountNumber);
    setCopiedPaymentField('account');
    window.setTimeout(() => setCopiedPaymentField(null), 1600);
  } catch (error) {
    console.error('계좌번호 복사 실패:', error);
  }
};


useEffect(() => {
  let isMounted = true;

  const loadStations = async () => {
    try {
      const stations = await getStationOptions();
      if (!isMounted) return;

      setStationOptions(stations);
    } catch (error) {
      if (!isMounted) return;

      console.error('행선지 정보 로드 실패:', error);
      alert('행선지 정보를 불러오지 못했습니다.');
    } finally {
      if (isMounted) setIsStationLoading(false);
    }
  };

  loadStations();

  return () => {
    isMounted = false;
  };
}, []);

const searchPlaceCandidates = useCallback((keywordValue?: string) => {
  const keyword = (keywordValue ?? placeSearchInput).trim();

  if (!keyword) {
    placeSearchRequestIdRef.current += 1;
    setPlaceCandidates([]);
    setNearbyStations([]);
    setSelectedPlace(null);
    setHasSearchedPlace(false);
    return;
  }

  const services = window.kakao?.maps?.services;

  if (!isKakaoReady || !services) {
    setHasSearchedPlace(true);
    setKakaoLoadError(
      '지도 검색을 준비 중입니다. 잠시 뒤 다시 입력해주세요.'
    );
    return;
  }

  setHasSearchedPlace(true);
  setIsSearchingPlace(true);
  setSelectedPlace(null);
  setNearbyStations([]);

  const requestId = (placeSearchRequestIdRef.current += 1);
  const places = new services.Places();
  const geocoder = new services.Geocoder();

  places.keywordSearch(keyword, (result: KakaoPlaceSearchResult[], status: string) => {
    if (placeSearchRequestIdRef.current !== requestId) return;

    if (status === services.Status.OK) {
      const candidates: PlaceCandidate[] = result.slice(0, 7).map((place) => ({
        id: place.id,
        name: place.place_name,
        address: place.road_address_name || place.address_name || '',
        lat: Number(place.y),
        lng: Number(place.x),
      }));

      setPlaceCandidates(candidates);
      setIsSearchingPlace(false);
      return;
    }

    geocoder.addressSearch(keyword, (addressResult: KakaoAddressSearchResult[], addressStatus: string) => {
      if (placeSearchRequestIdRef.current !== requestId) return;

      if (addressStatus === services.Status.OK) {
        const candidates: PlaceCandidate[] = addressResult
          .slice(0, 7)
          .map((address, index) => ({
            id: `address-${index}-${address.x}-${address.y}`,
            name:
              address.road_address?.building_name ||
              address.road_address?.address_name ||
              address.address_name,
            address:
              address.road_address?.address_name ||
              address.address_name ||
              '',
            lat: Number(address.y),
            lng: Number(address.x),
          }));

        setPlaceCandidates(candidates);
        setIsSearchingPlace(false);
        return;
      }

      setPlaceCandidates([]);
      setIsSearchingPlace(false);
    });
  });
}, [isKakaoReady, placeSearchInput]);

useEffect(() => {
  const keyword = placeSearchInput.trim();

  if (!keyword) {
    Promise.resolve().then(() => {
      setPlaceCandidates([]);
      setNearbyStations([]);
      setSelectedPlace(null);
      setHasSearchedPlace(false);
      setIsSearchingPlace(false);
    });
    return;
  }

  if (selectedPlace && selectedPlace.name === placeSearchInput) {
    return;
  }

  if (!isKakaoReady) {
    return;
  }

  const timer = window.setTimeout(() => {
    searchPlaceCandidates(keyword);
  }, 400);

  return () => {
    window.clearTimeout(timer);
  };
}, [placeSearchInput, isKakaoReady, searchPlaceCandidates, selectedPlace]);

const handlePlaceConfirm = (place: PlaceCandidate) => {
  setSelectedPlace(place);
  setPlaceSearchInput(place.name);
  setPlaceCandidates([]);

  if (stationOptions.length === 0) {
    setNearbyStations([]);
    alert('행선지 후보 정보를 불러오지 못했습니다.');
    return;
  }

  const calculatedStations = stationOptions
    .filter(
      (station) =>
        typeof station.lat === 'number' &&
        typeof station.lng === 'number' &&
        Number.isFinite(station.lat) &&
        Number.isFinite(station.lng)
    )
    .map((station) => ({
      station,
      distanceKm: calculateDistanceKm(
        { lat: place.lat, lng: place.lng },
        { lat: station.lat, lng: station.lng }
      ),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 3);

  setNearbyStations(calculatedStations);
};

const handleApplyRecommendation = (
  station: StationOption,
  rank: 1 | 2
) => {
  if (rank === 1 && secondStation?.id === station.id) {
    alert('이미 2지망으로 선택한 행선지입니다.');
    return;
  }

  if (rank === 2 && firstStation?.id === station.id) {
    alert('이미 1지망으로 선택한 행선지입니다.');
    return;
  }

  handleStationSelect(rank, station);
};

const searchStations = useCallback((keyword: string, currentStationId?: string) => {
  const normalizedKeyword = keyword.trim().toLowerCase();
  const selectedStationIds = [
    firstStation?.id,
    secondStation?.id,
  ].filter(Boolean);

  return stationOptions.filter((station) => {
    const isMatched =
      station.name.toLowerCase().includes(normalizedKeyword) ||
      station.line?.toLowerCase().includes(normalizedKeyword) ||
      station.address?.toLowerCase().includes(normalizedKeyword);

    const isAlreadySelected =
      selectedStationIds.includes(station.id) &&
      station.id !== currentStationId;

    return isMatched && !isAlreadySelected;
  });
}, [firstStation?.id, secondStation?.id, stationOptions]);

  const firstStationResults = useMemo(
    () => searchStations(firstStationSearch, firstStation?.id),
    [firstStation?.id, firstStationSearch, searchStations]
  );

  const secondStationResults = useMemo(
    () => searchStations(secondStationSearch, secondStation?.id),
    [secondStation?.id, secondStationSearch, searchStations]
  );


const stationCandidateResults = useMemo(() => {
  const keyword = stationCandidateSearch.trim().toLowerCase();

  return stationOptions.filter((station) => {
    return (
      !keyword ||
      station.name.toLowerCase().includes(keyword) ||
      station.line?.toLowerCase().includes(keyword) ||
      station.address?.toLowerCase().includes(keyword)
    );
  });
}, [stationOptions, stationCandidateSearch]);

  const handleDistrictSelect = async (district: DistrictOption) => {
    setAffiliationType('seoul');
    setSelectedDistrictId(district.id);
    setSelectedDistrict(district.name);
    setDistrictSearch(district.name);

    setSelectedTeamId('');
    setSelectedTeam('');
    setTeamSearch('');
    setTeamOptions([]);

    setSelectedCampusId('');
    setSelectedCampus('');
    setCampusSearch('');
    setCampusOptions([]);
    clearValidationFeedback('district');
    clearValidationFeedback('team');
    clearValidationFeedback('campus');

    try {
      const teams = await getTeamOptions(district.id);
      setTeamOptions(teams);
    } catch (error) {
      console.error('팀 정보 로드 실패:', error);
      alert('팀 정보를 불러오지 못했습니다.');
    }
  };

  const handleTeamSelect = async (team: TeamOption) => {
    setSelectedTeamId(team.id);
    setSelectedTeam(team.name);
    setTeamSearch(team.name);

    setSelectedCampusId('');
    setSelectedCampus('');
    setCampusSearch('');
    setCampusOptions([]);
    clearValidationFeedback('team');
    clearValidationFeedback('campus');

    try {
      const campuses = await getCampusOptions(team.id);
      setCampusOptions(campuses);
    } catch (error) {
      console.error('캠퍼스 정보 로드 실패:', error);
      alert('캠퍼스 정보를 불러오지 못했습니다.');
    }
  };

  const handleCampusSelect = (campus: CampusOption) => {
    setSelectedCampusId(campus.id);
    setSelectedCampus(campus.name);
    setCampusSearch(campus.name);
    clearValidationFeedback('campus');
  };

  const handleStationSelect = (rank: 1 | 2, station: StationOption) => {
    if (rank === 1) {
      setFirstStation(station);
      setFirstStationSearch(station.name);
      clearValidationFeedback('firstStation');
    }

    if (rank === 2) {
      setSecondStation(station);
      setSecondStationSearch(station.name);
      clearValidationFeedback('secondStation');
    }

    clearValidationFeedback('stationPreference');
  };


const handleCandidateStationSelect = (
  rank: 1 | 2,
  station: StationOption
) => {
  if (rank === 1) setCandidateFirstStation(station);
  if (rank === 2) setCandidateSecondStation(station);
};

const closeStationCandidateModal = () => {
  setIsStationCandidateModalOpen(false);
  setStationCandidateSearch('');
  setCandidateFirstStation(null);
  setCandidateSecondStation(null);
};

const handleOpenStationCandidateModal = () => {
  setCandidateFirstStation(firstStation);
  setCandidateSecondStation(secondStation);
  setStationCandidateSearch('');
  setIsStationCandidateModalOpen(true);
};

const handleConfirmCandidateStations = () => {
  if (!candidateFirstStation || !candidateSecondStation) return;

  handleStationSelect(1, candidateFirstStation);
  handleStationSelect(2, candidateSecondStation);
  closeStationCandidateModal();
};

  const handleCancelReservation = () => {
    if (!savedReservation || isReservationLocked || isDeletingReservation) {
      return;
    }
    setReservationDeleteError('');
    setIsDeleteConfirmModalOpen(true);
  };

  const confirmCancelReservation = async () => {
    if (
      !savedReservation ||
      isReservationLocked ||
      isDeletingReservation ||
      reservationDeletionInFlightRef.current
    ) {
      return;
    }

    reservationDeletionInFlightRef.current = true;
    setIsDeletingReservation(true);
    setReservationDeleteError('');
    try {
      await deleteReservation();
      navigate('/', {
        replace: true,
        state: { reservationDeleted: true },
      });
    } catch (error) {
      console.error('신청 삭제 실패:', error);
      setReservationDeleteError(
        '신청 삭제에 실패했습니다. 신청 마감 여부를 확인한 뒤 다시 시도해주세요.'
      );
    } finally {
      reservationDeletionInFlightRef.current = false;
      setIsDeletingReservation(false);
    }
  };

  useEffect(() => {
    if (!isDeleteConfirmModalOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isDeletingReservation) {
        setIsDeleteConfirmModalOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDeleteConfirmModalOpen, isDeletingReservation]);

  const clearValidationFeedback = (fieldName?: string) => {
    setFormStatus(null);

    if (!fieldName) {
      setFormErrors({});
      return;
    }

    setFormErrors((prev) => {
      if (!prev[fieldName]) return prev;

      const next = { ...prev };
      delete next[fieldName];
      return next;
    });
  };

  const getStepValidationErrors = (step: number) => {
    const errors: Record<string, string> = {};

    if (step === 0) {
      if (!name.trim()) {
        errors.name = '이름을 입력해주세요.';
      }

      if (!phone.trim()) {
        errors.phone = '연락처를 입력해주세요.';
      }
      if (!selectedDistrict) {
        errors.district = '지구를 선택해주세요.';
      }

      if (!isExternal && !selectedTeam) {
        errors.team = '팀을 선택해주세요.';
      }

      if (!selectedCampus || (!isExternal && !selectedCampusId)) {
        errors.campus = '캠퍼스를 선택해주세요.';
      }
      if (isExternal && !coordinatorName.trim()) {
        errors.coordinatorName = '담당 간사 이름을 입력해주세요.';
      }
      if (
        isExternal &&
        !/^010-\d{4}-\d{4}$/.test(coordinatorPhone.trim())
      ) {
        errors.coordinatorPhone =
          '담당 간사 연락처를 010-1234-5678 형식으로 입력해주세요.';
      }
    }

    if (step === 1) {
      if (!firstStation) {
        errors.firstStation = '1지망 행선지를 선택해주세요.';
      }

      if (!secondStation) {
        errors.secondStation = '2지망 행선지를 선택해주세요.';
      }

      if (firstStation && secondStation && firstStation.id === secondStation.id) {
        errors.stationPreference =
          '1지망과 2지망은 서로 다른 행선지로 선택해주세요.';
      }
    }

    return errors;
  };

  const showValidationErrors = (
    errors: Record<string, string>,
    message = '입력하지 않은 항목을 확인해주세요.'
  ) => {
    setFormErrors(errors);
    setFormStatus({ type: 'error', message });

    const fieldOrder = [
      'name',
      'phone',
      'district',
      'team',
      'campus',
      'coordinatorName',
      'coordinatorPhone',
      'firstStation',
      'secondStation',
      'stationPreference',
    ];
    const firstInvalidField = fieldOrder.find((field) => errors[field]);

    if (firstInvalidField) {
      window.setTimeout(() => {
        const field =
          document.querySelector<HTMLElement>(
          `[data-validation-field="${firstInvalidField}"]`
          ) ??
          (firstInvalidField === 'firstStation' ||
          firstInvalidField === 'secondStation'
            ? document.querySelector<HTMLElement>(
                '[data-validation-field="stationPreference"]'
              )
            : null);

        if (!field) return;

        field.scrollIntoView({ behavior: 'smooth', block: 'center' });

        const focusTarget = field.matches(
          'input, button, select, textarea, [tabindex]'
        )
          ? field
          : field.querySelector<HTMLElement>(
              'input, button, select, textarea, [tabindex]'
            );

        focusTarget?.focus({ preventScroll: true });
      }, 0);
    }

    return Object.keys(errors).length === 0;
  };

  const validateCurrentStepInline = () => {
    const errors = getStepValidationErrors(currentStep);

    if (Object.keys(errors).length > 0) {
      return showValidationErrors(errors);
    }

    clearValidationFeedback();
    return true;
  };

  const validateAllStepsInline = () => {
    const errors = {
      ...getStepValidationErrors(0),
      ...getStepValidationErrors(1),
    };

    if (Object.keys(errors).length > 0) {
      const firstInvalidStep = [0, 1].find(
        (step) => Object.keys(getStepValidationErrors(step)).length > 0
      );

      if (firstInvalidStep !== undefined) {
        setCurrentStep(firstInvalidStep);
      }

      return showValidationErrors(
        errors,
        '신청 완료 전에 누락된 항목을 확인해주세요.'
      );
    }

    clearValidationFeedback();
    return true;
  };

  const getVisibleStepErrors = () => {
    const fieldsByStep = [
      [
        'name',
        'phone',
        'district',
        'team',
        'campus',
        'coordinatorName',
        'coordinatorPhone',
      ],
      ['firstStation', 'secondStation', 'stationPreference'],
      [],
    ];
    const visibleFields = fieldsByStep[currentStep] ?? [];

    return visibleFields
      .map((field) => formErrors[field])
      .filter((message): message is string => Boolean(message));
  };

  const handleStepClick = (targetStep: number) => {
    if (targetStep <= currentStep || isReservationLocked) {
      setCurrentStep(targetStep);
      clearValidationFeedback();
      return;
    }

    if (!validateCurrentStepInline()) return;

    if (currentStep === 1 && targetStep === 2) {
      setIsDepositConfirmModalOpen(true);
      return;
    }

    setCurrentStep((prev) =>
      Math.min(prev + 1, reservationSteps.length - 1)
    );
  };

  const handleNextStep = () => {
    if (isReservationLocked) {
      setCurrentStep((prev) => Math.min(prev + 1, reservationSteps.length - 1));
      return;
    }

    if (!validateCurrentStepInline()) return;

    if (currentStep === 1) {
      setIsDepositConfirmModalOpen(true);
      return;
    }

    setCurrentStep((prev) => Math.min(prev + 1, reservationSteps.length - 1));
  };

  const handlePrevStep = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const handleSubmit = async () => {
    if (reservationSubmitInFlightRef.current) return;

    if (currentStep < reservationSteps.length - 1) {
      handleNextStep();
      return;
    }

    if (savedReservation?.status === 'confirmed') {
      setFormStatus({
        type: 'error',
        message: '이미 버스표가 확정되어 수정할 수 없습니다. 관리자에게 문의해주세요.',
      });
      return;
    }

    if (reservationDeadline.isClosed) {
      setFormStatus({
        type: 'error',
        message: `신청이 마감되어 신청 정보를 저장할 수 없습니다. 신청 마감 일시: ${formatReservationDeadline(
          reservationDeadline.deadlineAt
        )}`,
      });
      return;
    }

    if (!validateAllStepsInline()) return;

    reservationSubmitInFlightRef.current = true;
    setIsSubmitting(true);

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.user?.id) {
        alert('로그인 정보를 불러올 수 없습니다. 다시 로그인해주세요.');
        return;
      }

      const now = new Date().toISOString();

      const stationPreferences: StationPreference[] = [
        {
          rank: 1,
          station: firstStation as StationOption,
        },
        {
          rank: 2,
          station: secondStation as StationOption,
        },
      ];

      const isReapplyingCancelledReservation =
        savedReservation?.status === 'cancelled';

      const reservation: ReturnBusReservation = {
        id: savedReservation?.id || createReservationId(),

        name: name.trim(),
        phone: phone.trim(),

        district: selectedDistrict,
        team: isExternal ? '' : selectedTeam,
        campus: selectedCampus,
        affiliationType,
        coordinatorName: isExternal ? coordinatorName.trim() : undefined,
        coordinatorPhone: isExternal ? coordinatorPhone.trim() : undefined,

        stationPreferences,

        status: 'requested',

        confirmedTicket: undefined,

        requestedAt: isReapplyingCancelledReservation
          ? now
          : savedReservation?.requestedAt || now,
        updatedAt: isEditMode ? now : undefined,
      };

      await saveReservation(reservation);

      navigate('/ticket');
    } catch (error) {
      console.error('신청 저장 실패:', error);
      setFormStatus({
        type: 'error',
        message: '신청 저장에 실패했습니다. 다시 시도해주세요.',
      });
    } finally {
      reservationSubmitInFlightRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleExternalDistrictSelect = () => {
    setAffiliationType('external');
    setSelectedDistrictId(EXTERNAL_DISTRICT_ID);
    setSelectedDistrict('');
    setSelectedTeamId('');
    setSelectedTeam('');
    setSelectedCampusId('');
    setSelectedCampus('');
    setTeamOptions([]);
    setCampusOptions([]);
    clearValidationFeedback();
  };

  const visibleStepErrors = getVisibleStepErrors();

  const renderStationSelector = (
    rank: 1 | 2,
    value: string,
    selectedStation: StationOption | null,
    results: StationOption[],
    onChange: (value: string) => void
  ) => {
    const fieldName = rank === 1 ? 'firstStation' : 'secondStation';
    const errorMessage = formErrors[fieldName];

    return (
      
      <div className={styles.stationSelectCard}>
        <div className={styles.stationSelectHeader}>
          <span>{rank}지망</span>
          <strong>{selectedStation?.name || '행선지 미선택'}</strong>
        </div>

        <div className={styles.searchBox}>
          <Search size={18} color="#667085" />
          <input
            type="text"
            data-validation-field={fieldName}
            className={styles.searchInput}
            placeholder={`예: ${rank === 1 ? '청량리역' : '건대입구역'}`}
            value={value}
            disabled={isReservationLocked}
            aria-invalid={Boolean(errorMessage)}
            aria-describedby={
              errorMessage ? `station-${rank}-error` : undefined
            }
            onChange={(e) => {
              onChange(e.target.value);
              clearValidationFeedback(fieldName);
              clearValidationFeedback('stationPreference');

              if (rank === 1) setFirstStation(null);
              if (rank === 2) setSecondStation(null);
            }}
          />
        </div>

        {errorMessage && (
          <p id={`station-${rank}-error`} className={styles.fieldError}>
            {errorMessage}
          </p>
        )}

        {value && !selectedStation && !isReservationLocked && (
          <div className={styles.searchResultBox}>
            {results.length > 0 ? (
              results.map((station) => (
                <button
                  key={station.id}
                  type="button"
                  className={styles.searchResultItem}
                  onClick={() => handleStationSelect(rank, station)}
                >
                  <span>{station.name}</span>
<small>{station.line || '노선 정보 없음'}</small>                
</button>
              ))
            ) : (
              <p className={styles.emptyResult}>검색 결과가 없습니다.</p>
            )}
          </div>
        )}

        {selectedStation && (
          <div className={styles.stationSelectedBox}>
            <strong>{selectedStation.name}</strong>
<p>{selectedStation.line || '노선 정보 없음'}</p>
{selectedStation.address && <p>{selectedStation.address}</p>}          
</div>
        )}
      </div>
    );
  };

  return (
    <div className={styles.pageContainer}>
      <Header />

      <main className={styles.main}>
{isLoading || isStationLoading ? (
  <section className={styles.loadingContainer}>
    <p>신청 정보를 불러오는 중...</p>
  </section>
) : (
          <>
            <div className={styles.headerContent}>
              <div className={styles.iconCircle}>
                <Bus size={32} color="#ffffff" />
              </div>

              <h1 className={styles.title}>
                {isEditMode ? '버스 신청 수정하기' : '버스 신청하기'}
              </h1>

              <p className={styles.subtitle}>
                수련회 종료 후 집으로 돌아가는 버스의 희망 행선지를 신청해주세요
              </p>
            </div>

            {isEditMode && !isReservationLocked && (
              <div className={styles.editNoticeBox}>
                이미 신청한 정보가 있습니다. 새로 신청하는 대신 기존 신청 정보를
                수정합니다.
              </div>
            )}

            {isConfirmed && (
              <div className={styles.confirmedNoticeBox}>
                버스표가 이미 확정되어 이 페이지에서 수정할 수 없습니다. 수정이
                필요하면 관리자에게 문의해주세요.
              </div>
            )}

            {reservationDeadline.isClosed && !isConfirmed && (
              <div className={styles.closedNoticeBox}>
                <strong>일반 신청이 마감되었습니다.</strong>
                <span>
                  신청 마감 일시: {formatReservationDeadline(reservationDeadline.deadlineAt)}
                </span>
                {!savedReservation && (
                  <button
                    type="button"
                    onClick={() => navigate('/remaining-seats')}
                  >
                    잔여 좌석 확인하기
                  </button>
                )}
              </div>
            )}

            <div className={styles.formCard}>
              <div className={styles.stepper} aria-label="신청 단계">
                {reservationSteps.map((step, index) => (
                  <button
                    key={step}
                    type="button"
                    className={`${styles.stepItem} ${
                      index === currentStep ? styles.stepItemActive : ''
                    } ${index < currentStep ? styles.stepItemDone : ''}`}
                    onClick={() => handleStepClick(index)}
                    aria-current={index === currentStep ? 'step' : undefined}
                  >
                    <span>{index + 1}</span>
                    <strong>{step}</strong>
                  </button>
                ))}
              </div>

              {(formStatus || visibleStepErrors.length > 0) && (
                <div
                  className={
                    formStatus?.type === 'success'
                      ? styles.successSummary
                      : styles.errorSummary
                  }
                  role={formStatus?.type === 'success' ? 'status' : 'alert'}
                  aria-live="polite"
                >
                  {formStatus && <strong>{formStatus.message}</strong>}
                  {visibleStepErrors.length > 0 && (
                    <ul>
                      {visibleStepErrors.map((message) => (
                        <li key={message}>{message}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <form
                className={styles.form}
                onSubmit={(event) => {
                  event.preventDefault();
                }}
              >
                {currentStep === 0 && (
                  <>
                <div className={styles.inputGroup}>
                  <label className={styles.label}>
                    이름 <span className={styles.required}>*</span>
                  </label>
                  <input
                    name="name"
                    data-validation-field="name"
                    type="text"
                    className={styles.input}
                    placeholder="홍길동"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      clearValidationFeedback('name');
                    }}
                    disabled={isReservationLocked}
                    aria-invalid={Boolean(formErrors.name)}
                    aria-describedby={
                      formErrors.name ? 'reservation-name-error' : undefined
                    }
                    required
                  />
                  {formErrors.name && (
                    <p
                      id="reservation-name-error"
                      className={styles.fieldError}
                    >
                      {formErrors.name}
                    </p>
                  )}
                </div>

                <div className={styles.inputGroup}>
                  <label className={styles.label}>
                    연락처 <span className={styles.required}>*</span>
                  </label>
                  <input
                    name="phone"
                    data-validation-field="phone"
                    type="tel"
                    className={styles.input}
                    placeholder="010-1234-5678"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      clearValidationFeedback('phone');
                    }}
                    disabled={isReservationLocked}
                    aria-invalid={Boolean(formErrors.phone)}
                    aria-describedby={
                      formErrors.phone ? 'reservation-phone-error' : undefined
                    }
                    required
                  />
                  {formErrors.phone && (
                    <p
                      id="reservation-phone-error"
                      className={styles.fieldError}
                    >
                      {formErrors.phone}
                    </p>
                  )}
                </div>
                  </>
                )}

                {currentStep === 0 && (
                  <>
                <div className={styles.sectionDivider} />

                <div className={styles.preferenceHeader}>
                  <h2>소속 정보</h2>
                  <p>지구, 팀, 캠퍼스를 순서대로 선택해주세요.</p>
                </div>

                <div
                  className={styles.inputGroup}
                  data-validation-field="district"
                >
                  <label className={styles.label}>
                    지구 선택 <span className={styles.required}>*</span>
                  </label>

                  <div className={styles.optionButtonGrid}>
                    {districtOptions.length > 0 ? (
                      districtOptions.map((district) => (
                        <button
                          key={district.id}
                          type="button"
                          className={`${styles.optionButton} ${
                            selectedDistrictId === district.id
                              ? styles.optionButtonActive
                              : ''
                          }`}
                          onClick={() => handleDistrictSelect(district)}
                          disabled={isReservationLocked}
                          aria-pressed={selectedDistrictId === district.id}
                        >
                          {district.name}
                        </button>
                      ))
                    ) : (
                      <p className={styles.emptyResult}>선택 가능한 지구가 없습니다.</p>
                    )}
                    <button
                      type="button"
                      className={`${styles.optionButton} ${
                        isExternal ? styles.optionButtonActive : ''
                      }`}
                      onClick={handleExternalDistrictSelect}
                      disabled={isReservationLocked}
                      aria-pressed={isExternal}
                    >
                      서울 외 지구
                    </button>
                  </div>
                  {formErrors.district && (
                    <p className={styles.fieldError}>{formErrors.district}</p>
                  )}

                </div>

                {isExternal && (
                  <>
                    <div className={styles.inputGroup}>
                      <label className={styles.label}>
                        소속 지구명 <span className={styles.required}>*</span>
                      </label>
                      <input
                        data-validation-field="campus"
                        className={styles.input}
                        value={selectedDistrict}
                        onChange={(event) => {
                          setSelectedDistrict(event.target.value);
                          clearValidationFeedback('district');
                        }}
                        disabled={isReservationLocked}
                      />
                    </div>
                    <div className={styles.inputGroup}>
                      <label className={styles.label}>
                        소속 캠퍼스명 <span className={styles.required}>*</span>
                      </label>
                      <input
                        data-validation-field="coordinatorName"
                        className={styles.input}
                        value={selectedCampus}
                        onChange={(event) => {
                          setSelectedCampus(event.target.value);
                          clearValidationFeedback('campus');
                        }}
                        disabled={isReservationLocked}
                      />
                      {formErrors.campus && (
                        <p className={styles.fieldError}>{formErrors.campus}</p>
                      )}
                    </div>
                    <div className={styles.inputGroup}>
                      <label className={styles.label}>
                        담당 간사 이름 <span className={styles.required}>*</span>
                      </label>
                      <input
                        data-validation-field="coordinatorPhone"
                        className={styles.input}
                        value={coordinatorName}
                        onChange={(event) => {
                          setCoordinatorName(event.target.value);
                          clearValidationFeedback('coordinatorName');
                        }}
                        disabled={isReservationLocked}
                      />
                      {formErrors.coordinatorName && (
                        <p className={styles.fieldError}>
                          {formErrors.coordinatorName}
                        </p>
                      )}
                    </div>
                    <div className={styles.inputGroup}>
                      <label className={styles.label}>
                        담당 간사 연락처 <span className={styles.required}>*</span>
                      </label>
                      <input
                        className={styles.input}
                        value={coordinatorPhone}
                        onChange={(event) => {
                          setCoordinatorPhone(
                            formatPhoneNumber(event.target.value)
                          );
                          clearValidationFeedback('coordinatorPhone');
                        }}
                        placeholder="010-1234-5678"
                        inputMode="numeric"
                        maxLength={13}
                        disabled={isReservationLocked}
                      />
                      {formErrors.coordinatorPhone && (
                        <p className={styles.fieldError}>
                          {formErrors.coordinatorPhone}
                        </p>
                      )}
                    </div>
                  </>
                )}

                {!isExternal && (
                  <>
                <div
                  className={styles.inputGroup}
                  data-validation-field="team"
                >
                  <label className={styles.label}>
                    팀 선택 <span className={styles.required}>*</span>
                  </label>

                  {selectedDistrictId ? (
                    <div className={styles.optionButtonGrid}>
                      {teamOptions.length > 0 ? (
                        teamOptions.map((team) => (
                          <button
                            key={team.id}
                            type="button"
                            className={`${styles.optionButton} ${
                              selectedTeamId === team.id
                                ? styles.optionButtonActive
                                : ''
                            }`}
                            onClick={() => handleTeamSelect(team)}
                            disabled={isReservationLocked}
                            aria-pressed={selectedTeamId === team.id}
                          >
                            {team.name}
                          </button>
                        ))
                      ) : (
                        <p className={styles.emptyResult}>선택 가능한 팀이 없습니다.</p>
                      )}
                    </div>
                  ) : (
                    <p className={styles.optionHint}>먼저 지구를 선택해주세요.</p>
                  )}
                  {formErrors.team && (
                    <p className={styles.fieldError}>{formErrors.team}</p>
                  )}

                </div>

                <div
                  className={styles.inputGroup}
                  data-validation-field="campus"
                >
                  <label className={styles.label}>
                    캠퍼스 선택 <span className={styles.required}>*</span>
                  </label>

                  {selectedTeamId ? (
                    <div className={styles.optionButtonGrid}>
                      {campusOptions.length > 0 ? (
                        campusOptions.map((campus) => (
                          <button
                            key={campus.id}
                            type="button"
                            className={`${styles.optionButton} ${
                              selectedCampusId === campus.id
                                ? styles.optionButtonActive
                                : ''
                            }`}
                            onClick={() => handleCampusSelect(campus)}
                            disabled={isReservationLocked}
                            aria-pressed={selectedCampusId === campus.id}
                          >
                            {campus.name}
                          </button>
                        ))
                      ) : (
                        <p className={styles.emptyResult}>
                          선택 가능한 캠퍼스가 없습니다.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className={styles.optionHint}>먼저 팀을 선택해주세요.</p>
                  )}
                  {formErrors.campus && (
                    <p className={styles.fieldError}>{formErrors.campus}</p>
                  )}

                </div>
                  </>
                )}

                <div className={styles.organizationSummary}>
                  <span>현재 선택</span>
                  <strong>
                    {[selectedDistrict, isExternal ? '' : selectedTeam, selectedCampus]
                      .filter(Boolean)
                      .join(' / ') || '소속을 선택해주세요'}
                  </strong>
                </div>
                  </>
                )}

                {currentStep === 1 && (
                  <>
                <div className={styles.sectionDivider} />

                <div className={styles.preferenceHeader}>
                  <h2>희망 행선지 선택</h2>
                  <p>
                    가까운 역을 추천받거나 직접 검색해서 1·2지망을 선택해주세요.
                  </p>
                </div>

                <div
                  className={styles.preferenceSummaryGrid}
                  data-validation-field="stationPreference"
                  tabIndex={-1}
                >
                  <div className={firstStation ? styles.preferenceSummaryDone : ''}>
                    <span>1지망</span>
                    <strong>{firstStation?.name || '아직 선택 전'}</strong>
                  </div>
                  <div className={secondStation ? styles.preferenceSummaryDone : ''}>
                    <span>2지망</span>
                    <strong>{secondStation?.name || '아직 선택 전'}</strong>
                  </div>
                </div>

                <div className={styles.stationModeTabs}>
                  <button
                    type="button"
                    className={
                      stationSelectMode === 'recommend'
                        ? styles.stationModeActive
                        : ''
                    }
                    onClick={() => setStationSelectMode('recommend')}
                  >
                    가까운 역 추천
                  </button>
                  <button
                    type="button"
                    className={
                      stationSelectMode === 'direct'
                        ? styles.stationModeActive
                        : ''
                    }
                    onClick={() => setStationSelectMode('direct')}
                  >
                    직접 검색
                  </button>
                </div>

                {stationSelectMode === 'recommend' && (
<div className={styles.recommendationBox}>
  <div className={styles.recommendationHeader}>
    <MapPin size={20} color="#2563eb" />
    <div>
      <h3>주변 행선지 추천</h3>
      <p>
        주소나 장소명을 입력한 뒤 실제 행선지를 확정하면,
        그 장소에서 가까운 행선지 3곳을 추천합니다.
      </p>
    </div>
  </div>

  <div className={styles.recommendationSearchRow}>
    <div className={styles.searchBox}>
      <Search size={18} color="#667085" />
      <input
        type="text"
        className={styles.searchInput}
        placeholder="예: 서울과학기술대학교, 강남역, 서울 노원구 공릉로 232"
        value={placeSearchInput}
        onChange={(e) => {
          setPlaceSearchInput(e.target.value);
          setPlaceCandidates([]);
          setSelectedPlace(null);
          setNearbyStations([]);
          setHasSearchedPlace(false);
        }}
        disabled={isReservationLocked || !isKakaoReady}
      />
    </div>
  </div>

  {!isKakaoReady && !kakaoLoadError && (
    <p className={styles.emptyResult}>지도 검색을 준비하는 중입니다...</p>
  )}

  {kakaoLoadError && (
    <div className={styles.mapErrorBox}>
      <p>{kakaoLoadError}</p>
      <button
        type="button"
        onClick={() => {
          setKakaoLoadError('');
          setKakaoLoadAttempt((attempt) => attempt + 1);
        }}
        disabled={isReservationLocked}
      >
        다시 시도
      </button>
    </div>
  )}

  {isSearchingPlace && (
    <p className={styles.emptyResult}>장소를 검색하는 중입니다...</p>
  )}

  {placeCandidates.length > 0 && !selectedPlace && !isReservationLocked && (
    <div className={styles.searchResultBox}>
      {placeCandidates.map((place) => (
        <button
          key={place.id}
          type="button"
          className={styles.placeCandidateItem}
          onClick={() => handlePlaceConfirm(place)}
        >
          <strong>{place.name}</strong>
          {place.address && <small>{place.address}</small>}
        </button>
      ))}
    </div>
  )}

  {hasSearchedPlace &&
    placeSearchInput &&
    !isSearchingPlace &&
    placeCandidates.length === 0 &&
    !selectedPlace && (
      <p className={styles.emptyResult}>
        검색 결과가 없습니다. 더 정확한 주소나 장소명을 입력해주세요.
      </p>
    )}

  {selectedPlace && (
    <div className={styles.selectedBox}>
      <strong>확정된 행선지: {selectedPlace.name}</strong>
      {selectedPlace.address && <p>{selectedPlace.address}</p>}
    </div>
  )}

  {selectedPlace && nearbyStations.length > 0 && (
    <div className={styles.nearbyStationList}>
      {nearbyStations.map(({ station, distanceKm }, index) => {
        const isFirstSelected = firstStation?.id === station.id;
        const isSecondSelected = secondStation?.id === station.id;

        return (
          <div key={station.id} className={styles.recommendationItem}>
            <div>
              <strong>
                {index + 1}. {station.name}
              </strong>
              <p>{station.line || '노선 정보 없음'}</p>
              {station.address && <p>{station.address}</p>}
              <small>직선거리 약 {formatDistance(distanceKm)}</small>
            </div>

            <div className={styles.recommendationButtons}>
              <button
                type="button"
                className={`${styles.recommendationButton} ${
                  isFirstSelected ? styles.recommendationButtonActive : ''
                }`}
                aria-pressed={isFirstSelected}
                onClick={() => handleApplyRecommendation(station, 1)}
                disabled={isSecondSelected || isReservationLocked}
              >
                {isFirstSelected ? '1지망 선택됨' : '1지망 선택'}
              </button>
              <button
                type="button"
                className={`${styles.recommendationButton} ${
                  isSecondSelected ? styles.recommendationButtonActive : ''
                }`}
                aria-pressed={isSecondSelected}
                onClick={() => handleApplyRecommendation(station, 2)}
                disabled={isFirstSelected || isReservationLocked}
              >
                {isSecondSelected ? '2지망 선택됨' : '2지망 선택'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  )}

  {selectedPlace && nearbyStations.length === 0 && (
    <p className={styles.emptyResult}>
      추천 가능한 행선지가 없습니다. 관리자에게 행선지 좌표 등록 여부를 확인해주세요.
    </p>
  )}
</div>
                )}

                {stationSelectMode === 'direct' && (
                  <div className={styles.directStationPanel}>
                    {!isReservationLocked && (
                      <button
                        type="button"
                        className={styles.candidateOpenButton}
                        onClick={handleOpenStationCandidateModal}
                      >
                        행선지 후보 전체 보기
                      </button>
                    )}

                    <div className={styles.stationSelectGrid}>
                      {renderStationSelector(
                        1,
                        firstStationSearch,
                        firstStation,
                        firstStationResults,
                        setFirstStationSearch
                      )}

                      {renderStationSelector(
                        2,
                        secondStationSearch,
                        secondStation,
                        secondStationResults,
                        setSecondStationSearch
                      )}
                    </div>
                  </div>
                )}
                  </>
                )}

                {currentStep === 2 && (
                  <>
                <div className={styles.confirmSummary}>
                  <h2>신청 내용 확인</h2>
                  <div className={styles.confirmGrid}>
                    <div>
                      <span>이름</span>
                      <strong>{name || '-'}</strong>
                    </div>
                    <div>
                      <span>연락처</span>
                      <strong>{phone || '-'}</strong>
                    </div>
                    <div>
                      <span>소속</span>
                      <strong>
                        {[selectedDistrict, selectedTeam, selectedCampus]
                          .filter(Boolean)
                          .join(' / ') || '-'}
                      </strong>
                    </div>
                    <div>
                      <span>1지망</span>
                      <strong>{firstStation?.name || '-'}</strong>
                    </div>
                    <div>
                      <span>2지망</span>
                      <strong>{secondStation?.name || '-'}</strong>
                    </div>
                  </div>
                </div>

                <div className={styles.infoBox}>
                  <p className={styles.infoText}>
                    <strong>안내:</strong>{' '}
                    {isConfirmed
                      ? '버스표가 확정된 이후에는 신청 정보를 직접 수정할 수 없습니다.'
                      : '신청 완료 후 관리자가 희망 행선지를 참고하여 버스를 배정합니다.'}
                  </p>
                </div>
                  </>
                )}

                <div className={styles.buttonGroup}>
                  {currentStep > 0 && (
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={handlePrevStep}
                    >
                      이전
                    </button>
                  )}

                  {isConfirmed ? (
                    <button
                      type="button"
                      className={styles.submitButton}
                      onClick={() => navigate('/ticket')}
                    >
                      버스표 확인하기
                    </button>
                  ) : reservationDeadline.isClosed ? null : currentStep <
                    reservationSteps.length - 1 ? (
                    <button
                      type="button"
                      className={styles.submitButton}
                      onClick={handleNextStep}
                    >
                      다음
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.submitButton}
                      disabled={isSubmitting}
                      onClick={() => void handleSubmit()}
                    >
                      {isSubmitting
                        ? '신청 처리 중...'
                        : isEditMode
                          ? '신청 수정하기'
                          : '신청 완료하기'}
                    </button>
                  )}
                </div>

                {isEditMode && !isReservationLocked && (
                  <div className={styles.deleteAction}>
                    <span>신청을 취소하시겠어요?</span>
                    <button
                      type="button"
                      onClick={handleCancelReservation}
                      disabled={isDeletingReservation}
                    >
                      신청 삭제
                    </button>
                  </div>
                )}
              </form>
            </div>

            <div className={styles.footerInfo}>
              <p>
                신청 관련 문의:{' '}
                <span className={styles.email}>info@ccc-bus.org</span> |
                02-1234-5678
              </p>
            </div>
          </>
        )}

{isDeleteConfirmModalOpen && savedReservation && (
  <div
    className={styles.modalOverlay}
    onMouseDown={(event) => {
      if (event.target === event.currentTarget && !isDeletingReservation) {
        setIsDeleteConfirmModalOpen(false);
      }
    }}
  >
    <section
      className={styles.deleteConfirmModal}
      role="dialog"
      aria-modal="true"
      aria-labelledby="reservation-delete-title"
      aria-describedby="reservation-delete-description"
    >
      <span className={styles.deleteConfirmIcon} aria-hidden="true">
        <Trash2 size={26} />
      </span>
      <p className={styles.deleteConfirmEyebrow}>버스 신청 영구 삭제</p>
      <h2 id="reservation-delete-title">신청 정보를 삭제할까요?</h2>
      <p id="reservation-delete-description">
        삭제하면 신청자 정보와 희망 행선지, 연결된 결제 기록이 제거되고 향후
        배차 대상에서 제외됩니다. 삭제한 신청은 복구할 수 없습니다.
      </p>
      <dl className={styles.deleteConfirmSummary}>
        <div>
          <dt>신청자</dt>
          <dd>{savedReservation.name}</dd>
        </div>
        <div>
          <dt>소속</dt>
          <dd>
            {savedReservation.campus || savedReservation.district}
            {savedReservation.team ? ` · ${savedReservation.team}` : ''}
          </dd>
        </div>
        <div>
          <dt>희망 행선지</dt>
          <dd>
            {savedReservation.stationPreferences
              .map((preference) => preference.station.name)
              .join(' · ')}
          </dd>
        </div>
        <div>
          <dt>처리 결과</dt>
          <dd>신청 · 결제 기록 삭제, 배차 대상 제외</dd>
        </div>
      </dl>
      <div className={styles.deleteRefundWarning}>
        <AlertTriangle size={18} aria-hidden="true" />
        <span>
          결제 기록 삭제는 실제 환불 처리를 의미하지 않습니다. 이미 입금했다면
          관리자에게 환불 여부를 확인해주세요.
        </span>
      </div>
      {reservationDeleteError && (
        <p className={styles.deleteConfirmError} role="alert">
          {reservationDeleteError}
        </p>
      )}
      <div className={styles.deleteConfirmActions}>
        <button
          type="button"
          className={styles.deleteConfirmCancel}
          onClick={() => setIsDeleteConfirmModalOpen(false)}
          disabled={isDeletingReservation}
          autoFocus
        >
          신청 유지
        </button>
        <button
          type="button"
          className={styles.deleteConfirmSubmit}
          onClick={() => void confirmCancelReservation()}
          disabled={isDeletingReservation}
        >
          {isDeletingReservation ? (
            <>
              <LoaderCircle className={styles.deleteSpinner} size={18} />
              삭제 중...
            </>
          ) : (
            <>
              <Trash2 size={18} />
              신청 영구 삭제
            </>
          )}
        </button>
      </div>
    </section>
  </div>
)}

{isStationCandidateModalOpen && (
  <div
    className={styles.modalOverlay}
    onClick={closeStationCandidateModal}
  >
    <div
      className={styles.stationModal}
      onClick={(e) => e.stopPropagation()}
    >
      <div className={styles.modalHeader}>
        <div>
          <p className={styles.modalEyebrow}>STATION CANDIDATES</p>
          <h2>행선지 후보 전체 보기</h2>
        </div>

        <button
          type="button"
          className={styles.modalCloseButton}
          onClick={closeStationCandidateModal}
        >
          닫기
        </button>
      </div>

      <div className={styles.searchBox}>
        <Search size={18} color="#667085" />
        <input
          type="text"
          className={styles.searchInput}
          placeholder="역 이름, 노선, 지역으로 검색"
          value={stationCandidateSearch}
          onChange={(e) => setStationCandidateSearch(e.target.value)}
        />
      </div>

      <div className={styles.candidateSummary}>
        총 {stationCandidateResults.length}개 후보
      </div>

      <div className={styles.candidateList}>
        {stationCandidateResults.length > 0 ? (
          stationCandidateResults.map((station) => {
            const isFirstSelected = candidateFirstStation?.id === station.id;
            const isSecondSelected = candidateSecondStation?.id === station.id;

            return (
              <div key={station.id} className={styles.candidateItem}>
                <div className={styles.candidateInfo}>
                  <strong>{station.name}</strong>
                  <p>{station.line || '노선 정보 없음'}</p>
                {station.address && <small>{station.address}</small>}
                </div>

                <div className={styles.candidateButtonGroup}>
                  <button
                    type="button"
                    className={styles.candidateSelectButton}
                    disabled={isSecondSelected}
                    onClick={() => handleCandidateStationSelect(1, station)}
                  >
                    {isFirstSelected ? '1지망 선택됨' : '1지망'}
                  </button>

                  <button
                    type="button"
                    className={styles.candidateSelectButton}
                    disabled={isFirstSelected}
                    onClick={() => handleCandidateStationSelect(2, station)}
                  >
                    {isSecondSelected ? '2지망 선택됨' : '2지망'}
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <p className={styles.emptyResult}>검색 결과가 없습니다.</p>
        )}
      </div>

      <div className={styles.candidateModalFooter}>
        <div>
          <span>1지망 {candidateFirstStation?.name || '미선택'}</span>
          <span>2지망 {candidateSecondStation?.name || '미선택'}</span>
        </div>
        <button
          type="button"
          disabled={!candidateFirstStation || !candidateSecondStation}
          onClick={handleConfirmCandidateStations}
        >
          선택 완료
        </button>
      </div>
    </div>
  </div>
)}

{isDepositConfirmModalOpen && (
  <div
    className={styles.modalOverlay}
    onClick={() => {
      setIsDepositConfirmModalOpen(false);
      setShowDepositRequiredMessage(false);
    }}
  >
    <div
      className={styles.confirmModal}
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="deposit-confirm-title"
      aria-describedby="deposit-confirm-description"
    >
      <div className={styles.confirmModalIcon}>
        <Coins size={28} />
      </div>
      <h3 id="deposit-confirm-title">입금 완료 여부 확인</h3>
      <p id="deposit-confirm-description">
        <strong>{isExternal ? '서울지구' : selectedCampus}</strong> 입금 계좌로 입금한 경우에만
        신청을 계속해주세요.
      </p>
      {isPaymentInfoLoading ? (
        <div className={styles.paymentInfoState}>입금 정보를 확인하는 중...</div>
      ) : paymentInfoError ? (
        <div className={styles.confirmModalNotice} role="alert">
          {paymentInfoError}
        </div>
      ) : campusPaymentAccount ? (
        <dl className={styles.paymentInfoList}>
          <div>
            <dt>입금 금액</dt>
            <dd>{busTicketPrice.toLocaleString()}원</dd>
          </div>
          <div>
            <dt>입금 계좌</dt>
            <dd>
              <span>
                {campusPaymentAccount.bankName}{' '}
                {campusPaymentAccount.accountNumber}
              </span>
              <button
                type="button"
                className={styles.copyPaymentButton}
                onClick={() => void handleCopyAccountNumber()}
                aria-label="계좌번호 복사"
              >
                {copiedPaymentField === 'account' ? (
                  <>
                    <Check size={14} />
                    복사됨
                  </>
                ) : (
                  <>
                    <Copy size={14} />
                    복사
                  </>
                )}
              </button>
            </dd>
          </div>
          <div>
            <dt>예금주</dt>
            <dd>{campusPaymentAccount.accountHolder}</dd>
          </div>
          <div>
            <dt>입금자명</dt>
            <dd>
              공백 없이 이름 뒤에 휴대폰 뒷 4자리 (예:{' '}
              {name.trim() || '홍길동'}
              {phone.replace(/\D/g, '').slice(-4) || '1234'})
            </dd>
          </div>
        </dl>
      ) : null}
      {showDepositRequiredMessage && (
        <div className={styles.confirmModalNotice} role="status">
          신청을 완료하려면 먼저 입금이 필요합니다. 입금 후 다시 진행해
          주세요.
        </div>
      )}
      <div className={styles.confirmModalButtons}>
        <button
          type="button"
          className={styles.confirmModalNoBtn}
          onClick={() => setShowDepositRequiredMessage(true)}
        >
          아직 미입금 상태예요
        </button>
        <button
          type="button"
          className={styles.confirmModalYesBtn}
          disabled={
            isPaymentInfoLoading ||
            (!canConfirmWithAnnouncedPaymentInfo &&
              (Boolean(paymentInfoError) ||
                busTicketPrice <= 0 ||
                !campusPaymentAccount))
          }
          onClick={() => {
            setIsDepositConfirmModalOpen(false);
            setShowDepositRequiredMessage(false);
            setCurrentStep(2);
          }}
        >
          입금했어요
        </button>
      </div>
    </div>
  </div>
)}
      </main>

      {isLoginRequiredModalOpen && (
        <LoginRequiredModal
          onClose={() => navigate('/', { replace: true })}
          onConfirm={() =>
            navigate('/login', {
              replace: true,
              state: createLoginRequiredRedirectState('/reservation'),
            })
          }
          onSignup={() =>
            navigate('/signup', {
              replace: true,
              state: createLoginRequiredRedirectState('/reservation'),
            })
          }
        />
      )}
    </div>
  );
};

export default ReservationPage;
