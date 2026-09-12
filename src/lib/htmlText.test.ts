import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { stripHtml, stripHtmlOrUndefined } from "./htmlText";

describe("htmlText", () => {
  it("br 태그는 개행으로 바뀐다", () => {
    assert.equal(stripHtml("첫 줄<br>둘째 줄"), "첫 줄\n둘째 줄");
    assert.equal(stripHtml("첫 줄<br/>둘째 줄"), "첫 줄\n둘째 줄");
    assert.equal(stripHtml("첫 줄<BR />둘째 줄"), "첫 줄\n둘째 줄");
  });

  it("일반 태그는 내용만 남기고 제거된다", () => {
    assert.equal(
      stripHtml(`<p><b>애플</b>은 <span class="x">스마트폰</span>을 만든다</p>`),
      "애플은 스마트폰을 만든다",
    );
  });

  it("네이버 뉴스 검색의 하이라이트 태그가 제거된다", () => {
    assert.equal(
      stripHtml("<b>애플</b>, 신제품 공개&hellip; &quot;역대 최대&quot;"),
      '애플, 신제품 공개… "역대 최대"',
    );
  });

  it("HTML 엔티티가 디코딩된다", () => {
    assert.equal(
      stripHtml("&quot;AT&amp;T&quot; &#39;s 5 &lt; 10 &hellip;&nbsp;공백"),
      `"AT&T" 's 5 < 10 … 공백`,
    );
  });

  it("엔티티 디코딩은 한 번만 하고 부등호 평문은 보존한다", () => {
    // 이중 인코딩 값은 한 단계만 풀려 텍스트로 남는다(태그로 되살아나 잘리지 않는다).
    assert.equal(stripHtml("&amp;lt;b&amp;gt;굵게&amp;lt;/b&amp;gt;"), "&lt;b&gt;굵게&lt;/b&gt;");
    assert.equal(stripHtml("5 &lt; 10 &gt; 3"), "5 < 10 > 3");
  });

  it("줄바꿈 태그와 이름이 겹치는 다른 태그는 개행이 되지 않는다", () => {
    // <price>가 p로, <link>가 li로 오인되면 엉뚱한 개행이 들어간다.
    assert.equal(stripHtml("<price>1000</price>원"), "1000원");
    assert.equal(stripHtml("<link/>애플<header>뉴스</header>"), "애플뉴스");
  });

  it("짝 없는 서로게이트 엔티티는 원문 그대로 남는다", () => {
    assert.equal(stripHtml("A&#xD800;B"), "A&#xD800;B");
    assert.equal(stripHtml("A&#128512;B"), "A\u{1F600}B");
  });

  it("연속 공백과 빈 줄이 정리된다", () => {
    assert.equal(stripHtml("  앞뒤   공백  "), "앞뒤 공백");
    assert.equal(stripHtml("한<br><br><br><br>둘"), "한\n\n둘");
  });

  it("비어있거나 내용이 없는 값은 undefined가 된다", () => {
    assert.equal(stripHtmlOrUndefined(null), undefined);
    assert.equal(stripHtmlOrUndefined(undefined), undefined);
    assert.equal(stripHtmlOrUndefined("<p>&nbsp;</p>"), undefined);
    assert.equal(stripHtmlOrUndefined("<b>내용</b>"), "내용");
  });
});
