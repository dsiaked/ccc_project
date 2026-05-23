import React, { useState, useEffect } from 'react';
import { X, ArrowRight, ArrowLeft, Heart, Check, MessageSquare } from 'lucide-react';
import { collection, addDoc, query, where, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export default function YewonPopup({ onClose }) {
  const [step, setStep] = useState(1);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [comments, setComments] = useState([]);
  const [loadingComments, setLoadingComments] = useState(true);
  const [newName, setNewName] = useState(() => {
    return localStorage.getItem('comment_author_name') || '';
  });
  const [newContent, setNewContent] = useState('');

  // 실시간 댓글 목록 Firestore 구독
  useEffect(() => {
    setLoadingComments(true);

    // 1.5초 무한 로딩 방지 타임아웃 설정
    const timeoutId = setTimeout(() => {
      setLoadingComments(false);
    }, 1500);

    const q = query(
      collection(db, 'comments'),
      where('artistId', '==', 'heart_yewon')
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
        artistId: 'heart_yewon',
        name: newName.trim(),
        content: newContent.trim(),
        createdAt: serverTimestamp()
      });
      setNewContent('');
      localStorage.setItem('comment_author_name', newName.trim());
    } catch (error) {
      console.error("댓글 등록 실패:", error);
    }
  };

  // 댓글 상대 시간 포맷터
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

      {/* 팝업 모달 몸체: Figma iPhone 17-26의 가로-세로 뷰포트 비율을 1:1 복원하는 360x780px 고정형 카드 */}
      <div className="relative w-[360px] h-[780px] max-h-[92vh] rounded-[32px] overflow-hidden flex flex-col shadow-[0_25px_60px_rgba(0,0,0,0.18)] border border-gray-100 bg-white animate-in zoom-in-95 duration-300 touch-pan-y">

        {/* Step 1: 피그마 iPhone 17-26 1:1 완벽 절대 좌표 복원 */}
        {step === 1 && (
          <div className="relative flex-1 bg-gradient-to-b from-[#ffffff] via-[#fffbfb] to-[#fff0f0] text-gray-800 overflow-hidden select-none">

            {/* 1. 피그마 기하학적 도형 배경들 0.9배율 완벽 재현 */}
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

            {/* 2. 피그마 자산 이미지들 배치 (은은한 실루엣 하트로 일치) */}
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

            {/* 3. 글자 배치 (피그마 1:1 절대좌표 이식 및 손예원 작가 사양 적용) */}
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

              {/* 대형 감성 문구: 손예원 작가 (iPhone 17 - 26) 피그마 배치 및 색감/두께 단일화 */}
              <div className="absolute left-[29px] top-[91px] w-[310px] text-left">
                <div className="text-[34px] leading-[1.22] text-[#4a3b3b] tracking-[1.5px] font-sentiment font-normal">
                  <p>간절히</p>
                  <p>두드리던</p>
                  <p>사랑보다,</p>
                  <div className="h-[18px]" /> {/* 피그마 오리지널 빈 줄 간격 정밀 복원 */}
                  <p>이미</p>
                  <p>내 문을</p>
                  <p>두드리고 있던</p>
                  <p>사랑이 더 컸음을</p>
                </div>
              </div>

              {/* 하단 작가 소개 영역 */}
              {/* Rectangle 358 (작가 위 가로선) */}
              <div className="absolute left-[26px] top-[475px] w-[35px] h-[1.5px] bg-[#e2cece]" />

              {/* ARTIST. 손예원 및 댓글 이모지 버튼 */}
              <div className="absolute left-[26px] right-[25px] top-[492px] flex items-center justify-between">
                <span className="text-[15px] tracking-[1.92px] font-medium text-[#4a3b3b] font-readable-sans">
                  ARTIST. 손예원
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

              {/* NEXT PAGE 버튼: 우측 하단 둥근 캡슐 */}
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

        {/* Step 2: 피그마 iPhone 17-27 기반 디테일 완벽 복원 (손예원 작가 수필 서사 적용) */}
        {step === 2 && (
          <div className="relative flex-1 flex flex-col bg-gradient-to-b from-[#ffffff] via-[#fffbfb] to-[#ffebeb] text-gray-800 overflow-y-auto overflow-x-hidden popup-body-scroll select-none touch-pan-y">

            {/* 전체 높이를 확보하여 피그마의 비율을 보존 */}
            <div className="relative w-full flex flex-col p-6 pb-8 min-h-[1250px]">

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

              {/* 우측 상단 하트 장식 (오버레이) */}
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

              {/* 카드 배경 */}
              <div className="relative z-10 flex-1 flex flex-col bg-white/80 backdrop-blur-md rounded-[20px] border border-rose-100 p-7 shadow-[0_8px_32px_rgba(0,0,0,0.03)]">

                {/* 헤드라인 타이틀: "문 너머의 사랑" */}
                <div className="text-left font-sentiment text-[36px] leading-[1.15] text-rose-500 tracking-[5.88px] font-bold mt-2 select-text">
                  <p>문 너머의</p>
                  <p>사랑</p>
                </div>

                {/* 얇은 가로선 */}
                <div className="bg-rose-300 h-px w-[31px] my-6 flex-none" />

                {/* 본문 서사: 손예원 작가 수필 (온점 하나도 누락 없이 100% 반영) */}
                <div className="text-left text-[14.5px] leading-[1.85] text-gray-700 space-y-5 tracking-wide font-readable-sans select-text break-keep">
                  <p className="text-gray-800 font-medium">사랑이란 늘 내 편의를 뒤로하고 내가 먼저 움직여야 하는 일이라 믿었다. 상대의 마음을 얻기 위해 다가가는 수고로움이 관계의 당연한 조건이라 생각했기 때문이다.</p>

                  <div className="h-1" />
                  <p>그래서 누군가를 소중히 여길수록 더 분주해졌고, 내가 더 많이 노력해야만 사랑이 온전히 전해질 수 있다고 확신했다.</p>

                  <div className="h-1" />
                  <p>하지만 어느 순간부터 이런 방식이 점차 버겁게 느껴졌다. 내가 보낸 마음이 상대에게 닿을지, 다시 내게 사랑으로 돌아올지 전혀 알 수 없었기 때문이다.</p>

                  <div className="h-1" />
                  <p className="font-bold text-rose-600">불안감에 휩싸인 채 매번 무모한 도전을 하듯 마음을 쏟아부었지만, 대답 없는 문 앞에서 노크를 반복하던 나는 조금씩 지쳐가고 있었다.</p>

                  <div className="py-2 text-rose-300 text-center flex justify-center gap-1 select-none font-bold">
                    <span>.</span><span>.</span><span>.</span>
                  </div>

                  <p>그러던 어느 저녁, 문득 노크 소리가 들려왔다. 내가 애타게 두드리던 문에서 들려온 소리인 줄 알았으나, <span className="font-bold text-rose-700">정작 소리가 들려온 곳은 내가 등 돌리고 서 있던 나의 문 앞이었다.</span></p>

                  <div className="h-1" />
                  <p>찰나의 실망이 지나간 자리에 낯선 울림이 남았다. 늘 누군가에게 닿기 위해 멀리 나가는 사람이었는데, 정작 내 문을 두드리는 소리가 이토록 가깝고 선명하다는 사실이 새삼스럽게 다가온 것이다.</p>

                  <div className="h-1" />
                  <p>그제야 돌아보게 되었다. 나는 왜 늘 누군가의 문을 두드리기 위해서만 애를 썼을까. 정작 내 문 뒤에서 들려오는 소리에는 왜 단 한 번도 귀를 기울이지 않았을까.</p>

                  {/* 인용/강조 구절 */}
                  <div className="pl-3.5 border-l-2 border-rose-300 text-[12.5px] text-gray-800 leading-relaxed bg-[#fffafa] p-4 rounded-3xl border border-rose-100">
                    내가 누군가에게 닿으려 온 힘을 쏟는 동안에도, 내 문 밖에는 하염없이 나를 기다리며 노크하는 존재가 있었음을.
                  </div>

                  <div className="py-2 text-rose-300 text-center flex justify-center gap-1 select-none font-bold">
                    <span>.</span><span>.</span><span>.</span>
                  </div>

                  <p>사랑은 내가 억지로 만들어내는 성과가 아니었다. 오히려 내가 보지 못했던 곳에서 이미 나를 향해 와 있던 깊은 마음들을 발견하는 일에 더 가까웠다.</p>

                  <div className="h-1" />
                  <p className="font-semibold text-rose-600">내가 노력해서 얻으려 했던 사랑보다, 아무런 조건 없이 내 문 앞에서 나를 기다려온 그 사랑이 비교할 수 없을 만큼 더 컸던 것이다.</p>

                  <div className="h-1" />
                  <p>이제는 억지로 누군가의 문을 두드리는 일을 멈추려 한다. 대신 고개를 돌려 내 마음의 문 밖에서 나를 부르고 있는 그 존재의 목소리에 집중해 보려 한다.</p>

                  <div className="h-1" />
                  <p>애쓰지 않아도 이미 도착해 있는 사랑을 확인하는 것만으로도, 마음은 이전과 비교할 수 없는 평안을 얻는다.</p>

                  {/* 대답 상자: 손예원 작가 수필 최종 구절 */}
                  <div className="my-6 border border-rose-150 bg-[#fff5f5] py-5 px-3.5 rounded-3xl font-sentiment text-[14.5px] leading-relaxed text-[#c93b3b] text-center shadow-sm">
                    <p className="font-bold text-[#b92c2c]">“나를 위해 문 밖에서 기다려온 그 마음을 알아채고,</p>
                    <p className="font-bold text-[#b92c2c]">이제는 내가 안에서 문을 열어줄 차례다.”</p>
                    <div className="h-2.5" />
                    <p className="font-bold text-rose-600">그것이 나를 가장 온전하게 만드는</p>
                    <p className="font-bold text-rose-600">진짜 사랑의 시작이다.</p>
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
                comments.map((comment) => (
                  <div key={comment.id} className="bg-rose-50/30 border border-rose-100/50 p-3 rounded-2xl flex flex-col gap-1 shadow-sm">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-xs text-rose-800">{comment.name}</span>
                      <span className="text-[10px] text-gray-400">{formatCommentDate(comment.createdAt)}</span>
                    </div>
                    <p className="text-gray-700 text-xs leading-relaxed break-all whitespace-pre-wrap">{comment.content}</p>
                  </div>
                ))
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
