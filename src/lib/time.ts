// Prisma는 명시적으로 넘긴 Date를 DB 세션/서버의 time_zone과 무관하게 항상 UTC 컴포넌트 그대로 DATETIME literal로 쓴다.
// 형제 Kotlin(stockNews) 프로젝트는 LocalDateTime.now()(타임존 없는 KST 벽시계 값)를 그대로 저장하는 컨벤션이고,
// 프론트도 저장된 literal을 KST 벽시계로 간주해 그대로 렌더링하므로, 여기서도 DB에는 KST 벽시계를 나타내는 literal이
// 저장되도록 UTC 기준 +9시간 시프트한 Date를 만들어서 넘긴다. DB 네이티브 default(CURRENT_TIMESTAMP)에 맡기면
// 접속 중인 MariaDB 인스턴스의 시스템 타임존(환경마다 다를 수 있음)에 따라 결과가 흔들리므로 항상 앱에서 계산한다.
export function nowSeoulNaive(): Date {
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
}
