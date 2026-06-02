import React from 'react';
import { Divide, Heart } from 'lucide-react';

export default function DivideKyeomjunContent() {
  return (
                <div className="text-left text-[14.5px] leading-[1.85] text-gray-700 space-y-5 tracking-wide font-readable-sans select-text break-keep">

                  <p className="text-gray-800 font-semibold leading-relaxed">
                    욕심은 불타는 본능에 날뛰는 시정마.
                  </p>
                  <p className="text-gray-700 pl-2 border-l border-orange-200">
                    자유라는 명목 아래서 이 시정마는 또 다른 감옥을 세워요.<br />
                    감옥 안에서 ‘히히’ 웃다가 울어요.
                  </p>

                  <div className="h-0.5" />
                  <p className="text-gray-800 font-semibold leading-relaxed">
                    미움은 길거리에 방황하는 비둘기.
                  </p>
                  <p className="text-gray-700 pl-2 border-l border-orange-200">
                    자신의 초라함을 미워하고, 그런 비둘기를 피하는 이들을 미워하여 저편으로 도망가요. 결국 혼자 서글피 ‘구구’ 울어요.
                  </p>

                  <div className="h-0.5" />
                  <p className="text-gray-800 font-semibold leading-relaxed">
                    두려움은 우거진 숲속에 숨어있는 검은 표범.
                  </p>
                  <p className="text-gray-700 pl-2 border-l border-orange-200">
                    검은 표범은 가만히 있고 지구에서의 인생은 그 표범의 거대한 입속으로 전진해요. 하지만 움직이지 않는 검은 표범을 바라보면서 ‘벌벌’ 떨어요.
                  </p>

                  <div className="h-0.5" />
                  <p className="font-medium text-gray-900">
                    ‘벌벌’ 떠는 입술 사이로 눈물이 짭조름하게 스며옵니다.
                  </p>

                  {/* 대답 상자: 서겸준 작가 수필 세가지 은유 요약 */}
                  <div className="my-6 border border-orange-150 bg-[#fffaf0] py-5 px-3.5 rounded-3xl font-sentiment text-[14.5px] leading-relaxed text-[#c2410c] text-center shadow-sm">
                    <p className="font-bold text-[#b43e0e]">“욕심은 날뛰는 시정마,</p>
                    <p className="font-bold text-[#b43e0e]">미움은 방황하는 비둘기,</p>
                    <p className="font-bold text-[#b43e0e]">두려움은 숨어있는 검은 표범.”</p>
                  </div>

                </div>
  );
}
