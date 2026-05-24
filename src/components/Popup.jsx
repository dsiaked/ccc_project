import React, { useState } from 'react';
import MapPopup from './MapPopup';
import QrPopup from './QrPopup';
import MultiSelectorPopup from './MultiSelectorPopup';
import EunhyePopup from './EunhyePopup';
import KyminPopup from './KyminPopup';
import YewonPopup from './YewonPopup';
import JihoonPopup from './JihoonPopup';
import DivideYewonPopup from './DivideYewonPopup';
import DivideKyeomjunPopup from './DivideKyeomjunPopup';
import CrossKyeomjunPopup from './CrossKyeomjunPopup';
import CrossJihoonPopup from './CrossJihoonPopup';
import QuestionGuidePopup from './QuestionGuidePopup';

export default function Popup({ id, type, symbols, discovered, onClose }) {
  const [selectedArtist, setSelectedArtist] = useState(null);

  // 아티스트 상세 팝업이 덮어씌워진 상태 (뒤로가기 시 다시 멀티 리스트로 회귀)
  if (selectedArtist) {
    if (selectedArtist === 'heart_eunhye') {
      return <EunhyePopup onClose={() => setSelectedArtist(null)} />;
    }
    if (selectedArtist === 'heart_kymin') {
      return <KyminPopup onClose={() => setSelectedArtist(null)} />;
    }
    if (selectedArtist === 'heart_yewon') {
      return <YewonPopup onClose={() => setSelectedArtist(null)} />;
    }
    if (selectedArtist === 'heart_jihoon') {
      return <JihoonPopup onClose={() => setSelectedArtist(null)} />;
    }
    if (selectedArtist === 'divide_yewon') {
      return <DivideYewonPopup onClose={() => setSelectedArtist(null)} />;
    }
    if (selectedArtist === 'divide_kyeomjun') {
      return <DivideKyeomjunPopup onClose={() => setSelectedArtist(null)} />;
    }
    if (selectedArtist === 'cross') {
      return <CrossKyeomjunPopup onClose={() => setSelectedArtist(null)} />;
    }
    if (selectedArtist === 'cross_jihoon') {
      return <CrossJihoonPopup onClose={() => setSelectedArtist(null)} />;
    }
    return <QrPopup id={selectedArtist} onClose={() => setSelectedArtist(null)} />;
  }

  if (type === 'map') {
    return (
      <MapPopup
        id={id}
        discovered={discovered}
        onClose={onClose}
      />
    );
  }

  if (type === 'qr') {
    if (id === 'heart_eunhye') {
      return <EunhyePopup onClose={onClose} />;
    }
    if (id === 'heart_kymin') {
      return <KyminPopup onClose={onClose} />;
    }
    if (id === 'heart_yewon') {
      return <YewonPopup onClose={onClose} />;
    }
    if (id === 'heart_jihoon') {
      return <JihoonPopup onClose={onClose} />;
    }
    if (id === 'divide_yewon') {
      return <DivideYewonPopup onClose={onClose} />;
    }
    if (id === 'divide_kyeomjun') {
      return <DivideKyeomjunPopup onClose={onClose} />;
    }
    if (id === 'cross') {
      return <CrossKyeomjunPopup onClose={onClose} />;
    }
    if (id === 'cross_jihoon') {
      return <CrossJihoonPopup onClose={onClose} />;
    }
    return <QrPopup id={id} onClose={onClose} />;
  }

  if (type === 'question_guide') {
    return <QuestionGuidePopup onClose={onClose} />;
  }

  if (type === 'multi') {
    return (
      <MultiSelectorPopup
        id={id}
        symbols={symbols}
        onClose={onClose}
        onSelectArtist={(artistKey) => setSelectedArtist(artistKey)}
      />
    );
  }

  return null;
}