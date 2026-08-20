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
npm run typecheck           # tsc --noEmit

npm run news-collect:once   # cron 스케줄과 별개로 뉴스 수집 job을 1회 실행
npm run news-cleanup:once   # cron 스케줄과 별개로 뉴스 보관 정리 job을 1회 실행

npm run prisma:generate     # schema.prisma 변경 후 Prisma client 재생성
npm run prisma:pull         # 공유 MariaDB 스키마를 introspect하여 schema.prisma에 반영
```

## Git 전략

- `dev`가 기본 개발 브랜치. 기능 작업은 dev 기반 브랜치에서 진행 후 dev로 병합.
- `dev` → `main`으로 push되면 GitHub Actions가 배포 트리거 (`.github/workflows/deploy.yml`: SSH로 접속해 `git pull` + `docker compose up -d --build`).

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

