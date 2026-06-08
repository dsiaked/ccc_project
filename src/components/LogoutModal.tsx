import { useEffect, useRef, useState } from 'react';
import { LogOut, X } from 'lucide-react';

import styles from './LogoutModal.module.css';

interface LogoutModalProps {
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

const LogoutModal = ({ onClose, onConfirm }: LogoutModalProps) => {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    confirmButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isLoggingOut) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLoggingOut, onClose]);

  const handleConfirm = async () => {
    setError('');
    setIsLoggingOut(true);

    try {
      await onConfirm();
    } catch (caughtError) {
      console.error('로그아웃 실패:', caughtError);
      setError('로그아웃 중 문제가 발생했습니다. 다시 시도해주세요.');
      setIsLoggingOut(false);
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
        className={styles.modal}
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

        {error && <p className={styles.error}>{error}</p>}

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
