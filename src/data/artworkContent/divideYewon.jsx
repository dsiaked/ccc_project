import React from 'react';
import { Divide, Heart } from 'lucide-react';

export default function DivideYewonContent() {
  return (
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
  );
}
