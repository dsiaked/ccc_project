import React, { useState, useEffect } from 'react';
import { X, ArrowRight, ArrowLeft, Check, MessageSquare, Pencil, Trash2 } from 'lucide-react';
import { collection, addDoc, query, where, onSnapshot, serverTimestamp, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';

const getCommentClientId = () => {
  const existingId = localStorage.getItem('comment_client_id');
  if (existingId) return existingId;

  const newId = crypto.randomUUID();
  localStorage.setItem('comment_client_id', newId);
  return newId;
};

const CustomCrossIcon = ({ className = "w-6 h-6", color = "currentColor", strokeWidth = "2.5", style }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
  >
    <line x1="12" y1="2.5" x2="12" y2="21.5" />
    <line x1="6.5" y1="8" x2="17.5" y2="8" />
  </svg>
);

export default function CrossJihoonPopup({ onClose }) {
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

  const artistId = 'cross_jihoon';

  // 실시간 댓글 목록 Firestore 구독
  useEffect(() => {
    setLoadingComments(true);

    // 1.5초 무한 로딩 방지 타임아웃 설정
    const timeoutId = setTimeout(() => {
      setLoadingComments(false);
    }, 1500);

    const q = query(
      collection(db, 'comments'),
      where('artistId', '==', artistId)
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
        artistId,
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

  // 몽환적인 흩날리는 초록색 십자가 입자 데이터 정의 (화이트-그린 테마룩)
  const floatingParticles = [
    { id: 1, size: 20, left: '12%', delay: '0s', duration: '9s', opacity: 0.16 },
    { id: 2, size: 32, left: '78%', delay: '1.5s', duration: '11s', opacity: 0.14 },
    { id: 3, size: 18, left: '48%', delay: '4.0s', duration: '8s', opacity: 0.18 },
    { id: 4, size: 28, left: '22%', delay: '5.8s', duration: '10s', opacity: 0.15 },
    { id: 5, size: 16, left: '88%', delay: '2.5s', duration: '7s', opacity: 0.17 },
    { id: 6, size: 26, left: '62%', delay: '4.8s', duration: '12s', opacity: 0.14 },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300 overflow-x-hidden touch-pan-y">
      {/* 스타일 태그 삽입: 몽환적인 플로팅 파티클 및 피그마 전용 서체 애니메이션 정의 */}
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
          background: rgba(76, 175, 80, 0.2);
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.5);
        }
        .popup-body-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(76, 175, 80, 0.4);
        }
      `}</style>

      {/* 팝업 모달 몸체: Figma iPhone 17-14의 가로-세로 뷰포트 비율을 1:1 복원하는 360x780px 고정형 카드 */}
      <div className="relative w-[360px] h-[780px] max-h-[92vh] rounded-[32px] overflow-hidden flex flex-col shadow-[0_25px_60px_rgba(0,0,0,0.18)] border border-gray-100 bg-white animate-in zoom-in-95 duration-300 touch-pan-y">

        {/* Step 1: 피그마 iPhone 17-14 1:1 완벽 절대 좌표 복원 */}
        {step === 1 && (
          <div className="relative flex-1 bg-gradient-to-b from-[#ffffff] via-[#f7faf8] to-[#eef7f0] text-gray-800 overflow-hidden select-none">

            {/* 1. 피그마 기하학적 도형 배경들 0.9배율 완벽 재현 (그린 오리지널 테마) */}
            <div className="absolute inset-0 pointer-events-none z-[1] overflow-hidden">
              {/* Radial gradient background box 1 */}
              <div
                className="absolute w-[232px] h-[230px] rounded-[20px] left-[150px] top-[103px] opacity-[0.08]"
                style={{ backgroundImage: "linear-gradient(to bottom, #4caf50, #e8f5e9)" }}
              />
              {/* Radial gradient background box 2 */}
              <div
                className="absolute w-[143px] h-[142px] rounded-bl-[20px] rounded-br-[20px] rounded-tl-[20px] left-[219px] top-0 opacity-[0.06]"
                style={{ backgroundImage: "linear-gradient(to bottom, #4caf50, #f1faf2)" }}
              />
              {/* Radial gradient background box 3 */}
              <div
                className="absolute w-[73px] h-[254px] rounded-[20px] left-[242px] top-[281px] opacity-[0.05]"
                style={{ backgroundImage: "linear-gradient(to bottom, #4caf50, #e8f5e9)" }}
              />
              {/* Radial gradient background box 4 */}
              <div
                className="absolute w-[82px] h-[230px] rounded-[20px] left-[291px] top-[176px] opacity-[0.08]"
                style={{ backgroundImage: "linear-gradient(to bottom, #4caf50, #e8f5e9)" }}
              />
              {/* Radial gradient background box 5 */}
              <div
                className="absolute w-[137px] h-[230px] rounded-[20px] left-[276px] top-[448px] opacity-[0.07]"
                style={{ backgroundImage: "linear-gradient(to bottom, #4caf50, #ffffff)" }}
              />
              {/* Radial gradient background box 6 */}
              <div
                className="absolute w-[141px] h-[269px] rounded-[20px] left-[208px] top-[574px] opacity-[0.08]"
                style={{ backgroundImage: "linear-gradient(to bottom, #4caf50, #e8f5e9)" }}
              />
              {/* Radial gradient background box 7 */}
              <div
                className="absolute w-[68px] h-[269px] rounded-[20px] left-[15px] top-[631px] opacity-[0.06]"
                style={{ backgroundImage: "linear-gradient(to bottom, #4caf50, #e8f5e9)" }}
              />
              {/* Radial gradient background box 8 */}
              <div
                className="absolute w-[147px] h-[49px] rounded-[20px] left-[130px] top-[365px] opacity-[0.08]"
                style={{ backgroundImage: "linear-gradient(to bottom, #4caf50, #e8f5e9)" }}
              />
            </div>

            {/* 흩날리는 파스텔 그린 십자가 파티클 */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-[2]">
              {floatingParticles.map((part) => (
                <div
                  key={part.id}
                  className="absolute bottom-0 animate-float"
                  style={{
                    left: part.left,
                    '--dur': part.duration,
                    '--delay': part.delay,
                    '--op': part.opacity * 0.8,
                    fontSize: `${part.size}px`,
                  }}
                >
                  <CustomCrossIcon className="text-emerald-400/20" color="currentColor" strokeWidth="2.5" style={{ width: part.size, height: part.size }} />
                </div>
              ))}
            </div>

            {/* 2. 피그마 자산 이미지들 배치 (십자가 기호 실루엣으로 일치) */}
            <div className="absolute inset-0 pointer-events-none z-[3]">
              {/* 자산 4 3 (십자가 실루엣 1) */}
              <CustomCrossIcon className="absolute left-[180px] top-[70px] w-[50px] h-[48px]" color="#6ee7b7" strokeWidth="2" style={{ opacity: 0.2 }} />
              {/* 자산 4 2 (십자가 실루엣 2) */}
              <CustomCrossIcon className="absolute left-[256px] top-[155px] w-[76px] h-[71px]" color="#6ee7b7" strokeWidth="2.2" style={{ opacity: 0.15 }} />
              {/* 자산 4 4 (십자가 실루엣 3) */}
              <CustomCrossIcon className="absolute left-[10px] bottom-[20px] w-[50px] h-[48px]" color="#6ee7b7" strokeWidth="2" style={{ opacity: 0.2 }} />
              {/* 자산 4 1 (우측 대형 십자가 실루엣) */}
              <div className="absolute left-[132px] top-[448px] w-[225px] h-[212px] rotate-[10deg] opacity-20">
                <CustomCrossIcon className="w-full h-full" color="#6ee7b7" strokeWidth="2.5" />
              </div>
            </div>

            {/* 3. 글자 배치 (피그마 1:1 절대좌표 이식 및 홍지훈 작가 사양 적용) */}
            <div className="relative z-10 w-full h-full">
              {/* SYMBOL3 : CROSS */}
              <span className="absolute left-[29px] top-[31px] text-[15px] tracking-[1.92px] font-medium text-[#2d3a2e] font-readable-sans">
                SYMBOL3 : CROSS
              </span>

              {/* Rectangle 362 (상단 얇은 가로선) */}
              <div className="absolute left-[29px] top-[64px] w-[35px] h-[1.5px] bg-[#c3dec6]" />

              {/* 2026.05.26/06.02 */}
              <div className="absolute right-[25px] top-[58px] text-[10px] text-[#2d3a2e] tracking-[1.2px] text-right font-readable-sans">
                2026.05.26/06.02
              </div>

              {/* 과기대 붕어방 */}
              <div className="absolute right-[25px] top-[71px] text-[10px] text-[#2d3a2e] tracking-[1.2px] text-right font-readable-sans">
                과기대 붕어방
              </div>

              {/* 대형 감성 문구: 홍지훈 작가 (iPhone 17 - 14) 피그마 배치 및 그린/차콜 단일화 */}
              <div className="absolute left-[29px] top-[91px] w-[310px] text-left">
                <div className="text-[32px] leading-[1.24] text-[#2d3a2e] tracking-[1.2px] font-sentiment font-normal">
                  <p className="font-bold">소중한 것</p>
                </div>
              </div>

              {/* 하단 작가 소개 영역 */}
              {/* Rectangle 358 (작가 위 가로선) */}
              <div className="absolute left-[26px] top-[475px] w-[35px] h-[1.5px] bg-[#c3dec6]" />

              {/* ARTIST. 홍지훈 및 댓글 이모지 버튼 */}
              <div className="absolute left-[26px] right-[25px] top-[492px] flex items-center justify-between">
                <span className="text-[15px] tracking-[1.92px] font-medium text-[#2d3a2e] font-readable-sans">
                  ARTIST. 홍지훈
                </span>
                <button
                  onClick={() => setShowCommentModal(true)}
                  className="relative flex items-center justify-center w-16 h-16 rounded-full bg-emerald-50 border-2 border-emerald-100 hover:bg-emerald-100/50 text-[#10b981] cursor-pointer transition-all active:scale-95 shadow-md animate-in fade-in duration-300"
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
              <div className="absolute left-[25px] top-[530px] text-[10px] tracking-[1.2px] text-[#2d3a2e] leading-normal font-readable-sans">
                <p>서울과학기술대학교</p>
                <p className="mt-0.5">중앙동아리 CCC</p>
              </div>

              {/* NEXT 버튼: 우측 하단 둥근 캡슐 */}
              <button
                onClick={() => setStep(2)}
                className="absolute right-[25px] bottom-[35px] w-[140px] h-[47px] bg-gradient-to-r from-[#4caf50] to-[#66bb6a] text-white rounded-[24px] flex items-center justify-between pl-6 pr-5 hover:opacity-90 transition-all duration-200 active:scale-[0.96] shadow-[0_4px_15px_rgba(76,175,80,0.25)] cursor-pointer font-readable-sans"
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

        {/* Step 2: 피그마 iPhone 17-16 기반 디테일 완벽 복원 (십자가 홍지훈 작가 수필 서사 적용) */}
        {step === 2 && (
          <div className="relative flex-1 flex flex-col bg-gradient-to-b from-[#ffffff] via-[#f7faf8] to-[#eef7f0] text-gray-800 overflow-y-auto overflow-x-hidden popup-body-scroll select-none touch-pan-y">

            {/* 전체 높이를 확보하여 피그마의 비율을 보존 */}
            <div className="relative w-full flex flex-col p-6 pb-8 min-h-[960px]">

              {/* 은은하게 그라데이션으로 퍼지는 초록빛 광원 오버레이 */}
              <div
                className="absolute inset-0 pointer-events-none opacity-[0.02] mix-blend-multiply"
                style={{ backgroundImage: "linear-gradient(206.325deg, rgba(76, 175, 80, 0) 14.004%, rgb(46, 125, 50) 80.929%)" }}
              />
              <div
                className="absolute inset-0 pointer-events-none opacity-40 mix-blend-overlay"
                style={{ backgroundImage: "linear-gradient(147.794deg, rgba(76, 175, 80, 0) 34.559%, rgb(200, 230, 201) 100.79%)" }}
              />

              {/* 흩날리는 초록빛 십자가 파티클 */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none z-[1]">
                {floatingParticles.map((part) => (
                  <div
                    key={part.id}
                    className="absolute bottom-0 animate-float"
                    style={{
                      left: part.left,
                      '--dur': part.duration,
                      '--delay': part.delay,
                      '--op': part.opacity * 1.2,
                      fontSize: `${part.size}px`,
                    }}
                  >
                    <CustomCrossIcon className="text-emerald-400/15" color="currentColor" strokeWidth="2.5" style={{ width: part.size, height: part.size }} />
                  </div>
                ))}
              </div>

              {/* 우측 상단 십자가 장식 (오버레이) */}
              <div className="absolute top-[5px] right-[-10px] w-64 h-60 opacity-30 pointer-events-none z-[2] animate-pulse">
                <CustomCrossIcon className="w-full h-full" color="#a7f3d0" strokeWidth="2.5" style={{ opacity: 0.3 }} />
              </div>

              {/* 상단 띠지 */}
              <div className="relative z-10 flex justify-between items-center pb-6 font-readable-sans">
                <span className="text-[10px] tracking-[1.2px] font-bold text-[#2e7d32]">
                  SYMBOL3 : CROSS
                </span>
                <div className="w-[100px] h-[0.5px] bg-[#c3dec6]" />
              </div>

              {/* 카드 배경 */}
              <div className="relative z-10 flex-1 flex flex-col bg-white/80 backdrop-blur-md rounded-[20px] border border-green-100 p-7 shadow-[0_8px_32px_rgba(0,0,0,0.03)]">

                {/* 헤드라인 타이틀: "상처 대신에 남겨진 것" */}
                <div className="text-left font-sentiment text-[28px] leading-[1.2] text-[#2e7d32] tracking-[1px] font-bold mt-2 select-text">
                  <p>상처 대신에</p>
                  <p>남겨진 것</p>
                </div>

                {/* 얇은 가로선 */}
                <div className="bg-[#4caf50] h-px w-[31px] my-5 flex-none" />

                {/* 본문 서사: 홍지훈 작가 십자가 수필 (온점 하나도 누락 없이 100% 반영) */}
                <div className="text-left text-[14.5px] leading-[1.85] text-gray-700 space-y-5 tracking-wide font-readable-sans select-text break-keep">
                  <p className="text-gray-850 font-medium">
                    사람들은 늘 중요한 것만 지키려 했다.<br />
                    값비싼 것, 아름다운 것, 모두가 인정하는 것들만 조심스럽게 다루었다.
                  </p>

                  <div className="h-1" />
                  <p className="text-gray-800">
                    길가에 굴러다니는 금 간 플라스틱 조각, 녹이 슨 나사,<br />
                    버려진 과자봉지 같은 것들 앞에서<br />
                    사람들은 아무런 의미도 발견하지 못했다.<br />
                    그저 쓸모를 다해 버려진 지저분한 쓰레기일 뿐이었다.
                  </p>

                  <div className="h-1" />
                  <p className="text-emerald-800 font-semibold">
                    하지만 한 사람만은 달랐다.<br />
                    그는 길가에 버려진 물건들을 그냥 지나치지 못했다.
                  </p>

                  <div className="h-1" />
                  <p className="text-gray-800">
                    남들에게는 하찮아 보일지 몰라도,<br />
                    오래 닳은 자국과 깨진 모서리 안에는<br />
                    분명 누군가의 시간이 남아 있다고 믿었기 때문이다.
                  </p>

                  <div className="py-3 px-4 bg-emerald-50/50 rounded-2xl border border-emerald-100/30 my-2 text-center select-none">
                    <p className="text-emerald-700 font-medium text-[13.5px]">누군가의 손때가 묻은 표면</p>
                    <p className="text-emerald-700 font-medium text-[13.5px] mt-1.5">빛바랜 색</p>
                    <p className="text-emerald-700 font-medium text-[13.5px] mt-1.5">무뎌진 끝자락</p>
                  </div>

                  <p className="text-gray-800">
                    그 안에는 한때 그것이 누군가의 일상에<br />
                    깊숙이 자리 잡고 있었을 흔적이 고스란히 배어 있었다.<br />
                    세상의 눈에는 가치 없어 보일지라도, 그것들은 저마다의 이야기를 품은 세상에 단 하나뿐인 존재였다.
                  </p>

                  <div className="h-1" />
                  <p className="text-green-700 font-medium">
                    그래서 그는 그런 물건들을<br />
                    하나씩 조심스럽게 주워오기 시작했다.
                  </p>
                  <p className="text-green-700 font-medium">
                    그리고 세상에서 가장 값비싸고 소중한 보석을 다루듯,<br />
                    투명하고 깨끗한 유리 돔 안에 그것들을 하나씩 넣어 두었다.
                  </p>

                  <div className="pl-3 border-l-2 border-emerald-300 py-1 my-3 bg-emerald-50/20 rounded-r-xl">
                    <p className="text-gray-600 text-[13px] italic">"먼지가 쌓이지 않도록,"</p>
                    <p className="text-gray-600 text-[13px] italic mt-1">"누군가 함부로 건드려 훼손되지 않도록,"</p>
                    <p className="text-gray-600 text-[13px] italic mt-1">"그리고 다시는 차가운 바닥에 버려지지 않도록..."</p>
                  </div>

                  <p className="text-gray-900 font-semibold">
                    그는 단단하고 투명한 유리로<br />
                    그것들을 감싸 안았다.
                  </p>

                  <div className="h-1" />
                  <p className="text-gray-800">
                    사람들은 유리 돔 속에 갇힌 보잘것없는 것들을 보며<br />
                    이해하지 못한다는 듯 물었다.
                  </p>
                  <p className="font-bold text-[#1b5e20] pl-3 border-l-2 border-emerald-500 my-2">
                    "왜 저런 쓸모없는 걸 그렇게까지 애지중지 지키는 거야?"
                  </p>
                  <p className="text-gray-800">
                    그 질문에 그는 그저 조용히 미소 지을 뿐이었다.
                  </p>

                  <div className="py-3 text-green-300 text-center flex justify-center gap-1 select-none font-bold">
                    <span>.</span><span>.</span><span>.</span>
                  </div>

                  <p className="text-gray-800">
                    그에게 유리 돔은 단순한 덮개가 아니었다.<br />
                    세상이 '가치 없다'고 낙인찍은 것들을 향한 온전한 존중이자, 쉽게 버려지는 약한 존재들을 끝까지 지켜내겠다는 다짐이었다.
                  </p>

                  {/* 대답 상자: 홍지훈 작가 수필 최종 구절 */}
                  <div className="my-6 border border-green-150 bg-[#f1faf2] py-5 px-3.5 rounded-3xl font-sentiment text-[14.5px] leading-relaxed text-[#2e7d32] text-center shadow-sm break-keep">
                    <p className="font-bold text-[#2d6630]">유리 돔 안에서 비로소 안전해진 물건들은,</p>
                    <p className="font-bold text-[#2d6630]">더 이상 버려진 쓰레기가 아니었다.</p>
                    <div className="h-1.5" />
                    <p className="font-bold text-[#1b5e20] text-[15.5px]">누군가의 기억과 시간이 담긴</p>
                    <p className="font-bold text-[#1b5e20] text-[15.5px]">세상에서 가장 특별한 보물이 되었다.</p>
                  </div>

                </div>
              </div>

              {/* 하단 제어 버튼: 112px X 52px 둥근 캡슐 */}
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
                  className="w-[112px] h-[52px] bg-gradient-to-r from-[#4caf50] to-[#66bb6a] text-white rounded-[26px] flex items-center justify-center gap-1 hover:opacity-90 transition-all duration-200 active:scale-[0.96] shadow-[0_4px_12px_rgba(76,175,80,0.2)] cursor-pointer font-bold"
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

        {/* 댓글 모달 */}
        {showCommentModal && (
          <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-200">
            <div className="relative w-[310px] h-[520px] rounded-[24px] bg-white border border-emerald-100 flex flex-col p-5 shadow-2xl animate-in zoom-in-95 duration-200">
              {/* 헤더 */}
              <div className="flex justify-between items-center pb-3 border-b border-gray-100">
                <div className="flex items-center gap-1.5">
                  <span className="text-lg font-bold text-emerald-500 font-sentiment">감상평 남기기 💬</span>
                  <span className="bg-emerald-100 text-emerald-600 text-xs px-2 py-0.5 rounded-full font-bold">{comments.length}</span>
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
                    <div className="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
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
                    <div key={comment.id} className="bg-emerald-50/30 border border-emerald-100/50 p-3 rounded-2xl flex flex-col gap-2 shadow-sm">
                      <div className="flex justify-between items-center gap-2">
                        <span className="font-bold text-xs text-emerald-800 truncate">{comment.name}</span>
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
                  className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-400 font-readable-sans bg-gray-50/50 text-gray-800"
                  required
                />
                <div className="relative">
                  <textarea
                    placeholder="따뜻한 감상평을 남겨주세요! (최대 100자)"
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    maxLength={100}
                    rows={2}
                    className="w-full pl-3 pr-10 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-400 font-readable-sans resize-none bg-gray-50/50 text-gray-800 leading-normal"
                    required
                  />
                  <button
                    type="submit"
                    disabled={!newName.trim() || !newContent.trim()}
                    className="absolute right-2 bottom-3 p-1.5 bg-[#10b981] disabled:bg-gray-300 text-white rounded-lg flex items-center justify-center transition-all duration-200 active:scale-95 shadow-sm cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
