# Boarding Roster Google Sheet

전체 관리자만 선탑자 명단을 전용 Google Sheet에 동기화할 수 있는 Edge Function입니다.
`전체 명단` 탭과 각 호차별 탭을 갱신하고, 확인 대기·출발 후 확인 대기·미탑승·비고 있음 행에 색상을 적용합니다.
선탑자 페이지를 전체 관리자가 열어 둔 동안 명단 변경 후 5초 뒤 자동 호출되며, 화면의 동기화 버튼으로 즉시 호출할 수도 있습니다.

## Google Cloud 준비

1. Google Cloud 프로젝트에서 Google Sheets API를 활성화합니다.
2. 서비스 계정을 만들고 JSON 키를 발급합니다.
3. 동기화 대상 Google Sheet의 공유 설정에서 서비스 계정 이메일을 `편집자`로 추가합니다.
   일반 사용자에게는 `뷰어` 또는 링크 공개 권한만 부여해도 됩니다.

## Supabase 설정 및 배포

```powershell
supabase secrets set GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON='<service-account-json>'
supabase secrets set BOARDING_ROSTER_SPREADSHEET_ID='1my6lSrp39gNUcldecvyiZOOA7FFgRYGxAeO2akMM8mk'
supabase functions deploy boarding-roster-google-sheet
```

서비스 계정 JSON은 프런트엔드 환경 변수나 저장소에 넣지 않습니다.
