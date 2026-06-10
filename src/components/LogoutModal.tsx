import { useEffect, useRef, useState } from 'react';
import { LogOut, X } from 'lucide-react';

import styles from './LogoutModal.module.css';

interface LogoutModalProps {
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

const LogoutModal = ({ onClose, onConfirm }: LogoutModalProps) => {
  const modalRef = useRef<HTMLElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const isLoggingOutRef = useRef(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    confirmButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isLoggingOutRef.current) {
        onClose();
      }
      if (event.key !== 'Tab') return;

      const focusable = Array.from(
        modalRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
        ) ?? []
      );
      if (focusable.length === 0) {
        event.preventDefault();
        modalRef.current?.focus();
        return;
      }

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

  const handleConfirm = async () => {
    setError('');
    setIsLoggingOut(true);
    isLoggingOutRef.current = true;

    try {
      await onConfirm();
    } catch (caughtError) {
      console.error('로그아웃 실패:', caughtError);
      setError('로그아웃 중 문제가 발생했습니다. 다시 시도해주세요.');
      setIsLoggingOut(false);
      isLoggingOutRef.current = false;
    }
  };

  return (
    <div
      className={styles.backdrop}
      onMouseDown={() => {
        if (!isLoggingOut) onClose();
      }}
    >
      <section
        ref={modalRef}
        className={styles.modal}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="logout-modal-title"
        aria-describedby="logout-modal-description"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label="닫기"
          disabled={isLoggingOut}
        >
          <X size={18} />
        </button>

        <span className={styles.icon} aria-hidden="true">
          <LogOut size={24} />
        </span>
        <h2 id="logout-modal-title">로그아웃할까요?</h2>
        <p id="logout-modal-description">
          현재 계정에서 안전하게 로그아웃합니다.
        </p>

        {error && <p className={styles.error} role="alert">{error}</p>}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onClose}
            disabled={isLoggingOut}
          >
            취소
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            className={styles.confirmButton}
            onClick={() => void handleConfirm()}
            disabled={isLoggingOut}
          >
            <LogOut size={16} />
            {isLoggingOut ? '로그아웃 중...' : '로그아웃'}
          </button>
        </div>
      </section>
    </div>
  );
};

export default LogoutModal;
