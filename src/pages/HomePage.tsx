import Header from '../components/Header';
import HomeDeadlineBanner from '../components/HomeDeadlineBanner';
import HeroSection from '../components/HeroSection';
import HomeNoticeSection from '../components/HomeNoticeSection';
import ProcessSection from '../components/ProcessSection';
import Footer from '../components/Footer';
import styles from '../App.module.css';

const HomePage = () => {
  return (
    <div className={styles.appContainer}>
      <HomeDeadlineBanner />
      <Header />
      <main className={styles.mainContent}>
        <HeroSection />
        <HomeNoticeSection />
        <ProcessSection />
      </main>
      <Footer />
    </div>
  );
};

export default HomePage;
