import Header from '../components/Header';
import HeroSection from '../components/HeroSection';
import FeatureSection from '../components/FeatureSection';
import VideoSection from '../components/VideoSection';
import Footer from '../components/Footer';
import styles from '../App.module.css';

const HomePage = () => {
  return (
    <div className={styles.appContainer}>
      <Header />
      <main className={styles.mainContent}>
        <HeroSection />
        <FeatureSection />
        {/* <VideoSection /> */}
      </main>
      <Footer />
    </div>
  );
};

export default HomePage;
