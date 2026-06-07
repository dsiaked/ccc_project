import styles from '../AdminAllocationPage.module.css';

interface AdminAllocationSummaryProps {
  busOptionCount: number;
  destinationCount: number;
  totalPeople: number;
  totalPreferenceCount: number;
}

const AdminAllocationSummary = ({
  busOptionCount,
  destinationCount,
  totalPeople,
  totalPreferenceCount,
}: AdminAllocationSummaryProps) => {
  return (
    <div className={styles.summaryBox}>
      <div className={styles.summaryItem}>
        <span className={styles.label}>1지망 기준 인원</span>
        <span className={styles.value}>{totalPeople}명</span>
      </div>
      <div className={styles.summaryItem}>
        <span className={styles.label}>도착역</span>
        <span className={styles.value}>{destinationCount}개</span>
      </div>
      <div className={styles.summaryItem}>
        <span className={styles.label}>버스 옵션</span>
        <span className={styles.value}>{busOptionCount}개</span>
      </div>
      <div className={styles.summaryItem}>
        <span className={styles.label}>전체 지망 수</span>
        <span className={styles.value}>{totalPreferenceCount}건</span>
      </div>
    </div>
  );
};

export default AdminAllocationSummary;
