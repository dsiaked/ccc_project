import { PlayCircle } from 'lucide-react';
import styles from './VideoSection.module.css';

const VideoSection = () => {
  return (
    <section className={styles.section}>
      <div className={styles.container}>
        <h2 className={styles.title}>여름수련회 홍보 영상</h2>
        
        <div className={styles.videoWrapper}>
          <div className={styles.videoPlaceholder}>
            <div className={styles.playButtonContainer}>
              <PlayCircle size={64} color="rgba(255, 255, 255, 0.9)" strokeWidth={1.5} />
              <p className={styles.playText}>비디오를 재생하려면 클릭하세요</p>
            </div>
          </div>
        </div>

        <p className={styles.subtitle}>
          2026년 CCC 여름수련회에서 경험할 은혜로운 시간들을 미리 만나보세요
        </p>
      </div>
    </section>
  );
};

export default VideoSection;
