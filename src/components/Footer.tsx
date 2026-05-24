import styles from './Footer.module.css';

const Footer = () => {
  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        
        <div className={styles.section}>
          <h3 className={styles.title}>CCC 여름수련회 버스</h3>
          <p className={styles.text}>
            믿음의 동역자들과 함께하는<br/>은혜로운 여정
          </p>
        </div>

        <div className={styles.section}>
          <h4 className={styles.subtitle}>바로가기</h4>
          <ul className={styles.linkList}>
            <li><a href="#" className={styles.link}>버스예매</a></li>
            <li><a href="#" className={styles.link}>버스확인표</a></li>
            <li><a href="#" className={styles.link}>문의하기</a></li>
          </ul>
        </div>

        <div className={styles.section}>
          <h4 className={styles.subtitle}>문의</h4>
          <p className={styles.text}>
            이메일: info@ccc-bus.org<br/>
            전화: 02-1234-5678
          </p>
        </div>

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
