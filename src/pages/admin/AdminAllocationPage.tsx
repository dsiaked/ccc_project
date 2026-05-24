import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Zap } from 'lucide-react';
import Header from '../../components/Header';
import { supabase } from '../../lib/supabase';
import {
  getAdminRole,
  getBusOptions,
  addBusOption,
  deleteBusOption,
  getDestinationStats,
  calculateOptimalBusAllocation,
  saveBusAllocation,
} from '../../lib/adminService';
import styles from './AdminAllocationPage.module.css';

interface BusOption {
  id: string;
  capacity: number;
  estimated_price: number;
  notes?: string;
}

interface AllocationResult {
  combination: Array<{ count: number; capacity: number; price: number }>;
  totalCost: number;
  totalCapacity: number;
  totalBuses: number;
  efficiency: number;
}

const BusAllocationPage = () => {
  const navigate = useNavigate();
  const [busOptions, setBusOptions] = useState<BusOption[]>([]);
  const [destStats, setDestStats] = useState<Record<string, any>>({});
  const [allocations, setAllocations] = useState<AllocationResult[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [newBusCapacity, setNewBusCapacity] = useState('');
  const [newBusPrice, setNewBusPrice] = useState('');
  const [allocationName, setAllocationName] = useState('');
  const [selectedAllocation, setSelectedAllocation] = useState<AllocationResult | null>(null);

  useEffect(() => {
    const checkAndLoadData = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

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

        const [options, stats] = await Promise.all([
          getBusOptions(),
          getDestinationStats(),
        ]);

        setBusOptions(options);
        setDestStats(stats);
      } catch (error) {
        console.error('Failed to load data:', error);
        alert('데이터를 불러올 수 없습니다.');
      } finally {
        setLoading(false);
      }
    };

    checkAndLoadData();
  }, [navigate]);

  const handleAddBusOption = async () => {
    if (!newBusCapacity || !newBusPrice) {
      alert('정보를 모두 입력해주세요.');
      return;
    }

    try {
      await addBusOption(parseInt(newBusCapacity), parseInt(newBusPrice));
      const options = await getBusOptions();
      setBusOptions(options);
      setNewBusCapacity('');
      setNewBusPrice('');
      alert('버스 옵션이 추가되었습니다.');
    } catch (error) {
      console.error('Failed to add bus option:', error);
      alert('버스 옵션 추가에 실패했습니다.');
    }
  };

  const handleDeleteBusOption = async (id: string) => {
    if (!window.confirm('정말 삭제하시겠습니까?')) return;

    try {
      await deleteBusOption(id);
      const options = await getBusOptions();
      setBusOptions(options);
      alert('버스 옵션이 삭제되었습니다.');
    } catch (error) {
      console.error('Failed to delete bus option:', error);
      alert('버스 옵션 삭제에 실패했습니다.');
    }
  };

  const handleCalculateAllocation = () => {
    if (Object.keys(destStats).length === 0) {
      alert('신청 정보가 없습니다.');
      return;
    }

    if (busOptions.length === 0) {
      alert('버스 옵션을 먼저 추가해주세요.');
      return;
    }

    try {
      const results = calculateOptimalBusAllocation(
        destStats,
        busOptions
      );
      setAllocations(results);

      if (results.length === 0) {
        alert('적절한 버스 조합을 찾을 수 없습니다.');
      }
    } catch (error) {
      console.error('Failed to calculate allocation:', error);
      alert('배분 계산에 실패했습니다.');
    }
  };

  const handleSaveAllocation = async () => {
    if (!selectedAllocation || !allocationName) {
      alert('배분 명을 입력하고 선택해주세요.');
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) throw new Error('Session not found');

      await saveBusAllocation(
        allocationName,
        selectedAllocation,
        selectedAllocation.totalCost,
        selectedAllocation.totalCapacity,
        session.user.id
      );

      alert('버스 배분이 저장되었습니다.');
      setAllocationName('');
      setSelectedAllocation(null);
      setAllocations([]);
    } catch (error) {
      console.error('Failed to save allocation:', error);
      alert('버스 배분 저장에 실패했습니다.');
    }
  };

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

  const totalPeople = Object.values(destStats).reduce(
    (sum: number, stat: any) => sum + stat.total,
    0
  );

  return (
    <div className={styles.pageContainer}>
      <Header />

      <main className={styles.main}>
        <div className={styles.header}>
          <h1>버스 배분 최적화</h1>
          <p>현황에 맞는 최적의 버스 조합을 찾아보세요</p>
        </div>

        {/* 현황 요약 */}
        <div className={styles.summaryBox}>
          <div className={styles.summaryItem}>
            <span className={styles.label}>총 신청자</span>
            <span className={styles.value}>{totalPeople}명</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.label}>행선지</span>
            <span className={styles.value}>{Object.keys(destStats).length}개</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.label}>버스 옵션</span>
            <span className={styles.value}>{busOptions.length}개</span>
          </div>
        </div>

        {/* 버스 옵션 관리 */}
        <div className={styles.section}>
          <h2>버스 옵션 관리</h2>

          <div className={styles.busOptionForm}>
            <input
              type="number"
              placeholder="인승수"
              value={newBusCapacity}
              onChange={(e) => setNewBusCapacity(e.target.value)}
              min="1"
            />
            <input
              type="number"
              placeholder="예상 가격 (원)"
              value={newBusPrice}
              onChange={(e) => setNewBusPrice(e.target.value)}
              min="0"
            />
            <button className={styles.addButton} onClick={handleAddBusOption}>
              <Plus size={18} /> 추가
            </button>
          </div>

          <div className={styles.busOptionsList}>
            {busOptions.length > 0 ? (
              busOptions.map((option) => (
                <div key={option.id} className={styles.busOptionItem}>
                  <div className={styles.optionInfo}>
                    <p className={styles.optionCapacity}>{option.capacity}인승</p>
                    <p className={styles.optionPrice}>
                      {option.estimated_price.toLocaleString()}원
                    </p>
                  </div>
                  <button
                    className={styles.deleteButton}
                    onClick={() => handleDeleteBusOption(option.id)}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))
            ) : (
              <p className={styles.emptyMessage}>버스 옵션이 없습니다.</p>
            )}
          </div>
        </div>

        {/* 배분 계산 */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>최적 배분 계산</h2>
            <button
              className={styles.calculateButton}
              onClick={handleCalculateAllocation}
              disabled={busOptions.length === 0 || totalPeople === 0}
            >
              <Zap size={18} /> 계산하기
            </button>
          </div>

          {allocations.length > 0 && (
            <div className={styles.allocationResults}>
              <h3>추천 조합</h3>

              {allocations.map((allocation, index) => (
                <div
                  key={index}
                  className={`${styles.allocationCard} ${
                    selectedAllocation === allocation ? styles.selected : ''
                  }`}
                  onClick={() => setSelectedAllocation(allocation)}
                >
                  <div className={styles.allocationHeader}>
                    <h4>조합 {index + 1}</h4>
                    <input
                      type="radio"
                      name="allocation"
                      checked={selectedAllocation === allocation}
                      onChange={() => setSelectedAllocation(allocation)}
                    />
                  </div>

                  <div className={styles.allocationDetails}>
                    <div className={styles.detail}>
                      <span className={styles.detailLabel}>구성</span>
                      <span className={styles.detailValue}>
                        {allocation.combination
                          .map((b) => `${b.count}대 ${b.capacity}인`)
                          .join(' + ')}
                      </span>
                    </div>

                    <div className={styles.detail}>
                      <span className={styles.detailLabel}>총 인원</span>
                      <span className={styles.detailValue}>
                        {allocation.totalCapacity}인
                      </span>
                    </div>

                    <div className={styles.detail}>
                      <span className={styles.detailLabel}>총 버스</span>
                      <span className={styles.detailValue}>
                        {allocation.totalBuses}대
                      </span>
                    </div>

                    <div className={styles.detail}>
                      <span className={styles.detailLabel}>예상 비용</span>
                      <span className={styles.detailValue}>
                        {(allocation.totalCost / 1000000).toFixed(1)}M원
                      </span>
                    </div>

                    <div className={styles.detail}>
                      <span className={styles.detailLabel}>효율성</span>
                      <span className={styles.detailValue}>
                        {allocation.efficiency.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              ))}

              {selectedAllocation && (
                <div className={styles.saveSection}>
                  <input
                    type="text"
                    placeholder="배분 이름 (예: 2월 배분안)"
                    value={allocationName}
                    onChange={(e) => setAllocationName(e.target.value)}
                    className={styles.allocationNameInput}
                  />
                  <button
                    className={styles.saveButton}
                    onClick={handleSaveAllocation}
                    disabled={!allocationName}
                  >
                    저장하기
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default BusAllocationPage;
