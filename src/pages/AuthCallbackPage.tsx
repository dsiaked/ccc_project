import { Link } from 'react-router-dom';

const AuthCallbackPage = () => {
  const hashParams = new URLSearchParams(window.location.hash.replace('#', ''));

  const errorCode = hashParams.get('error_code');
  const errorDescription = hashParams.get('error_description');

  const isExpiredLink = errorCode === 'otp_expired';

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
        textAlign: 'center',
      }}
    >
      {isExpiredLink ? (
        <>
          <h1>인증 링크가 만료되었습니다.</h1>
          <p style={{ marginTop: 12 }}>
            이메일 인증 링크가 만료되었거나 이미 사용되었습니다.
            다시 회원가입을 진행하거나 새 인증 메일을 요청해주세요.
          </p>
        </>
      ) : errorDescription ? (
        <>
          <h1>이메일 인증에 실패했습니다.</h1>
          <p style={{ marginTop: 12 }}>
            {decodeURIComponent(errorDescription)}
          </p>
        </>
      ) : (
        <>
          <h1>이메일 인증이 완료되었습니다.</h1>
          <p style={{ marginTop: 12 }}>
            이제 로그인해서 서비스를 이용할 수 있습니다.
          </p>
        </>
      )}

      <Link
        to="/login"
        style={{
          marginTop: 24,
          padding: '12px 20px',
          borderRadius: 8,
          backgroundColor: '#2563eb',
          color: '#ffffff',
          textDecoration: 'none',
          fontWeight: 600,
        }}
      >
        로그인하러 가기
      </Link>
    </div>
  );
};

export default AuthCallbackPage;