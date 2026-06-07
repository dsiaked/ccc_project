import { useNavigate } from 'react-router-dom';
import styles from './HeroSection.module.css';

const HeroSection = () => {
  const navigate = useNavigate();

  return (
    <section className={styles.section}>
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.imageWrapper}>
            <img 
              src="https://images.unsplash.com/photo-1511632765486-a01980e01a18?q=80&w=1000&auto=format&fit=crop" 
              alt="여름수련회 배경" 
              className={styles.image} 
            />
          </div>
          <div className={styles.overlay}>
            <div className={styles.content}>
              <h1 className={styles.title}>2026 CCC<br/>여름수련회</h1>
              <p className={styles.subtitle}>함께 나누는 믿음의 여정</p>
              <button 
                className={styles.ctaButton}
                onClick={() => navigate('/reservation')}
              >
                지금 버스 신청하기
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
