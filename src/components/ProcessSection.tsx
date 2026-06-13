import { useState } from 'react';
import { ChevronDown, ClipboardCheck, MapPin, TicketCheck } from 'lucide-react';
import styles from './ProcessSection.module.css';

const steps = [
  {
    title: '버스 신청',
    description: '이름, 소속, 연락처와 희망 행선지 1·2지망을 입력합니다.',
    icon: ClipboardCheck,
  },
  {
    title: '배차 확정',
    description: '관리자가 신청 현황을 바탕으로 버스와 행선지를 확정합니다.',
    icon: MapPin,
  },
  {
    title: '탑승권 확인',
    description: '배차 확정 후 탑승 호차와 출발 정보를 확인합니다.',
    icon: TicketCheck,
  },
];

const ProcessSection = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section className={styles.section}>
      <div className={styles.container}>
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={isOpen}
          aria-controls="bus-application-process"
          onClick={() => setIsOpen((open) => !open)}
        >
          <div className={styles.header}>
            <p>버스 신청 절차</p>
            <h2>귀가 버스 이용 순서</h2>
          </div>
          <ChevronDown className={isOpen ? styles.chevronOpen : styles.chevron} size={22} />
        </button>

        {isOpen && (
          <ol className={styles.stepList} id="bus-application-process">
            {steps.map((step, index) => {
              const Icon = step.icon;

              return (
                <li className={styles.stepCard} key={step.title}>
                  <div className={styles.stepNumber}>{index + 1}</div>
                  <div className={styles.iconBox}>
                    <Icon size={20} />
                  </div>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
};

export default ProcessSection;
