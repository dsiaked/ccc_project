import { useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, Clock3, Ticket } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getReservationDeadline } from '../lib/reservationDeadlineService';
import { getReservation } from '../lib/reservationService';
import type { ReturnBusReservation } from '../types/reservation';
import { createLoginRequiredRedirectState } from '../utils/redirect';
import LoginRequiredModal from './LoginRequiredModal';
import styles from './HeroSection.module.css';

const HeroSection = () => {
  const navigate = useNavigate();
  const [reservation, setReservation] = useState<ReturnBusReservation | null>(
    null
  );
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isDeadlineClosed, setIsDeadlineClosed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loginRequiredPath, setLoginRequiredPath] = useState<string | null>(
    null
  );

  useEffect(() => {
    let isMounted = true;

    const loadReservation = async () => {
      setIsLoading(true);
      setLoadError('');

      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (!isMounted) return;
        if (sessionError) throw sessionError;
        if (!session) return;

        setIsLoggedIn(true);

        const [savedReservation, deadline] = await Promise.all([
          getReservation(),
          getReservationDeadline(),
        ]);

        if (isMounted) {
          setReservation(savedReservation);
          setIsDeadlineClosed(deadline.isClosed);
        }
      } catch (error) {
        console.error('홈 신청 정보 로드 실패:', error);
        if (isMounted) setLoadError('신청 정보를 불러오지 못했습니다.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void loadReservation();

    return () => {
      isMounted = false;
    };
  }, [loadAttempt]);

  const isConfirmed = reservation?.status === 'confirmed';
  const canBookRemainingSeat =
    isLoggedIn && isDeadlineClosed && !reservation;
  const content = isLoading
    ? {
        label: '2026 CCC 여름수련회',
        title: '귀가 버스 정보를 확인하고 있어요',
        description: '잠시만 기다려주세요.',
        buttonLabel: '확인 중',
        icon: Clock3,
        path: '/reservation',
      }
    : loadError
      ? {
          label: '정보 확인 실패',
          title: '신청 정보를 확인하지 못했습니다',
          description: '네트워크 연결을 확인한 뒤 다시 시도해주세요.',
          buttonLabel: '다시 시도',
          icon: AlertCircle,
          path: '/',
        }
      : isConfirmed
      ? {
          label: '배차 확정 완료',
          title: '귀가 버스가 확정되었어요',
          description: '탑승 전 호차, 좌석과 출발 정보를 꼭 확인해주세요.',
          buttonLabel: '버스표 보기',
          icon: CheckCircle2,
          path: '/ticket',
        }
      : reservation
        ? {
            label: '신청 접수 완료',
            title: '신청이 정상적으로 접수되었어요',
            description: '관리자 확인 후 배차 결과를 이곳에서 안내해 드릴게요.',
            buttonLabel: '신청 내역 보기',
            icon: Clock3,
            path: '/ticket',
          }
        : canBookRemainingSeat
          ? {
              label: '신청 마감 이후',
              title: '잔여 좌석을 신청하세요',
              description:
                '확정 배차 후 잔여 좌석을 확인하고 원하는 버스를 선택할 수 있어요.',
              buttonLabel: '잔여 좌석 신청하기',
              icon: Ticket,
              path: '/remaining-seats',
            }
          : {
              label: '2026 CCC 여름수련회',
              title: '귀가 버스를 편하게 신청하세요',
              description:
                '희망 행선지를 선택하고 배차 결과를 한 곳에서 확인할 수 있어요.',
              buttonLabel: '버스 신청하기',
              icon: Ticket,
              path: '/reservation',
            };
  const StatusIcon = content.icon;

  return (
    <>
      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.card}>
          <div className={styles.imageWrapper}>
            <img
              src="https://images.unsplash.com/photo-1511632765486-a01980e01a18?q=80&w=1000&auto=format&fit=crop"
              alt="함께 모인 수련회 참가자들"
              className={styles.image}
              width="1000"
              height="667"
              fetchPriority="high"
            />
          </div>
          <div className={styles.overlay}>
            <div className={styles.content}>
              <div role={loadError ? 'alert' : undefined}>
                <p className={styles.eyebrow}>
                  <StatusIcon size={14} />
                  {content.label}
                </p>
                <h1 className={styles.title}>{content.title}</h1>
                <p className={styles.subtitle}>{content.description}</p>
              </div>
              <button
                type="button"
                className={styles.ctaButton}
                disabled={isLoading}
                onClick={() => {
                  if (loadError) {
                    setLoadAttempt((attempt) => attempt + 1);
                    return;
                  }

                  if (!isLoggedIn) {
                    setLoginRequiredPath(content.path);
                    return;
                  }

                  navigate(content.path);
                }}
              >
                {content.buttonLabel}
                {!isLoading && <ArrowRight size={16} />}
              </button>
            </div>
          </div>
          </div>
        </div>
      </section>

      {loginRequiredPath && (
        <LoginRequiredModal
          onClose={() => setLoginRequiredPath(null)}
          onConfirm={() =>
            navigate('/login', {
              state: createLoginRequiredRedirectState(loginRequiredPath),
            })
          }
        />
      )}
    </>
  );
};

export default HeroSection;
