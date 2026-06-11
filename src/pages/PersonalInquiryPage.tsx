import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, MessageCircle, Send } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import Footer from '../components/Footer';
import Header from '../components/Header';
import {
  addPersonalInquiryMessage,
  createPersonalInquiry,
  getMyPersonalInquiries,
  type PersonalInquiry,
  type PersonalInquiryCategory,
} from '../lib/personalInquiryService';
import { getPersonalInquirySubmitErrorMessage } from '../lib/personalInquiryError';
import { supabase } from '../lib/supabase';
import { createLoginRequiredRedirectState } from '../utils/redirect';
import styles from './PersonalInquiryPage.module.css';

const categoryOptions: Array<{ value: PersonalInquiryCategory; label: string }> = [
  { value: 'reservation', label: '신청 변경·취소' },
  { value: 'payment', label: '입금·환불' },
  { value: 'ticket', label: '탑승권·배차' },
  { value: 'boarding', label: '탑승 관련' },
  { value: 'etc', label: '기타' },
];
const categoryLabels = Object.fromEntries(
  categoryOptions.map((option) => [option.value, option.label])
) as Record<PersonalInquiryCategory, string>;
const statusLabels = {
  open: '접수',
  in_progress: '처리 중',
  resolved: '답변 완료',
  on_hold: '확인 보류',
} as const;
const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));

const PersonalInquiryPage = () => {
  const navigate = useNavigate();
  const [inquiries, setInquiries] = useState<PersonalInquiry[]>([]);
  const [category, setCategory] = useState<PersonalInquiryCategory>('reservation');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadInquiries = async () => {
    setLoading(true);
    try {
      setInquiries(await getMyPersonalInquiries());
      setError('');
    } catch (loadError) {
      console.error('개인 문의 조회 실패:', loadError);
      setError('문의 내역을 불러오지 못했습니다. 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    let syncTimer: number | null = null;
    const scheduleSync = () => {
      if (syncTimer !== null) window.clearTimeout(syncTimer);
      syncTimer = window.setTimeout(() => {
        syncTimer = null;
        if (active) void loadInquiries();
      }, 250);
    };

    const initialize = async () => {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (!active) return;
      if (sessionError || !data.session) {
        navigate('/login', {
          replace: true,
          state: createLoginRequiredRedirectState('/inquiries'),
        });
        return;
      }
      await loadInquiries();
    };
    void initialize();

    const channel = supabase
      .channel('my-personal-inquiries')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'personal_inquiries' }, scheduleSync)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'personal_inquiry_messages' }, scheduleSync)
      .subscribe();

    return () => {
      active = false;
      if (syncTimer !== null) window.clearTimeout(syncTimer);
      void supabase.removeChannel(channel);
    };
  }, [navigate]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    if (!title.trim() || !content.trim()) {
      setError('문의 제목과 내용을 모두 입력해주세요.');
      return;
    }
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await createPersonalInquiry({ category, title: title.trim(), content: content.trim() });
      setTitle('');
      setContent('');
      setSuccess('문의가 접수되었습니다.');
      await loadInquiries();
    } catch (submitError) {
      console.error('개인 문의 등록 실패:', submitError);
      setError(getPersonalInquirySubmitErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReply = async (inquiryId: string) => {
    const message = replyDrafts[inquiryId]?.trim();
    if (!message) return;
    setReplyingId(inquiryId);
    setError('');
    try {
      await addPersonalInquiryMessage({ inquiryId, message });
      setReplyDrafts((current) => ({ ...current, [inquiryId]: '' }));
      await loadInquiries();
    } catch (replyError) {
      console.error('개인 문의 추가 질문 실패:', replyError);
      setError('추가 질문을 등록하지 못했습니다.');
    } finally {
      setReplyingId(null);
    }
  };

  return (
    <div className={styles.page}>
      <Header />
      <main className={styles.main}>
        <header className={styles.pageHeader}>
          <p>HELP</p>
          <h1>개인 문의</h1>
          <span>신청, 입금, 탑승 관련 문의를 남기고 답변을 확인하세요.</span>
        </header>

        <form className={styles.composer} onSubmit={handleSubmit}>
          <div className={styles.composerTitle}><MessageCircle size={20} /><h2>문의하기</h2></div>
          <label>문의 유형
            <select value={category} onChange={(event) => setCategory(event.target.value as PersonalInquiryCategory)}>
              {categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>제목
            <input value={title} maxLength={100} onChange={(event) => setTitle(event.target.value)} placeholder="문의 내용을 간단히 적어주세요." />
          </label>
          <label>내용
            <textarea value={content} maxLength={2000} onChange={(event) => setContent(event.target.value)} placeholder="확인이 필요한 내용을 자세히 적어주세요." />
          </label>
          {error && <p className={styles.error} role="alert">{error}</p>}
          {success && <p className={styles.success} role="status"><CheckCircle2 size={16} />{success}</p>}
          <button type="submit" disabled={submitting}><Send size={17} />{submitting ? '접수 중...' : '문의 접수'}</button>
        </form>

        <section className={styles.history}>
          <div className={styles.sectionHeader}><h2>내 문의 내역</h2><button type="button" onClick={() => void loadInquiries()}>새로고침</button></div>
          {loading ? <div className={styles.empty}>문의 내역을 불러오는 중...</div> : inquiries.length === 0 ? <div className={styles.empty}>아직 등록한 문의가 없습니다.</div> : (
            <div className={styles.list}>
              {inquiries.map((inquiry) => (
                <article className={styles.inquiry} key={inquiry.id}>
                  <div className={styles.badges}><span>{categoryLabels[inquiry.category]}</span><strong className={styles[`status_${inquiry.status}`]}>{statusLabels[inquiry.status]}</strong></div>
                  <h3>{inquiry.title}</h3>
                  <time dateTime={inquiry.createdAt}>{formatDateTime(inquiry.createdAt)}</time>
                  <div className={styles.conversation}>
                    {inquiry.messages.map((message) => (
                      <div key={message.id} className={message.senderRole === 'global_admin' ? styles.adminMessage : styles.userMessage}>
                        <strong>{message.senderRole === 'global_admin' ? '관리자 답변' : '내 문의'}</strong>
                        <p>{message.message}</p>
                        <time dateTime={message.createdAt}>{formatDateTime(message.createdAt)}</time>
                      </div>
                    ))}
                  </div>
                  <div className={styles.replyBox}>
                    <textarea value={replyDrafts[inquiry.id] ?? ''} maxLength={2000} onChange={(event) => setReplyDrafts((current) => ({ ...current, [inquiry.id]: event.target.value }))} placeholder="추가 질문이나 확인할 내용을 남겨주세요." />
                    <button type="button" disabled={replyingId === inquiry.id || !replyDrafts[inquiry.id]?.trim()} onClick={() => void handleReply(inquiry.id)}><Send size={15} />추가 질문</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default PersonalInquiryPage;
