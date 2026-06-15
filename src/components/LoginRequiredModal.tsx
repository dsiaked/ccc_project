import { useEffect, useRef } from 'react';
import { LogIn, X } from 'lucide-react';

import styles from './LoginRequiredModal.module.css';

interface LoginRequiredModalProps {
  onClose: () => void;
  onConfirm: () => void;
  onSignup?: () => void;
}

const LoginRequiredModal = ({
  onClose,
  onConfirm,
  onSignup,
}: LoginRequiredModalProps) => {
  const modalRef = useRef<HTMLElement>(null);
  const loginButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    loginButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;

      const focusable = Array.from(
        modalRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
        ) ?? []
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      opener?.focus();
    };
  }, [onClose]);

  return (
    <div className={styles.backdrop} onMouseDown={onClose}>
      <section
        ref={modalRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-required-modal-title"
        aria-describedby="login-required-modal-description"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label="닫기"
        >
          <X size={18} />
        </button>

        <span className={styles.icon} aria-hidden="true">
          <LogIn size={25} />
        </span>
        <h2 id="login-required-modal-title">로그인이 필요해요</h2>
        <p id="login-required-modal-description">
          버스 신청과 신청 내역 확인은 로그인 후 이용할 수 있습니다.
          로그인하면 요청하신 화면으로 자동 이동합니다.
        </p>

        <button
          ref={loginButtonRef}
          type="button"
          className={styles.loginButton}
          onClick={onConfirm}
        >
          로그인하기
        </button>
        {onSignup && (
          <button
            type="button"
            className={styles.signupButton}
            onClick={onSignup}
          >
            처음이신가요? 회원가입
          </button>
        )}
      </section>
    </div>
  );
};

export default LoginRequiredModal;
