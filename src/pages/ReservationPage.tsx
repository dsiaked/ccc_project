import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Bus, MapPin, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
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
import {
  saveReservation,
  deleteReservation,
  getReservation,
} from '../lib/reservationService';

import { calculateDistanceKm, formatDistance } from '../utils/distance';

const createReservationId = () => {
  return `reservation-${Date.now()}`;
};

const ReservationPage = () => {
  const navigate = useNavigate();

  const [dbReservation, setDbReservation] = useState<ReturnBusReservation | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const [districtOptions, setDistrictOptions] = useState<DistrictOption[]>([]);
  const [teamOptions, setTeamOptions] = useState<TeamOption[]>([]);
  const [campusOptions, setCampusOptions] = useState<CampusOption[]>([]);

  const [districtSearch, setDistrictSearch] = useState('');
  const [selectedDistrictId, setSelectedDistrictId] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState('');

  const [teamSearch, setTeamSearch] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('');

  const [campusSearch, setCampusSearch] = useState('');
  const [selectedCampusId, setSelectedCampusId] = useState('');
  const [selectedCampus, setSelectedCampus] = useState('');

  const [firstStationSearch, setFirstStationSearch] = useState('');
  const [secondStationSearch, setSecondStationSearch] = useState('');

  const [firstStation, setFirstStation] = useState<StationOption | null>(null);
  const [secondStation, setSecondStation] = useState<StationOption | null>(null);


const [isStationCandidateModalOpen, setIsStationCandidateModalOpen] =
  useState(false);
const [stationCandidateSearch, setStationCandidateSearch] = useState('');

const [stationOptions, setStationOptions] = useState<StationOption[]>([]);
const [isStationLoading, setIsStationLoading] = useState(true);


useEffect(() => {
  console.log('ReservationPage stationOptions:', stationOptions);
}, [stationOptions]);

  const savedReservation = dbReservation;
  const isEditMode = Boolean(savedReservation);
  const isConfirmed = savedReservation?.status === 'confirmed';

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

useEffect(() => {
  if (!window.kakao?.maps) {
    console.error('카카오 SDK가 로드되지 않았습니다.');
    setIsKakaoReady(false);
    return;
  }

  window.kakao.maps.load(() => {
    setIsKakaoReady(true);
  });
}, []);
  useEffect(() => {
    const checkLoginAndLoadData = async () => {
      try {
        const { data } = await supabase.auth.getSession();

        if (!data.session) {
          navigate('/login');
          return;
        }

        const reservation = await getReservation();
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
          .select('name, phone, district, team, campus')
          .eq('id', data.session.user.id)
          .maybeSingle();

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
      } catch (error) {
        console.error('Failed to load reservation:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkLoginAndLoadData();
  }, [navigate]);

  useEffect(() => {
    const loadOrganizations = async () => {
      try {
        const districts = await getDistrictOptions();
        setDistrictOptions(districts);
      } catch (error) {
        console.error('조직 정보 로드 실패:', error);
        alert('지구 정보를 불러오지 못했습니다.');
      }
    };

    loadOrganizations();
  }, []);

useEffect(() => {
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
      setTeamOptions(teams);

      if (!selectedTeam) return;

      const matchedTeam = teams.find((team) => team.name === selectedTeam);

      if (!matchedTeam) return;

      setSelectedTeamId(matchedTeam.id);
      setTeamSearch(matchedTeam.name);
      setSelectedTeam(matchedTeam.name);

      const campuses = await getCampusOptions(matchedTeam.id);
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
      console.error('프로필/예약 조직 정보 동기화 실패:', error);
    }
  };

  syncInitialOrganization();
}, [districtOptions, selectedDistrict, selectedTeam, selectedCampus]);


useEffect(() => {
  const loadStations = async () => {
    try {
      const stations = await getStationOptions();
      setStationOptions(stations);
    } catch (error) {
      console.error('도착역 정보 로드 실패:', error);
      alert('도착역 정보를 불러오지 못했습니다.');
    } finally {
      setIsStationLoading(false);
    }
  };

  loadStations();
}, []);

const searchPlaceCandidates = (keywordValue?: string) => {
  const keyword = (keywordValue ?? placeSearchInput).trim();

  if (!keyword) {
    setPlaceCandidates([]);
    setNearbyStations([]);
    setSelectedPlace(null);
    setHasSearchedPlace(false);
    return;
  }

  if (!isKakaoReady || !window.kakao?.maps?.services) {
    return;
  }

  setHasSearchedPlace(true);
  setIsSearchingPlace(true);
  setSelectedPlace(null);
  setNearbyStations([]);

  const places = new window.kakao.maps.services.Places();
  const geocoder = new window.kakao.maps.services.Geocoder();

  places.keywordSearch(keyword, (result: any[], status: string) => {
    if (status === window.kakao.maps.services.Status.OK) {
      const candidates: PlaceCandidate[] = result.slice(0, 7).map((place) => ({
        id: place.id,
        name: place.place_name,
        address: place.road_address_name || place.address_name || '주소 정보 없음',
        lat: Number(place.y),
        lng: Number(place.x),
      }));

      setPlaceCandidates(candidates);
      setIsSearchingPlace(false);
      return;
    }

    geocoder.addressSearch(keyword, (addressResult: any[], addressStatus: string) => {
      if (addressStatus === window.kakao.maps.services.Status.OK) {
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
              '주소 정보 없음',
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
};

useEffect(() => {
  const keyword = placeSearchInput.trim();

  if (!keyword) {
    setPlaceCandidates([]);
    setNearbyStations([]);
    setSelectedPlace(null);
    setHasSearchedPlace(false);
    setIsSearchingPlace(false);
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
}, [placeSearchInput, isKakaoReady]);

const handlePlaceConfirm = (place: PlaceCandidate) => {
  setSelectedPlace(place);
  setPlaceSearchInput(place.name);
  setPlaceCandidates([]);

  if (stationOptions.length === 0) {
    setNearbyStations([]);
    alert('도착역 후보 정보를 불러오지 못했습니다.');
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
    alert('이미 2지망으로 선택한 도착역입니다.');
    return;
  }

  if (rank === 2 && firstStation?.id === station.id) {
    alert('이미 1지망으로 선택한 도착역입니다.');
    return;
  }

  handleStationSelect(rank, station);
};

  const filteredDistricts = useMemo(() => {
    return districtOptions.filter((district) =>
      district.name.toLowerCase().includes(districtSearch.toLowerCase())
    );
  }, [districtOptions, districtSearch]);

  const filteredTeams = useMemo(() => {
    if (!selectedDistrictId) return [];

    return teamOptions.filter((team) =>
      team.name.toLowerCase().includes(teamSearch.toLowerCase())
    );
  }, [selectedDistrictId, teamOptions, teamSearch]);

  const filteredCampuses = useMemo(() => {
    if (!selectedTeamId) return [];

    return campusOptions.filter((campus) =>
      campus.name.toLowerCase().includes(campusSearch.toLowerCase())
    );
  }, [selectedTeamId, campusOptions, campusSearch]);

  const selectedStationIds = [
    firstStation?.id,
    secondStation?.id,
  ].filter(Boolean);

const searchStations = (keyword: string, currentStationId?: string) => {
  const normalizedKeyword = keyword.trim().toLowerCase();

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
};

  const firstStationResults = searchStations(
    firstStationSearch,
    firstStation?.id
  );

  const secondStationResults = searchStations(
    secondStationSearch,
    secondStation?.id
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
  };

  const handleStationSelect = (rank: 1 | 2, station: StationOption) => {
    if (rank === 1) {
      setFirstStation(station);
      setFirstStationSearch(station.name);
    }

    if (rank === 2) {
      setSecondStation(station);
      setSecondStationSearch(station.name);
    }
  };


const handleCandidateStationSelect = (
  rank: 1 | 2,
  station: StationOption
) => {
  if (rank === 1 && secondStation?.id === station.id) {
    alert('이미 2지망으로 선택한 도착역입니다.');
    return;
  }

  if (rank === 2 && firstStation?.id === station.id) {
    alert('이미 1지망으로 선택한 도착역입니다.');
    return;
  }

  handleStationSelect(rank, station);
  setIsStationCandidateModalOpen(false);
  setStationCandidateSearch('');
};

  const handleCancelReservation = async () => {
    const confirmed = window.confirm('신청 정보를 삭제하시겠습니까?');

    if (!confirmed) return;

    try {
      await deleteReservation();

      alert('신청 정보가 삭제되었습니다.');
      navigate('/');
    } catch (error) {
      console.error('예약 삭제 실패:', error);
      alert('예약 삭제에 실패했습니다. 다시 시도해주세요.');
    }
  };

  const validateStationPreferences = () => {
    if (!firstStation) {
      alert('1지망 도착역을 선택해주세요.');
      return false;
    }

    if (!secondStation) {
      alert('2지망 도착역을 선택해주세요.');
      return false;
    }

    if (firstStation.id === secondStation.id) {
      alert('1지망과 2지망은 서로 다른 도착역으로 선택해주세요.');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (savedReservation?.status === 'confirmed') {
      alert('이미 버스표가 확정되어 수정할 수 없습니다. 관리자에게 문의해주세요.');
      return;
    }

    if (!name.trim()) {
      alert('이름을 입력해주세요.');
      return;
    }

    if (!phone.trim()) {
      alert('연락처를 입력해주세요.');
      return;
    }

    if (!selectedDistrict) {
      alert('지구를 선택해주세요.');
      return;
    }

    if (!selectedTeam) {
      alert('팀을 선택해주세요.');
      return;
    }

    if (!selectedCampus) {
      alert('캠퍼스를 선택해주세요.');
      return;
    }

    if (!validateStationPreferences()) {
      return;
    }

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

      const reservation: ReturnBusReservation = {
        id: savedReservation?.id || createReservationId(),

        name: name.trim(),
        phone: phone.trim(),

        district: selectedDistrict,
        team: selectedTeam,
        campus: selectedCampus,

        stationPreferences,

        status: savedReservation?.status || 'requested',

        confirmedTicket: savedReservation?.confirmedTicket,

        requestedAt: savedReservation?.requestedAt || now,
        updatedAt: isEditMode ? now : undefined,
      };

      await saveReservation(reservation);

      alert(
        isEditMode
          ? '신청 정보가 수정되었습니다!'
          : '귀가 버스 신청이 완료되었습니다!'
      );

      navigate('/ticket');
    } catch (error) {
      console.error('예약 저장 실패:', error);
      alert('예약 저장에 실패했습니다. 다시 시도해주세요.');
    }
  };

  const renderStationSelector = (
    rank: 1 | 2,
    value: string,
    selectedStation: StationOption | null,
    results: StationOption[],
    onChange: (value: string) => void
  ) => {
    return (
      
      <div className={styles.inputGroup}>
        <label className={styles.label}>
          도착역 {rank}지망 <span className={styles.required}>*</span>
        </label>

        <div className={styles.searchBox}>
          <Search size={18} color="#667085" />
          <input
            type="text"
            className={styles.searchInput}
            placeholder={`예: ${rank === 1 ? '청량리역' : '건대입구역'}`}
            value={value}
            disabled={isConfirmed}
            onChange={(e) => {
              onChange(e.target.value);

              if (rank === 1) setFirstStation(null);
              if (rank === 2) setSecondStation(null);
            }}
          />
        </div>

        {value && !selectedStation && !isConfirmed && (
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
          <div className={styles.selectedBox}>
            <strong>{selectedStation.name}</strong>
<p>{selectedStation.line || '노선 정보 없음'}</p>
<p>{selectedStation.address || '주소 정보 없음'}</p>          
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
    <p>예약 정보를 불러오는 중...</p>
  </section>
) : (
          <>
            <div className={styles.headerContent}>
              <div className={styles.iconCircle}>
                <Bus size={32} color="#ffffff" />
              </div>

              <h1 className={styles.title}>
                {isEditMode ? '귀가 버스 신청 수정하기' : '귀가 버스 신청하기'}
              </h1>

              <p className={styles.subtitle}>
                수련회 종료 후 집으로 돌아가는 버스의 희망 도착역을 신청해주세요
              </p>
            </div>

            {isEditMode && !isConfirmed && (
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

            <div className={styles.formCard}>
              <form className={styles.form} onSubmit={handleSubmit}>
                <div className={styles.inputGroup}>
                  <label className={styles.label}>
                    이름 <span className={styles.required}>*</span>
                  </label>
                  <input
                    name="name"
                    type="text"
                    className={styles.input}
                    placeholder="홍길동"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={isConfirmed}
                    required
                  />
                </div>

                <div className={styles.inputGroup}>
                  <label className={styles.label}>
                    연락처 <span className={styles.required}>*</span>
                  </label>
                  <input
                    name="phone"
                    type="tel"
                    className={styles.input}
                    placeholder="010-1234-5678"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={isConfirmed}
                    required
                  />
                </div>

                <div className={styles.inputGroup}>
                  <label className={styles.label}>
                    지구 검색 및 선택 <span className={styles.required}>*</span>
                  </label>

                  <div className={styles.searchBox}>
                    <Search size={18} color="#667085" />
                    <input
                      type="text"
                      className={styles.searchInput}
                      placeholder="예: 서울지구, 경인지구, 강원지구"
                      value={districtSearch}
                      onChange={(e) => {
                        setDistrictSearch(e.target.value);
                        setSelectedDistrictId('');
                        setSelectedDistrict('');

                        setSelectedTeamId('');
                        setSelectedTeam('');
                        setTeamSearch('');
                        setTeamOptions([]);

                        setSelectedCampusId('');
                        setSelectedCampus('');
                        setCampusSearch('');
                        setCampusOptions([]);
                      }}
                      disabled={isConfirmed}
                    />
                  </div>

                  {districtSearch && !selectedDistrict && !isConfirmed && (
                    <div className={styles.searchResultBox}>
                      {filteredDistricts.length > 0 ? (
                        filteredDistricts.map((district) => (
                          <button
                            key={district.id}
                            type="button"
                            className={styles.searchResultItem}
                            onClick={() => handleDistrictSelect(district)}
                          >
                            <span>{district.name}</span>
                            <small>지구</small>
                          </button>
                        ))
                      ) : (
                        <p className={styles.emptyResult}>검색 결과가 없습니다.</p>
                      )}
                    </div>
                  )}

                  {selectedDistrict && (
                    <div className={styles.selectedBox}>
                      선택된 지구: <strong>{selectedDistrict}</strong>
                    </div>
                  )}
                </div>

                <div className={styles.inputGroup}>
                  <label className={styles.label}>
                    팀 검색 및 선택 <span className={styles.required}>*</span>
                  </label>

                  <div className={styles.searchBox}>
                    <Search size={18} color="#667085" />
                    <input
                      type="text"
                      className={styles.searchInput}
                      placeholder={
                        selectedDistrictId
                          ? '예: 북동팀, 중앙팀, 남팀'
                          : '먼저 지구를 선택해주세요'
                      }
                      value={teamSearch}
                      onChange={(e) => {
                        setTeamSearch(e.target.value);
                        setSelectedTeamId('');
                        setSelectedTeam('');

                        setSelectedCampusId('');
                        setSelectedCampus('');
                        setCampusSearch('');
                        setCampusOptions([]);
                      }}
                      disabled={!selectedDistrictId || isConfirmed}
                    />
                  </div>

                  {selectedDistrictId &&
                    teamSearch &&
                    !selectedTeam &&
                    !isConfirmed && (
                      <div className={styles.searchResultBox}>
                        {filteredTeams.length > 0 ? (
                          filteredTeams.map((team) => (
                            <button
                              key={team.id}
                              type="button"
                              className={styles.searchResultItem}
                              onClick={() => handleTeamSelect(team)}
                            >
                              <span>{team.name}</span>
                              <small>{selectedDistrict} 팀</small>
                            </button>
                          ))
                        ) : (
                          <p className={styles.emptyResult}>검색 결과가 없습니다.</p>
                        )}
                      </div>
                    )}

                  {selectedTeam && (
                    <div className={styles.selectedBox}>
                      선택된 팀: <strong>{selectedTeam}</strong>
                    </div>
                  )}
                </div>

                <div className={styles.inputGroup}>
                  <label className={styles.label}>
                    캠퍼스 검색 및 선택 <span className={styles.required}>*</span>
                  </label>

                  <div className={styles.searchBox}>
                    <Search size={18} color="#667085" />
                    <input
                      type="text"
                      className={styles.searchInput}
                      placeholder={
                        selectedTeamId
                          ? '캠퍼스를 검색해주세요'
                          : '먼저 팀을 선택해주세요'
                      }
                      value={campusSearch}
                      onChange={(e) => {
                        setCampusSearch(e.target.value);
                        setSelectedCampusId('');
                        setSelectedCampus('');
                      }}
                      disabled={!selectedTeamId || isConfirmed}
                    />
                  </div>

                  {selectedTeamId &&
                    campusSearch &&
                    !selectedCampus &&
                    !isConfirmed && (
                      <div className={styles.searchResultBox}>
                        {filteredCampuses.length > 0 ? (
                          filteredCampuses.map((campus) => (
                            <button
                              key={campus.id}
                              type="button"
                              className={styles.searchResultItem}
                              onClick={() => handleCampusSelect(campus)}
                            >
                              <span>{campus.name}</span>
                              <small>{selectedTeam}</small>
                            </button>
                          ))
                        ) : (
                          <p className={styles.emptyResult}>
                            검색 결과가 없습니다.
                          </p>
                        )}
                      </div>
                    )}

                  {selectedCampus && (
                    <div className={styles.selectedBox}>
                      선택된 캠퍼스: <strong>{selectedCampus}</strong>
                    </div>
                  )}
                </div>

                <div className={styles.sectionDivider} />

                <div className={styles.preferenceHeader}>
                  <h2>희망 도착역 선택</h2>
                  <p>
                    수련회 종료 후 귀가 버스에서 내리고 싶은 도착역을 1·2지망으로
                    선택해주세요.
                  </p>
                </div>
                {!isConfirmed && (
  <button
    type="button"
    className={styles.candidateOpenButton}
    onClick={() => {
      setIsStationCandidateModalOpen(true);
      setStationCandidateSearch('');
    }}
  >
    도착역 후보 전체 보기
  </button>
)}

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

<div className={styles.recommendationBox}>
  <div className={styles.recommendationHeader}>
    <MapPin size={20} color="#2563eb" />
    <div>
      <h3>주변 도착역 추천</h3>
      <p>
        주소나 장소명을 입력한 뒤 실제 도착 장소를 확정하면,
        그 장소에서 가까운 도착역 3곳을 추천합니다.
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
          setSelectedPlace(null);
          setNearbyStations([]);
          setHasSearchedPlace(false);
        }}
        disabled={isConfirmed}
      />
    </div>
  </div>

  {isSearchingPlace && (
    <p className={styles.emptyResult}>장소를 검색하는 중입니다...</p>
  )}

  {placeCandidates.length > 0 && !selectedPlace && (
    <div className={styles.searchResultBox}>
      {placeCandidates.map((place) => (
        <button
          key={place.id}
          type="button"
          className={styles.placeCandidateItem}
          onClick={() => handlePlaceConfirm(place)}
        >
          <strong>{place.name}</strong>
          <small>{place.address}</small>
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
      <strong>확정된 도착 장소: {selectedPlace.name}</strong>
      <p>{selectedPlace.address}</p>
    </div>
  )}

  {selectedPlace && nearbyStations.length > 0 && (
    <div className={styles.nearbyStationList}>
      {nearbyStations.map(({ station, distanceKm }, index) => (
        <div key={station.id} className={styles.recommendationItem}>
          <div>
            <strong>
              {index + 1}. {station.name}
            </strong>
            <p>{station.line || '노선 정보 없음'}</p>
            <p>{station.address || '주소 정보 없음'}</p>
            <small>직선거리 약 {formatDistance(distanceKm)}</small>
          </div>

          <div className={styles.recommendationButtons}>
            <button
              type="button"
              onClick={() => handleApplyRecommendation(station, 1)}
              disabled={secondStation?.id === station.id}
            >
              1지망
            </button>
            <button
              type="button"
              onClick={() => handleApplyRecommendation(station, 2)}
              disabled={firstStation?.id === station.id}
            >
              2지망
            </button>
          </div>
        </div>
      ))}
    </div>
  )}

  {selectedPlace && nearbyStations.length === 0 && (
    <p className={styles.emptyResult}>
      추천 가능한 도착역이 없습니다. 관리자에게 도착역 좌표 등록 여부를 확인해주세요.
    </p>
  )}
</div>

                <div className={styles.infoBox}>
                  <p className={styles.infoText}>
                    <strong>안내:</strong>{' '}
                    {isConfirmed
                      ? '버스표가 확정된 이후에는 신청 정보를 직접 수정할 수 없습니다.'
                      : '신청 완료 후 관리자가 희망 도착역을 참고하여 버스를 배정합니다.'}
                  </p>
                </div>

                <div className={styles.buttonGroup}>
                  {isEditMode && !isConfirmed && (
                    <button
                      type="button"
                      className={styles.deleteButton}
                      onClick={handleCancelReservation}
                    >
                      신청 삭제하기
                    </button>
                  )}

                  {isConfirmed ? (
                    <button
                      type="button"
                      className={styles.submitButton}
                      onClick={() => navigate('/ticket')}
                    >
                      확정표 확인하기
                    </button>
                  ) : (
                    <button type="submit" className={styles.submitButton}>
                      {isEditMode ? '신청 수정하기' : '신청 완료하기'}
                    </button>
                  )}
                </div>
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

{isStationCandidateModalOpen && (
  <div
    className={styles.modalOverlay}
    onClick={() => {
      setIsStationCandidateModalOpen(false);
      setStationCandidateSearch('');
    }}
  >
    <div
      className={styles.stationModal}
      onClick={(e) => e.stopPropagation()}
    >
      <div className={styles.modalHeader}>
        <div>
          <p className={styles.modalEyebrow}>STATION CANDIDATES</p>
          <h2>도착역 후보 전체 보기</h2>
        </div>

        <button
          type="button"
          className={styles.modalCloseButton}
          onClick={() => {
            setIsStationCandidateModalOpen(false);
            setStationCandidateSearch('');
          }}
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
            const isFirstSelected = firstStation?.id === station.id;
            const isSecondSelected = secondStation?.id === station.id;

            return (
              <div key={station.id} className={styles.candidateItem}>
                <div className={styles.candidateInfo}>
                  <strong>{station.name}</strong>
                  <p>{station.line || '노선 정보 없음'}</p>
                <small>{station.address || '주소 정보 없음'}</small>
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
    </div>
  </div>
)}
      </main>
    </div>
  );
};

export default ReservationPage;