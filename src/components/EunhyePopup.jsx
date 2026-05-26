import React, { useState, useEffect } from 'react';
import { X, ArrowRight, ArrowLeft, Heart, Check, MessageSquare, Pencil, Trash2 } from 'lucide-react';
import { collection, addDoc, query, where, onSnapshot, serverTimestamp, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';

const getCommentClientId = () => {
  const existingId = localStorage.getItem('comment_client_id');
  if (existingId) return existingId;

  const newId = crypto.randomUUID();
  localStorage.setItem('comment_client_id', newId);
  return newId;
};

export default function EunhyePopup({ onClose }) {
  const [step, setStep] = useState(1);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [comments, setComments] = useState([]);
  const [loadingComments, setLoadingComments] = useState(true);
  const [newName, setNewName] = useState(() => {
    return localStorage.getItem('comment_author_name') || '';
  });
  const [clientId] = useState(getCommentClientId);
  const [newContent, setNewContent] = useState('');
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editContent, setEditContent] = useState('');

  // 실시간 댓글 목록 Firestore 구독
  useEffect(() => {
    setLoadingComments(true);

    // 1.5초 무한 로딩 방지 타임아웃 설정
    const timeoutId = setTimeout(() => {
      setLoadingComments(false);
    }, 1500);

    const q = query(
      collection(db, 'comments'),
      where('artistId', '==', 'heart_eunhye')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      clearTimeout(timeoutId);
      const list = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });

      // 클라이언트 단에서 안전하게 최신순 정렬
      list.sort((a, b) => {
        const timeA = a.createdAt?.seconds || (a.createdAt instanceof Date ? a.createdAt.getTime() / 1000 : 0);
        const timeB = b.createdAt?.seconds || (b.createdAt instanceof Date ? b.createdAt.getTime() / 1000 : 0);
        return timeB - timeA;
      });

      setComments(list);
      setLoadingComments(false);
    }, (error) => {
      clearTimeout(timeoutId);
      console.error("댓글 로드 실패 (안전 대응으로 빈 목록 대체):", error);
      setComments([]);
      setLoadingComments(false);
    });

    return () => {
      clearTimeout(timeoutId);
      unsubscribe();
    };
  }, []);

  // 댓글 작성 기능
  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newName.trim() || !newContent.trim()) return;

    try {
      await addDoc(collection(db, 'comments'), {
        artistId: 'heart_eunhye',
        name: newName.trim(),
        content: newContent.trim(),
        clientId,
        createdAt: serverTimestamp()
      });
      setNewContent('');
      localStorage.setItem('comment_author_name', newName.trim());
    } catch (error) {
      console.error("댓글 등록 실패:", error);
    }
  };
  const startEditComment = (comment) => {
    if (!isOwnComment(comment)) return;

    setEditingCommentId(comment.id);
    setEditContent(comment.content || '');
  };

  const cancelEditComment = () => {
    setEditingCommentId(null);
    setEditContent('');
  };

  const handleUpdateComment = async (commentId) => {
    const comment = comments.find((item) => item.id === commentId);
    if (!comment || !isOwnComment(comment)) return;
    if (!editContent.trim()) return;

    try {
      await updateDoc(doc(db, 'comments', commentId), {
        content: editContent.trim(),
        updatedAt: serverTimestamp()
      });
      cancelEditComment();
    } catch (error) {
      console.error("댓글 수정 실패:", error);
    }
  };

  const handleDeleteComment = async (commentId) => {
    const comment = comments.find((item) => item.id === commentId);
    if (!comment || !isOwnComment(comment)) return;
    if (!window.confirm('이 감상평을 삭제할까요?')) return;

    try {
      await deleteDoc(doc(db, 'comments', commentId));
      if (editingCommentId === commentId) {
        cancelEditComment();
      }
    } catch (error) {
      console.error("댓글 삭제 실패:", error);
    }
  };

  const isOwnComment = (comment) => {
    if (comment.clientId) {
      return comment.clientId === clientId;
    }

    return comment.name?.trim() === newName.trim() && newName.trim().length > 0;
  };

  // 댓글 작성 시간 포맷팅
  const formatCommentDate = (createdAt) => {
    if (!createdAt) return '방금 전';
    const date = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return '방금 전';
    if (diffMins < 60) return `${diffMins}분 전`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}시간 전`;

    return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  };

  // 몽환적인 흩날리는 핑크색 하트 입자 데이터 정의
  const floatingHearts = [
    { id: 1, size: 24, left: '10%', delay: '0s', duration: '8s', opacity: 0.15 },
    { id: 2, size: 36, left: '75%', delay: '1s', duration: '10s', opacity: 0.12 },
    { id: 3, size: 16, left: '45%', delay: '3s', duration: '7s', opacity: 0.18 },
    { id: 4, size: 28, left: '25%', delay: '5s', duration: '9s', opacity: 0.14 },
    { id: 5, size: 20, left: '85%', delay: '2s', duration: '6s', opacity: 0.16 },
    { id: 6, size: 32, left: '60%', delay: '4s', duration: '11s', opacity: 0.13 },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300 overflow-x-hidden touch-pan-y">
      {/* 스타일 태그 삽입: 몽환적인 플로팅 하트 및 피그마 전용 서체 애니메이션 정의 */}
      <style>{`
        @keyframes float-up {
          0% {
            transform: translateY(100%) rotate(0deg) scale(0.8);
            opacity: 0;
          }
          10% {
            opacity: var(--op);
          }
          90% {
            opacity: var(--op);
          }
          100% {
            transform: translateY(-120%) rotate(360deg) scale(1.1);
            opacity: 0;
          }
        }
        .animate-float {
          animation: float-up var(--dur) ease-in-out infinite;
          animation-delay: var(--delay);
        }
        .font-sentiment {
          font-family: 'Jua', sans-serif;
        }
        /* [ROLLBACK] 원래의 주아 폰트로 일괄 원복 */
        .font-readable-sans {
          font-family: 'Jua', sans-serif;
        }
        /* 팝업 전체 바디 커스텀 스크롤 스타일 */
        .popup-body-scroll::-webkit-scrollbar {
          width: 5px;
        }
        .popup-body-scroll::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.02);
          border-radius: 999px;
        }
        .popup-body-scroll::-webkit-scrollbar-thumb {
          background: rgba(250, 92, 92, 0.2);
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.5);
        }
        .popup-body-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(250, 92, 92, 0.4);
        }
      `}</style>

      {/* 팝업 모달 몸체: Figma iPhone 17-23의 웅장한 가로-세로 뷰포트 비율을 1:1 복원하는 360x780px 고정형 카드 */}
      <div className="relative w-[360px] h-[780px] max-h-[92vh] rounded-[32px] overflow-hidden flex flex-col shadow-[0_25px_60px_rgba(0,0,0,0.18)] border border-gray-100 bg-white animate-in zoom-in-95 duration-300 touch-pan-y">

        {/* Step 1: 피그마 iPhone 17-23 1:1 완벽 절대 좌표 복원 */}
        {step === 1 && (
          <div className="relative flex-1 bg-gradient-to-b from-[#ffffff] via-[#fffbfb] to-[#fff0f0] text-gray-800 overflow-hidden select-none">

            {/* 1. 피그마 기하학적 도형 배경들 0.9배율 완벽 재현 (화이트-벚꽃핑크 감성에 어울리는 은은한 불투명도 적용) */}
            <div className="absolute inset-0 pointer-events-none z-[1] overflow-hidden">
              {/* Radial gradient background box 1 */}
              <div
                className="absolute w-[232px] h-[230px] rounded-[20px] left-[150px] top-[103px] opacity-[0.08]"
                style={{ backgroundImage: "linear-gradient(to bottom, #fa5c5c, #f8cfd0)" }}
              />
              {/* Radial gradient background box 2 */}
              <div
                className="absolute w-[143px] h-[142px] rounded-bl-[20px] rounded-br-[20px] rounded-tl-[20px] left-[219px] top-0 opacity-[0.06]"
                style={{ backgroundImage: "linear-gradient(to bottom, #fa5c5c, #ffedd5)" }}
              />
              {/* Radial gradient background box 3 */}
              <div
                className="absolute w-[73px] h-[254px] rounded-[20px] left-[242px] top-[281px] opacity-[0.05]"
                style={{ backgroundImage: "linear-gradient(to bottom, #fa5c5c, #f8cfd0)" }}
              />
              {/* Radial gradient background box 4 */}
              <div
                className="absolute w-[82px] h-[230px] rounded-[20px] left-[291px] top-[176px] opacity-[0.08]"
                style={{ backgroundImage: "linear-gradient(to bottom, #fa5c5c, #f8cfd0)" }}
              />
              {/* Radial gradient background box 5 */}
              <div
                className="absolute w-[137px] h-[230px] rounded-[20px] left-[276px] top-[448px] opacity-[0.07]"
                style={{ backgroundImage: "linear-gradient(to bottom, #fa5c5c, #ffffff)" }}
              />
              {/* Radial gradient background box 6 */}
              <div
                className="absolute w-[141px] h-[269px] rounded-[20px] left-[208px] top-[574px] opacity-[0.08]"
                style={{ backgroundImage: "linear-gradient(to bottom, #fa5c5c, #f8cfd0)" }}
              />
              {/* Radial gradient background box 7 */}
              <div
                className="absolute w-[68px] h-[269px] rounded-[20px] left-[15px] top-[631px] opacity-[0.06]"
                style={{ backgroundImage: "linear-gradient(to bottom, #fa5c5c, #f8cfd0)" }}
              />
              {/* Radial gradient background box 8 */}
              <div
                className="absolute w-[147px] h-[49px] rounded-[20px] left-[130px] top-[365px] opacity-[0.08]"
                style={{ backgroundImage: "linear-gradient(to bottom, #fa5c5c, #f8cfd0)" }}
              />
            </div>

            {/* 흩날리는 파스텔 핑크 하트 파티클 */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-[2]">
              {floatingHearts.map((heart) => (
                <div
                  key={heart.id}
                  className="absolute bottom-0 animate-float"
                  style={{
                    left: heart.left,
                    '--dur': heart.duration,
                    '--delay': heart.delay,
                    '--op': heart.opacity * 0.8,
                    fontSize: `${heart.size}px`,
                  }}
                >
                  <Heart className="fill-rose-400/8 text-transparent" style={{ width: heart.size, height: heart.size }} />
                </div>
              ))}
            </div>

            {/* 2. 피그마 자산 이미지들 배치 (은은한 실루엣 하트로) */}
            <div className="absolute inset-0 pointer-events-none z-[3]">
              {/* 자산 1 3 (하트 실루엣 1) */}
              <Heart className="absolute left-[180px] top-[70px] w-[50px] h-[48px] text-rose-300/20 fill-rose-100/10" />
              {/* 자산 1 2 (하트 실루엣 2) */}
              <Heart className="absolute left-[256px] top-[155px] w-[76px] h-[71px] text-rose-300/15 fill-rose-100/8" />
              {/* 자산 1 4 (하트 실루엣 3) */}
              <Heart className="absolute left-[10px] bottom-[20px] w-[50px] h-[48px] text-rose-300/20 fill-rose-100/10" />
              {/* 자산 1 1 (우측 대형 하트 실루엣) */}
              <div className="absolute left-[132px] top-[448px] w-[225px] h-[212px] rotate-[5.89deg] opacity-25">
                <Heart className="w-full h-full text-rose-300/30 fill-rose-100/15" />
              </div>
            </div>

            {/* 3. 글자 배치 (피그마 1:1 절대좌표 이식) */}
            <div className="relative z-10 w-full h-full">
              {/* SYMBOL1 : HEART */}
              <span className="absolute left-[29px] top-[31px] text-[15px] tracking-[1.92px] font-medium text-[#4a3b3b] font-readable-sans">
                SYMBOL1 : HEART
              </span>

              {/* Rectangle 361 (상단 얇은 가로선) */}
              <div className="absolute left-[29px] top-[64px] w-[35px] h-[1.5px] bg-[#e2cece]" />

              {/* 2026.05.26/06.02 */}
              <div className="absolute right-[25px] top-[58px] text-[10px] text-[#4a3b3b] tracking-[1.2px] text-right font-readable-sans">
                2026.05.26/06.02
              </div>

              {/* 과기대 붕어방 */}
              <div className="absolute right-[25px] top-[71px] text-[10px] text-[#4a3b3b] tracking-[1.2px] text-right font-readable-sans">
                과기대 붕어방
              </div>

              {/* 대형 감성 문구: 피그마의 웅장한 크기와 줄 바꿈, 위치 완벽 복원 (두께 낮춤, 색감 원톤 단일화) */}
              <div className="absolute left-[29px] top-[91px] w-[310px] text-left">
                <div className="text-[34px] leading-[1.22] text-[#4a3b3b] tracking-[1.5px] font-sentiment font-normal">
                  <p>사랑을</p>
                  <p>믿지 않는 내가,</p>
                  <div className="h-[18px]" />
                  <p>사랑 앞에</p>
                  <p>흔들리기</p>
                  <p>시작하는 이야기</p>
                </div>
              </div>

              {/* 하단 작가 소개 영역 */}
              {/* Rectangle 358 (작가 위 가로선) */}
              <div className="absolute left-[26px] top-[475px] w-[35px] h-[1.5px] bg-[#e2cece]" />

              {/* ARTIST. 김은혜 및 댓글 이모지 버튼 */}
              <div className="absolute left-[26px] right-[25px] top-[492px] flex items-center justify-between">
                <span className="text-[15px] tracking-[1.92px] font-medium text-[#4a3b3b] font-readable-sans">
                  ARTIST. 김은혜
                </span>
                <button
                  onClick={() => setShowCommentModal(true)}
                  className="relative flex items-center justify-center w-16 h-16 rounded-full bg-rose-50 border-2 border-rose-100 hover:bg-rose-100/50 text-[#fa5c5c] cursor-pointer transition-all active:scale-95 shadow-md animate-in fade-in duration-300"
                  title="감상평 남기기"
                >
                  <MessageSquare className="w-8 h-8" />
                  {/* 댓글 수 배지 */}
                  <span className="absolute -top-1 -right-1 flex h-6 min-w-[24px] px-1.5 items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold shadow-sm border border-white">
                    {comments.length}
                  </span>
                </button>
              </div>

              {/* 서울과학기술대학교 중앙동아리 CCC */}
              <div className="absolute left-[25px] top-[530px] text-[10px] tracking-[1.2px] text-[#4a3b3b] leading-normal font-readable-sans">
                <p>서울과학기술대학교</p>
                <p className="mt-0.5">중앙동아리 CCC</p>
              </div>

              {/* NEXT 버튼: 피그마의 우측 하단 둥근 캡슐로 완벽 구현 */}
              <button
                onClick={() => setStep(2)}
                className="absolute right-[25px] bottom-[35px] w-[140px] h-[47px] bg-gradient-to-r from-[#fa5c5c] to-[#ff7b7b] text-white rounded-[24px] flex items-center justify-between pl-6 pr-5 hover:opacity-90 transition-all duration-200 active:scale-[0.96] shadow-[0_4px_15px_rgba(250,92,92,0.25)] cursor-pointer font-readable-sans"
              >
                <span className="text-[13px] tracking-[1.68px] font-bold">NEXT</span>
                <ArrowRight className="w-4 h-4 text-white" />
              </button>
            </div>

            {/* 닫기 X 버튼 */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 z-20 w-8 h-8 bg-gray-100/80 hover:bg-gray-200/80 text-gray-500 rounded-full flex items-center justify-center backdrop-blur-sm transition-colors border border-gray-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Step 2: 피그마 1:1 디테일 완벽 복원 + 화이트-레드 감성 반전 테마 (iPhone 17 - 24 기반) */}
        {step === 2 && (
          <div className="relative flex-1 flex flex-col bg-gradient-to-b from-[#ffffff] via-[#fffbfb] to-[#ffebeb] text-gray-800 overflow-y-auto overflow-x-hidden popup-body-scroll select-none touch-pan-y">

            {/* 전체 높이를 확보하여 피그마의 웅장한 크기 비율을 시각적 왜곡 없이 보존 */}
            <div className="relative w-full flex flex-col p-6 pb-8 min-h-[1200px]">

              {/* 은은하게 그라데이션으로 퍼지는 로즈빛 광원 오버레이 */}
              <div
                className="absolute inset-0 pointer-events-none opacity-[0.02] mix-blend-multiply"
                style={{ backgroundImage: "linear-gradient(206.325deg, rgba(248, 33, 33, 0) 14.004%, rgb(183, 26, 26) 80.929%)" }}
              />
              <div
                className="absolute inset-0 pointer-events-none opacity-40 mix-blend-overlay"
                style={{ backgroundImage: "linear-gradient(147.794deg, rgba(248, 33, 33, 0) 34.559%, rgb(254, 229, 180) 100.79%)" }}
              />

              {/* 흩날리는 핑크빛 하트 파티클 */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none z-[1]">
                {floatingHearts.map((heart) => (
                  <div
                    key={heart.id}
                    className="absolute bottom-0 animate-float"
                    style={{
                      left: heart.left,
                      '--dur': heart.duration,
                      '--delay': heart.delay,
                      '--op': heart.opacity * 1.2,
                      fontSize: `${heart.size}px`,
                    }}
                  >
                    <Heart className="fill-rose-400/10 text-transparent" style={{ width: heart.size, height: heart.size }} />
                  </div>
                ))}
              </div>

              {/* 피그마 2:127 노드의 대형 하트 장식 (은은하고 고급스러운 핑크 로즈 실루엣으로 복원) */}
              <div className="absolute top-[5px] right-[-10px] w-64 h-60 opacity-40 pointer-events-none z-[2] mix-blend-normal animate-pulse">
                <Heart className="w-full h-full text-rose-200/40 fill-rose-100/15" />
              </div>

              {/* 상단 띠지 */}
              <div className="relative z-10 flex justify-between items-center pb-6 font-readable-sans">
                <span className="text-[10px] tracking-[1.2px] font-bold text-rose-500">
                  SYMBOL1 : HEART
                </span>
                <div className="w-[100px] h-[0.5px] bg-rose-200" />
              </div>

              {/* 피그마 2:145 노드 거대 둥근 카드 배경: 메인 조화를 위한 고급스러운 화이트 오페크 에멀전 배경화 */}
              <div className="relative z-10 flex-1 flex flex-col bg-white/80 backdrop-blur-md rounded-[20px] border border-rose-100 p-7 shadow-[0_8px_32px_rgba(0,0,0,0.03)]">

                {/* 피그마 1:1 대형 헤드라인 (좌측 정렬, 넓은 자간, 매혹적인 로즈 레드 테마) */}
                <div className="text-left font-sentiment text-[36px] leading-[1.15] text-rose-500 tracking-[5.88px] font-bold mt-2 select-text">
                  <p>귀하고</p>
                  <p>아름다운</p>
                  <p>나의 사랑아</p>
                </div>

                {/* 피그마 1:1 얇은 가로선 (로즈골드 31px 수평선) */}
                <div className="bg-rose-300 h-px w-[31px] my-6 flex-none" />

                {/* 피그마 1:1 본문 서사: [폰트 가독성 대격변] Pretendard 특화 및 자간/행간 최적화 적용 */}
                <div className="text-left text-[14.5px] leading-[1.85] text-gray-700 space-y-5 tracking-wide font-readable-sans select-text break-keep">
                  <p className="text-gray-800">나는 사람을 믿지 않는다. 내가 아끼는 사람들은 모두 떠나간다.</p>

                  <div className="h-1" />
                  <p>어린 시절을 함께 보낸 친구, <span className="font-bold text-gray-900">누구보다 사랑했던 연인</span>, 절대 변하지 않을 것이라 확신했던 모든 관계들이 매일 조금씩 흐려지는 것이 두렵다.</p>

                  <div className="h-1" />
                  <p>그래서 앞으로 진짜 내 마음을 열지 않기로 다짐했다.</p>

                  <div className="h-1" />
                  <p className="font-semibold text-gray-900">메말라버린 이 세상에 변치 않는 사랑은 없다고 나는 확신한다.</p>

                  <div className="h-1" />
                  <p>친구도, 가족도, 그 무엇도 언젠가는 사라질 것들.</p>

                  <div className="h-1" />
                  <p>인생은 여전히 혼자다. 나는 앞으로도 혼자일 것이다.</p>

                  <div className="py-2 text-rose-300 text-center flex justify-center gap-1 select-none font-bold">
                    <span>.</span><span>.</span><span>.</span>
                  </div>

                  <p>어느 날 캠퍼스에서 아주 우연히, <span className="font-bold text-gray-900">낯선 존재를 마주했다.</span></p>

                  <div className="h-1" />
                  <p>새로운 관계를 받아들이고 싶지 않았다.</p>

                  <div className="h-1" />
                  <p>그는 매일 끈질기게 나를 찾아왔다.</p>

                  <div className="h-1" />
                  <p className="italic text-gray-800">“사랑하는 친구야, 오늘 하루는 어떠니?”</p>

                  <div className="h-1" />
                  <p className="italic text-gray-800">
                    “같이 이야기 나누지 않을래? 항상 기다리고 있을게.”
                  </p>

                  <div className="h-1" />
                  <p>나는 가시 돋친 말로 대꾸했다. 그러면 곧 질려서 떨어져 나가겠지. 모두가 그랬듯이.</p>

                  <div className="h-1" />
                  <p className="pl-3 border-l-2 border-rose-200 text-[12.5px] italic text-rose-950 leading-relaxed bg-[#fff5f5] p-3.5 rounded-2xl border border-rose-100">
                    “저 잘 아세요? 당신에게 쓸 시간 없으니 좀 비켜줄래요?”
                  </p>
                  <p className="pl-3 border-l-2 border-rose-200 text-[12.5px] italic text-rose-950 leading-relaxed bg-[#fff5f5] p-3.5 rounded-2xl border border-rose-100">
                    “날 좀 내버려 두세요. 저는 당신이 싫어요.”
                  </p>

                  <div className="h-1" />
                  <p>밀어내고, 밀어내고, 또 밀어냈다.</p>

                  <div className="py-2 text-rose-300 text-center flex justify-center gap-1 select-none font-bold">
                    <span>.</span><span>.</span><span>.</span>
                  </div>

                  <p>일 년쯤 지났을 때, 그는 여전히 그 자리에서 나를 바라보고 있었다.</p>

                  <div className="h-1" />
                  <p>얼음장같이 식어버린 내 손을 감싸 안고 아무 말 없이 나를 바라보고 있었다.</p>

                  <div className="h-1" />
                  <p>지독하게 화를 내며 돌아섰던 순간에도, 밤새 술을 마시며 연락을 꺼버린 순간에도, 시험공부를 하느라 무시했던 순간에도,</p>

                  <div className="h-1" />
                  <p className="font-bold text-gray-900">기다리고, 기다리고, 또 기다리고 있었다.</p>

                  <div className="h-1" />
                  <p className="text-gray-800">화가 치밀어오르고, 이상하게 마음이 슬펐다.</p>

                  <div className="h-1" />
                  <p className="pl-3.5 border-l-2 border-rose-300 text-[12.5px] text-gray-800 leading-relaxed bg-[#fffafa] p-4 rounded-3xl border border-rose-100">
                    “저한테 왜 이렇게 잘해주세요?<br />
                    &nbsp;&nbsp;난 당신에게 줄 수 있는 것이 아무것도 없어요.<br />
                    &nbsp;&nbsp;이제 그만, 더 좋은 사람에게 시간을 쏟으세요.<br />
                    &nbsp;&nbsp;나보다 더 잘 나고 멋진 사람에게..<br />
                    &nbsp;&nbsp;난 당신에게 사랑받을 만한 사람이 아니에요.”
                  </p>

                  <div className="h-1" />
                  <p>그는 잠시도 망설이지 않고 대답했다.</p>

                  {/* 대답 상자: 러블리하고 눈에 잘 들어오는 맑은 핑크 베일 박스 테마 반전 */}
                  <div className="my-6 border border-rose-150 bg-[#fff5f5] py-5 px-3.5 rounded-3xl font-sentiment text-[14.5px] leading-relaxed text-[#c93b3b] text-center shadow-sm">
                    <p className="font-bold text-[#b92c2c]">“귀하고 아름다운 나의 사랑아,</p>
                    <p className="font-bold text-[#b92c2c]">나의 모든 마음을 너에게 줄게.</p>
                    <div className="h-2.5" />
                    <p>네가 나를 사랑하지 않아도, 괜찮아.</p>
                    <p>나는 그래도 너를 사랑한단다.</p>
                    <div className="h-2.5" />
                    <p className="font-bold text-rose-600">나는 변하지 않아.</p>
                    <p className="font-bold text-rose-600">지금도, 그리고 앞으로도.”</p>
                  </div>

                  <div className="h-2" />
                  <p className="text-[14px] font-bold text-gray-900">눈물을 쏟았다.</p>
                  <p className="text-[14px] font-bold text-gray-900">그제야 인정할 수밖에 없었다.</p>

                  <div className="h-3" />
                  <p className="font-sentiment text-[18px] text-gray-900 font-bold tracking-[2.5px] mt-4 text-center">
                    나는 너무나 외로웠다.
                  </p>
                </div>
              </div>

              {/* 하단 제어 버튼: 112px X 52px 둥근 캡슐 (화이트-레드 반전 테마) */}
              <div className="relative z-10 flex justify-center gap-6 mt-8 flex-none font-readable-sans">
                {/* BACK 버튼 */}
                <button
                  onClick={() => setStep(1)}
                  className="w-[112px] h-[52px] bg-white border border-gray-200 text-gray-700 rounded-[26px] flex items-center justify-center gap-1.5 hover:bg-gray-50 transition-all duration-200 active:scale-[0.96] cursor-pointer shadow-sm font-bold"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-gray-500" />
                  <span className="text-[13px] tracking-[1.68px]">BACK</span>
                </button>

                {/* NEXT (확인 완료) 버튼 */}
                <button
                  onClick={onClose}
                  className="w-[112px] h-[52px] bg-gradient-to-r from-[#fa5c5c] to-[#ff7b7b] text-white rounded-[26px] flex items-center justify-center gap-1 hover:opacity-90 transition-all duration-200 active:scale-[0.96] shadow-[0_4px_12px_rgba(250,92,92,0.2)] cursor-pointer font-bold"
                >
                  <span className="text-[13px] tracking-[1.68px]">NEXT</span>
                  <Check className="w-4 h-4" />
                </button>
              </div>

            </div>

            {/* 닫기 X 버튼 */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 z-20 w-8 h-8 bg-gray-100/80 hover:bg-gray-200/80 text-gray-500 rounded-full flex items-center justify-center backdrop-blur-sm transition-colors border border-gray-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

      </div>

      {/* 댓글 모달 */}
      {showCommentModal && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-200">
          <div className="relative w-[310px] h-[520px] rounded-[24px] bg-white border border-rose-100 flex flex-col p-5 shadow-2xl animate-in zoom-in-95 duration-200">
            {/* 헤더 */}
            <div className="flex justify-between items-center pb-3 border-b border-gray-100">
              <div className="flex items-center gap-1.5">
                <span className="text-lg font-bold text-rose-500 font-sentiment">감상평 남기기 💬</span>
                <span className="bg-rose-100 text-rose-600 text-xs px-2 py-0.5 rounded-full font-bold">{comments.length}</span>
              </div>
              <button
                onClick={() => setShowCommentModal(false)}
                className="w-7 h-7 bg-gray-50 border border-gray-100 hover:bg-gray-100 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* 댓글 리스트 */}
            <div className="flex-1 overflow-y-auto popup-body-scroll my-3 pr-1 space-y-3 select-text">
              {loadingComments ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 text-xs gap-2 py-10">
                  <div className="w-6 h-6 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
                  <span>감상평을 불러오는 중...</span>
                </div>
              ) : comments.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 text-xs py-10 text-center leading-relaxed animate-in fade-in duration-300">
                  <span className="text-3xl mb-2">🎈</span>
                  <span className="font-bold text-gray-600 text-sm">첫 감상평을 남겨보세요!</span>
                  <span className="opacity-70 mt-1">아직 작성된 감상평이 없습니다.</span>
                  <span className="opacity-60 mt-0.5">따뜻한 첫 마디로 작품을 채워주세요 ✨</span>
                </div>
              ) : (
                comments.map((comment) => {
                  const isEditing = editingCommentId === comment.id;
                  const canManage = isOwnComment(comment);

                  return (
                    <div key={comment.id} className="bg-rose-50/30 border border-rose-100/50 p-3 rounded-2xl flex flex-col gap-2 shadow-sm">
                      <div className="flex justify-between items-center gap-2">
                        <span className="font-bold text-xs text-rose-800 truncate">{comment.name}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] text-gray-400">{formatCommentDate(comment.createdAt)}</span>
                          {canManage && !isEditing && (
                            <>
                              <button
                                type="button"
                                onClick={() => startEditComment(comment)}
                                className="w-6 h-6 rounded-full bg-white/80 border border-gray-100 text-gray-400 hover:text-gray-700 flex items-center justify-center transition-colors cursor-pointer"
                                title="수정"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteComment(comment.id)}
                                className="w-6 h-6 rounded-full bg-white/80 border border-gray-100 text-gray-400 hover:text-red-500 hover:border-red-100 flex items-center justify-center transition-colors cursor-pointer"
                                title="삭제"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {isEditing ? (
                        <div className="flex flex-col gap-2">
                          <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            maxLength={100}
                            rows={3}
                            className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-gray-300 font-readable-sans resize-none bg-white/80 text-gray-800 leading-relaxed"
                          />
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={cancelEditComment}
                              className="h-7 px-3 rounded-full border border-gray-200 bg-white text-[11px] font-bold text-gray-500 hover:bg-gray-50 cursor-pointer"
                            >
                              취소
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateComment(comment.id)}
                              disabled={!editContent.trim()}
                              className="h-7 px-3 rounded-full bg-gray-800 disabled:bg-gray-300 text-[11px] font-bold text-white cursor-pointer"
                            >
                              저장
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-gray-700 text-xs leading-relaxed break-all whitespace-pre-wrap">{comment.content}</p>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* 댓글 폼 */}
            <form onSubmit={handleAddComment} className="flex flex-col gap-2 border-t border-gray-100 pt-3 mt-auto">
              <input
                type="text"
                placeholder="작성자 이름 (닉네임)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={10}
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400 font-readable-sans bg-gray-50/50 text-gray-800"
                required
              />
              <div className="relative">
                <textarea
                  placeholder="따뜻한 감상평을 남겨주세요! (최대 100자)"
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  maxLength={100}
                  rows={2}
                  className="w-full pl-3 pr-10 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400 font-readable-sans resize-none bg-gray-50/50 text-gray-800 leading-normal"
                  required
                />
                <button
                  type="submit"
                  disabled={!newName.trim() || !newContent.trim()}
                  className="absolute right-2 bottom-3 p-1.5 bg-[#fa5c5c] disabled:bg-gray-300 text-white rounded-lg flex items-center justify-center transition-all duration-200 active:scale-95 shadow-sm cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
