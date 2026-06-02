import React from 'react';
import { Divide, Heart } from 'lucide-react';

export default function HeartEunchaeContent() {
  return (
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
  );
}
