import { ClipboardCheck, CreditCard, MapPin, TicketCheck } from 'lucide-react';
import styles from './ProcessSection.module.css';

const steps = [
  {
    title: '버스 신청',
    description: '이름, 소속, 연락처와 희망 행선지 1·2지망을 입력합니다.',
    icon: ClipboardCheck,
  },
  {
    title: '입금 확인',
    description: '캠퍼스 회계 순장님이 신청자별 입금 상태를 확인합니다.',
    icon: CreditCard,
  },
  {
    title: '배차 확정',
    description: '전체 관리자가 신청 현황을 기준으로 버스와 행선지를 확정합니다.',
    icon: MapPin,
  },
  {
    title: '버스표 확인',
    description: '확정 후 홈 화면이나 버스표 페이지에서 탑승 정보를 확인합니다.',
    icon: TicketCheck,
  },
];

const ProcessSection = () => {
  return (
    <section className={styles.section}>
      <div className={styles.container}>
        <div className={styles.header}>
          <p>버스 예약 절차</p>
          <h2>귀가 버스 이용 순서</h2>
        </div>

        <div className={styles.stepList}>
          {steps.map((step, index) => {
            const Icon = step.icon;

            return (
              <article className={styles.stepCard} key={step.title}>
                <div className={styles.stepNumber}>{index + 1}</div>
                <div className={styles.iconBox}>
                  <Icon size={20} />
                </div>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default ProcessSection;
