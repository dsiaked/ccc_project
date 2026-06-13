import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Header from '../components/Header';
import HomeDeadlineBanner from '../components/HomeDeadlineBanner';
import HeroSection from '../components/HeroSection';
import HomeNoticeSection from '../components/HomeNoticeSection';
import ProcessSection from '../components/ProcessSection';
import Footer from '../components/Footer';
import styles from '../App.module.css';
import { supabase } from '../lib/supabase';

const HomePage = () => {
  const location = useLocation();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(Boolean(session));
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(Boolean(session));
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!location.hash) return;

    const target = document.getElementById(location.hash.slice(1));
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth';
    target?.scrollIntoView({ behavior, block: 'start' });
    target?.focus({ preventScroll: true });
  }, [location.hash]);

  return (
    <div className={styles.appContainer}>
      <HomeDeadlineBanner />
      <Header />
      <main className={styles.mainContent}>
        <HeroSection />
        {isLoggedIn ? (
          <>
            <HomeNoticeSection />
            <ProcessSection />
          </>
        ) : (
          <>
            <ProcessSection />
            <HomeNoticeSection />
          </>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default HomePage;
