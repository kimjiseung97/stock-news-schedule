# CLAUDE.md

이 파일은 이 저장소에서 작업할 때 Claude Code(claude.ai/code)에게 제공하는 가이드입니다.

## 프로젝트

`TB_STOCK` / `TB_STOCK_NEWS` MariaDB 스키마를 형제 Kotlin 프로젝트("stockNews")와 공유하며 종목 뉴스를 수집하고 정리하는 Node/TypeScript 배치 서버입니다. 이 서비스는 Kotlin 앱을 대체하는 것이 아니라 보조하는 서비스입니다 — Kotlin 앱이 소유한 `TB_STOCK` 테이블을 읽기만 하고, `TB_STOCK_NEWS`에만 쓰기 작업을 합니다.

**범위 경계: 이 서비스는 뉴스 수집/정리만 담당합니다. 종목 마스터 데이터 관리나 이메일 발송은 담당하지 않습니다** 

## 명령어

```bash
npm run dev                # tsx watch src/index.ts — express 서버 + 스케줄러를 라이브 리로드로 실행
npm run build               # tsc -p tsconfig.json -> dist/
npm start                   # node dist/index.js (먼저 build 필요)
npm run typecheck           # tsc --noEmit (테스트 파일 포함)
npm test                    # node:test 기반 단위 테스트 (tsx --test)

npm run news-collect:once   # cron 스케줄과 별개로 뉴스 수집 job을 1회 실행
npm run news-cleanup:once   # cron 스케줄과 별개로 뉴스 보관 정리 job을 1회 실행

npm run prisma:generate     # schema.prisma 변경 후 Prisma client 재생성
npm run prisma:pull         # 공유 MariaDB 스키마를 introspect하여 schema.prisma에 반영
```

## Git 전략

- `dev`가 기본 개발 브랜치. 기능 작업은 dev 기반 브랜치에서 진행 후 dev로 병합.
- 배포 서버는 **dev(GCP 개발망) / prod(상용 서버)** 두 대로 나뉘어 있고, 워크플로도 브랜치별로 분리되어 있다.
  - `dev` push → `.github/workflows/deploy-dev.yml` → GCP 개발서버 (`environment: development`, SSH 키 인증, 이미지 `:dev`, **`SCHEDULER_ENABLED=false`**).
  - `main` push → `.github/workflows/deploy.yml` → 상용 서버 (`environment: main` 승인 게이트, SSH 비밀번호 인증 + 포트 2222, 이미지 `:latest`, `SCHEDULER_ENABLED=true`).
  - 두 워크플로 모두 커밋 SHA 태그를 같이 밀어 `.env`의 `IMAGE_TAG`로 고정 배포한다(롤백 가능). 서버에 저장소를 clone해 둘 필요 없이 SSH 스크립트가 `docker-compose.yml`을 직접 쓴다.
  - **dev/prod가 같은 `TB_STOCK_NEWS`를 바라보므로 cron은 상용에서만 돈다.** 개발서버에서 수집을 돌려보려면 `SCHEDULER_ENABLED`를 켜지 말고 `npm run news-collect:once`로 수동 실행할 것.
- 커밋후 어떤기능을 개발했는지 새기능 feat : , 에러수정 fix : , 코드 리펙토링 refactor : , 사용하지 않는 라이브러리 제거 remove : 로 한글로 커밋메시지 남길것

## API 기능 개발 완료 시

## 배치(schedule) 기능 개발 완료시
- 기능개발후 제대로 작동하는지 짧은 단위시간으로 기동시켜 테스트 해볼 것.
- 데이터 수집 적재 후처리까지 제대로되는지 로그로 확인.
- 기능 개발후 어떤 배치인지 주석작성.

## 완료 기준 (Definition of Done)
- 빌드 성공 + 테스트 통과
- 새 엔드포인트는 README나 API 문서에 한 줄 추가

## 설정(Configuration)

## 컨벤션

