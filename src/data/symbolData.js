import { Heart, Cross, Divide, Sparkles } from 'lucide-react';

export const symbolData = {
  heart: {
    title: '하트',
    Icon: Heart,
    iconClass: 'w-12 h-12 text-pink-500',

    map: {
      undiscovered: {
        title: '숨겨진 하트',
        desc: '아직 발견하지 못한 하트 심볼이에요.',
        hint: '따뜻한 색이 빛나는 곳을 찾아보세요.',
      },
      discovered: {
        title: '발견된 하트 💖',
        desc: '사랑의 심볼을 발견했어요.',
        message: '당신의 따뜻한 마음이 세상을 더 아름답게 만듭니다.',
      },
    },

    qr: {
      title: 'QR하트',
      desc: '사랑과 정열을 상징하는 하트 심볼입니다.',
      meaning: '하트는 사랑과 열정을 상징하며 인간의 순수한 감정을 나타냅니다.',
      location: '전시회 좌측 영역에 위치한 하트 심볼입니다.',
      message: '사랑과 열정을 잃지 마세요.',
    },
  },

  cross: {
    title: '십자가',
    Icon: Cross,
    iconClass: 'w-12 h-12 text-gray-700',

    map: {
      undiscovered: {
        title: '숨겨진 십자가',
        desc: '아직 발견하지 못한 십자가 심볼이에요.',
        hint: '높은 곳, 빛이 드는 방향을 주목하세요.',
      },
      discovered: {
        title: '발견된 십자가 ✨',
        desc: '빛이 드는 곳에서 십자가를 발견했어요.',
        message: '희망을 잃지 않는 용기가 새로운 길을 열어줍니다.',
      },
    },

    qr: {
      title: 'QR십자가',
      desc: '믿음과 희망을 나타내는 십자가 심볼입니다.',
      meaning: '십자가는 어려움 속에서도 포기하지 않는 의지를 상징합니다.',
      location: '전시회 우측 상단에 자리한 십자가 심볼입니다.',
      message: '어둠 속에서도 빛을 찾는 용기를 잃지 마세요.',
    },
  },

  divide: {
    title: '나누기',
    Icon: Divide,
    iconClass: 'w-12 h-12 text-blue-500',

    map: {
      undiscovered: {
        title: '숨겨진 나누기',
        desc: '아직 발견하지 못한 나누기 심볼이에요.',
        hint: '차분하고 시원한 분위기의 공간을 찾아보세요.',
      },
      discovered: {
        title: '발견된 나누기 💙',
        desc: '나눔의 심볼을 발견했어요.',
        message: '나눔은 줄어드는 것이 아니라 더 큰 행복으로 돌아옵니다.',
      },
    },

    qr: {
      title: 'QR나누기',
      desc: '나눔과 배려를 의미하는 나누기 심볼입니다.',
      meaning: '나누기는 함께 성장하는 공동체의 가치를 의미합니다.',
      location: '전시회 좌측 하단에 배치된 나누기 심볼입니다.',
      message: '함께 나눌 때 더 큰 의미가 만들어집니다.',
    },
  },

  question: {
    title: '특별 심볼',
    Icon: Sparkles,
    iconClass: 'w-12 h-12 text-yellow-500',

    map: {
      undiscovered: {
        title: '숨겨진 특별 심볼',
        desc: '아직 발견하지 못한 특별 심볼이에요.',
        hint: '가장 특별한 곳에 숨겨져 있습니다.',
      },
      discovered: {
        title: '발견된 특별 심볼 ⭐',
        desc: '마지막 특별 심볼을 발견했어요.',
        message: '질문하는 사람이 진짜 답을 찾아갑니다.',
      },
    },

    qr: {
      title: 'QR특별 심볼',
      desc: '호기심과 탐구를 상징하는 특별 심볼입니다.',
      meaning: '끝없는 질문과 배움에 대한 열정을 나타냅니다.',
      location: '전시회 우측 하단 특별 구역에 위치한 심볼입니다.',
      message: '계속해서 질문하고 탐구하세요.',
    },
  },
};