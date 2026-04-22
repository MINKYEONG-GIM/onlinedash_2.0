# Vercel 배포

이 프로젝트는 **Next.js 14** 앱이며, 구글 스프레드시트는 **서버에서만** 읽습니다. 비밀 값은 저장소에 넣지 말고 **Vercel → Project → Settings → Environment Variables**에만 등록하세요.

## 1. Vercel에 연결

1. GitHub에 저장소를 푸시합니다.
2. [Vercel](https://vercel.com)에서 **New Project**로 해당 저장소를 import합니다.
3. Framework Preset이 **Next.js**로 잡히는지 확인합니다.

## 2. 환경 변수

| 변수 | 필수 | 설명 |
|------|------|------|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | 예 | 서비스 계정 JSON **전문** (개행은 `\n` 이스케이프 가능) |
| `BASE_SPREADSHEET_ID` | 예 | 입출고용 스프레드시트 ID |
| `ONLINE_SPREADSHEET_ID` | 예 | 온라인 등록용 스프레드시트 ID |
| `SESSION_SECRET` | 예(프로덕션) | **32자 이상** 임의 문자열 (세션 쿠키 암호화) |
| `DASHBOARD_PASSWORD` | 아니오 | 설정 시 `/login` 비밀번호 인증 활성화 |

로컬 개발 시에는 저장소에 포함되지 않은 `.env.local` 파일을 사용하세요. `.env.example`은 **이름만** 있는 템플릿입니다.

## 3. Google 쪽 권한

- 서비스 계정 이메일을 두 스프레드시트(및 필요 시 링크된 파일)에 **뷰어 이상**으로 공유합니다.
- Drive API로 xlsx export가 막히면 Sheets API fallback을 사용합니다.

## 4. 빌드

```bash
npm install
npm run build
```

## 5. 실행 시간

구글에서 시트를 받아 파싱하는 데 시간이 걸릴 수 있습니다. Vercel **Pro**에서는 `src/app/page.tsx`의 `export const maxDuration = 60`이 적용됩니다. 무료 플랜 한도에 걸리면 타임아웃이 날 수 있으니 플랜 또는 데이터량을 조정하세요.
