// 외부 API(네이버 뉴스 검색 등) 응답 텍스트에 섞여 들어오는 HTML 태그와 엔티티를 제거해
// 순수 텍스트로 정리하는 유틸. 형제 Kotlin 프로젝트(stockNews)의 common/HtmlTextUtils와 동일한 규칙이다.
// 주의: XSS 새니타이저가 아니다(엔티티 디코딩 결과로 "<script>" 같은 문자열이 남을 수 있음).
// 출력 시점의 이스케이프(React 기본 escape, 메일 템플릿 escape)는 별도로 지켜야 한다.

// <br>, </p> 처럼 줄바꿈 의미를 가지는 태그는 개행으로 바꾼 뒤 나머지 태그를 제거한다.
const LINE_BREAK_TAG_REGEX = /<\s*\/?\s*(br|p|div|li|tr|hr)\s*[^>]*>/gi;
const HTML_TAG_REGEX = /<[^>]*>/g;
const NUMERIC_ENTITY_REGEX = /&#(x[0-9a-fA-F]+|[0-9]+);/g;
const SPACE_RUN_REGEX = /[ \t ]+/g;
const BLANK_LINE_RUN_REGEX = /\n{3,}/g;

const NAMED_ENTITIES: [RegExp, string][] = [
  [/&nbsp;/gi, " "],
  [/&quot;/gi, '"'],
  [/&apos;/gi, "'"],
  [/&lt;/gi, "<"],
  [/&gt;/gi, ">"],
  [/&middot;/gi, "·"],
  [/&hellip;/gi, "…"],
  [/&amp;/gi, "&"], // &amp;lt; 같은 이중 인코딩이 태그로 되살아나지 않도록 마지막에 치환한다.
];

// HTML 태그/엔티티를 제거하고 공백을 정리한 텍스트를 돌려준다.
export function stripHtml(text: string): string {
  const withoutTags: string = text.replace(LINE_BREAK_TAG_REGEX, "\n").replace(HTML_TAG_REGEX, "");

  // 디코딩은 한 번만 한다 - 디코딩 결과를 다시 태그로 취급하면 "5 &lt; 10 &gt; 3" 같은
  // 평문이 통째로 지워지므로, 이중 인코딩된 값은 텍스트로 남겨둔다.
  return normalizeWhitespace(unescapeEntities(withoutTags));
}

// null/undefined 이거나 정리 후 내용이 비면 undefined를 돌려준다(공백/엔티티뿐인 값은 저장하지 않기 위함).
export function stripHtmlOrUndefined(text: string | null | undefined): string | undefined {
  if (text == null) return undefined;
  const stripped: string = stripHtml(text);
  return stripped.length === 0 ? undefined : stripped;
}

function unescapeEntities(text: string): string {
  const decodedNumeric: string = text.replace(NUMERIC_ENTITY_REGEX, (match: string, raw: string): string => {
    const isHex: boolean = raw.startsWith("x") || raw.startsWith("X");
    const code: number = isHex ? Number.parseInt(raw.slice(1), 16) : Number.parseInt(raw, 10);
    if (!Number.isNaN(code) && code >= 1 && code <= 0x10ffff) {
      try {
        return String.fromCodePoint(code);
      } catch {
        // 서로게이트 영역(0xD800~0xDFFF)처럼 코드포인트로 쓸 수 없는 값은 원문 그대로 둔다.
        return match;
      }
    }
    return match;
  });

  return NAMED_ENTITIES.reduce<string>((acc, [entity, replacement]) => acc.replace(entity, replacement), decodedNumeric);
}

// 줄 단위로 공백을 정리하고, 3줄 이상 연속된 개행은 빈 줄 하나로 줄인다.
function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map(line => line.replace(SPACE_RUN_REGEX, " ").trim())
    .join("\n")
    .replace(BLANK_LINE_RUN_REGEX, "\n\n")
    .trim();
}
