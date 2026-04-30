// Popup.jsx
import MapPopup from './MapPopup';
import QrPopup from './QrPopup';

export default function Popup({ id, type, onClose }) {
  if (type === 'map') {
    return <MapPopup id={id} onClose={onClose} />;
  }

  if (type === 'qr') {
    return <QrPopup id={id} onClose={onClose} />;
  }

  return null;
}