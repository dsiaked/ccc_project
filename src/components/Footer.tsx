import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getPublicContactInfo,
  type ContactInfo,
} from '../lib/contactInfoService';
import styles from './Footer.module.css';

const Footer = () => {
  const [contactInfo, setContactInfo] = useState<ContactInfo>({
    email: '',
    phone: '',
  });

  useEffect(() => {
    let active = true;

    getPublicContactInfo()
      .then((savedContactInfo) => {
        if (active) setContactInfo(savedContactInfo);
      })
      .catch((error) => {
        console.error('공개 문의 정보 조회 실패:', error);
      });

    return () => {
      active = false;
    };
  }, []);

  const hasContactInfo = Boolean(contactInfo.email || contactInfo.phone);

  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <div className={styles.section}>
          <h3 className={styles.title}>CCC 여름수련회 귀가 버스</h3>
          <p className={styles.text}>
            수련회를 마친 참가자들의
            <br />
            안전한 귀가를 돕습니다.
          </p>
        </div>

        <div className={styles.section}>
          <h4 className={styles.subtitle}>바로가기</h4>
          <ul className={styles.linkList}>
            <li><Link to="/reservation" className={styles.link}>버스 신청</Link></li>
            <li><Link to="/ticket" className={styles.link}>신청 현황</Link></li>
            {contactInfo.email && (
              <li><a href={`mailto:${contactInfo.email}`} className={styles.link}>문의하기</a></li>
            )}
          </ul>
        </div>

        {hasContactInfo && (
          <div className={styles.section}>
            <h4 className={styles.subtitle}>문의</h4>
            <p className={styles.text}>
              {contactInfo.email && <>이메일: {contactInfo.email}</>}
              {contactInfo.email && contactInfo.phone && <br />}
              {contactInfo.phone && <>전화: {contactInfo.phone}</>}
            </p>
          </div>
        )}
      </div>

      <div className={styles.bottomBar}>
        <p className={styles.copyright}>
          © 2026 CCC 여름수련회. All rights reserved.
        </p>
      </div>
    </footer>
  );
};

export default Footer;
