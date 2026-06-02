import React from 'react';
import { Divide, Heart } from 'lucide-react';

export default function HeartKyminContent() {
  return (
                  <div className="text-left text-[14.5px] leading-[1.85] text-gray-700 space-y-5 tracking-normal font-readable-sans select-text break-keep">
                    <p className="text-black">익숙한 냄새 같은 기억이 있다. 어릴 때, 교회에서 먹던 따뜻한 잔치국수, 손에 쥐고 설레던 달란트, 괜히 오래 머물고 싶었던 그 시간들.</p>
                    
                    <div className="h-1" />
                    <p>그때는 이유를 몰랐고, <span className="font-bold">그저 자연스럽게 그 자리에 있었을 뿐이었다.</span></p>
                    
                    <div className="h-1" />
                    <p>시간이 지나고, 나는 그곳을 스쳐 지나가는 사람이 되었고 그 기억들도 지나간 장면쯤으로 남아 있다고 생각했다.</p>
                    
                    <div className="py-2 text-[rgba(250,92,92,0.25)] text-center flex justify-center gap-1 select-none font-bold">
                      <span>.</span><span>.</span><span>.</span>
                    </div>
                    
                    <p>그런데 어느 날, <span className="font-bold">익숙한 공간에서 잠깐 멈춰 서게 되었을 때</span> 문득 그때의 감각이 다시 떠올랐다.</p>
                    
                    <div className="h-1" />
                    <p>따뜻했던 공기, <span>누군가 곁에 있었던 것 같은 조용한 느낌.</span></p>
                    
                    <div className="h-1" />
                    <p>그 자리에, <span className="font-bold">여전히 같은 모습으로 아무 일도 없다는 듯 앉아 있는 존재.</span></p>
                    
                    <div className="h-1" />
                    <p>떠난 적이 없었던 것처럼, 처음부터 계속 그 자리에 있었던 것처럼.</p>
                    
                    {/* 마무리 문장은 박스 없이 여백과 얇은 선으로만 구분한다. */}
                    <div className="mt-7 pt-5 border-t border-[rgba(250,92,92,0.14)] text-[14.5px] leading-[1.85] text-[#4a3b3b] text-center">
                      <p className="font-semibold">“어릴 때 아무렇지 않게</p>
                      <p className="font-semibold">지나쳤던 그 마음이,</p>
                      <p className="font-semibold">지금의 나를 향해</p>
                      <div className="h-2.5" />
                      <p className="font-semibold">여전히 그 자리에서</p>
                      <p className="font-semibold">나를 기다리고 있었다.”</p>
                    </div>
                    
                    <div className="h-2" />
                    <p className="text-[14.5px] font-semibold text-[#4a3b3b] text-center leading-[1.85]">
                      늘 우리를 기다리시는<br />
                      그 사랑.
                    </p>
                  </div>
  );
}
