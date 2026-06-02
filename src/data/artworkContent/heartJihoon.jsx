import React from 'react';
import { Divide, Heart } from 'lucide-react';

export default function HeartJihoonContent() {
  return (
                <div className="text-left text-[14.5px] leading-[1.85] text-gray-700 space-y-5 tracking-wide font-readable-sans select-text break-keep">
                  <p className="text-gray-800 font-medium">잔디 위에 놓인 유리병은 바람에 아주 조금씩 흔들리고 있었다. 그 안에는 하트 모양으로 접힌 종이들이 가득 담겨 있었다.</p>

                  <div className="h-1" />
                  <p>누군가는 그걸 사랑이라고 불렀고, 누군가는 그걸 위로라고 불렀다.</p>

                  <div className="h-1" />
                  <p>사실 그 종이들은 거창한 말이 아니었다.</p>
                  <p className="italic text-gray-800">“오늘도 잘 버텼어.”</p>
                  <p className="italic text-gray-800">“네가 있어서 다행이야.”</p>
                  <p className="italic text-gray-800">“조금 느려도 괜찮아.”</p>

                  <div className="h-1" />
                  <p>그저 누군가에게 건네고 싶었지만, 쉽게 말로 꺼내지 못했던 마음들이었다.</p>

                  <div className="py-2 text-rose-300 text-center flex justify-center gap-1 select-none font-bold">
                    <span>.</span><span>.</span><span>.</span>
                  </div>

                  <p>햇살이 내려앉을 때마다 유리병 속 하트들은 따뜻하게 빛났다. <span className="font-bold text-gray-900">마치 그 안에 담긴 말들이 이제는 괜찮다고, 괜찮아질 거라고 조용히 속삭이는 것처럼.</span></p>

                  <div className="h-1" />
                  <p>지나가던 사람들 중 누군가는 잠시 멈춰 서서 그 병을 바라봤다. 그리고 이유 없이 마음이 조금 가벼워졌다.</p>

                  <div className="h-1" />
                  <p>아마도 그건, 그 안의 말들이 특별해서가 아니라 <span className="font-semibold text-gray-900">누군가가 누군가를 위해 이만큼 마음을 접어 넣었다는 사실 때문일 것이다.</span></p>

                  {/* 인용/강조 구절 */}
                  <div className="pl-3.5 border-l-2 border-rose-300 text-[12.5px] text-gray-800 leading-relaxed bg-[#fffafa] p-4 rounded-3xl border border-rose-100">
                    사랑은 거창한 게 아니라 이렇게 작게 접어도 충분하고, 위로는 멀리 있는 게 아니라 이렇게 가까이 놓여 있어도 된다는 걸.
                  </div>

                  <div className="py-2 text-rose-300 text-center flex justify-center gap-1 select-none font-bold">
                    <span>.</span><span>.</span><span>.</span>
                  </div>

                  <p>잔디 위의 유리병은 오늘도 아무 말 없이 서 있지만, 그 안의 수많은 하트들은 계속해서 말하고 있다.</p>

                  {/* 대답 상자: 홍지훈 작가 수필 최종 구절 */}
                  <div className="my-6 border border-rose-150 bg-[#fff5f5] py-5 px-3.5 rounded-3xl font-sentiment text-[14.5px] leading-relaxed text-[#c93b3b] text-center shadow-sm">
                    <p className="font-bold text-[#b92c2c]">“당신도, 누군가에게는”</p>
                    <p className="font-bold text-[#b92c2c]">“이렇게 소중한 사람이라고.”</p>
                  </div>

                </div>
  );
}
