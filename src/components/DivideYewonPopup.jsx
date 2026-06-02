import React, { useState } from 'react';
import { X, ArrowRight, ArrowLeft, Divide, Check, MessageSquare, Pencil, Trash2 } from 'lucide-react';
import useArtworkComments from '../hooks/useArtworkComments';

export default function DivideYewonPopup({ onClose }) {
  const [step, setStep] = useState(1);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const {
    comments,
    loadingComments,
    newName,
    setNewName,
    newContent,
    setNewContent,
    editingCommentId,
    editContent,
    setEditContent,
    handleAddComment,
    startEditComment,
    cancelEditComment,
    handleUpdateComment,
    handleDeleteComment,
    isOwnComment,
    formatCommentDate,
  } = useArtworkComments('divide_yewon');

  // 몽환적인 흩날리는 주황색 나누기 입자 데이터 정의
  const floatingParticles = [
    { id: 1, size: 22, left: '10%', delay: '0s', duration: '8s', opacity: 0.15 },
    { id: 2, size: 34, left: '75%', delay: '1.2s', duration: '10s', opacity: 0.12 },
    { id: 3, size: 16, left: '45%', delay: '3.5s', duration: '7s', opacity: 0.18 },
    { id: 4, size: 26, left: '25%', delay: '5.2s', duration: '9s', opacity: 0.14 },
    { id: 5, size: 18, left: '85%', delay: '2.1s', duration: '6s', opacity: 0.16 },
    { id: 6, size: 30, left: '60%', delay: '4.3s', duration: '11s', opacity: 0.13 },
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
          background: rgba(247, 136, 62, 0.2);
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.5);
        }
        .popup-body-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(247, 136, 62, 0.4);
        }
      `}</style>

      {/* 팝업 모달 몸체: Figma iPhone 17-13의 가로-세로 뷰포트 비율을 1:1 복원하는 360x780px 고정형 카드 */}
      <div className="relative w-[360px] h-[780px] max-h-[92vh] rounded-[32px] overflow-hidden flex flex-col shadow-[0_25px_60px_rgba(0,0,0,0.18)] border border-gray-100 bg-white animate-in zoom-in-95 duration-300 touch-pan-y">
        
        {/* Step 1: 피그마 iPhone 17-13 1:1 완벽 절대 좌표 복원 */}
        {step === 1 && (
          <div className="relative flex-1 bg-gradient-to-b from-[#ffffff] via-[#fffaf5] to-[#fff3e6] text-gray-800 overflow-hidden select-none">
            
            {/* 1. 피그마 기하학적 도형 배경들 0.9배율 완벽 재현 (주황/코랄 오리지널 테마) */}
            <div className="absolute inset-0 pointer-events-none z-[1] overflow-hidden">
              {/* Radial gradient background box 1 */}
              <div 
                className="absolute w-[232px] h-[230px] rounded-[20px] left-[150px] top-[103px] opacity-[0.08]" 
                style={{ backgroundImage: "linear-gradient(to bottom, #f7883e, #fde8d7)" }}
              />
              {/* Radial gradient background box 2 */}
              <div 
                className="absolute w-[143px] h-[142px] rounded-bl-[20px] rounded-br-[20px] rounded-tl-[20px] left-[219px] top-0 opacity-[0.06]" 
                style={{ backgroundImage: "linear-gradient(to bottom, #f7883e, #ffedd5)" }}
              />
              {/* Radial gradient background box 3 */}
              <div 
                className="absolute w-[73px] h-[254px] rounded-[20px] left-[242px] top-[281px] opacity-[0.05]" 
                style={{ backgroundImage: "linear-gradient(to bottom, #f7883e, #fde8d7)" }}
              />
              {/* Radial gradient background box 4 */}
              <div 
                className="absolute w-[82px] h-[230px] rounded-[20px] left-[291px] top-[176px] opacity-[0.08]" 
                style={{ backgroundImage: "linear-gradient(to bottom, #f7883e, #fde8d7)" }}
              />
              {/* Radial gradient background box 5 */}
              <div 
                className="absolute w-[137px] h-[230px] rounded-[20px] left-[276px] top-[448px] opacity-[0.07]" 
                style={{ backgroundImage: "linear-gradient(to bottom, #f7883e, #ffffff)" }}
              />
              {/* Radial gradient background box 6 */}
              <div 
                className="absolute w-[141px] h-[269px] rounded-[20px] left-[208px] top-[574px] opacity-[0.08]" 
                style={{ backgroundImage: "linear-gradient(to bottom, #f7883e, #fde8d7)" }}
              />
              {/* Radial gradient background box 7 */}
              <div 
                className="absolute w-[68px] h-[269px] rounded-[20px] left-[15px] top-[631px] opacity-[0.06]" 
                style={{ backgroundImage: "linear-gradient(to bottom, #f7883e, #fde8d7)" }}
              />
              {/* Radial gradient background box 8 */}
              <div 
                className="absolute w-[147px] h-[49px] rounded-[20px] left-[130px] top-[365px] opacity-[0.08]" 
                style={{ backgroundImage: "linear-gradient(to bottom, #f7883e, #fde8d7)" }}
              />
            </div>

            {/* 흩날리는 파스텔 오렌지 나누기 파티클 */}
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
                  <Divide className="text-orange-400/20 fill-none" style={{ width: part.size, height: part.size }} />
                </div>
              ))}
            </div>

            {/* 2. 피그마 자산 이미지들 배치 (나누기 기호 실루엣으로 일치) */}
            <div className="absolute inset-0 pointer-events-none z-[3]">
              {/* 자산 3 3 (나누기 실루엣 1) */}
              <Divide className="absolute left-[180px] top-[70px] w-[50px] h-[48px] text-orange-300/20" />
              {/* 자산 3 2 (나누기 실루엣 2) */}
              <Divide className="absolute left-[256px] top-[155px] w-[76px] h-[71px] text-orange-300/15" />
              {/* 자산 3 4 (나누기 실루엣 3) */}
              <Divide className="absolute left-[10px] bottom-[20px] w-[50px] h-[48px] text-orange-300/20" />
              {/* 자산 3 1 (우측 대형 나누기 실루엣) */}
              <div className="absolute left-[132px] top-[448px] w-[225px] h-[212px] rotate-[10deg] opacity-20">
                <Divide className="w-full h-full text-orange-300/25" />
              </div>
            </div>

            {/* 3. 글자 배치 (피그마 1:1 절대좌표 이식 및 손예원 작가 사양 적용) */}
            <div className="relative z-10 w-full h-full">
              {/* SYMBOL2 : SEPARATION */}
              <span className="absolute left-[29px] top-[31px] text-[15px] tracking-[1.92px] font-medium text-[#4a3b3b] font-readable-sans">
                SYMBOL2 : SEPARATION
              </span>
              
              {/* Rectangle 361 (상단 얇은 가로선) */}
              <div className="absolute left-[29px] top-[64px] w-[35px] h-[1.5px] bg-[#edd5c8]" />

              {/* 2026.05.26/06.02 */}
              <div className="absolute right-[25px] top-[58px] text-[10px] text-[#4a3b3b] tracking-[1.2px] text-right font-readable-sans">
                2026.05.26/06.02
              </div>
              
              {/* 과기대 붕어방 */}
              <div className="absolute right-[25px] top-[71px] text-[10px] text-[#4a3b3b] tracking-[1.2px] text-right font-readable-sans">
                과기대 붕어방
              </div>

              {/* 대형 감성 문구: 손예원 작가 (iPhone 17 - 13) 피그마 배치 및 색감/두께 단일화 */}
              <div className="absolute left-[29px] top-[91px] w-[310px] text-left">
                <div className="text-[34px] leading-[1.22] text-[#4a3b3b] tracking-[1.5px] font-sentiment font-normal">
                  <p>나를</p>
                  <p>지키려 세운</p>
                  <p>가시 너머로</p>
                  <div className="h-[18px]" /> {/* 피그마 오리지널 빈 줄 간격 정밀 복원 */}
                  <p>다가온</p>
                  <p>사랑이라는 꽃</p>
                </div>
              </div>

              {/* 하단 작가 소개 영역 */}
              {/* Rectangle 358 (작가 위 가로선) */}
              <div className="absolute left-[26px] top-[475px] w-[35px] h-[1.5px] bg-[#edd5c8]" />
              
              {/* ARTIST. 손예원 및 댓글 이모지 버튼 */}
              <div className="absolute left-[26px] right-[25px] top-[492px] flex items-center justify-between">
                <span className="text-[15px] tracking-[1.92px] font-medium text-[#4a3b3b] font-readable-sans">
                  ARTIST. 손예원
                </span>
                <button
                  onClick={() => setShowCommentModal(true)}
                  className="relative flex items-center justify-center w-16 h-16 rounded-full bg-orange-50 border-2 border-orange-100 hover:bg-orange-100/50 text-[#f97316] cursor-pointer transition-all active:scale-95 shadow-md animate-in fade-in duration-300"
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

              {/* NEXT 버튼: 우측 하단 둥근 캡슐 */}
              <button
                onClick={() => setStep(2)}
                className="absolute right-[25px] bottom-[35px] w-[140px] h-[47px] bg-gradient-to-r from-[#f7883e] to-[#ff9069] text-white rounded-[24px] flex items-center justify-between pl-6 pr-5 hover:opacity-90 transition-all duration-200 active:scale-[0.96] shadow-[0_4px_15px_rgba(247,136,62,0.25)] cursor-pointer font-readable-sans"
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

        {/* Step 2: 피그마 iPhone 17-15 기반 디테일 완벽 복원 (나누기 손예원 작가 수필 서사 적용) */}
        {step === 2 && (
          <div className="relative flex-1 flex flex-col bg-gradient-to-b from-[#ffffff] via-[#fffbf7] to-[#fff4eb] text-gray-800 overflow-y-auto overflow-x-hidden popup-body-scroll select-none touch-pan-y">
            
            {/* 전체 높이를 확보하여 피그마의 비율을 보존 */}
            <div className="relative w-full flex flex-col p-6 pb-8 min-h-[980px]">
              
              {/* 은은하게 그라데이션으로 퍼지는 주황빛 광원 오버레이 */}
              <div 
                className="absolute inset-0 pointer-events-none opacity-[0.02] mix-blend-multiply" 
                style={{ backgroundImage: "linear-gradient(206.325deg, rgba(247, 136, 62, 0) 14.004%, rgb(207, 65, 9) 80.929%)" }} 
              />
              <div 
                className="absolute inset-0 pointer-events-none opacity-40 mix-blend-overlay" 
                style={{ backgroundImage: "linear-gradient(147.794deg, rgba(247, 136, 62, 0) 34.559%, rgb(254, 229, 180) 100.79%)" }} 
              />

              {/* 흩날리는 오렌지빛 나누기 파티클 */}
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
                    <Divide className="text-orange-400/15 fill-none" style={{ width: part.size, height: part.size }} />
                  </div>
                ))}
              </div>

              {/* 우측 상단 나누기 장식 (오버레이) */}
              <div className="absolute top-[5px] right-[-10px] w-64 h-60 opacity-30 pointer-events-none z-[2] animate-pulse">
                <Divide className="w-full h-full text-orange-200/30" />
              </div>

              {/* 상단 띠지 */}
              <div className="relative z-10 flex justify-between items-center pb-6 font-readable-sans">
                <span className="text-[10px] tracking-[1.2px] font-bold text-orange-500">
                  SYMBOL2 : SEPARATION
                </span>
                <div className="w-[100px] h-[0.5px] bg-orange-200" />
              </div>

              {/* 카드 배경 */}
              <div className="relative z-10 flex-1 flex flex-col bg-white/80 backdrop-blur-md rounded-[20px] border border-orange-100 p-7 shadow-[0_8px_32px_rgba(0,0,0,0.03)]">
                
                {/* 헤드라인 타이틀: "가시" */}
                <div className="text-left font-sentiment text-[36px] leading-[1.15] text-[#cf4109] tracking-[5.88px] font-bold mt-2 select-text">
                  <p>가시</p>
                </div>

                {/* 얇은 가로선 */}
                <div className="bg-orange-300 h-px w-[31px] my-6 flex-none" />

                {/* 본문 서사: 손예원 작가 수필 (온점 하나도 누락 없이 100% 반영) */}
                <div className="text-left text-[14.5px] leading-[1.85] text-gray-700 space-y-5 tracking-wide font-readable-sans select-text break-keep">
                  <p className="text-gray-800 font-medium">당신은 어떤 하루를 살아가고 있나요.</p>
                  
                  <div className="h-1" />
                  <p className="text-gray-800">
                    내게 주어진 일을 잘 해내고, 사람들과 웃고 지내며<br />
                    나름 괜찮은 날들이 이어지는 것 같습니다.<br />
                    그러나 채워지지 않는 공허함은<br />
                    어디서부터 오는 걸까요.
                  </p>
                  
                  <div className="h-1" />
                  <p className="font-bold text-gray-900">
                    어느 순간부터 세상과 나 가운데<br />
                    보이지 않는 선이 존재합니다.<br />
                    그 선 안에서는 마음을 지킬 수 있습니다.<br />
                    소외와 외면으로부터 자유할 수 있습니다.<br />
                    그 선은 점점 단단해져 어느새 나를 둘러싼<br />
                    가시가 되었습니다.
                  </p>
                  
                  <div className="h-1" />
                  <p className="text-gray-800">
                    우리를 지켜주던 가시는<br />
                    어느새 나 자신까지 막아섭니다.<br />
                    가시는 보호막인 동시에 벽이 되어<br />
                    세상과 타인, 나를 갈라놓았습니다.<br />
                    그때 마음까지도 갈라집니다.
                  </p>

                  <div className="py-2 text-orange-300 text-center flex justify-center gap-1 select-none font-bold">
                    <span>.</span><span>.</span><span>.</span>
                  </div>
                  
                  <p className="text-gray-800">
                    아무리 삶을 채워 넣으려 해도<br />
                    그 틈 사이로 모든 기쁨이 새어나갑니다.<br />
                    어느 순간 무자비한 그 틈 사이로<br />
                    작은 무언가 들어옵니다.<br />
                    꽃입니다.
                  </p>
                  
                  <div className="h-1" />
                  <p className="text-gray-800">
                    꽃은 가시를 밀어내지도, 피하지도 않습니다.<br />
                    가시 속에서 조용히 우리를 기다립니다.<br />
                    이제야 조금 알게 된 걸까요?
                  </p>
                  
                  <div className="h-1" />
                  <p className="text-gray-800">
                    이 공허는 채워 넣음이 아닌<br />
                    내 텅 빈 마음을 잠잠히 바라봄으로,<br />
                    가시 속에서도 누군가 함께함을<br />
                    인식할 때 비로소 채워짐을.
                  </p>
                  
                  {/* 대답 상자: 손예원 작가 수필 최종 구절 */}
                  <div className="my-6 border border-orange-150 bg-[#fffaf0] py-5 px-3.5 rounded-3xl font-sentiment text-[14.5px] leading-relaxed text-[#c2410c] text-center shadow-sm">
                    <p className="font-bold text-[#b43e0e]">우리의 꽃은 사라지지 않습니다.</p>
                    <p className="font-bold text-[#b43e0e]">돋아난 가시로 인해 나누어진 모든 것을</p>
                    <p className="font-bold text-[#b43e0e]">‘그럼에도 불구하고’ 다시 이어내는 사랑입니다.</p>
                  </div>
                  
                </div>
              </div>

              {/* 하단 제어 버튼: 112px X 52px 둥근 캡슐 */}
              <div className="relative z-10 flex flex-wrap justify-center gap-3 mt-8 flex-none font-readable-sans">
                {/* BACK 버튼 */}
                <button
                  onClick={() => setStep(1)}
                  className="w-[96px] h-[52px] bg-white border border-gray-200 text-gray-600 rounded-[26px] flex items-center justify-center gap-1.5 hover:bg-gray-50 transition-all duration-200 active:scale-[0.96] cursor-pointer shadow-sm font-bold"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-[12px] tracking-[1.2px]">BACK</span>
                </button>
                
                {/* NEXT (확인 완료) 버튼 */}
                <button
                  onClick={() => setShowCommentModal(true)}
                  className="flex-1 min-w-[176px] h-[52px] bg-gradient-to-r from-[#f7883e] to-[#ff9069] text-white rounded-[26px] flex items-center justify-center gap-2 hover:opacity-90 transition-all duration-200 active:scale-[0.96] shadow-[0_8px_18px_rgba(247,136,62,0.26)] cursor-pointer font-bold"
                >
                  <span className="text-[13px] tracking-[0.2px]">감상평 남기기</span>
                  <Check className="w-[18px] h-[18px]" />
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full h-[46px] bg-white border border-gray-200 text-gray-700 rounded-[23px] flex items-center justify-center hover:bg-gray-50 transition-all duration-200 active:scale-[0.98] cursor-pointer shadow-sm font-bold"
                >
                  <span className="text-[13px] tracking-[0.4px]">다음 작품 보러 가기</span>
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
          <div className="relative w-[310px] h-[520px] rounded-[24px] bg-white border border-orange-100 flex flex-col p-5 shadow-2xl animate-in zoom-in-95 duration-200">
            {/* 헤더 */}
            <div className="flex justify-between items-center pb-3 border-b border-gray-100">
              <div className="flex items-center gap-1.5">
                <span className="text-lg font-bold text-orange-500 font-sentiment">감상평 남기기 💬</span>
                <span className="bg-orange-100 text-orange-600 text-xs px-2 py-0.5 rounded-full font-bold">{comments.length}</span>
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
                  <div className="w-6 h-6 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
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
                    <div key={comment.id} className="bg-orange-50/30 border border-orange-100/50 p-3 rounded-2xl flex flex-col gap-2 shadow-sm">
                      <div className="flex justify-between items-center gap-2">
                        <span className="font-bold text-xs text-orange-800 truncate">{comment.name}</span>
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
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-orange-400 font-readable-sans bg-gray-50/50 text-gray-800"
                required
              />
              <div className="relative">
                <textarea
                  placeholder="따뜻한 감상평을 남겨주세요! (최대 100자)"
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  maxLength={100}
                  rows={2}
                  className="w-full pl-3 pr-10 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-orange-400 font-readable-sans resize-none bg-gray-50/50 text-gray-800 leading-normal"
                  required
                />
                <button
                  type="submit"
                  disabled={!newName.trim() || !newContent.trim()}
                  className="absolute right-2 bottom-3 p-1.5 bg-[#f97316] disabled:bg-gray-300 text-white rounded-lg flex items-center justify-center transition-all duration-200 active:scale-95 shadow-sm cursor-pointer"
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

