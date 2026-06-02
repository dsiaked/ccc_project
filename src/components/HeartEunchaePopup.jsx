import React, { useState } from 'react';
import { X, ArrowRight, ArrowLeft, Heart, Check, MessageSquare, Pencil, Trash2 } from 'lucide-react';
import useArtworkComments from '../hooks/useArtworkComments';

export default function HeartEunchaePopup({ onClose, language = 'ko' }) {
  const [step, setStep] = useState(1);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const uiText = language === 'en'
    ? {
        leaveComment: 'Leave a reflection',
        nextArtwork: 'View next artwork',
        loadingComments: 'Loading reflections...',
        firstComment: 'Be the first to leave a reflection.',
        noComments: 'No reflections have been written yet.',
        firstCommentHint: 'Fill this artwork with a warm first note.',
        edit: 'Edit',
        delete: 'Delete',
        cancel: 'Cancel',
        save: 'Save',
        namePlaceholder: 'Name or nickname',
        commentPlaceholder: 'Leave a warm reflection. (max 100 characters)',
      }
    : {
        leaveComment: '감상평 남기기',
        nextArtwork: '다음 작품 보러 가기',
        loadingComments: '감상평을 불러오는 중...',
        firstComment: '첫 감상평을 남겨보세요!',
        noComments: '아직 작성된 감상평이 없습니다.',
        firstCommentHint: '따뜻한 첫 마디로 작품을 채워주세요 ✨',
        edit: '수정',
        delete: '삭제',
        cancel: '취소',
        save: '저장',
        namePlaceholder: '작성자 이름 (닉네임)',
        commentPlaceholder: '따뜻한 감상평을 남겨주세요! (최대 100자)',
      };  const {
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
  } = useArtworkComments('heart_eunchae');

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

      {/* 팝업 모달 몸체 */}
      <div className="relative w-[360px] h-[780px] max-h-[92vh] rounded-[32px] overflow-hidden flex flex-col shadow-[0_25px_60px_rgba(0,0,0,0.18)] border border-gray-100 bg-white animate-in zoom-in-95 duration-300 touch-pan-y">

        {/* Step 1: 첫 번째 팝업창 (감성 인트로) */}
        {step === 1 && (
          <div className="relative flex-1 bg-gradient-to-b from-[#ffffff] via-[#fffbfb] to-[#fff0f0] text-gray-800 overflow-hidden select-none">

            {/* 기하학적 백그라운드 디자인 */}
            <div className="absolute inset-0 pointer-events-none z-[1] overflow-hidden">
              <div className="absolute w-[232px] h-[230px] rounded-[20px] left-[150px] top-[103px] opacity-[0.08]" style={{ backgroundImage: "linear-gradient(to bottom, #fa5c5c, #f8cfd0)" }} />
              <div className="absolute w-[143px] h-[142px] rounded-bl-[20px] rounded-br-[20px] rounded-tl-[20px] left-[219px] top-0 opacity-[0.06]" style={{ backgroundImage: "linear-gradient(to bottom, #fa5c5c, #ffedd5)" }} />
              <div className="absolute w-[73px] h-[254px] rounded-[20px] left-[242px] top-[281px] opacity-[0.05]" style={{ backgroundImage: "linear-gradient(to bottom, #fa5c5c, #f8cfd0)" }} />
            </div>

            {/* 하트 파티클 */}
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

            {/* 메인 텍스트 및 라벨 */}
            <div className="relative z-10 w-full h-full">
              <span className="absolute left-[29px] top-[31px] text-[15px] tracking-[1.92px] font-medium text-[#4a3b3b] font-readable-sans">
                SYMBOL : HEART
              </span>

              <div className="absolute left-[29px] top-[64px] w-[35px] h-[1.5px] bg-[#e2cece]" />

              <div className="absolute right-[25px] top-[58px] text-[10px] text-[#4a3b3b] tracking-[1.2px] text-right font-readable-sans">
                2026.05.26/06.02
              </div>

              <div className="absolute right-[25px] top-[71px] text-[10px] text-[#4a3b3b] tracking-[1.2px] text-right font-readable-sans">
                과기대 미술관
              </div>

              {/* 작품 명으로 감성 인트로 구성 */}
              <div className="absolute left-[29px] top-[110px] w-[310px] text-left">
                <h1 className="text-[36px] font-bold text-rose-500 tracking-wide font-sentiment mb-6 select-text">
                  〈Little Lamb〉
                </h1>
                <div className="text-[20px] leading-[1.6] text-[#4a3b3b] font-sentiment font-normal break-keep">
                  <p>작고 둥근 몸짓,</p>
                  <p>보호하고 아껴주고 싶은</p>
                  <p>연약함을 온전히 품어 안으시는</p>
                  <p className="font-bold text-rose-500">예수님의 다정한 시선 🐑</p>
                </div>
              </div>

              {/* 아티스트 정보 하단 배치 */}
              <div className="absolute left-[26px] top-[450px] w-[35px] h-[1.5px] bg-[#e2cece]" />

              <div className="absolute left-[26px] right-[25px] top-[465px] flex items-center justify-between">
                <span className="text-[15px] tracking-[1.92px] font-medium text-[#4a3b3b] font-readable-sans">
                  ARTIST. 이은채
                </span>
                <button
                  onClick={() => setShowCommentModal(true)}
                  className="relative flex items-center justify-center w-16 h-16 rounded-full bg-rose-50 border-2 border-rose-100 hover:bg-rose-100/50 text-[#fa5c5c] cursor-pointer transition-all active:scale-95 shadow-md animate-in fade-in"
                >
                  <MessageSquare className="w-8 h-8" />
                  <span className="absolute -top-1 -right-1 flex h-6 min-w-[24px] px-1.5 items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold shadow-sm border border-white">
                    {comments.length}
                  </span>
                </button>
              </div>

              <div className="absolute left-[25px] top-[502px] text-[10px] tracking-[1.2px] text-[#4a3b3b] leading-normal font-readable-sans">
                <p>서울과학기술대학교</p>
                <p className="mt-0.5">중앙동아리 CCC</p>
              </div>

              <button
                onClick={() => setStep(2)}
                className="absolute right-[25px] bottom-[46px] w-[140px] h-[47px] bg-gradient-to-r from-[#fa5c5c] to-[#ff7b7b] text-white rounded-[24px] flex items-center justify-between pl-6 pr-5 hover:opacity-90 transition-all active:scale-[0.96] shadow-[0_4px_15px_rgba(250,92,92,0.25)] cursor-pointer font-readable-sans"
              >
                <span className="text-[13px] tracking-[1.68px] font-bold">NEXT</span>
                <ArrowRight className="w-4 h-4 text-white" />
              </button>
            </div>

            <button
              onClick={onClose}
              className="absolute top-4 right-4 z-20 w-8 h-8 bg-gray-100/80 hover:bg-gray-200/80 text-gray-500 rounded-full flex items-center justify-center backdrop-blur-sm transition-colors border border-gray-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Step 2: 두 번째 팝업창 (작품 상세 설명 본문) */}
        {step === 2 && (
          <div className="relative flex-1 flex flex-col bg-gradient-to-b from-[#ffffff] via-[#fffbfb] to-[#ffebeb] text-gray-800 overflow-y-auto overflow-x-hidden popup-body-scroll select-none touch-pan-y">
            <div className="relative w-full flex flex-col p-6 pb-8 min-h-[960px]">

              <div className="absolute top-[5px] right-[-10px] w-64 h-60 opacity-40 pointer-events-none z-[2] mix-blend-normal">
                <Heart className="w-full h-full text-rose-200/40 fill-rose-100/15" />
              </div>

              {/* 상단 헤더 */}
              <div className="relative z-10 flex justify-between items-center pb-6 font-readable-sans">
                <span className="text-[10px] tracking-[1.2px] font-bold text-rose-500">
                  SYMBOL : HEART
                </span>
                <div className="w-[100px] h-[0.5px] bg-rose-200" />
              </div>

              {/* 작품 설명 카드 몸체 */}
              <div className="relative z-10 flex-1 flex flex-col bg-white/90 backdrop-blur-md rounded-[24px] border border-rose-100 p-6 sm:p-7 shadow-[0_8px_32px_rgba(0,0,0,0.03)]">
                
                {/* 작품 제목 */}
                <div className="text-left font-sentiment text-[32px] leading-[1.2] text-rose-500 tracking-[1.5px] font-bold mt-2 select-text">
                  〈Little Lamb〉
                </div>
                
                <div className="bg-rose-300 h-px w-[31px] my-5 flex-none" />

                {/* 사용자가 작성 요청한 3문단 작품 설명 본문 - font-sans와 leading-relaxed 적용으로 가독성 극대화 */}
                <div className="text-left text-[14px] sm:text-[14.5px] leading-[1.9] text-gray-700 space-y-6 tracking-wide font-sans select-text break-keep">
                  
                  {/* 1문단 */}
                  <p className="text-gray-600">
                    <span className="font-bold text-gray-900 text-base">〈Little Lamb〉</span>은 인간이 귀여움을 느끼는 방식에서 출발한 작업이다. 사람들은 자신과 닮은 존재에게 감정을 이입하고 의인화하며 귀여움을 느낀다. 작은 몸집과 둥근 형태 짧은 팔다리처럼 본능적으로 귀엽다고 느끼는 요소들은 대상을 보호하고 싶고 아껴주고 싶은 감정을 자연스럽게 불러일으킨다. 나는 이러한 감정 안에 <span className="font-semibold text-rose-500">예수님이 인간을 바라보시는 사랑과 닮은 부분</span>이 있다고 느꼈다. 연약한 존재를 먼저 품고 아끼시는 마음 말이다.
                  </p>

                  {/* 2문단 */}
                  <p className="text-gray-600">
                    작품은 양의 형상을 통해 이러한 귀여움의 요소들을 조형적으로 드러낸다. 둥글고 작은 몸 비율과 모여 있는 발의 자세 그리고 단순화된 얼굴은 연약하고 순한 인상을 강조한다. 몸통은 크기가 다른 알루미늄 피스들을 반복적으로 용접해 <span className="font-medium text-gray-800">양털처럼 부드러운 덩어리감</span>을 만들었고 얼굴과 발은 적동을 망치로 직접 성형해 손의 흔적과 유기적인 감각이 느껴지도록 했다. 차갑고 단단한 금속 재료를 사용했지만 전체적으로는 부드럽고 사랑스러운 인상이 느껴지도록 구성했다.
                  </p>

                  {/* 3문단 - 더욱 고급스러운 가스모피즘 핑크 베일 박스로 리팩토링 */}
                  <div className="bg-rose-50/30 border border-rose-100/50 p-5 rounded-[24px] shadow-[0_4px_15px_rgba(250,92,92,0.02)] relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-16 h-16 opacity-5 pointer-events-none">
                      <Heart className="w-full h-full text-rose-500 fill-rose-500" />
                    </div>
                    <span className="inline-block text-xl mb-2 select-none">🐑</span>
                    <p className="text-gray-700 leading-[1.85]">
                      성경에서 양은 예수님과 그를 따르는 사람들을 상징한다. 관람자가 이 작은 양을 바라보며 자연스럽게 느끼는 애정과 보호하고 싶은 마음을 통해 <span className="font-bold text-rose-600">연약한 존재를 먼저 품고 아끼시는 사랑</span>을 떠올리기를 바랐다. 이 작업은 귀여운 대상을 마주할 때 판단보다 애정이 먼저 일어나는 감각을 통해 존재 자체를 사랑으로 바라보는 시선을 이야기한다.
                    </p>
                  </div>

                </div>
              </div>

              {/* 하단 네비게이션 */}
              <div className="relative z-10 flex flex-wrap justify-center gap-3 mt-8 flex-none font-readable-sans">
                <button
                  onClick={() => setStep(1)}
                  className="w-[112px] h-[52px] bg-white border border-gray-200 text-gray-700 rounded-[26px] flex items-center justify-center gap-1.5 hover:bg-gray-50 transition-all active:scale-[0.96] cursor-pointer shadow-sm font-bold"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-[12px] tracking-[1.2px]">BACK</span>
                </button>

                <button
                  onClick={() => setShowCommentModal(true)}
                  className="flex-1 min-w-[176px] h-[52px] bg-gradient-to-r from-[#fa5c5c] to-[#ff7b7b] text-white rounded-[26px] flex items-center justify-center gap-2 hover:opacity-90 transition-all active:scale-[0.96] shadow-[0_8px_18px_rgba(250,92,92,0.26)] cursor-pointer font-bold"
                >
                  <span className="text-[13px] tracking-[0.2px]">{uiText.leaveComment}</span>
                  <Check className="w-[18px] h-[18px]" />
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full h-[46px] bg-white border border-gray-200 text-gray-700 rounded-[23px] flex items-center justify-center hover:bg-gray-50 transition-all duration-200 active:scale-[0.98] cursor-pointer shadow-sm font-bold"
                >
                  <span className="text-[13px] tracking-[0.4px]">{uiText.nextArtwork}</span>
                </button>
              </div>

            </div>

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
            <div className="flex justify-between items-center pb-3 border-b border-gray-100">
              <div className="flex items-center gap-1.5">
                <span className="text-lg font-bold text-rose-500 font-sentiment">{uiText.leaveComment} 💬</span>
                <span className="bg-rose-100 text-rose-600 text-xs px-2 py-0.5 rounded-full font-bold">{comments.length}</span>
              </div>
              <button
                onClick={() => setShowCommentModal(false)}
                className="w-7 h-7 bg-gray-50 border border-gray-100 hover:bg-gray-100 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto popup-body-scroll my-3 pr-1 space-y-3 select-text">
              {loadingComments ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 text-xs gap-2 py-10">
                  <div className="w-6 h-6 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
                  <span>{uiText.loadingComments}</span>
                </div>
              ) : comments.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 text-xs py-10 text-center leading-relaxed">
                  <span className="text-3xl mb-2">🎈</span>
                  <span className="font-bold text-gray-600 text-sm">{uiText.firstComment}</span>
                  <span className="opacity-70 mt-1">{uiText.noComments}</span>
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
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteComment(comment.id)}
                                className="w-6 h-6 rounded-full bg-white/80 border border-gray-100 text-gray-400 hover:text-red-500 hover:border-red-100 flex items-center justify-center transition-colors cursor-pointer"
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
                            >{uiText.cancel}</button>
                            <button
                              type="button"
                              onClick={() => handleUpdateComment(comment.id)}
                              disabled={!editContent.trim()}
                              className="h-7 px-3 rounded-full bg-gray-800 disabled:bg-gray-300 text-[11px] font-bold text-white cursor-pointer"
                            >{uiText.save}</button>
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

            <form onSubmit={handleAddComment} className="flex flex-col gap-2 border-t border-gray-100 pt-3 mt-auto">
              <input
                type="text"
                placeholder={uiText.namePlaceholder}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={10}
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400 font-readable-sans bg-gray-50/50 text-gray-800"
                required
              />
              <div className="relative">
                <textarea
                  placeholder={uiText.commentPlaceholder}
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




